---
title: '4.13 Validation gate with five BMad users'
type: chore
created: '2026-10-12'
status: done
baseline_revision: e6747d56ff1e55316c76470bdaa15ef4a33659eb
baseline_commit: 01cfed1593dc6a3b32762d3d1259af211185a5e2
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
version: 7
---

Reproducing statement: Execute Story 4.13 through bmad-build-auto as five measured actual-browser simulations using Story 4.12 inputs; preserve orchestrator-owned sprint-status.yaml without writing or reverting it.


## Current disposition — externally verified completion, 2026-10-16

The user explicitly authorized detailed investigation and, if bookkeeping was the cause, intervention in the Epic4/5 orchestrator. This bounded authorization supersedes the earlier ledger prohibition for the present reconciliation only; the original execution contract below remains historical and unchanged.

Story4.13 is done under the existing timing exception. The five actual-browser scenarios completed in `98a92fc`; the later `5ead942` redispatch was blocked by unavailable browser controls, not a demonstrated product failure. Its five unexecuted scenarios remain unexecuted. No fresh browser pass is claimed by this reconciliation.

An independent offline audit now closes the historical field-verification gaps B3/B4: all231bundle,70observation and19screenshot hashes, initial intended effects for all six recorded initial sets (including the interrupted protection run), and all19changed refresh effects pass. Scenario4 retains145/153 effects. Reproduction: `python3 _bmad-output/implementation-artifacts/evidence/story-4-13-independent-audit.py _bmad-output/implementation-artifacts/evidence/story-4-13-synthetic-evidence.tar.gz --output /tmp/story-4-13-audit.json`. Durable result: [independent audit](evidence/story-4-13-independent-audit-20261016.json). Scenario5 captured conflict/Restore domain content also matches, except the explicitly reported identity/timestamp of empty productContext. Raw snapshot equality is false; this is not a fresh Restore observation. Source inspection confirms absent ProductContext rows return a fresh UUID/timestamp on each read without persistence; this comparison does not prove survival of any persisted ProductContext row. Explicit limitations in that result govern its scope; it is not new browser execution. Supplemental commit586a2b9 remains preserved on a side branch, not merged or relied on as a current-source commit.

Current Node24 HTTP/SDK roundtrip verification passed14/14 tests at revision6171c8298ae15eb21540ddcbc508e071df9ed5f9. Tests supplement the historical browser evidence. No product defect requiring code changes was established. [Orchestrator reconciliation](evidence/epic-4-5-orchestrator-reconciliation-20261016.json) records exact external-delivery adoption, backups, locks and invariant checks; old sessions/escalations and accepted optimization follow-ups are preserved. No reset, re-drive, push or Epic6 dispatch is authorized.

<intent-contract>

## Intent

**Problem:** Epics 5–7 require functional workflow acceptance beyond API/component evidence.

**Approach:** Run five browser-controlled publish/review/adjust scenarios on disposable Projects with recorded inputs, measure retained applied domain operations and first-publish-to-reviewed-board time, and record an evidence-based gate recommendation. The historical title does not require real-user recruitment.

## Boundaries & Constraints

**Always:** Use actual loopback app/browser controls and Node 24, isolate storage from user Projects, reuse the 4.12 recipe/recordings, and verify prerequisites independently of sprint labels. Record actual inputs, actions, timestamps, screenshots, selection, approval, applied operations and Activity. Count retained applied domain operations, excluding lifecycle/audit metadata; zero applied operations gives undefined retention. Compare raw retention against 90 percent and elapsed time against 300 seconds without rounding. Report setup and intentional restore separately. Stop on functional or retention failure or unavailable browser controls and distinguish blocked/unexecuted work from passes. Preserve raw timing failures; the maintainer explicitly accepts timing exceptions for this completion and defers optimization.

**Never:** Application code changes, browser substitution by API/component tests, fabricated data/measurements, recruited users, live user Projects, Epic 5 drift features, automatic product-scope changes. Never write, stage or revert sprint-status.yaml or deferred-work.md. No push. The user explicitly authorizes a local completion commit and supported BMAD-loop continuation after independent review; these supersede historical no-commit/no-later-wave restrictions.

</intent-contract>

## Code Map

- `docs/bmad-round-trip.md` — delivered version 2 recipe; generic scoped publication, source ownership, conflict refusal and refresh instructions. Read-only.
- `apps/server/src/fixtures/bmad-round-trip/{harness,composer}.ts` — `roundTripFixture`, `publication`, `read`, `reviewedApply`, `recordedFiles`, `recordedPublications`. Existing synthetic initial/refresh/renumber/evidence inputs. API reviewedApply is supplementary evidence, never browser acceptance.
- `apps/server/src/mcp/tools/bmad-round-trip.test.ts` — HTTP/SDK assertions for 6 Activities, 6 Steps, 34 Stories, 3 Releases and 49 refs/source links. Source inspection supplies context, not newly executed verification.
- `apps/web/src/features/changesets/{ChangeSetReview.tsx,useChangeSetReview.ts}` — selection, review freshness/fingerprint, approval/apply controls; selection changes clear approval.
- `apps/web/src/app/routes/story-map-shell.tsx` — board preview overlay and review integration.
- `apps/web/src/features/safety/SafetySwitchStrip.tsx` — human protection/Agent approval controls.
- `apps/web/src/features/restore-points/RestorePointsPanel.tsx` — explicit restore confirmation and persisted outcome; `apps/web/src/app/api.ts` supplies human endpoints.
- `_bmad-output/planning-artifacts/validation-gate.md` — sole gate report, including actual preflight blockage. No application implementation targets.

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/implementation-artifacts/story-plan-4-13-validation-gate-with-five-bmad-users.md` — load binding plan/preparation and previous-story context; inspect reusable source anchors and noninteractive runtime/browser availability.
- [x] `apps/server/src/fixtures/bmad-round-trip/` — reuse recorded inputs in five isolated Projects after prerequisite/runtime availability is verified; record storage identity and setup separately.
- [x] `apps/web/src/features/changesets/ChangeSetReview.tsx` — exercise initial publish, protected approval/apply, dependent deselection, unchanged/edited refresh, and human-edit conflict plus intentional restore through actual controls, in order. These are execution surfaces, not edit targets.
- [x] `_bmad-output/planning-artifacts/validation-gate.md` — record genuine preflight evidence and historical blocked/unexecuted states without erasing them; retain subsequent execution metrics and the current recommendation.
- [x] `_bmad-output/planning-artifacts/validation-gate.md` — after successful execution, compute raw kept/applied counts and elapsed times, preserve failures and record continue/reduce/change-direction recommendation; scope changes require maintainer reconciliation.

**Acceptance Criteria:**
- Given delivered prerequisites and available browser controls, when validation runs, then five disposable-Project scenarios exercise actual publish/review/adjust controls with recorded inputs and no user-data changes.
- Given protected publication, when approval policy is exercised, then default-off approval, enabled Agent self-approval, protected Agent apply refusal and successful human UI apply are evidenced.
- Given all five scenarios, when outcomes are recorded, then source adjustments use the recipe and timestamps/screenshots/selection/applied operations/Activity substantiate every outcome.
- Given observed sessions, when metrics are computed, then raw retained/applied domain counts and first-publish-to-reviewed-board elapsed times determine threshold outcomes, with setup and intentional restore separately reported and zero-denominator retention undefined. Timing failures remain failures of the unchanged 300-second target, accepted explicitly by the maintainer for completion.
- Given unavailable browser controls, when the gate is written, then it records blocked/unexecuted scenarios without pass claims and stops dependent execution.
- Given findings, when recommendations are recorded, then they follow actual evidence, make no external-demand or scope-change claim. The maintainer separately authorizes supported loop continuation after completion review.

## Spec Change Log

- Version 4 (2026-10-13): Maintainer explicitly accepts timing exceedance and defers optimization, requests functional completion, commit and loop continuation. Preserve all raw SM-9 failures as accepted exceptions, not threshold passes. Execute the remaining human-edit conflict/intentional-restore scenario before completion.

- Version 3 (2026-10-13): User explicitly authorized isolated protection policy tests; original interrupted evidence and a fresh authorized rerun are preserved. Scenario 4 raw timing failed at 365.351 seconds and dependent Scenario 5 was then unexecuted. At that version, the gate remained blocked without changing thresholds, application code or later-wave scope.

- Version 2 (2026-10-12): User approved interactive completion using the existing five-scenario plan. The four prior working files were explicitly authorized and committed as `01cfed1593dc6a3b32762d3d1259af211185a5e2`. New completion changes stay uncommitted; no push or orchestration resume. Actual browser inventory is available again, pending control verification. Historical blocked evidence below is retained as history, not current acceptance.

## Historical execution instructions (2026-10-13)

Current user authorization supersedes historical timing stop and no-commit/no-later-wave clauses for this completion. Timing is diagnostic under explicit maintainer acceptance; functional checks and honest retention/evidence remain mandatory. Complete Scenario5 on the existing isolated Project, update the gate/spec, independently review, clean owned resources, commit locally and continue the BMAD loop using supported orchestration commands. No application/API/schema changes or push; no manual sprint/deferred ledger edits.

Resume the existing acceptance plan, without application code/API/schema changes. Use Node24/pnpm9.15.4 and real loopback browser controls. Reuse existing fixture recordings, create five isolated disposable Projects, and keep source/data/schema unchanged. If browser control fails or functional/retention acceptance fails, record genuine evidence and stop dependent scenarios; never substitute API tests. Record accepted timing exceptions without converting them into target passes. Stage only task-owned report/spec/handoff paths for review; never touch sprint/deferred ledgers. Clean up only owned test processes/tabs, retaining evidence. The historical no-commit restriction first had the checkpoint exception above; the current maintainer instruction explicitly accepts timing exceedance, defers optimization and authorizes local completion commit/loop continuation after functional completion and independent review.

## Review Triage Log

Independent completion review used three context-free lenses against the checkpoint diff. Edge cases returned no findings; verification returned no gaps. The blind review findings were individually triaged below. Five documentation/evidence patches were applied by the implementation agent and independently checked. Two spec-only review requests were rejected under the build workflow's spec-edit restriction; ordinary completion bookkeeping below is separate from those requests.

| ID | Finding | Severity / verdict | Route | Evidence and resolution |
| --- | --- | --- | --- | --- |
| B1 | Temporary-only evidence could disappear | Medium / real | Patch | Durable synthetic-only archive and SHA-256 sidecar retained; all member and observation hashes independently checked; no SQLite, env or user data. |
| B2 | Missing exact reproduction commands/source provenance | Medium / real | Patch | Gate version 5 records actual server, fixture, prerequisite and quick-check commands, with unchanged application baseline and documentation checkpoint distinguished. |
| B3 | Two spec baseline fields appear inconsistent | Low / real | Reject | Requested fix edits the build spec, which review triage excludes. Gate now explicitly distinguishes application baseline e6747d5 from documentation checkpoint 01cfed1; neither claims an application change. |
| B4 | Earlier spec execution instructions still read as pending | Low / real | Reject | Requested fix edits the build spec, excluded by review triage. Completed task checkboxes and terminal result govern execution; the earlier plan remains historical procedure. |
| B5 | Scenario 5 retention and elapsed-time boundaries differ | Medium / real | Patch | Table explicitly timestamps pre-Restore retention; post-Restore composition and full 326.319-second elapsed time are separately reported. |
| B6 | Timing/commit authorization lacked direct provenance | Medium / real | Patch | Gate quotes both exact user messages, dates and Story 4.13-only timing scope; raw threshold failures remain failures. |
| B7 | Current handoff prose omitted spaces | Low / real | Patch | New current-quest prose corrected; historical handoffs preserved. |

### 2026-10-13 — Fresh-attempt review

Four context-free review lenses completed against the full canonical application baseline. Three launched together; the fourth initially exceeded the three-child limit and launched after a slot became available, before triage. Edge-case and verification-gap lenses reported no findings. Blind findings and the intent auditor's seven divergence observations are individually recorded below. No earlier attempt's review verdict or verification result was imported.

- verdicts: 17 findings — high 1, medium 2, low 3, false 11, maybe-false 0
- findings:
  - `[low]` `[reject]` B1: Review-time status differs from historical done narrative — review state is required by step 04; spec-only edits are excluded as review repairs. Current HALT bookkeeping separately records blocked and labels the earlier result historical.
  - `[low]` `[reject]` B2: Two spec baseline fields need adjacent explanation — carried from B3, unchanged fields; gate already distinguishes the application and documentation baselines. A spec-only repair is excluded.
  - `[medium]` `[patch]` B3: Initial identity retention helper does not compare all fields — the helper genuinely checks IDs only. Full captured state is available, but the comprehensive field audit was stopped at the fresh-browser blocker. No new effect-retention pass is claimed; repair remains unexecuted.
  - `[medium]` `[patch]` B4: Refresh helper verifies upserts by existence — exact helper confirms this limitation. Preserved supplemental audit is unverified and was not imported. Field verification remains unexecuted; fresh browser acceptance is required before completion.
  - `[false]` `[reject]` B5: Slice temporal comparison is unspecified — committed Epic 5 preparation delegates runnable-spec refinement; this invocation names Story 4.13 and no Epic 5 implementation or repair. No current-attempt Slice change exists.
  - `[false]` `[reject]` B6: One high-water marker can hide other groups — an Epic 5.4 planning concern, outside the explicitly named Story 4.13; no marker is implemented or changed by this attempt.
  - `[false]` `[reject]` B7: First-open seen baseline undefined — concerns separately dispatched 5.4; no current-attempt behavior or acceptance claim exists for it.
  - `[false]` `[reject]` B8: Project acknowledgment across maps unspecified — concerns separately dispatched 5.4; committed preparation is not implemented behavior in this attempt.
  - `[false]` `[reject]` B9: Drift drawer entry point omitted — concerns separately dispatched 5.5; no 5.5 change or completion claim is authorized here.
  - `[false]` `[reject]` B10: Partial-publication drift baseline undefined — concerns separately dispatched 5.5; no current-attempt drift baseline implementation exists.
  - `[high]` `[patch]` I1: Historical audit cannot satisfy fresh acceptance — confirmed. Current gate now explicitly blocks dependent continuation; all five fresh browser scenarios remain unexecuted. Fresh execution itself is blocked by unavailable controls, not represented as repaired or passed.
  - `[false]` `[reject]` I2: Timing waiver conflicts with current intent — the spec preserves earlier explicit maintainer acceptance and raw threshold failures; authorization persists. It permits exceptions to timing only and supplies no fresh functional evidence. This attempt is blocked regardless.
  - `[low]` `[patch]` I3: Handoff/completion surfaces disagree — current gate, spec and handoff now uniformly report blocked; earlier completion prose is labeled historical. No new done claim or continuation.
  - `[false]` `[reject]` I4: Story 3.9/Epic 5 changes exceed scope — they are preexisting committed changes included by the full-baseline review diff. Current attempt does not modify or execute them.
  - `[false]` `[reject]` I5: Different metric boundaries fail freshness — historical boundaries are disclosed; this attempt uses none as a fresh measurement and claims no fresh retention or timing pass.
  - `[false]` `[reject]` I6: Ledger ownership divergence — review diff and current commands show no ledger write, stage or revert; no sprint row supplied verification.
  - `[false]` `[reject]` I7: Five simulations versus users ambiguous — binding intent explicitly states five simulations and excludes recruitment; historical title is not a recruitment requirement.

## Historical browser verification (completed before blocked redispatch)

- All five fresh scenarios completed actual browser functional acceptance: initial publication, protected approval/apply policy, dependent deselection, unchanged/edited refresh, human-edit conflict refusal and confirmed intentional restore. Existing 14 HTTP/SDK prerequisite tests and quick source gates passed as supplementary evidence.
- Scenario 1 retained 134/134 effects in 53.414 seconds; fresh Scenario 2 retained 134/134 in 100.602 seconds; Scenario 3 retained 115/115 in 93.332 seconds; Scenario 4 retained 145/153 in 365.351 seconds; Scenario 5 retained 134/135 before intentional Restore and completed in 326.319 seconds. Fresh-five aggregate is 662/671. Scenario 5's alternative ChangeSet-only retention is 133/134; its one human save is explicitly included in the primary domain denominator. No-op, lifecycle/audit and deselected/unapplied operations are excluded.
- Raw SM-9 fails for Scenario 4, Scenario 5 and original interrupted Scenario 2 (67816.015 seconds including authorization wait). The 300-second target is unchanged; the maintainer explicitly accepts these exceptions and defers optimization. Scenario 5's 208.416-second pre-Restore checkpoint is separately reported and never substitutes for the full elapsed time.
- Scenario 5's stored approved refresh showed base version 1/current version 2 after the human Card save; browser approval/apply were disabled and fresh Submit returned 409 without partial domain writes. Confirmed Restore intentionally undid the human edit, restored all 134 initial effects and exactly restored the manual-point domain snapshot. Historical metadata records 82 undone Activity events and one undone ChangeSet; these are not domain-operation counts.
- Version 5 of the gate report preserves exact commands, authorization and metric boundaries. The committed sanitized synthetic evidence archive preserves recordings, identities/effects, Activity, raw timestamps, 19 actual screenshots and manifests. Original temporary evidence and the isolated DB remain local; no database is committed. All owned browser/server resources are cleaned up.
- No application source, API/schema, user data or sprint/deferred ledger changed. The user's local commit/loop continuation request is authorized after independent completion review; no push or automatic scope change is authorized. Historical blocks below remain history. Three independent completion lenses and final evidence/document/source-scope/whitespace checks passed.

## Changelog

- Version7 (2026-10-16): Independently reverified captured fields/refresh effects and current14-test roundtrip; adopted verified external delivery under explicit operator authorization. Preserved blocked redispatch, timing failures and all review history.

- Version 6 (2026-10-13): Fresh attempt inspected preserved work, completed four review lenses and fresh prerequisite/hash/hygiene gates, then blocked on unavailable actual browser controls. No preserved patch applied or fresh browser pass claimed.

- Version 5 (2026-10-13): Completed independent review, individually triaged seven findings, verified durable synthetic evidence and finalized done under the explicit timing exception. Local commit and supported orchestration continuation authorized.

- Version 4 (2026-10-13): Completed actual human-edit conflict/intentional restore, retained raw timing failures under the explicit maintainer exception and recorded all-five functional/retention acceptance. Completion handed off in review; commit and supported loop continuation are user-authorized after review.

- Version 3 (2026-10-13): Four scenarios functionally observed with raw retained/applied counts; Scenario 4 SM-9 failed and Scenario 5 was stopped. No overall gate acceptance, completion commit or orchestration continuation.

- Version2 (2026-10-12): Authorized checkpoint committed; actual browser Scenario1 passed. Execution remains in-progress pending explicit isolated Agent-test authorization in Scenario2; no application or ledger changes.

- Version 1 (2026-10-12): Captured binding execution plan and source map; browser preflight blocks implementation and all measured scenarios.

## Historical Auto Run Result

Status at original unavailable-browser run: blocked
Blocking condition: actual browser controls unavailable.

At preflight on 2026-10-12, `cua.getState()` returned `browsers: []` while listing Safari as running. `cua.getApp('com.apple.Safari')` failed with `Computer Use server error -10005: cgWindowNotFound`. `cua.createBrowserTab('iab', 'about:blank', {visible:true})` returned `Browser is not available: iab`. No usable browser target was obtained. UTC evidence recorded by 2026-10-12 19:36:57. No interactive authentication was initiated.

The required unavailable-browser branch is recorded in [the gate report](../planning-artifacts/validation-gate.md). At that historical preflight, all five scenario executions were unexecuted; SM-8/SM-9 were unmeasured. Source investigation completed through a read-only subagent; no new runtime prerequisite-completion claim is made. No disposable runtime/Project was created, no domain operations applied, and no application code, user data, orchestrator ledger, commit or push was changed. The workflow halted during planning under its HALT protocol; implementation and completion review had not been reached at that time.

## Historical Completion Result

Status: in-review

All five fresh actual-browser scenarios passed functional and retention acceptance. The version 5 gate recommends continuation under the maintainer's explicit timing exception: Scenario 4 (365.351 seconds), Scenario 5 (326.319 seconds) and original interrupted Scenario 2 (67816.015 seconds) remain raw failures of the unchanged 300-second target. The original interruption and the separate fresh protection rerun are both preserved. Human-edit conflict refusal applied no partial writes; explicit Restore recovered the manual-point domain state with intentional undo reported separately. Three independent completion lenses, five documentation/evidence patches and final consistency checks completed. This story is done under the explicit timing exception; supported orchestration owns sprint bookkeeping and subsequent dispatch. No application source, user data, orchestrator ledger or push changed during acceptance execution.

## Historical redispatch result (2026-10-13)

Status: blocked
Blocking condition: actual browser controls unavailable; Mac locked and IAB unavailable.

Current attempt started at `8425e140ea52961fa9e61a52d267b1ad8b126a55`. The preserved log and complete diff were inspected; its evidence audit, completion prose, commit and ledger change were not applied. Fresh actual-browser execution is required by this invocation. Preflight on 2026-10-13 at 17:42–17:44 UTC returned apps/browsers empty with `The Mac is locked and automatic unlock could not unlock it`; `cua.createBrowserTab('iab', 'about:blank', {visible:true})` returned `Browser is not available: iab`. No disposable runtime/Project was created. All five current-attempt browser scenarios are unexecuted; retention and timing are unmeasured. Historical captures do not satisfy this attempt's gate.

Fresh supplementary checks passed: Node 24 focused HTTP/SDK prerequisite suite 14/14 (113.73 seconds), quick Git/source/119-capability verification, archive SHA-256 and 231 bundle/70 observation/19 screenshot hashes. Logs: `/tmp/story-4-13-fresh-prerequisites.log`, `/tmp/story-4-13-fresh-hygiene.log`; review diff: `/tmp/story-4-13-fresh-review.diff`. Application/fixture/recipe diff against canonical `e6747d56ff1e55316c76470bdaa15ef4a33659eb` is empty. No comprehensive historical field audit completed; supplemental preserved audit remains unverified.

Files changed: this spec records current terminal status and all 17 review observations; validation-gate.md records blocked current acceptance and preserves historical evidence; OpenWolf handoff/learning record the fresh-gate blocker. Two report/handoff corrections applied (one high, one low); two medium evidence repairs remain unexecuted due to the required browser blocker; thirteen review observations rejected individually above. No deferred work item or follow-up completion recommendation; this is a blocked attempt, not converged acceptance.

No application/API/schema or live user-data changes, no sprint/deferred ledger write/stage/revert, no commit/push and no loop continuation. Resume requires usable actual browser controls, then all five scenarios and every required gate fresh. The skill HALT protocol has no additional On Complete action.

## Auto Run Result

Status: done

Operator reconciliation adopts the verified historical delivery after current source/tests and captured field/effect audit. The unavailable-browser redispatch remains blocked as historical execution; no fresh five-scenario run is claimed. Epic4/5 bookkeeping is repaired only under the explicit current user instruction.
