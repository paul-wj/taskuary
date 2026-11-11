# Skills learned from completed work

**Skills** in the sidebar holds reusable methods, not new worker roles. AI reads completed work and suggests a new Skill or an improvement to an existing one. You decide whether an Agent should do the authoring, then review the entire package before publishing it. Agents decide for themselves when to use a published Skill.

This is separate from Hub discoveries, Playbooks, scheduled workflows and the existing **Import skills** conversion to worker profiles. None of those are migrated or replaced.

## AI suggestions

Open **Skills → AI suggestions**. Each recommendation explains the method, what varies between jobs, why the work supports it, and which task records provide evidence. Source tasks are links to inspect, not a checklist you must select. Coding investigations and business procedures are both eligible.

The analysis uses Taskuary's existing configured memory brain. It considers at most 50 eligible completed tasks from a bounded recent-work window, including execution results, saved records, artifacts and human corrections. Stranger-origin and Skill-authoring tasks are excluded. Unchanged evidence is not repeatedly sent to the model automatically; dismissing a suggestion suppresses the same evidence even if the AI later rephrases it. Changed evidence can justify a new recommendation.

Discovery is off until you choose **Start AI discovery** in Skills, so an upgrade does not automatically add model calls over your existing history. Starting it requests an analysis and enables background checks on the existing clock, no more frequently than once every ten minutes. **Analyze completed work with AI** requests another analysis; **Pause automatic analysis** prevents future automatic passes (an active read-only pass may finish). No provider, provider failure, malformed output, analysis in progress and a valid empty result are different states. Taskuary never substitutes keyword guesses or sample suggestions when AI is unavailable. Analysis failure does not stop ordinary tasks, messages or reports.

Analysis uses the shared structured-AI response handling: providers that support it receive a JSON schema, and explanatory text around a JSON object or Markdown code fence does not by itself cause failure. Unreadable replies follow the existing bounded AI retry/routing policy. A missing candidate list, invalid task evidence or an invalid update target still fails validation; none is silently treated as an empty result.

The evidence goes to the AI configured for that job, which can be local or hosted. Local storage does not mean hosted models receive no data. Credentials recognized by the shared scrubber are removed from the evidence; this is not comprehensive business-data anonymization.

## Ask an Agent to generate or improve

Choose **Ask Agent to generate Skill** or **Ask Agent to improve this Skill**. Taskuary creates a normal Agent task, with its normal progress, execution record and error handling. **Generation records** links to that task. You can also request an improvement from an existing published Skill.

Authoring needs a connected local Agent CLI with its normal file-writing capability. An API-only chat model cannot silently stand in for a file-authoring Agent. If a local CLI is missing, read-only or cannot authenticate, the prerequisite/error is shown; Taskuary does not create another Profile or claim that a package was generated. Developer mode and existing Agent permissions are not changed by this feature: a supported file-capable general CLI can do this work without enabling developer mode.

The Agent receives a Taskuary-owned working directory and sanitized evidence outside the package. Its instructions require appropriate synthetic-input checks, complete resource references and no copying of private messages or credentials. Existing task completion collects its output; a stopped process alone is not treated as a finished Skill. You can inspect the real task record and use the normal task controls while it works.

A completed authoring task stays waiting while its package needs your publication decision, so the review remains visible in the ordinary queue. Publishing or discarding closes that completed authoring task only when no other work or decisions remain; returning it for changes resumes the same task. This does not reopen or change the completed source tasks used as evidence.

## A complete Skill package

The package must contain a standard `SKILL.md` with `name` and `description` frontmatter and useful instructions. The Agent supplies whatever else the job needs, for example:

```text
skills/taskuary-report-reconciliation/
  SKILL.md
  scripts/check.py
  references/rules.md
  examples/input.json
  assets/report-template.xlsx
```

Not every method needs every directory. An optional script is not required merely to fill a template, but a resource referenced by the package must actually exist. Binary templates/assets are retained as bytes, not converted into prose.

Portable top-level frontmatter fields are `name`, `description`, `license`, `compatibility` and `metadata`. Duplicate keys, tool/permission grants and executable hooks are refused. Version/provenance notes can live in metadata or reference files; they cannot broaden the Agent's permissions.

Limits: **512 regular files**, **32 MiB per file**, **128 MiB total**. Unsafe/escaping paths, planted links or reparse points, case-colliding paths, invalid frontmatter, broken local resource links and invalid supported script syntax are refused. Python syntax is parsed without executing the script. JavaScript syntax checking needs Node; an unavailable required checker is shown rather than reported passed. Publication does not execute package code.

Other script languages are shown as missing built-in syntax verification, not falsely reported checked. Inspect the Agent's recorded checks for those languages. This does not turn a model's claim into a certified result or execute a checker chosen by package text.

The authoring Agent is asked to run job-relevant checks. Review the recorded commands and outcomes in its task: an Agent's claim alone is not a system-certified business result. The package view distinguishes mandatory structural checks from missing/unverified business validation and recorded process evidence. Read examples, scripts and templates as well as `SKILL.md` before approving.

## Review, return or discard

Open a generation record to see the entire file list: added, modified, deleted and unchanged files; text before/after; binary sizes and hashes; downloads; and validation evidence. Deleted binary resources remain downloadable from the exact base revision. Resource contents are displayed as text or downloaded, never rendered as active HTML/SVG.

- **Return to Agent** sends your changes back to the same task/conversation. The old review is superseded; the next completed revision gets a new review.
- **Discard draft** retires the draft's review, leaving the published Skill unchanged.
- **Approve and publish** goes through Taskuary's existing review decision boundary. Only the exact reviewed package revision is published. A changed draft, edited live base or obsolete review cannot authorize different content.

Publishing is your press. The Assistant may highlight that button but cannot click it for you, in either interface language. CLI Agent tokens cannot approve or publish their own work.

An interrupted authoring session remains visible with its files and task record. Taskuary does not automatically rerun a mutating authoring job after restart. Invalid output or collection failure is recorded on the generation without breaking the existing task-completion operation.

## Published directories and reuse

Taskuary owns one formal version:

```text
<TASKUARY_HOME>/skills/taskuary-<name>/
```

Drafts, reviewed snapshots, prior complete revisions and recovery journals are outside the discovery root. Publication replaces the complete directory with recoverable filesystem/SQLite journal handling; it does not edit individual live files in place. The library only manages packages recorded as its own. Existing metric/report Skills and unrelated files in `skills/` are not adopted or rewritten.

Approved packages are linked into confirmed native discovery locations:

- Shared user Skills location used by Codex: `~/.agents/skills/taskuary-<name>/`.
- Claude Code: `~/.claude/skills/taskuary-<name>/` (or its configured Claude directory).

Links point to the formal package; there are no independently updated copies. Windows uses a directory symlink when permitted, or a directory junction. A failed installation or existing conflicting entry is shown per target, not reported installed. Taskuary never overwrites unrelated Skills, another Taskuary home's binding, or a manually retargeted entry. A missing/unavailable/conflicting link is visible; native linkage can be reconciled on restart. A runtime which does not recognize either location needs its own native integration; Taskuary does not invent a discovery directory for it.

New Taskuary tasks receive a compact catalogue of approved names, descriptions and paths, not every Skill body. Compatible Agents can read `SKILL.md` and supporting resources on demand; the Taskuary MCP tool **read_skill** can read published text resources. Unpublished drafts are absent from this catalogue. No Skill is forced onto a task.

Approval exposes that complete package to compatible sessions outside Taskuary too. Some CLI loaders require refreshing or restarting an already-running session. There is no separate confirmation on each later use. A Skill cannot grant tools, send approval, credentials or other permissions its Agent does not already have.

The filesystem locations and API checks are **not an OS sandbox**: a program running as your user can access files and credentials available to that user. Generalize sensitive business details and check every resource before global publication.

## Existing functionality and verification

This feature is additive. Existing task/agent/reply state meanings, approvals, connectors, reports, Hub, Playbooks, Profile imports and configuration choices stay intact. Empty libraries add no Skill prompt block. Failure of Skill analysis or generation does not block ordinary work. The release gate is comparison against the recorded regression baseline plus focused isolation and rendered-browser checks, not a promise that unrelated pre-existing failures disappeared.

The public static demo uses clearly labeled fictional suggestions and complete sample resources. It runs no real AI/Agent and modifies no native Skill directory.
