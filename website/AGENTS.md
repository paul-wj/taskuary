# Repository Guidelines

Frontend-specific guidance for `website/`, supplementing the root `AGENTS.md`.

## Architecture & State

- `src/main.jsx` mounts `LocaleProvider` and the error boundary; `TaskHubPage.jsx` owns shell navigation. Reuse shared MUI/theme/UI helpers rather than introducing a separate component convention.
- Views use local React state and server-owned durable data. Use `src/api.js` for requests: it supplies authentication headers, error normalization and the static-demo adapter. Do not bypass it with a new client.
- Subscribe through `src/live.js` for server changes; preserve event coalescing, sequence handling and hidden-tab behavior. Avoid independent polling loops for data already covered by live subscriptions.
- Keep task, agent-session, draft and navigation state distinct. A rerender or navigation action must not accidentally complete work, reset a form or replay an operation.

## Interface Localization

- Use `t(source, values, context)` from `src/i18n.js` and dictionaries in `src/locales/`. Reuse existing keys; use context to disambiguate meanings, not arbitrary string replacement.
- Components whose output depends on locale should call `useLocale()` from `LocaleProvider.jsx`. Reading `getLocale()` alone does not subscribe a component to changes.
- Translate authored interface templates and structured presentation descriptors, never arbitrary business text. Keep inserted titles, mail, drafts, AI replies, document bodies, terminal output and identifiers unchanged.
- Derive translated labels at render time. Do not store translated strings as durable state or remount the application on language changes. Preserve open views, unsaved values, focus and persisted language preference.
- Reuse shared date/time helpers; check their output in both English and Simplified Chinese.

## Actions, Errors & Safety

- Action identity comes from canonical IDs and explicit metadata, not visible labels. Preserve `data-tq-verb`, outward-send metadata and ownership through `actionRow.js`, `pageView.js` and card registration.
- Automated page operations must not execute owner-only sends or expose/type secret fields. Changing language must not weaken these protections.
- Preserve pending-action, stale-card and repeat-click guards. Test mouse double/triple clicks separately from keyboard activation: keyboard clicks have no pointer position to repeat.
- Keep structured failures through `apiError.js` and existing error components. Translate authored error wrappers without rewriting raw server/provider details; do not hide failed actions as success.

## Development & Generated Output

Run commands from `website/` using Node/npm as specified in the root guide:

```sh
npm ci
npm run dev
npm test
npm run test:browser:i18n
npm run build
npm run build:demo
```

- Vite proxies `/api` to port 7787 by default; set `TASKUARY_API` for another backend. Use separate `TASKUARY_VITE_CACHE` paths for worktree fixture servers.
- Edit `src/`, not generated bundles. Normal builds write `../taskuary/web/`; demo builds write `../site/demo/`. Commit regenerated output alongside relevant source changes.
- For merge conflicts, reconcile source and rebuild; do not compare or hand-merge minified bundle code. Retain LF line endings so Windows builds do not generate different hashes from newline changes.
- Docs builds are separate: edit `../docs/site/`, then run `npm run build:docs`. See the root guide for the `lint:undef` dependency caveat.

## Testing & QA

- Pure logic: `test/*.test.mjs` uses `node:test` and `node:assert/strict`. Assert observable outcomes, boundaries and forbidden effects, not source text or incidental copy.
- Rendered components and interactions: use Puppeteer with `browser/harness.mjs`, not bare-Node JSX imports. Register `t.after(() => harness.close())`; inspect page errors and `fixtureEscapes`.
- Fixtures isolate application homes, ports and network access. They default to English; explicitly switch locale for bilingual scenarios and verify that reload retains the choice. Never use a live mailbox backend for fixture tests.
- Run a focused browser case with `node --test browser/interface-settings.test.mjs`. Browser suites are curated in `package.json`; register new cases in the appropriate script rather than assuming automatic discovery.
- For UI changes, exercise the actual surface beyond unit tests. Check narrow layouts, language switching, unsaved input retention, pending operations and action safety where affected. Run the relevant full suite after focused checks; a successful Vite build alone does not prove runtime imports or interactions work.
