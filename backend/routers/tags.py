from fastapi import APIRouter, HTTPException
from backend.database import get_db
from backend.models import TagCreate, TagUpdate, AssignTagRequest, UnassignTagRequest

router = APIRouter()


@router.get("")
def list_tags():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT t.*, COUNT(tt.transaction_id) as transaction_count
            FROM tags t
            LEFT JOIN transaction_tags tt ON t.id = tt.tag_id
            GROUP BY t.id
            ORDER BY t.name
        """).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("", status_code=201)
def create_tag(tag: TagCreate):
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO tags (name, color) VALUES (?, ?)",
            (tag.name, tag.color),
        )
        conn.commit()
        row = conn.execute(
            "SELECT *, 0 as transaction_count FROM tags WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.put("/{tag_id}")
def update_tag(tag_id: int, tag: TagUpdate):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found")

        updates = {k: v for k, v in tag.model_dump().items() if v is not None}
        if updates:
            updates_sql = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE tags SET {updates_sql}, updated_at = datetime('now') WHERE id = ?",
                (*updates.values(), tag_id),
            )
            conn.commit()

        row = conn.execute(
            "SELECT t.*, COUNT(tt.transaction_id) as transaction_count FROM tags t LEFT JOIN transaction_tags tt ON t.id = tt.tag_id WHERE t.id = ? GROUP BY t.id",
            (tag_id,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found")
        conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
        conn.commit()
    finally:
        conn.close()


@router.post("/{tag_id}/confirm")
def confirm_tag(tag_id: int):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found")
        conn.execute(
            "UPDATE tags SET is_confirmed = 1, updated_at = datetime('now') WHERE id = ?",
            (tag_id,),
        )
        conn.commit()
        return {"status": "confirmed"}
    finally:
        conn.close()


@router.post("/confirm-all")
def confirm_all_tags():
    conn = get_db()
    try:
        cursor = conn.execute(
            "UPDATE tags SET is_confirmed = 1, updated_at = datetime('now') WHERE is_confirmed = 0"
        )
        conn.commit()
        return {"confirmed": cursor.rowcount}
    finally:
        conn.close()


@router.post("/assign")
def assign_tags(req: AssignTagRequest):
    conn = get_db()
    try:
        added = 0
        for txn_id in req.transaction_ids:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
                    (txn_id, req.tag_id),
                )
                added += 1
            except Exception:
                pass
        conn.commit()
        return {"added": added}
    finally:
        conn.close()


@router.post("/unassign")
def unassign_tags(req: UnassignTagRequest):
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(req.transaction_ids))
        conn.execute(
            f"DELETE FROM transaction_tags WHERE tag_id = ? AND transaction_id IN ({placeholders})",
            (req.tag_id, *req.transaction_ids),
        )
        conn.commit()
        return {"removed": len(req.transaction_ids)}
    finally:
        conn.close()
