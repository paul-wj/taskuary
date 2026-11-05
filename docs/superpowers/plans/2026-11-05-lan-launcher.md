# LAN Launcher Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the host Agent's execution and delegation rules. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remembered LAN access, address display and fresh one-time login-link copying to the double-click source launcher.

**Architecture:** Keep argument-based startup unchanged. No-argument double-click opens a Tkinter control window after existing dependency checks. Reuse the running data-home instance or start the existing CLI launcher in a detached child. Store only the launcher's LAN preference in the application home; do not rewrite server credentials or silently restart running work.

**Tech Stack:** Python 3.10+, standard-library Tkinter, existing config/instance/launchkey APIs.

**Spec:** Approved in conversation: opt-in remembered LAN access; show reachable addresses and actual port; generate a new authenticated link on every copy; explain restart requirements without stopping agents; no firewall changes or data merging.

## Global Constraints
- Default local-only; CLI arguments keep their existing behavior.
- Reuse owner-only POST /api/launch-key and its existing two-minute, single-use keys.
- Never copy a plain URL as though authentication succeeded.
- Existing instances remain running; changed preferences apply on next server start.
- Do not capture live task data in screenshots.

## Review Focus
- Existing instance on a different port: use its advertised port.
- Local-only existing server: do not advertise LAN sharing as active.
- Key minting denied or server unavailable: show error, leave clipboard untouched.
- No LAN adapter: show a useful error rather than wildcard/loopback as a remote address.
- Preference save: retain other launcher preferences; never persist credentials.

### Task 1: Launcher control window
**Files:** `tools/start_taskuary.py`, new `tools/launcher_gui.py`, `tests/test_source_launcher.py`.
- [x] Add failing behavioral tests for preference persistence, address filtering and fail-closed authenticated link generation using a local HTTP fixture.
- [x] Run focused tests and observe missing functionality.
- [x] Implement control window and helpers. Start/reuse, probe asynchronously, select LAN address, copy a fresh key, open local browser through a separate fresh key. Closing the control window does not stop the server. No automatic restart.
- [x] Route no-argument source startup to GUI; retain explicit command-line startup.
- [x] Run source-launcher regressions and isolated actual Tkinter/server smokes: LAN and local-only starts, fresh links, single-use redemption, denial leaves clipboard unchanged, no restart on toggle, instance reuse, graceful shutdown, actual source-entry visible window.
- [x] Update both README launch instructions with LAN usage and security/lifecycle limits.

Verification: 45 focused tests passed (plus 3 subtests). One warning from the existing desktop test fixture: its simulated server lacks `should_exit` in a `gone_with` thread. Full suite not run. No live task data was used in GUI smokes.
