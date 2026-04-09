from fastapi import APIRouter, HTTPException
from backend.database import get_db
from backend.models import CategoryCreate, CategoryUpdate, CategoryResponse

router = APIRouter()


@router.get("", response_model=list[CategoryResponse])
def list_categories():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT c.*, COALESCE(t.cnt, 0) as transaction_count
            FROM categories c
            LEFT JOIN (SELECT category_id, COUNT(*) as cnt FROM transactions GROUP BY category_id) t
            ON c.id = t.category_id
            ORDER BY c.name
        """).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("", response_model=CategoryResponse, status_code=201)
def create_category(category: CategoryCreate):
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO categories (name, default_tier_id) VALUES (?, ?)",
            (category.name, category.default_tier_id),
        )
        conn.commit()
        row = conn.execute("""
            SELECT c.*, 0 as transaction_count
            FROM categories c WHERE c.id = ?
        """, (cursor.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=409, detail=f"Category '{category.name}' already exists")
        raise
    finally:
        conn.close()


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, category: CategoryUpdate):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")

        updates = {k: v for k, v in category.model_dump().items() if v is not None}
        if not updates:
            row = conn.execute("""
                SELECT c.*, COALESCE(t.cnt, 0) as transaction_count
                FROM categories c
                LEFT JOIN (SELECT category_id, COUNT(*) as cnt FROM transactions GROUP BY category_id) t
                ON c.id = t.category_id
                WHERE c.id = ?
            """, (category_id,)).fetchone()
            return dict(row)

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values())

        conn.execute(
            f"UPDATE categories SET {set_clause} WHERE id = ?",
            (*values, category_id),
        )
        conn.commit()
        row = conn.execute("""
            SELECT c.*, COALESCE(t.cnt, 0) as transaction_count
            FROM categories c
            LEFT JOIN (SELECT category_id, COUNT(*) as cnt FROM transactions GROUP BY category_id) t
            ON c.id = t.category_id
            WHERE c.id = ?
        """, (category_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        conn.commit()
    finally:
        conn.close()


@router.post("/{category_id}/confirm", response_model=CategoryResponse)
def confirm_category(category_id: int):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")
        conn.execute("UPDATE categories SET is_confirmed = 1 WHERE id = ?", (category_id,))
        conn.commit()
        row = conn.execute("""
            SELECT c.*, COALESCE(t.cnt, 0) as transaction_count
            FROM categories c
            LEFT JOIN (SELECT category_id, COUNT(*) as cnt FROM transactions GROUP BY category_id) t
            ON c.id = t.category_id
            WHERE c.id = ?
        """, (category_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()
