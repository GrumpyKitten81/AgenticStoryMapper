---
title: Concurrent edits never lose data silently
type: feature
created: 2026-10-09
status: done
baseline_revision: 84e0df91dc492c26064e5052c39fde8381c45fbc
review_loop_iteration: 0
followup_review_recommended: false
context: [AGENTS.md]
warnings: [oversized]
deferred: []
---

Reproducing statement: Run bmad-build-auto for Story 3.11; implement required version checks, atomic conflict responses and preserved UI drafts. Never write or revert orchestrator-owned sprint-status.yaml, or infer verification from its rows. Date: 2026-10-09. Version: 1. Changelog: Initial source-informed planning; records unresolved architecture and live-update dependencies.

<intent-contract>

## Intent

**Problem:** Ordinary HTTP/MCP commands do not require version baselines, and a Card refetch replaces unsaved input. Human and Agent edits can overwrite each other silently.

**Approach:** Require root baselines and compare them inside the existing applying transaction. Return shared structured conflicts containing every conflicting object's current state without partial domain changes; preserve editor drafts and offer explicit reload/resubmit decisions.

## Boundaries & Constraints

**Always:** Protect Story Map, Card, Release, Persona and Roadmap roots and owned children under AD-7/AD-17. Derive schemas from contracts, use application/UoW/repositories, retain safety, attribution, audit and provenance. Enforce equivalent HTTP/MCP behavior. Respect customization last-write-wins. Keep dirty text and the unsaved-changes dialog through failures and incoming changes. Version/history semantics are fixed by ADR 0002.

**Never:** Write, stage or revert sprint-status.yaml; treat done/awaiting-operator bookkeeping as evidence. Alter user databases, credentials or unrelated debt. Add compatibility, silent failure, new network dependencies or an unrequested alternative live-update mechanism. Silently supersede AD-7 or weaken race/live-update acceptance.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Required token | Root update/move/archive/delete without baseVersion | HTTP/MCP shared validation refusal | No domain mutation |
| Fresh token | Baseline equals current version | Apply atomically and return new version | Preserve existing permission checks |
| Stale token | One or many stale roots | HTTP409 / equivalent MCP code conflict and top-level conflicts listing current states | Apply nothing; collect all conflicts |
| Bulk Cards | Several targets, any stale baseline | Reject entire operation and list every conflict | No partial Card/history/link writes |
| Competing saves | Human and Agent read the same Card version | Exactly one succeeds regardless of arrival order | Loser receives current state |
| Editor conflict | Card/Release/Persona/Roadmap draft and failed save | Preserve typed values; explicit reload or resubmit | Accessible conflict alert |
| Live change | Two clients; dirty Card and open unsaved dialog | Preserve dirty values/dialog; alert This Card changed with Reload / Keep mine | Requires real incoming update path |

</intent-contract>

<frozen-after-approval reason="operator resolution 2026-10-09">

## Story 3.11 unblocked

- **Dependency:** Story 3.10 is landed (`/api/events` route, web live stream, tests). Two-client dirty-editor acceptance uses that path; 3.11 does not change it.
- **Version semantics:** decided in `docs/adr/0002-bump-card-version-on-coalesced-save.md`. Every accepted Card save increases `cards.version`; a same-actor save within 60 seconds rewrites the latest `card_versions` row under the new version (history gaps allowed). `max(card_versions.version) == cards.version` holds. AD-7 and epics.md are amended; existing coalescing tests are updated.
- **Client rule:** a client sends the version returned by its previous save as the next `baseVersion`.
- **Loop:** 3.11 may resume implementation.

</frozen-after-approval>

## Code Map

- `packages/contracts/src/api/http.ts`, `mcp/tool-inputs.ts`, `schemas/errors.ts` — requests lack ordinary baselines; current DomainError envelope uses details, not top-level conflicts. Share strict request/response schemas across transports.
- `packages/db/src/database-handle.ts:TransactionContext.execute`, `root-versions.ts` — synchronous exclusive UoW and per-root bump deduplication; preflight must run inside this transaction.
- `packages/db/src/repositories/cards-repository.ts:writeCardVersion` (425), `root-versions.test.ts:221` — every save bumps Card.version; same-actor/type/session saves within 60s rewrite the latest history row under the new version (ADR 0002).
- `packages/db/src/repositories/changesets-repository.ts:78` — optional Card-update baseline check before execution, stops at first conflict and omits absent targets. Reuse initial-state preflight, extend conflict inventory.
- `packages/db/src/repositories/cards-repository.ts:bulkUpdateCards`, `customizations-repository.ts`, `roadmaps-repository.ts`, `projects-repository.ts` — existing root/owned mutations; Release/Persona deletion affects linked Cards, Card structural actions affect descendants. Card sibling reindex intentionally bumps only moved Card.
- `apps/server/src/application/{card,story-map,release,persona,roadmap}/`, `http/routes/`, `mcp/tools/` — shared use cases already execute attributed UoW; wire required baselines and equivalent errors through these boundaries. Delete results currently omit new versions.
- `apps/web/src/app/api.ts:125`, `useStoryMap:575` — generic helpers discard error bodies; the live-update subscriber exists (`app/live/`, Story 3.10). `useStoryMapBoardState.ts` centralizes many mutations, with independent callers in lifecycle/Release views.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx:143` — refetch effect resets draft and closeConfirm. Existing `card-detail.test.ts` covers failed-save retention and nested dialogs.
- `PersonaDetail.tsx`, `ReleaseTimelineChart.tsx`, `DiscoveryLanes.tsx`, `RootLayout.tsx` — blur/date/name saves need retained drafts and conflict actions. `features/roadmaps/RoadmapPanel.tsx` only creates/displays; updateRoadmap API has no editor caller.
- Read-only intent: `epics.md:1185`, `ARCHITECTURE-SPINE.md:86`, `spec-2-3-version-counters-on-every-editable-root.md:43,195`. Graph unavailable; three read-only subagents and parent source verification supplied scope.

## Tasks & Acceptance

**Execution:**
- [x] Architecture AD-7 and existing Card coalescing contract — resolved by ADR 0002; Card saves bump the version and coalescing rewrites the latest history row. Implemented and tested in `writeCardVersion`.
- [x] Story3.10 event route/client integration — landed; two-client live acceptance may use it.
- [x] Contracts/http.ts, tool-inputs.ts and errors.ts — require root/per-Card tokens and one conflict schema; distinguish creation/unversioned customization. Part A: `api/commands.ts`, `schemas/conflicts.ts`; body-less DELETEs take `?baseVersion=`; bulk takes `cards: [{id, baseVersion}]`; owned-child mutations stay token-free by decision.
- [x] DB/UoW and shared use cases above — atomic initial-state preflight for roots/children/bulk (`application/base-versions.ts`, ChangeSet preflight lists all stale Cards); preserve indirect ownership rules. Delete responses (`{ ok, version }` for Card, Release, Persona; `{ deleted, version }` for Story Map) carry the final version `baseVersion + 1`, asserted equal to the version of the committed live event.
- [x] Web API and named editors — typed conflict errors (`app/conflicts.ts`), draft baseline versions, Reload / Keep mine (`features/conflicts/ConflictAlert`) in Card modal, Persona, Release dates and Roadmap editor (`RoadmapEditor`); global announce-and-reload fallback for immediate actions; serial saves per object. Part C: the Card modal shows a proactive "This Card changed. Reload / Keep mine" alert for a dirty draft when a held live change carries a newer version (`pendingChanges` in `live-interaction-store`).
- [x] Relevant contracts/DB/server/web tests — missing/fresh/stale/all-conflict/race coverage through actual HTTP/MCP (`base-version-conflicts.test.ts`), editor and live-alert tests, plus real two-tab browser acceptance (below).

**Acceptance Criteria:**
- Given an HTTP/MCP root mutation without baseVersion, when submitted, then validation refuses without domain changes.
- Given a matching baseline, when submitted, then the operation applies and returns its new version.
- Given stale baselines, when a command or bulk action runs, then all conflicts and current states are returned with no partial application.
- Given both save orders and a latest history row belonging to either contender, when human and Agent save the same baseline, then exactly one succeeds.
- Given consecutive saves from one client, when the second is sent, then it carries the version returned by the first and does not conflict with itself.
- Given a draft in each named editor, when a save conflicts, then typed values remain available with reload/resubmit actions.
- Given two actual clients and a dirty Card with its unsaved dialog open, when the other client changes a different field, then the alert appears and typed text/dialog remain.

## Spec Change Log

## Review Triage Log

## Design Notes

Resolved: version policy chosen in ADR 0002 (supersedes the AD-7 coalescing sentence). Previously a human-first coalesced save left N unchanged and an Agent's stale N still matched; now every accepted save changes the token. All human clients share `actorId "local-user"`, so the same race existed between two tabs.

Live updates landed with Story 3.10 (`apps/server/src/http/live-events.ts`, `apps/web/src/app/live/`). The Roadmap editing surface still needs implementation, rather than claiming existing coverage.

## Verification

- ADR 0002 implementation: coalescing tests in `root-versions.test.ts`, `card-history.test.ts`, `live-events.test.ts`, `storymapper-repository.test.ts` and server route tests now assert the bumped version; DB suite passes.
- Full gates: `node scripts/verify.mjs` (typecheck, build, capability parity) passes. Tests: contracts 50, DB 244, web 167, server 349 with the known five Python 3.12 `tool-proposals` and the `runtime-lifecycle` ENOENT failures that predate this story.
- Real browser acceptance (2026-10-09, disposable database outside the repository, loopback only, built-in browser with two tabs as separate live clients): tab A dirty title in the Card modal; tab B saved a different field; tab A showed "This Card changed." with Reload / Keep mine in the modal and in the Unsaved-changes dialog while the typed text and dialog stayed. Keep mine plus Save stored version 3 with tab A's title. In tab B the same alert appeared for a dirty draft; Reload replaced the draft with the server state and removed the alert. No console errors. Server and data removed afterwards.

## Escalation Resolution (2026-10-09)

Resolved. Story 3.10 is done; AD-7 version/history semantics are decided in `docs/adr/0002-bump-card-version-on-coalesced-save.md`. Implementation of Story 3.11 may resume.

## Final Result (2026-10-09)

Story 3.11 is implemented and closed by the operator without a further review.

- Version semantics: ADR 0002 (every accepted Card save bumps `cards.version`; a coalesced save rewrites the latest history row under the new version).
- Part A: mandatory `baseVersion` on Card, Release, Persona, Roadmap and Story Map root commands over HTTP and MCP; atomic preflight with one conflict body (`conflicts[]` with current states); ChangeSet preflight lists every stale Card; delete responses carry the final version.
- Part B: typed `ConflictError`, draft baseline versions, Reload / Keep mine in the Card modal, Persona, Release dates and the new Roadmap editor, global announce-and-reload fallback, serial saves per object.
- Part C: proactive "This Card changed." alert for a dirty Card modal, verified with two real browser tabs.
- Gates: `node scripts/verify.mjs`, capability manifest (108), audit performance gate pass. Tests: contracts 50, DB 244, web 167, server 359 (Python tool tests run with the installed Python 3.14 via `STORYMAPPER_TEST_PYTHON=3.14`). One unhandled `ENOENT` from request logging after a temp-directory removal in `runtime-lifecycle.test.ts` predates this story and does not fail a test.
- Not covered: no proactive live alert for Persona, Release or Roadmap editors (their conflicts surface at save); a clean open Card modal stays stale until closed (Story 3.10 hold semantics).
