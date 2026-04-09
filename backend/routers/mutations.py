import json
from fastapi import APIRouter, HTTPException
from backend.services.mutations import execute_mutation, undo_mutation
from backend.database import get_db

router = APIRouter()


def _save_action_to_chat(mutation_id: str, action: str, title: str, success: bool = True):
    """Save the user's approve/reject/undo action and its result to chat history."""
    conn = get_db()
    try:
        proposal = conn.execute("SELECT session_id FROM mutation_proposals WHERE mutation_id = ?", (mutation_id,)).fetchone()
        if proposal and proposal["session_id"]:
            status_emoji = "✓" if success else "✗"
            action_labels = {
                "executed": ("Approved", "Applied successfully" if success else "Failed to apply"),
                "rejected": ("Rejected", "Proposal dismissed"),
                "reverted": ("Undone", "Changes reverted" if success else "Failed to revert"),
            }
            label, outcome = action_labels.get(action, (action, ""))
            action_text = f"{status_emoji} {label}: {title} — {outcome}"

            conn.execute(
                "INSERT INTO chat_messages (session_id, role, content, metadata) VALUES (?, 'user', ?, ?)",
                (proposal["session_id"], action_text, json.dumps({"is_action": True, "mutation_id": mutation_id, "action": action, "success": success})),
            )
            conn.commit()
    except Exception:
        pass
    finally:
        conn.close()


@router.post("/{mutation_id}/execute")
def execute(mutation_id: str):
    result = execute_mutation(mutation_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    _save_action_to_chat(mutation_id, "executed", result.get("title", ""))
    return result


@router.post("/{mutation_id}/undo")
def undo(mutation_id: str):
    result = undo_mutation(mutation_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    _save_action_to_chat(mutation_id, "reverted", result.get("title", ""))
    return result


@router.get("/{mutation_id}/details")
def get_details(mutation_id: str):
    """Get the full list of affected transactions for a proposal."""
    conn = get_db()
    try:
        proposal = conn.execute("SELECT * FROM mutation_proposals WHERE mutation_id = ?", (mutation_id,)).fetchone()
        if not proposal:
            raise HTTPException(status_code=404, detail="Proposal not found")

        affected_ids = json.loads(proposal["affected_ids"])
        if not affected_ids:
            return {"items": []}

        placeholders = ",".join("?" * len(affected_ids))
        rows = conn.execute(f"""
            SELECT t.id, t.date, t.description as label, t.amount_cents / 100.0 as amount
            FROM transactions t WHERE t.id IN ({placeholders})
            ORDER BY t.date DESC
        """, affected_ids).fetchall()

        return {"items": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/{mutation_id}/reject")
def reject(mutation_id: str):
    conn = get_db()
    try:
        proposal = conn.execute("SELECT * FROM mutation_proposals WHERE mutation_id = ? AND status = 'pending'", (mutation_id,)).fetchone()
        title = proposal["title"] if proposal else ""
        conn.execute("UPDATE mutation_proposals SET status = 'rejected' WHERE mutation_id = ? AND status = 'pending'", (mutation_id,))
        conn.commit()
    finally:
        conn.close()
    _save_action_to_chat(mutation_id, "rejected", title)
    return {"status": "rejected", "mutation_id": mutation_id}
