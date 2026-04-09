import logging
from backend.database import get_db

logger = logging.getLogger(__name__)


def _resolve_account_id(conn, account_id=None, account_name=None):
    """Resolve account_id from either ID or name."""
    if account_id is not None:
        return account_id
    if account_name:
        row = conn.execute("SELECT id FROM accounts WHERE name = ? OR institution = ?", (account_name, account_name)).fetchone()
        if row:
            return row["id"]
    return None

TOOL_DESCRIPTIONS = {
    "query_transactions": "Querying transactions...",
    "aggregate_spending": "Aggregating spending data...",
    "compare_periods": "Comparing time periods...",
    "get_summary": "Getting financial summary...",
    "generate_chart": "Building chart...",
    "navigate_to_transactions": "Preparing transaction view...",
    "propose_bulk_tag": "Preparing tag proposal...",
    "propose_bulk_recategorize": "Preparing recategorization proposal...",
    "propose_mark_transfer": "Preparing transfer marking proposal...",
    "propose_assign_project": "Preparing project assignment proposal...",
    "propose_create_category": "Preparing to create category...",
    "propose_create_tag": "Preparing to create tag...",
    "propose_create_project": "Preparing to create project...",
    "get_transaction_notes": "Reading transaction notes...",
    "search_transaction_notes": "Searching notes...",
    "add_transaction_note": "Adding note...",
}


def query_transactions(date_from=None, date_to=None, categories=None, tiers=None,
                       account_id=None, account_name=None, search_text=None, is_transfer=None,
                       min_amount_cents=None, max_amount_cents=None,
                       categorization_status=None, uncategorized=None, limit=25):
    """Search and filter transactions. Returns matching rows with joined category/tier/account names."""
    conn = get_db()
    try:
        conditions = ["t.is_hidden = 0"]
        params = []

        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)
        if categories:
            placeholders = ",".join("?" * len(categories))
            conditions.append(f"c.name IN ({placeholders})")
            params.extend(categories)
        if tiers:
            placeholders = ",".join("?" * len(tiers))
            conditions.append(f"st.name IN ({placeholders})")
            params.extend(tiers)
        resolved_acct = _resolve_account_id(conn, account_id, account_name)
        if resolved_acct is not None:
            conditions.append("t.account_id = ?")
            params.append(resolved_acct)
        if search_text:
            conditions.append("(t.description LIKE ? OR t.description_raw LIKE ? OR EXISTS (SELECT 1 FROM transaction_notes tn WHERE tn.transaction_id = t.id AND tn.content LIKE ?))")
            params.extend([f"%{search_text}%", f"%{search_text}%", f"%{search_text}%"])
        if is_transfer is not None:
            conditions.append("t.is_transfer = ?")
            params.append(1 if is_transfer else 0)
        if min_amount_cents is not None:
            conditions.append("t.amount_cents >= ?")
            params.append(min_amount_cents)
        if max_amount_cents is not None:
            conditions.append("t.amount_cents <= ?")
            params.append(max_amount_cents)
        if categorization_status:
            conditions.append("t.categorization_status = ?")
            params.append(categorization_status)
        if uncategorized:
            conditions.append("t.category_id IS NULL")

        where = " AND ".join(conditions) if conditions else "1=1"

        rows = conn.execute(f"""
            SELECT t.id, t.date, t.description, t.amount_cents, t.transaction_type, t.is_transfer,
                   COALESCE(c.name, 'Uncategorized') as category,
                   COALESCE(st.name, 'Uncategorized') as tier,
                   COALESCE(a.name, 'Unknown') as account
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE {where}
            ORDER BY t.date DESC
            LIMIT ?
        """, (*params, limit)).fetchall()

        return {
            "transactions": [dict(r) for r in rows],
            "count": len(rows),
            "note": f"Showing up to {limit} most recent matches" if len(rows) == limit else None,
        }
    finally:
        conn.close()


def aggregate_spending(group_by="category", date_from=None, date_to=None, include_transfers=False, categories=None, tiers=None, tags=None, account_id=None, account_name=None, search_text=None):
    """Get spending totals grouped by a dimension."""
    conn = get_db()
    try:
        conditions = ["t.is_hidden = 0", "t.amount_cents < 0"]  # Only visible expenses
        params = []

        if not include_transfers:
            conditions.append("NOT (t.is_transfer = 1 AND t.needs_review = 0)")

        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)
        if categories:
            placeholders = ",".join("?" * len(categories))
            conditions.append(f"c.name IN ({placeholders})")
            params.extend(categories)
        if tiers:
            placeholders = ",".join("?" * len(tiers))
            conditions.append(f"st.name IN ({placeholders})")
            params.extend(tiers)
        resolved_acct = _resolve_account_id(conn, account_id, account_name)
        if resolved_acct is not None:
            conditions.append("t.account_id = ?")
            params.append(resolved_acct)
        if search_text:
            conditions.append("(t.description LIKE ? OR t.description_raw LIKE ?)")
            params.extend([f"%{search_text}%"] * 2)

        where = " AND ".join(conditions)

        group_col = {
            "category": "COALESCE(c.name, 'Uncategorized')",
            "tier": "COALESCE(st.name, 'Uncategorized')",
            "month": "strftime('%Y-%m', t.date)",
            "account": "COALESCE(a.name, 'Unknown')",
            "day": "t.date",
        }.get(group_by, "COALESCE(c.name, 'Uncategorized')")

        tag_join = ""
        if tags:
            placeholders = ",".join("?" * len(tags))
            conditions.append(f"tg.name IN ({placeholders})")
            params.extend(tags)
            tag_join = "JOIN transaction_tags tt ON t.id = tt.transaction_id JOIN tags tg ON tt.tag_id = tg.id"
            where = " AND ".join(conditions)  # rebuild with tag condition

        rows = conn.execute(f"""
            SELECT {group_col} as group_name,
                   SUM(ABS(t.amount_cents)) as total_cents,
                   COUNT(*) as count
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
            LEFT JOIN accounts a ON t.account_id = a.id
            {tag_join}
            WHERE {where}
            GROUP BY group_name
            ORDER BY total_cents DESC
        """, params).fetchall()

        return {"groups": [dict(r) for r in rows], "group_by": group_by}
    finally:
        conn.close()


def compare_periods(period1_start, period1_end, period2_start, period2_end, group_by=None):
    """Compare spending between two time periods."""
    conn = get_db()
    try:
        def get_totals(start, end):
            conditions = ["t.is_hidden = 0", "t.amount_cents < 0", "NOT (t.is_transfer = 1 AND t.needs_review = 0)",
                          "t.date >= ?", "t.date <= ?"]
            params = [start, end]
            where = " AND ".join(conditions)

            if group_by:
                group_col = {
                    "category": "COALESCE(c.name, 'Uncategorized')",
                    "tier": "COALESCE(st.name, 'Uncategorized')",
                }.get(group_by, "COALESCE(c.name, 'Uncategorized')")

                rows = conn.execute(f"""
                    SELECT {group_col} as group_name, SUM(ABS(t.amount_cents)) as total_cents, COUNT(*) as count
                    FROM transactions t
                    LEFT JOIN categories c ON t.category_id = c.id
                    LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
                    WHERE {where}
                    GROUP BY group_name ORDER BY total_cents DESC
                """, params).fetchall()
                return {"groups": [dict(r) for r in rows]}
            else:
                row = conn.execute(f"""
                    SELECT SUM(ABS(t.amount_cents)) as total_cents, COUNT(*) as count
                    FROM transactions t
                    LEFT JOIN categories c ON t.category_id = c.id
                    LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
                    WHERE {where}
                """, params).fetchone()
                return {"total_cents": row["total_cents"] or 0, "count": row["count"] or 0}

        p1 = get_totals(period1_start, period1_end)
        p2 = get_totals(period2_start, period2_end)

        return {
            "period1": {"start": period1_start, "end": period1_end, **p1},
            "period2": {"start": period2_start, "end": period2_end, **p2},
        }
    finally:
        conn.close()


def get_summary(date_from=None, date_to=None):
    """Get overall financial summary."""
    conn = get_db()
    try:
        conditions = ["t.is_hidden = 0", "NOT (t.is_transfer = 1 AND t.needs_review = 0)"]
        params = []
        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)
        where = " AND ".join(conditions)

        row = conn.execute(f"""
            SELECT
                SUM(CASE WHEN t.amount_cents < 0 THEN ABS(t.amount_cents) ELSE 0 END) as total_spend,
                SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END) as total_income,
                COUNT(*) as count
            FROM transactions t WHERE {where}
        """, params).fetchone()

        # Top categories
        cats = conn.execute(f"""
            SELECT COALESCE(c.name, 'Uncategorized') as category, SUM(ABS(t.amount_cents)) as total
            FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
            WHERE {where} AND t.amount_cents < 0
            GROUP BY category ORDER BY total DESC LIMIT 5
        """, params).fetchall()

        # Top merchants
        merchants = conn.execute(f"""
            SELECT t.description as merchant, SUM(ABS(t.amount_cents)) as total, COUNT(*) as count
            FROM transactions t WHERE {where} AND t.amount_cents < 0
            GROUP BY t.description ORDER BY total DESC LIMIT 5
        """, params).fetchall()

        total_spend = row["total_spend"] or 0
        total_income = row["total_income"] or 0

        return {
            "total_spend_cents": total_spend,
            "total_income_cents": total_income,
            "net_cents": total_income - total_spend,
            "transaction_count": row["count"] or 0,
            "top_categories": [dict(c) for c in cats],
            "top_merchants": [dict(m) for m in merchants],
        }
    finally:
        conn.close()


def generate_chart(chart_type, title, data):
    """Return a chart specification for the frontend to render inline."""
    return {
        "chart_type": chart_type,
        "title": title,
        "data": data,
    }


def navigate_to_transactions(date_from=None, date_to=None, category_name=None, tier_name=None,
                             account_id=None, account_name=None, search=None, is_transfer=None):
    """Generate navigation parameters for the transactions page. Resolves names to IDs."""
    conn = get_db()
    try:
        params = {}
        if date_from: params["date_from"] = date_from
        if date_to: params["date_to"] = date_to
        if category_name:
            row = conn.execute("SELECT id FROM categories WHERE name = ?", (category_name,)).fetchone()
            if row: params["category_id"] = str(row["id"])
        if tier_name:
            row = conn.execute("SELECT id FROM spend_tiers WHERE name = ?", (tier_name,)).fetchone()
            if row: params["tier_id"] = str(row["id"])
        resolved_acct = _resolve_account_id(conn, account_id, account_name)
        if resolved_acct: params["account_id"] = str(resolved_acct)
        if search: params["search"] = search
        if is_transfer is not None: params["is_transfer"] = str(is_transfer).lower()

        return {"action": "navigate", "path": "/transactions", "params": params}
    finally:
        conn.close()


def get_transaction_notes(transaction_id):
    """Get all notes for a specific transaction."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM transaction_notes WHERE transaction_id = ? ORDER BY created_at ASC",
            (transaction_id,),
        ).fetchall()
        return {"transaction_id": transaction_id, "notes": [dict(r) for r in rows], "count": len(rows)}
    finally:
        conn.close()


def search_transaction_notes(query, author_type=None, date_from=None, date_to=None, account_id=None, account_name=None, limit=30):
    """Search across all transaction notes. Defaults to user-authored notes only."""
    conn = get_db()
    try:
        resolved_acct = _resolve_account_id(conn, account_id, account_name)
        conditions = ["tn.content LIKE ?"]
        params = [f"%{query}%"]
        if author_type:
            conditions.append("tn.author_type = ?")
            params.append(author_type)
        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)
        if resolved_acct is not None:
            conditions.append("t.account_id = ?")
            params.append(resolved_acct)
        where = " AND ".join(conditions)
        params.append(limit)
        rows = conn.execute(f"""
            SELECT tn.id, tn.transaction_id, tn.author_type, tn.content, tn.created_at,
                   t.date as txn_date, t.description as txn_description, t.amount_cents as txn_amount_cents
            FROM transaction_notes tn
            JOIN transactions t ON t.id = tn.transaction_id
            WHERE {where}
            ORDER BY tn.created_at DESC
            LIMIT ?
        """, params).fetchall()
        return {"results": [dict(r) for r in rows], "count": len(rows)}
    finally:
        conn.close()


def add_transaction_note(transaction_id, content, author_type="aurelia"):
    """Add a note to a transaction. Aurelia uses this when the user asks to record context."""
    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        if not existing:
            return {"error": f"Transaction {transaction_id} not found"}
        conn.execute(
            "INSERT INTO transaction_notes (transaction_id, author_type, content) VALUES (?, ?, ?)",
            (transaction_id, author_type, content.strip()),
        )
        conn.commit()
        return {"status": "ok", "message": f"Note added to transaction {transaction_id}"}
    finally:
        conn.close()


# Tool dispatch map
TOOL_FUNCTIONS = {
    "query_transactions": query_transactions,
    "aggregate_spending": aggregate_spending,
    "compare_periods": compare_periods,
    "get_summary": get_summary,
    "generate_chart": generate_chart,
    "navigate_to_transactions": navigate_to_transactions,
    "get_transaction_notes": get_transaction_notes,
    "search_transaction_notes": search_transaction_notes,
    "add_transaction_note": add_transaction_note,
}


def execute_tool(name, args):
    """Execute a tool by name with the given arguments."""
    fn = TOOL_FUNCTIONS.get(name)
    if not fn:
        return {"error": f"Unknown tool: {name}"}
    try:
        result = fn(**args)
        logger.debug(f"Tool {name} returned {len(str(result))} chars")
        return result
    except Exception as e:
        logger.error(f"Tool {name} failed: {e}")
        return {"error": str(e)}
