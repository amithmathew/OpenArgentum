# Contributing to OpenArgentum

Thanks for your interest in improving OpenArgentum! This guide covers how to get a
development environment running and what to expect when opening a pull request.

## Prerequisites

- **Python 3.11+** (3.10 is the minimum)
- **Node.js 20.19+** (required by Vite 8)
- A Google Gemini API key for exercising AI features — or use the demo database
  (`./start.sh --demo`) for everything that doesn't need one.

## Development setup

The launcher handles the whole toolchain — virtual environment, dependencies, and both
dev servers:

```bash
git clone https://github.com/amithmathew/OpenArgentum.git
cd OpenArgentum
./start.sh --dev
```

`--dev` starts the Vite dev server with hot module replacement and the FastAPI backend
with auto-reload. Vite proxies `/api` requests to the backend, so you only need to open
the Vite URL it prints.

To work against the sample data without a key, run `./start.sh --demo --dev`.

### Project layout

```
backend/    Python + FastAPI — routers, services (Gemini, ingestion, chat, mutations), SQLite
frontend/   React + Vite + TailwindCSS — pages, components (ChatPanel/Aurelia, OnboardingWizard)
data/       Runtime data (gitignored): the SQLite DB, config, uploaded statements
demo/       The sample database shipped with the app
```

See the **Developer Details** section of the [README](README.md) for a fuller map.

## Before you open a PR

- **Lint the frontend:** `cd frontend && npm run lint`
- **Build the frontend:** `cd frontend && npm run build` (this is what `./start.sh`
  runs in production mode — a clean build should succeed).
- **Sanity-check the backend:** make sure `./start.sh` boots and the pages you touched
  behave as expected. If you changed ingestion, categorization, or Aurelia, exercise
  those flows against a real statement or the demo database.
- Keep changes focused and match the style of the surrounding code.

## Pull request expectations

1. Fork the repo and create a branch off `main`.
2. Describe **what** changed and **why** in the PR description. Screenshots or a short
   clip help for UI changes.
3. Note anything a reviewer needs to set up or verify manually (e.g. a migration, a new
   config value).
4. One logical change per PR where practical — it makes review faster.

## Reporting bugs & requesting features

Open an issue with clear steps to reproduce (for bugs) or a description of the use case
(for features). Please don't include real financial data or API keys in issues.

## Contributor License Agreement

Contributions are accepted under the project's [AGPL-3.0 license](LICENSE) and require a
one-time signing of our [Contributor License Agreement](CLA.md) (CLA). You keep ownership
of your contribution; the CLA grants the maintainer a broad license — including the right
to relicense — so the project can stay open source while keeping the door open to a
first-party managed-hosting service later.

**How to sign (it takes one comment):**

1. Open your pull request as usual.
2. On your **first** PR, a bot ([CLA Assistant](https://github.com/contributor-assistant/github-action))
   will comment automatically with a link to [CLA.md](CLA.md).
3. Reply to the PR with this exact phrase:

   ```
   I have read the CLA Document and I hereby sign the CLA
   ```

4. The CLA check flips to passing and stays satisfied for all your future PRs. (If it
   doesn't update immediately, comment `recheck`.)

## License

By contributing, you agree that your contributions are licensed under the project's
[GNU AGPL-3.0 license](LICENSE), subject to the terms of the [CLA](CLA.md) above.
