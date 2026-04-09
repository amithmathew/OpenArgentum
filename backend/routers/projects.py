from fastapi import APIRouter, HTTPException
from backend.database import get_db
from backend.models import ProjectCreate, ProjectUpdate, ProjectResponse, AssignProjectRequest, UnassignProjectRequest

router = APIRouter()


@router.get("")
def list_projects(include_archived: bool = False):
    conn = get_db()
    try:
        where = "" if include_archived else "WHERE p.is_archived = 0"
        rows = conn.execute(f"""
            SELECT p.*,
                   COALESCE(SUM(CASE WHEN t.amount_cents < 0 THEN ABS(t.amount_cents) ELSE 0 END), 0) as total_spent_cents,
                   COUNT(tp.transaction_id) as transaction_count,
                   MAX(t.date) as latest_transaction_date
            FROM projects p
            LEFT JOIN transaction_projects tp ON p.id = tp.project_id
            LEFT JOIN transactions t ON tp.transaction_id = t.id
            {where}
            GROUP BY p.id
            ORDER BY latest_transaction_date DESC NULLS LAST, p.created_at DESC
        """).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("", status_code=201)
def create_project(project: ProjectCreate):
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO projects (name, description, color, budget_target_cents, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)",
            (project.name, project.description, project.color, project.budget_target_cents, project.start_date, project.end_date),
        )
        conn.commit()
        row = conn.execute("SELECT *, 0 as total_spent_cents, 0 as transaction_count FROM projects WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.get("/{project_id}")
def get_project(project_id: int):
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT p.*,
                   COALESCE(SUM(CASE WHEN t.amount_cents < 0 THEN ABS(t.amount_cents) ELSE 0 END), 0) as total_spent_cents,
                   COUNT(tp.transaction_id) as transaction_count
            FROM projects p
            LEFT JOIN transaction_projects tp ON p.id = tp.project_id
            LEFT JOIN transactions t ON tp.transaction_id = t.id
            WHERE p.id = ?
            GROUP BY p.id
        """, (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return dict(row)
    finally:
        conn.close()


@router.put("/{project_id}")
def update_project(project_id: int, project: ProjectUpdate):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")

        updates = {}
        for k, v in project.model_dump().items():
            if v is not None:
                if k == "is_archived":
                    updates[k] = 1 if v else 0
                else:
                    updates[k] = v

        if updates:
            updates_sql = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE projects SET {updates_sql}, updated_at = datetime('now') WHERE id = ?",
                (*updates.values(), project_id),
            )
            conn.commit()

        row = conn.execute("SELECT *, 0 as total_spent_cents, 0 as transaction_count FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
    finally:
        conn.close()


@router.post("/assign")
def assign_transactions(req: AssignProjectRequest):
    conn = get_db()
    try:
        added = 0
        for txn_id in req.transaction_ids:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO transaction_projects (transaction_id, project_id) VALUES (?, ?)",
                    (txn_id, req.project_id),
                )
                added += 1
            except Exception:
                pass
        conn.commit()
        return {"added": added}
    finally:
        conn.close()


@router.post("/unassign")
def unassign_transactions(req: UnassignProjectRequest):
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(req.transaction_ids))
        conn.execute(
            f"DELETE FROM transaction_projects WHERE project_id = ? AND transaction_id IN ({placeholders})",
            (req.project_id, *req.transaction_ids),
        )
        conn.commit()
        return {"removed": len(req.transaction_ids)}
    finally:
        conn.close()


@router.get("/{project_id}/transactions")
def get_project_transactions(project_id: int):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT t.*, a.name as account_name, a.institution as account_institution, a.icon_url as account_icon_url
            FROM transactions t
            JOIN transaction_projects tp ON t.id = tp.transaction_id
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE tp.project_id = ?
            ORDER BY t.date DESC
        """, (project_id,)).fetchall()
        return {"items": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@router.get("/{project_id}/breakdown")
def get_project_breakdown(project_id: int):
    """Category and tier breakdown for a project."""
    conn = get_db()
    try:
        categories = conn.execute("""
            SELECT c.id as category_id,
                   COALESCE(c.name, 'Uncategorized') as category,
                   COALESCE(st.name, 'Uncategorized') as tier,
                   COALESCE(st.color, '#9ca3af') as color,
                   SUM(t.amount_cents) as total,
                   COUNT(*) as count
            FROM transactions t
            JOIN transaction_projects tp ON t.id = tp.transaction_id
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
            WHERE tp.project_id = ? AND t.amount_cents < 0
            AND NOT (t.is_transfer = 1 AND t.needs_review = 0)
            GROUP BY category
            ORDER BY total ASC
        """, (project_id,)).fetchall()

        return {"items": [dict(r) for r in categories]}
    finally:
        conn.close()
