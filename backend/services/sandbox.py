"""
Sandbox database for Aurelia's complex analysis queries.

Creates per-session SQLite snapshots that Aurelia can run arbitrary SQL against,
including CREATE TEMP TABLE, CTEs, etc. Completely isolated from the main DB.
"""
import logging
import sqlite3
import tempfile
import threading
import time
from pathlib import Path

from backend.config import DATA_DIR, get_config_value, set_config_value
from backend.database import get_db

logger = logging.getLogger(__name__)

SANDBOX_DIR = DATA_DIR / "sandboxes"
SANDBOX_EXPIRY_HOURS = 24
MAX_QUERY_TIMEOUT_SECONDS = 30
MAX_RESULT_ROWS = 500

# Track active sandbox connections per session
_sandboxes: dict[int, dict] = {}  # session_id -> {path, conn, created_at, data_revision}
_lock = threading.Lock()


def _get_data_revision() -> int:
    """Get the current data revision counter from the main DB."""
    return int(get_config_value("data_revision", 0))


def increment_data_revision():
    """Increment the data revision counter. Call this after imports, edits, etc."""
    current = _get_data_revision()
    set_config_value("data_revision", current + 1)


def _create_sandbox(session_id: int) -> dict:
    """Create a fresh sandbox by backing up the main DB."""
    SANDBOX_DIR.mkdir(parents=True, exist_ok=True)

    sandbox_path = SANDBOX_DIR / f"sandbox_{session_id}.db"

    # Use sqlite3 backup API — WAL-safe
    source_conn = get_db()
    try:
        dest_conn = sqlite3.connect(str(sandbox_path))
        source_conn.backup(dest_conn)
        dest_conn.close()
    finally:
        source_conn.close()

    # Open a connection to the sandbox
    conn = sqlite3.connect(str(sandbox_path))
    conn.row_factory = sqlite3.Row

    # Security: block ATTACH to prevent sandbox escape
    def authorizer(action, arg1, arg2, db_name, trigger):
        if action == sqlite3.SQLITE_ATTACH:
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_DETACH:
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    conn.set_authorizer(authorizer)

    # Resource limits
    conn.execute("PRAGMA max_page_count = 50000")  # ~200MB max
    conn.execute("PRAGMA busy_timeout = 5000")

    sandbox = {
        "path": sandbox_path,
        "conn": conn,
        "created_at": time.time(),
        "data_revision": _get_data_revision(),
    }

    logger.info(f"Created sandbox for session {session_id} at {sandbox_path}")
    return sandbox


def _is_sandbox_valid(sandbox: dict) -> tuple[bool, str]:
    """Check if a sandbox is still valid. Returns (valid, reason)."""
    # Check expiry
    age_hours = (time.time() - sandbox["created_at"]) / 3600
    if age_hours > SANDBOX_EXPIRY_HOURS:
        return False, "expired (older than 24 hours)"

    # Check staleness
    current_rev = _get_data_revision()
    if sandbox["data_revision"] != current_rev:
        return False, "stale (main database has been updated since sandbox was created)"

    return True, ""


def _get_or_create_sandbox(session_id: int) -> tuple[dict, bool]:
    """Get existing sandbox or create new one. Returns (sandbox, was_rebuilt)."""
    with _lock:
        sandbox = _sandboxes.get(session_id)
        was_rebuilt = False

        if sandbox:
            valid, reason = _is_sandbox_valid(sandbox)
            if not valid:
                logger.info(f"Sandbox for session {session_id} is invalid: {reason}. Rebuilding.")
                try:
                    sandbox["conn"].close()
                except Exception:
                    pass
                try:
                    sandbox["path"].unlink(missing_ok=True)
                except Exception:
                    pass
                sandbox = None
                was_rebuilt = True

        if not sandbox:
            sandbox = _create_sandbox(session_id)
            _sandboxes[session_id] = sandbox
            if not was_rebuilt:
                was_rebuilt = False  # First creation, not a rebuild

        return sandbox, was_rebuilt


def run_sandbox_query(session_id: int, sql: str) -> dict:
    """Execute a SQL query on the session's sandbox database.

    Returns:
        {
            "columns": [...],
            "rows": [...],
            "row_count": N,
            "truncated": bool,
            "sandbox_rebuilt": bool,
            "rebuild_reason": str | None,
        }
    """
    sandbox, was_rebuilt = _get_or_create_sandbox(session_id)
    conn = sandbox["conn"]

    rebuild_reason = None
    if was_rebuilt:
        rebuild_reason = "Sandbox was refreshed from the latest data. Any temporary tables you created previously have been lost. Re-create them if needed."

    try:
        # Execute with timeout
        result = {"columns": [], "rows": [], "row_count": 0, "truncated": False,
                  "sandbox_rebuilt": was_rebuilt, "rebuild_reason": rebuild_reason}

        # Use a timer to interrupt long-running queries
        timer = threading.Timer(MAX_QUERY_TIMEOUT_SECONDS, conn.interrupt)
        timer.start()

        try:
            cursor = conn.execute(sql)

            # Check if it's a SELECT/query that returns data
            if cursor.description:
                result["columns"] = [desc[0] for desc in cursor.description]
                rows = cursor.fetchmany(MAX_RESULT_ROWS + 1)
                if len(rows) > MAX_RESULT_ROWS:
                    rows = rows[:MAX_RESULT_ROWS]
                    result["truncated"] = True
                result["rows"] = [list(row) for row in rows]
                result["row_count"] = len(result["rows"])
            else:
                # DDL or non-query — report success
                result["row_count"] = cursor.rowcount if cursor.rowcount >= 0 else 0
                result["message"] = "Query executed successfully"
                conn.commit()

        finally:
            timer.cancel()

        return result

    except sqlite3.OperationalError as e:
        error_msg = str(e)
        if "interrupted" in error_msg.lower():
            return {"error": f"Query timed out after {MAX_QUERY_TIMEOUT_SECONDS} seconds. Try a simpler query.",
                    "sandbox_rebuilt": was_rebuilt, "rebuild_reason": rebuild_reason}
        if "no such table" in error_msg.lower() and was_rebuilt:
            return {"error": f"{error_msg}. Note: the sandbox was just rebuilt — your temporary tables were lost. Re-create them from your conversation history.",
                    "sandbox_rebuilt": True, "rebuild_reason": rebuild_reason}
        return {"error": error_msg, "sandbox_rebuilt": was_rebuilt, "rebuild_reason": rebuild_reason}
    except Exception as e:
        return {"error": str(e), "sandbox_rebuilt": was_rebuilt, "rebuild_reason": rebuild_reason}


def cleanup_sandbox(session_id: int):
    """Clean up a sandbox when a session is deleted."""
    with _lock:
        sandbox = _sandboxes.pop(session_id, None)
        if sandbox:
            try:
                sandbox["conn"].close()
            except Exception:
                pass
            try:
                sandbox["path"].unlink(missing_ok=True)
            except Exception:
                pass
            logger.info(f"Cleaned up sandbox for session {session_id}")


def cleanup_expired_sandboxes():
    """Clean up all expired sandboxes. Call periodically or on startup."""
    with _lock:
        expired = []
        for session_id, sandbox in _sandboxes.items():
            valid, _ = _is_sandbox_valid(sandbox)
            if not valid:
                expired.append(session_id)

        for session_id in expired:
            sandbox = _sandboxes.pop(session_id)
            try:
                sandbox["conn"].close()
            except Exception:
                pass
            try:
                sandbox["path"].unlink(missing_ok=True)
            except Exception:
                pass

    # Also clean orphaned files
    if SANDBOX_DIR.exists():
        for f in SANDBOX_DIR.glob("sandbox_*.db*"):
            if time.time() - f.stat().st_mtime > SANDBOX_EXPIRY_HOURS * 3600:
                f.unlink(missing_ok=True)

    if expired:
        logger.info(f"Cleaned up {len(expired)} expired sandboxes")
