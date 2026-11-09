---
title: Plan drift report
type: feature
created: 2026-10-15
version: 4
status: done
baseline_revision: 218a9ae70846508e27a40bc01ca604d7373249e0
review_loop_iteration: 0
followup_review_recommended: true
context: [AGENTS.md, .wolf/OPENWOLF.md, .wolf/cerebrum.md, docs/adr/0006-source-plan-reconciliation.md]
warnings: [oversized]
deferred:
  - summary: >-
      Benchmark transient memory and execution scaling for very large selected publication batches.
    evidence: |-
      Review identifies repeated cumulative baseline snapshots and previously published-reference scans. Current configured 200-operation/1,000-Card absolute pipeline checks pass and a 1,000-reference publication completes; peak memory and higher-batch latency have not been measured. Settle with increasing actual public-preview/publication batches, exact peak-memory measurements and applicable execution bounds. Permanent audit duplication is fixed separately.
    location: >-
      packages/core/src/changesets/source-plan-resolution.ts:56; packages/core/src/changesets/operation-registry.ts:164
    severity: medium (unverified)
---

# Story 5.5: Plan drift report

Reproducing statement: Implement and commit the accepted Story5.5 source-plan reconciliation decision, continuing the authorized autonomous development session. Date:2026-10-16. Version:4. Changelog: durable drift reports and human-approved matching-state acknowledgment implemented, independently reviewed, fully verified and accepted in the actual isolated browser; orchestrator files preserved.

<intent-contract>

## Intent

**Problem:** Users and Agents cannot read how the current Story Map differs from its last synchronized external source, including fields and identities lost through coalesced history or deletion.

**Approach:** Retain versioned per-system/map synchronization evidence and calculate pure read-only drift for a Slices drawer and shared HTTP/MCP capability. Applied publications advance only addressed selected evidence from final committed values. A separate human-approved source-reconciliation ChangeSet step acknowledges reviewed source projections matching current local state without changing Card fields.

## Boundaries & Constraints

**Always:** Contracts own schemas; core is pure; repositories own SQL; actor-aware application reads serve HTTP/MCP with actual scope authorization. External writes require a ChangeSet before separate application. Retain AD-10 ordinary upsert human-conflict refusal and final addressed syncedVersion equality. Reconciliation requires a separate human-approved acknowledgment with current version/baseline/binding evidence and exact matching source/local projection; stale or divergent evidence refuses atomically. No Agent approval/auto-apply bypass for acknowledgment. Keep durable source baselines separate from manual Plan states. Preserve archived versus physically deleted identity, reopen/archive/Restore consistency, live invalidation, keyboard/Escape/focus return and shared English strings. Actual isolated browser acceptance and unchanged Epic 5 performance bounds are mandatory.

**Never:** Write, stage or revert sprint-status.yaml or deferred-work.md; infer verification from done/awaiting-operator rows; write source-plan files; mutate user Projects; commit/push without explicit instruction; invent baselines from Card Versions; silently acknowledge human conflicts; unset/rebind external references as a reconciliation workaround.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Drift | Known synchronized map/system, local edits | Stable Card identities and exact old/new title, description, status and Slice; shared Card can be Changed and Moved | No guessed historical values |
| Membership | Local unreferenced addition; synchronized Card archived or physically deleted | Added/Removed identity; archive distinguished from deletion, including after ordinary reference cleanup | Honest inactive/parked/hidden ancestry presentation |
| Partial publication | Addressed, excluded and other-system entities | Only selected applied addressed entries advance to final versions/values; unchanged upserts count | Conflict/rollback leaves evidence unchanged |
| SM-10 reconciliation | Human moves synchronized Story; Agent updates source and publishes | Initial report names old/new Slice; successful reconciled publication makes report empty | Separate human-approved matching-state acknowledgment; stale/divergent/unapproved evidence refuses atomically and ordinary conflicts remain refused |
| Durability | Coalesced saves, reference deletion, reopening, archive/Restore | Exact synchronized evidence survives independently of Card history and ordinary references | Missing/unsupported baseline fails visibly |
| Manual capture | Record/compare Story 5.2 Plan states | No external baseline or syncedVersion changes | No coupling to manual capture |
| Systems/read-only | Unknown system; deleted last referenced Card | Error lists scoped evidenced systems; retained baseline remains discoverable; reads never alter baseline/domain/source files | Known refs without durable evidence cannot manufacture a baseline |
| UI/live | Slices drawer, keyboard, publication/Restore | System selector, loading/error/empty states, exact old/new values, Escape/focus return, canonical held invalidation | Hide stale success after failed refetch |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/plan-drift.ts` (new), `plan-states.ts`, `change-operations.ts`, `change-set-schemas.ts`, `operation-resolution.ts`, exports — strict schema-versioned Map/system baseline with entries keyed by stable Card ID (captured full Card or acknowledged deletion, retained identity, active membership, binding evidence, captured Release names); `acknowledge:sourcePlan` operation and report/system response. Reuse canonical `PlanStateProjection`, never manual Plan-state persistence. Follow the existing operation schema-version policy and update actual fixtures.
- `packages/core/src/reports/{plan-drift.ts,slices.ts}`, `changesets/{operation-registry.ts,remaining-owners.ts,operation-dependencies.ts,operation-conflicts.ts}` — pure all-Card comparison and acknowledgment resolver. Add Map-owned source-baseline collection/change; reject duplicate/foreign entries, stale baseline revision/full current Card/binding, mismatching source projection and unknown deletion identities. Retain ordinary `upsert-resolution.ts:27–30` refusal. All selected same-cut effects must leave acknowledgment source equality valid.
- `packages/db/src/{connection.ts,schema/tables.ts,schema/classification.ts,restore-validation.ts,snapshot.ts}`, new baseline repository/validator, `repositories/{storymapper-repository.ts,operation-snapshot-repository.ts,operation-supply-repository.ts,operation-persistence-repository.ts,external-refs-repository.ts}` — durable Map-owned business rows, no Card/Release FKs, strict owner/payload validation, atomic resolved persistence. Capture initial bindings and addressed changed/unchanged publications from final state only; retain deleted entries. Archive/import/Restore preserve own-Project evidence; map copy excludes it.
- `packages/db/src/repositories/changesets-repository.ts:{updateChangeSetStatus,applyChangeSet}` — selected dependency-closed acknowledgment needs actual recorded human approval matching operation hash/selection. Reject Agent approval irrespective of allowAgentApproval and command-receipt apply bypass. Human approval may be applied by an otherwise admitted Agent; no unconditional human-only apply rule.
- `apps/server/src/application/changeset/{changeset-command.ts,changeset-executor.ts,changeset.use-cases.ts,submit-changeset.use-cases.ts,preview-changeset.use-cases.ts}` — early and transactional human-approval gate, commands containing selected acknowledgment defer to stored proposal even apply:true; preview reports truthful canApprove/canApply and actual old/new effects. Preserve ordinary commands and deselected acknowledgment behavior.
- `apps/server/src/application/report/plan-drift.use-cases.ts` (new), descriptors/report routes, MCP registration/tool inputs/names/metadata, `mcp/tools/project-scopes.ts` — shared actor-aware read, scoped system discovery from refs plus retained evidence, nested acknowledgment ownership. Register generic SubmitChangeSet operation, no direct acknowledgment mutation tool. Generate capability artifacts with existing generator.
- `apps/web/src/features/reports/PlanDriftDrawer.tsx` and parsed query helper (new), `features/story-map/views/SlicesView.tsx`, shared strings/CSS, `app/live/{live-query-invalidation.ts,live-interaction-store.ts}`, `features/changesets/useChangeSetReview.ts` — independent accessible drawer with system select, exact old/new values/reasons, honest unavailable/error/empty, abort/refetch/Restore invalidation and no stale success; selector-inclusive focus trap, Escape/trigger return. Keep read-only drift drawer refreshable, retain dirty/manual/drag guards and invalidate own-origin applied acknowledgment explicitly.
- Meaningful tests: core report/operation-resolution/selection; DB external refs/executor/snapshot/archive/Restore/copy; server report HTTP + actual MCP agent-approval transport matrix; mounted Slices/drift drawer/review/live. Existing `application/report/plan-state.test.ts`, `mcp/tools/agent-approval.test.ts`, and `WhatChangedProvider.test.tsx` are executable integration patterns, not replacement surface evidence.
- Read-only: user local-projects, external source files and orchestrator sprint/deferred ledgers. ADR0006 is accepted. Three read-only investigators verified source; graph capabilities were unavailable. Existing5.4 Code Map/Design/tasks and Epic5 preparation/context consumed.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/schemas/{plan-drift,change-operations,operation-resolution}.ts` and exports — define baseline, report and reviewed acknowledgment schemas with explicit source/current/version/binding evidence.
- [x] `packages/core/src/{reports/plan-drift.ts,changesets/*}` — pure report/acknowledgment and selected final publication tracking; test every matrix row and preserve existing upsert regression expectations.
- [x] `packages/db/src/{connection,schema/*,restore-validation,snapshot}.ts` and baseline/operation/external-ref repositories — durable addressed evidence and atomic publication/acknowledgment; test rollback, reopen, deletion/ref cleanup, archive/Restore and copy exclusion.
- [x] `packages/db/src/repositories/changesets-repository.ts` and server changeset paths — enforce stored exact human approval through preview, normal apply, Agent permissive-policy and newly-created command routes; actual transport tests prove no bypass and valid Human-approve/Agent-apply.
- [x] Server report routes, descriptors/MCP scope/input/metadata paths — shared read-only report/system discovery with Project/Map ownership and payload validation; generate/check capability parity.
- [x] `apps/web/src/features/reports/PlanDriftDrawer.tsx`, SlicesView, parsed API, strings/CSS/live/review hooks — canonical/preview-aware read-only drawer, matching-state review and application refresh, keyboard/error/stale-query behavior.
- [x] Core/DB/server/web tests plus actual isolated browser — cover matrix, SM-10 through real UI review/Approve/Apply, MCP parity/refusals, stale/divergent atomic refusal, manual capture independence, second-client/Restore and unchanged1,000-Card100/300ms budgets; full configured tests/typecheck/lint/release verification and independent review.

**Acceptance Criteria:**

- Given a synchronized cut, when human fields/membership change, then UI and MCP return exact durable old/new identity and values, including unreferenced additions and archived/deleted removals.
- Given addressed, excluded and unrelated-system publications, when selected application commits, then only addressed evidence advances to final versions and ordinary human conflicts never silently advance it.
- Given a human Slice move, when the Agent submits a matching source acknowledgment and a human approves it before ordinary authorized apply, then the first report names old/new Slice and the next is empty.
- Given reopening or Restore, when reporting, then durable source evidence is coherent and manual Plan-state capture has not advanced it.
- Given an unknown system, when requested, then an error names actual scoped systems; report reads write no domain/baseline/source content.

## Spec Change Log

- 2026-10-16: Explicit maintainer decision resolves the old policy gap; accepted ADR0006 and planv4 authorize separate match-only human-approved acknowledgment. Three source investigations refined schema/ownership, command bypass/preview gates, final publication and UI invalidation into runnable tasks. Keep ordinary upsert protection and all prior evidence.

- 2026-10-15: Investigation found a policy gap in the binding SM-10 acceptance, not an exact-schema naming choice. Preserved existing conflict safety; stopped before implementation instead of inventing acknowledgment semantics or bypassing refs.

## Review Triage Log

Four independent context-free review layers ran. A four-agent platform cap queued the fourth until a slot freed; all four launched before triage and every layer reported before classification. Implementation-only review diff isolates narrative claims; the edge layer received the spec separately after tracing. Earlier planning halts remain historical.

### 2026-10-16 — Review pass 1
- verdicts: 17 findings — high 4, medium 6, low 0, false 6, maybe-false 1
- findings (arrival order; duplicate key-allocation reports share one repair group):
  - `[medium]` `[patch]` Gap reviewer: Slices preview wiring lacks integration coverage — standalone drawer tests supply readOnly directly and cannot detect a caller regression. Actual browser preview disable was observed; mounted Slices now tests an actual local move/refetch and real preview projection disable/no reads.
  - `[high]` `[patch]` Edge reviewer: historical baseline before retains NEW-* keys for same-cut new Cards — persistence repairs only after at operation-persistence-repository.ts:36; exact delta comparison treats prior new entries as changed. Both cuts now receive allocated keys; multi-new-Card persistence regression proves canonical identities and linear changed-entry evidence.
  - `[medium]` `[patch]` Blind1: own-origin Card mutations do not invalidate drift — card-query-invalidation.ts omits both keys while live updates skip own origin. Both prefixes added; mounted actual mutation and native browser Save refresh the open report without reload.
  - `[high]` `[patch]` Blind2: same-cut baseline before retains provisional identities — same verified key-allocation defect as Edge1. Both evidence sides are normalized before exact delta projection; shared repair is covered by multi-new-Card regression.
  - `[medium]` `[patch]` Blind3: contradictory captured Release evidence passes Restore — schema permits unscheduled Cards with non-null captured Slice name and missing captured Release identity metadata. Such stored data can display an invented old Slice; strict schemas now reject demonstrated contradictions; DB read and Restore regressions cover them while preserving historical entry names.
  - `[medium]` `[patch]` Blind4: captured archived/parked Card may claim active membership — current schema accepts this direct contradiction, causing a spurious removal against unchanged canonical state. Direct schema consistency checks and DB read/Restore regressions reject both contradictions.
  - `[medium]` `[patch]` Blind5: background fetch collapses report content — !loading unmounts cached articles, allowing scroll position to collapse. Cached articles remain mounted while busy and are hidden on failure; mounted tests retain node identity and scroll.
  - `[medium]` `[patch]` Blind6: successful retry removes focused action — Retry disappears on success without a surviving-control focus handoff. Removed Retry returns focus to surviving Close only if focus fell to body; tests preserve intentional moves and actual browser recovery returns focus correctly.
  - `[high]` `[patch]` Blind7: dense drift list has unbounded offscreen rendering cost — actual isolated 1,000-Card/1,000-difference native opening measured414.4ms (DOM100.1ms), exceeding unchanged100ms. All failures (414.4,110.8,111.5ms) are preserved. Bounded50-entry accessible pages plus profiled strict read-path optimization now open the cold1,000-difference report in93.1ms; all1,000 remain reachable, boundary/live focus is covered, and final Card90.1/filter28.3/reset38.7ms pass unchanged bounds.
  - `[maybe-false]` `[defer]` Blind8: cumulative publication scans may create excessive transient cost — source confirms repeated work, but no claimed absolute failure is demonstrated: configured200-operation/1,000-Card pipelines pass and1,000-reference publication completes. Peak memory and increasing public batch timings would settle the medium-if-true claim; recorded unverified in the single frontmatter list.
  - `[high]` `[patch]` Blind9: pending preview repeats complete cumulative baseline evidence — preview returns each full resolved baseline change and UI stringifies each one; the same full effect data produced897MB in initial1,000-reference audit. Pending DTO reuses explicit exact addressed-entry projection, retaining complete canonical persistence; 40-new-Card preview proves bounded evidence, full projected Cards and no read mutation.
  - `[false]` `[reject]` Blind10: nonmodal drawer traps keyboard users — Escape and Close provide standard tested keyboard exits and return focus to trigger; underlying interface is then reachable. aria-modal=false truthfully reflects that pointer/background access remains available. The existing What changed drawer uses the same focus-managed model; no keyboard-only inescapable trap occurs.
  - `[false]` `[reject]` Intent1: integrated browser evidence absent from supplied implementation diff — source-only reviewer input deliberately isolates narrative claims. Actual final native Slices review/Approve/Apply, source selection and exact report values are recorded in evidence/story-5-5-browser.json and the final screenshot; jsdom is not claimed as browser proof.
  - `[false]` `[reject]` Intent2: SM-10 lacks independent source-update/browser proof — intent explicitly uses caller-submitted human-attested source projection, not independent external-file certification. Final public-report-derived MCP submission, real UI human approval/separate Apply and beta-to-empty/alpha-unmodified were exercised. Source files were not written, as required.
  - `[false]` `[reject]` Intent3: publication/Restore live channel not demonstrated — actual final two-client Save updates the open reader, manual hold preserves its observed cut, release drains it, and actual Restore returns it to empty without reader reload. Native browser observations are separately retained.
  - `[false]` `[reject]` Intent4: durable behavior is only repository proof — the current-browser Restore completed and the already-open reader automatically rendered the restored source baseline; server restart/reopening retained it. Repository archive/reopen/Restore tests complement that outer-surface evidence.
  - `[false]` `[reject]` Intent5: absolute browser performance missing from supplied diff — native1,000-Card metrics and all failures are separately retained. Sparse final75.3/96.6/30/32.6ms passed; the subsequently measured dense414.4ms failure is acknowledged and routed to Blind7 repair, not concealed as passing.


## Design Notes

Current implementation design (ADR0006): one revisioned row per Project/Map/system with Card-ID-keyed entries and captured Release identity/name, independent of extant Card/ref FKs. Acknowledgment requires an existing proven baseline row and its exact revision; new unreferenced additions may have null prior entry/binding, while deletion requires retained prior identity. Submitted source projection is complete for drift fields and active membership; reviewed current full Card (or proven local absence) and exact extant binding are rechecked. Reject duplicate IDs, foreign roots and stale binding/baseline evidence. Partial acknowledgment changes only selected addressed entries. New ordinary binding establishes current evidence; pre-existing refs without durable evidence fail visibly rather than invent history. The human gate is approval provenance, not application actor. Final same-cut evidence must still match after all selected operations.

Historical investigated candidate: durable business-data records scoped by Project/map/system with versioned payloads, retaining per-Card exact publication fields, active membership and captured Release id/name independently of ordinary references. Only addressed selected publications advance entries after final state/key allocation; manual states and other systems stay independent. This is investigation, not an accepted architecture decision; no ADR or persistence code has been introduced.

### Historical unresolved intent decision (resolved on 2026-10-16)

Which explicit action authorizes acknowledging human drift after the Agent has updated its source: a separate reviewed baseline-acknowledgment ChangeSet operation, or a changed upsert contract with an explicit current-state acknowledgment? What exact reviewed evidence and race checks does that action require, and may it only acknowledge matching source/local values or also apply divergent fields?

These choices produce observably different API, approval and conflict behavior. The plan requires both post-human republish convergence and preservation of existing conflict refusal, but specifies no reconciliation authorization. Merely supplying current baseVersion cannot solve this: the independent syncedVersion guard still rejects. Existing set-ref is unchanged; removing/recreating a binding would bypass the required conflict policy.

## Verification

Current implementation gates (Node24 PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH):

- `corepack pnpm test` — all configured packages/scripts, with new meaningful matrix coverage executed and passing.
- `corepack pnpm typecheck` and `corepack pnpm lint` — workspace pass.
- `corepack pnpm generate-capabilities` and `corepack pnpm check-capabilities` — exact descriptor/tool/HTTP parity after registration.
- `node scripts/verify.mjs` — full source hygiene, installed-runtime, typecheck and build; stage new owned source before git-ls-files-based checks, never ledgers.
- `git diff --check` — clean whitespace.
- Actual isolated browser: reuse existing synthetic seed structures from prior Epic5 acceptance, no user data. Establish per-system baselines through real publication; human move/edit/archive/delete/add; read UI/MCP exact old/new values; matching ACK real preview -> human Approve -> Apply -> addressed empty report. Agent approval/auto-apply and stale/divergent cases refuse, no baseline/Card partial changes. Test selector, errors, keyboard/trigger focus, live second-client/Restore and manual Plan-state independence; record actual100/300ms on1,000Cards, retain all failed samples. No current performance waiver applies.

Historical preimplementation checks:

- Executed with Node 24.17.0: `corepack pnpm --filter @storymapper/core exec vitest run src/changesets/operation-resolution.test.ts -t "applies mixed-field external status updates|records addressed publication baselines|advances only the addressed selected external archive"` — exit 0; one file, three tests passed, 66 intentionally filtered out. These verify existing refusal/isolated publication behavior, not delivered Story 5.5 functionality.
- Application implementation, full suite/build, matrix acceptance, actual browser and independent implementation review were not run because planning halted. Browser availability was checked read-only; no acceptance Project/runtime was created.

## Historical Auto Run Result — Initial Planning

Status: blocked
Blocking condition: intent gap

Baseline inspected: 582f671c8df7700c05c3669f61def398c2682041. No implementation baseline is stamped because step 03 was not entered.

The exact-once skill renderer succeeded. Activation, routing, binding preparation, prior-story continuity and three read-only source investigations completed. Step 02 instruction 5 requires HALT when multiple observable reconciliation policies remain unspecified. Source and existing passing tests establish that normal republishing cannot meet SM-10 after a human move under current AD-10 rules.

Application code, source plans, sprint-status.yaml and deferred-work.md were not written, staged or reverted. No commit, push, loop continuation or user-data mutation. Resolve the reconciliation authorization contract in planning, then redispatch this story; do not infer verification or select another story from orchestrator rows.

## Historical Auto Run Result — Continuation Revalidation 2026-10-15

Status: blocked
Blocking condition: intent gap

Version: 2. Reproducing statement: Commit successful Story5.4 acceptance, then continue the next Epic5 story without writing orchestrator-owned tracking files. Changelog: Story5.4 acceptance committed as1fd3564b55232b13a6f8090a4983960ab9385a2f; fresh targeted and independent read-only checks confirm the existing5.5 planning block.

The exact-once renderer produced workflow snapshot `81aff06a58b74e8776b6`. Activation, valid cached Epic5 context, binding preparation/detail plan and completed5.4 continuity were loaded. Git metadata refresh succeeded; all existing dirt was expected spec/OpenWolf bookkeeping. Planning was resumed through the blocked epic-story route rather than selecting work from sprint rows. No implementation baseline is stamped because step03 was not entered.

Inspected revision:1fd3564b55232b13a6f8090a4983960ab9385a2f. Upsert resolution, root baseline check, strict operation contract and5.5 detail plan have no changes since the prior inspected582f671c8df7700c05c3669f61def398c2682041. Direct inspection and an independent read-only subagent agree:

- `packages/core/src/changesets/upsert-resolution.ts:27–30` still refuses stale synchronized versions independently of a fresh explicit root version, before publication effects.
- `packages/contracts/src/schemas/change-operations.ts:39–41` contains no reviewed-current-state acknowledgment contract; `link-resolution.ts:65–68` makes an identical binding a no-op.
- Existing GitHub conflict resolution is restricted to its provider flow; it does not authorize generic source-plan baseline reconciliation.
- Binding SM-10 still requires a reviewed republish after a human move to clear drift, without specifying which operation/evidence authorizes acknowledgment, its race checks, or whether divergent fields may be applied.

Fresh Node24 focused operation-resolution run:3 tests passed,66 intentionally filtered, exit0. Command is the same focused command in Verification above. These establish existing safe refusal and addressed-baseline behavior, not Story5.5 functionality. No code, source plan, ADR, browser fixture, application build/full-suite or implementation review was changed/run. The spec remains insufficient/coherently blocked until the explicit reconciliation contract is decided. Do not bypass conflict safety or advance to another story. sprint-status.yaml and deferred-work.md were not written, staged or reverted.

## Accepted Reconciliation Decision — 2026-10-16

The maintainer explicitly accepted the proposed separate ChangeSet acknowledgment step and instructed commit/continuation. A human reviews/approves source values matching the current local projection. Apply rechecks versions and observed binding/baseline evidence, refuses races or divergence atomically, and advances only addressed source baseline/ref versions without modifying Card fields. Source files stay outside Agentic Story Mapper; the submitted reviewed source projection is evidence, not an independently verified filesystem assertion. Ordinary Card changes and ordinary upsert conflicts remain separate. ADR0006 records this decision. Earlier blocked results remain historical; runnable planning must now refine schema/persistence/preview/approval integration and verification before ready-for-dev.

## Historical Planning Verification — 2026-10-16

Accepted user decision supersedes the historical blocked results. Current intent-contract is preserved verbatim from the approved draft. Tasks, exact implementation seams, scope/privacy constraints, approval provenance, matching/race semantics and surface-level verification are resolved. The source field projection is explicit submitted evidence, not independently certified external file content. No application behavior has been changed yet.

## Pre-review Implementation Verification — 2026-10-16

Implementation is complete and entering independent review. The approved intent-contract is unchanged. Public reports now include baselineId and actual current binding evidence so an Agent can construct its acknowledgment entirely from the shared API. Canonical projection reads avoid unrelated inventory work; system discovery reads identity metadata only. Historical baseline Activity explicitly marks exact addressed-entry deltas while canonical persistence remains complete; pending and historical review DTOs now explicitly expose exact addressed-entry deltas.

Node24 full `corepack pnpm test` passed:82 script tests,136 contracts,7 importers,289 core,319 web,404 DB,623 server and14 serial audit/performance tests (1,874 total). Full `node scripts/verify.mjs` passed including source hygiene, workspace typecheck and build; workspace lint and129-capability generation/parity passed. Whitespace is clean. Logs are recorded in evidence/story-5-5-browser.json. Initial failed runs are preserved in /tmp/story-5-5-workspace-test.log, /tmp/story-5-5-packages-test.log and /tmp/story-5-5-workspace-final-test.log; missing staged fixture files, an authorization repeated-read bottleneck and a new test's proposal/apply timestamp assumption were corrected before the stable passing run.

Matrix audit: every row has executed passing coverage. Drift/membership/SM-10 and parked/hidden ancestry:core changesets/source-plan-resolution.test.ts(13 tests) plus mounted PlanDriftDrawer.test.tsx(7). Partial publication/durability/manual capture/unknown or corrupt evidence:DB source-plan-baselines.test.ts(15), source-plan-audit.test.ts(3), existing publication/executor regressions. Systems/read-only/approval policy and actual HTTP+SDK MCP parity:server application/report/plan-drift.test.ts(8), project-scopes.test.ts(1) and full roundtrip regressions. UI/live:mounted drawer and live-query invalidation tests, plus actual isolated two-client browser. All these files ran in the full passing suite; none of the covering matrix cases is skipped or filtered.

Actual final browser:report-derived Agent MCP SubmitChangeSet(apply:true) remains proposed; real UI Human Approve then separate Apply clears beta only while alpha keeps4 differences. Agent approval403, unapproved Apply409, divergent Submit409 and stale-baseline Apply409 preserve source/Card evidence. Exact old/new fields, simultaneous Changed/Moved, archived/deleted reasons and unreferenced addition are visible. Selector-inclusive keyboard wrapping/Escape/focus return, visible failed-refetch/retry, independent manual capture(version6), second-client live change, manual hold/release and actual Restore-to-empty without reader reload passed. Final1,000-Card native trusted metrics:drawer75.3ms, close29.1ms, Card96.6ms, filter30ms, reset32.6ms; unchanged100/300ms budgets pass. Earlier113.3/109.3ms drawer failures and the intermediate67.1ms repair sample are retained. A fresh1,000-reference publication stores1,970,703 bytes of operation evidence in a10,833,920-byte DB, versus the initial897,115,640-byte repeated audit evidence. No user data or orchestrator ledgers were changed.

Review risk to assess:full per-operation baseline snapshots still retain quadratic transient memory for very large pending publications; permanent Activity duplication is corrected. No deferral or acceptance decision is inferred yet.

## Auto Run Result

Status: done. Reviewed implementation, spec, evidence and related session bookkeeping finalized in the authorized local Conventional Commit; no push.

Durable per-system/map source evidence now drives the read-only Slices drawer and shared authorized HTTP/MCP reports. Matching-state acknowledgment is a separate ChangeSet requiring recorded human approval, exact current Card/binding/baseline evidence and atomic revalidation; it changes baseline/ref synchronization only. Ordinary human-upsert conflict protection remains enforced. Captured identities, historical Slice names and deletion evidence survive reopen/archive/Restore independently of manual Plan states.

Four independent review layers produced17 individually logged findings:10 patch findings in9 root-cause groups (3high,6medium),1medium-if-true unverified deferral and6rejections. Repairs normalize allocated keys in both audit cuts, bound exact pending/historical evidence, validate captured membership/Slices, invalidate own-origin reads, retain refresh nodes/scroll and recover focus, cover actual Slices preview wiring and bound dense rendering with accessible50-entry pages. All six rejections retain their individual reasons above: tested keyboard exit disproves the alleged trap; five outer-surface gaps are disproved by separate actual browser/transport/Restore/performance evidence and the accepted human-attestation source contract.

Follow-up review recommended: true. First-pass patched-group counts are3high and6medium. Specific unverified risk: complete internal per-operation cumulative publication snapshots may consume excessive transient memory at very large selected batch sizes; peak memory and increasing actual public-preview/publication batch bounds remain unmeasured. This is the single medium(unverified) frontmatter deferred item; no orchestrator ledger was edited.

Final native browser on the optimized build:1,000-Card/1,000-difference cold report93.1ms, close41.4ms, Card90.1ms, filter28.3ms and reset38.7ms, all trusted and within unchanged100/300ms. Earlier failures remain in committed evidence. Scoped dependency joins reduce measured query work4.4→0.48ms; actual isolated server report pipeline55.06→41.32ms cold. Strict timestamp acceptance equivalence, raw/public invalid-baseline refusal, fully validated repository handoff and independent output objects are regression-covered.

Residual limits: the submitted source projection is human-attested evidence, not independent source-file certification. Existing Vite bundle-size advice remains. Earlier failed browser timings and test runs are retained, with no transferred Story5.2 waiver. No user Project, credential, source-plan file or orchestrator tracking file changed; no push.

### Final verification outcomes

- Node24 `corepack pnpm test`: exit0, all1,903 configured tests pass:82 scripts,150 contracts,7 importers,290 core,326 web,410 DB,624 server and14 serial audit/performance. Packages without tests report that explicitly. All matrix-covering tests executed, none skipped or filtered.
- `node scripts/verify.mjs`: exit0, complete hygiene/runtime/typecheck/build. `corepack pnpm lint`: exit0. `generate-capabilities` and `check-capabilities`: exit0,129 capabilities. Whitespace checks pass. Logs: `/tmp/story-5-5-accepted-{test,verify,lint}.log`.
- Current matrix coverage: core source-plan-resolution14; DB source-plan-baselines20 and source-plan-audit4; server plan-drift9 and source-scope1; mounted drawer12 and Slices11; timestamp equivalence14. Existing whole-suite operation, archive, Restore, manual capture and live regressions also pass.
- Actual isolated browser: exact old/new values and membership; report-derived Agent proposal remains proposed; real human Approve then separate Apply empties only addressed source; stale/divergent/unapproved refusal preserves Cards/baseline; second-client live/manual holds/actual Restore, independent manual capture, keyboard exits, own-origin Save and recovered Retry focus pass. Final trusted cold dense report93.1ms, close41.4ms, Card90.1ms, filter28.3ms, reset38.7ms pass100/300ms. All prior failures remain in `evidence/story-5-5-browser.json`.
- The first review full-suite attempt exposed a new test's Activity display-order assumption; selecting the recorded operationId/index repaired the test without weakening exact evidence assertions. Failed log retained at `/tmp/story-5-5-reviewed-test.log`; final complete rerun passes.
- Accepted intent-contract is byte-identical to baseline218a9ae. Orchestrator files retain their recorded SHA256 values. Temporary browser tabs/server closed; probes and synthetic databases remained under temporary storage.

### Reviewed files

- `.wolf/STATUS.md` — Preserve session handoff, lessons and verification history.
- `.wolf/buglog.json` — Preserve session handoff, lessons and verification history.
- `.wolf/cerebrum.md` — Preserve session handoff, lessons and verification history.
- `.wolf/memory.md` — Preserve session handoff, lessons and verification history.
- `_bmad-output/implementation-artifacts/evidence/story-5-5-browser.json` — Record actual isolated browser, transport and performance evidence.
- `_bmad-output/implementation-artifacts/spec-5-5-plan-drift-report.md` — Record accepted implementation, complete triage, gates and deferred risk.
- `apps/server/src/application/capability-manifest.json` — Register/generate exact shared HTTP and MCP capability metadata.
- `apps/server/src/application/changeset/changeset-command.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/application/changeset/changeset-executor.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/application/changeset/changeset.use-cases.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/application/changeset/preview-changeset.use-cases.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/application/descriptors.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/application/report/plan-drift.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `apps/server/src/application/report/plan-drift.use-cases.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/http/routes/report-routes.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/mcp/tools/project-scopes.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `apps/server/src/mcp/tools/project-scopes.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/server/src/mcp/tools/register-content-tools.ts` — Authorize and expose shared drift/acknowledgment behavior with exact review evidence.
- `apps/web/src/app/live/live-interaction-store.ts` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/app/live/live-query-invalidation.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `apps/web/src/app/live/live-query-invalidation.ts` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/features/changesets/ChangeSetReview.tsx` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/features/changesets/useChangeSetReview.ts` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/features/reports/PlanDriftDrawer.test.tsx` — Exercise meaningful behavior, refusal or integration regressions.
- `apps/web/src/features/reports/PlanDriftDrawer.tsx` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/features/reports/plan-drift-api.ts` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/features/reports/plan-drift.css` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/features/story-map/card-query-invalidation.ts` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/features/story-map/views/SlicesView.test.tsx` — Exercise meaningful behavior, refusal or integration regressions.
- `apps/web/src/features/story-map/views/SlicesView.tsx` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/ui-strings/index.ts` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `apps/web/src/ui-strings/plan-drift.ts` — Integrate accessible drift display, live invalidation or reviewed ChangeSet presentation.
- `docs/mcp-tools.md` — Document the new shared drift capability and reconciliation contract.
- `packages/contracts/src/index.ts` — Define or expose source evidence, acknowledgment and report contracts.
- `packages/contracts/src/mcp/tool-inputs.ts` — Define or expose source evidence, acknowledgment and report contracts.
- `packages/contracts/src/mcp/tools.ts` — Define or expose source evidence, acknowledgment and report contracts.
- `packages/contracts/src/schemas/change-operations.ts` — Define or expose source evidence, acknowledgment and report contracts.
- `packages/contracts/src/schemas/change-set-schemas.ts` — Define or expose source evidence, acknowledgment and report contracts.
- `packages/contracts/src/schemas/changeset-preview.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `packages/contracts/src/schemas/operation-resolution.ts` — Define or expose source evidence, acknowledgment and report contracts.
- `packages/contracts/src/schemas/plan-drift.ts` — Define or expose source evidence, acknowledgment and report contracts.
- `packages/core/src/changesets/entity-resolution.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/changesets/link-resolution.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/changesets/operation-conflicts.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/changesets/operation-dependencies.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/changesets/operation-registry.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/changesets/operation-resolution.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `packages/core/src/changesets/remaining-operation-resolution.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `packages/core/src/changesets/remaining-owners.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/changesets/resolution-context.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/changesets/source-plan-resolution.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `packages/core/src/changesets/source-plan-resolution.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/index.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/core/src/reports/plan-drift.ts` — Resolve pure authorized evidence changes or calculate exact drift.
- `packages/db/src/connection.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/live-change-tracking.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/changesets-repository.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/external-refs-repository.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/operation-audit-projection.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/operation-executor-persistence.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `packages/db/src/repositories/operation-persistence-repository.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/operation-snapshot-repository.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/plan-states-repository.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/source-plan-audit.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `packages/db/src/repositories/source-plan-baselines-repository.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/repositories/source-plan-baselines.test.ts` — Exercise meaningful behavior, refusal or integration regressions.
- `packages/db/src/repositories/storymapper-repository.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/restore-validation.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/schema/classification.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/schema/tables.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/db/src/source-plan-baseline-validation.ts` — Persist, validate, restore or project durable source-plan evidence atomically.
- `packages/mcp/src/tool-definitions/capabilities.ts` — Document the new shared drift capability and reconciliation contract.
- `scripts/mcp-tool-metadata.json` — Register/generate exact shared HTTP and MCP capability metadata.
- `packages/contracts/src/schemas/domain.ts` — Try the ordinary server timestamp precision first without changing accepted strings.
- `packages/contracts/src/schemas/card-timestamps.test.ts` — Prove accepted/rejected timestamp variants match the former union exactly.
