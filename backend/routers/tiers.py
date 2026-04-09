from fastapi import APIRouter, HTTPException
from backend.database import get_db
from backend.models import TierCreate, TierUpdate, TierResponse

router = APIRouter()


@router.get("", response_model=list[TierResponse])
def list_tiers():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM spend_tiers ORDER BY sort_order").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("", response_model=TierResponse, status_code=201)
def create_tier(tier: TierCreate):
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO spend_tiers (name, description, color, sort_order) VALUES (?, ?, ?, ?)",
            (tier.name, tier.description, tier.color, tier.sort_order),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM spend_tiers WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=409, detail=f"Tier '{tier.name}' already exists")
        raise
    finally:
        conn.close()


@router.put("/{tier_id}", response_model=TierResponse)
def update_tier(tier_id: int, tier: TierUpdate):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM spend_tiers WHERE id = ?", (tier_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tier not found")

        updates = {k: v for k, v in tier.model_dump().items() if v is not None}
        if not updates:
            return dict(existing)

        updates["updated_at"] = "datetime('now')"
        set_clause = ", ".join(f"{k} = ?" for k in updates if k != "updated_at")
        set_clause += ", updated_at = datetime('now')"
        values = [v for k, v in updates.items() if k != "updated_at"]

        conn.execute(
            f"UPDATE spend_tiers SET {set_clause} WHERE id = ?",
            (*values, tier_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM spend_tiers WHERE id = ?", (tier_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.delete("/{tier_id}", status_code=204)
def delete_tier(tier_id: int):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM spend_tiers WHERE id = ?", (tier_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tier not found")
        conn.execute("DELETE FROM spend_tiers WHERE id = ?", (tier_id,))
        conn.commit()
    finally:
        conn.close()
