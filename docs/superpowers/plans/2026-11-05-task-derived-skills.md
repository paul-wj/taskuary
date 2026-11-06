# Task-derived Skills Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the host Agent's execution and delegation rules. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver AI-discovered, Agent-authored complete Skill packages with native Taskuary GUI review, safe namespaced publication and autonomous reuse by Taskuary/external Agents.

**Architecture:** Keep the existing Profile import and Playbook workflows unchanged. Add a Skill library domain that uses SQLite for candidate/generation/publication state and files for complete packages, reusing normal Agent tasks and proposal/verdict review. Add a native canvas browse page, AI discovery background work, task context catalogue and owned native discovery links; no second runner, API client, router or global state layer.

**Tech Stack:** Python/FastAPI/SQLite/stdlib filesystem; existing configured memory brain and file-capable Agents; React/MUI, Node node:test and existing Puppeteer harness.

**Spec:** `docs/superpowers/specs/2026-11-05-task-derived-skills-design.md`

## Global Constraints

- Python 3.10+; use the repository virtual environment explicitly on Windows.
- Frontend Node 22.12+ and npm; keep website/package-lock.json authoritative; no new runtime dependency unless existing libraries cannot implement a required behavior.
- Preserve compact code style, UTF-8, final LF newlines; no unrelated formatting or lifecycle changes.
- English/Chinese UI via existing t()/locale files; never translate task content, package bodies or provider identifiers.
- Use disposable TASKUARY_HOME and redirected native skill roots in all tests/smokes; never read or write the real home for validation.
- Rebuild taskuary/web/, site/demo/ and affected documentation output from source. Never hand-edit generated bundles.
- No publication/release/push or automatic Git commits are authorized by this feature request.
- This is an additive new feature: existing feature contracts, data, settings, permissions and task/agent/reply lifecycles must not change. No unrelated refactor or automatic migration/adoption of existing Profiles, Playbooks, Hub/metric/report Skills or native user Skills.
- Existing critical paths may only enqueue bounded feature work. Feature failure must not block existing work; never hold the store writer lock across AI/Agent/filesystem work. Without published managed Skills, ordinary Agent context stays unchanged.
- Record the existing-suite baseline before production edits; any new failure or unexplained existing-flow change blocks completion. Do not waive regressions or silently narrow verification.
- New lifecycle routes use `/api/skill-library/*`; existing `/api/skills/*` Profile import endpoints remain unchanged.
- Worktree creation requires owner consent if not already isolated. Finish this plan/design in the current checkout; carry the new documents to the selected implementation workspace without deleting the user's prototype files.
- Before changing exported symbols, use LSP references when available; re-read actual source windows before editing. Line references below are navigation aids, not edit anchors.
- Parent owns store/server/guard/proposals integration. Independent package/domain/UI slices may be delegated only after these contracts are fixed; delegated tasks skip checks mid-flight. Parent runs failing regressions before implementation and consolidated checks after integration.

## Review Focus

1. An Agent changes staging files or the formal Skill after the owner viewed a review: publish refuses the stale draft/base and retains the old complete package (Tasks 1/4).
2. A package hides traversal, Windows case collisions, link/reparse escapes, binary active content or oversized resources: reject unsafe packages; review valid binary resources as data, never execute (Task 1).
3. Native directory already holds a user Skill, a link from another Taskuary home, or a link manually retargeted after install: never overwrite/unlink it; show a conflict (Task 2).
4. Provider/Agent is unavailable, process stops, or server restarts during generation/publication: show an honest durable error/interruption, preserve review/state, and never fabricate completion or rerun authoring automatically (Tasks 3/4).
5. Duplicate clicks, fresh corrections and AI changes to a suggestion's title: no duplicate generation or re-offering of the same dismissed evidence, but materially new evidence can produce a new candidate (Tasks 3/4).

## File and interface map

New focused modules (names chosen here, not speculative existing files):
- `taskuary/skillpackages.py`: read/validate/snapshot/hash/diff whole packages; recoverable formal publication and owned native links.
- `taskuary/skilldiscovery.py`: bounded eligible evidence, configured-brain analysis, durable candidates, scheduling/single-flight.
- `taskuary/skillauthoring.py`: candidate acceptance, normal authoring task instructions, output collection, review revision and publication integration.
- `website/src/SkillsView.jsx`: native BrowseFrame suggestions/library/generation views and detail.
- `website/src/skillLibrary.js`: pure package-diff display/selection helpers only if needed by UI; no new state/client framework.

Existing integration owners:
- `taskuary/store.py`: additive schema and minimal dict-shaped persistence operations using existing writer/audit/live behavior. Existing semantic.py/reports.py files in `<home>/skills` remain untouched and are not adopted by namespace alone.
- `taskuary/server.py`, `guard.py`, `proposals.py`, `verdicts.py`: lifecycle routes and normal reviewed publish action; no new approval bypass.
- `taskuary/wrapup.py`, `context.py`, `agents.py`, `general.py` and server lifecycle: generation output hook, published catalogue, background discovery; modify only actual required consumers after references lookup.
- `website/src/sideNav.js`, `FeedView.jsx`, `TaskHubPage.jsx`, `CanvasBrowse.jsx`, `canvasLinks.js`, `reviewProposal.js`, `ReviewDecision.jsx`, `locales/views.json` (confirm current locale partition before writing): route and existing review rendering.
- Existing static demo fixtures, browser fixtures/scripts and user docs/generated output.

### Shared records and API contract

Use JSON-compatible snake_case domain records and project-standard store column naming; route serialization is the single mapping layer. IDs are integer SQLite primary keys. Digests are lowercase SHA-256 over relative path, bytes and relevant executable mode, excluding Taskuary internal state files.

- Candidate: `{id, action: 'create'|'update', slug, title, description, rationale, varies, target_digest: str|null, evidence: [{task_id, ref, title, reason}], fingerprint, state: 'suggested'|'accepted'|'dismissed', generation_id: int|null}`.
- Analysis: `{state: 'idle'|'running'|'ready'|'empty'|'no_provider'|'failed'|'interrupted', at, fingerprint, error}`; store catalogue/evidence fingerprints and attempt time separately from last success.
- Generation failure reasons distinguish package-collection/required-validation failures from Agent/process failure without adding new task status semantics. Both may use the existing generation `failed` state plus a structured error code; ordinary task completion still succeeds.
- Generation: `{id, candidate_id: int|null, task_id, slug, action, base_digest: str|null, draft_digest: str|null, review_id: int|null, state: 'generating'|'needs_review'|'returned'|'published'|'discarded'|'failed'|'interrupted', error, validation, published_digest: str|null}`. Task/run/session remain authoritative for process progress.
- Package detail: `{digest, files: [{path, change: 'added'|'modified'|'deleted'|'unchanged', binary, size, sha256, executable, before_text: str|null, after_text: str|null}], validation, missing_checks}`. Binary file content is served through a constrained attachment/download path, never rendered as HTML/SVG.
- Published: `{slug, name, description, digest, origin_task_ids, published_at, generation_id, bindings: [{cli, path, state: 'linked'|'unavailable'|'unsupported'|'conflict'|'failed', error}]}`.
- `GET /api/skill-library` -> `{analysis, suggestions, skills, generations}` (summary, no file bodies).
- `POST /api/skill-library/analyze` -> `{analysis}`; background, does not run LLM inline.
- Analysis is off by default. The first owner-triggered analyze records `auto_enabled=true`; `POST /api/skill-library/pause` sets it false. Tick must perform no model call or new state write before activation; no existing setting is changed.
- `POST /api/skill-library/suggestions/{id}/accept` with no Agent-selection payload -> `{generation_id, task_id}` using the existing default configured local Agent CLI; repeated same acceptance returns its recorded generation, not a second run.
- `POST /api/skill-library/suggestions/{id}/dismiss` -> candidate state.
- `POST /api/skill-library/skills/{slug}/improve` with `{feedback, base_digest}` -> generation/task IDs using the same default Agent.
- `GET /api/skill-library/generations/{id}` -> generation plus immutable package detail when available.
- `POST /api/skill-library/generations/{id}/return` with `{feedback, draft_digest}` -> same generation/task reference, new authoring revision, no old review left pending.
- `POST /api/skill-library/generations/{id}/discard` with `{draft_digest}` -> state; no effect on formal Skill.
- `GET /api/skill-library/skills/{slug}` -> published record and file listing; file/download reads accept a validated relative path and exact revision.
- Publish uses existing `POST /api/reviews/{rid}/decide`; proposal `{action:'publish_skill', generation_id, digest, base_digest}`. No alternate publication route.
- Submission is the existing task-bound completion protocol and automatic wrapup collection; no new Skill submission endpoint/flag and no caller-supplied filesystem roots.
- Skills view refetches coalesced `skill-library-changed`, and normal `task-changed`/review events for linked generation tasks.

---

## Pre-implementation baseline and isolation gate

- [ ] After workspace selection and before production edits, run the existing backend and frontend suites plus applicable existing browser suites in disposable homes; record commands/results and any pre-existing failures. Do not rerun user-reported failures merely to confirm them.
- [ ] Preserve old API behavior and seeded settings. Add behavioral isolation cases for ordinary task completion while discovery throws/is busy, unchanged existing approvals, preserved Profile import/Playbook/report metric Skills, and no new prompt block when the managed library is empty.
- [ ] Prove the new background path does not hold a writer lock across provider calls or perform package/native-directory work synchronously on existing close/request paths. Use controlled barriers rather than brittle timing thresholds.

### Task 1: Durable whole-package storage and reviewable snapshots

**Files:** create `taskuary/skillpackages.py`, `tests/test_skillpackages.py`; modify `taskuary/store.py` schema/method sections and `tests/test_store.py` only if existing persistence coverage requires it.

**Interfaces:**
- Produces `skillpackages.inspect(root: Path) -> dict`, `snapshot(store, generation_id: int) -> dict`, `diff(store, generation_id: int) -> dict`, `catalogue(store) -> list[dict]`.
- Store owns candidate, analysis, generation, published registry, binding and publication-journal records. Use `skill_library_*` method prefix; methods return project-standard dicts. CAS transitions/digests occur in writer transactions, not read-then-unlocked updates.
- Package limits are exactly 512 files, 32 MiB per file and 128 MiB total, measured uncompressed; implement exact-boundary/limit+1 tests. Required checks are fixed in code, not authored by the Agent. Use Python AST / JavaScript parse-only checks without executing package scripts; missing required runtimes/check evidence blocks publication with an explicit prerequisite.

- [ ] Write `test_package_snapshot_keeps_binary_template_script_examples_and_references`, asserting exact file hashes/bytes, preserved meaningful executable mode and added/changed/deleted diff against the prior package.
- [ ] Write boundary tests for traversal/absolute paths, symlink/junction escapes, case collisions, broken local resource links, missing/invalid frontmatter, exact limits and limit+1. Assert rejection leaves both formal package and registry unchanged.
- [ ] Run `.venv/Scripts/python.exe -m pytest -q tests/test_skillpackages.py` and observe failures for missing package behavior, not a fixture/import typo.
- [ ] Implement immutable snapshots separated from writable Agent staging. Reuse existing frontmatter parsing where sufficient; never fork Profile conversion or assume a text-only package. Validate explicit local Markdown/resource references, not arbitrary business semantics.
- [ ] Reopen temporary SQLiteStore and assert generation/package metadata survive; changing one resource changes digest and invalidates prior review. Record missing business validation as missing, not passed.
- [ ] Assert malformed Python syntax blocks approval even if the Agent claims success; a bare validation claim has missing/unverified evidence, never passed. Validate local references/binary resources without executing active content.
- [ ] Run focused tests; review only this task's changed lines. Do not commit unless the owner later asks.

### Task 2: Reviewed formal publication and native discovery ownership

**Files:** extend `taskuary/skillpackages.py`; create `tests/test_skill_publication.py`; modify `taskuary/clis.py` only for documented native-root metadata if that is the existing catalogue's proper home.

**Interfaces:** consumes Task 1 snapshots/store; produces `publish(store, generation_id: int, digest: str, actor: str) -> dict`, `recover(store) -> list[dict]`, `bindings(store, slug: str) -> list[dict]`, `reconcile_bindings(store, slug: str) -> list[dict]`.

- [ ] Write publication tests: exact multi-file snapshot becomes canonical only on approval; duplicate approval does not reapply; changed base or draft is refused; source directory cannot be selected by request parameters.
- [ ] Write crash-injection persistence tests at prepared/journaled/swapped/committed boundaries. After reopen/recover, registry references one complete approved revision and prior content is recoverable; no partially copied live package.
- [ ] Prove publication serialization with two independent processes/store connections. Use an OS per-skill file lock; journal intent commits before swap, registry commits after verified swap, native linking is an idempotent final step. Crash recovery checks live digests/journal before completing or restoring and never deletes unexplained content.
- [ ] Write real temporary POSIX-link or Windows-junction tests as appropriate for the host, plus platform-isolated tests for the other adapter. Cover no privilege/failure, unrelated directory, dangling or manually retargeted link, another Taskuary home's managed entry, and no removal through a reparse point.
- [ ] Recompute link/junction target ownership from disk, not binding rows. Foreign/unidentifiable dangling links remain conflicts; only a target identifying this exact home and registry-owned canonical path can be repaired. Test deleted/stale DB records and two homes publishing the same slug without altering each other's files.
- [ ] Run focused tests to observe missing behavior; implement per-skill serialization, journaled whole-directory replacement and recovery. Reject unsafe paths and stale digests. Publication code never executes returned scripts.
- [ ] Verify native paths against primary CLI documentation. Codex uses `~/.agents/skills/taskuary-<slug>`, Claude uses `~/.claude/skills/taskuary-<slug>`; both support linked directories. Research the other configured installed CLI types, add confirmed adapters, represent unsupported native discovery honestly. All target roots are dependency-injected for tests.
- [ ] Test a blocked native target reports its exact binding failure while preserving a valid canonical publication; do not report it installed or copy an uncontrolled fallback. Successful bindings are owned by this home and cannot broaden task/tool permissions.
- [ ] Run package/publication regressions and smoke a linked package's script against synthetic data from the native path in a disposable home; no real user discovery directory writes.

### Task 3: AI-authored suggestions without task selection

**Files:** create `taskuary/skilldiscovery.py`, `tests/test_skilldiscovery.py`; modify `taskuary/store.py`, `taskuary/server.py` lifecycle and eligible task-change notification path.

**Interfaces:** consumes catalogue/store; produces `gather(store) -> dict`, `analyze(store, llm=None) -> dict`, `schedule(store, manual: bool=False) -> dict`, `tick(store) -> None`. Catalogue/evidence snapshot validation bounds model output.

- [ ] Write behavior tests with injected provider boundary: real completed task records and manual corrections produce valid create/update candidates with in-snapshot evidence; invented task IDs, missing targets and malformed output fail explicitly. Assert no candidate is fabricated on provider failure/no-provider/empty result.
- [ ] Seed pre-existing metric/report/workflow Skills without standard frontmatter. Discovery may not target them, library views exclude them, and a complete new publish cycle leaves their bytes and existing readers unchanged; prefix-only directories without registry ownership also cannot be adopted.
- [ ] Test coding methods are eligible; stranger-origin tasks and Skill-authoring tasks are excluded. Assert raw sensitive source content is not returned in suggestion summaries or logs.
- [ ] Test single-flight manual/automatic calls, 10-minute automatic minimum, maximum 50 recent eligible tasks, unchanged fingerprint suppression, dismissed/accepted evidence suppression independent of model-changed titles, and reconsideration after materially changed evidence.
- [ ] Pin suppression to code-validated action/target, sorted evidence-task IDs and source content/outcome/correction digest; model rephrasing over identical evidence is suppressed, changed/new evidence may be reconsidered. All generation-registry task IDs are excluded before the model call.
- [ ] Run tests failing first; implement prompt based on actual result/process/correction evidence and existing Skill descriptions. No embedding requirement, keyword similarity classifier, fixed repetition threshold, new provider or automatic publication.
- [ ] Schedule work outside close/request path using existing lifespan/worker conventions. Persist attempted/running/failed/finished states and due evidence; restart makes interrupted analysis explicit and safely schedules a later read-only analysis, not a mutating authoring rerun.
- [ ] Run discovery/persistence tests and a temporary real-provider analysis smoke if an eligible configured provider is available without reading live task data; otherwise record the unmet provider prerequisite, not fabricated AI evidence.

### Task 4: Actual Agent authors a package and existing review publishes it

**Files:** create `taskuary/skillauthoring.py`, `tests/test_skillauthoring.py`, `tests/test_skill_library_routes.py`; modify `taskuary/server.py`, `guard.py`, `proposals.py`, `wrapup.py`/general completion hook and existing review test files as needed.

**Interfaces:** consumes Tasks 1–3; produces `accept(store, candidate_id: int, actor: str, agent: str|None=None) -> dict`, `improve(store, slug: str, feedback: str, base_digest: str, actor: str, agent: str|None=None) -> dict`, `collect(store, task_id: int) -> dict|None`, `return_to_agent(store, generation_id: int, feedback: str, digest: str, actor: str) -> dict`, `discard(store, generation_id: int, digest: str, actor: str) -> dict`, `reconcile(store) -> None`.

- [ ] Write tests asserting acceptance creates exactly one ordinary Agent task and owned staging directory, includes generalized multi-task evidence and full current package for updates, and records the existing task ID. Missing file-capable Agent refuses with an actionable prerequisite and does not manufacture a Profile or fake generation.
- [ ] Test successful completion collects every package file and queues one `publish_skill` action review; mere session stop/failure does not become a completed Skill. Validation receipts associate commands/outcomes with actual task records, distinguish failed/missing/not-applicable checks and do not trust a bare Agent sentence as passed evidence.
- [ ] Force scan/I/O/required-check failures during explicit task completion: ordinary completion still succeeds, generation records the exact failure, and no publishable review appears. Collecting unchanged output twice yields one review; changed output supersedes the old one. Non-generation task completion performs no package scan or native-directory I/O.
- [ ] Test agent tokens cannot accept/publish/approve, submit another task's output, widen staging roots or change bindings. Owner approval is the existing verdict/proposal execution; double presses, moved base, resource edit after review, discard and return superseding old review are covered.
- [ ] Observe failing regressions, then implement through normal configured dispatch/session/output/waitroom/continue roads. A generation prompt requests standard SKILL.md and necessary scripts/references/examples/assets, executable validation with synthetic inputs, no embedded credentials and no direct publication.
- [ ] Add owner-classified API routes in Shared API contract, existing proposal registration/validation/execution, immutable snapshot/digest checking and live events. Implement `publish_skill` execution via Task 2, not a second decision endpoint.
- [ ] Reconcile persisted generation after restart without rerunning mutations. Keep task/agent/review lifecycles independent: discarding a Skill draft does not falsely complete its source tasks; generation reviews remain visible through existing work/review mechanisms.
- [ ] Run authoring/routes plus existing guard, verdict, playbook and task-lifecycle regressions. Smoke the normal configured CLI path generating a package in a disposable home if an eligible CLI/provider is available; record exact evidence or missing prerequisite.

### Task 5: Native Skills browse surface and whole-package review

**Files:** create `website/src/SkillsView.jsx`, only necessary pure helpers in `website/src/skillLibrary.js`, `website/browser/skills-library.test.mjs`; modify sidebar/icon/BROWSED, `CanvasBrowse.jsx`, `canvasLinks.js`, `reviewProposal.js`, `ReviewDecision.jsx`, current appropriate locale JSONs, browser fixture and curated `package.json` browser script.

**Interfaces:** consumes the Shared API contract and existing `api`, `onLive`, `BrowseFrame`, `openAppLink`, normal task/review rendering. Deep links: `#skills`, `#skills=suggestions`, `#skills=library`, `#skills=generations`, with selected object carried as `&open=<kind>:<id-or-slug>`; extend hash/parser roundtrip in one place.

- [ ] Add/update existing route behavior tests for Skills section/detail roundtrips and Back/Forward. Do not write tests asserting copied text, source strings, import wiring or arbitrary rendered defaults.
- [ ] Implement native BrowseFrame sections, AI recommendation rows/detail with rationale and collapsed evidence links, create/update actions and no task selector. Distinct states: no work, no AI, analysis running/failed/empty, no Agent configured, generation working/failed/interrupted, review waiting and publication with partial native-binding failures.
- [ ] Display the normal generation task/session/process link. Whole-package review uses the existing decision road; show file changes, text before/after, safe binary downloads, required/failed/missing validation, exact reviewed digest and base-change refusal. Failed or missing required checks block approval. Return passes feedback to the same Agent task and retires old review. Do not add a separate approval control path.
- [ ] English/Chinese authored interface strings use existing locale system. Preserve skill bodies/paths/identifiers and task content verbatim; theme tokens and shared controls, compact layout, no new palette or global state.
- [ ] Browser fixture seeds fictional joined task/candidate/review/file state under isolated home and native roots, not real provider or native directory writes. Exercise AI suggestions -> accept -> task/progress -> multi-file review -> return -> new revision -> approve -> library, plus update/delete diff, failed provider, stale review, navigation/history and mobile in both locales. Assert fixtureEscapes/page errors are empty; screenshots only demo/fictional fixture.
- [ ] Run the actual rendered surface through browser helpers and inspect screenshots; run focused browser case and relevant Node suite once after integration, not source/wiring tests as visual proof.

### Task 6: Subsequent Agent reuse, complete demo and end-to-end delivery

**Files:** modify only required `taskuary/context.py`, `agents.py`, `general.py` seed/catalogue consumers after references lookup; existing `taskuary/reports.py` skill read only if compatibility needs it; add focused reuse regressions. Modify static demo fixtures/recorder, `docs/site/` user documentation and its manifest, relevant README/engineering contracts and regenerate app/demo/docs output.

**Interfaces:** `skillpackages.catalogue(store)` supplies published names/descriptions/absolute SKILL.md paths; package bodies/resources stay on disk and are loaded on demand, not pasted into every prompt.

- [ ] Write tests proving a new Taskuary Agent session can discover the approved package including resource paths, unpublished drafts are absent, discarded/failed generations do not enter catalogue, and unchanged existing Profiles/Playbooks/report metric skill behavior is preserved. No forced task routing or requirement to invoke a skill.
- [ ] Add the compact catalogue/pointer using existing context paths and expose safe published file reads to API-backed Agents if they lack filesystem access. Preserve permission/stranger boundaries; no credentials in generated skill invocation hints.
- [ ] Verify a compatible external CLI discovers an approved namespaced linked package under redirected temporary user roots; external-session refresh behavior is documented. Exercise its script with synthetic example data and verify the actual output, not merely file existence. Never use live home or native skill directories in QA.
- [ ] Seed honest static-demo multi-file suggestions/library/review data and blocked external actions. Document automatic analysis cadence, provider data flow, Agent prerequisite, package review/validation, global exposure, link conflicts, same-user boundary and directory ownership.
- [ ] Smoke existing task creation/completion, review edit/reject/approve, isolated connector sync/report execution, Hub, Playbook/Profile import and navigation alongside Skills. Compare observed behavior with the baseline; feature analysis/provider/Agent failures must remain contained. New failures are blocking, not merely reportable.
- [ ] Run `.venv/Scripts/python.exe -m pytest -q`; from website run `npm test`, `node --test browser/skills-library.test.mjs`, then relevant complete curated browser suites (both locales), `npm run check:deadends`. Report existing failures by name; never silently narrow verification. Do not assume lint:undef is installed.
- [ ] Run `npm run build`, `npm run build:demo`, `npm run build:docs` and retain generated output with its sources. Smoke the built application/demo in an isolated runtime and exercise discovery/authoring/review/publication/reuse paths with actual available provider/CLI as allowed.
- [ ] Remove throwaway validation scaffolds created during implementation, keep requested design/plan, update docs with observed behavior, and report exact exercised checks and any unavailable real-provider prerequisite. No release script, commits or pushes.

## Delivery gates

- Worktree choice and source control safety are settled before implementation.
- Mandatory non-regression acceptance is satisfied with before/after evidence: additive database changes preserve populated stores; old APIs/settings/permissions/ordinary flows remain intact; new-feature failure cannot prevent existing work. No completion claim while a newly introduced regression remains.
- Every acceptance item in the linked spec maps to Tasks 1–6; no text-only Skill shortcut, mock production generation or user task picker.
- Structural checks are deterministic; business validation is evidence-backed and its limitations visible. Publication cannot be mistaken for successful native installation if a binding failed.
- Documented external-native behavior requires installed CLI/provider proof when available; if unavailable, finish all reachable implementation and isolated checks, and state exactly which live prerequisite is missing. Do not claim a fixture/mock as real Agent authoring.

## Observed pre-implementation baseline (2026-11-05)

Workspace: isolated `feat/task-derived-skills`, based on `cb987c2`. No production code was changed before these runs. Shared installed dependencies are referenced by local junctions; all application/test homes are isolated by the repository fixtures.

| Existing suite | Command | Observed result |
| --- | --- | --- |
| Backend | `.venv/Scripts/python.exe -m pytest -q` | 11768 passed, 20 failed, 14 skipped; 2831 subtests passed; 41 warnings |
| Frontend | `npm test` in website | 1478 passed, 1 failed, 1479 total |
| Browser | `TASKUARY_TEST_PYTHON=<project venv> TASKUARY_BROWSER_PLAIN_ENV=1 npm run test:browser` | Incomplete: command deadline reached; 16 top-level failures reported through test 186, no final suite totals |

These are baseline failures, not Skill-feature regressions. Their causes have not been comprehensively investigated. The owner selected “record the baseline and continue implementing Skills”; do not repair unrelated existing code or tests. Compare post-change results with these known failures; any new or expanded regression still blocks delivery. Remaining browser cases are unverified and relevant coverage must be completed rather than described as passing.

Frontend failure: `website/test/resultEnded.test.mjs` / `an interrupted run's Result says how it ended`: a source-regex assertion does not match the current translated expression. This is not evidence that the actual rendered behavior was exercised or found broken.

Backend failing tests (including failing subtest cases as emitted by pytest):
- `tests/test_api.py::ApiTests::test_a_reply_can_be_opened_on_any_message`
- `tests/test_api.py::ApiTests::test_generate_with_ai_works_for_a_taskless_fyi_reply`
- `tests/test_assistant_queries.py::EverydayAsks::test_every_answer_that_acts_says_what_it_did` (agent-preparation ask)
- `tests/test_assistant_queries.py::EverydayAsks::test_taskuarys_road_does_what_a_good_answer_asked` (untick and agent-preparation asks)
- `tests/test_chat_proposals.py::ProposalTests::test_confirming_runs_it_once_and_a_second_click_is_the_same_receipt`
- `tests/test_chat_proposals.py::InterpretationTests::test_a_reply_request_drafts_at_once_and_sends_nothing`
- `tests/test_computer_use_ux.py::TheGeneralAgentsBrowserIsHeld::test_a_claude_chat_with_a_browser_gets_its_hook_and_the_hold_promise`
- `tests/test_computer_use_ux.py::TheGeneralAgentsBrowserIsHeld::test_a_codex_chat_is_told_to_ask_first_never_that_it_is_held`
- `tests/test_concierge.py::DecisionTests::test_the_owners_words_about_the_item_are_a_decision_the_model_names_and_a_proposal_carries_out`
- `tests/test_core.py::StampTests::test_graphs_two_digit_fraction_normalizes`
- `tests/test_imapmail.py::ImapTests::test_poll_parses_real_mime_keeps_the_uid_and_never_rereads`
- `tests/test_kinds.py::test_no_module_types_the_kinds`
- `tests/test_lifecycle.py::LifecycleTests::test_from_mail_to_closed_task`
- `tests/test_memory_edit.py::test_visualize_gets_the_five_subjects_with_their_real_readers_and_your_own_lines`
- `tests/test_reply_needs_a_correspondent.py::NoOneToAnswerTests::test_a_channel_that_cannot_CARRY_a_reply_still_drafts_one`
- `tests/test_thread_change_replans.py::ThreadChangeReplans::test_a_second_line_while_the_turn_is_live_queues_once`
- `tests/test_thread_change_replans.py::ThreadChangeReplans::test_someone_else_answering_wakes_the_agent_once_with_the_change`
- `tests/test_thread_change_replans.py::ThreadChangeReplans::test_the_owners_own_teams_reply_wakes_it_too`
- `tests/test_writing_rule_reaches_drafts.py::test_the_assistant_says_where_it_saved_it`

Browser baseline failures reported before timeout (do not describe the incomplete run as a full-suite result): `advisor-strip-press.test.mjs`, `agent-closed.test.mjs`, `agent-head-fits.test.mjs` (1600/1440 widths), `agent-presses.test.mjs` (general Agent send/continue/run-another), `ai-cards.test.mjs`, `assistant-sees-card.test.mjs`, `chat-window.test.mjs`, `connections-scroll.test.mjs`, `continue-shows-turn.test.mjs`, `delivery-state.test.mjs`, `demo-journey.test.mjs`, `hand-signature.test.mjs`, `new-sheet.test.mjs`, `pill-small-laptop.test.mjs`, `result-plan.test.mjs`, `row-draws-once.test.mjs`. The recorded output reached test 186 before the command timeout; remaining cases are unverified, not passing or skipped.

## Observed implementation and acceptance (2026-11-06)

Implementation remains in the selected isolated worktree. No commit, push or release was performed. The pre-existing failures above remain outside this feature's repair scope.

| Check | Exercised result |
| --- | --- |
| Focused backend integration | 230 passed, 2 subtests passed across Skill state/packages/discovery/authoring/context/routes/review/background tests and existing guard, toolbox, context, Playbook, unpack and General Agent regressions. |
| Focused rendered Skills flow | `node --test browser/skills-library.test.mjs`: 2 passed, covering English and Chinese suggestions, Agent-task progress, whole-package review, return, revised approval and published resources with isolated provider/Agent boundaries. This is not a real-provider authoring claim. |
| Full frontend logic | `npm test`: 1479 passed, 1 failed, 1480 total. The only failure is the same pre-existing `an interrupted run's Result says how it ended` source-regex assertion. |
| Existing dead-end audit comparison | Exact pre-feature `cb987c2` and feature runs each reported the same 101 findings; multiset comparison found no added or removed finding. Both audit commands fail on these existing findings; neither is described as green. |
| Windows publication/reuse smoke | A complete five-file package was published and discovered through a real temporary Windows directory junction; its Python script consumed synthetic input and returned `{"difference": 5}`. Unrelated user directories were not touched. |
| Cross-process publication smoke | Two independent Python processes/store connections produced `published` and `stale_refused`; the final registry/directory represented one complete revision. |
| Authoring workspace smoke | Normal General Agent dispatch used the generation working directory; an unrelated task was rejected. The external model boundary was simulated. |
| Production builds | `npm run build` and `npm run build:demo` completed; Vite reported its existing mixed-import/chunk-size warnings. Generated app and static-demo output was retained. |
| Built static-demo surface | Opened the rebuilt demo in a real browser, inspected the native Skills GUI and published-package file list (`SKILL.md`, script, example, reference and binary asset); no page errors. All contents were explicitly fictional demo data. |

Two final integration fixes are scoped to registered Skill-authoring tasks: returning/resuming a CLI (including failed native resume) keeps its working directory and generation environment; completed authoring tasks remain visible while their publication review is pending and are released only after the decision when no other work/decisions remain. Ordinary completed source tasks and the global review visibility filter are unchanged. The focused backend and both-language browser results above include these fixes.

Live-provider limit: the installed Claude CLI in the redirected disposable user environment returned `Not logged in · Please run /login`. A real authenticated Agent's package generation and external-session native loading therefore remain unverified. Publication, synthetic script execution, real junctions, simulated-boundary authoring and rendered UI proof are recorded separately rather than presented as authenticated model execution.

The original browser baseline deadline was resolved for its previously unverified tail by extracting exact revision `cb987c2` to a disposable directory and running the curated files from `send-*` onward with `node --test --test-concurrency=3` and the same isolated browser/Python environment. That supplementary baseline finished: 93 tests, 77 passed, 16 failed across 44 top-level cases. Existing failures were confirmed in `send-stays-on-closeout.test.mjs`, both sign-in retry cases in `setup-signin-retry.test.mjs`, `side-by-side.test.mjs`, `state-matrix.test.mjs` (the same 22 failing cells), `task-page.test.mjs` and all three `view-height.test.mjs` cases. These are additional recorded baseline failures, not new Skill-feature failures or a claim that the original timed-out baseline had finished.

Final full-suite comparison after the scoped fixes:

- Backend `.venv/Scripts/python.exe -m pytest -q`: **11819 passed, 20 failed, 14 skipped; 2831 subtests passed**. Comparison of all `FAILED` and `SUBFAILED` identities against the original baseline found the same 20 failures, with no added or removed failure.
- Curated `npm run test:browser`: **301 tests, 263 passed, 38 failed; no cancellation or skips**. This run completed rather than stopping at the earlier command deadline. Its failing files/cases are covered by the original baseline and the supplementary untouched-baseline runs. The only initially unmatched case, `next-bounce.test.mjs`, was then run on untouched `cb987c2` and reproduced the same line-54 assertion: the initial rail has one processing row when the test requires two. It remains an existing failure, not a passing navigation proof.
- The nine top-level failures in the supplementary browser tail match the feature run's corresponding case/file identities exactly, including the 22 state-matrix cells. Existing failing UI assertions were not rewritten or suppressed to make the suite green.
- Final `npm run build:docs` completed: 15 pages, 157 sections. Updated Skills source documentation and generated output include authoring-task review visibility and settlement conditions; the changelog records the feature under Unreleased without assigning a release version.

No newly introduced failure was identified in these comparisons. This is bounded regression evidence, not a claim that the repository's existing suites are all green or that authenticated live-provider authoring has been verified.
