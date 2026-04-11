import hashlib
import logging
import math
import queue
import threading
from datetime import datetime

from backend.config import STATEMENTS_DIR
from backend.database import get_db
from backend.services.gemini_client import extract_and_categorize_pdf, extract_and_categorize_text

logger = logging.getLogger(__name__)

# Sequential ingestion queue — only one statement processed at a time
_ingestion_queue: queue.Queue[int] = queue.Queue()
_worker_running = False
_worker_lock = threading.Lock()


def is_ingestion_active() -> bool:
    """Return True if the ingestion worker is currently processing."""
    with _worker_lock:
        return _worker_running


def enqueue_ingestion(statement_id: int) -> None:
    """Add a statement to the ingestion queue. Starts the worker if not running."""
    global _worker_running
    _ingestion_queue.put(statement_id)
    with _worker_lock:
        if not _worker_running:
            _worker_running = True
            t = threading.Thread(target=_ingestion_worker, daemon=True)
            t.start()


def _ingestion_worker() -> None:
    """Process ingestion queue sequentially."""
    global _worker_running
    while True:
        try:
            statement_id = _ingestion_queue.get(timeout=1)
        except queue.Empty:
            with _worker_lock:
                # Double-check the queue is still empty before stopping
                if _ingestion_queue.empty():
                    _worker_running = False
                    return
                continue
        try:
            ingest_statement(statement_id)
        except Exception as e:
            logger.error(f"Ingestion worker error for statement {statement_id}: {e}")
        finally:
            _ingestion_queue.task_done()


TAG_PALETTE = [
    '#e06060', '#4caf7c', '#5b8def', '#e8a040', '#8b7ec8',
    '#e88090', '#40b0a0', '#c06ac0', '#7aaa4a', '#d07840',
    '#6090d0', '#c8a040', '#50b8b8', '#d06080', '#80a060',
    '#a070e0', '#e0a070', '#50a0e0', '#d0a0b0', '#70c070',
]

def _generate_tag_color(conn):
    """Generate a visually distinct color for a new tag."""
    existing = conn.execute("SELECT color FROM tags").fetchall()
    used = {r["color"] for r in existing}
    for color in TAG_PALETTE:
        if color not in used:
            return color
    # Fallback: golden angle rotation
    hue = (len(existing) * 137.508) % 360
    return f"hsl({int(hue)}, 55%, 55%)"


def normalize_description(desc: str) -> str:
    """Normalize a transaction description for fingerprinting."""
    return " ".join(desc.lower().split())


def compute_fingerprint(date: str, amount_cents: int, description: str, account_id: int | None, occurrence: int = 0) -> str:
    """Compute a SHA-256 fingerprint for deduplication."""
    raw = f"{date}|{amount_cents}|{normalize_description(description)}|{account_id or 0}|{occurrence}"
    return hashlib.sha256(raw.encode()).hexdigest()


def extract_text_with_overlap(pdf_path: str, overlap_pct: float = 0.15) -> list[tuple[int, str]]:
    """Extract text from each page with overlapping windows to handle page-boundary splits.

    Returns list of (page_number, text_window) tuples.
    """
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = []
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=2) or ""
            page_texts.append(text)

        for i, text in enumerate(page_texts):
            if i > 0 and page_texts[i - 1]:
                # Prepend overlap from previous page
                prev_text = page_texts[i - 1]
                lines = prev_text.split("\n")
                overlap_lines = max(1, int(len(lines) * overlap_pct))
                overlap = "\n".join(lines[-overlap_lines:])
                text = f"[OVERLAP FROM PREVIOUS PAGE - DO NOT EXTRACT TRANSACTIONS FROM THIS SECTION, ONLY USE FOR CONTEXT]\n{overlap}\n[END OVERLAP - EXTRACT TRANSACTIONS BELOW]\n{text}"

            pages.append((i + 1, text))

    return pages


def deduplicate_across_pages(all_transactions: list[dict]) -> list[dict]:
    """Remove duplicate transactions that appear in overlapping page windows.

    Uses (date, amount, description_raw) as exact match first. For cases where
    Gemini produces different raw descriptions for the same transaction, falls
    back to (date, amount) with fuzzy word overlap on the raw description.
    """
    # Group by (date, amount)
    key_groups: dict[tuple, list[dict]] = {}
    for txn in all_transactions:
        key = (txn.get("date", ""), str(txn.get("amount", 0)))
        key_groups.setdefault(key, []).append(txn)

    unique = []
    for key, txns in key_groups.items():
        if len(txns) == 1:
            unique.append(txns[0])
        else:
            # Multiple transactions with same date+amount.
            # Check if they're duplicates from page overlap.
            kept = [txns[0]]
            for txn in txns[1:]:
                # Use raw description for matching (more stable than clean)
                raw = txn.get("description_raw", txn.get("description", "")).lower()
                is_dup = False
                for existing in kept:
                    existing_raw = existing.get("description_raw", existing.get("description", "")).lower()

                    # Exact raw match = definite duplicate
                    if raw == existing_raw:
                        is_dup = True
                        break

                    # Fuzzy: check word overlap on raw descriptions
                    words_new = set(raw.replace("/", " ").replace("-", " ").split())
                    words_existing = set(existing_raw.replace("/", " ").replace("-", " ").split())
                    if words_new and words_existing:
                        overlap = words_new & words_existing
                        similarity = len(overlap) / min(len(words_new), len(words_existing))
                        if similarity >= 0.5:
                            is_dup = True
                            break
                if not is_dup:
                    kept.append(txn)
            unique.extend(kept)

    return unique


def _get_categorization_context(conn) -> tuple[list[dict], list[str], list[str]]:
    """Fetch tier definitions, existing category names, and existing tag names for the LLM prompt."""
    tiers = conn.execute("SELECT name, description FROM spend_tiers ORDER BY sort_order").fetchall()
    categories = conn.execute("SELECT name FROM categories ORDER BY name").fetchall()
    tags = conn.execute("SELECT name FROM tags ORDER BY name").fetchall()
    return [dict(t) for t in tiers], [c["name"] for c in categories], [tg["name"] for tg in tags]


def _extract_from_pdf(file_path: str, conn, on_progress=None) -> tuple[list[dict], dict, int]:
    """Send raw PDF to Gemini — extracts, categorizes, and detects transfers in one call."""
    if on_progress:
        on_progress("Sending PDF to Gemini (extract + categorize)...")

    tier_defs, existing_cats, existing_tags = _get_categorization_context(conn)

    pdf_bytes = open(file_path, "rb").read()
    filename = str(file_path).split("/")[-1]

    result = extract_and_categorize_pdf(pdf_bytes, filename, tier_defs, existing_cats, existing_tags)

    account_metadata = result.get("account_metadata", {})
    account_metadata = {k: v for k, v in account_metadata.items() if v}
    transactions = result.get("transactions", [])

    logger.info(f"    Gemini extracted and categorized {len(transactions)} transactions from PDF")

    return transactions, account_metadata, 1


def _extract_from_csv(file_path: str, conn, on_progress=None) -> tuple[list[dict], dict, int]:
    """Send CSV text to Gemini — extracts, categorizes, and detects transfers in one call."""
    if on_progress:
        on_progress("Sending CSV to Gemini (extract + categorize)...")

    tier_defs, existing_cats, existing_tags = _get_categorization_context(conn)
    text = open(file_path, "r", errors="replace").read()

    result = extract_and_categorize_text(text, tier_defs, existing_cats, existing_tags)

    account_metadata = result.get("account_metadata", {})
    account_metadata = {k: v for k, v in account_metadata.items() if v}
    transactions = result.get("transactions", [])

    logger.info(f"    Gemini extracted and categorized {len(transactions)} transactions from CSV")

    return transactions, account_metadata, 1


def ingest_statement(statement_id: int) -> None:
    """Main ingestion pipeline: PDF/CSV → extract → Gemini → SQLite."""
    conn = get_db()
    try:
        # Get statement record
        stmt = conn.execute("SELECT * FROM statements WHERE id = ?", (statement_id,)).fetchone()
        if not stmt:
            logger.error(f"Statement {statement_id} not found")
            return

        logger.info(f"Starting ingestion for statement #{statement_id}: {stmt['filename']}")

        def update_progress(msg):
            logger.info(f"  {msg}")
            conn.execute(
                "UPDATE statements SET status = 'processing', error_message = ? WHERE id = ?",
                (msg, statement_id),
            )
            conn.commit()

        update_progress("Starting...")

        # Find the file on disk
        file_path = None
        for f in STATEMENTS_DIR.glob(f"{stmt['file_hash'][:12]}_*"):
            file_path = f
            break

        if not file_path or not file_path.exists():
            conn.execute(
                "UPDATE statements SET status = 'failed', error_message = 'File not found on disk' WHERE id = ?",
                (statement_id,),
            )
            conn.commit()
            return

        # Delete existing transactions for this statement (for re-ingestion)
        conn.execute("DELETE FROM transactions WHERE statement_id = ?", (statement_id,))
        conn.commit()

        # Extract based on file type
        filename = stmt["filename"].lower()
        if filename.endswith(".csv"):
            all_transactions, account_metadata, total_pages = _extract_from_csv(str(file_path), conn, update_progress)
        else:
            all_transactions, account_metadata, total_pages = _extract_from_pdf(str(file_path), conn, update_progress)

        update_progress(f"Extracted {len(all_transactions)} transactions, saving...")

        conn.execute(
            "UPDATE statements SET page_count = ? WHERE id = ?",
            (total_pages, statement_id),
        )
        conn.commit()

        # If no transactions were extracted, mark as failed
        if not all_transactions:
            conn.execute(
                "UPDATE statements SET status = 'failed', error_message = 'No transactions could be extracted. Check server logs for details.' WHERE id = ?",
                (statement_id,),
            )
            conn.commit()
            return

        # Update statement with period info
        if account_metadata.get("statement_period_start"):
            conn.execute(
                "UPDATE statements SET statement_period_start = ?, statement_period_end = ? WHERE id = ?",
                (account_metadata.get("statement_period_start"), account_metadata.get("statement_period_end"), statement_id),
            )

        # Auto-create or link account from metadata if statement has no account_id
        if not stmt["account_id"] and (account_metadata.get("institution") or account_metadata.get("account_number")):
            institution = account_metadata.get("institution", "")
            account_type = account_metadata.get("account_type", "checking")
            account_number = account_metadata.get("account_number")
            account_holder = account_metadata.get("account_holder")

            existing_account = None

            # Priority 1: match on account number (most reliable)
            if account_number:
                existing_account = conn.execute(
                    "SELECT id FROM accounts WHERE account_number = ?",
                    (account_number,),
                ).fetchone()

            # Priority 2: match on institution + account_type
            if not existing_account and institution:
                existing_account = conn.execute(
                    "SELECT id FROM accounts WHERE LOWER(institution) = LOWER(?) AND LOWER(account_type) = LOWER(?)",
                    (institution, account_type),
                ).fetchone()

            if existing_account:
                account_id = existing_account["id"]
                # Update account_number if we now have it but didn't before
                if account_number:
                    conn.execute(
                        "UPDATE accounts SET account_number = COALESCE(account_number, ?) WHERE id = ?",
                        (account_number, account_id),
                    )
            else:
                name = f"{institution} {account_type.title()}" if institution else f"Account {account_number or '?'}"
                cursor = conn.execute(
                    "INSERT INTO accounts (name, institution, account_type, account_number, account_holder) VALUES (?, ?, ?, ?, ?)",
                    (name, institution, account_type, account_number, account_holder),
                )
                account_id = cursor.lastrowid
                logger.info(f"  Auto-created account: {name} (number={account_number}, id={account_id})")

            conn.execute("UPDATE statements SET account_id = ? WHERE id = ?", (account_id, statement_id))
            conn.commit()
            # Update stmt reference for transaction inserts below
            stmt = conn.execute("SELECT * FROM statements WHERE id = ?", (statement_id,)).fetchone()

        # Statement-level duplicate check: same account + same/overlapping period
        if stmt["account_id"] and account_metadata.get("statement_period_start") and account_metadata.get("statement_period_end"):
            existing_stmt = conn.execute("""
                SELECT id, filename FROM statements
                WHERE account_id = ? AND statement_period_start = ? AND statement_period_end = ? AND id != ?
            """, (stmt["account_id"], account_metadata["statement_period_start"], account_metadata["statement_period_end"], statement_id)).fetchone()

            if existing_stmt:
                logger.warning(f"  Statement #{statement_id} appears to be a duplicate of #{existing_stmt['id']} ({existing_stmt['filename']}) — same account and period")
                conn.execute(
                    "UPDATE statements SET status = 'failed', error_message = ? WHERE id = ?",
                    (f"Duplicate: same account and period as '{existing_stmt['filename']}' (statement #{existing_stmt['id']}). Delete this or the original.", statement_id),
                )
                conn.commit()
                return

        # Build occurrence counters for fingerprinting
        occurrence_counts = {}

        # Build a cache of existing tiers for lookup
        tiers = conn.execute("SELECT id, name FROM spend_tiers").fetchall()
        tier_by_name = {t["name"].lower(): t["id"] for t in tiers}

        # Insert transactions with inline categorization from Gemini
        inserted = 0
        for txn in all_transactions:
            # Coerce all fields — Gemini can return unexpected types (strings for numbers, numbers for strings, etc.)
            date = str(txn.get("date") or "").strip()
            if not date:
                continue  # Skip transactions with no date
            description = str(txn.get("description_clean") or txn.get("description") or "").strip()
            description_raw = str(txn.get("description_raw") or txn.get("raw_text") or description).strip()
            try:
                raw_amount = float(txn.get("amount", 0))
            except (TypeError, ValueError):
                raw_amount = 0
            amount_cents = int(round(raw_amount * 100))
            if amount_cents == 0:
                continue  # Skip zero-amount entries (likely parsing artifacts)
            txn_type = str(txn.get("transaction_type") or "purchase")
            is_transfer_raw = txn.get("is_transfer", False)
            is_transfer = 1 if is_transfer_raw in (True, 1, "true", "True", "yes") else 0
            try:
                balance_cents = int(round(float(txn["balance"]) * 100)) if txn.get("balance") is not None else None
            except (TypeError, ValueError):
                balance_cents = None
            reference = str(txn["reference"]) if txn.get("reference") is not None else None

            # Resolve category from Gemini's response
            category_id = None
            tier_id = None
            categorization_status = "pending"
            cat_name = str(txn["category"]).strip() if txn.get("category") else None
            tier_name = str(txn["tier"]).strip() if txn.get("tier") else None

            if cat_name and not is_transfer:
                # Find or create category
                cat_row = conn.execute("SELECT id FROM categories WHERE name = ?", (cat_name,)).fetchone()
                if cat_row:
                    category_id = cat_row["id"]
                else:
                    # Auto-create as unconfirmed
                    cat_tier_id = tier_by_name.get(tier_name.lower()) if tier_name else None
                    cursor = conn.execute(
                        "INSERT INTO categories (name, default_tier_id, is_confirmed) VALUES (?, ?, 0)",
                        (cat_name, cat_tier_id),
                    )
                    category_id = cursor.lastrowid
                    logger.info(f"    Auto-created category: {cat_name}")

                # Resolve tier override (only if different from category default)
                if tier_name:
                    tid = tier_by_name.get(tier_name.lower())
                    if tid:
                        cat_default = conn.execute("SELECT default_tier_id FROM categories WHERE id = ?", (category_id,)).fetchone()
                        if cat_default and cat_default["default_tier_id"] != tid:
                            tier_id = tid

                categorization_status = "auto"

            # Compute fingerprint
            base_key = f"{date}|{amount_cents}|{normalize_description(description_raw)}|{stmt['account_id'] or 0}"
            occurrence = occurrence_counts.get(base_key, 0)
            occurrence_counts[base_key] = occurrence + 1
            fingerprint = compute_fingerprint(date, amount_cents, description_raw, stmt["account_id"], occurrence)

            # Check for cross-statement duplicates
            dup = conn.execute(
                "SELECT id, statement_id FROM transactions WHERE fingerprint = ? AND statement_id != ?",
                (fingerprint, statement_id),
            ).fetchone()

            needs_review = 1 if is_transfer else 0
            if dup:
                needs_review = 1

            cursor = conn.execute(
                """INSERT INTO transactions
                   (statement_id, account_id, date, description, description_raw, amount_cents, transaction_type,
                    balance_cents, reference, raw_text, fingerprint, is_transfer, needs_review,
                    category_id, tier_id, categorization_status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (statement_id, stmt["account_id"], date, description, description_raw, amount_cents, txn_type,
                 balance_cents, reference, description_raw, fingerprint, is_transfer, needs_review,
                 category_id, tier_id, categorization_status),
            )
            txn_db_id = cursor.lastrowid

            # Process tags from Gemini (could be list or comma-separated string)
            raw_tags = txn.get("tags") or []
            if isinstance(raw_tags, str):
                raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
            for tag_name in raw_tags:
                tag_row = conn.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)).fetchone()
                if tag_row:
                    tag_id_val = tag_row["id"]
                else:
                    tag_color = _generate_tag_color(conn)
                    tag_cursor = conn.execute(
                        "INSERT INTO tags (name, color, is_confirmed) VALUES (?, ?, 0)", (tag_name, tag_color)
                    )
                    tag_id_val = tag_cursor.lastrowid
                    logger.info(f"    Auto-created tag: {tag_name}")
                conn.execute(
                    "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
                    (txn_db_id, tag_id_val),
                )

            inserted += 1

        conn.commit()

        # Update statement as completed
        conn.execute(
            """UPDATE statements SET
               status = 'completed',
               error_message = NULL,
               transaction_count = ?,
               processed_at = datetime('now')
               WHERE id = ?""",
            (inserted, statement_id),
        )
        conn.commit()

        # Increment data revision so sandboxes know data changed
        from backend.services.sandbox import increment_data_revision
        increment_data_revision()
        logger.info(f"Statement {statement_id}: extracted {inserted} transactions from {total_pages} pages")

    except Exception as e:
        logger.error(f"Ingestion failed for statement {statement_id}: {e}")
        try:
            conn.execute(
                "UPDATE statements SET status = 'failed', error_message = ? WHERE id = ?",
                (str(e)[:500], statement_id),
            )
            conn.commit()
        except Exception:
            pass
    finally:
        conn.close()
