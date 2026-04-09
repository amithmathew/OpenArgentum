import hashlib
import logging
import os
import secrets
import socket

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from backend.config import (
    DATA_DIR, STATEMENTS_DIR, SNAPSHOTS_DIR, DEMO_SOURCE, DEFAULT_DB_NAME,
    load_app_config, save_app_config, set_config_value, get_config_value,
    get_db_path, get_db_name,
    is_onboarding_complete, is_network_sharing_enabled,
)
from backend.database import (
    get_db, init_db,
    create_snapshot, restore_snapshot, delete_snapshot, list_database_files,
)

router = APIRouter()


# --- App config / onboarding ---

class SetupLLMRequest(BaseModel):
    provider: str  # "api_key" or "adc"
    api_key: str | None = None
    gcp_project: str | None = None

class NetworkShareRequest(BaseModel):
    enabled: bool
    pin: str | None = None

class CreateDatabaseRequest(BaseModel):
    name: str

class SwitchDatabaseRequest(BaseModel):
    name: str

class CreateSnapshotRequest(BaseModel):
    name: str


@router.get("/app-config")
def get_app_config():
    """Get app configuration for the frontend."""
    import os
    from backend.config import get_active_model
    config = load_app_config()
    return {
        "onboarding_complete": config.get("onboarding_complete", False),
        "llm_configured": bool(config.get("gemini_api_key") or config.get("llm_provider") == "adc"),
        "llm_provider": config.get("llm_provider", "none"),
        "chat_model": get_active_model("chat"),
        "document_model": get_active_model("document"),
        "network_sharing": config.get("network_sharing", False),
        "has_network_pin": bool(config.get("network_pin_hash")),
        "headless": bool(os.getenv("OPENARGENTUM_HEADLESS")),
        "local_ip": _get_local_ip(),
    }


@router.post("/models")
def set_models(request: dict):
    """Set AI model overrides. Pass chat_model and/or document_model."""
    chat_model = request.get("chat_model", "").strip()
    document_model = request.get("document_model", "").strip()
    if chat_model:
        set_config_value("chat_model", chat_model)
    if document_model:
        set_config_value("document_model", document_model)
    # Clear legacy single-model key if role-specific ones are set
    if chat_model or document_model:
        set_config_value("gemini_model", None)
    logger.info(f"Model config updated — chat: {get_active_model('chat')}, document: {get_active_model('document')}")
    return {"status": "ok", "chat_model": get_active_model("chat"), "document_model": get_active_model("document")}


@router.post("/setup-llm")
def setup_llm(req: SetupLLMRequest):
    """Configure the LLM provider."""
    if req.provider == "api_key":
        if not req.api_key:
            raise HTTPException(status_code=400, detail="API key required")
        # Test the key
        try:
            from google import genai
            client = genai.Client(api_key=req.api_key)
            from backend.config import get_active_model
            response = client.models.generate_content(
                model=get_active_model(),
                contents="Say 'hello' in one word.",
                config={"max_output_tokens": 10},
            )
            if not response.text:
                raise Exception("Empty response")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"API key test failed: {str(e)}")

        set_config_value("llm_provider", "api_key")
        set_config_value("gemini_api_key", req.api_key)
        # Also set as env var for the current process
        import os
        os.environ["GOOGLE_API_KEY"] = req.api_key
        # Reset the cached client
        from backend.services.gemini_client import get_client
        import backend.services.gemini_client as gc
        gc._client = None

        logger.info("LLM configured: API key set and verified")
        return {"status": "ok", "message": "API key configured and verified"}

    elif req.provider == "adc":
        # Test ADC
        try:
            import google.auth
            credentials, project = google.auth.default()
            if not project and not req.gcp_project:
                raise Exception("No project found in ADC. Please provide a GCP project ID.")
            set_config_value("llm_provider", "adc")
            if req.gcp_project:
                set_config_value("gcp_project", req.gcp_project)
            # Reset cached client
            import backend.services.gemini_client as gc
            gc._client = None
            logger.info(f"LLM configured: GCP ADC (project: {req.gcp_project or 'default'})")
            return {"status": "ok", "message": "ADC configured successfully"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"ADC test failed: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Invalid provider")


@router.post("/complete-onboarding")
def complete_onboarding():
    """Mark onboarding as complete."""
    set_config_value("onboarding_complete", True)
    return {"status": "ok"}


@router.post("/network-sharing")
def toggle_network_sharing(req: NetworkShareRequest):
    """Enable or disable network sharing."""
    if req.enabled:
        if not req.pin or len(req.pin) < 6:
            raise HTTPException(status_code=400, detail="PIN must be at least 6 characters")
        salt = os.urandom(16)
        pin_hash = hashlib.pbkdf2_hmac('sha256', req.pin.encode(), salt, 600_000).hex()
        set_config_value("network_sharing", True)
        set_config_value("network_pin_hash", f"{salt.hex()}:{pin_hash}")
        # Invalidate any existing sessions — forces re-login with new PIN
        set_config_value("network_session_token", None)
        logger.info(f"Network sharing enabled — accessible at http://{_get_local_ip()}:{_get_port()}")
        return {
            "status": "ok",
            "message": f"Network sharing enabled. Other devices can access at http://{_get_local_ip()}:{_get_port()}",
            "local_ip": _get_local_ip(),
            "port": _get_port(),
        }
    else:
        set_config_value("network_sharing", False)
        # Clear session token so existing network sessions are invalidated
        set_config_value("network_session_token", None)
        logger.info("Network sharing disabled")
        return {"status": "ok", "message": "Network sharing disabled. Other devices can no longer access."}


# --- Stats ---

@router.get("/stats")
def get_stats():
    """Get database statistics."""
    conn = get_db()
    try:
        stats = {}
        for table in ["transactions", "statements", "categories", "spend_tiers", "accounts", "tags", "projects", "chat_sessions"]:
            row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
            stats[table] = row[0]

        row = conn.execute("SELECT COUNT(*) FROM mutation_log WHERE reverted_at IS NULL").fetchone()
        stats["mutations_executed"] = row[0]
        row = conn.execute("SELECT COUNT(*) FROM mutation_log WHERE reverted_at IS NULL").fetchone()
        stats["mutations_reverted"] = row[0]
        row = conn.execute("SELECT COUNT(*) FROM mutation_proposals WHERE status = 'pending'").fetchone()
        stats["mutations_pending"] = row[0]

        db_path = get_db_path()
        if db_path.exists():
            stats["db_size_mb"] = round(db_path.stat().st_size / (1024 * 1024), 2)

        total_size = sum(f.stat().st_size for f in STATEMENTS_DIR.glob("*") if f.is_file())
        stats["statements_size_mb"] = round(total_size / (1024 * 1024), 2)

        stats["active_db"] = get_db_name()

        return stats
    finally:
        conn.close()


# --- Danger zone ---

@router.post("/reset-database")
def reset_database():
    import os
    db_path = get_db_path()
    if db_path.exists():
        # Auto-backup before reset
        auto = create_snapshot("auto_pre-reset")
        snapshots = get_config_value("snapshots", [])
        snapshots.append(auto)
        set_config_value("snapshots", snapshots)
        os.remove(db_path)
    init_db()
    logger.info(f"Database reset: {db_path.name}. Auto-backup created.")
    return {"status": "ok", "message": "Database reset. Auto-backup created. Uploaded files preserved."}


@router.post("/purge-all")
def purge_all():
    import os, shutil
    db_path = get_db_path()
    if db_path.exists():
        # Auto-backup before purge
        auto = create_snapshot("auto_pre-purge")
        snapshots = get_config_value("snapshots", [])
        snapshots.append(auto)
        set_config_value("snapshots", snapshots)
        os.remove(db_path)
    if STATEMENTS_DIR.exists():
        shutil.rmtree(STATEMENTS_DIR)
        STATEMENTS_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    logger.info("Full purge: database reset and all uploaded files deleted. Auto-backup created.")
    return {"status": "ok", "message": "All data purged. Auto-backup created."}


@router.post("/clear-categories")
def clear_categories():
    conn = get_db()
    try:
        conn.execute("UPDATE transactions SET category_id = NULL, tier_id = NULL, categorization_status = 'pending'")
        conn.execute("DELETE FROM categories")
        conn.commit()
        return {"status": "ok", "message": "Categories cleared."}
    finally:
        conn.close()


@router.post("/recategorize-all")
def recategorize_all():
    conn = get_db()
    try:
        result = conn.execute(
            "UPDATE transactions SET category_id = NULL, tier_id = NULL, categorization_status = 'pending' "
            "WHERE categorization_status = 'auto'"
        )
        conn.commit()
        return {"status": "ok", "count": result.rowcount}
    finally:
        conn.close()


# --- Database management ---

@router.get("/databases")
def list_databases():
    """List all available databases."""
    databases = list_database_files()
    active = get_db_name()
    for db in databases:
        db["is_active"] = (db["name"] == active)
        db["is_demo"] = (db["name"] == "demo.db")
    return {
        "active": active,
        "databases": databases,
        "demo_available": DEMO_SOURCE.exists(),
    }


@router.post("/databases")
def create_database(req: CreateDatabaseRequest):
    """Create a new empty database."""
    name = req.name.strip()
    if not name.endswith(".db"):
        name = f"{name}.db"
    safe = name.replace(".db", "").replace("-", "").replace("_", "")
    if not safe.isalnum():
        raise HTTPException(400, "Database name must contain only letters, numbers, hyphens, and underscores")
    if name == "demo.db":
        raise HTTPException(400, "Cannot create a database named 'demo.db' — it is reserved for the demo")
    db_path = DATA_DIR / name
    if db_path.exists():
        raise HTTPException(409, f"Database '{name}' already exists")
    init_db(db_path)
    logger.info(f"Created new database: {name}")
    return {"status": "ok", "name": name}


@router.post("/switch-database")
def switch_database(req: SwitchDatabaseRequest):
    """Switch the active database."""
    from backend.services.ingestion import is_ingestion_active
    if is_ingestion_active():
        raise HTTPException(409, "Cannot switch databases while statement ingestion is in progress")
    name = req.name
    db_path = DATA_DIR / name
    if not db_path.exists():
        raise HTTPException(404, f"Database '{name}' not found")
    # Ensure schema exists on target
    init_db(db_path)
    set_config_value("active_db", name)
    logger.info(f"Switched active database to: {name}")
    return {"status": "ok", "active": name}


@router.get("/snapshots")
def list_snapshots():
    """List all database snapshots."""
    snapshots = get_config_value("snapshots", [])
    verified = []
    for snap in snapshots:
        path = SNAPSHOTS_DIR / snap["filename"]
        if path.exists():
            snap["size_bytes"] = path.stat().st_size
            snap["exists"] = True
        else:
            snap["exists"] = False
        verified.append(snap)
    return {"snapshots": verified}


@router.post("/snapshots")
def create_snapshot_endpoint(req: CreateSnapshotRequest):
    """Create a named snapshot of the active database."""
    metadata = create_snapshot(req.name)
    snapshots = get_config_value("snapshots", [])
    snapshots.append(metadata)
    set_config_value("snapshots", snapshots)
    logger.info(f"Created snapshot: {metadata.get('name', req.name)}")
    return {"status": "ok", "snapshot": metadata}


@router.post("/snapshots/{snapshot_id}/restore")
def restore_snapshot_endpoint(snapshot_id: str):
    """Restore a snapshot over the active database."""
    from backend.services.ingestion import is_ingestion_active
    if is_ingestion_active():
        raise HTTPException(409, "Cannot restore while ingestion is in progress")
    snapshots = get_config_value("snapshots", [])
    target = next((s for s in snapshots if s["id"] == snapshot_id), None)
    if not target:
        raise HTTPException(404, "Snapshot not found")
    # Auto-backup current state before restore
    auto = create_snapshot(f"auto_pre-restore")
    snapshots.append(auto)
    set_config_value("snapshots", snapshots)
    restore_snapshot(target["filename"])
    logger.info(f"Restored snapshot: {target['name']}. Auto-backup of previous state created.")
    return {"status": "ok", "message": f"Restored snapshot '{target['name']}'", "auto_backup": auto}


@router.delete("/snapshots/{snapshot_id}")
def delete_snapshot_endpoint(snapshot_id: str):
    """Delete a snapshot."""
    snapshots = get_config_value("snapshots", [])
    target = next((s for s in snapshots if s["id"] == snapshot_id), None)
    if not target:
        raise HTTPException(404, "Snapshot not found")
    delete_snapshot(target["filename"])
    snapshots = [s for s in snapshots if s["id"] != snapshot_id]
    set_config_value("snapshots", snapshots)
    return {"status": "ok"}


# --- Helpers ---

def _get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _get_port():
    from backend.config import DEFAULT_PORT
    return DEFAULT_PORT
