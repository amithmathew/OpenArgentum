<p align="center">
  <img src="assets/logo_256.png" alt="OpenArgentum" width="100" />
</p>

<h1 align="center">OpenArgentum</h1>

<p align="center">
  A self-hosted, AI-powered personal finance manager. No account, no cloud sync, no telemetry — you run it, you own your data.
</p>

<p align="center">
  <em>For people who check in on their finances every few weeks — not every day.<br />
  Dump in your statements, then let Aurelia make sense of it all.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License: AGPL-3.0" /></a>
  <a href="https://github.com/amithmathew/OpenArgentum/stargazers"><img src="https://img.shields.io/github/stars/amithmathew/OpenArgentum?style=social" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://github.com/amithmathew/OpenArgentum"><strong>GitHub Repository</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/amithmathew/OpenArgentum/blob/main/GETTING_STARTED.md">Getting Started</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/amithmathew/OpenArgentum/issues">Report an Issue</a>
</p>

- **Talk to your finances** -- Aurelia, the built-in AI agent, is the main way you work. Ask her anything, and she acts: she reasons about your transactions, makes changes, generates charts inline, and drops you into the filtered view. Not a search box — no filter or rules engine can express *"expenses that seem travel-related."*
- **Built for batch, not daily chores** -- Drop in everything you've got: PDFs, CSVs, or a ZIP of a dozen statements across every account. AI extracts each transaction, categorizes and tags it.
- **The numbers come out right** -- Overlapping statements are deduplicated automatically, and inter-account transfers are detected — so paying your credit card from checking doesn't look like you spent the money twice. Import messily; the totals stay honest.
- **Projects, not just categories** -- Life happens in episodes — a trip, a renovation, a wedding. Group transactions into projects retrospectively, which is how you actually think about your spending.
- **You stay in the loop** -- Imports get a human review step, and Aurelia's bulk edits require your approval. The AI proposes; you decide.
- **Your data, no lock-in** -- Local SQLite database on your machine. No cloud sync, no account, no telemetry. **No bank credentials, ever** — OpenArgentum reads statements you already have; it never connects to your bank.
- **One command setup** -- `./start.sh` handles everything. No Docker, no database server, no config files.

<p align="center">
  <img src="assets/gifs/hero.png" alt="OpenArgentum Dashboard with Aurelia AI assistant" width="800" />
</p>

---

## Quick Start

**You need:** Python 3.11+, Node.js 20.19+, and a [Google Gemini API key](https://aistudio.google.com/apikey) (or existing Google Cloud Application Default Credentials). **Use a paid-tier key for real financial data** — see [Configuration](#configuration) for why.

```bash
git clone https://github.com/amithmathew/OpenArgentum.git
cd OpenArgentum
./start.sh
```

Open **http://localhost:8099** and the onboarding wizard will walk you through setup.

> **That's it.** `start.sh` creates a Python virtual environment, installs all dependencies, builds the app, and starts the server. See [Getting Started](GETTING_STARTED.md) for a detailed walkthrough.

---

## Explore with Sample Data

OpenArgentum ships with a demo database of realistic (synthetic) transactions and a sample statement, so you can evaluate it before pointing it at your own finances.

**Look around now — no API key:**

1. Launch the app (or run `./start.sh --demo` to boot straight in).
2. Browse the dashboard, transactions, projects, and charts with pre-loaded data.

Browsing makes no external calls and needs no key. Any changes reset when you restart.

**Try the AI features — add a key, use our sample:**

The signature features — statement import and the Aurelia assistant — call Gemini, so they need an API key. To test them without touching your real data, add a key and import the bundled `demo/sample_statement.pdf`. It's synthetic, so a free key is fine for this — watch OpenArgentum extract and categorize every transaction, then ask Aurelia about it.

**From demo to your own data:**

Done looking around? The way out depends on how you got in:

- **Launched with `./start.sh --demo`?** The flag pins the sample database for the whole session — stop the server and restart with plain `./start.sh` to begin setup.
- **Clicked "Explore with sample data"?** Use **Set up my data** in the banner at the top of the app — it walks you through connecting Gemini and choosing a database, then points you at Import. (Prefer to do it by hand? Settings → Database.)

Either way, the demo data stays put in `demo.db` if you ever want it back. Before importing real statements, see [Configuration](#configuration) for why we recommend a paid-tier key for real financial data.

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

Aurelia isn't a chatbot bolted onto a dashboard — she's the primary interface. She has a full analytical loop: she can query and aggregate your transactions, compare periods, generate charts inline as you talk, navigate you to the filtered transaction view, write and search notes on transactions, and make bulk edits with your approval.

This matters most when you're doing archaeology. If you only look at your finances every few weeks, you're facing a pile of transactions with no memory of what half of them were. Static dashboards only answer questions you anticipated when you built them. Aurelia answers the question you just thought of:

> *"I travelled to Japan in early May — find transactions in that period that are in yen or look travel-related, and assign them to a Japan trip project."*

She reasons about which transactions qualify, makes the changes with your approval, and drops you into the filtered view when she's done.

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

Run with `./start.sh --headless` to access OpenArgentum from any device on your local trusted network. A PIN is generated automatically to keep things secure. The UI is fully responsive with touch-optimized controls, so it works just as well from your phone.

---

## Privacy & Security

OpenArgentum stores everything locally and reaches out to exactly one external service, on purpose.

- **Local-first storage.** All your data lives in a SQLite database on your machine — easy to back up, export, or inspect. No cloud sync, no account, no telemetry, no tracking.
- **One external call, by design.** To read and categorize your statements, the contents of the files you import are sent to the Google Gemini API. That is the only data that leaves your machine, and it only happens for AI features — statement import and the Aurelia assistant. Browsing your existing data makes no external calls.
- **No live bank connections.** OpenArgentum only works with statements and exports you already have; it never connects to your bank.
- **Network access is off by default.** When you enable it with `--headless`, it's protected by an auto-generated PIN with brute-force protection.
- **Localhost is unauthenticated.** Anything running on your machine can reach the app on localhost, so treat your own machine as the trust boundary.

### Sending your data to Google Gemini

To read and categorize your statements, OpenArgentum sends the files you import to Google's Gemini API. **Google's data protection terms differ by billing tier, so for real financial data we recommend Google's paid terms:**

- **Recommended — paid terms.** Enable [Cloud Billing](https://ai.google.dev/gemini-api/docs/billing) on the Google Cloud project behind your API key, or use Google Cloud credentials (Vertex AI). Under Google's paid terms, Google processes your information under the [Data Processing Addendum](https://ai.google.dev/gemini-api/terms). Billing *status* (not spend) is what applies these terms, so you can stay within any free usage quotas if available.
- **Free / Unpaid tier.** A free API key with no billing uses Google's "Unpaid" tier. This is ideal for the demo or trying the AI features, however we highly recommend switching to the paid terms as per Google's recommendations for personal information.

Ultimately, this is your call. Pick the option you're comfortable with, and review Google's current terms before you commit.

Sources: [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) · [Data logging policy](https://ai.google.dev/gemini-api/docs/logs-policy) · [Vertex AI data governance](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance)

> *OpenArgentum is an independent, open-source project. It is not affiliated with, endorsed by, or sponsored by Google. Google, Gemini, Google Cloud, and Vertex AI are trademarks of Google LLC.*

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

For **real financial data we recommend Google's paid data terms** — see [Sending your data to Google Gemini](#sending-your-data-to-google-gemini) above for why. Both options below work; enabling [Cloud Billing](https://ai.google.dev/gemini-api/docs/billing) on your key's project (Option A) or using Google Cloud credentials (Option B) puts you on the paid terms.

**Option A: API Key**
1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Enter it during onboarding, or later on the Settings page
3. For paid data terms, enable [Cloud Billing](https://ai.google.dev/gemini-api/docs/billing) on the key's Google Cloud project (you can stay within any free quotas available). Without billing, the key uses the Unpaid tier.

**Option B: Google Cloud credentials (Vertex AI)** — enterprise data terms
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
./start.sh --demo                  # Boot into the demo database (no key, no onboarding)
./start.sh --dev                   # Development mode with hot reload
./start.sh --headless              # Enable network access (auto-generates PIN)
./start.sh --headless --pin 1234   # Network access with a specific PIN
./start.sh --help                  # Show all options
```

---

<details>
<summary><strong>Developer Details</strong></summary>

<h3>Architecture</h3>

<pre>
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
</pre>

<h3>Tech Stack</h3>

<p><strong>Backend:</strong> Python 3, FastAPI, SQLite, google-genai SDK, pdfplumber</p>

<p><strong>Frontend:</strong> React 19, Vite, TailwindCSS, Recharts, TanStack React Query</p>

<p><strong>AI:</strong> Google Gemini 2.5 Flash</p>

<h3>Development</h3>

<pre>
./start.sh --dev
</pre>

<p>This starts the Vite dev server with hot module replacement and the backend with auto-reload. The Vite dev server proxies <code>/api</code> requests to the backend.</p>

</details>

---

## License & Project Model

OpenArgentum is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

- **Self-hosting is free and always will be.** The self-hosted version is fully featured
  — no locked features, no "premium" tier, no crippled free build. You run it, you own
  your data, and you supply your own model API key (or point it at a local model).
- **A managed hosting option may be offered in the future** for people who'd rather not
  run it themselves. Because hosting and AI inference carry real, ongoing costs, a
  managed service would be paid — for everyone who uses it. This does not affect the
  self-hosted version, which stays free and complete.
- **The code is genuinely open source.** AGPL lets you inspect, modify, and self-host
  freely. It also means anyone offering a modified version as a network service must
  share their changes back, keeping improvements in the commons.

Contributions are welcome — they require signing our [Contributor License Agreement](CLA.md)
(a one-time comment on your first pull request). See [LICENSE_FAQ.md](LICENSE_FAQ.md) and
[CONTRIBUTING.md](CONTRIBUTING.md).

---

## Disclaimer

*OpenArgentum is a personal bookkeeping and analysis tool — not financial, investment, tax, accounting, or legal advice. AI-generated categorizations and insights can be incomplete or incorrect; always verify against your original statements and consult a qualified professional before making financial decisions.*
