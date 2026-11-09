---
title: Skill-based Card Definition of Ready reviews
type: feature
created: '2026-11-04'
status: done
route: dispatch
review_loop_iteration: 2
baseline_commit: 9e21b1191ca53157e06e7d897d93ac2ff4e986cc
context: []
---

Date: 2026-11-04. Version: 2.
Reproducing statement: Implement the complete user-approved Card DoR review plan, preserving dynamic GitHub statuses at the baseline. The user already approved implementation; no further planning approval is needed.

<frozen-after-approval reason="User approved the full plan and requested implementation">

## Intent

Attach structured Definition of Ready (DoR) reviews to Cards. An invoking external agent runs the installed repository skill alongside MCP; Agentic Story Mapper never launches an agent/model. Users see finding badges, inspect a dedicated Card review panel and map-wide review menu, select corrections, and ignore findings. Corrections are proposed ChangeSets with separate human approval and apply. The user explicitly authorizes direct immutable audited review-report persistence as a narrow exception to ChangeSet-first policy.

## Boundaries & Constraints

Project defaults: reviewBeforeAgentPush=true, reviewAfterAgentCreate=false, reviewAfterAgentContentChange=false, allowHumanPushOverride=false. Settings are human-only. Optional save reviews follow applied agent changes, never unsaved drafts or un-applied proposals. Manual requests are available; without an invoking agent they visibly wait, with a copyable skill/MCP instruction. No runner, model API, polling daemon, external publication, code review, or broad repository discovery.

Add nullable cardType: story/task/bug/spike/feature/epic/theme, independent of hierarchy. Existing Cards remain null without inference; locally saving without type stays possible, passing DoR requires type. Notes have no type and no reviews. Integrate create/edit/bulk, contracts, ChangeSets/preview/history/copy/exports. Replace GitHub issueTypeMapping's hierarchy key with cardType. Existing connections need explicit remapping before affected pushes; no silent mapping. New imports assign type only from an unambiguous configured mapping. Dry Run exposes native Issue type changes.

Versioned criteria (one authoritative catalog; stable rule IDs; exact per-rule applicability and severity): DOR-01 missing/mismatched type (blocker); DOR-02 concrete story/feature/epic value, task outcome or theme focus (blocker); DOR-03 bounded scope (blocker only when work cannot start, otherwise warning); DOR-04 observable story/bug acceptance, feature/epic success, task completion (blocker); DOR-05 concrete story/bug BDD (warning); DOR-06 known unresolved prerequisite/dependency preventing work (blocker); DOR-07 contradictions between goal/criteria/context (blocker); DOR-08 bug observation/expectation/reproduction or reliable evidence (blocker); DOR-09 spike question/deliverable/stop condition (blocker); DOR-10 concise readable authorship, meaningful structure/references, no template debris/redundancy (warning). No mandatory empty headings, estimates, invented details or already-completed spike results. Rule outcomes: pass/finding/not_applicable/unknown; missing required checks cannot pass.

Reviews use captured Card/type, relevant parents/dependencies, linked authorized source evidence and Product Context. GitHub reviews inspect actual outgoing Issue title/body/type from immutable Dry Run. Bind reports to server-generated input fingerprints, criteria/skill versions and database epoch; relevant content/context/export changes or restore invalidate currentness. Cosmetic changes do not. Reuse exact current successful reports; errors never count as success.

Persist review requests (purpose/origin/snapshot), immutable reports (rule results, server IDs, evidence, suggestions, timestamps and agent provenance), separate human decisions and correction requests linked to ChangeSets. Validate complete structured output, ownership, rules and input identity; identical repeated submissions are idempotent, conflicting submissions fail. No Card content version or sync-baseline bump for review metadata. Atomic UoW audit/live updates. Scope data to Project/Card; archive/delete/restore/portable and redacted exports must classify all new tables and sensitive context correctly.

Finding actions: selected KI corrections create a version-bound proposal; manual edits use existing editor; ignore occurrence applies to its reviewed input; ignore rule forever applies only to that Card with required reason, reversible. Ignored findings stay historical but stop counting/blocking. Applied fixes are awaiting verification until a new matching review proves resolution. Stale results never appear clean.

Only agent-initiated outgoing flows require review; UI-origin pushes remain review-free but show findings. Persist trusted initiator through ChangeSet/human confirmation. Gate issue creation/update/outgoing sync/local conflict resolution, confirmation and resume, before remote writes: current successful review and no effective blocker. Warnings do not block. Human-only enabled override can bypass findings/missing/stale/failed review with explicit confirmation and reason bound to exact plan/input; never bypass existing safety/conflict protections. No override by agents.

UI uses central tokens/primitives. Accessible badge shows unresolved count/highest severity, distinguish pending/running/error/stale; Card details show rule/evidence/advice/version/time, collapsible provenance; map-wide menu filters Card/state/severity. Bulk-fetch summaries, no per-Card query fanout. Multi-selection, settings, exceptions/revocation, fix proposals, agent-waiting and copy instruction are usable. Preview is read-only. Desktop/narrow browser verification required.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Review | Authorized current structured output | Immutable attachment, badge and audit | Reject invalid/cross-Project/incomplete output |
| Concurrent edits | Changed input or restored epoch | Historical stale evidence; fresh review required | No false clean/gate acceptance |
| Decisions/fix | Human selections | Card-only reversible exceptions; proposed correction diff | Reject stale fixes/agent decisions |
| Push | Agent-origin plan with blockers/missing review | No remote write until current pass or explicit enabled human override | Preserve safety and remote conflict checks |
| UI push | Human-origin plan | Existing confirmation; no DoR gate | Type mapping still validated |

</frozen-after-approval>

## Code Map

- `packages/contracts/src/schemas/domain.ts`, `api/card-customization.ts`, `schemas/remote-push.ts`: shared Card, connection, command, snapshot and push schemas.
- `packages/core/src/changesets/`, `packages/db/src/repositories/`, `schema/`, `migrations/`: operation resolution, row mappers, UoW, history, persistence and table classification. Reuse existing patterns; core stays pure, SQL stays in db.
- `apps/server/src/application/card/`, `ai/`, `sync/`, `services/remote-push-{plan,execution,context}.ts`: shared capabilities, trusted actor and exact reviewed push protocol. Preserve baseline dynamic status work.
- `apps/server/src/application/descriptors.ts`, `http/routes/`, `mcp/tools/`, `packages/contracts/src/mcp/`: capability descriptors, thin adapters, manifests and parity checks.
- `apps/web/src/features/story-map/`, `github-sync/`, `app/api.ts`, `ui-strings/`, `styles/`: Card views/editor/bulk, navigation, native type mapping, API and central design. Read actual source/tests before edits.

## Tasks & Acceptance

**Execution:**
- [x] Contracts/core/db -- implement type/migration, criteria, requests/reports/decisions/fixes, freshness, audit/restore/export.
- [x] Server/MCP -- implement validated shared capabilities, post-apply triggers and all agent-origin outgoing gates/override.
- [x] Web -- implement type/mapping editors, badges/menu/detail/settings/decisions/correction handoff and state refresh.
- [x] `.agents/skills/card-dor-review/`, `.claude/skills/card-dor-review/`, `AGENTS.md`, `docs/adr/`, `docs/mcp-tools.md`, `docs/RUNBOOK.md` -- install skill, document narrow exception and operator workflow.
- [x] Focused domain/persistence/application/MCP/UI tests -- cover matrix and real end-to-end flow; run typecheck/build/hygiene and browser desktop/narrow checks.

**Acceptance:**
- Given each ticket type, when reviewed, then applicable DoR checks and stable severities reflect templates without fabricated context.
- Given selected findings, when requesting/applying fixes, then only a reviewed human-approved ChangeSet changes content and re-review confirms resolution.
- Given an agent-origin push later confirmed by a human, when executing/resuming, then DoR enforcement survives provenance changes and races.
- Given ignored rule/occurrence, when rereviewing/revoking, then effective findings/gates update without losing history or affecting another Card.
- Given no active agent, when requesting review/correction, then UI truthfully waits and exposes an actionable skill instruction.

## Implementation Notes

The full plan was approved in chat before this spec; maintain its cohesive end-to-end scope. Work sequentially, do not commit or push implementation changes. No live GitHub mutation without a separately authorized test target. Planning checkpoint approval is already supplied by the user's implementation request.

Root acceptance: real local HTTP/MCP and browser at desktop/390px proved Card type creation, batch request, report delivery inside an open dialog, Card-only ignore/revoke, selected correction proposal, explicit human Approve/Apply, awaiting verification and successful rereview. New Cards appear immediately; ignored selections are pruned. Baseline quick-verifier size failure and unchanged-HEAD Releases assertion are retained separately. No private projects or live GitHub mutations.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Verified evidence and route |
| --- | --- | --- |
| B1 Related Issue creation invalidates child | high | reviewInput excludes same-plan creation links only for cardId; parent/prerequisite links remain fingerprinted and persistBinding adds them mid-batch. Patch same-plan context normalization and test hierarchical execution. |
| B2 Sync ignores type-only change | high | prepareIssues exits the sync branch using fields without native type before resolving mapped issueType. Patch explicit type-delta inclusion and test both Card type and mapping changes. |
| B3 Unrelated historical evidence blocks commands | medium | commandCardReview checks all Project request evidence before/after a scoped command and returns full Project captures. Patch authorization/data selection at the requested scope without exposing inaccessible historical captures. |
| B4 Prerequisite completion meaning missing | high | canonicalReviewInput includes only status string/archived; existing isCardCompleted also depends on workflow definitions and GitHub Issue state. Capture/fingerprint the resolved completion evidence; test interpretation changes. |
| B5 GitHub sources lack revision evidence | medium | github source links contain only identity/locator; retained sync title/body hashes and available exact remoteBefore evidence do not enter reviewInput. Capture authorized locally observed revision/content evidence and explicit unavailability; test source refresh invalidation. |
| B6 Push readiness is plan-agnostic | medium | PushReviewControls renders data.summaries selected across manual and push requests, while execution requires matching outgoing fingerprint. Patch exact-plan effective readiness display using shared server logic. |
| B7 Header pull leaves review cache | medium | story-map-shell pull success invalidates map/health/activity but not card-reviews; own-client events are deliberately skipped. Patch local pull invalidation and test. |
| B8 Override misses parent refresh | medium | PushReviewControls override mutation updates local execution and only card-reviews, bypassing parent map/link/health invalidation. Patch post-execution refresh shared with normal confirmation and test. |
| B9 Applied historical fix always awaits verification | low | reviewSummary checks any applied fix rather than the selected report's fix. After a passing rereview, a later unrelated edit is mislabeled awaiting_verification. Direct condition fix and regression. |
| B10 Batch capture repeatedly reads full Project | medium | request loop calls requestCardReview per Card, which calls getCardReviews and rebuilds snapshots/summaries each time; main badge query serializes all historical captures. Patch shared batch capture and lightweight badge reads with on-demand details; assert batch query bounds. |
| E1 Related creation evidence | high | Independently corroborates B1 at reviewInput sourceLinks filter. Same root cause; patch with B1. |
| E2 Historical access isolation | medium | Independently corroborates B3; Project-wide pre/post checks reject unrelated authorized commands. Patch with B3. |
| E3 Newer pending capture masks successful exact report | medium | assertCardReviewsForPush selects newest matching request before testing for a successful report. Out-of-order completion of identical requests therefore rejects an available current success. Patch success-bearing selection and regression. |
| E4 Type-only Sync | high | Independently corroborates B2's outgoing Sync early return. Patch with B2. |
| V1 Effective blocker/warning gate untested | medium | Pre-verified gap: current agent execution tests reject absent reports then submit all-pass reports; blocker output is only used for corrections. Add blocker/warning/waiver-revocation assertions before remote writes. |
| V2 Prerequisite changes untested | medium | Pre-verified gap: existing freshness cases mutate target title/Product Context/epoch, not a captured prerequisite. Add status/content changes and stale-fix rejection. |
| V3 Source authorization untested | medium | Pre-verified gap: review MCP tests have no captured source whose owner access is revoked. Add inaccessible-evidence protection plus unrelated-authorized-review continuation. |
| V4 Legacy populated mapping upgrade untested | medium | Pre-verified gap: migration fixture opens current schema before populating mappings. Add committed-prefix legacy upgrade preserving null Card types and staling affected proposals. |

All three review layers completed before triage. Findings are implementation defects or direct regression gaps within the approved feature; no user-intent decision is missing. Fix with minimal changes and retain the successful real MCP/browser correction flow, immutable reports, actor provenance, exact-plan safety, manual-hold semantics and existing unrelated baseline failures.

All 18 original findings were patched and independently rechecked against source and regression assertions. Follow-up inspection identified the following bounded defects or verification gaps; all were patched:

| Follow-up | Resolution |
| --- | --- |
| Newer successful blocker could lose to older clean success | Select newest submitted successful matching report before evaluating effective findings; reuse success across pending/error captures only. |
| Historical remoteBefore content paired with newer hashes | Capture durable remoteResult observations; expose readable content only when its hashes match the stored revision, otherwise hash_only. |
| Same-plan updates of bound parents/prerequisites stale dependent reviews | Preserve the reviewed revision through exact authorized remote-success and binding-persistence stages; retain detection of unrelated changes. |
| Resume test could pass via unrelated map-version check | Interrupt a waived-blocker plan, revoke the waiver, and require a protected DoR error with no additional writes. |
| Completion tests asserted no positive result | Fresh captures assert completed=true for local status, workflow-group and GitHub Issue-state transitions. |
| Shared push invalidation rejected optional map scope in TypeScript | Accept the existing optional scope and invalidate map prefixes when absent. |
| Captured GitHub evidence changed fingerprint after schema serialization | Normalize through the shared input schema before canonical hashing; submit/reopen and full migration regressions. |
| Correction proposal stayed waiting inside an open dialog | Project review metadata from mixed transactions while retaining held domain entities and respecting manual Hold, drag and Restore. Real MCP/browser reproduction plus mixed-event regression. |

The final targeted independent source checks closed report selection, source revisions, same-plan updates, normalized fingerprints and mixed live delivery without further findings. Root inspected the strict resume and positive-completion assertions directly.

## Verification

- Workspace typecheck and build passed; final DB/server build repeated after the last same-plan capture correction. Capability manifest141 and MCP inventory105 are consistent; boundaries, source hygiene and whitespace checks passed. Both installed skill copies match.
- Full contracts194 and core463 passed. Full DB run passed573/575; repaired the schema-normalization failure, then all34 review/migration cases passed, including real populated pre-0003 upgrade and capture/submit/reopen. The remaining stress timeout passed alone with the unchanged15-second bound (6.64seconds). No acceptance bound was relaxed.
- Affected server/HTTP/MCP/provider suites cover268 tests across the aggregate and focused repairs. Final six repaired suites passed128/128, including33 review-flow cases. Existing independent remote-push and MCP surface suites passed in the aggregate. Fixtures now explicitly select Card types; SDK Dry Run asserts read authorization and no remote writes.
- Focused live/review/selection/shell UI108 passed; follow-up Card-fields/review/copy cases passed24 with the sole copy-scanner assertion restricted to its nine baseline paths. Discovery8 passed after replacing the positional select assumption with the Parent label.
- Full Web run initially passed992/1005. Seven missing test-fixture review responses and the guided-composer selector were fixed and rechecked. The remaining five failures are baseline: copy scanner, Releases report, Discovery empty-state selector and two Tracking status-order assertions. Those failures were reproduced on unchanged HEAD; new DoR paths no longer appear in copy-scanner violations.
- Quick native verifier passes hygiene and reaches only the existing `apps/web/src/features/changesets/review.test.tsx:66` function-size violation. The size check remains unchanged.
- Real local HTTP/MCP and browser acceptance used only temporary databases. Verified pending→running→reviewed inside an open dialog, lightweight menu/detail queries, badges, Card types, settings, ignore/revoke, selected correction proposal, human Approve/Apply and re-verification. Final mixed ChangeSet/review event delivered its correction link without reload while preserving held domain changes. Desktop/390px screenshots: `/tmp/storymapper-dor-final-dMRtTN/review-final-desktop.png`, `/tmp/storymapper-dor-final-dMRtTN/review-final-narrow.png`. Viewport reset, test tab closed and owned test server stopped. No private data or live GitHub mutation.

No feature work is deferred. Existing Cards remain untyped and legacy Issue-type mappings are deliberately cleared: users must explicitly select Card types and remap the connection before outgoing pushes. Implementation changes are uncommitted; the separately authorized prior state was already committed at the recorded baseline.

## Changelog

- 2026-11-04 v1: Record the already-approved complete implementation scope and baseline.
- 2026-11-04 v2: Complete implementation, independent review remediation, native verification and isolated real MCP/browser acceptance; record unchanged baseline limits.
