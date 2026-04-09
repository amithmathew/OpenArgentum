import json
import logging
import google.auth
from google import genai
from google.genai import types
from backend.config import get_active_model

logger = logging.getLogger(__name__)

_client = None

SYSTEM_PROMPT = """You are a precise financial document parser and categorizer. Extract every transaction from bank statements and categorize them.

## Extraction Rules
- Extract ALL transactions. Do not skip any. Do not summarize or aggregate.
- Dates must be in YYYY-MM-DD format. Infer the year from the statement period if dates only show month/day.
- For amounts: use SIGNED values. Negative = money out (purchases, payments, fees, withdrawals). Positive = money in (deposits, refunds, credits).
- CRITICAL: Pay close attention to which column an amount appears in. Bank statements typically have separate "Withdrawals/Debits" and "Deposits/Credits" columns. Amounts in the withdrawal column are NEGATIVE. Amounts in the deposit column are POSITIVE. Do NOT guess — use the column position.
- For credit card statements: purchases/charges are NEGATIVE. Payments to the card are POSITIVE.
- "description_raw": the transaction description EXACTLY as it appears on the statement. Preserve verbatim including abbreviations, formatting, reference numbers, capitalization.
- "description_clean": a human-friendly cleaned version — proper merchant/payee name, abbreviations expanded where obvious.
- Include balance if shown. Include reference/check numbers if shown.
- Do NOT include summary lines, totals, opening/closing balance rows, interest rate info, or non-transaction rows.
- Each transaction should appear EXACTLY ONCE.

## Transfer Detection
- Set "is_transfer" to true for inter-account transfers: credit card payments (from checking), autopay, account-to-account transfers, wire transfers between own accounts.
- Do NOT mark merchant purchases or Venmo/Zelle payments to other people as transfers.

## Categorization Rules
- Assign each non-transfer transaction a "category" and "tier" from the provided lists.
- STRONGLY prefer existing category names. Only suggest a new category name when NO existing one fits.
- Category names should be concise and consistent (e.g., "Groceries", "Dining Out", "Rent", "Utilities").
- Tier assignment should be based on the tier descriptions provided.
- For transfer transactions, set category and tier to null.
- For income/credit transactions (positive amounts), use categories like "Income", "Refund", or "Interest".

## Tagging Rules
- Assign zero or more tags to each non-transfer transaction.
- Tags are for specific merchants, programs, people, or contexts (e.g., "Piano", "Kumon", "kids", "recurring").
- STRONGLY prefer existing tag names. Only suggest a new tag when no existing one fits.
- Tags complement categories — use them for granularity within a category or cross-cutting labels across categories.
- For transfer transactions, set tags to an empty array.
- NEVER create tags from card numbers, account numbers, reference numbers, or other identifiers (e.g., "Card 0478", "Card 7810", "Ref 12345"). Account information is tracked separately.
- Tags should be meaningful semantic labels, not raw data extracted from the statement. If a transaction has no meaningful tag, use an empty array rather than inventing one."""


def get_client() -> genai.Client:
    global _client
    if _client is None:
        from backend.config import get_gemini_api_key, get_config_value

        # Priority 1: API key from config or env
        api_key = get_gemini_api_key()
        if api_key:
            _client = genai.Client(api_key=api_key)
            return _client

        # Priority 2: ADC (Vertex AI)
        try:
            credentials, project = google.auth.default()
            gcp_project = get_config_value("gcp_project") or project
            _client = genai.Client(
                vertexai=True,
                project=gcp_project,
                location="us-central1",
            )
        except google.auth.exceptions.DefaultCredentialsError:
            # Last resort: try without any auth (will fail on API call)
            _client = genai.Client()
    return _client


def _friendly_error(e: Exception) -> str:
    """Convert raw exceptions into user-friendly error messages."""
    msg = str(e).lower()

    if any(k in msg for k in ["connectionerror", "connection refused", "name resolution", "nodename nor servname",
                               "network is unreachable", "timed out", "timeout", "dns", "resolve"]):
        return "No internet connection. Ingestion and AI features require an active internet connection."

    if any(k in msg for k in ["api key", "invalid key", "permission denied", "403", "401", "unauthenticated"]):
        return "LLM authentication failed. Check your API key or GCP credentials in Settings."

    if "429" in msg or "resource exhausted" in msg or "rate limit" in msg:
        return "Rate limit reached. Please wait a moment and try again."

    if "quota" in msg:
        return "API quota exceeded. Check your Gemini API usage limits."

    if "model" in msg and ("not found" in msg or "404" in msg):
        return "AI model not available. Check your Gemini model configuration."

    return f"AI service error: {str(e)[:200]}"


def _parse_response(response, context: str) -> dict:
    """Parse Gemini JSON response with error handling. Attempts to salvage truncated responses."""
    text = response.text
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"JSON parse failed for {context}, attempting to salvage truncated response...")
        # Try to fix truncated JSON by closing open arrays/objects
        salvaged = _try_salvage_json(text)
        if salvaged:
            logger.info(f"Salvaged {len(salvaged.get('transactions', []))} transactions from truncated response")
            return salvaged
        logger.error(f"Failed to parse or salvage Gemini response ({context})")
        logger.error(f"Raw response: {text[:500]}")
        result = {"account_metadata": {}, "transactions": []}
    return result


def _try_salvage_json(text: str) -> dict | None:
    """Attempt to salvage a truncated JSON response by finding complete transaction objects."""
    try:
        # Find the transactions array start
        idx = text.find('"transactions"')
        if idx == -1:
            return None

        # Find the opening bracket of the array
        bracket_idx = text.find('[', idx)
        if bracket_idx == -1:
            return None

        # Try to extract account_metadata from the beginning
        account_metadata = {}
        try:
            meta_start = text.find('"account_metadata"')
            if meta_start != -1:
                # Find the object boundaries
                obj_start = text.find('{', meta_start)
                obj_end = text.find('}', obj_start)
                if obj_start != -1 and obj_end != -1:
                    meta_json = text[obj_start:obj_end + 1]
                    account_metadata = json.loads(meta_json)
        except Exception:
            pass

        # Extract complete transaction objects by finding matched braces
        transactions = []
        i = bracket_idx + 1
        while i < len(text):
            # Find next opening brace
            start = text.find('{', i)
            if start == -1:
                break

            # Find matching closing brace
            depth = 0
            end = start
            for j in range(start, len(text)):
                if text[j] == '{':
                    depth += 1
                elif text[j] == '}':
                    depth -= 1
                    if depth == 0:
                        end = j
                        break

            if depth != 0:
                # Incomplete object — stop here
                break

            try:
                txn = json.loads(text[start:end + 1])
                transactions.append(txn)
            except json.JSONDecodeError:
                pass

            i = end + 1

        if transactions:
            return {"account_metadata": account_metadata, "transactions": transactions}

    except Exception:
        pass

    return None


def _build_categorization_context(tier_definitions: list[dict] | None = None, existing_categories: list[str] | None = None, existing_tags: list[str] | None = None) -> str:
    """Build the categorization context section of the prompt."""
    parts = []
    if tier_definitions:
        tier_lines = "\n".join(f"- {t['name']}: {t.get('description', '')}" for t in tier_definitions)
        parts.append(f"## Spend Tiers\n{tier_lines}")
    if existing_categories:
        parts.append(f"## Existing Categories\n{', '.join(existing_categories)}")
    else:
        parts.append("## Existing Categories\nNone yet — suggest appropriate category names.")
    if existing_tags:
        parts.append(f"## Existing Tags\n{', '.join(existing_tags)}")
    else:
        parts.append("## Existing Tags\nNone yet — suggest appropriate tags for granularity (merchants, programs, people, contexts).")
    return "\n\n".join(parts)


def extract_and_categorize_pdf(
    pdf_bytes: bytes,
    filename: str = "statement.pdf",
    tier_definitions: list[dict] | None = None,
    existing_categories: list[str] | None = None,
    existing_tags: list[str] | None = None,
) -> dict:
    """Send raw PDF to Gemini — extracts transactions, categorizes, and detects transfers in one call."""
    client = get_client()

    cat_context = _build_categorization_context(tier_definitions, existing_categories, existing_tags)

    user_prompt = f"""Extract all transactions from this bank statement PDF, categorize each one, and detect transfers.

{cat_context}

Also extract account metadata visible on the statement:
- institution (bank name)
- account_type (checking, savings, credit, line_of_credit, investment)
- account_number (full or partial as shown)
- account_holder (name if shown)
- statement_period_start (YYYY-MM-DD)
- statement_period_end (YYYY-MM-DD)

Return JSON:
{{
  "account_metadata": {{
    "institution": "string or null",
    "account_type": "string or null",
    "account_number": "string or null",
    "account_holder": "string or null",
    "statement_period_start": "string or null",
    "statement_period_end": "string or null"
  }},
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "description_raw": "exact text from statement",
      "description_clean": "cleaned merchant/payee name",
      "amount": -12.34,
      "transaction_type": "purchase|payment|fee|refund|income|transfer",
      "balance": null,
      "reference": null,
      "is_transfer": false,
      "category": "category name or null for transfers",
      "tier": "tier name or null for transfers",
      "tags": ["tag1", "tag2"]
    }}
  ]
}}"""

    pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")

    try:
        response = client.models.generate_content(
            model=get_active_model("document"),
            contents=[pdf_part, user_prompt],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=65536,
            ),
        )
    except Exception as e:
        error_msg = _friendly_error(e)
        logger.error(f"Gemini API call failed for PDF {filename}: {error_msg}")
        raise RuntimeError(error_msg) from e

    return _parse_response(response, f"PDF: {filename}")


def extract_and_categorize_text(
    text: str,
    tier_definitions: list[dict] | None = None,
    existing_categories: list[str] | None = None,
    existing_tags: list[str] | None = None,
) -> dict:
    """Send text (CSV content) to Gemini — extracts, categorizes, detects transfers in one call."""
    client = get_client()

    cat_context = _build_categorization_context(tier_definitions, existing_categories, existing_tags)

    user_prompt = f"""Extract all transactions from this bank statement data, categorize each one, and detect transfers.

{cat_context}

Also extract any account metadata if visible:
- institution, account_type, account_number, account_holder, statement_period_start, statement_period_end

---
{text}
---

Return JSON:
{{
  "account_metadata": {{
    "institution": "string or null",
    "account_type": "string or null",
    "account_number": "string or null",
    "account_holder": "string or null",
    "statement_period_start": "string or null",
    "statement_period_end": "string or null"
  }},
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "description_raw": "exact text from statement",
      "description_clean": "cleaned merchant/payee name",
      "amount": -12.34,
      "transaction_type": "purchase|payment|fee|refund|income|transfer",
      "balance": null,
      "reference": null,
      "is_transfer": false,
      "category": "category name or null for transfers",
      "tier": "tier name or null for transfers",
      "tags": ["tag1", "tag2"]
    }}
  ]
}}"""

    try:
        response = client.models.generate_content(
            model=get_active_model("document"),
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=65536,
            ),
        )
    except Exception as e:
        error_msg = _friendly_error(e)
        logger.error(f"Gemini API call failed for CSV/text: {error_msg}")
        raise RuntimeError(error_msg) from e

    return _parse_response(response, "CSV/text")
