import logging
import os
import socket
import sys
import uvicorn

mode = os.getenv("OPENARGENTUM_MODE", "production")
is_dev = mode == "dev" or "--dev" in sys.argv
is_headless = bool(os.getenv("OPENARGENTUM_HEADLESS"))

logging.basicConfig(
    level=logging.DEBUG if is_dev else logging.WARNING,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

# Our app loggers should always log INFO+ (config changes, ingestion, errors)
logging.getLogger("backend").setLevel(logging.INFO)

# Suppress noisy third-party loggers in production
if not is_dev:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("google_genai").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

def _port_in_use(host: str, port: int) -> bool:
    """Return True if something is already bound to (host, port)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
            return False
        except OSError:
            return True


if __name__ == "__main__":
    from backend.config import DEFAULT_PORT

    port = DEFAULT_PORT
    host = "0.0.0.0"

    # Fail gracefully if the port is taken — usually a previous instance still running.
    if _port_in_use(host, port):
        print(f"\n  ✗ Port {port} is already in use.")
        print(f"     OpenArgentum may already be running — try opening http://localhost:{port}")
        print( "     If it's a stale process, stop it and start again. To use a different port:")
        print(f"       PORT=8100 ./start.sh{' --demo' if os.getenv('OPENARGENTUM_DEMO') else ''}")
        print()
        sys.exit(1)

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "localhost"

    print(f"\n  OpenArgentum ({mode})")
    print(f"  Local:   http://localhost:{port}")
    if is_headless:
        print(f"  Network: http://{local_ip}:{port}  (PIN required)")
    else:
        print(f"  Network: disabled (use --headless to enable, or toggle in Settings)")
    print()

    uvicorn.run(
        "backend.app:app",
        host=host,
        port=port,
        reload=is_dev,
        log_level="debug" if is_dev else "error",
    )
