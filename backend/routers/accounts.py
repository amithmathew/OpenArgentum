from fastapi import APIRouter, HTTPException
from backend.database import get_db
from backend.models import AccountCreate, AccountUpdate, AccountResponse

router = APIRouter()


@router.get("")
def list_accounts():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT a.*,
                   COALESCE(s.cnt, 0) as statement_count,
                   COALESCE(t.cnt, 0) as transaction_count
            FROM accounts a
            LEFT JOIN (SELECT account_id, COUNT(*) as cnt FROM statements GROUP BY account_id) s ON a.id = s.account_id
            LEFT JOIN (SELECT account_id, COUNT(*) as cnt FROM transactions GROUP BY account_id) t ON a.id = t.account_id
            ORDER BY a.name
        """).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("", response_model=AccountResponse, status_code=201)
def create_account(account: AccountCreate):
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO accounts (name, institution, account_type) VALUES (?, ?, ?)",
            (account.name, account.institution, account.account_type),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(account_id: int, account: AccountUpdate):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Account not found")

        updates = {k: v for k, v in account.model_dump().items() if v is not None}
        if not updates:
            return dict(existing)

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values())

        conn.execute(
            f"UPDATE accounts SET {set_clause} WHERE id = ?",
            (*values, account_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.post("/{account_id}/merge/{target_id}")
def merge_accounts(account_id: int, target_id: int):
    """Merge account_id INTO target_id. Moves all statements/transactions, then deletes account_id."""
    if account_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot merge an account into itself")
    conn = get_db()
    try:
        source = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        target = conn.execute("SELECT * FROM accounts WHERE id = ?", (target_id,)).fetchone()
        if not source:
            raise HTTPException(status_code=404, detail="Source account not found")
        if not target:
            raise HTTPException(status_code=404, detail="Target account not found")

        conn.execute("UPDATE statements SET account_id = ? WHERE account_id = ?", (target_id, account_id))
        conn.execute("UPDATE transactions SET account_id = ? WHERE account_id = ?", (target_id, account_id))
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        conn.commit()

        return {"status": "ok", "message": f"Merged '{source['name']}' into '{target['name']}'"}
    finally:
        conn.close()


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Account not found")
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        conn.commit()
    finally:
        conn.close()
