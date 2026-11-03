# Repository Guidelines

## Project Overview

Taskuary is a local-first work manager. It turns mail, chat, tracker events and reports into tasks, coordinates CLI/general agents, and prepares results for owner review. The Python application serves a React interface; the public website/static demo is a separate deployment.

## Architecture & Data Flow

- **Server owns durable state.** CLI startup loads configuration and the SQLite store, then FastAPI lifespan starts workers and connector clocks. Server import itself initializes resources: isolate the application home before importing it in tests or scripts.
- **Ingestion is not triage.** Connectors feed `channels.py` and `ingest.py`; ingestion deduplicates and applies deterministic policy before deferred, ordered triage. Feed connections can stop at the Timeline. Keep retriable processing failures explicit rather than guessing a classification.
- **State is derived.** `taskstate.py` combines task, session, queue and review facts; persisted task status alone is not the Board state. Task, agent and reply lifecycles are separate. Use `concierge.close_task` for completion; stopping an agent or pressing Next is not completion.
- **Approval is a code boundary.** Agents draft/propose; `proposals.py`, `verdicts.py` and server guards enforce scope, ownership, stale-context checks and delivery claims. Preserve uncertain-send reconciliation and duplicate-decision protection. These controls are not an OS sandbox for same-user processes.
- **React uses hooks and server refetches.** `TaskHubPage` owns shell navigation; views use local state, shared `api.js` and coalesced `live.js` WebSocket subscriptions. Reuse these paths rather than adding a second API client or global state layer.

## Key Directories

- `taskuary/`: backend domain modules, connector adapters, agent execution and runtime JSON/templates.
- `website/src/`: React/MUI source and shared presentation logic; `website/test/` and `website/browser/`: Node and rendered-browser tests.
- `tests/`: Python regressions, factories and isolated fixtures.
- `docs/site/`: user documentation source; `docs/`: engineering contracts and historical notes. Plans are not blanket statements of implemented behavior.
- `taskuary/web/`, `site/demo/`, `site/docs/`: committed generated application, demo and documentation output.
- `tools/`, `website/tools/`: maintenance/build helpers. `worker.mjs` and `functions/` belong to the public site, not the local FastAPI backend.

## Development Commands

Use the project virtual environment. From the repository root:

```sh
python -m pip install -e ".[dev]"
python -m pytest -q
taskuary --demo --port 7787       # only with an unset/disposable TASKUARY_HOME
taskuary --debug                 # normal app; uses the configured home
```

From `website/`:

```sh
npm ci
npm run dev                     # /api proxies to localhost:7787
npm run build                   # writes taskuary/web/
npm run build:demo              # writes site/demo/
npm run build:docs              # docs/site/ -> site/docs/
npm test
npm run test:browser
npm run test:browser:i18n
npm run test:walk
npm run check:deadends
npm run lint:undef
```

`lint:undef` uses `website/eslint.undef.mjs`, but ESLint is not in the locked dependencies; do not assume `npm ci` makes that command available. No standard Python formatter/lint command is configured.

Rebuild and commit generated output with its source. Resolve frontend merge conflicts in source and regenerate bundles; do not hand-merge minified assets. Documentation order comes from `docs/site/manifest.json`; generated settings documentation comes from the settings schema/defaults.

## Code Conventions & Common Patterns

- Preserve the existing compact style and nearby naming: Python `snake_case`, React component `PascalCase`, JS helpers/hooks `camelCase`/`useX`. Avoid unrelated formatting; contributor guidance explicitly discourages Black/autopep8. Keep UTF-8, final newlines and LF in Python/web files: CRLF can change Vite asset hashes.
- Pass stores/providers into domain logic where existing APIs support it (`store`, injectable `llm`). Routes generally delegate to domain functions; use background workers/queues for long-running work. Reuse the store's writer/transaction contract rather than inventing concurrent database writes.
- Keep failure and uncertainty observable. Preserve structured API errors through `apiError.js`; use the React error boundary and existing error components. Never silently turn failed ingestion, agent execution or delivery into success.
- Interface strings use `t(source, values, context)`, `useLocale()` and `website/src/locales/`. Translate authored templates/descriptors, not task titles, mail, drafts, AI replies, documents, commands or provider identifiers. Keep action IDs and outward-send metadata independent of translated labels.
- **Public-repository privacy:** never commit real mailbox content, identifying people/company details, private addresses/domains, credentials or live-data screenshots—including in comments and commit messages. Use fictional fixtures and reserved domains such as `northwind.example` or `example.com`. Capture images only against `--demo`; retain the connector-catalogue exception documented in `CLAUDE.md`.

## Important Files

- `taskuary/cli.py`, `taskuary/server.py`: console entrypoint, API and application lifespan.
- `taskuary/config.py`, `taskuary/store.py`: configuration and SQLite/MemoryStore contracts.
- `website/src/main.jsx`, `website/src/TaskHubPage.jsx`: React bootstrap and shell; `LocaleProvider.jsx`/`i18n.js`: reactive interface locale.
- `taskuary/settings_schema.json`, `settings_defaults.json`, `connectorcatalog.json`, `lanes.json` (all under `taskuary/`): shared runtime metadata; reuse rather than duplicating vocabulary.
- `pyproject.toml`, `taskuary.spec`: dependencies and wheel/executable data. Package-data globs do not cross directories; new packaged subdirectories need explicit inclusion.
- `website/vite.config.js`, `.github/workflows/ci.yml`: build/proxy behavior and current CI requirements; prefer these over older abbreviated docs.
- `docs/how-a-task-ends.md`, `docs/how-a-report-runs.md`, `docs/agent-lifecycle.md`: read before changing the corresponding lifecycle.

## Runtime/Tooling Preferences

- Python **3.10+**; frontend tooling uses **Node 22.12+ and npm**, not Bun. Keep `website/package-lock.json` authoritative. CI currently uses Python 3.12 and Node 22.
- On Windows, invoke the intended environment's `.venv\Scripts\python.exe` explicitly. Optional connector/desktop dependencies are extras in `pyproject.toml`; install only those needed.
- Runtime files default to `~/.taskuary/{config.toml,taskuary.db}`. `TASKUARY_HOME` changes the data home; host/port/token environment overrides are runtime-only. Changing the port does not isolate data. `--demo` preserves an already-set home: unset it or supply a disposable directory first.
- Set `TASKUARY_API` for a non-default Vite backend and `TASKUARY_VITE_CACHE` for separate worktree caches. Never point fixtures or exploratory helpers at the live home.
- Release/deployment is not routine development. `tools/release.sh` can inspect configured data, commit, push, tag and publish; do not run it merely to build locally.

## Testing & QA

- Backend: pytest discovers both functions and `unittest.TestCase` in `tests/test_*.py`. Use `fx`/`taskuary.testing.Factory` for realistic joined state, `MemoryStore` for ordinary cases, and temporary `SQLiteStore` for persistence/reopen/concurrency tests.
- `tests/conftest.py` isolates homes before imports and guards network/process side effects. Mock external providers at their boundaries; do not bypass isolation. For a focused run: `python -m pytest -q tests/test_review_delivery_safety.py`.
- Frontend logic: Node's `node:test` and `node:assert/strict`, not Vitest. Test observable outcomes and forbidden side effects rather than source strings or incidental translated wording.
- Rendered UI: Puppeteer Core plus `website/browser/harness.mjs`, which starts isolated FastAPI/Vite fixtures on ephemeral ports and blocks external traffic. Always register fixture cleanup; inspect page errors and `fixtureEscapes`. Run a focused case from `website/` with `node --test browser/phase0-browser.test.mjs`.
- Browser tests need installed Chrome/Edge/Chromium. Set `TASKUARY_TEST_PYTHON` and, if needed, `TASKUARY_BROWSER_EXECUTABLE`. On Windows, `TASKUARY_BROWSER_PLAIN_ENV=1` is a local browser-launch workaround; backend isolation remains intact.
- For behavior changes, run focused regressions plus the relevant full suite and exercise the real UI/CLI path. Cover repeated actions, stale context, failures, uncertain delivery, and both locales when applicable. Browser suites are explicitly listed, not exhaustive discovery; include new cases in the appropriate script.
- No general line-coverage threshold is configured. Walk QA measures button/state coverage and unexplained dead ends; do not confuse it with code coverage. Follow current CI workflow gates, and report failures rather than silently narrowing verification.
