# Contributing to LLM-Dash

Thanks for your interest in improving LLM-Dash. This guide covers setup,
conventions, and the pull-request flow. For deeper detail see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ground Rules

- Be respectful — see the [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep changes focused. One concern per pull request.
- The dashboard is **zero-build**: vanilla HTML/CSS/JS, no framework, no
  bundler. Don't introduce a build step for the frontend.
- **Changelogs are append-only.** Never modify or delete files in `changelogs/`.
- **No invented benchmark scores.** Every score claim cites a source URL.

## Local Setup

```bash
git clone https://github.com/phxntomkid/LLM-Dash.git
cd LLM-Dash

./install.sh        # macOS / Linux   (.\install.bat on Windows)
llm-dash start
```

The installer creates `.venv`, installs Python deps, and registers the
`llm-dash` command shim. The app needs only Python 3.10+ at runtime — the
Voidware CSS is vendored under `web/vendor/`, so npm is not required to run it.

Copy `.env.example` to `.env` and fill in any provider/research keys you want to
test against. `.env` is gitignored; never commit secrets.

## Running Checks Locally

Verification is local-first — there is no hosted CI.

```bash
# Python tests
python3 -m unittest discover -v

# Syntax checks across the no-build split
python3 -m py_compile server.py scripts/*.py tests/*.py
node --check web/app.js

# Browser end-to-end (functional + visual + a11y); needs org npm access
npm run e2e
```

Run the relevant checks before opening a PR. See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#testing) for the full testing guide.

## Branching & Commits

- Work on a feature branch off `main`.
- Write clear, present-tense commit messages describing the change.
- Rebase on the latest `main` before opening your PR.

## Pull Requests

1. Push your branch and open a PR against `main`.
2. Fill out the [pull request template](.github/PULL_REQUEST_TEMPLATE.md):
   summary, change type, testing, checklist.
3. Make sure local checks pass and you haven't touched generated/local files
   (`data/`, `logs/`, `.env`, `changelogs/` history).
4. A maintainer will review. Address feedback by pushing follow-up commits.

## Code Conventions

The full conventions live in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#code-conventions). In short:

- **Python** — 3.10+ syntax, type hints on signatures, raw `sqlite3` (no ORM),
  Pydantic for request bodies, credentials never in logs or responses.
- **JavaScript** — vanilla only, single `web/app.js`, parameterized sql.js
  queries, vendor libs committed under `web/vendor/`.
- **CSS** — Voidware tokens, shadow-as-border, `outline` for focus, no
  `!important` except to override vendored styles.
- **General** — comment only the non-obvious *why*; delete dead code rather than
  commenting it out.

## Questions

Open a [discussion or issue](SUPPORT.md) — happy to help.
