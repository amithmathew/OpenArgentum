from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional
from pydantic import BaseModel
from backend.database import get_db
from backend.models import TransactionResponse, TransactionUpdate, BulkTransactionUpdate
from backend.services.categorization import categorize_transactions

router = APIRouter()


class CategorizeRequest(BaseModel):
    transaction_ids: list[int] | None = None
    all: bool = False
    force: bool = False


@router.get("")
def list_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    category_id: Optional[int] = None,
    tier_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    project_id: Optional[int] = None,
    account_id: Optional[int] = None,
    search: Optional[str] = None,
    min_amount: Optional[int] = None,
    max_amount: Optional[int] = None,
    is_transfer: Optional[bool] = None,
    needs_review: Optional[bool] = None,
    show_hidden: Optional[bool] = False,
    sort_by: str = "date",
    sort_dir: str = "desc",
    page: int = 1,
    per_page: int = 50,
):
    conn = get_db()
    try:
        conditions = []
        params = []

        if not show_hidden:
            conditions.append("t.is_hidden = 0")

        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)
        if category_id is not None:
            conditions.append("t.category_id = ?")
            params.append(category_id)
        if tier_id is not None:
            conditions.append("(t.tier_id = ? OR (t.tier_id IS NULL AND c.default_tier_id = ?))")
            params.extend([tier_id, tier_id])
        if account_id is not None:
            conditions.append("t.account_id = ?")
            params.append(account_id)
        if search:
            conditions.append("t.description LIKE ?")
            params.append(f"%{search}%")
        if min_amount is not None:
            conditions.append("t.amount_cents >= ?")
            params.append(min_amount)
        if max_amount is not None:
            conditions.append("t.amount_cents <= ?")
            params.append(max_amount)
        if is_transfer is not None:
            conditions.append("t.is_transfer = ?")
            params.append(1 if is_transfer else 0)
        if tag_id is not None:
            conditions.append("EXISTS (SELECT 1 FROM transaction_tags WHERE transaction_id = t.id AND tag_id = ?)")
            params.append(tag_id)
        if project_id is not None:
            conditions.append("EXISTS (SELECT 1 FROM transaction_projects WHERE transaction_id = t.id AND project_id = ?)")
            params.append(project_id)
        if needs_review is not None:
            conditions.append("t.needs_review = ?")
            params.append(1 if needs_review else 0)

        where = " AND ".join(conditions) if conditions else "1=1"

        # Validate sort column
        allowed_sorts = {"date", "description", "amount_cents", "category_id", "created_at"}
        if sort_by not in allowed_sorts:
            sort_by = "date"
        sort_direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

        # Count total + aggregates (exclude confirmed transfers from spend/income sums, matching dashboard logic)
        agg_sql = f"""
            SELECT COUNT(*) as cnt,
                   COALESCE(SUM(CASE WHEN (t.is_transfer = 0 OR t.needs_review = 1) AND t.amount_cents < 0 THEN t.amount_cents ELSE 0 END), 0) as total_spend,
                   COALESCE(SUM(CASE WHEN (t.is_transfer = 0 OR t.needs_review = 1) AND t.amount_cents > 0 THEN t.amount_cents ELSE 0 END), 0) as total_income
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE {where}
        """
        agg = conn.execute(agg_sql, params).fetchone()
        total = agg["cnt"]
        total_spend = agg["total_spend"]
        total_income = agg["total_income"]

        # Monthly subtotals for the same filter (exclude confirmed transfers from spend/income, matching dashboard)
        monthly_sql = f"""
            SELECT strftime('%Y-%m', t.date) as month,
                   COUNT(*) as count,
                   COALESCE(SUM(CASE WHEN (t.is_transfer = 0 OR t.needs_review = 1) AND t.amount_cents < 0 THEN t.amount_cents ELSE 0 END), 0) as spend,
                   COALESCE(SUM(CASE WHEN (t.is_transfer = 0 OR t.needs_review = 1) AND t.amount_cents > 0 THEN t.amount_cents ELSE 0 END), 0) as income
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE {where}
            GROUP BY strftime('%Y-%m', t.date)
            ORDER BY month DESC
        """
        monthly_rows = conn.execute(monthly_sql, params).fetchall()
        monthly_subtotals = {r["month"]: {"count": r["count"], "spend": r["spend"], "income": r["income"]} for r in monthly_rows}

        # Fetch page
        offset = (page - 1) * per_page
        query_sql = f"""
            SELECT t.*, a.name as account_name, a.institution as account_institution, a.icon_url as account_icon_url,
                   s.filename as statement_filename,
                   GROUP_CONCAT(DISTINCT tp.project_id) as project_ids,
                   GROUP_CONCAT(DISTINCT tt.tag_id) as tag_ids,
                   (SELECT COUNT(*) FROM transaction_notes tn WHERE tn.transaction_id = t.id) as note_count,
                   dup.date as dup_original_date, dup.description as dup_original_description,
                   dup.amount_cents as dup_original_amount, dup_s.filename as dup_original_statement, dup_s.id as dup_original_statement_id
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN statements s ON t.statement_id = s.id
            LEFT JOIN transaction_projects tp ON t.id = tp.transaction_id
            LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
            LEFT JOIN transactions dup ON t.duplicate_of_id = dup.id
            LEFT JOIN statements dup_s ON dup.statement_id = dup_s.id
            WHERE {where}
            GROUP BY t.id
            ORDER BY t.{sort_by} {sort_direction}
            LIMIT ? OFFSET ?
        """
        rows = conn.execute(query_sql, [*params, per_page, offset]).fetchall()

        return {
            "items": [dict(r) for r in rows],
            "total": total,
            "total_spend": total_spend,
            "total_income": total_income,
            "monthly_subtotals": monthly_subtotals,
        }
    finally:
        conn.close()


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(transaction_id: int, update: TransactionUpdate):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Transaction not found")

        updates = {}
        if update.category_id is not None:
            updates["category_id"] = update.category_id
            updates["categorization_status"] = "manual"
        if update.tier_id is not None:
            updates["tier_id"] = update.tier_id
            updates["categorization_status"] = "manual"
        if update.is_transfer is not None:
            updates["is_transfer"] = 1 if update.is_transfer else 0
        if update.needs_review is not None:
            updates["needs_review"] = 1 if update.needs_review else 0

        if not updates:
            return dict(existing)

        updates["updated_at"] = "placeholder"
        set_clause = ", ".join(
            f"{k} = datetime('now')" if k == "updated_at" else f"{k} = ?"
            for k in updates
        )
        values = [v for k, v in updates.items() if k != "updated_at"]

        conn.execute(
            f"UPDATE transactions SET {set_clause} WHERE id = ?",
            (*values, transaction_id),
        )
        conn.commit()

        row = conn.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.get("/pending-count")
def pending_count():
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) as count FROM transactions WHERE categorization_status = 'pending' AND is_transfer = 0"
        ).fetchone()
        return {"count": row["count"]}
    finally:
        conn.close()


@router.post("/categorize")
def trigger_categorization(req: CategorizeRequest, background_tasks: BackgroundTasks):
    if req.all:
        background_tasks.add_task(categorize_transactions, None, req.force)
    elif req.transaction_ids:
        background_tasks.add_task(categorize_transactions, req.transaction_ids, req.force)
    else:
        raise HTTPException(status_code=400, detail="Provide transaction_ids or set all=true")
    return {"status": "processing", "message": "Categorization started"}


@router.get("/duplicates")
def list_duplicates():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT t.*, s.filename as statement_filename
            FROM transactions t
            JOIN statements s ON t.statement_id = s.id
            WHERE t.fingerprint IN (
                SELECT fingerprint FROM transactions
                GROUP BY fingerprint HAVING COUNT(*) > 1
            )
            ORDER BY t.fingerprint, t.date
        """).fetchall()
        return {"items": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@router.post("/duplicates/{transaction_id}/resolve")
def resolve_duplicate(transaction_id: int, action: str = Query(..., pattern="^(keep|delete)$")):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Transaction not found")

        if action == "delete":
            conn.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        else:
            conn.execute(
                "UPDATE transactions SET needs_review = 0 WHERE id = ?", (transaction_id,)
            )
        conn.commit()
        return {"status": "resolved"}
    finally:
        conn.close()


class ResolveDuplicateRequest(BaseModel):
    transaction_id: int
    action: str  # "hide" or "keep"


@router.post("/resolve-duplicate")
def resolve_duplicate(req: ResolveDuplicateRequest):
    """Resolve a suspected duplicate. 'hide' soft-deletes it, 'keep' clears the flag."""
    conn = get_db()
    try:
        if req.action == "hide":
            conn.execute(
                "UPDATE transactions SET is_hidden = 1, is_suspected_duplicate = 0, updated_at = datetime('now') WHERE id = ?",
                (req.transaction_id,),
            )
        elif req.action == "keep":
            conn.execute(
                "UPDATE transactions SET is_suspected_duplicate = 0, duplicate_of_id = NULL, updated_at = datetime('now') WHERE id = ?",
                (req.transaction_id,),
            )
        conn.commit()
        return {"status": "ok", "action": req.action}
    finally:
        conn.close()


@router.post("/resolve-all-duplicates")
def resolve_all_duplicates(action: str = "hide"):
    """Bulk resolve all suspected duplicates."""
    conn = get_db()
    try:
        if action == "hide":
            cursor = conn.execute(
                "UPDATE transactions SET is_hidden = 1, is_suspected_duplicate = 0, updated_at = datetime('now') WHERE is_suspected_duplicate = 1"
            )
        else:
            cursor = conn.execute(
                "UPDATE transactions SET is_suspected_duplicate = 0, duplicate_of_id = NULL, updated_at = datetime('now') WHERE is_suspected_duplicate = 1"
            )
        conn.commit()
        return {"status": "ok", "count": cursor.rowcount, "action": action}
    finally:
        conn.close()


@router.post("/bulk-update")
def bulk_update_transactions(req: BulkTransactionUpdate):
    if not req.transaction_ids:
        raise HTTPException(status_code=400, detail="transaction_ids must not be empty")

    updates = {}
    if req.category_id is not None:
        updates["category_id"] = req.category_id
        updates["categorization_status"] = "manual"
    if req.tier_id is not None:
        updates["tier_id"] = req.tier_id
        updates["categorization_status"] = "manual"
    if req.is_transfer is not None:
        updates["is_transfer"] = 1 if req.is_transfer else 0
    if req.needs_review is not None:
        updates["needs_review"] = 1 if req.needs_review else 0

    # Auto-clear needs_review when manually categorizing or unmarking as transfer
    if req.needs_review is None:
        if req.category_id is not None or (req.is_transfer is not None and not req.is_transfer):
            updates["needs_review"] = 0

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = "placeholder"
    set_clause = ", ".join(
        f"{k} = datetime('now')" if k == "updated_at" else f"{k} = ?"
        for k in updates
    )
    values = [v for k, v in updates.items() if k != "updated_at"]
    placeholders = ",".join("?" * len(req.transaction_ids))

    conn = get_db()
    try:
        cursor = conn.execute(
            f"UPDATE transactions SET {set_clause} WHERE id IN ({placeholders})",
            (*values, *req.transaction_ids),
        )
        conn.commit()
        return {"status": "updated", "count": cursor.rowcount}
    finally:
        conn.close()


class HideTransactionsRequest(BaseModel):
    transaction_ids: list[int]
    hidden: bool = True


@router.post("/hide")
def hide_transactions(req: HideTransactionsRequest):
    """Soft delete (hide) or unhide transactions."""
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(req.transaction_ids))
        cursor = conn.execute(
            f"UPDATE transactions SET is_hidden = ?, updated_at = datetime('now') WHERE id IN ({placeholders})",
            (1 if req.hidden else 0, *req.transaction_ids),
        )
        conn.commit()
        return {"status": "ok", "count": cursor.rowcount, "hidden": req.hidden}
    finally:
        conn.close()


# --- Transaction Notes ---

class NoteCreate(BaseModel):
    content: str
    author_type: str = "user"


@router.get("/{transaction_id}/notes")
def get_transaction_notes(transaction_id: int):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM transactions WHERE id = ?", (transaction_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Transaction not found")
        rows = conn.execute(
            "SELECT * FROM transaction_notes WHERE transaction_id = ? ORDER BY created_at ASC",
            (transaction_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("/{transaction_id}/notes", status_code=201)
def add_transaction_note(transaction_id: int, note: NoteCreate):
    if not note.content.strip():
        raise HTTPException(status_code=400, detail="Note content cannot be empty")
    if note.author_type not in ("user", "aurelia"):
        raise HTTPException(status_code=400, detail="author_type must be 'user' or 'aurelia'")
    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Transaction not found")
        cursor = conn.execute(
            "INSERT INTO transaction_notes (transaction_id, author_type, content) VALUES (?, ?, ?)",
            (transaction_id, note.author_type, note.content.strip()),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM transaction_notes WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.get("/notes/search")
def search_transaction_notes(
    query: str = "",
    author_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account_id: Optional[int] = None,
    limit: int = 50,
):
    """Search across all transaction notes."""
    if not query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    conn = get_db()
    try:
        conditions = ["tn.content LIKE ?"]
        params: list = [f"%{query}%"]
        if author_type:
            conditions.append("tn.author_type = ?")
            params.append(author_type)
        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)
        if account_id is not None:
            conditions.append("t.account_id = ?")
            params.append(account_id)
        where = " AND ".join(conditions)
        params.append(limit)
        rows = conn.execute(f"""
            SELECT tn.*, t.date as txn_date, t.description as txn_description,
                   t.amount_cents as txn_amount_cents, t.account_id as txn_account_id
            FROM transaction_notes tn
            JOIN transactions t ON t.id = tn.transaction_id
            WHERE {where}
            ORDER BY tn.created_at DESC
            LIMIT ?
        """, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
