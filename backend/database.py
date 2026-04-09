import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from backend.config import get_db_path, DATA_DIR, SNAPSHOTS_DIR

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS spend_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#6b7280',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    default_tier_id INTEGER REFERENCES spend_tiers(id) ON DELETE SET NULL,
    is_confirmed INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT '',
    account_type TEXT NOT NULL DEFAULT 'checking',
    account_number TEXT,
    account_holder TEXT,
    icon_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    statement_period_start TEXT,
    statement_period_end TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    page_count INTEGER,
    transaction_count INTEGER DEFAULT 0,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    description_raw TEXT,
    amount_cents INTEGER NOT NULL,
    transaction_type TEXT NOT NULL DEFAULT 'purchase',
    balance_cents INTEGER,
    reference TEXT,
    raw_text TEXT,
    fingerprint TEXT,
    is_transfer INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    is_suspected_duplicate INTEGER NOT NULL DEFAULT 0,
    duplicate_of_id INTEGER REFERENCES transactions(id),
    needs_review INTEGER NOT NULL DEFAULT 0,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    tier_id INTEGER REFERENCES spend_tiers(id) ON DELETE SET NULL,
    categorization_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_fingerprint ON transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_statement ON transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_is_transfer ON transactions(is_transfer);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#3b82f6',
    budget_target_cents INTEGER,
    start_date TEXT,
    end_date TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaction_projects (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (transaction_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_projects_project ON transaction_projects(project_id);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#9ca3af',
    is_confirmed INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    tool_history TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

CREATE TABLE IF NOT EXISTS mutation_proposals (
    mutation_id TEXT PRIMARY KEY,
    session_id INTEGER,
    intent TEXT NOT NULL,
    title TEXT NOT NULL,
    params TEXT NOT NULL,
    affected_ids TEXT NOT NULL,
    sample_items TEXT,
    impacted_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mutation_log (
    mutation_id TEXT PRIMARY KEY,
    intent TEXT NOT NULL,
    title TEXT,
    executed_at TEXT NOT NULL DEFAULT (datetime('now')),
    reverted_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation_id TEXT NOT NULL REFERENCES mutation_log(mutation_id),
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    before_state TEXT,
    after_state TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_mutation ON audit_log_changes(mutation_id);

CREATE TABLE IF NOT EXISTS transaction_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('user', 'aurelia')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_txn_notes_txn_id ON transaction_notes(transaction_id, created_at);
"""

SEED_TIERS = [
    {
        "name": "Essential",
        "description": "Fixed costs and necessities: rent, utilities, insurance, groceries, medical, minimum debt payments",
        "color": "#ef4444",
        "sort_order": 1,
    },
    {
        "name": "Lifestyle",
        "description": "Intentional discretionary spending: dining out, subscriptions, gym, hobbies, personal care",
        "color": "#f59e0b",
        "sort_order": 2,
    },
    {
        "name": "Discretionary",
        "description": "Non-essential spending that could be cut: impulse purchases, luxury items, entertainment splurges",
        "color": "#6b7280",
        "sort_order": 3,
    },
]


def get_db(db_path: Path | None = None) -> sqlite3.Connection:
    """Return a connection to the SQLite database with Row factory enabled."""
    path = db_path or get_db_path()
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=10000")  # 10 second wait on write locks
    return conn


def init_db(db_path: Path | None = None) -> None:
    """Create all tables and seed default data if needed."""
    conn = get_db(db_path)
    try:
        conn.executescript(SCHEMA_SQL)

        # Add tool_history column if missing (migration for existing DBs)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(chat_messages)").fetchall()]
        if "tool_history" not in cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN tool_history TEXT")
            conn.commit()

        # Seed spend tiers only if the table is empty
        row = conn.execute("SELECT COUNT(*) FROM spend_tiers").fetchone()
        if row[0] == 0:
            for tier in SEED_TIERS:
                conn.execute(
                    "INSERT INTO spend_tiers (name, description, color, sort_order) VALUES (?, ?, ?, ?)",
                    (tier["name"], tier["description"], tier["color"], tier["sort_order"]),
                )
            conn.commit()
    finally:
        conn.close()


def create_snapshot(name: str, source_db_path: Path | None = None) -> dict:
    """Create a named snapshot of a database file."""
    source = source_db_path or get_db_path()
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    # Checkpoint WAL to make .db file self-contained
    conn = sqlite3.connect(str(source))
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    safe_name = name.replace(" ", "_").replace("/", "_")
    snapshot_filename = f"{safe_name}_{timestamp}.db"
    dest = SNAPSHOTS_DIR / snapshot_filename

    shutil.copy2(str(source), str(dest))

    return {
        "id": f"{safe_name}_{timestamp}",
        "name": name,
        "filename": snapshot_filename,
        "source_db": source.name,
        "timestamp": datetime.now().isoformat(),
        "size_bytes": dest.stat().st_size,
    }


def restore_snapshot(snapshot_filename: str, target_db_path: Path | None = None) -> None:
    """Restore a snapshot over the target database."""
    target = target_db_path or get_db_path()
    source = SNAPSHOTS_DIR / snapshot_filename

    if not source.exists():
        raise FileNotFoundError(f"Snapshot file not found: {snapshot_filename}")

    # Checkpoint WAL on current DB before overwriting
    conn = sqlite3.connect(str(target))
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()

    shutil.copy2(str(source), str(target))

    # Clean up stale WAL/SHM files from the old DB
    for suffix in ("-wal", "-shm"):
        leftover = Path(str(target) + suffix)
        if leftover.exists():
            leftover.unlink()


def delete_snapshot(snapshot_filename: str) -> None:
    """Delete a snapshot file from disk."""
    path = SNAPSHOTS_DIR / snapshot_filename
    if path.exists():
        path.unlink()


def list_database_files() -> list[dict]:
    """List all .db files in the data directory."""
    dbs = []
    for f in sorted(DATA_DIR.glob("*.db")):
        dbs.append({
            "name": f.name,
            "size_bytes": f.stat().st_size,
            "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })
    return dbs
