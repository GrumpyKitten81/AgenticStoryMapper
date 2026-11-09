---
title: Safety switches replace the privacy mode
type: feature
created: 2026-10-07
status: done
baseline_commit: c1fb91f2c57e82d171138c3ba1b6e7145c607a73
route: dispatch
review_loop_iteration: 0
context: [AGENTS.md, epic-3-context.md]
updated: 2026-10-10
updated_version: 2
---

Reproducing statement: Implement Epic 3 Story 3.5 — replace stored privacy mode and legacy connector flags with enforced project safety switches (`agentAccess`, `github`, `agentProtection`), wire server and UI enforcement, migrate SQLite settings, and remove privacy wording from contracts and docs. Date: 2026-10-07. Updated: 2026-10-10. Version: 2. Changelog: Replaced the symbolic baseline with the canonical commit immediately before Story 3.5.

## Completion notes

- Contracts: `safetySettingsSchema` and `GET/PATCH /api/settings/safety` with `getSafetySettings` / `updateSafetySettings` (human-only updates).
- Database: `agent_access_enabled`, `agent_protection_enabled`; migration maps legacy `mcp_writes_enabled` into protection; `github_enabled` retained.
- Server: MCP authorization and GitHub use cases honor switches; agent writes re-check protection inside transactions via `assertAgentWriteSafety`.
- Web: `SafetySwitchStrip` in `RootLayout` with pills, forwarding notice, accessible dialog, and cross-tab BroadcastChannel announcements.
- Audit export formatters emit safety switch states instead of privacy mode labels.
- Removed privacy mode schema fields and Strict Local UI strings from the product surface; docs `mcp-tools.md` updated.

## Verification

- `corepack pnpm --filter @storymapper/server test`
- `corepack pnpm lint` (workspace typecheck)

## Changelog

- 2026-10-10: Replaced `baseline_commit: main` with the canonical parent revision before Story 3.5.
