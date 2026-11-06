# Task-derived Skills: AI discovery, Agent authoring, owner-reviewed publication

Date: 2026-11-05
Status: implementation design derived from the owner's approved conversation and native-style GUI mockup; not a claim of shipped behavior.

## Goal and ownership

Taskuary notices repeatable work in completed tasks and shows AI-authored recommendations. The owner chooses whether to create a skill or improve an existing one. An actual configured Agent generates the complete package. The owner reviews the package, requests changes or approves publication. Subsequent Agents decide whether to use published skills, including sessions started outside Taskuary.

A Skill is a portable method/package, not a worker Profile, a transcript, a Hub fact or an executable scheduled workflow. Keep those existing features intact. Do not convert new Skills to Profiles or automatically migrate old Playbooks/third-party imported Profiles. Skills never grant tools or bypass approval boundaries.

## Mandatory non-regression boundary

This is an additive new feature. It must not change existing feature contracts or business behavior. No unrelated refactor, automatic migration/adoption of existing Profiles, Playbooks, Hub entries, metric/report Skills or native user Skills is in scope. Existing routes, configuration values, permissions, task/agent/reply state transitions and persisted records retain their meanings.

Integration hooks only enqueue/mark bounded background work or handle tasks explicitly recorded as Skill-authoring tasks. No new AI call, directory scan, global link publication, blocking wait or package validation is allowed on existing task completion/request/startup critical paths. Never hold the store writer lock across model calls, Agent execution or filesystem publication. Discovery/generation failures must remain contained and observable without failing or delaying ordinary task completion, message ingestion, review decisions, connector sync or report execution. With no published managed Skill, ordinary Agent context remains unchanged; publishing a Skill adds optional discoverability, not forced invocation or a new permission grant.

Schema changes are additive and preserve populated databases. Filesystem writes are confined to newly owned Skill state/draft/package paths and explicitly owned native links; no rewriting existing settings, user Skills or operational documents. Existing behavior must work when the new analysis has no provider, fails, is busy or is disabled/unavailable.

Non-regression is a release gate, not a theoretical guarantee: establish and record the existing-suite baseline before production edits; add focused isolation regressions; run backend, frontend and relevant browser regressions after integration; smoke the existing task, review, connector/report, Hub, Playbook/Profile import and navigation surfaces alongside the new path. Any new failure or unexplained behavioral change blocks completion and must be fixed, not waived or hidden by narrower checks. Record pre-existing failures separately without attributing them to this feature.

## Required user experience

- Add Skills after Hub in the existing FeedView sidebar, opening an Assistant canvas browse surface. Preserve the rail, Back/history/deep links, mobile layout and native Beacon theme. No new top-level Chat/Board/Game view, independent dashboard or generated HTML UI.
- Sections: Suggestions, existing Skills, generation records. AI groups and summarizes tasks; there is no task picker/checklist in the discovery or generation flow.
- Suggestion: AI-written reusable method, why it repeats, evidence task links, what varies, recommended create/update target and expected changes. Evidence is collapsible and read-only.
- Owner actions: ask Agent to generate/improve, dismiss. AI re-analysis is available; analysis/error/empty/no-model states are distinct. No suggestions is a legitimate result, never fabricated examples in production.
- Accepting a suggestion creates a normal Taskuary Agent task with real progress, errors and process records. Generation records link to it. Return-to-Agent reuses that task/session with the owner's feedback.
- Review lists every added/modified/deleted file, text diffs, binary metadata/downloads, validation evidence and missing checks. The draft is explicitly unpublished. Owner can approve the exact reviewed revision, return for changes, or discard. Existing formal Skill remains unchanged until approval.
- Approved Skills list purpose, package files, originating task links, published revision and native discovery/link status. An explicit improve action may also initiate an Agent task for an existing Skill without manually selecting source tasks.

## Complete package, provenance and privacy

Canonical published directory: `<TASKUARY_HOME>/skills/taskuary-<slug>/`. The frontmatter name matches the directory and uses the Taskuary namespace. Require valid nonempty `name` and `description`, plus useful instructions in `SKILL.md`; preserve standard portable frontmatter, not vendor-specific executable hooks.

Library ownership is an explicit published-registry row plus the `taskuary-` name, never a folder scan or prefix alone. List/update only registry-owned packages. Reject a create colliding with any unowned canonical directory. Existing metric/report/workflow Skills remain valid under their existing readers, even if they have no standard frontmatter, and never become update targets for this feature.

The Agent chooses additional package files according to the job: scripts/, references/, examples/, assets/ and other necessary safe relative paths. Do not force empty folders or pretend every Skill needs a script. References inside the package must resolve. Preserve binary templates/resources and executable modes where the OS supports them; review binary hashes/sizes rather than rendering active content.

Store origin task IDs, candidate, authoring task, base/draft/published hashes, publication decisions and native bindings in SQLite. Package reference material contains only needed, generalized and credential-scrubbed material, not wholesale mail/transcript dumps. Examples use synthetic data. Original evidence remains in Taskuary and is linked from the GUI; outside Agents must not need live API credentials embedded in a package.

Unpublished output lives under `<TASKUARY_HOME>/skill-drafts/<generation-id>/`; historical approved snapshots/journal data live outside the discovery root. Package scan rejects absolute/traversal paths, symlink/reparse-point escapes, special files, case-fold path collisions and references outside the package. Enforce bounded file counts/bytes with actionable errors; use generous documented limits selected during implementation and test exact boundaries. Credentials must not enter production logs, fixtures or repository artifacts.

Package limits are 512 regular files, 32 MiB per file and 128 MiB total uncompressed bytes; exact limits pass, larger packages are refused before snapshot/publication. Required checks are defined by code, not by an Agent-provided `required`/`inapplicable` flag: package safety, frontmatter, resource resolution and applicable parse-only script syntax checks. Python uses AST parsing without running the script; JavaScript uses `node --check` without executing it when the runtime is available. If a necessary checker/runtime is unavailable, show the unmet required check and prerequisite rather than claiming success. Other script languages require recorded appropriate validation and an explicit missing state if unavailable; business validation is recorded evidence, not proof inferred from model prose.

Generating executable content is not permission for Taskuary to run arbitrary returned commands. The authoring Agent performs job-relevant validation with synthetic inputs in its normal execution environment and records commands, outcomes and evidence on the task. Taskuary performs structural/package checks itself. Failed or missing required checks block publication; inapplicable business validation is shown as such, never claimed passed. Publication does not execute package code. A same-user CLI can access that user's filesystem: staging and route guards are not an OS sandbox, and documentation must say so.

## AI discovery

Use the existing configured memory/reflection brain, without a new provider or embedding dependency. Read eligible completed work, result/process evidence, human corrections and the published Skill catalogue. Include coding tasks: reusable debugging/migration/testing methods are in scope. Exclude Skill-generation tasks themselves and stranger-origin work, using existing origin policy.

To preserve existing behavior and data-flow consent, discovery is off until the owner starts it in Skills. That explicit action runs an analysis and records feature-owned auto_enabled state; Pause disables future passes without cancelling an active read-only pass. Only after activation does the existing background clock schedule single-flight analysis on startup/new completed evidence, coalesced with a 10-minute minimum automatic interval. No LLM call happens in the task close/request path. Initial analysis uses at most 50 eligible completed tasks from a bounded recent-work window; later batches include new/changed evidence plus this bounded context. Record the evidence fingerprint and catalogue revision; unchanged evidence does not cause new automatic calls. Manual re-analysis uses the same service and still single-flights.

The AI judges repetition and usefulness, including whether the best action is update or no suggestion. Do not use shared-word thresholds or a required task repetition count to manufacture candidates. Code validates task IDs and update targets against the supplied snapshot. Persist candidates, status, evidence fingerprints and analysis outcomes; suppress exact re-offers of accepted/dismissed evidence, while materially new evidence can yield another recommendation. No provider, malformed answer and provider failure remain explicit states; no heuristic fallback. Background failures do not prevent task completion.

Compute suppression keys in code from the validated action/update target, sorted evidence-task IDs and a digest of those tasks' relevant content/outcomes/corrections. Changing the model's title or wording cannot bypass suppression. Exclude every task referenced by the generation registry before assembling model input. Model-emitted updates to an unowned/non-library package are rejected.

## Agent generation and review integration

Reuse normal configured file-capable Agent dispatch and task/session lifecycle. Here file-capable means the existing default configured, resolvable local Agent CLI, not an API-only chat model or a new worker category; this feature does not introduce another Agent picker. Give the authoring Agent a Taskuary-owned staging working directory, read-only sanitized evidence context and existing package snapshot for an update. Its instructions require a complete self-contained Skill, meaningful validation and an output receipt; not a JSON response pretending to be an executed task. No separate LLM-to-files runner.

If no file-capable Agent is configured, show that prerequisite and a connection/setup link; do not silently create a Profile or replace real generation with text stubs. The Agent can create prose-only or multi-file packages. All new Skills use the same path.

Submission is the Agent's existing task-bound completion protocol (for example `taskuary --done`), not a new Skill submit route or CLI flag. The normal wrapup/outputs hook collects the complete staging package, snapshots it and queues a normal review proposal with a generation ID and exact digest. Pending review is immutable: further draft edits invalidate it. Existing completion guards verify the caller owns the authoring task; the Skill collector resolves its root from the generation row, never a request-supplied path. Owner-only proposal execution publishes; repeated/stale approvals and concurrent update bases are refused or return the already recorded same result without applying twice. Returning to the Agent retires the obsolete review and creates a new revision after revalidation. A generation row's task ID is the authoritative exclusion marker for AI discovery.

Collection is failure-contained and idempotent. Non-generation tasks return immediately without package I/O. Invalid output, I/O failure or missing checks record a generation failure and reason without failing the existing completion operation or queuing a publishable review. A repeated collection of the same snapshot returns its existing review; changed output creates a new revision and retires the prior review. The owner returns the existing task to the Agent to repair a failed package; no separate automatic authoring retry.

Do not infer completion from a stopped session. Restart reconciles persisted generation records against normal task/session facts; interrupted work is visible, not reported done. Do not automatically rerun a mutating authoring task after a crash.

## Publication, native discovery and task reuse

One authoritative formal package; no independently mutable copies. Publish a checked snapshot with a per-skill lock, persisted journal and recoverable whole-directory replacement. Keep the prior complete snapshot until the new package and registry are consistent. Test crash recovery around filesystem/SQLite boundaries; do not claim a cross-filesystem transaction or change individual live files in place. Refuse an update if its base digest changed, including manual filesystem edits.

The per-skill lock is cross-process (OS file lock under this home's Skill state), not only a Python thread lock; no store-wide writer lock spans filesystem work. Under that lock re-read the live base digest, commit a publication intent/journal with old/new digests, perform the prepared whole-directory swap, commit the published registry revision, then reconcile native links idempotently. Keep backups/snapshots outside discovery. Recovery completes the registry commit only when the journal and complete live directory agree on the new digest; otherwise restore the verified old snapshot or report a blocked failed publication without deleting unexplained content. A committed registry with absent/failed links stays published with honest binding status and can reconcile links at restart. Test interruption before/after each boundary and concurrent processes.

Expose approved packages using managed `taskuary-<slug>` links in documented native discovery roots. Confirmed contracts: Codex `$HOME/.agents/skills` and Claude Code `$HOME/.claude/skills` both support linked Skill directories. Use symlinks on POSIX and directory junctions on Windows where appropriate. A failed link/collision is an explicit per-target error, never a successful install or a copied fallback. Record link ownership and expected target; only replace/remove links owned by this Taskuary home. Different Taskuary homes cannot overwrite each other's bindings.

Recompute on-disk binding identity before every change: a link is replaceable/removable only when its link target normalizes to this home's expected canonical package path and that package is registry-owned. The SQLite binding row alone is not ownership evidence. Missing entries may be created; directories, foreign/retargeted links and unidentifiable dangling links are conflicts, not automatically adopted. A dangling link can be repaired only if its stored target still identifies this exact home/package. Preserve other homes/users even when this home's binding record is stale or absent.

During implementation inspect the repository's configured CLI catalogue and verify documented native skills locations for other supported installed CLIs; add concrete adapters when supported. Do not create guessed discovery directories for a CLI with no documented native support. Show unsupported/unavailable/native-binding status honestly. Taskuary-launched Agents without native discovery still receive the published name/description/path catalogue in their existing context and can read a package on demand. No automatic task-to-skill routing or forced invocation.

Outside Agents discover only published complete packages. Publication approval authorizes exposing the package to those native directories. No additional confirmation for each later invocation. Already-running external sessions may need a refresh/restart according to their native loader; do not promise live reload.

Sources checked for directory behavior:
- https://developers.openai.com/codex/skills (redirects to ChatGPT Learn skill documentation): USER `$HOME/.agents/skills`; linked directories supported.
- https://code.claude.com/docs/en/skills.md: personal `~/.claude/skills/<name>/SKILL.md`; linked directories supported.

## Integration boundaries

- Store: additive SQLite schema/methods, existing transaction/writer/audit/live behavior. Existing `/api/skills/*` Profile import endpoints remain unchanged; use `/api/skill-library/*` for the distinct lifecycle.
- Domain modules: package/storage/link handling; AI discovery and candidate persistence; Agent authoring/review orchestration. Avoid a general workflow framework.
- Existing server lifespan/background maintenance, terminal/general task dispatch, task wrapup, proposal/verdict registry, guard scopes, context injection, frontend CanvasBrowse/routes/sideNav, shared api/live and locale paths.
- API/UI errors preserve structured errors. All new mutation routes are owner-gated; generation submission uses the existing task-bound completion protocol, with no new Agent mutation route. Native demo uses fictional multi-file package data and never starts real Agents or modifies real native discovery folders.

## Global constraints

- Python 3.10+; use the repository virtual environment explicitly on Windows.
- Frontend Node 22.12+ and npm; keep website/package-lock.json authoritative; no new runtime dependency unless existing libraries cannot implement a required behavior.
- Preserve compact code style, UTF-8, final LF newlines; no unrelated formatting or lifecycle changes.
- English/Chinese UI via existing t()/locale files; never translate task content, package bodies or provider identifiers.
- Use disposable TASKUARY_HOME and redirected native skill roots in all tests/smokes; never read or write the real home for validation.
- Rebuild taskuary/web/, site/demo/ and affected documentation output from source. Never hand-edit generated bundles.
- No publication/release/push or automatic Git commits are authorized by this feature request.

## Acceptance

1. AI derives evidence-backed create/update candidates from pre-existing completed tasks without a task picker or deterministic fallback; unchanged/dismissed evidence is not repeatedly offered.
2. A user accepts a candidate and the actual configured Agent runs a persistent task and creates a complete package with a working script, synthetic examples and source/reference material where the scenario requires them.
3. GUI displays the whole package and changes, validation outcome, task/provenance links, genuine progress/failure; return-to-Agent yields a new review revision.
4. Agent tokens cannot publish; stale content/base/repeated approvals cannot apply unintended writes. Unpublished drafts are undiscoverable.
5. Approval publishes all files and only managed namespaced native links, preserving unrelated files; Windows and POSIX behavior is covered, link failures visible and interrupted publication recoverable.
6. New Taskuary sessions and native compatible external sessions can discover approved packages; each Agent decides whether to read/use them. Package execution still obeys its environment's permissions.
7. Both locales, empty/no-provider/error/long-file/mobile states and existing navigation work. Actual GUI smoke uses an isolated fixture; an installed real CLI run proves authoring/reading where credentials and an eligible provider are available. If absent, report the exact unmet live prerequisite rather than substitute mock output for Agent execution.
8. The Mandatory non-regression boundary holds: existing data/contracts/permissions and ordinary flows remain intact; feature failure and empty/no-provider conditions do not break or block them. Baseline, focused isolation regressions and post-change existing-suite/surface evidence are recorded before delivery.
