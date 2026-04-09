import hashlib
import io
import logging
import shutil
import zipfile
from datetime import datetime

logger = logging.getLogger(__name__)
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional

from backend.config import STATEMENTS_DIR
from backend.database import get_db
from backend.models import StatementResponse
from backend.services.ingestion import enqueue_ingestion

ALLOWED_EXTENSIONS = (".pdf", ".csv")
MAX_UPLOAD_SIZE = 50 * 1024 * 1024          # 50 MB per file
MAX_ZIP_EXTRACTED_SIZE = 200 * 1024 * 1024  # 200 MB total extracted from one ZIP

router = APIRouter()


def _save_statement(conn, filename: str, content: bytes, account_id: int | None) -> dict | None:
    """Save a single statement file. Returns the statement row dict, or None if duplicate."""
    file_hash = hashlib.sha256(content).hexdigest()

    existing = conn.execute(
        "SELECT * FROM statements WHERE file_hash = ?", (file_hash,)
    ).fetchone()
    if existing:
        return None  # skip duplicates silently when inside a zip

    safe_filename = f"{file_hash[:12]}_{filename}"
    file_path = STATEMENTS_DIR / safe_filename
    file_path.write_bytes(content)

    cursor = conn.execute(
        """INSERT INTO statements (filename, file_hash, account_id, status)
           VALUES (?, ?, ?, 'pending')""",
        (filename, file_hash, account_id),
    )
    conn.commit()

    row = conn.execute(
        "SELECT * FROM statements WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return dict(row)


@router.get("")
def list_statements():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT s.*, a.name as account_name, a.institution as account_institution, a.icon_url as account_icon_url
            FROM statements s
            LEFT JOIN accounts a ON s.account_id = a.id
            ORDER BY s.uploaded_at DESC
        """).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("/upload", response_model=list[StatementResponse], status_code=201)
async def upload_statements(
    files: list[UploadFile] = File(...),
    account_id: Optional[int] = Form(None),
):
    results = []
    conn = get_db()
    try:
        for file in files:
            if not file.filename:
                continue

            content = await file.read()
            if len(content) > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File '{file.filename}' exceeds maximum upload size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
                )
            lower_name = file.filename.lower()

            if lower_name.endswith(".zip"):
                # Extract zip and process each PDF/CSV inside
                try:
                    total_extracted = 0
                    with zipfile.ZipFile(io.BytesIO(content)) as zf:
                        for member in zf.namelist():
                            # Skip directories and hidden/macOS resource files
                            if member.endswith("/") or "/__MACOSX" in member or member.startswith("__MACOSX"):
                                continue
                            if not member.lower().endswith(ALLOWED_EXTENSIONS):
                                continue
                            info = zf.getinfo(member)
                            if info.file_size > MAX_UPLOAD_SIZE:
                                raise HTTPException(
                                    status_code=413,
                                    detail=f"File '{member}' inside ZIP exceeds maximum size",
                                )
                            inner_content = zf.read(member)
                            total_extracted += len(inner_content)
                            if total_extracted > MAX_ZIP_EXTRACTED_SIZE:
                                raise HTTPException(
                                    status_code=413,
                                    detail=f"Total extracted content from ZIP exceeds {MAX_ZIP_EXTRACTED_SIZE // (1024 * 1024)}MB limit",
                                )
                            inner_name = Path(member).name  # strip directory paths
                            row = _save_statement(conn, inner_name, inner_content, account_id)
                            if row:
                                results.append(row)
                except zipfile.BadZipFile:
                    raise HTTPException(status_code=400, detail=f"File '{file.filename}' is not a valid zip file")

            elif lower_name.endswith(ALLOWED_EXTENSIONS):
                row = _save_statement(conn, file.filename, content, account_id)
                if row is None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"File '{file.filename}' has already been uploaded",
                    )
                results.append(row)

            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"File '{file.filename}' must be a PDF, CSV, or ZIP",
                )

        logger.info(f"Uploaded {len(results)} statement(s): {', '.join(r['filename'] for r in results)}")
        return results
    finally:
        conn.close()


@router.post("/ingest-all")
def ingest_all(statuses: list[str] | None = None):
    """Queue statements for ingestion. By default queues pending and failed.
    Pass statuses to override (e.g. ["pending", "failed", "completed"] for re-ingest all).
    """
    if statuses is None:
        statuses = ["pending", "failed"]
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(statuses))
        rows = conn.execute(
            f"SELECT id FROM statements WHERE status IN ({placeholders})",
            statuses,
        ).fetchall()
        queued = 0
        for row in rows:
            conn.execute(
                "UPDATE statements SET status = 'queued', error_message = 'Waiting in queue...' WHERE id = ?",
                (row["id"],),
            )
            enqueue_ingestion(row["id"])
            queued += 1
        conn.commit()
        return {"queued": queued}
    finally:
        conn.close()


@router.patch("/{statement_id}")
def update_statement(statement_id: int, update: dict):
    """Update statement fields (e.g. assign account_id)."""
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM statements WHERE id = ?", (statement_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Statement not found")

        if "account_id" in update:
            account_id = update["account_id"]
            conn.execute("UPDATE statements SET account_id = ? WHERE id = ?", (account_id, statement_id))
            # Also update all transactions for this statement
            conn.execute("UPDATE transactions SET account_id = ? WHERE statement_id = ?", (account_id, statement_id))
            conn.commit()

        row = conn.execute("SELECT * FROM statements WHERE id = ?", (statement_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.get("/{statement_id}", response_model=StatementResponse)
def get_statement(statement_id: int):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM statements WHERE id = ?", (statement_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Statement not found")
        return dict(row)
    finally:
        conn.close()


@router.get("/{statement_id}/file")
def get_statement_file(statement_id: int):
    """Serve the original uploaded file for viewing in the browser."""
    from fastapi.responses import FileResponse
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM statements WHERE id = ?", (statement_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Statement not found")

        file_path = None
        for f in STATEMENTS_DIR.glob(f"{row['file_hash'][:12]}_*"):
            file_path = f
            break

        if not file_path or not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        filename = row["filename"]
        lower = filename.lower()
        if lower.endswith(".pdf"):
            media_type = "application/pdf"
        elif lower.endswith(".csv"):
            media_type = "text/plain"
        else:
            media_type = "application/octet-stream"

        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=filename,
            headers={"Content-Disposition": f"inline; filename=\"{filename}\""},
        )
    finally:
        conn.close()


@router.get("/{statement_id}/status")
def get_statement_status(statement_id: int):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, status, error_message, transaction_count, processed_at FROM statements WHERE id = ?",
            (statement_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Statement not found")
        return dict(row)
    finally:
        conn.close()


@router.post("/{statement_id}/ingest")
def trigger_ingestion(statement_id: int):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM statements WHERE id = ?", (statement_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Statement not found")
        if row["status"] == "processing":
            raise HTTPException(status_code=409, detail="Statement is already being processed")
        # Mark as queued so the UI reflects it immediately
        conn.execute(
            "UPDATE statements SET status = 'queued', error_message = 'Waiting in queue...' WHERE id = ?",
            (statement_id,),
        )
        conn.commit()
    finally:
        conn.close()

    enqueue_ingestion(statement_id)
    return {"status": "queued", "message": "Ingestion queued"}


@router.delete("/{statement_id}", status_code=204)
def delete_statement(statement_id: int):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM statements WHERE id = ?", (statement_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Statement not found")

        # Delete the PDF file from disk
        for f in STATEMENTS_DIR.glob(f"{row['file_hash'][:12]}_*"):
            f.unlink(missing_ok=True)

        # Clear duplicate flags on other transactions that pointed to this statement's transactions
        conn.execute("""
            UPDATE transactions SET is_suspected_duplicate = 0, duplicate_of_id = NULL
            WHERE duplicate_of_id IN (SELECT id FROM transactions WHERE statement_id = ?)
        """, (statement_id,))

        # Delete from DB (cascades to transactions)
        conn.execute("DELETE FROM statements WHERE id = ?", (statement_id,))
        conn.commit()
        logger.info(f"Deleted statement #{statement_id}: {row['filename']}")
    finally:
        conn.close()
