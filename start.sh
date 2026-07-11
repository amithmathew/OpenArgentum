#!/usr/bin/env bash
# start.sh — OpenArgentum Launcher
# No 'set -e' — the server must always start, even if setup steps fail.

cd "$(dirname "$0")"

# --- Parse flags ---

MODE="production"
HEADLESS=false
PIN=""
DEMO=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dev)
      MODE="dev"
      shift
      ;;
    --demo)
      DEMO=true
      shift
      ;;
    --headless)
      HEADLESS=true
      shift
      ;;
    --pin)
      PIN="$2"
      shift 2
      ;;
    --pin=*)
      PIN="${1#*=}"
      shift
      ;;
    --help|-h)
      echo "Usage: ./start.sh [flags]"
      echo ""
      echo "Flags:"
      echo "  --demo       Boot into the demo database (no API key or onboarding required)"
      echo "  --dev        Start in development mode (Vite HMR + uvicorn reload)"
      echo "  --headless   Enable network access with PIN authentication"
      echo "  --pin PIN    Set the network access PIN (used with --headless)"
      echo "               If --headless is used without --pin, a random PIN is generated"
      echo ""
      echo "Examples:"
      echo "  ./start.sh                     Production mode, localhost only"
      echo "  ./start.sh --demo              Explore the sample database, no key needed"
      echo "  ./start.sh --dev               Development mode with hot reload"
      echo "  ./start.sh --headless          Network access with auto-generated PIN"
      echo "  ./start.sh --headless --pin 1234   Network access with specific PIN"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1 (use --help for usage)"
      exit 1
      ;;
  esac
done

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║       OpenArgentum Setup          ║"
echo "  ╚═══════════════════════════════════╝"
echo ""
echo "  Mode: $MODE$([ "$HEADLESS" = true ] && echo ' + headless')$([ "$DEMO" = true ] && echo ' + demo')"
echo ""

# --- Check prerequisites ---

if ! command -v python3 &> /dev/null; then
    echo "  ✗ Python 3 is required but not found."
    echo "     Install from https://www.python.org/downloads/"
    exit 1
fi
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if ! python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"; then
    echo "  ✗ Python 3.10+ is required (found $PY_VER)."
    echo "     Install a newer version from https://www.python.org/downloads/"
    exit 1
fi
echo "  ✓ Python $PY_VER"

if ! command -v node &> /dev/null; then
    echo "  ✗ Node.js is required but not found."
    echo "     Install from https://nodejs.org/"
    exit 1
fi
NODE_VER=$(node --version | sed 's/^v//')
NODE_MAJOR=${NODE_VER%%.*}
NODE_REST=${NODE_VER#*.}
NODE_MINOR=${NODE_REST%%.*}
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
    echo "  ✗ Node.js 20.19+ is required (found v$NODE_VER)."
    echo "     Vite 8 needs Node 20.19 or newer. Install the LTS from https://nodejs.org/"
    exit 1
fi
echo "  ✓ Node.js v$NODE_VER"

# --- Python virtual environment ---

if [ ! -d ".venv" ]; then
    echo "  → Creating Python virtual environment..."
    python3 -m venv .venv
fi
source .venv/bin/activate
echo "  ✓ Virtual environment activated"

# --- Backend dependencies (skip if requirements.txt unchanged) ---

if ! cmp -s backend/requirements.txt .venv/.req.cache 2>/dev/null; then
    echo "  → Installing Python dependencies..."
    if pip install -q -r backend/requirements.txt; then
        cp backend/requirements.txt .venv/.req.cache
    else
        echo "  ⚠ pip install failed — backend may be missing dependencies"
    fi
else
    echo "  ✓ Python dependencies up to date"
fi

# --- Frontend dependencies (skip if package-lock.json unchanged) ---

if ! cmp -s frontend/package-lock.json frontend/.pkg.cache 2>/dev/null; then
    echo "  → Installing frontend dependencies..."
    if (cd frontend && npm ci --silent 2>/dev/null); then
        cp frontend/package-lock.json frontend/.pkg.cache
    else
        echo "  ⚠ npm install failed"
    fi
else
    echo "  ✓ Frontend dependencies up to date"
fi

# --- Frontend build (production mode only, skip in dev) ---

if [ "$MODE" = "production" ]; then
    BUILD_STAMP="frontend/.build-stamp"
    NEEDS_BUILD=false

    if [ ! -d "frontend/dist" ]; then
        NEEDS_BUILD=true
    elif [ ! -f "$BUILD_STAMP" ]; then
        NEEDS_BUILD=true
    elif [ -n "$(find frontend/src frontend/public frontend/index.html frontend/vite.config.* -type f -newer "$BUILD_STAMP" 2>/dev/null | head -n 1)" ]; then
        NEEDS_BUILD=true
    fi

    if [ "$NEEDS_BUILD" = true ]; then
        echo "  → Building frontend..."
        if (cd frontend && npx vite build 2>&1 | tail -1); then
            touch "$BUILD_STAMP"
        else
            echo "  ⚠ Frontend build failed — serving previous version if available"
        fi
    else
        echo "  ✓ Frontend up to date"
    fi

    # Ensure frontend/dist exists so FastAPI doesn't crash on a fresh clone with a failed build
    if [ ! -d "frontend/dist" ]; then
        mkdir -p frontend/dist
        echo "<html><body><h3>Frontend build failed. Check terminal logs.</h3></body></html>" > frontend/dist/index.html
    fi
fi

# --- Data directories ---

mkdir -p data/statements

# --- Headless mode: configure network sharing + PIN ---

if [ "$HEADLESS" = true ]; then
    if [ -z "$PIN" ]; then
        # Generate a random 6-digit PIN
        PIN=$(python3 -c "import random; print(f'{random.randint(100000,999999)}')")
    fi

    # Hash the PIN and enable network sharing via config
    python3 -c "
import hashlib, os, json
from pathlib import Path

data_dir = Path('data')
data_dir.mkdir(exist_ok=True)
config_path = data_dir / 'config.json'

config = {}
if config_path.exists():
    try:
        config = json.loads(config_path.read_text())
    except Exception:
        pass

salt = os.urandom(16)
pin_hash = salt.hex() + ':' + hashlib.pbkdf2_hmac('sha256', '${PIN}'.encode(), salt, 600_000).hex()

config['network_sharing'] = True
config['network_pin_hash'] = pin_hash
# Invalidate existing sessions — forces re-login with new PIN
config.pop('network_session_token', None)

config_path.write_text(json.dumps(config, indent=2))
try:
    config_path.chmod(0o600)
except OSError:
    pass
"
    echo ""
    echo "  ┌───────────────────────────────────┐"
    echo "  │  Network access enabled           │"
    echo "  │  PIN: $PIN                      │"
    echo "  └───────────────────────────────────┘"
else
    # Disable network sharing when not in headless mode
    python3 -c "
import json
from pathlib import Path

config_path = Path('data/config.json')
if config_path.exists():
    try:
        config = json.loads(config_path.read_text())
        if config.get('network_sharing'):
            config['network_sharing'] = False
            config_path.write_text(json.dumps(config, indent=2))
    except Exception:
        pass
"
fi

echo ""
echo "  ✓ Setup complete!"
echo ""

# --- Start the server ---

if [ "$HEADLESS" = true ]; then
    export OPENARGENTUM_HEADLESS=1
fi

if [ "$DEMO" = true ]; then
    export OPENARGENTUM_DEMO=1
    echo "  ┌───────────────────────────────────┐"
    echo "  │  Demo mode - sample database      │"
    echo "  │  No API key or onboarding needed  │"
    echo "  │  Changes reset when you restart   │"
    echo "  └───────────────────────────────────┘"
    echo ""
fi

if [ "$MODE" = "dev" ]; then
    export OPENARGENTUM_MODE=dev
    echo "  Starting in dev mode (Vite HMR + uvicorn reload)..."
    echo ""

    # Start Vite dev server in background
    (cd frontend && npx vite --port 5173 --host) &
    VITE_PID=$!

    # Start backend with reload, proxying to Vite for frontend
    python run.py --dev

    # Cleanup Vite on exit
    kill $VITE_PID 2>/dev/null
else
    export OPENARGENTUM_MODE=production
    python run.py
fi
