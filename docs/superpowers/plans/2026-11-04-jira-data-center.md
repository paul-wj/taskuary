# Jira Data Center API-token Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the host Agent's execution and delegation rules. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Data Center API-token mode to the existing Jira connector without changing Cloud authentication or approved write-back.

**Architecture:** Extend the existing Jira card and per-connector configuration; consolidate Jira HTTP in one requests-based module. Data Center uses Basic auth and REST v2, then existing ingestion/triage; Cloud keeps its current v2 ingestion and v3 write-back. Enforce Data Center read-only behavior in the transport and tracker boundaries, not just the UI.

**Tech Stack:** Python 3.10+, requests, FastAPI, existing SQLite/MemoryStore and vault, React/MUI, Node 22.12+ and npm, pytest, node:test and Puppeteer harness.

**Spec:** `docs/superpowers/specs/2026-11-04-jira-data-center-design.md` — user-approved scope; implementation authorized on 2026-11-04.

## Global Constraints

- Implement in the user-selected isolated worktree `C:/project/taskuary-jira-dc`. Scope is approved; this document tracks the plan and is not itself proof of implemented behavior.
- Python 3.10+; frontend tooling uses Node 22.12+ and npm, not Bun. Keep website/package-lock.json authoritative. No new dependency is needed.
- Basic auth uses the existing ConfigJson.email username and Secret API token. Do not use Bearer for this mode.
- Data Center is read-only; existing Cloud write-back stays behind its current approval, stale-context and uncertain-delivery boundaries.
- Do not mutate the running real application's home, configuration, accounts, database or tasks during implementation verification.
- All permanent fixtures, documents and screenshots use fictional accounts and reserved example domains. Never copy personal skill defaults, actual issue content, token values, employer hostnames or live screenshots into this public repository.
- Browser visual evidence is captured only against demo fixtures. Live read-only validation is a separate explicitly authorized action.
- Preserve existing compact style, UTF-8, final newlines and LF. Rebuild generated assets with their sources; do not hand-edit bundles.
- Reuse api.js, connector drafts, live subscriptions, DraftStore and the store writer contract. Do not add another client, secret store or global state layer.
- Do not widen assignee scope, add attachments/reports, add automatic .env import or implement Data Center write-back.

## Review Focus

- A site with `/jira` context path or pasted `/rest/api/2` must produce correct API and browse URLs, not duplicate prefixes.
- A successful `/myself` followed by denied or empty `/search` must distinguish denied access from a legitimate zero-result query.
- A later search-page failure must not advance the source watermark past unseen updates; retry must not duplicate accepted rows.
- Draft-testing or changing a connector's site/username must not reuse or persist another account's cached identity.
- A stale write proposal or injected direct executor call must not bypass read-only Data Center mode; Cloud approved writes must still work.

---

## File map

| File | Responsibility |
|---|---|
| Create `taskuary/jiraapi.py` | Jira deployment/site normalization, common HTTP, owner identity and read-only enforcement |
| Modify `taskuary/pm.py` | Jira Test, paged assigned-issue ingestion and owner-comment classification |
| Modify `taskuary/trackers.py` | Cloud calls through shared transport; deny Data Center write and close-out roads |
| Modify `website/src/ConnectorsView.jsx` | Existing Jira Credentials selector, mode-specific help and capability presentation |
| Modify `website/src/locales/connections.json` | Chinese translation of authored connection guidance |
| Modify `taskuary/connectorcatalog.json` | Jira catalogue description matching both supported deployments |
| Modify `tests/test_pm.py`, `tests/test_tracker_revisions.py`, `tests/test_tracker_writeback.py`, `tests/test_multi_connectors.py` | Existing behavioral contracts and provider-boundary fixtures |
| Create `tests/test_jira_data_center.py` | Data Center auth/search/paging/identity and forbidden-write regressions |
| Modify `website/browser/fixture_changes.py` | Fictional Jira upstream inside the existing isolated browser harness |
| Create `website/browser/jira-data-center.test.mjs`; modify `website/package.json` | Rendered bilingual connector coverage, included in browser script |
| Modify `docs/site/connections.md` | User setup, auth and intentionally read-only Data Center support |
| Regenerate `taskuary/web/`, `site/demo/`, `site/docs/` | Generated application/demo/documentation output after successful smoke |

Existing routes and store APIs need no new credential endpoints or schema columns. Change `channels.py`/server behavior only if a regression demonstrates that the existing DraftStore or source-watermark contract cannot support this design; do not pre-emptively refactor them.

### Task 1: Common Jira transport and successful read-access testing

**Files:** Create `taskuary/jiraapi.py`, `tests/test_jira_data_center.py`; modify Jira test/wire callers in `taskuary/pm.py`, `taskuary/trackers.py`; migrate old wire replacements in `tests/test_pm.py`, `tests/test_tracker_revisions.py`, `tests/test_tracker_writeback.py`, `website/browser/fixture_changes.py` and any additional references found at implementation time.

**Interfaces:**
- `jiraapi.deployment(c: dict) -> str`: `cloud` when absent; accepts only `cloud` and `data_center`.
- `jiraapi.base_url(c: dict) -> str`: normalized site URL with context path preserved and compatible v2 suffix removed.
- `jiraapi.request(c: dict, method: str, path: str, body=None, *, params: dict | None = None, api_version: int = 2) -> dict | list`: relative paths such as `/myself` and `/search`; Basic auth; JSON results; no credentialed redirects. Reject Data Center non-GET or non-v2 calls before HTTP.
- Preserve `pm.test_jira(store, c) -> str` and the existing structured connector-test response shape. Test identity and a minimal assigned-to-me search before seeding a source and reporting success.
- Remove duplicate `_jira_base`, `_jira_get` and tracker `_jira` wire helpers after migrating every caller and fixture; no forwarding aliases.

- [ ] Find all references to the old wire helpers and exported symbols with the available language server before changing interfaces. Read the affected fixtures; do not preserve tests that assert incidental copy, source text or mock forwarding.
- [ ] Add failing behavioral cases `test_dc_identity_success_search_denied_is_not_connected`, `test_dc_zero_visible_issues_is_successful_read`, `test_dc_context_path_and_api_suffix_link_back_to_site`, `test_dc_redirect_does_not_forward_credentials`, `test_dc_401_and_403_remain_failures`, and `test_missing_deployment_preserves_cloud_behavior`. Assert connection outcomes, API responses/forbidden external effects and correct links, not fixed wording.
- [ ] Run `.venv\Scripts\python.exe -m pytest -q tests/test_jira_data_center.py`; observe the new cases fail on the absent/incorrect behavior.
- [ ] Implement the interfaces. Use existing requests and Basic auth, a 30-second API timeout, Accept JSON and Data Center UA `curl/8.17.0`. Keep TLS verification; do not return raw login HTML or credentials in errors.
- [ ] Migrate Cloud transport consumers without changing v3 payload/approval behavior. Update existing fixture mocks at the provider boundary rather than adding shims.
- [ ] Run the targeted new cases and the affected existing Cloud cases. Exercise actual `pm.test_jira` with fictional Data Center responses in an isolated home; observe both identity-plus-search success and denied-search failure. Do not claim this proves company-server connectivity.

### Task 2: Complete Data Center ingestion and connector-bound owner identity

**Files:** `taskuary/jiraapi.py`, `taskuary/pm.py`, `tests/test_jira_data_center.py`, `tests/test_tracker_revisions.py`, `tests/test_multi_connectors.py`.

**Interfaces:**
- Consume Task 1 transport.
- `jiraapi.owner(store, c: dict) -> dict`: obtain/cache owner account identifiers per connector, bound to normalized site, deployment and username. Preserve DraftStore non-persistence.
- `jiraapi.same_user(author: dict, owner: dict, deployment: str) -> bool`: Cloud `accountId`; Data Center matching `key`, then matching `name` when a comparable key pair is unavailable; no display-name/email guessing.
- `pm._jira_pages(c: dict, jql: str, fields: str)`: iterator over issues from all search pages, using CAP as page size. Retain `pm.poll_jira(store, c, since, llm=None, file_only=False) -> int`.
- Source marker creation checks this connector's ownership. Stop reading the obsolete global `jira_account_id`; do not retain an alias or shared identity fallback.

- [ ] Add failing cases `test_dc_more_than_one_page_reaches_existing_feed`, `test_dc_repeat_sync_deduplicates_all_pages`, `test_dc_second_page_failure_preserves_pending_window`, `test_dc_premature_empty_page_is_failure`, `test_dc_own_comment_is_context_by_key_or_name`, `test_dc_other_person_comment_is_new_arrival`, `test_dc_story_and_subtask_are_not_filtered_out`, and `test_dc_draft_test_does_not_change_saved_identity`.
- [ ] Add a two-connector source/identity case with distinct fictional issue keys: separate markers and owner identities must be retained without mutating the other connector. Do not introduce an unrelated item-ID migration.
- [ ] Run those cases and observe failure before implementation.
- [ ] Implement search paging with `startAt`, server `total` and actual returned row count. Fail on contradictory/no-progress responses; propagate failed pages so the existing polling caller does not touch source watermarks. Use overlap and existing dedupe on the next poll; do not add a new retry subsystem.
- [ ] Implement connector-bound identity comparison/cache and source ownership. Keep assigned-to-me JQL, existing revision/conversation IDs, priority/status processing and upstream-done behavior unchanged.
- [ ] Run `.venv\Scripts\python.exe -m pytest -q tests/test_jira_data_center.py tests/test_pm.py tests/test_tracker_revisions.py tests/test_multi_connectors.py`.
- [ ] Smoke actual poll/ingestion/store behavior in a disposable home: multiple fictional pages reach Timeline, own comments are context, and a second sync produces no duplicate arrivals. Observe source watermark/error state after a forced second-page failure, then recovery; discard the throwaway runner.

### Task 3: Enforced read-only Data Center tracker behavior

**Files:** `taskuary/trackers.py`, `taskuary/jiraapi.py`, `tests/test_jira_data_center.py`, `tests/test_tracker_writeback.py`.

**Interfaces:**
- `jiraapi.require_write(c: dict) -> None`: return for Cloud, raise an explicit read-only error for Data Center; unknown deployment is rejected.
- Existing tracker entrypoints remain the contract: `card`, `run`, `closeout_due`, `assess` and `close_out`. Resolution/execution deny Data Center write access; close-out discovery returns no upstream-write proposal for a read-only card; assessment/execution of stale proposals fail closed.
- Shared HTTP denial from Task 1 is the final outbound boundary. Preserve Cloud v3 comment ADF, user lookup/accountId, transitions and all existing verdict safeguards.

- [ ] Add failing cases `test_dc_tool_executor_cannot_comment_move_assign_or_close`, `test_dc_finished_task_offers_no_upstream_closeout`, `test_cloud_proposal_switched_to_dc_is_not_executed`, and `test_dc_injected_card_cannot_bypass_transport_guard`. Record zero outbound mutations and zero v3 requests, not just raised exceptions.
- [ ] Run those cases and observe failure before implementation.
- [ ] Implement write denial before state probes/mutations in normal and injected executor paths. Preserve local task completion: inability to close upstream must not prevent the owner from completing work locally.
- [ ] Run `.venv\Scripts\python.exe -m pytest -q tests/test_jira_data_center.py tests/test_tracker_writeback.py` and exercise the actual close-out/tool entrypoints against fictional upstreams. Check Cloud writes still occur only after owner approval and Data Center performs none.

### Task 4: Bilingual setup and end-to-end connection proof

**Files:** `website/src/ConnectorsView.jsx`, `website/src/locales/connections.json`, `taskuary/connectorcatalog.json`, `website/browser/fixture_changes.py`, new `website/browser/jira-data-center.test.mjs`, `website/package.json`; after smoke, `docs/site/connections.md` and generated outputs.

**Interfaces:**
- Consume `ConfigJson.deployment` from earlier tasks through the existing `ChannelDetail`, config fields, `useCardDraft`, `onScreen`, `editedBoxes` and API routes.
- Deployment selector values are stable IDs, not translated labels. Missing remains Cloud.
- Data Center assistance uses the configured site's relative token-plugin URL. Available operations are inbound trigger/feed; no usable upstream-write/close-out capability. Old persisted Roles/Scope never override backend denial.
- Browser fixtures use fictional Jira data in the existing demo harness and register cleanup, page-error collection and fixture-escape assertions.

- [ ] Add rendered cases for both locales: select Data Center, type fictional credentials, Test unsaved fields, Save/activate, Sync, then observe issue links and Timeline rows; verify the backend recorded v2 Basic reads and no writes. The fixture supplies more than 25 updates and a denied-search scenario.
- [ ] Cover switching deployment without losing the typed site/account/token, changing locale without losing draft fields, Sync disabled with an unsaved deployment change, and saved secrets never reappearing in API responses/fields. Include the new browser file in the existing browser command.
- [ ] Implement a Jira-specific selector inside the existing Credentials step, register its field in draft dirty detection and choose help/AI-walk instructions from the current draft. Do not build a second card/client or generalize all connector fields.
- [ ] Translate authored setup/error guidance through existing locale presentation; do not translate Jira issue titles, descriptions or account/provider identifiers. Correct the stale claim that all Jira modes never write: Data Center is read-only; Cloud retains approved writes.
- [ ] Run the relevant focused browser cases, then `.venv\Scripts\python.exe -m pytest -q` from the root, `npm test`, `npm run test:browser` and `npm run test:browser:i18n` from website. Set `TASKUARY_TEST_PYTHON` to the intended venv; use the documented Windows browser workaround only if required. Report failures; do not silently narrow the suites.
- [ ] Separately open the actual demo browser surface, exercise the changed Credentials/Test/Sync path and observe the rendered result, both locales and page errors. Close the browser. Tests alone do not establish visual proof.
- [ ] After smoke succeeds, update `docs/site/connections.md` with Data Center setup, required underlying account permissions, read-only boundary, minimal-read test behavior and token replacement. Regenerate application, static demo and docs with `npm run build`, `npm run build:demo`, `npm run build:docs`; preserve generated files with their source and remove throwaway scaffolds.

## Current verification and approval boundary

The user approved implementation and selected the isolated worktree on 2026-11-04. Backend transport, paged ingestion, connector-bound identities and Data Center read-only gates are implemented. Ten initial consumer scenarios failed before implementation; the expanded 20-case Data Center suite passed. Existing affected Cloud/backend suites passed 93 cases before the additional regressions. A disposable-home executable smoke observed Test identity/search success, 27 ingested issues, zero repeated arrivals, zero writes, visible second-page HTTP 503, and recovery without duplication. A subsequent failing draft-source preservation regression exposed an existing DraftStore source write; the narrow fix passed.

Full backend run: 11,542 passed, 3 failed, 14 skipped, 2,839 subtests passed, with 44 warnings and fixture-thread/logging errors. Failures were `tests/test_core.py::StampTests::test_graphs_two_digit_fraction_normalizes` and `tests/test_imapmail.py::ImapTests::test_poll_parses_real_mime_keeps_the_uid_and_never_rereads` (date conversion expectations on this host), plus `tests/test_words.py::PlacesTests::test_no_server_sentence_types_a_path` (a source-wording scan matching an unrelated signin string). The source-wording detector and its now-unused AST helpers were removed rather than changing or re-pinning product copy. The two date behaviors are unchanged. This full run began before the draft-source fix; the final affected verification is recorded below. No full-suite green claim is made.

Final frontend logic suite: 1,447 passed. Jira rendered bilingual/draft, actual Test/Save/Sync/all-27-Timeline-rows, search-denial and migrated Cloud close-out cases: 4 passed. Existing locale browser suite: 3 passed. Actual isolated demo browser inspection exercised English and Chinese setup, Test, Save, Sync and expanded FYI with all 27 fictional issue rows; captured only fictional/demo screenshots and closed both browser fixtures. Browser test fixes addressed wrong hashes, MUI container-vs-input selectors, async Save completion, and the hidden setup rail/FYI expansion. The full `npm run test:browser` was started but its output collection was interrupted when the evaluation kernel exited 130; no surviving verification process or reliable final output remained. Do not claim that full browser suite passed.

Application, static demo and documentation builds succeeded (14 documentation pages, 146 sections), with the existing large-chunk/mixed-import warnings. User documentation now describes the verified Data Center read-only mode. Throwaway runner and staged documentation files were removed. Final affected backend run after the draft-source fix: 107 passed, one existing utcnow warning. Tracked changes and 48 new source/document/generated files were integrated into `C:/project/taskuary` without creating a commit or changing the running instance. Integrated verification: 36 Jira/write-back backend tests and all four changed-path browser cases passed. Live Jira access, token configuration and normal-instance restart remain outside this implementation authorization.

Company-server compatibility, actual token permissions, WAF handling for requests and live issue ingestion remain unverified. No real Jira request or live-home modification occurred. Any later company smoke requires separate authorization and uses the local skill script for minimal read-only reference checks. Never log account/token/issue payloads into this public repository.
