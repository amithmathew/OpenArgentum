"""Per-transaction field overrides with an append-only audit trail.

Both the user-facing PATCH endpoint and Aurelia's approval flow funnel through
`apply_field_update`, so there is a single place that whitelists fields, resolves
human-readable labels, updates the transaction, and records the audit row.
"""

# Fields a user (or Aurelia) is allowed to override. Anything else is rejected.
# NOTE: description_raw is intentionally NOT editable — it is a permanent record of
# what the LLM transcribed from the statement. Corrections go on `description` instead.
OVERRIDABLE_FIELDS = {
    "date",
    "description",
    "amount_cents",
    "category_id",
    "tier_id",
    "is_transfer",
    "needs_review",
}

# Fields whose change should flip categorization_status to 'manual'.
_CATEGORIZATION_FIELDS = {"category_id", "tier_id"}


def _format_amount(cents):
    try:
        cents = int(cents)
    except (TypeError, ValueError):
        return str(cents)
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) / 100:,.2f}"


def label_for(conn, field_name, value):
    """Human-readable snapshot of a canonical field value, for the audit display."""
    if value is None or value == "":
        return None
    if field_name == "amount_cents":
        return _format_amount(value)
    if field_name == "category_id":
        row = conn.execute("SELECT name FROM categories WHERE id = ?", (value,)).fetchone()
        return row["name"] if row else f"#{value}"
    if field_name == "tier_id":
        row = conn.execute("SELECT name FROM spend_tiers WHERE id = ?", (value,)).fetchone()
        return row["name"] if row else f"#{value}"
    if field_name in ("is_transfer", "needs_review"):
        return "Yes" if int(value) else "No"
    return str(value)


def coerce_human_value(conn, field_name, raw):
    """Coerce a human-supplied value (from Aurelia) into the canonical column value.

    Raises ValueError with a user-facing message on bad input.
    """
    if field_name not in OVERRIDABLE_FIELDS:
        raise ValueError(f"'{field_name}' is not an editable field.")

    if field_name == "amount_cents":
        try:
            return int(round(float(str(raw).replace("$", "").replace(",", "").strip()) * 100))
        except (TypeError, ValueError):
            raise ValueError(f"'{raw}' is not a valid amount.")

    if field_name in ("category_id", "tier_id"):
        table = "categories" if field_name == "category_id" else "spend_tiers"
        # Accept an id directly, otherwise resolve by name (case-insensitive).
        if isinstance(raw, int) or (isinstance(raw, str) and raw.isdigit()):
            row = conn.execute(f"SELECT id FROM {table} WHERE id = ?", (int(raw),)).fetchone()
            if row:
                return row["id"]
        row = conn.execute(f"SELECT id FROM {table} WHERE name = ? COLLATE NOCASE", (str(raw).strip(),)).fetchone()
        if not row:
            noun = "category" if field_name == "category_id" else "tier"
            raise ValueError(f"No {noun} named '{raw}' exists.")
        return row["id"]

    if field_name in ("is_transfer", "needs_review"):
        s = str(raw).strip().lower()
        if s in ("1", "true", "yes", "y", "t"):
            return 1
        if s in ("0", "false", "no", "n", "f"):
            return 0
        raise ValueError(f"'{raw}' is not a yes/no value.")

    if field_name == "date":
        s = str(raw).strip()
        # Expect ISO YYYY-MM-DD
        import re
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            raise ValueError(f"'{raw}' is not a valid date (use YYYY-MM-DD).")
        return s

    # description / description_raw
    return str(raw)


def record_override(conn, txn_id, field_name, old_value, new_value, note, author_type,
                    old_label=None, new_label=None):
    """Insert one audit row into transaction_overrides. Does not commit."""
    if field_name not in OVERRIDABLE_FIELDS:
        raise ValueError(f"'{field_name}' is not an editable field.")
    cursor = conn.execute(
        """INSERT INTO transaction_overrides
           (transaction_id, field_name, old_value, new_value, old_label, new_label, note, author_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            txn_id,
            field_name,
            None if old_value is None else str(old_value),
            None if new_value is None else str(new_value),
            old_label,
            new_label,
            (note.strip() if isinstance(note, str) and note.strip() else None),
            author_type,
        ),
    )
    return conn.execute("SELECT * FROM transaction_overrides WHERE id = ?", (cursor.lastrowid,)).fetchone()


def apply_field_update(conn, txn_id, field_name, new_value, note=None, author_type="user"):
    """Apply a single canonical field change to a transaction and record the override.

    `new_value` must already be the canonical column value (e.g. amount_cents as an
    int, category_id as an int, is_transfer as 0/1). Returns the override row, or
    None if the value was unchanged. Does not commit — the caller owns the transaction.
    """
    if field_name not in OVERRIDABLE_FIELDS:
        raise ValueError(f"'{field_name}' is not an editable field.")

    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if not row:
        raise ValueError("Transaction not found.")

    old_value = row[field_name]
    # Normalize for comparison (SQLite stores 0/1 for the boolean-ish fields).
    if field_name in ("is_transfer", "needs_review", "amount_cents", "category_id", "tier_id"):
        norm_old = None if old_value is None else int(old_value)
        norm_new = None if new_value is None else int(new_value)
    else:
        norm_old = None if old_value is None else str(old_value)
        norm_new = None if new_value is None else str(new_value)
    if norm_old == norm_new:
        return None  # no-op

    if field_name == "date" and new_value is not None:
        import re
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(new_value)):
            raise ValueError(f"'{new_value}' is not a valid date (use YYYY-MM-DD).")

    # Validate foreign keys up front so a bad id surfaces as a clean error, not a raw IntegrityError.
    if field_name == "category_id" and new_value is not None:
        if not conn.execute("SELECT 1 FROM categories WHERE id = ?", (new_value,)).fetchone():
            raise ValueError(f"Category {new_value} does not exist.")
    if field_name == "tier_id" and new_value is not None:
        if not conn.execute("SELECT 1 FROM spend_tiers WHERE id = ?", (new_value,)).fetchone():
            raise ValueError(f"Tier {new_value} does not exist.")

    old_label = label_for(conn, field_name, old_value)
    new_label = label_for(conn, field_name, new_value)

    set_parts = [f"{field_name} = ?", "updated_at = datetime('now')"]
    params = [new_value]
    if field_name in _CATEGORIZATION_FIELDS:
        set_parts.append("categorization_status = 'manual'")
    conn.execute(f"UPDATE transactions SET {', '.join(set_parts)} WHERE id = ?", (*params, txn_id))

    return record_override(
        conn, txn_id, field_name, old_value, new_value, note, author_type,
        old_label=old_label, new_label=new_label,
    )
