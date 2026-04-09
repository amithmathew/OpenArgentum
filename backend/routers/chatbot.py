import json
import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from google.genai import types

from backend.database import get_db
from backend.services.gemini_client import get_client
from backend.services.chat_tools import execute_tool, TOOL_DESCRIPTIONS
from backend.services.mutations import propose_mutation
from backend.config import get_active_model

logger = logging.getLogger(__name__)

# Max size for storing full tool results (bytes of JSON). Larger results get summarized.
TOOL_RESULT_SIZE_CAP = 4096


def _summarize_tool_result(tool_name, result):
    """Create a rich summary of a tool result that exceeds the size cap."""
    raw = json.dumps(result)
    if len(raw) <= TOOL_RESULT_SIZE_CAP:
        return result  # Small enough to store verbatim

    summary = {"_summarized": True, "original_size": len(raw)}

    if isinstance(result, dict):
        # Preserve scalar fields, summarize lists
        for k, v in result.items():
            if isinstance(v, list):
                summary[f"{k}_count"] = len(v)
                if v and isinstance(v[0], dict):
                    summary[f"{k}_columns"] = list(v[0].keys())
                    summary[f"{k}_sample"] = v[:5]  # Top 5 rows
                elif v:
                    summary[f"{k}_sample"] = v[:10]
            elif isinstance(v, (str, int, float, bool, type(None))):
                summary[k] = v
            elif isinstance(v, dict):
                summary[k] = v  # Keep nested dicts (usually small metadata)
    else:
        summary["type"] = type(result).__name__
        summary["preview"] = raw[:500]

    return summary

router = APIRouter()


# --- Pydantic models ---

class SendMessageRequest(BaseModel):
    message: str

class UpdateSessionRequest(BaseModel):
    title: str


# --- Gemini tool declarations ---

TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="query_transactions",
        description="Search and filter transactions. Use this to find specific transactions matching criteria.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "date_from": types.Schema(type="STRING", description="Start date (YYYY-MM-DD)"),
                "date_to": types.Schema(type="STRING", description="End date (YYYY-MM-DD)"),
                "categories": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter by category names"),
                "tiers": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter by tier names"),
                "account_id": types.Schema(type="INTEGER", description="Filter by account ID (if known)"),
                "account_name": types.Schema(type="STRING", description="Filter by account name or institution name"),
                "search_text": types.Schema(type="STRING", description="Search in transaction descriptions"),
                "is_transfer": types.Schema(type="BOOLEAN", description="Filter transfers only"),
                "min_amount_cents": types.Schema(type="INTEGER", description="Minimum amount in cents (negative for expenses)"),
                "max_amount_cents": types.Schema(type="INTEGER", description="Maximum amount in cents"),
                "categorization_status": types.Schema(type="STRING", description="Filter by categorization status: 'pending', 'auto', or 'manual'"),
                "uncategorized": types.Schema(type="BOOLEAN", description="If true, return only transactions with no category assigned"),
                "limit": types.Schema(type="INTEGER", description="Max results to return (default 25)"),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="aggregate_spending",
        description="Get spending totals grouped by category, tier, month, account, or day.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "group_by": types.Schema(type="STRING", description="Group by: category, tier, month, account, or day"),
                "date_from": types.Schema(type="STRING", description="Start date (YYYY-MM-DD)"),
                "date_to": types.Schema(type="STRING", description="End date (YYYY-MM-DD)"),
                "include_transfers": types.Schema(type="BOOLEAN", description="Include transfer transactions"),
                "categories": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter to specific category names"),
                "tiers": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter to specific tier names"),
                "tags": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter to specific tag names"),
                "account_id": types.Schema(type="INTEGER", description="Filter to specific account ID"),
                "search_text": types.Schema(type="STRING", description="Search in transaction descriptions"),
            },
            required=["group_by"],
        ),
    ),
    types.FunctionDeclaration(
        name="compare_periods",
        description="Compare spending between two time periods.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "period1_start": types.Schema(type="STRING", description="Period 1 start date"),
                "period1_end": types.Schema(type="STRING", description="Period 1 end date"),
                "period2_start": types.Schema(type="STRING", description="Period 2 start date"),
                "period2_end": types.Schema(type="STRING", description="Period 2 end date"),
                "group_by": types.Schema(type="STRING", description="Optional: group comparison by category or tier"),
            },
            required=["period1_start", "period1_end", "period2_start", "period2_end"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_summary",
        description="Get an overall financial summary: total income, spending, net, top categories, top merchants.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "date_from": types.Schema(type="STRING", description="Start date (YYYY-MM-DD)"),
                "date_to": types.Schema(type="STRING", description="End date (YYYY-MM-DD)"),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="generate_chart",
        description="Generate a chart for the user. Use this when the user asks for a visual breakdown or comparison.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "chart_type": types.Schema(type="STRING", description="Chart type: bar, line, or pie"),
                "title": types.Schema(type="STRING", description="Chart title"),
                "data": types.Schema(
                    type="ARRAY",
                    items=types.Schema(
                        type="OBJECT",
                        properties={
                            "label": types.Schema(type="STRING"),
                            "value": types.Schema(type="NUMBER"),
                            "color": types.Schema(type="STRING", description="Optional hex color"),
                        },
                        required=["label", "value"],
                    ),
                    description="Data points for the chart",
                ),
            },
            required=["chart_type", "title", "data"],
        ),
    ),
    types.FunctionDeclaration(
        name="navigate_to_transactions",
        description="Open the transactions page with specific filters applied. Use when user asks to 'show me' or 'open' transactions.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "date_from": types.Schema(type="STRING", description="Filter start date"),
                "date_to": types.Schema(type="STRING", description="Filter end date"),
                "category_name": types.Schema(type="STRING", description="Filter by category name (e.g., 'Groceries')"),
                "tier_name": types.Schema(type="STRING", description="Filter by tier name (e.g., 'Essential')"),
                "account_id": types.Schema(type="INTEGER", description="Filter by account ID (if known)"),
                "account_name": types.Schema(type="STRING", description="Filter by account name or institution name"),
                "search": types.Schema(type="STRING", description="Search text filter"),
                "is_transfer": types.Schema(type="BOOLEAN", description="Filter transfers"),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="propose_bulk_tag",
        description="Propose tagging transactions. Finds matching transactions and creates a proposal for user approval.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "tag_name": types.Schema(type="STRING", description="Tag to apply"),
                "transaction_ids": types.Schema(type="ARRAY", items=types.Schema(type="INTEGER"), description="Specific transaction IDs to tag"),
                "date_from": types.Schema(type="STRING", description="Filter: start date"),
                "date_to": types.Schema(type="STRING", description="Filter: end date"),
                "categories": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter: category names"),
                "account_id": types.Schema(type="INTEGER", description="Filter: account ID (if known)"),
                "account_name": types.Schema(type="STRING", description="Filter: account name or institution"),
                "search_text": types.Schema(type="STRING", description="Filter: search in descriptions"),
                "min_amount_cents": types.Schema(type="INTEGER", description="Filter: minimum amount"),
                "max_amount_cents": types.Schema(type="INTEGER", description="Filter: maximum amount"),
                "is_transfer": types.Schema(type="BOOLEAN", description="Filter: transfers only"),
            },
            required=["tag_name"],
        ),
    ),
    types.FunctionDeclaration(
        name="propose_bulk_recategorize",
        description="Propose changing the category of transactions. Creates a proposal for user approval.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "category_name": types.Schema(type="STRING", description="New category name"),
                "tier_name": types.Schema(type="STRING", description="Optional: new tier name"),
                "transaction_ids": types.Schema(type="ARRAY", items=types.Schema(type="INTEGER"), description="Specific transaction IDs"),
                "date_from": types.Schema(type="STRING"),
                "date_to": types.Schema(type="STRING"),
                "categories": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter by current category names"),
                "search_text": types.Schema(type="STRING"),
                "min_amount_cents": types.Schema(type="INTEGER"),
                "max_amount_cents": types.Schema(type="INTEGER"),
            },
            required=["category_name"],
        ),
    ),
    types.FunctionDeclaration(
        name="propose_mark_transfer",
        description="Propose marking or unmarking transactions as transfers.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "is_transfer": types.Schema(type="BOOLEAN", description="True to mark as transfer, false to unmark"),
                "transaction_ids": types.Schema(type="ARRAY", items=types.Schema(type="INTEGER")),
                "date_from": types.Schema(type="STRING"),
                "date_to": types.Schema(type="STRING"),
                "search_text": types.Schema(type="STRING"),
            },
            required=["is_transfer"],
        ),
    ),
    types.FunctionDeclaration(
        name="propose_assign_project",
        description="Propose assigning transactions to a project. Use search_text to find transactions by description.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "project_name": types.Schema(type="STRING", description="Project name"),
                "transaction_ids": types.Schema(type="ARRAY", items=types.Schema(type="INTEGER"), description="Specific transaction IDs to assign"),
                "date_from": types.Schema(type="STRING", description="Filter: start date"),
                "date_to": types.Schema(type="STRING", description="Filter: end date"),
                "categories": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Filter: category names"),
                "account_id": types.Schema(type="INTEGER", description="Filter: account ID (if known)"),
                "account_name": types.Schema(type="STRING", description="Filter: account name or institution"),
                "search_text": types.Schema(type="STRING", description="Filter: search in transaction descriptions"),
                "min_amount_cents": types.Schema(type="INTEGER", description="Filter: minimum amount"),
                "max_amount_cents": types.Schema(type="INTEGER", description="Filter: maximum amount"),
            },
            required=["project_name"],
        ),
    ),
    types.FunctionDeclaration(
        name="propose_create_category",
        description="Propose creating a new spending category.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"name": types.Schema(type="STRING", description="Category name")},
            required=["name"],
        ),
    ),
    types.FunctionDeclaration(
        name="propose_create_tag",
        description="Propose creating a new tag.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "name": types.Schema(type="STRING", description="Tag name"),
                "color": types.Schema(type="STRING", description="Hex color for the tag"),
            },
            required=["name"],
        ),
    ),
    types.FunctionDeclaration(
        name="propose_create_project",
        description="Propose creating a new project.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "name": types.Schema(type="STRING", description="Project name"),
                "description": types.Schema(type="STRING", description="Project description"),
                "budget_target_cents": types.Schema(type="INTEGER", description="Budget target in cents"),
            },
            required=["name"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_transaction_notes",
        description="Get all notes attached to a specific transaction. Use when discussing a transaction to see user-added context.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "transaction_id": types.Schema(type="INTEGER", description="The transaction ID to get notes for"),
            },
            required=["transaction_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="search_transaction_notes",
        description="Search across all transaction notes for specific text. Use when the user asks about context they've recorded, e.g. 'which transactions did I split with someone?' or 'find my notes about rental car'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "query": types.Schema(type="STRING", description="Text to search for in notes"),
                "author_type": types.Schema(type="STRING", description="Filter by author: 'user' or 'aurelia'. Defaults to all."),
                "date_from": types.Schema(type="STRING", description="Filter by transaction date start (YYYY-MM-DD)"),
                "date_to": types.Schema(type="STRING", description="Filter by transaction date end (YYYY-MM-DD)"),
                "account_id": types.Schema(type="INTEGER", description="Filter by account ID"),
                "account_name": types.Schema(type="STRING", description="Filter by account name or institution"),
                "limit": types.Schema(type="INTEGER", description="Max results (default 30)"),
            },
            required=["query"],
        ),
    ),
    types.FunctionDeclaration(
        name="add_transaction_note",
        description="Add a note to a transaction. Use ONLY when the user explicitly asks you to record or note something on a transaction. Do not add notes automatically.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "transaction_id": types.Schema(type="INTEGER", description="The transaction ID to add a note to"),
                "content": types.Schema(type="STRING", description="The note content to add"),
            },
            required=["transaction_id", "content"],
        ),
    ),
    types.FunctionDeclaration(
        name="run_analysis_query",
        description="Run a SQL query on your private analysis sandbox database. This is a full copy of the main database where you can run complex queries, create temporary tables, use CTEs, etc. Use this for multi-step analysis that can't be done with the other tools. The sandbox is isolated — you cannot modify the main database from here.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "sql": types.Schema(type="STRING", description="SQL query to execute. Can be SELECT, CREATE TEMP TABLE, or any read/analysis query. Results are limited to 500 rows."),
            },
            required=["sql"],
        ),
    ),
]


def _build_system_prompt():
    """Build dynamic system prompt with current DB context."""
    conn = get_db()
    try:
        categories = conn.execute("SELECT name FROM categories ORDER BY name").fetchall()
        tiers = conn.execute("SELECT name, description FROM spend_tiers ORDER BY sort_order").fetchall()
        accounts = conn.execute("SELECT id, name, institution, account_type FROM accounts ORDER BY name").fetchall()
        tags = conn.execute("SELECT name FROM tags ORDER BY name").fetchall()
        projects = conn.execute("SELECT id, name, budget_target_cents FROM projects WHERE is_archived = 0 ORDER BY name").fetchall()

        cat_list = ", ".join(c["name"] for c in categories) if categories else "None yet"
        tier_list = "\n".join(f"  - {t['name']}: {t['description']}" for t in tiers) if tiers else "  None yet"
        acct_list = "\n".join(f"  - ID {a['id']}: {a['name']} ({a['institution']} {a['account_type']})" for a in accounts) if accounts else "  None yet"
        tag_list = ", ".join(t["name"] for t in tags) if tags else "None yet"
        proj_list = "\n".join(f"  - ID {p['id']}: {p['name']}" + (f" (budget: ${p['budget_target_cents']/100:,.0f})" if p['budget_target_cents'] else "") for p in projects) if projects else "  None yet"

        return f"""You are Aurelia, a personal finance assistant for OpenArgentum. You are warm, analytical, and concise.
You help the user analyze spending, find transactions, compare periods, create charts, and manage their financial data.

IDENTITY:
- Do NOT introduce yourself or say "Aurelia here" in the middle of a conversation. The user already knows who you are.
- ONLY introduce yourself on the very first message of a brand new session (when there is no prior conversation history). In that case, give a brief, friendly intro of what you can do.
- In all subsequent messages, just answer directly without preamble.

AVAILABLE CATEGORIES: {cat_list}

SPEND TIERS:
{tier_list}

TAGS: {tag_list}

ACCOUNTS:
{acct_list}

PROJECTS:
{proj_list}

SEARCH STRATEGY:
- When the user's request is vague or conceptual (e.g., "find my China trip expenses", "what did I spend on home renovation"), THINK STEP-BY-STEP before searching:
  1. What keywords might appear in transaction descriptions or raw descriptions? Think broadly — merchant names, locations, currencies (CNY, EUR), airline names, hotel chains, etc.
  2. What date ranges are plausible?
  3. What categories or accounts might be relevant?
  4. Run MULTIPLE targeted searches with different keywords rather than one broad search. Cast a wide net.
- The `description_raw` field contains the original bank statement text, which often has more detail than the cleaned `description`. Use `search_text` to search both.
- **Transaction notes are also searched** by `search_text`. Users add notes like "hotel booking in London" or "split with John" to transactions. If a description search fails, the note might have the context the user is looking for.
- If a text search returns no results, ALSO try search_transaction_notes to search notes specifically — this can find context the user recorded that isn't in the bank description.
- For trip-related queries, think about: flights (airline names), hotels, restaurants, currency exchanges, ATM withdrawals, taxi/ride services, and any location-specific merchants.

RULES:
- All amounts in the database are in CENTS. Divide by 100 when showing to the user (e.g., 12345 cents = $123.45).
- Negative amounts = expenses/outflows. Positive amounts = income/inflows.
- Use the tools to query actual data. NEVER make up or estimate numbers.
- When the user asks to "show" or "open" or "view" transactions, use navigate_to_transactions. This creates a clickable link for the user — it does NOT automatically open the page. Say something like "Here's a link to view those transactions" not "I've opened the page".
- Use generate_chart for visual answers — prefer charts for breakdowns and comparisons.
- IMPORTANT: When you call generate_chart, the chart will be rendered visually in the UI. Do NOT include the chart JSON data in your text response. Just describe what the chart shows in natural language.
- Lead with the answer, then provide supporting details.
- FORMATTING: When presenting multiple data points (transactions, categories, comparisons, breakdowns), ALWAYS use markdown tables, not bullet lists. Tables are rendered beautifully in the UI. Include all relevant columns (date, description, amount, category, account, etc.) — don't omit details to save space. The user wants thorough, complete information.
- Today's date is {date.today().isoformat()}.
- When the user mentions relative dates like "last month" or "this year", calculate the actual dates.

MUTATIONS:
- You can propose changes to the database using the propose_* tools. These create proposals that the user must approve before execution.
- When the user asks to tag, categorize, mark transfers, create entities, or assign projects, use the appropriate propose_* tool.
- The proposal will show affected transactions for user review. The user approves or rejects via UI buttons.
- After a proposal is created, tell the user what you've proposed and that they need to approve it. Do NOT assume it will be automatically executed.
- Use existing category/tag/project names when possible. Only propose creating new ones when no existing option fits.

TRANSACTION NOTES:
- Transactions can have notes — user-written context like "split with John" or "business dinner with Acme Corp".
- Use get_transaction_notes to read notes when discussing a specific transaction.
- Use search_transaction_notes to find transactions by note content (e.g. "which transactions mention John?").
- Use add_transaction_note ONLY when the user explicitly asks you to record or note something. NEVER add notes automatically.
- When search results include notes, mention the note content to the user so they know what was found.

ANALYSIS SANDBOX:
- You have access to a private analysis sandbox via the run_analysis_query tool.
- This is a full copy of the main database where you can run ANY SQL — complex JOINs, CTEs, CREATE TEMP TABLE, subqueries, window functions, etc.
- Use the sandbox for multi-step analysis: create temp tables to stage intermediate results, then query them.
- The sandbox is isolated — nothing you do there affects the main database.
- The sandbox auto-refreshes when the main data changes. If your temp tables disappear, re-create them using the SQL from your conversation history.
- KEY TABLES: transactions (date, description, description_raw, amount_cents, category_id, tier_id, account_id, is_transfer), categories (id, name), spend_tiers (id, name), accounts (id, name, institution), tags (id, name), transaction_tags (transaction_id, tag_id), projects (id, name), transaction_projects (transaction_id, project_id), transaction_notes (id, transaction_id, author_type, content, created_at)
- Prefer the sandbox for complex analysis over the simpler read-only tools when the question requires multiple steps or intermediate state.

BEHAVIOR:
- Think like a financial analyst, not a data retrieval tool. When the user makes an observation or expresses concern, INVESTIGATE the cause — don't just confirm what they already know.
- If spending seems low for a period: check transaction counts vs other months, check which categories dropped, check if any accounts have gaps in data (missing statements).
- If spending seems high: identify what drove it — which categories increased, any large one-off transactions.
- Always look for the "why" behind the numbers. Compare against other periods, break down by category, flag anomalies.
- Proactively surface insights: unusual transactions, significant changes, missing data patterns.
- When you find something noteworthy, explain it clearly and suggest what the user might want to investigate further."""
    finally:
        conn.close()


def _load_history(session_id, limit=200):
    """Load chat history as Gemini SDK Content objects, including tool call/response pairs."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT role, content, tool_history FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        history = []
        for row in rows:
            if row["role"] == "user":
                history.append(types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=row["content"])],
                ))
            else:
                # Assistant message — reconstruct tool call/response pairs then final text
                tool_hist = None
                if row["tool_history"]:
                    try:
                        tool_hist = json.loads(row["tool_history"])
                    except json.JSONDecodeError:
                        pass

                if tool_hist:
                    for round_data in tool_hist:
                        # Model turn: FunctionCall parts
                        fc_parts = []
                        for call in round_data.get("calls", []):
                            fc_parts.append(types.Part.from_function_call(
                                name=call["name"],
                                args=call.get("args", {}),
                            ))
                        if fc_parts:
                            history.append(types.Content(role="model", parts=fc_parts))

                        # User turn: FunctionResponse parts
                        fr_parts = []
                        for resp in round_data.get("responses", []):
                            fr_parts.append(types.Part.from_function_response(
                                name=resp["name"],
                                response=resp.get("result", {}),
                            ))
                        if fr_parts:
                            history.append(types.Content(role="user", parts=fr_parts))

                # Final text response from the model
                if row["content"]:
                    history.append(types.Content(
                        role="model",
                        parts=[types.Part.from_text(text=row["content"])],
                    ))
        return history
    finally:
        conn.close()


# --- Session endpoints ---

@router.get("/sessions")
def list_sessions():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM chat_sessions ORDER BY updated_at DESC").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("/sessions", status_code=201)
def create_session():
    conn = get_db()
    try:
        cursor = conn.execute("INSERT INTO chat_sessions (title) VALUES ('New Chat')")
        conn.commit()
        row = conn.execute("SELECT * FROM chat_sessions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.put("/sessions/{session_id}")
def update_session(session_id: int, req: UpdateSessionRequest):
    conn = get_db()
    try:
        conn.execute("UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?", (req.title, session_id))
        conn.commit()
        row = conn.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        return dict(row)
    finally:
        conn.close()


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int):
    conn = get_db()
    try:
        conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        conn.commit()
    finally:
        conn.close()
    # Clean up associated sandbox
    from backend.services.sandbox import cleanup_sandbox
    cleanup_sandbox(session_id)


@router.get("/sessions/{session_id}/messages")
def get_messages(session_id: int):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
        messages = []
        for r in rows:
            msg = dict(r)
            msg.pop("tool_history", None)  # Internal field, not needed by frontend
            if msg["metadata"]:
                try:
                    msg["metadata"] = json.loads(msg["metadata"])
                except json.JSONDecodeError:
                    msg["metadata"] = {}
            else:
                msg["metadata"] = {}
            # Hydrate proposal statuses from the mutation_proposals table
            if msg["metadata"].get("proposals"):
                for p in msg["metadata"]["proposals"]:
                    if p.get("mutation_id"):
                        row = conn.execute("SELECT status FROM mutation_proposals WHERE mutation_id = ?", (p["mutation_id"],)).fetchone()
                        if row:
                            p["status"] = row["status"]
            messages.append(msg)
        return messages
    finally:
        conn.close()


# --- SSE message endpoint ---

@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: int, req: SendMessageRequest, request: Request):
    """Send a message and get an SSE stream of tool status events + final response."""

    # Verify session exists
    conn = get_db()
    try:
        session = conn.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    finally:
        conn.close()

    async def event_generator():
        conn = get_db()
        try:
            # Save user message
            conn.execute(
                "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)",
                (session_id, req.message),
            )
            conn.commit()

            # Load history
            history = _load_history(session_id, limit=200)
            # Remove the last entry (the one we just saved) since we'll send it as the new message
            if history:
                history = history[:-1]

            # Build config
            system_prompt = _build_system_prompt()
            client = get_client()

            tools = [types.Tool(function_declarations=TOOL_DECLARATIONS)]
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=tools,
                temperature=0.3,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            )

            # Create chat session
            chat = client.chats.create(model=get_active_model(), config=config, history=history)

            # Send user message
            response = chat.send_message(req.message)

            # Tool loop
            tool_calls_made = []
            tool_history_rounds = []  # Ordered list of {calls, responses} per round
            charts = []
            proposals_made = []
            navigation = None

            for round_num in range(5):
                # Check for function calls
                function_calls = []
                if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                    for part in response.candidates[0].content.parts:
                        if part.function_call:
                            function_calls.append(part.function_call)

                if not function_calls:
                    break

                # Track this round's calls and responses for history
                round_calls = []
                round_responses = []

                # Execute each tool
                response_parts = []
                for fc in function_calls:
                    tool_name = fc.name
                    tool_args = dict(fc.args) if fc.args else {}

                    # Record the call
                    round_calls.append({"name": tool_name, "args": tool_args})

                    # Yield status event
                    status_text = TOOL_DESCRIPTIONS.get(tool_name, f"Running {tool_name}...")
                    yield {"data": json.dumps({"type": "status", "content": status_text})}

                    # Handle propose_* tools specially — they create mutations
                    if tool_name.startswith("propose_"):
                        intent_map = {
                            "propose_bulk_tag": "bulk_tag",
                            "propose_bulk_recategorize": "bulk_recategorize",
                            "propose_mark_transfer": "mark_transfer",
                            "propose_assign_project": "assign_project",
                            "propose_create_category": "create_category",
                            "propose_create_tag": "create_tag",
                            "propose_create_project": "create_project",
                        }
                        intent = intent_map.get(tool_name)
                        if intent:
                            proposal = propose_mutation(intent, None, tool_args, session_id)

                            # If no transactions matched, tell the LLM without showing a proposal
                            if proposal.get("error") or not proposal.get("mutation_id"):
                                result = {
                                    "status": "no_matching_transactions",
                                    "error": proposal.get("error", "No matching transactions found"),
                                    "note": "No transactions matched the filter criteria. Do NOT say a proposal was created. Tell the user no matches were found and suggest they refine their search."
                                }
                            else:
                                # Yield the proposal as a pending_approval event
                                proposal_info = {
                                    "mutation_id": proposal["mutation_id"],
                                    "intent": proposal["intent"],
                                    "title": proposal["title"],
                                    "impacted_count": proposal["impacted_count"],
                                    "sample_items": proposal["sample_items"],
                                }
                                proposals_made.append(proposal_info)
                                yield {"data": json.dumps({"type": "pending_approval", **proposal_info})}
                                result = {
                                    "status": "proposal_created_awaiting_user_approval",
                                    "mutation_id": proposal["mutation_id"],
                                    "title": proposal["title"],
                                    "impacted_count": proposal["impacted_count"],
                                    "note": "A proposal has been shown to the user with Approve/Reject buttons. Tell the user what you proposed and that they need to click Approve to execute it. Do NOT say it has been done."
                                }

                            tool_calls_made.append({"name": tool_name, "args": tool_args})
                            round_responses.append({"name": tool_name, "result": _summarize_tool_result(tool_name, result)})
                            response_parts.append(
                                types.Part.from_function_response(name=tool_name, response=result)
                            )
                            continue

                    # Handle sandbox analysis queries
                    if tool_name == "run_analysis_query":
                        from backend.services.sandbox import run_sandbox_query
                        yield {"data": json.dumps({"type": "status", "content": "Running analysis query..."})}
                        result = run_sandbox_query(session_id, tool_args.get("sql", ""))
                        if result.get("sandbox_rebuilt"):
                            yield {"data": json.dumps({"type": "status", "content": "Analysis workspace refreshed with latest data"})}
                        tool_calls_made.append({"name": tool_name, "args": {"sql": tool_args.get("sql", "")[:100] + "..."}})
                        round_responses.append({"name": tool_name, "result": _summarize_tool_result(tool_name, result)})
                        response_parts.append(
                            types.Part.from_function_response(name=tool_name, response=result)
                        )
                        continue

                    # Execute
                    result = execute_tool(tool_name, tool_args)
                    tool_calls_made.append(tool_name)

                    # Handle chart and navigation results
                    if tool_name == "generate_chart":
                        charts.append(result)
                        yield {"data": json.dumps({"type": "chart", "chart": result})}
                    elif tool_name == "navigate_to_transactions":
                        navigation = result
                        yield {"data": json.dumps({"type": "navigation", "path": result["path"], "params": result["params"]})}

                    round_responses.append({"name": tool_name, "result": _summarize_tool_result(tool_name, result)})
                    response_parts.append(
                        types.Part.from_function_response(
                            name=tool_name,
                            response=result,
                        )
                    )

                # Save this round's tool interactions
                tool_history_rounds.append({"calls": round_calls, "responses": round_responses})

                # Send all results back to Gemini
                response = chat.send_message(response_parts)

            # Extract final text
            final_text = ""
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.text:
                        final_text += part.text
                    elif hasattr(part, 'code_execution_result') and part.code_execution_result:
                        # Gemini 2.5 sometimes uses built-in code execution instead of text
                        final_text += part.code_execution_result.output or ""
                    elif hasattr(part, 'executable_code') and part.executable_code:
                        # Log but don't surface raw code to user
                        logger.info(f"Gemini returned executable_code: {part.executable_code.code[:200]}")

            if not final_text:
                # Log diagnostic info when Gemini returns no text
                finish_reason = response.candidates[0].finish_reason if response.candidates else "no_candidates"
                part_types = []
                if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                    for p in response.candidates[0].content.parts:
                        if p.text:
                            part_types.append("text")
                        elif p.function_call:
                            part_types.append(f"function_call:{p.function_call.name}")
                        elif hasattr(p, 'executable_code') and p.executable_code:
                            part_types.append(f"executable_code:{p.executable_code.code[:100]}")
                        elif hasattr(p, 'code_execution_result') and p.code_execution_result:
                            part_types.append(f"code_result:{p.code_execution_result.output[:100] if p.code_execution_result.output else 'empty'}")
                        else:
                            part_types.append(f"unknown:{type(p).__name__}")
                logger.warning(f"Gemini returned empty text. finish_reason={finish_reason}, parts={part_types}, tool_rounds={len(tool_history_rounds)}")
                # Last resort: ask Gemini to summarize what it found
                try:
                    retry_response = chat.send_message("Please summarize your findings in plain text.")
                    if retry_response.candidates and retry_response.candidates[0].content:
                        for part in retry_response.candidates[0].content.parts:
                            if part.text:
                                final_text += part.text
                except Exception as e:
                    logger.error(f"Retry for text response also failed: {e}")

            # Build metadata
            metadata = {}
            if tool_calls_made:
                metadata["tool_calls"] = tool_calls_made
            if charts:
                metadata["charts"] = charts
            if proposals_made:
                metadata["proposals"] = proposals_made
            if navigation:
                metadata["navigation"] = navigation

            # Save assistant message with tool history
            tool_history_json = json.dumps(tool_history_rounds) if tool_history_rounds else None
            cursor = conn.execute(
                "INSERT INTO chat_messages (session_id, role, content, metadata, tool_history) VALUES (?, 'assistant', ?, ?, ?)",
                (session_id, final_text, json.dumps(metadata) if metadata else None, tool_history_json),
            )
            conn.commit()

            msg_id = cursor.lastrowid

            # Generate session title on first exchange
            msg_count = conn.execute(
                "SELECT COUNT(*) FROM chat_messages WHERE session_id = ?", (session_id,)
            ).fetchone()[0]
            if msg_count <= 2:
                try:
                    title_prompt = (
                        f"Write a short title (3-6 words) for this personal finance chat.\n\n"
                        f"User asked: \"{req.message}\"\n"
                        f"Assistant replied: \"{final_text[:200]}\"\n\n"
                        f"Rules:\n"
                        f"- Must be 3-6 words, NEVER a single word\n"
                        f"- Describe the specific topic, not generic labels\n"
                        f"- Good: 'Monthly Grocery Spending Review', 'China Trip Expense Tagging', 'Dec vs Jan Comparison'\n"
                        f"- Bad: 'Spending', 'Analysis', 'Finances', 'Query'\n"
                        f"- Respond with ONLY the title, no quotes, no explanation"
                    )
                    # Use a fresh simple client call — no tools, no code execution
                    title_client = get_client()
                    title_response = title_client.models.generate_content(
                        model=get_active_model(),
                        contents=title_prompt,
                        config=types.GenerateContentConfig(
                            temperature=0.5,
                            max_output_tokens=256,  # Generous limit — Gemini 2.5 thinking can consume tokens before output
                            tools=[],
                            tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="NONE")),
                            thinking_config=types.ThinkingConfig(thinking_budget=0),  # Disable thinking for simple title task
                        ),
                    )
                    # Extract text from any part type
                    raw_title = ""
                    if title_response.candidates and title_response.candidates[0].content and title_response.candidates[0].content.parts:
                        for part in title_response.candidates[0].content.parts:
                            if part.text:
                                raw_title += part.text
                            elif hasattr(part, 'code_execution_result') and part.code_execution_result and part.code_execution_result.output:
                                raw_title += part.code_execution_result.output
                    title = raw_title.strip().strip('"\'').strip()[:60]
                    logger.debug(f"Generated session title: '{title}'")
                    # Fallback if still too short
                    if len(title.split()) < 2:
                        logger.warning(f"Title too short ('{title}'), falling back to message text")
                        title = req.message[:50] + ("..." if len(req.message) > 50 else "")
                except Exception as e:
                    logger.warning(f"Title generation failed: {type(e).__name__}: {e}")
                    title = req.message[:50] + ("..." if len(req.message) > 50 else "")
                conn.execute("UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?",
                             (title, session_id))
                conn.commit()

            # Get current session title (may have just been generated)
            session_row = conn.execute("SELECT title FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
            session_title = session_row["title"] if session_row else None

            # Yield final response
            yield {"data": json.dumps({
                "type": "response",
                "session_title": session_title,
                "message": {
                    "id": msg_id,
                    "session_id": session_id,
                    "role": "assistant",
                    "content": final_text,
                    "metadata": metadata,
                    "created_at": "",  # Will be set by DB
                },
            })}

        except Exception as e:
            logger.error(f"Chat error: {e}", exc_info=True)
            from backend.services.gemini_client import _friendly_error
            yield {"data": json.dumps({"type": "error", "error": _friendly_error(e)})}
        finally:
            conn.close()

    return EventSourceResponse(event_generator())
