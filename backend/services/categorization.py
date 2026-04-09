import json
import logging
from google.genai import types
from backend.config import get_active_model, CATEGORIZATION_BATCH_SIZE
from backend.database import get_db
from backend.services.ingestion import _generate_tag_color
from backend.services.gemini_client import get_client

logger = logging.getLogger(__name__)


def categorize_transactions(transaction_ids: list[int] | None = None, force: bool = False) -> dict:
    """Categorize transactions using Gemini LLM.

    Args:
        transaction_ids: Specific IDs to categorize, or None for all pending.
        force: If True, re-categorize even manual overrides.

    Returns:
        dict with counts: {"categorized": N, "skipped": N, "errors": N}
    """
    conn = get_db()
    try:
        # Fetch transactions to categorize
        if transaction_ids:
            placeholders = ",".join("?" * len(transaction_ids))
            query = f"SELECT * FROM transactions WHERE id IN ({placeholders})"
            params = transaction_ids
        else:
            query = "SELECT * FROM transactions WHERE categorization_status = 'pending'"
            params = []

        rows = conn.execute(query, params).fetchall()
        transactions = [dict(r) for r in rows]

        # Filter based on rules
        to_categorize = []
        skipped = 0
        for txn in transactions:
            # Skip transfers
            if txn["is_transfer"]:
                skipped += 1
                continue
            # Skip manual overrides unless forced
            if txn["categorization_status"] == "manual" and not force:
                skipped += 1
                continue
            to_categorize.append(txn)

        if not to_categorize:
            logger.info(f"Categorization: nothing to do (skipped {skipped})")
            return {"categorized": 0, "skipped": skipped, "errors": 0}

        logger.info(f"Categorizing {len(to_categorize)} transactions (skipped {skipped})")

        # Fetch current tiers, categories, and tags for context
        tiers = conn.execute("SELECT * FROM spend_tiers ORDER BY sort_order").fetchall()
        categories = conn.execute("SELECT * FROM categories").fetchall()
        tags = conn.execute("SELECT * FROM tags").fetchall()

        tier_context = "\n".join(
            f"- {t['name']}: {t['description']}" for t in tiers
        )
        existing_categories = [c["name"] for c in categories]
        category_context = ", ".join(existing_categories) if existing_categories else "None yet"
        existing_tags = [tg["name"] for tg in tags]
        tag_context = ", ".join(existing_tags) if existing_tags else "None yet"

        # Process in batches
        categorized = 0
        errors = 0

        for i in range(0, len(to_categorize), CATEGORIZATION_BATCH_SIZE):
            batch = to_categorize[i:i + CATEGORIZATION_BATCH_SIZE]
            batch_num = i // CATEGORIZATION_BATCH_SIZE + 1
            total_batches = (len(to_categorize) + CATEGORIZATION_BATCH_SIZE - 1) // CATEGORIZATION_BATCH_SIZE
            logger.info(f"  Categorizing batch {batch_num}/{total_batches} ({len(batch)} transactions)...")

            try:
                results = _categorize_batch(batch, tier_context, category_context, tag_context, [dict(t) for t in tiers])

                for result in results:
                    txn_id = result.get("transaction_id")
                    category_name = result.get("category_name", "").strip()
                    tier_name = result.get("tier_name", "").strip()

                    if not txn_id or not category_name:
                        errors += 1
                        continue

                    # Find or create category
                    cat_row = conn.execute(
                        "SELECT * FROM categories WHERE name = ?", (category_name,)
                    ).fetchone()

                    if not cat_row:
                        # Find tier ID for the suggested default
                        tier_id = None
                        for t in tiers:
                            if t["name"].lower() == tier_name.lower():
                                tier_id = t["id"]
                                break

                        cursor = conn.execute(
                            "INSERT INTO categories (name, default_tier_id, is_confirmed) VALUES (?, ?, 0)",
                            (category_name, tier_id),
                        )
                        cat_id = cursor.lastrowid
                        # Refresh categories list for subsequent batches
                        existing_categories.append(category_name)
                        category_context = ", ".join(existing_categories)
                    else:
                        cat_id = cat_row["id"]

                    # Determine tier override
                    # Only set tier_id on transaction if it differs from category default
                    tier_override = None
                    if cat_row:
                        cat_default_tier = cat_row["default_tier_id"]
                        for t in tiers:
                            if t["name"].lower() == tier_name.lower():
                                if t["id"] != cat_default_tier:
                                    tier_override = t["id"]
                                break

                    conn.execute(
                        """UPDATE transactions
                           SET category_id = ?, tier_id = ?, categorization_status = 'auto',
                               updated_at = datetime('now')
                           WHERE id = ?""",
                        (cat_id, tier_override, txn_id),
                    )

                    # Process tags from Gemini
                    for tag_name in result.get("tags") or []:
                        tag_row = conn.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)).fetchone()
                        if tag_row:
                            tag_id_val = tag_row["id"]
                        else:
                            tag_color = _generate_tag_color(conn)
                            tag_cursor = conn.execute(
                                "INSERT INTO tags (name, color, is_confirmed) VALUES (?, ?, 0)", (tag_name, tag_color)
                            )
                            tag_id_val = tag_cursor.lastrowid
                            existing_tags.append(tag_name)
                            tag_context = ", ".join(existing_tags)
                        conn.execute(
                            "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
                            (txn_id, tag_id_val),
                        )

                    categorized += 1

                conn.commit()

            except Exception as e:
                logger.error(f"Batch categorization failed: {e}")
                errors += len(batch)

        return {"categorized": categorized, "skipped": skipped, "errors": errors}

    finally:
        conn.close()


def _categorize_batch(transactions: list[dict], tier_context: str, category_context: str, tag_context: str, tiers: list[dict]) -> list[dict]:
    """Send a batch of transactions to Gemini for categorization."""
    client = get_client()

    system_prompt = f"""You are a personal finance categorization assistant. Categorize each transaction into a spending category, assign it to the appropriate spend tier, and apply relevant tags.

## Spend Tiers (ordered by priority):
{tier_context}

## Existing Categories:
{category_context}

## Existing Tags:
{tag_context}

## Rules:
- Assign each transaction exactly one category and one tier.
- STRONGLY prefer existing category names when they fit. Only suggest a new category name when NO existing one is appropriate.
- Category names should be concise and consistent (e.g., "Groceries", "Dining Out", "Rent", "Utilities", "Gas", "Subscriptions").
- Tier assignment should be based on the tier descriptions above and the nature of the transaction.
- For income/credit transactions (positive amounts), use categories like "Income", "Refund", or "Interest".
- Assign zero or more tags to each transaction for granularity (specific merchants, programs, people, contexts).
- STRONGLY prefer existing tag names. Only suggest a new tag when no existing one fits.
- NEVER create tags from card numbers, account numbers, or reference numbers (e.g., "Card 0478"). Use meaningful semantic labels only.
- If a transaction has no meaningful tag, use an empty array.
- Consider the transaction description, amount, and type when making decisions.
- Return the transaction_id exactly as provided."""

    txn_list = [
        {
            "transaction_id": t["id"],
            "description": t["description"],
            "amount_cents": t["amount_cents"],
            "transaction_type": t["transaction_type"],
            "date": t["date"],
        }
        for t in transactions
    ]

    user_prompt = f"""Categorize these transactions:

{json.dumps(txn_list, indent=2)}

Return a JSON array where each element has:
- "transaction_id": the exact ID from the input
- "category_name": the category to assign
- "tier_name": which spend tier this belongs to
- "tags": array of tag name strings (can be empty)"""

    try:
        response = client.models.generate_content(
            model=get_active_model("document"),
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
    except Exception as e:
        from backend.services.gemini_client import _friendly_error
        raise RuntimeError(_friendly_error(e)) from e

    try:
        result = json.loads(response.text)
        # Handle both array and object-wrapped-array responses
        if isinstance(result, dict):
            result = result.get("categorizations", result.get("results", []))
        return result
    except json.JSONDecodeError:
        logger.error(f"Failed to parse categorization response: {response.text[:500]}")
        return []
