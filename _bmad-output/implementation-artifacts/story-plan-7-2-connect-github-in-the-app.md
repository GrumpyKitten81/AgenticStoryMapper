---
epic: 7
story: 2
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.2: Connect GitHub in the app

Reproducing statement: Prepare a guided human GitHub connection flow using Story 7.1, reconcile verification while GitHub is off, and preserve read-only defaults and explicit audited enablement. Version: 1. Date: 2026-10-18.

## Intent

Connect from the app without editing `.env`, understand the actual credential source and resolve verification failures without losing the connection draft.

## Cross-story constraints

- Consume [Epic preparation](epic-7-preparation.md) and [7.1](story-plan-7-1-credentials-in-a-user-level-file.md).
- D1/D4 are accepted in ADR 0008: explicit verification while off plus a blocking-use notice; guided CLI login in the human's own terminal.
- 7.7 reopens this same dialog and returns to the original composer; do not create another connection form or lose its draft.
- All configuration/credential/enablement capabilities are human-only; enabling is explicitly confirmed and audited through the existing settings path.

## Design decisions (this story)

- Reuse `GitHubConnectionsPanel` drafts/defaults: readOnly true, defaultLabel `local-story-map`, Milestone source, Iteration field, label toggle and current mappings. Replace literal `owner`/`repository` draft values with input guidance, not saved fake repositories.
- Candidate-token verification consumes the entered value directly in memory, not the global resolver that might prefer CLI. Final confirmation writes the file through 7.1; UI identifies the source normal operations will use if CLI wins.
- Accepted D1: only a fresh explicitly consented human verification can contact the candidate repository while off. No implicit mount/background/MCP path gets that exception; verify itself changes neither connection nor safety switch. After success while off, explicitly say: “Connection verified. GitHub is off and blocks import, sync and push. Confirm Connect to enable GitHub.”
- Accepted D4: guide the user to `gh auth login` in their own terminal and offer Recheck; the app never stores CLI credentials.
- Verify read access to the selected repository and report write capability separately. Read-only setup must not require write permission. A read check cannot prove future Issue/Milestone/type writes; unavailable capabilities must be visible before 7.4 confirms a push.
- Final Connect uses the verified candidate/Project/connection fingerprint, saves read-only configuration and records the explicit switch change. No await result from another scope/epoch authorizes it. File failure leaves switch off; DB failure after file success reports the retained file effect.
- Map errors to invalid credentials, unavailable repository/permission, rate limit and network with next actions. GitHub can hide authorization as 404; do not claim to know an inaccessible repository was deleted. Never expose token/subprocess output.

## Task sequence

1. `packages/contracts/src/api/http.ts`, `schemas/domain.ts`: define human-only candidate verify/finalize requests and sanitized source/capability results; add descriptors through the existing application manifest.
2. `apps/server/src/application/connector/connector.use-cases.ts`, connector HTTP routes: separate candidate verification from persisted connection validation; implement precisely the agreed D1 exception and revalidation before/after provider awaits.
3. `packages/github/src/providers/work-item-provider.ts`, `github-provider.ts`: return normalized verification failures/capabilities for CLI and token paths without changing credentials or making write probes.
4. `apps/web/src/features/github-sync/GitHubConnectionsPanel.tsx`: reusable Dialog steps for method, target, verify, review and explicit Connect; central English strings, keyboard/focus, pending guards, Cancel and retained errors.
5. `apps/web/src/app/api.ts` and existing safety/query integration: adopt own mutation results, refresh header/connection state, reject late responses after Project switch/Restore and make the dialog reusable from 7.7.
6. Exercise HTTP/MCP refusal, file/DB failures, offline/401/403/404/429, method changes, same-tick confirm, navigation and mounted Restore through actual consumer tests.

## Preliminary code map

- `apps/web/src/features/github-sync/GitHubConnectionsPanel.tsx`: current defaults, create/update/validate controls.
- `apps/server/src/application/connector/connector.use-cases.ts`: `validateConnectorConnection` currently checks the switch before all provider calls.
- `apps/server/src/http/routes/connector-routes.ts`, `infrastructure-routes.ts`: configuration and credential-status surfaces.
- `packages/github/src/providers/github-provider.ts`: `validateConnection` currently collapses errors into a generic result.
- `apps/web/src/components/Dialog.tsx`, safety settings use cases, app API query invalidation: reuse current shared implementations; step 02 resolves exact helper paths.
- `packages/contracts/src/api/http.ts`: create/update/validate connection request schemas and current provider defaults.

## Acceptance outline

- **Given** no credentials and GitHub off **When** the user follows the agreed CLI/token flow **Then** each outbound check requires the agreed consent and no `.env` editing occurs.
- **Given** successful verification **When** explicit Connect succeeds **Then** configuration is read-only by default and the actual flag change has one attributed Activity event.
- **Given** failed verification/write/finalization **When** the dialog remains open **Then** it names the cause and fix, preserves the draft, reports any retained file effect and does not claim the switch is on.
- **Given** a pending check in Project A **When** scope/epoch/method changes **Then** its late response cannot enable Project B or finalize stale inputs.
- **Given** keyboard-only operation **When** progressing/cancelling **Then** focus, labels, pending/error announcements and opener return work with English module strings.

## Out of scope

OAuth server, new credential profiles, automatic permission escalation, write probes, live login in this preparation and any generic exception to GitHub-off policy.

## Risks and mitigations

- D1 changes AD-12/15 and the UX off-state policy: ADR 0008, spine, PRD and UX now record its narrow exception and required blocking-use notice. Verify that the implementation grants no broader exception.
- Global CLI precedence can mask pasted credentials: distinguish candidate verification from operational source explicitly.
- Do not mistake a successful repository read for a guarantee of all write permissions or type availability.

## Open questions

None. D1 and D4 accepted 2026-10-18, including the explicit blocking-use notice after successful off-switch verification.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Guided connection, candidate verification and accepted consent/login decisions |
