# Jira Data Center API-token connection design

**Date:** 2026-11-04
**Status:** User-approved scope implemented and integrated on 2026-11-04; fictional end-to-end verification passed. Live Jira connectivity and running-instance deployment are unverified.
**User request:** Plan support for the company Jira API-token authentication demonstrated by an existing local Jira skill, because the company's permissions do not permit the currently documented connection procedure.
**Decision ownership:** The user approved this proposed scope and selected an independent worktree. Live Jira access and running-instance configuration changes are not authorized.

## Goal and boundary

Add a Data Center connection mode to the existing Jira card. Authenticate with a username/account email and an API token substituted for the password using HTTP Basic authentication; read Jira REST v2 and ingest assigned issues into the existing Timeline/triage/task flow.

Authentication compatibility does not bypass Jira permissions, company policy, network access or token issuance restrictions. This mode requires the user's account to have REST access and Browse Projects access to the selected issues. It does not require a new OAuth app or Atlassian Cloud token issuance. A successful identity check alone must not be reported as successful issue access.

Data Center is deliberately **read-only in this proposal**. Cloud write-back remains available through its current approval boundaries. The user did not request Data Center comments, reassignment, transitions, or closing upstream issues. Those actions are not silently attempted through the current Cloud implementation.

## Evidence from the current application

- `website/src/ConnectorsView.jsx:275-283` asks for a site URL, account email and API token, but directs token creation only to Atlassian Cloud. It also says nothing is written back, although tracker write-back now exists.
- `taskuary/pm.py:49-62` already uses Basic authentication and REST `/rest/api/2/myself`; this is not an OAuth connector.
- `taskuary/pm.py:65-75,102-127` recognizes the owner only by Cloud `accountId` and caches it globally as `jira_account_id`.
- `taskuary/pm.py:130-156` reads one search page of 25 assigned issues and does not follow `total/startAt`.
- `taskuary/trackers.py:115-124,190-258` assumes REST v3, ADF comment documents and Cloud assignee account IDs.
- `taskuary/store.py:5609-5674` already provides write-only, sealed connector secrets and per-connector JSON configuration. No new secret store is needed.
- `taskuary/server.py:6932-6955` supports testing unsaved credentials through a non-persisting DraftStore; preserve that behavior.
- An isolated executable probe with fictional upstream responses observed: Basic credentials matched; Data Center `key/name` identity produced an empty owner ID; the owner's comment took the external-ingestion path; a search response with `total=26` caused only one search call; tracker state and comments used v3 and an ADF dictionary. The probe exited 0. It made no real Jira requests and did not use the live application home.

## What is reused from the local skill

- Basic auth with the account username and API token; an environment variable containing the word `BEARER` is not evidence that Bearer authentication is correct.
- REST `/rest/api/2`, separate from the site's `/browse/...` URLs.
- For this Data Center mode, `User-Agent: curl/8.17.0`, matching the demonstrated client. The skill establishes a WAF problem with Python-urllib; it does not establish that the application's requests default is currently blocked.
- Simple Data Center-compatible JQL and issue-type preservation. A Sub-task must not be reclassified as a Bug or dropped merely because of its issue type.
- Explicit distinction between authentication failure, resource permission/WAF refusal and an empty successful search.

Do not copy or depend on the personal skill script. It loads personal configuration at import, prints/exits for its CLI, and is not a packaged application module. Its `_search` currently performs one request; the application must implement its own complete pagination rather than assuming that helper already does it.

## Configuration and UI

Use the existing connector `Type='jira'` and `ConnectorId`.

- `ConfigJson.deployment`: `cloud` or `data_center`; missing means `cloud` to preserve saved connections. Unknown values fail explicitly, not by choosing a mode.
- Existing `ConfigJson.base_url`: site URL; accept an optional trailing `/rest/api/2` by normalizing it back to the site URL. Preserve an instance context path such as `/jira`. Incompatible API suffixes fail visibly.
- Existing `ConfigJson.email`: account username/email used for Basic auth. The label in Data Center mode must not imply an Atlassian Cloud account.
- Existing `Secret`: API token, entered manually, sealed by the existing vault, never returned by list/get responses.
- Internal `ConfigJson.jira_identity`: cached owner identity bound to deployment, normalized site and configured username. Use the connector's own cache, not the old global setting. Testing draft credentials must not persist it.

The Credentials step gains a visible deployment selector. Data Center help explains the API-token-auth plugin's token page, using a relative path resolved against the user's configured site: `/plugins/servlet/de.resolution.apitokenauth/admin`. Explain that the account username is required and the token acts as the Basic password. Token rotation uses the existing replace-token field and Test; no scheduler or automatic credential discovery is added.

Cloud and Data Center instructions are selected from the current unsaved draft, including AI setup assistance. Register the selector with the existing dirty-field calculation: changing it must disable Sync until Save, and Test must use what is on screen. Locale switching must preserve draft fields and token input. Data Center must not offer usable upstream-write capabilities or tracker close-out actions; the server is authoritative even if old Roles/Scope values contain write privileges.

## Read and ingestion contract

- Test performs `/myself` followed by a minimal `/search` using the same assigned-to-me JQL as polling. Successful zero-result search is valid, but proves only that this query returned no visible issues; do not claim access to every project.
- The existing assigned-to-me scope is unchanged. Do not automatically add reporter/watcher issues, all company projects, historical issues or an issue-type filter.
- Poll retains the existing time-window and triage routing. `CAP=25` becomes the page size, not the maximum number of issues consumed.
- Advance search `startAt` using returned rows until the advertised total is exhausted. A premature empty page, malformed paging metadata or failed later page is a failed poll, not successful completion. Raise into the existing poll error path so source watermarks are not advanced; already ingested rows are safely deduplicated on retry.
- Preserve existing `jira:KEY` conversation IDs, content revision IDs, own-comment history, priority/status changes and upstream-done detection. No new multi-site item-identity scheme is introduced.
- Cloud identity comparison uses `accountId`; Data Center uses returned `key`, then returned `name` when keys are absent. Compare like fields, never display names or email guesses. Unknown identity remains explicit and is not guessed.
- Cache validity is per connector and site/account. Source creation checks ownership by `ConnectorId`, not merely whether any Jira source exists. This does not claim that the pre-existing issue-ID namespace supports every multi-site collision.

## Shared Jira wire and write boundary

Introduce one small packaged Jira transport module, `taskuary/jiraapi.py`, using the already installed requests library. Both Jira ingestion and Cloud tracker write-back use it; remove obsolete duplicate wire helpers and migrate tests/browser fixtures that replace them.

The transport accepts a relative API path and an explicit REST version. Ingestion remains v2 for both deployments; existing Cloud write-back remains v3. Data Center rejects v3 and non-GET API operations before outbound HTTP. Do not sniff Cloud/Data Center from CDN headers or silently switch auth schemes on failures.

Refuse redirects for credentialed API calls; keep TLS certificate validation. This proposal does not add a TLS-disable option, generic arbitrary REST proxy, new retry framework, telemetry or new dependencies. HTTP failures remain observable through existing error presentation; never log or return the token, Authorization header or raw authentication HTML.

Tracker card resolution, direct executor calls and close-out discovery/assessment/execution must all respect the Data Center read-only boundary. A stale Cloud proposal after switching a card to Data Center must fail without an outbound mutation. Cloud's owner approval, stale-context and uncertain-delivery behavior must remain unchanged.

## Non-goals

- Data Center write-back or parity with Cloud's mutations.
- Native Data Center PAT Bearer authentication, OAuth or other Jira authentication systems.
- Automatic reading/importing of personal `.env` files or hardcoded accounts/company hosts.
- Jira project discovery, custom JQL UI, automatically widened reporter/watcher scope, or full historical backfill.
- Attachment downloads, screenshot analysis, report generation or report review tiers. These are separate consumers of a connection, not prerequisites for API-token connectivity.
- Broad tracker refactoring or new item-ID namespaces.

## Acceptance and privacy

1. Select Data Center, enter a site, username and token, Test identity plus issue search, Save/activate, then Sync: assigned fictional issues appear in the actual Timeline and flow through existing triage.
2. More than 25 visible updates in the current poll window are all consumed; repeated sync produces no duplicate arrivals. A second-page failure remains visible and does not skip the pending window.
3. Data Center own comments become context/history; another person's comments remain external arrivals. Cloud own-comment detection is unchanged.
4. Data Center tests, sync, injected tool calls and stale tracker close-outs perform no upstream writes and do not use REST v3. Existing Cloud comment/transition/assignment/close-out regressions pass.
5. Switching locale or deployment preserves unsaved form values and write-only secret behavior. Saving or draft-testing one connector does not alter another connector's identity or secrets.
6. HTTP 401 and HTTP 403 are failures, never empty-success fallbacks; TLS, redirect and malformed-response failures remain visible.

All permanent fixtures, documents and screenshots use fictional accounts and reserved example domains. Never copy personal skill defaults, actual issue content, token values, employer hostnames or live screenshots into this public repository. Browser visual evidence is captured only against demo fixtures. Live validation, if later authorized, uses minimum read-only identity/search checks without saving real issue payloads in the repository.
