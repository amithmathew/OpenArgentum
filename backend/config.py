import os
import json
import secrets
from pathlib import Path

# Base paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
STATEMENTS_DIR = DATA_DIR / "statements"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
DEMO_SOURCE = PROJECT_ROOT / "demo" / "demo.db"
ENV_PATH = PROJECT_ROOT / ".env"
CONFIG_PATH = DATA_DIR / "config.json"

# Database
DEFAULT_DB_NAME = "finance.db"


def get_db_path() -> Path:
    """Return path to the currently active database."""
    active = get_config_value("active_db", DEFAULT_DB_NAME)
    return DATA_DIR / active


def get_db_name() -> str:
    """Return name of the currently active database."""
    return get_config_value("active_db", DEFAULT_DB_NAME)

# Gemini
_DEFAULT_MODEL = "gemini-2.5-flash"
GEMINI_MODEL = os.getenv("GEMINI_MODEL", _DEFAULT_MODEL)


def get_active_model(role="chat") -> str:
    """Get the active model for a given role. Checks config override first, then env, then default.

    Roles:
        chat — Aurelia chatbot
        document — PDF/CSV ingestion and categorization
    """
    if role == "document":
        return get_config_value("document_model") or get_config_value("gemini_model") or os.getenv("GEMINI_MODEL") or _DEFAULT_MODEL
    return get_config_value("chat_model") or get_config_value("gemini_model") or os.getenv("GEMINI_MODEL") or _DEFAULT_MODEL

# Processing
CATEGORIZATION_BATCH_SIZE = 50

# Server
DEFAULT_PORT = int(os.getenv("PORT", "8099"))


def load_app_config() -> dict:
    """Load app config from data/config.json. Creates default if missing."""
    if CONFIG_PATH.exists():
        try:
            if CONFIG_PATH.stat().st_mode & 0o077:
                try:
                    CONFIG_PATH.chmod(0o600)
                except OSError:
                    pass
            return json.loads(CONFIG_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def save_app_config(config: dict):
    """Save app config to data/config.json."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2))
    try:
        CONFIG_PATH.chmod(0o600)
    except OSError:
        pass


def get_config_value(key: str, default=None):
    """Get a single config value."""
    return load_app_config().get(key, default)


def set_config_value(key: str, value):
    """Set a single config value."""
    config = load_app_config()
    config[key] = value
    save_app_config(config)


def is_onboarding_complete() -> bool:
    """Check if the user has completed initial setup."""
    return get_config_value("onboarding_complete", False)


def get_network_token() -> str | None:
    """Get the LAN access token, or None if network sharing is disabled."""
    return get_config_value("network_token")


def get_network_pin_hash() -> str | None:
    """Get the hashed network PIN."""
    return get_config_value("network_pin_hash")


def is_network_sharing_enabled() -> bool:
    """Check if network sharing is enabled."""
    return get_config_value("network_sharing", False)


def get_gemini_api_key() -> str | None:
    """Get the Gemini API key from config or environment."""
    # Config file takes priority
    key = get_config_value("gemini_api_key")
    if key:
        return key
    # Fall back to env
    return os.getenv("GOOGLE_API_KEY")
