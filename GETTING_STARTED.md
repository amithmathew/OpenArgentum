# Getting Started with OpenArgentum

A step-by-step guide to setting up and using OpenArgentum for managing your personal finances.

---

## What You'll Need

1. **A computer** running macOS, Linux, or Windows (with WSL)
2. **Python 3.11 or newer** -- [Download here](https://www.python.org/downloads/) if you don't have it (3.10 is the minimum; 3.11+ is recommended)
3. **Node.js 20.19 or newer** -- [Download here](https://nodejs.org/) (choose the LTS version). Vite 8, which builds the app, requires 20.19+.
4. **A way to reach the Google Gemini API** -- the simplest is a free API key from [Google AI Studio](https://aistudio.google.com/apikey) ("Create API Key", then copy it). **For real financial data we recommend Google's paid data terms** — see [Your data & privacy](#your-data--privacy) below.

> **Don't have an API key yet?** You can still install the app and add the key later through the Settings page. You can also explore the app with a built-in **demo database** — see [Try the Demo](#try-the-demo-first) below — which needs no key at all.

> **What it costs:** The Gemini free tier is enough for typical personal use, but it has rate limits. Heavy statement imports will queue and process one at a time, and at high volume you could exceed the free tier and spill into paid usage. Browsing your existing data is always free — only statement import and the Aurelia assistant call Gemini.
>
> Note that **cost and data protection are separate things.** Enabling Cloud Billing is what moves you to Google's paid *data* terms (no model-training use, no human review) — even if you stay within the free usage quota. See [Your data & privacy](#your-data--privacy).

### Your data & privacy

OpenArgentum stores everything locally in a SQLite database on your machine — no cloud sync, no account, no telemetry. It reaches out to exactly one external service, on purpose: to read and categorize your statements, the contents of the files you import are sent to the Google Gemini API. That is the only data that leaves your machine, and it only happens for AI features (statement import and the Aurelia assistant). Browsing your existing data makes no external calls, and OpenArgentum never connects to your bank.

**How Google uses the data you send to Gemini depends on your tier — and we recommend the paid terms for real financial data:**

- **Recommended — paid data terms.** Enable [Cloud Billing](https://ai.google.dev/gemini-api/docs/billing) on the Google Cloud project behind your API key, or use Google Cloud credentials (Vertex AI). Under the paid terms, Google **does not use your prompts or responses to train its models** or have them reviewed by humans, and processes them under its [Data Processing Addendum](https://ai.google.dev/gemini-api/terms). Billing *status*, not spend, is what applies these terms — you can stay within the free quota.
- **Free / Unpaid tier.** A free key with no billing sends your data under Google's Unpaid terms, where it's used to improve Google's products and human reviewers may read it. Google's terms state: *"Do not submit sensitive, confidential, or personal information to the Unpaid Services."* Since statements are exactly that, use the free tier only for the demo or throwaway data.

These terms are Google's and **can change at any time — you are responsible for reviewing the current [Gemini API terms](https://ai.google.dev/gemini-api/terms) before sending real data.**

---

## Installation

Open a terminal and run:

```bash
git clone https://github.com/amithmathew/OpenArgentum.git
cd OpenArgentum
./start.sh
```

The script will:
- Set up a Python environment
- Install all dependencies
- Build the app
- Start the server

When you see `OpenArgentum` with a URL in the terminal, open **http://localhost:8099** in your browser.

---

## Try the Demo First

Not ready to import your own statements yet? OpenArgentum ships with a sample database of realistic transactions so you can explore every feature before adding a key.

- **Fastest:** launch with `./start.sh --demo`. This boots straight into the demo database — no onboarding, no API key.
- **From onboarding:** on first launch, click **Explore with sample data** on the welcome screen.
- **Anytime:** open **Settings → Databases** and switch to the **Demo** database.

Browsing the demo makes no external calls and needs no Gemini key. Any changes you make to the demo reset when you restart the server, and you can switch back to your own data from Settings whenever you're ready.

---

## First-Time Setup

The onboarding wizard will guide you through:

1. **API Key** -- Paste your Gemini API key (or choose GCP credentials if you have them)
2. **Done!** -- That's all the setup needed

---

## Importing Your Bank Statements

1. Go to the **Import** page (click "Import" in the sidebar, or the "More" menu on mobile)
2. **Drag and drop** your bank statement files (PDF, CSV, or ZIP)
3. Click **Ingest** to process each statement
4. The AI will automatically:
   - Extract all transactions
   - Assign categories (Groceries, Dining, Transportation, etc.)
   - Assign spend tiers (Essential, Lifestyle, Discretionary)
   - Detect duplicate transactions from overlapping statements
   - Identify potential transfers between accounts

> **Tip:** You can upload multiple statements at once. The app processes them one at a time and skips duplicates automatically.

---

## Exploring Your Finances

### Dashboard

The **Dashboard** shows your spending at a glance:
- **Summary cards** -- Total spend, income, net cash flow, and transaction count
- **Charts** -- Monthly spending, spending by tier, top categories, top tags, and spending trends
- Use the time period buttons (1M, 3M, 6M, YTD, 1Y, All) to change the date range
- **Tap any chart bar or slice** to jump to those transactions

### Transactions

The **Transactions** page shows all your transactions with:
- **Monthly headers** with subtotals so you can see spending per month
- **Summary bar** showing total spend/income for the current filter
- **Quick filters** -- All, Needs Review, Uncategorized, Duplicates, Transfers
- **Search and filter** by date, category, tier, tag, account, and more

**On desktop:** You can select multiple transactions and bulk-assign categories, tiers, tags, or projects.

**On mobile:** Tap a transaction to expand its details. Use the expanded view to change category or tier.

### Categories & Tiers

The **Classify** page lets you manage:
- **Spend Tiers** -- Three levels (Essential, Lifestyle, Discretionary) to classify how necessary each expense is
- **Categories** -- The specific types of spending (Groceries, Rent, Entertainment, etc.)
- **Tags** -- Additional labels you can add to transactions (trip names, recurring expenses, etc.)

### Projects

**Projects** help you track spending on specific goals or trips:
- Create a project (e.g., "Kitchen Renovation", "Europe Trip")
- Assign transactions manually or ask Aurelia to find and assign them
- Set an optional budget target to track progress
- Projects are sorted by most recent activity

---

## Asking Aurelia

Aurelia is your AI assistant. Open the chat by:
- **Desktop:** Click "Ask Aurelia" in the sidebar, or the floating button in the bottom right
- **Mobile:** Tap the "Aurelia" tab at the bottom of the screen

### What You Can Ask

**Questions about your spending:**
- "How much did I spend last month?"
- "What are my top 5 expense categories?"
- "Show me all transactions over $100"

**Comparisons:**
- "Compare this month vs last month"
- "How does my grocery spending compare to 3 months ago?"

**Visualizations:**
- "Show me a pie chart of spending by category"
- "Chart my monthly spending for the last year"

**Organizing your data:**
- "Tag all Starbucks transactions as 'Coffee'"
- "Create a project called 'India Trip' and add transactions from December"
- "Recategorize all Uber transactions as Transportation"

### How Proposals Work

When you ask Aurelia to make changes:
1. She finds the matching transactions and shows you a **proposal**
2. The proposal lists the affected transactions and what will change
3. You click **Approve** to apply the changes, or **Reject** to cancel
4. If you change your mind, click **Undo** to reverse any approved change

> **Aurelia never makes changes without your permission.** Every modification requires explicit approval.

---

## Accessing on Your Phone

You can use OpenArgentum from your phone or tablet on the same Wi-Fi network:

1. **Stop the app** if it's running (Ctrl+C in the terminal)
2. **Restart with network access:**
   ```bash
   ./start.sh --headless
   ```
3. The terminal will show a **PIN** and a network address like `http://192.168.1.50:8099`
4. Open that address in your phone's browser
5. Enter the PIN when prompted

The app is fully optimized for mobile -- you'll get a bottom tab bar for navigation, touch-friendly controls, and swipeable tables.

> **Security:** Network access is off by default. The `--headless` flag enables it with PIN protection. Only devices on your local network can access it.

---

## Tips

- **Keyboard shortcut:** Press Enter in the chat input to send a message (Shift+Enter for a new line)
- **Themes:** Go to Settings to choose from 8 color themes (including 2 dark modes)
- **Database snapshots:** The Settings page lets you create snapshots before big changes, and restore them if needed
- **Hidden transactions:** If you hide a transaction by mistake, go to Settings to restore it
- **Multiple accounts:** The app handles multiple bank accounts automatically, detecting them from statement metadata

---

## Troubleshooting

**The app won't start:**
- Make sure Python 3 and Node.js are installed (`python3 --version` and `node --version`)
- On macOS, you may need to install Xcode command line tools: `xcode-select --install`

**AI features aren't working:**
- Check that your Gemini API key is set in Settings
- The free Gemini API tier has rate limits -- if you're processing many statements, they'll queue and process sequentially

**The chat shows "Chat encountered an error":**
- Click "Retry" to try again
- Click "Error details" to see what went wrong
- This sometimes happens if the Gemini API is temporarily unavailable

**Transactions look wrong after import:**
- You can re-ingest any statement from the Import page
- Use Aurelia to help fix categories or tags in bulk
- Every change has an undo button

**Can't access from my phone:**
- Make sure both devices are on the same Wi-Fi network
- Make sure you started with `./start.sh --headless`
- Check that your firewall isn't blocking port 8099
