# Getting Started with OpenArgentum

A step-by-step guide to setting up and using OpenArgentum for managing your personal finances.

---

## What You'll Need

1. **A computer** running macOS, Linux, or Windows (with WSL)
2. **Python 3** -- [Download here](https://www.python.org/downloads/) if you don't have it
3. **Node.js** -- [Download here](https://nodejs.org/) (choose the LTS version)
4. **A Google Gemini API key** -- Free at [Google AI Studio](https://aistudio.google.com/apikey). Click "Create API Key" and copy it.

> **Don't have an API key yet?** You can still install the app and add the key later through the Settings page.

---

## Installation

Open a terminal and run:

```bash
git clone https://github.com/amithmathew/OpenArgentum.git
cd openargentum
./start.sh
```

The script will:
- Set up a Python environment
- Install all dependencies
- Build the app
- Start the server

When you see `OpenArgentum` with a URL in the terminal, open **http://localhost:8099** in your browser.

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
