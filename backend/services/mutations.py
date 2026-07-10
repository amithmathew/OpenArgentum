import json
import logging
import uuid
from backend.database import get_db
from backend.config import get_config_value
from backend.services.overrides import apply_field_update, coerce_human_value, label_for, OVERRIDABLE_FIELDS

_NUMERIC_OVERRIDE_FIELDS = ("amount_cents", "category_id", "tier_id", "is_transfer", "needs_review")

logger = logging.getLogger(__name__)


def propose_mutation(intent, title, params, session_id=None):
    """Create a mutation proposal. Runs the filter query to find affected rows, saves proposal."""
    conn = get_db()
    try:
        mutation_id = f"mut_{uuid.uuid4().hex[:12]}"
        affected_ids = []
        sample_items = []

        if intent == "bulk_tag":
            tag_name = params.get("tag_name", "")
            transaction_ids = params.get("transaction_ids")
            if transaction_ids:
                rows = conn.execute(
                    f"SELECT t.id, t.description, t.amount_cents, t.date FROM transactions t WHERE t.id IN ({','.join('?' * len(transaction_ids))})",
                    transaction_ids,
                ).fetchall()
            else:
                rows = _filter_transactions(conn, params)
            # Filter out transactions already tagged with this tag
            total_found = len(rows)
            tag_row = conn.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)).fetchone()
            already_tagged_count = 0
            if tag_row:
                already_tagged = {r["transaction_id"] for r in conn.execute(
                    "SELECT transaction_id FROM transaction_tags WHERE tag_id = ?", (tag_row["id"],)
                ).fetchall()}
                already_tagged_count = sum(1 for r in rows if r["id"] in already_tagged)
                rows = [r for r in rows if r["id"] not in already_tagged]
            affected_ids = [r["id"] for r in rows]
            sample_items = [{"id": r["id"], "label": r["description"], "amount": r["amount_cents"] / 100, "date": r["date"]} for r in rows[:5]]
            title = title or f"Tag {len(affected_ids)} transactions as '{tag_name}'"
            if already_tagged_count > 0 and len(affected_ids) == 0:
                return {
                    "mutation_id": None, "intent": intent, "title": title,
                    "impacted_count": 0, "sample_items": [],
                    "error": f"All {already_tagged_count} matching transaction(s) are already tagged '{tag_name}'. No changes needed.",
                }

        elif intent == "bulk_untag":
            tag_name = params.get("tag_name", "")
            transaction_ids = params.get("transaction_ids")
            if transaction_ids:
                rows = conn.execute(
                    f"SELECT t.id, t.description, t.amount_cents, t.date FROM transactions t WHERE t.id IN ({','.join('?' * len(transaction_ids))})",
                    transaction_ids,
                ).fetchall()
            else:
                rows = _filter_transactions(conn, params)
            # Keep only transactions that CURRENTLY have this tag
            tag_row = conn.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)).fetchone()
            if not tag_row:
                return {
                    "mutation_id": None, "intent": intent, "title": title,
                    "impacted_count": 0, "sample_items": [],
                    "error": f"Tag '{tag_name}' doesn't exist. No changes needed.",
                }
            tagged = {r["transaction_id"] for r in conn.execute(
                "SELECT transaction_id FROM transaction_tags WHERE tag_id = ?", (tag_row["id"],)
            ).fetchall()}
            not_tagged_count = sum(1 for r in rows if r["id"] not in tagged)
            rows = [r for r in rows if r["id"] in tagged]
            affected_ids = [r["id"] for r in rows]
            sample_items = [{"id": r["id"], "label": r["description"], "amount": r["amount_cents"] / 100, "date": r["date"]} for r in rows[:5]]
            title = title or f"Remove tag '{tag_name}' from {len(affected_ids)} transactions"
            if not_tagged_count > 0 and len(affected_ids) == 0:
                return {
                    "mutation_id": None, "intent": intent, "title": title,
                    "impacted_count": 0, "sample_items": [],
                    "error": f"None of the matching transaction(s) have the tag '{tag_name}'. No changes needed.",
                }

        elif intent == "override":
            no_op = {"mutation_id": None, "intent": intent, "impacted_count": 0, "sample_items": []}
            # Accept a heterogeneous set of changes; tolerate the legacy single-triple shape.
            changes = params.get("changes")
            if not changes and params.get("transaction_id") is not None:
                changes = [{"transaction_id": params.get("transaction_id"), "field": params.get("field"),
                            "new_value": params.get("new_value"), "note": params.get("note")}]
            if not changes:
                return {**no_op, "title": title, "error": "No changes were provided."}
            cap = get_config_value("aurelia_change_set_cap", 50)
            if len(changes) > cap:
                return {**no_op, "title": title,
                        "error": f"That's {len(changes)} changes, over the approval-set limit of {cap}. Split it into smaller sets."}

            def _norm(field, v):
                if v is None:
                    return None
                return int(v) if field in _NUMERIC_OVERRIDE_FIELDS else str(v)

            resolved = []
            sample_items = []
            affected_ids = []
            for ch in changes:
                c_txn = ch.get("transaction_id")
                c_field = ch.get("field")
                c_raw = ch.get("new_value")
                if c_field not in OVERRIDABLE_FIELDS:
                    return {**no_op, "title": title, "error": f"'{c_field}' is not an editable field."}
                row = conn.execute("SELECT * FROM transactions WHERE id = ?", (c_txn,)).fetchone()
                if not row:
                    return {**no_op, "title": title, "error": f"Transaction {c_txn} not found."}
                try:
                    c_canonical = coerce_human_value(conn, c_field, c_raw)
                except ValueError as e:
                    return {**no_op, "title": title, "error": f"Transaction {c_txn}: {e}"}
                if _norm(c_field, row[c_field]) == _norm(c_field, c_canonical):
                    continue  # already at that value — silently skip
                resolved.append({"transaction_id": c_txn, "field": c_field, "new_canonical": c_canonical, "note": ch.get("note")})
                sample_items.append({
                    "id": c_txn, "label": row["description"], "amount": row["amount_cents"] / 100, "date": row["date"],
                    "field": c_field, "from": label_for(conn, c_field, row[c_field]), "to": label_for(conn, c_field, c_canonical),
                })
                affected_ids.append(c_txn)

            if not resolved:
                return {**no_op, "title": title, "error": "Those transactions already have those values. No changes needed."}
            params = {**params, "changes": resolved}
            n_txns = len(set(affected_ids))
            title = title or (
                f"Change {resolved[0]['field']} of transaction {resolved[0]['transaction_id']}: {sample_items[0]['from']} → {sample_items[0]['to']}"
                if len(resolved) == 1
                else f"Apply {len(resolved)} corrections across {n_txns} transaction{'s' if n_txns != 1 else ''}"
            )

        elif intent == "hide":
            transaction_ids = params.get("transaction_ids") or []
            target = 1 if params.get("hidden", True) else 0
            if not transaction_ids:
                return {"mutation_id": None, "intent": intent, "title": title, "impacted_count": 0, "sample_items": [], "error": "No transactions specified."}
            rows = conn.execute(
                f"SELECT t.id, t.description, t.amount_cents, t.date, t.is_hidden FROM transactions t WHERE t.id IN ({','.join('?' * len(transaction_ids))})",
                transaction_ids,
            ).fetchall()
            rows = [r for r in rows if r["is_hidden"] != target]  # only those actually changing
            affected_ids = [r["id"] for r in rows]
            sample_items = [{"id": r["id"], "label": r["description"], "amount": r["amount_cents"] / 100, "date": r["date"]} for r in rows[:5]]
            action = "Hide" if target else "Restore"
            title = title or f"{action} {len(affected_ids)} transaction{'s' if len(affected_ids) != 1 else ''} ({'exclude from' if target else 'include in'} all reports)"

        elif intent == "bulk_recategorize":
            category_name = params.get("category_name", "")
            transaction_ids = params.get("transaction_ids")
            if transaction_ids:
                rows = conn.execute(
                    f"SELECT t.id, t.description, t.amount_cents, t.date, t.category_id FROM transactions t WHERE t.id IN ({','.join('?' * len(transaction_ids))})",
                    transaction_ids,
                ).fetchall()
            else:
                rows = _filter_transactions(conn, params, extra_cols=["t.category_id"])
            # Filter out transactions already in this category
            total_found = len(rows)
            cat_row = conn.execute("SELECT id FROM categories WHERE name = ?", (category_name,)).fetchone()
            already_categorized_count = 0
            if cat_row:
                already_categorized_count = sum(1 for r in rows if r["category_id"] == cat_row["id"])
                rows = [r for r in rows if r["category_id"] != cat_row["id"]]
            affected_ids = [r["id"] for r in rows]
            sample_items = [{"id": r["id"], "label": r["description"], "amount": r["amount_cents"] / 100, "date": r["date"]} for r in rows[:5]]
            title = title or f"Recategorize {len(affected_ids)} transactions to '{category_name}'"
            if already_categorized_count > 0 and len(affected_ids) == 0:
                return {
                    "mutation_id": None, "intent": intent, "title": title,
                    "impacted_count": 0, "sample_items": [],
                    "error": f"All {already_categorized_count} matching transaction(s) are already categorized as '{category_name}'. No changes needed.",
                }

        elif intent == "mark_transfer":
            is_transfer = params.get("is_transfer", True)
            transaction_ids = params.get("transaction_ids")
            if transaction_ids:
                rows = conn.execute(
                    f"SELECT t.id, t.description, t.amount_cents, t.date, t.is_transfer FROM transactions t WHERE t.id IN ({','.join('?' * len(transaction_ids))})",
                    transaction_ids,
                ).fetchall()
            else:
                rows = _filter_transactions(conn, params, extra_cols=["t.is_transfer"])
            # Filter out transactions already in the target transfer state
            target_val = 1 if is_transfer else 0
            rows = [r for r in rows if r["is_transfer"] != target_val]
            affected_ids = [r["id"] for r in rows]
            sample_items = [{"id": r["id"], "label": r["description"], "amount": r["amount_cents"] / 100, "date": r["date"]} for r in rows[:5]]
            action = "Mark" if is_transfer else "Unmark"
            title = title or f"{action} {len(affected_ids)} transactions as transfers"

        elif intent == "assign_project":
            project_name = params.get("project_name", "")
            transaction_ids = params.get("transaction_ids")
            if transaction_ids:
                rows = conn.execute(
                    f"SELECT t.id, t.description, t.amount_cents, t.date FROM transactions t WHERE t.id IN ({','.join('?' * len(transaction_ids))})",
                    transaction_ids,
                ).fetchall()
            else:
                rows = _filter_transactions(conn, params)
            # Filter out transactions already assigned to this project
            total_found = len(rows)
            proj_row = conn.execute("SELECT id FROM projects WHERE name = ?", (project_name,)).fetchone()
            already_assigned_count = 0
            if proj_row:
                already_assigned = {r["transaction_id"] for r in conn.execute(
                    "SELECT transaction_id FROM transaction_projects WHERE project_id = ?", (proj_row["id"],)
                ).fetchall()}
                already_assigned_count = sum(1 for r in rows if r["id"] in already_assigned)
                rows = [r for r in rows if r["id"] not in already_assigned]
            affected_ids = [r["id"] for r in rows]
            sample_items = [{"id": r["id"], "label": r["description"], "amount": r["amount_cents"] / 100, "date": r["date"]} for r in rows[:5]]
            title = title or f"Assign {len(affected_ids)} transactions to project '{project_name}'"
            if already_assigned_count > 0 and len(affected_ids) == 0:
                return {
                    "mutation_id": None,
                    "intent": intent,
                    "title": title,
                    "impacted_count": 0,
                    "sample_items": [],
                    "error": f"All {already_assigned_count} matching transaction(s) are already assigned to '{project_name}'. No changes needed.",
                }

        elif intent == "create_category":
            title = title or f"Create category '{params.get('name', '')}'"
            affected_ids = []
            sample_items = []

        elif intent == "create_tag":
            title = title or f"Create tag '{params.get('name', '')}'"
            affected_ids = []
            sample_items = []

        elif intent == "create_project":
            title = title or f"Create project '{params.get('name', '')}'"
            affected_ids = []
            sample_items = []

        elif intent == "edit_descriptions":
            updates = params.get("updates", [])
            txn_ids = [u["transaction_id"] for u in updates]
            if txn_ids:
                rows = conn.execute(
                    f"SELECT t.id, t.description, t.amount_cents, t.date FROM transactions t WHERE t.id IN ({','.join('?' * len(txn_ids))})",
                    txn_ids,
                ).fetchall()
                affected_ids = [r["id"] for r in rows]
                sample_items = [{"id": r["id"], "label": r["description"], "amount": r["amount_cents"] / 100, "date": r["date"], "new_description": next((u["new_description"] for u in updates if u["transaction_id"] == r["id"]), None)} for r in rows[:5]]
            title = title or f"Edit descriptions for {len(affected_ids)} transactions"

        # Don't create a proposal if no transactions are affected
        # (entity creation intents like create_category/tag/project have 0 affected_ids but are still valid)
        entity_intents = {"create_category", "create_tag", "create_project"}
        if len(affected_ids) == 0 and intent not in entity_intents:
            return {
                "mutation_id": None,
                "intent": intent,
                "title": title,
                "impacted_count": 0,
                "sample_items": [],
                "error": "No matching transactions found",
            }

        # Save proposal
        conn.execute(
            "INSERT INTO mutation_proposals (mutation_id, session_id, intent, title, params, affected_ids, sample_items, impacted_count, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
            (mutation_id, session_id, intent, title, json.dumps(params), json.dumps(affected_ids), json.dumps(sample_items), len(affected_ids)),
        )
        conn.commit()

        return {
            "mutation_id": mutation_id,
            "intent": intent,
            "title": title,
            "impacted_count": len(affected_ids),
            "sample_items": sample_items,
        }
    finally:
        conn.close()


def execute_mutation(mutation_id):
    """Execute an approved mutation. Snapshots before-state, applies changes, logs to audit."""
    conn = get_db()
    try:
        proposal = conn.execute("SELECT * FROM mutation_proposals WHERE mutation_id = ?", (mutation_id,)).fetchone()
        if not proposal:
            return {"error": "Proposal not found"}
        if proposal["status"] != "pending":
            return {"error": f"Proposal is already {proposal['status']}"}

        intent = proposal["intent"]
        params = json.loads(proposal["params"])
        affected_ids = json.loads(proposal["affected_ids"])

        # Create mutation log entry
        conn.execute(
            "INSERT INTO mutation_log (mutation_id, intent, title) VALUES (?, ?, ?)",
            (mutation_id, intent, proposal["title"]),
        )

        if intent == "bulk_tag":
            _execute_bulk_tag(conn, mutation_id, affected_ids, params)
        elif intent == "bulk_untag":
            _execute_bulk_untag(conn, mutation_id, affected_ids, params)
        elif intent == "override":
            _execute_override(conn, mutation_id, affected_ids, params)
        elif intent == "hide":
            _execute_hide(conn, mutation_id, affected_ids, params)
        elif intent == "bulk_recategorize":
            _execute_bulk_recategorize(conn, mutation_id, affected_ids, params)
        elif intent == "mark_transfer":
            _execute_mark_transfer(conn, mutation_id, affected_ids, params)
        elif intent == "assign_project":
            _execute_assign_project(conn, mutation_id, affected_ids, params)
        elif intent == "create_category":
            _execute_create_entity(conn, mutation_id, "categories", params)
        elif intent == "create_tag":
            _execute_create_entity(conn, mutation_id, "tags", params)
        elif intent == "create_project":
            _execute_create_entity(conn, mutation_id, "projects", params)
        elif intent == "edit_descriptions":
            _execute_edit_descriptions(conn, mutation_id, params)

        # Mark proposal as executed
        conn.execute("UPDATE mutation_proposals SET status = 'executed' WHERE mutation_id = ?", (mutation_id,))
        conn.commit()

        logger.info(f"Mutation {mutation_id} executed: {proposal['title']}")
        return {"status": "executed", "mutation_id": mutation_id, "title": proposal["title"]}
    except Exception as e:
        logger.error(f"Mutation {mutation_id} failed: {e}")
        conn.execute("UPDATE mutation_proposals SET status = 'failed' WHERE mutation_id = ?", (mutation_id,))
        conn.commit()
        return {"error": str(e)}
    finally:
        conn.close()


def undo_mutation(mutation_id):
    """Undo a previously executed mutation by reversing audit log changes."""
    conn = get_db()
    try:
        log = conn.execute("SELECT * FROM mutation_log WHERE mutation_id = ?", (mutation_id,)).fetchone()
        if not log:
            return {"error": "Mutation not found"}
        if log["reverted_at"]:
            return {"error": "Mutation already reverted"}

        changes = conn.execute(
            "SELECT * FROM audit_log_changes WHERE mutation_id = ? ORDER BY id DESC",
            (mutation_id,),
        ).fetchall()

        for change in changes:
            table = change["table_name"]
            record_id = change["record_id"]
            op = change["operation"]

            if op == "UPDATE":
                before = json.loads(change["before_state"])
                set_clause = ", ".join(f"{k} = ?" for k in before.keys())
                conn.execute(f"UPDATE {table} SET {set_clause} WHERE id = ?", (*before.values(), record_id))
            elif op == "INSERT":
                conn.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))
            elif op == "DELETE":
                before = json.loads(change["before_state"])
                cols = ", ".join(before.keys())
                placeholders = ", ".join("?" * len(before))
                conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})", tuple(before.values()))

        conn.execute("UPDATE mutation_log SET reverted_at = datetime('now') WHERE mutation_id = ?", (mutation_id,))
        conn.execute("UPDATE mutation_proposals SET status = 'reverted' WHERE mutation_id = ?", (mutation_id,))
        conn.commit()

        logger.info(f"Mutation {mutation_id} reverted ({len(changes)} changes)")
        return {"status": "reverted", "mutation_id": mutation_id, "changes_reverted": len(changes)}
    finally:
        conn.close()


# --- Private execution helpers ---

def _filter_transactions(conn, params, extra_cols=None):
    """Build a filtered transaction query from common params."""
    conditions = []
    query_params = []

    if params.get("date_from"):
        conditions.append("t.date >= ?")
        query_params.append(params["date_from"])
    if params.get("date_to"):
        conditions.append("t.date <= ?")
        query_params.append(params["date_to"])
    if params.get("categories"):
        placeholders = ",".join("?" * len(params["categories"]))
        conditions.append(f"c.name IN ({placeholders})")
        query_params.extend(params["categories"])
    # Resolve account_name to account_id if needed
    account_id = params.get("account_id")
    if not account_id and params.get("account_name"):
        row = conn.execute("SELECT id FROM accounts WHERE name = ? OR institution = ?",
                           (params["account_name"], params["account_name"])).fetchone()
        if row:
            account_id = row["id"]
    if account_id:
        conditions.append("t.account_id = ?")
        query_params.append(account_id)
    if params.get("search_text"):
        conditions.append("(t.description LIKE ? OR t.description_raw LIKE ?)")
        query_params.extend([f"%{params['search_text']}%"] * 2)
    if params.get("min_amount_cents") is not None:
        conditions.append("t.amount_cents >= ?")
        query_params.append(params["min_amount_cents"])
    if params.get("max_amount_cents") is not None:
        conditions.append("t.amount_cents <= ?")
        query_params.append(params["max_amount_cents"])
    if params.get("is_transfer") is not None:
        conditions.append("t.is_transfer = ?")
        query_params.append(1 if params["is_transfer"] else 0)

    where = " AND ".join(conditions) if conditions else "1=1"
    cols = "t.id, t.description, t.amount_cents, t.date"
    if extra_cols:
        cols += ", " + ", ".join(extra_cols)

    return conn.execute(f"""
        SELECT {cols}
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE {where}
        ORDER BY t.date DESC LIMIT 200
    """, query_params).fetchall()


def _snapshot_row(conn, table, record_id):
    """Capture current state of a row for audit."""
    row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
    return json.dumps(dict(row)) if row else None


def _log_change(conn, mutation_id, table, record_id, operation, before_state=None, after_state=None):
    """Write an audit log entry."""
    conn.execute(
        "INSERT INTO audit_log_changes (mutation_id, table_name, record_id, operation, before_state, after_state) VALUES (?, ?, ?, ?, ?, ?)",
        (mutation_id, table, str(record_id), operation, before_state, after_state),
    )


def _execute_bulk_tag(conn, mutation_id, transaction_ids, params):
    tag_name = params.get("tag_name", "")
    # Find or create tag
    tag_row = conn.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)).fetchone()
    if tag_row:
        tag_id = tag_row["id"]
    else:
        cursor = conn.execute("INSERT INTO tags (name, is_confirmed) VALUES (?, 1)", (tag_name,))
        tag_id = cursor.lastrowid
        _log_change(conn, mutation_id, "tags", tag_id, "INSERT", after_state=json.dumps({"id": tag_id, "name": tag_name, "is_confirmed": 1}))

    for txn_id in transaction_ids:
        existing = conn.execute("SELECT * FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?", (txn_id, tag_id)).fetchone()
        if not existing:
            conn.execute("INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)", (txn_id, tag_id))
            _log_change(conn, mutation_id, "transaction_tags", f"{txn_id}_{tag_id}", "INSERT",
                        after_state=json.dumps({"transaction_id": txn_id, "tag_id": tag_id}))


def _execute_bulk_untag(conn, mutation_id, transaction_ids, params):
    tag_name = params.get("tag_name", "")
    tag_row = conn.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)).fetchone()
    if not tag_row:
        return
    tag_id = tag_row["id"]

    for txn_id in transaction_ids:
        row = conn.execute("SELECT * FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?", (txn_id, tag_id)).fetchone()
        if row:
            conn.execute("DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?", (txn_id, tag_id))
            _log_change(conn, mutation_id, "transaction_tags", f"{txn_id}_{tag_id}", "DELETE",
                        before_state=json.dumps(dict(row)))


def _execute_hide(conn, mutation_id, transaction_ids, params):
    target = 1 if params.get("hidden", True) else 0
    for txn_id in transaction_ids:
        before = _snapshot_row(conn, "transactions", txn_id)
        conn.execute("UPDATE transactions SET is_hidden = ?, updated_at = datetime('now') WHERE id = ?", (target, txn_id))
        after = _snapshot_row(conn, "transactions", txn_id)
        _log_change(conn, mutation_id, "transactions", txn_id, "UPDATE", before, after)


def _execute_override(conn, mutation_id, transaction_ids, params):
    # Back-compat: wrap a legacy single-triple into the changes list.
    changes = params.get("changes")
    if not changes and params.get("transaction_id") is not None:
        changes = [{"transaction_id": params.get("transaction_id"), "field": params.get("field"),
                    "new_canonical": params.get("new_canonical"), "note": params.get("note")}]
    for ch in (changes or []):
        txn_id = ch["transaction_id"]
        before = _snapshot_row(conn, "transactions", txn_id)
        override_row = apply_field_update(conn, txn_id, ch["field"], ch.get("new_canonical"),
                                          note=ch.get("note"), author_type="aurelia")
        if override_row is None:
            continue  # value already matched; nothing to log
        after = _snapshot_row(conn, "transactions", txn_id)
        _log_change(conn, mutation_id, "transactions", txn_id, "UPDATE", before, after)
        # Log the audit-row insert too, so undo removes it along with the field change.
        _log_change(conn, mutation_id, "transaction_overrides", override_row["id"], "INSERT",
                    after_state=json.dumps(dict(override_row)))


def _execute_bulk_recategorize(conn, mutation_id, transaction_ids, params):
    category_name = params.get("category_name", "")
    tier_name = params.get("tier_name")

    # Find or create category
    cat_row = conn.execute("SELECT id FROM categories WHERE name = ?", (category_name,)).fetchone()
    if cat_row:
        cat_id = cat_row["id"]
    else:
        cursor = conn.execute("INSERT INTO categories (name, is_confirmed) VALUES (?, 1)", (category_name,))
        cat_id = cursor.lastrowid
        _log_change(conn, mutation_id, "categories", cat_id, "INSERT", after_state=json.dumps({"id": cat_id, "name": category_name}))

    # Resolve tier
    tier_id = None
    if tier_name:
        tier_row = conn.execute("SELECT id FROM spend_tiers WHERE name = ?", (tier_name,)).fetchone()
        if tier_row:
            tier_id = tier_row["id"]

    for txn_id in transaction_ids:
        before = _snapshot_row(conn, "transactions", txn_id)
        conn.execute(
            "UPDATE transactions SET category_id = ?, tier_id = ?, categorization_status = 'manual', updated_at = datetime('now') WHERE id = ?",
            (cat_id, tier_id, txn_id),
        )
        after = _snapshot_row(conn, "transactions", txn_id)
        _log_change(conn, mutation_id, "transactions", txn_id, "UPDATE", before, after)


def _execute_mark_transfer(conn, mutation_id, transaction_ids, params):
    is_transfer = 1 if params.get("is_transfer", True) else 0
    for txn_id in transaction_ids:
        before = _snapshot_row(conn, "transactions", txn_id)
        conn.execute(
            "UPDATE transactions SET is_transfer = ?, needs_review = 0, updated_at = datetime('now') WHERE id = ?",
            (is_transfer, txn_id),
        )
        after = _snapshot_row(conn, "transactions", txn_id)
        _log_change(conn, mutation_id, "transactions", txn_id, "UPDATE", before, after)


def _execute_assign_project(conn, mutation_id, transaction_ids, params):
    project_name = params.get("project_name", "")
    proj_row = conn.execute("SELECT id FROM projects WHERE name = ?", (project_name,)).fetchone()
    if proj_row:
        project_id = proj_row["id"]
    else:
        cursor = conn.execute("INSERT INTO projects (name) VALUES (?)", (project_name,))
        project_id = cursor.lastrowid
        _log_change(conn, mutation_id, "projects", project_id, "INSERT", after_state=json.dumps({"id": project_id, "name": project_name}))

    for txn_id in transaction_ids:
        existing = conn.execute("SELECT * FROM transaction_projects WHERE transaction_id = ? AND project_id = ?", (txn_id, project_id)).fetchone()
        if not existing:
            conn.execute("INSERT INTO transaction_projects (transaction_id, project_id) VALUES (?, ?)", (txn_id, project_id))
            _log_change(conn, mutation_id, "transaction_projects", f"{txn_id}_{project_id}", "INSERT",
                        after_state=json.dumps({"transaction_id": txn_id, "project_id": project_id}))


def _execute_create_entity(conn, mutation_id, table, params):
    name = params.get("name", "")
    if table == "categories":
        cursor = conn.execute("INSERT INTO categories (name, is_confirmed) VALUES (?, 1)", (name,))
    elif table == "tags":
        color = params.get("color", "#9ca3af")
        cursor = conn.execute("INSERT INTO tags (name, color, is_confirmed) VALUES (?, ?, 1)", (name, color))
    elif table == "projects":
        desc = params.get("description", "")
        budget = params.get("budget_target_cents")
        cursor = conn.execute("INSERT INTO projects (name, description, budget_target_cents) VALUES (?, ?, ?)", (name, desc, budget))
    else:
        return
    _log_change(conn, mutation_id, table, cursor.lastrowid, "INSERT",
                after_state=json.dumps({"id": cursor.lastrowid, "name": name}))


def _execute_edit_descriptions(conn, mutation_id, params):
    for update in params.get("updates", []):
        txn_id = update["transaction_id"]
        new_desc = update["new_description"]
        before = _snapshot_row(conn, "transactions", txn_id)
        conn.execute("UPDATE transactions SET description = ?, updated_at = datetime('now') WHERE id = ?", (new_desc, txn_id))
        after = _snapshot_row(conn, "transactions", txn_id)
        _log_change(conn, mutation_id, "transactions", txn_id, "UPDATE", before, after)
