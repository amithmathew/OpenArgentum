import hashlib
import hmac
import logging
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request

logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.config import DATA_DIR, STATEMENTS_DIR, SNAPSHOTS_DIR, DEMO_SOURCE, is_network_sharing_enabled, get_config_value
from backend.database import get_db, init_db
from backend.routers import accounts, statements, transactions, categories, tiers, dashboard, settings, projects, tags, chatbot, mutations

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"

# --- Rate limiter for PIN login ---
_login_attempts: dict[str, tuple[int, float]] = {}  # IP -> (fail_count, last_fail_time)
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_BACKOFF_BASE = 1.0  # seconds, doubles each failure beyond threshold
_LOGIN_WINDOW = 900  # 15 minutes — attempts reset after this


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATEMENTS_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    # Copy demo DB fresh on every startup (changes are ephemeral)
    if DEMO_SOURCE.exists():
        import shutil
        shutil.copy2(str(DEMO_SOURCE), str(DATA_DIR / "demo.db"))

    from backend.config import get_db_path
    init_db()
    logger.info(f"Active database: {get_db_path().name}")

    # Reset any stale processing jobs to failed
    conn = get_db()
    try:
        conn.execute(
            "UPDATE statements SET status = 'failed', error_message = 'Server restarted during processing' "
            "WHERE status = 'processing'"
        )
        conn.commit()
    finally:
        conn.close()

    # Clean up expired analysis sandboxes
    from backend.services.sandbox import cleanup_expired_sandboxes
    cleanup_expired_sandboxes()

    yield

    # Shutdown (nothing to clean up for now)


app = FastAPI(title="OpenArgentum", version="0.1.0", lifespan=lifespan)

# CORS — only needed when running the Vite dev server on a different port.
# In production, the SPA is served from the same origin so no CORS is needed.
if not frontend_dist.is_dir():
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# --- Network auth middleware ---
# When network sharing is enabled, require a valid session cookie for non-localhost requests.
# Localhost requests always pass through (single-user mode).

_OPEN_PATHS = {"/api/auth/login", "/api/auth/status", "/api/settings/app-config"}
_seen_network_clients = {}  # IP -> last_logged_time

class NetworkAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Always allow localhost
        client_host = request.client.host if request.client else "127.0.0.1"
        if client_host in ("127.0.0.1", "::1", "localhost"):
            return await call_next(request)

        # If network sharing is off, reject all non-localhost
        if not is_network_sharing_enabled():
            # Return a branded HTML page for browser requests, JSON for API calls
            if request.url.path.startswith("/api/"):
                return JSONResponse(status_code=403, content={"detail": "Network access disabled"})
            from starlette.responses import HTMLResponse
            return HTMLResponse(status_code=403, content="""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"><title>OpenArgentum</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f4f6f8;color:#374151;padding:24px}
.card{text-align:center;max-width:360px}.logo{margin-bottom:16px}h1{font-size:20px;font-weight:600;margin-bottom:8px}p{font-size:14px;color:#6b7280;line-height:1.5}
.hint{margin-top:20px;font-size:12px;color:#9ca3af;background:#f0f1f3;padding:10px 14px;border-radius:8px;text-align:left}code{font-size:11px;background:#e5e7eb;padding:2px 6px;border-radius:4px}</style></head>
<body><div class="card"><div class="logo"><svg width="56" height="63" viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;opacity:.8"><path d="M50 2 L95 20 Q98 21 98 24 L98 52 Q98 80 50 110 Q2 80 2 52 L2 24 Q2 21 5 20 Z" fill="#1e293b"/><text x="50" y="74" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="62" fill="white" letter-spacing="-2">A</text></svg></div><h1>OpenArgentum</h1><p>Network access is not enabled on this instance.</p>
<div class="hint">To enable network access:<br><br><strong>Option 1:</strong> On the host computer, go to <strong>Settings</strong> and enable Network Sharing.<br><br><strong>Option 2:</strong> Restart the app with <code>./start.sh --headless</code></div></div></body></html>""")

        # Allow auth endpoints without cookie
        if request.url.path in _OPEN_PATHS:
            return await call_next(request)

        # Allow static files (frontend assets)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        # Check session cookie
        session_token = request.cookies.get("argentum_session")
        stored_token = get_config_value("network_session_token")
        if not session_token or not stored_token or not hmac.compare_digest(session_token, stored_token):
            return JSONResponse(status_code=401, content={"detail": "Authentication required", "auth_required": True})

        # Log access per IP, at most once per hour
        now = time.time()
        last_logged = _seen_network_clients.get(client_host, 0)
        if now - last_logged > 3600:
            _seen_network_clients[client_host] = now
            logger.info(f"Network access: authenticated session from {client_host}")

        return await call_next(request)

app.add_middleware(NetworkAuthMiddleware)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        content_type = response.headers.get("content-type", "")
        if "text/html" in content_type:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "img-src 'self' https://img.logo.dev; "
                "style-src 'self' 'unsafe-inline'; "
                "script-src 'self'; "
                "connect-src 'self'; "
                "font-src 'self' data:; "
                "object-src 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# --- Auth helpers ---

def _verify_pin(pin: str, stored: str) -> bool:
    """Verify PIN against stored hash. Supports PBKDF2 (salt:hash) and legacy SHA-256."""
    if ':' in stored:
        salt_hex, hash_hex = stored.split(':', 1)
        salt = bytes.fromhex(salt_hex)
        computed = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, 600_000).hex()
        return hmac.compare_digest(computed, hash_hex)
    else:
        computed = hashlib.sha256(pin.encode()).hexdigest()
        return hmac.compare_digest(computed, stored)


# --- Auth endpoints ---

@app.post("/api/auth/login")
async def auth_login(request: Request):
    """Verify PIN and set session cookie (rate-limited)."""
    body = await request.json()
    pin = body.get("pin", "")
    stored_hash = get_config_value("network_pin_hash")

    if not stored_hash:
        return JSONResponse(status_code=400, content={"detail": "Network sharing not configured"})

    client_ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Check rate limit
    attempts = _login_attempts.get(client_ip)
    if attempts:
        fail_count, last_fail = attempts
        if now - last_fail > _LOGIN_WINDOW:
            del _login_attempts[client_ip]
        elif fail_count >= _LOGIN_MAX_ATTEMPTS:
            backoff = min(_LOGIN_BACKOFF_BASE * (2 ** (fail_count - _LOGIN_MAX_ATTEMPTS)), 300)
            if now - last_fail < backoff:
                retry_after = int(backoff - (now - last_fail)) + 1
                return JSONResponse(
                    status_code=429,
                    content={"detail": f"Too many attempts. Try again in {retry_after}s."},
                    headers={"Retry-After": str(retry_after)},
                )

    if not _verify_pin(pin, stored_hash):
        logger.warning(f"Failed login attempt from {client_ip}")
        prev = _login_attempts.get(client_ip, (0, now))
        _login_attempts[client_ip] = (prev[0] + 1, now)
        return JSONResponse(status_code=401, content={"detail": "Invalid PIN"})

    # Success — clear rate limiter
    logger.info(f"Successful network login from {client_ip}")
    _login_attempts.pop(client_ip, None)

    # Generate or reuse session token
    session_token = get_config_value("network_session_token")
    if not session_token:
        from backend.config import set_config_value
        session_token = secrets.token_urlsafe(32)
        set_config_value("network_session_token", session_token)

    response = JSONResponse(content={"status": "ok"})
    response.set_cookie(
        key="argentum_session",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=30 * 24 * 3600,  # 30 days
    )
    return response


@app.get("/api/auth/status")
async def auth_status(request: Request):
    """Check if the current request is authenticated."""
    client_host = request.client.host if request.client else "127.0.0.1"
    is_local = client_host in ("127.0.0.1", "::1", "localhost")
    sharing_enabled = is_network_sharing_enabled()

    if is_local:
        return {"authenticated": True, "is_local": True, "network_sharing": sharing_enabled}

    session_token = request.cookies.get("argentum_session")
    stored_token = get_config_value("network_session_token")
    is_authed = bool(session_token and stored_token and hmac.compare_digest(session_token, stored_token))

    return {"authenticated": is_authed, "is_local": False, "network_sharing": sharing_enabled}


# Include routers under /api prefix
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(statements.router, prefix="/api/statements", tags=["statements"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(tiers.router, prefix="/api/tiers", tags=["tiers"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(chatbot.router, prefix="/api/chat", tags=["chat"])
app.include_router(mutations.router, prefix="/api/mutations", tags=["mutations"])

# Mount frontend static files for production (when dist/ exists).
# Static assets are served from /assets/, and a catch-all returns index.html for SPA routing.
# This does NOT interfere with /api/* routes since they're registered above as regular routes.
if frontend_dist.is_dir():
    from fastapi.responses import FileResponse

    # Serve built assets (JS, CSS, etc.)
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="static-assets")

    # SPA fallback: any non-API GET request returns index.html
    _frontend_root = frontend_dist.resolve()

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        # Never intercept API routes
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        # Prevent path traversal — resolve and verify containment
        resolved = (frontend_dist / path).resolve()
        if resolved.is_file() and str(resolved).startswith(str(_frontend_root) + "/"):
            return FileResponse(resolved)
        return FileResponse(frontend_dist / "index.html")
