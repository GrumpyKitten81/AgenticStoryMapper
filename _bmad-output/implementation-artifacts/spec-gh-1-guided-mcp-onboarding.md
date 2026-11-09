---
title: Connect MCP before agent-guided planning
created: 2026-11-08
type: bugfix
status: done
route: oneshot
baseline_commit: 1867b8e486c23758cfa92212d376aae6bf75a60e
review_loop_iteration: 1
context: []
---

<frozen-after-approval>

## Intent

Make MCP an essential initial step of the coding-Agent-guided Agentic Story Mapper workflow. The Agent starts the app, obtains its generated host configuration, registers/reconnects its own host, and successfully calls ListProjects and ListStoryMaps before planning or map changes. Starting the server, saving config, a clipboard result or direct HTTP registry calls do not prove that connection. After connection, ask the user what to map and interact with application data through MCP using existing ChangeSet/approval rules; do not access SQLite, user Project files or domain HTTP endpoints as a substitute. Agentic Story Mapper's shared runtime and repositories remain authoritative; the bridge never owns a second database. Browser-only use remains available without MCP. Preserve human-only actions, existing Agent modes and GitHub confirmation requirements; do not launch models/Agents from the product or add automatic host/account modifications.

Align existing README, AGENTS startup instructions, runbook, release checklist, launcher/setup output and Agent setup copy. Reuse current configuration and verification surfaces, not a new wizard or connection flag. Verify focused regressions and the noninteractive fresh-checkout flow plus real coding-host MCP calls where the existing session permits. Keep unavailable visual/user-content/auth acceptance explicitly unverified; do not invent a user's map content or initiate a login requiring user presence. Isolated host invocation/configuration and disposable Project data are permitted for verification, while personal host configuration and user Projects remain unchanged.

</frozen-after-approval>

## Implementation Notes

- Source map: README Quickstart, AGENTS Helping a user start the app, docs/RUNBOOK.md installation/MCP sections, docs/public-release-readiness.md; scripts/setup.mjs and launcher.mjs; apps/web/src/ui-strings/agent-setup.ts and its existing panel/route tests. All currently describe MCP setup as optional even for guided planning.
- Existing GET /api/mcp/host-configs supplies absolute installed Node/bridge/startup runtime directory before any map exists. Reading this bootstrap configuration is allowed before MCP. Domain reads/writes then use MCP. ListProjects does not authorize CreateProject (human-only).
- No intent gaps or product-side irreversible changes. Actual host smoke uses the already authenticated CLI without registration into personal settings, a login flow, or any live user data. Browser availability and a real user-authored map remain separate evidence limits.
- Official host registration references checked: https://developers.openai.com/codex/mcp/ and https://code.claude.com/docs/en/mcp . CLI syntax and actual config paths must follow generated values and preserve other servers.

- Implemented ten existing sources/docs/tests: README, AGENTS startup section, runbook, release checklist, setup/launcher output and the map-free Agent setup copy. No wizard, database/config schema, connection flag, automatic Agent launch or approval-policy change.
- Verification: 35 focused UI tests, web typecheck, both actual setup/start smoke regressions and three existing stdio lifecycle/shared-runtime tests pass. Size, hygiene and whitespace checks pass; all47 local documentation links and anchors resolve.
- Fresh-checkout acceptance: local clone of baseline plus the reviewed candidate files; no copied node_modules or .env. Public setup installed frozen dependencies, built the app and launched health at an owned loopback port. The generated Node/bridge/runtime command was used verbatim in an isolated already authenticated Codex CLI0.160.0 invocation; personal host configuration was not modified. Actual JSONL MCP call records, not model prose, were checked.
- Real coding host: ordered ListProjects/ListStoryMaps succeeded on the empty disposable Project; explicit technical fixture request created one empty map through CreateStoryMap. UpdateStoryMap apply=false produced a proposed ChangeSet while the saved map's name/version remained unchanged. After orderly stop and start on a different port, the original MCP command reconnected; actual ListProjects/ListStoryMaps/ListChangeSets confirmed the same map and proposed ChangeSet persisted. No Cards, user planning content, user Projects or remote GitHub state were changed by these checks.
- Limits: native browser availability check still reports the Mac locked; desktop/narrow visual acceptance remains unverified. A genuine user-authored first map, personal persistent host registration and Claude Code live acceptance remain unverified. The release checklist distinguishes these from the passing technical Codex flow. No login, device flow or timely user action was initiated. Both owned test server sessions stopped cleanly.

## Review Triage Log

Independent blind review inspected the complete guidance/copy/test diff and reported no actionable findings. No additional review layers were configured for the one-shot route. No findings deferred. Technical fresh-checkout/real-host evidence was executed and recorded separately from document review.

- Issue bookkeeping: technical evidence and remaining visual/user acceptance limits posted to release issue1 comment6726184195. The user subsequently authorized commit/push. The umbrella remains open for independent unfinished release tasks; delivery is recorded with its revision in the issue comment.
