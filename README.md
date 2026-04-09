<p align="center">
  <img src="assets/logo_256.png" alt="OpenArgentum" width="100" />
</p>

<h1 align="center">OpenArgentum</h1>


- **AI-powered import** -- Drop in your bank statements (PDF, CSV, or ZIP). AI extracts every transaction, assigns categories and tags, and catches duplicates automatically.
- **Conversational finance** -- Ask Aurelia, your built-in AI assistant, anything about your spending. Get charts, insights, and safe bulk edits through plain English.
- **Your data, no lock-in** -- All data lives in a local SQLite database on your machine. No cloud sync, no account, no telemetry. You own your data and can do whatever you want with it.
- **One command setup** -- `./start.sh` handles everything. No Docker, no database server, no config files.
- **Mobile-friendly** -- Works on your phone too. Responsive design with touch-optimized controls.

<p align="center">
  <img src="assets/gifs/hero.png" alt="OpenArgentum Dashboard with Aurelia AI assistant" width="800" />
</p>

---

## Quick Start

**You need:** Python 3, Node.js, and a [free Google Gemini API key](https://aistudio.google.com/apikey) (or existing Google Cloud Application Default Credentials)

```bash
git clone https://github.com/amithmathew/OpenArgentum.git
cd openargentum
./start.sh
```

Open **http://localhost:8099** and the onboarding wizard will walk you through setup.

> **That's it.** `start.sh` creates a Python virtual environment, installs all dependencies, builds the app, and starts the server. See [Getting Started](GETTING_STARTED.md) for a detailed walkthrough.

---

## Import Your Statements

Drop your bank and credit card statements into OpenArgentum and let AI do the rest.

- Supports PDF and CSV files (individually or ZIP-archived) -- just drag and drop
- AI reads every transaction, figures out the category, and adds relevant tags
- Overlapping statements? Duplicates are caught automatically
- Already uploaded that file? It won't import twice
- Process multiple files in a row -- they queue up in the background

<p align="center">
  <img src="assets/gifs/import-flow.gif" alt="Import a bank statement and watch AI extract transactions" width="700" />
</p>

---

## Meet Aurelia

<img src="assets/aurelia_clean.png" alt="Aurelia" width="48" align="left" style="margin-right: 12px;" />

Aurelia is your AI finance assistant. She lives inside OpenArgentum, has direct access to your data, and can answer questions, build charts, and make changes -- all through conversation.

<br clear="left" />

### Ask anything about your money

> *"How much did I spend on dining out last quarter?"*
>
> *"Show me my grocery spending by store over the last 3 months"*
>
> *"What's my average monthly grocery bill?"*

Aurelia queries your data, summarizes the answer, and renders charts right in the chat.

<p align="center">
  <img src="assets/gifs/aurelia-query.gif" alt="Ask Aurelia about grocery spending and get a chart" width="700" />
</p>

### Understand your spending patterns

> *"Why were my January expenses so much higher than December?"*
>
> *"Compare my essential vs discretionary spending this year"*

Aurelia breaks down the numbers, highlights what changed, and explains why.

<p align="center">
  <img src="assets/gifs/aurelia-analysis.gif" alt="Aurelia analyzes spending changes between months" width="700" />
</p>

### Make bulk changes safely

> *"Tag all my Ticketmaster expenses as Impulse and move them to discretionary"*
>
> *"Create a project called 'Home Renovation' and add all Home Depot transactions"*

Aurelia shows you exactly what will change and waits for your approval. Every change can be undone with one click.

<p align="center">
  <img src="assets/gifs/aurelia-mutation.gif" alt="Aurelia proposes bulk changes with approval workflow" width="700" />
</p>

### Conversation memory

Aurelia remembers your past conversations. Pick up where you left off, or start a new chat anytime.

---

## Dashboard & Analytics

See where your money goes at a glance.

- Summary cards for total spend, income, net cash flow, and transaction count
- Interactive charts: monthly spending, spending by tier, top categories, top tags, and trends over time
- Click any chart element to drill down to the matching transactions
- Filter by time period (1 month, 3 months, YTD, custom range, and more)

## Transaction Management

Every transaction at your fingertips.

- Filter by date, category, tag, account, search text, and more
- Monthly grouping with subtotals
- Add, remove, or create tags inline
- Multi-select for bulk operations (categorize, tag, assign to projects)
- Expandable rows for full details including original bank description
- Flagged transfers and duplicates for easy review

## Categories, Tiers & Tags

Organize your spending the way that makes sense to you.

- Three spend tiers out of the box: **Essential**, **Lifestyle**, **Discretionary** (fully customizable)
- Categories are created automatically during import -- review and confirm them at your own pace
- Batch-categorize unconfirmed transactions with one click
- Tags for cross-cutting labels like merchants, recurring expenses, or custom markers

## Projects & Budgets

Track spending against goals.

- Create projects and assign transactions (manually or ask Aurelia)
- Set budget targets with progress tracking
- Per-project category breakdowns
- Archive completed projects to keep things tidy

## Themes

Eight built-in color themes.

**Light:** Mist, Rose, Sage, Ember, Ocean, Slate -- **Dark:** Nightfall, Aurora

## Access from Your Phone

Run with `./start.sh --headless` to access OpenArgentum from any device on your local trusted network. A PIN is generated automatically to keep things secure.

---

## Privacy & Security

Your financial data never leaves your control.

- All data lives in a local SQLite database on your machine -- easy to back up, export, or inspect. It's your data, do what you want with it.
- No live bank connectivity. OpenArgentum works with statements and exports you already have.
- The only external call is to Google Gemini for AI processing. No analytics, no telemetry, no tracking.
- Network access is off by default. When enabled, it's protected by a PIN with brute-force protection.
- Localhost access is always open without authentication.

---

## Updating

Your data is safe across updates. Pull the latest code and restart:

```bash
git pull
./start.sh
```

Your database, config, and uploaded files live in the `data/` directory which is never touched by git. Database migrations run automatically on startup.

---

## Configuration

### API Key Setup

**Option A: API Key** (recommended)
1. Get a free key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Enter it during onboarding, or later on the Settings page

**Option B: Google Cloud credentials**
1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Run `gcloud auth application-default login`
3. Select "Application Default Credentials" during onboarding

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_API_KEY` | -- | Gemini API key (can also be set through the UI) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use |
| `PORT` | `8099` | Server port |

Most users won't need these -- the UI handles everything.

### Command Reference

```
./start.sh                         # Start the app
./start.sh --dev                   # Development mode with hot reload
./start.sh --headless              # Enable network access (auto-generates PIN)
./start.sh --headless --pin 1234   # Network access with a specific PIN
./start.sh --help                  # Show all options
```

---

<details>
<summary><strong>Developer Details</strong></summary>

### Architecture

```
openargentum/
  start.sh              # One-command setup and launch
  run.py                # Server entry point

  backend/              # Python + FastAPI
    app.py              # App init, auth middleware, routing
    config.py           # Paths, env vars, config helpers
    database.py         # SQLite schema and migrations
    models.py           # Request/response models
    routers/            # REST API endpoints
    services/           # Gemini client, ingestion, categorization,
                        #   chat tools, mutations

  frontend/             # React + Vite + TailwindCSS
    src/
      pages/            # Dashboard, Transactions, Categories,
                        #   Projects, Import, Settings
      components/       # ChatPanel (Aurelia), OnboardingWizard,
                        #   AppLogo, InstitutionIcon
      hooks/            # useIsMobile

  data/                 # Created at runtime (gitignored)
    finance.db          # SQLite database
    config.json         # App configuration
    statements/         # Uploaded files
    snapshots/          # Database snapshots
    sandboxes/          # Aurelia analysis sandbox DBs
```

### Tech Stack

**Backend:** Python 3, FastAPI, SQLite, google-genai SDK, pdfplumber

**Frontend:** React 19, Vite, TailwindCSS, Recharts, TanStack React Query

**AI:** Google Gemini 2.5 Flash

### Development

```bash
./start.sh --dev
```

This starts the Vite dev server with hot module replacement and the backend with auto-reload. The Vite dev server proxies `/api` requests to the backend.

</details>
