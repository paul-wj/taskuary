# Bilingual Interface Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the host Agent's execution and delegation rules. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the entire application interface between Simplified Chinese and English without translating business content.

**Architecture:** Explicit source-keyed translation calls and domain dictionaries; no DOM text rewriting or automatic translation of arbitrary data. A subscribed React locale boundary rerenders without remounting the application. Browser-local preference takes precedence over browser language.

**Tech Stack:** Existing React 18, JavaScript, MUI 6, Vite, Node test runner.

**Spec:** User-approved requirements in this conversation: interface only; settings selector; immediate switching; persistence; browser detection; navigation, forms, dialogs, states, setup and dates localized; email, task titles, AI output, documents, terminals, product names and commands unchanged.

## Global Constraints
- Public repository: invented examples and reserved example domains only.
- Languages: `en` and `zh-CN`; browser Chinese variants select `zh-CN`, all other languages select `en`.
- Persistence key: `taskuary.language`; unavailable storage must not prevent switching.
- Source text is the English fallback, not a key shown to users.
- Do not remount app state or reload on language change.
- Translation never changes API values, persisted domain identifiers, user text, provider names, model names, paths, commands or rendered Markdown content.
- Shared API in `website/src/i18n.js`: `t(source, values = {}, context = "")`, `getLocale()`, `setLocale(locale)`, `subscribeLocale(listener)` and `translateDescriptor(descriptor)`; placeholders `{name}` substitute once without interpreting inserted content. Context keys disambiguate UI meanings while English falls back to the original source. `useLocale()` in `website/src/LocaleProvider.jsx` subscribes and returns locale.
- Translation dictionaries in `website/src/locales/{core,tasks,assistant,connections,views,settings,metadata}.json`. Static imported constants are translated when rendered, never frozen at module initialization. Backend-authored sentences carry source/value descriptors; inserted business data stays raw.
- Canonical action and control identifiers never come from translated labels. Outward actions carry explicit send metadata through card, row, page snapshot and execution guard; they are highlighted for the owner, not executed by the Assistant. Secrets never enter page context or automated field setters.

## Review Focus
- Storage denied: still switch and keep current view/form state.
- Unknown locale: English fallback; browser `zh-TW` selects Simplified Chinese.
- Inserted English words that match UI keys: user content remains unchanged.
- Lazy pages first visited after switching: render selected language.
- Chinese labels: no horizontal overflow or hidden controls.

---

### Task 1: Locale runtime, settings selector and shared labels
**Files:** Create `website/src/i18n.js`, `website/src/LocaleProvider.jsx`, `website/src/locales/core.json`, `website/test/i18n.test.mjs`; modify `main.jsx`, `SettingsView.jsx`, `words.js`, `buttons.js`, `dates.js`, `timeWords.js`, `theme.jsx` and shared vocabulary presentation helpers.
**Interfaces:** Produce the shared API above; selectors preserve state. Own all non-JSX shared helpers unless assigned explicitly below.
- [x] Write behavioral tests covering detection, preference, denied storage, subscription, fallback and interpolation; observe failing before implementation.
- [x] Implement runtime and provider, language selector, localized shared labels/time formatting.
- [x] Run focused and full existing frontend suite only after all integration finishes.

### Task 2: Application shell, search, task and task workflow surfaces
**Files:** `TaskHubPage.jsx`, `ui.jsx`, `TaskPage.jsx`, `TasksView.jsx`, `FeedView.jsx`, `SearchEverything.jsx`, `NewSheet.jsx`, task forms and workflow components.
**Interfaces:** Consume shared translation API; produce `locales/tasks.json`.
- [x] Replace presentation literals/templates with explicit translations, keeping data identifiers and business text unchanged.
- [x] Verify task title, draft text and form inputs unchanged across switching in browser.

### Task 3: Assistant and agent surfaces
**Files:** `AssistantView.jsx`, `assistantCards.jsx`, `GeneralWorkspace.jsx`, assistant/agent dialogs and panes.
**Interfaces:** Consume shared translation API; produce `locales/assistant.json`.
- [x] Translate controls and presentation templates, leaving conversation and Markdown content untouched.
- [x] Verify open conversation and pane state survive switching.

### Task 4: Connections and initial configuration
**Files:** `ConnectorsView.jsx`, `FirstRun.jsx`, setup/connection components.
**Interfaces:** Consume shared translation API; produce `locales/connections.json`.
- [x] Translate controls, help labels and configuration prompts without modifying connector types, provider names, paths, model names or credentials.
- [x] Verify connection form entries survive switching and setup is localized.

### Task 5: Reports, knowledge and remaining interface
**Files:** `ReportsView.jsx`, `DocsView.jsx`, `HubView.jsx`, remaining JSX views, game/board/dashboard surfaces.
**Interfaces:** Consume shared translation API; produce `locales/views.json` (including Reports), with separate settings UI and schema dictionaries owned by the settings slices.
- [x] Translate all remaining presentation text; preserve reports' data, document bodies, terminal transcripts and game item titles.
- [x] Verify lazy pages and Chinese layout using actual demo.

### Task 6: Locale-independent action protection
- [x] Keep card action identities stable across languages and preserve explicit outward-send metadata through the action row and page snapshots.
- [x] Verify actual page operations highlight sends without invoking handlers, allow local actions, and neither expose nor type secrets in both languages.

### Task 7: Integration proof
- [x] Install frontend dependencies in isolated workspace; build once after edits settle.
- [x] Run full frontend suite and report every observed failure.
- [x] Launch a separate demo using isolated build; exercise English/Chinese selector, reload persistence, selected view/form preservation, all major pages and viewport widths.
- [x] Update user startup/localization documentation after smoke succeeds; retain generated shipped frontend assets as repository convention requires.

## Verification record

- Production and static-demo Vite builds succeeded; existing mixed-import and large-chunk warnings remain.
- Frontend suite: 1,414 passed. Focused real-browser checks: 3 passed. Affected backend behavior suite: 198 passed.
- Initial full backend run: 11,254 passed, 7 failed, 13 skipped. Five failures were obsolete UI source/copy assertions; those were removed and affected suites passed. Two date assertions remain outside this interface change: `tests/test_core.py::StampTests::test_graphs_two_digit_fraction_normalizes` and `tests/test_imapmail.py::ImapTests::test_poll_parses_real_mime_keeps_the_uid_and_never_rereads`. Both observed a local-date shift. The full backend suite was not rerun after assertion cleanup.
- Exercised immediate English/Chinese switching, reload and server-restart persistence, retained profile/connection input nodes and values, preserved business titles/provider names, Chinese reports/connections/Hub/Board/Game, 390px and desktop layouts, static-demo browser-language detection, and outward-send/secret protection.
- Updated both READMEs and generated application/static-demo assets. Original checkout stays separate from `feat/interface-i18n` in `C:/project/taskuary-i18n`.

## Upstream integration verification

- Resolved the upstream button-stress merge while retaining localization, canonical action identities, repeat-click protection and behavior regressions. Rebuilt both generated frontend bundles from source rather than combining generated code.
- Fixed a keyboard regression in the incoming pointer-repeat guard: Enter/Space activations have no pointer position and must not be swallowed or claim a later pointer press. Added a failing-before/passing-after behavioral regression. Browser fixtures default explicitly to English while retaining any test-selected language across reloads.
- Verification after resolution: frontend suite 1,418 passed; affected backend suite 199 passed; actual-browser suite 18 passed, including repeated Approve, navigation during pending actions, reminder/note double-clicks, settings keyboard controls and bilingual outward-send protection. Both frontend builds succeeded with the existing bundle warnings.

