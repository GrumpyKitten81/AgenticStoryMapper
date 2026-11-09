---
epic: 4
story: 13
status: ready
date: 2026-10-10
version: 1
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.13: Validation gate with five BMad users

Reproducing statement: Prepare the historically named Story 4.13 as five actual-browser simulations with measured retention/timing and recorded acceptance evidence, replacing real-user recruitment by the accepted decision.

## Intent

Establish functional workflow acceptance before proceeding to Epics 5–7. The historical title/key stays stable; simulations do not establish external demand. Fulfills PRD section 6.3, SM-8 and SM-9.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md); requires delivered Epics 1–3 and 4.1–4.12, particularly [4.12's recipe/fixture](story-plan-4-12-the-bmad-round-trip.md).
- This story changes no application code. Write `_bmad-output/planning-artifacts/validation-gate.md` only during actual execution with genuine evidence; preparation creates no gate verdict or screenshots.

## Design decisions (this story)

Use five disposable Projects and acceptance-defined Story 4.12 fixtures or recorded repository planning inputs. Run the actual loopback local app under Node 24; isolate storage from user Projects. Check browser control/runtime availability without initiating interactive auth. Actual local browser controls must exercise publish/review/adjust, with transport/SQLite evidence supplementing rather than replacing browser actions.

Record five scenarios: initial publish; protection/approval/apply; dependent deselection; unchanged/edited re-publish; human-edit conflict plus intentional restore. Protection scenario includes default-off approval setting, enabled Agent self-approval, refused Agent apply under protection and successful human apply through actual UI controls. Adjust fixture sources with the recipe; do not depend on an Epic 5 drift report.

Measure raw applied domain-operation retention, excluding proposal/approval/audit metadata. Count applied operations still kept at reviewed completion, not submitted or deselected operations. Zero applied operations gives no retention percentage. Start elapsed time immediately before first publish call and end at the reviewed browser board; record setup separately. Thresholds are 90 percent retained and at most 5 minutes, compared to raw values without rounding to pass. Report intentional restore separately from unintended rollback.

## Task sequence

1. Read delivered 4.12 recipe/test evidence and verify prerequisite completion in source/runtime, not sprint labels. Check actual browser tool access and noninteractive Node/runtime preflight; stop dependent execution if unavailable.
2. Prepare isolated disposable runtime/Projects and recorded fixtures; record setup inputs/versions/storage identity without tokens or user data.
3. Execute the five named scenarios through browser controls in order, capturing actual actions, timestamps, screenshots, proposal selection/approval, applied operations and rollback/restore Activity evidence.
4. Compute per-session and aggregate raw retention/time numbers from observed outcomes, explicitly identifying denominator/kept counts, zero-denominator sessions and deliberate recovery. Keep measured failures.
5. Write `validation-gate.md` with date/version/reproducing statement, evidence references, completed/failed/blocked/unexecuted scenario states and metric results. Stop the gate on failed acceptance; never count unexecuted work as passed.
6. Record an evidence-based continue/reduce/change-direction recommendation for Epics 5–7. Scope changes need explicit maintainer decision and PRD/epic reconciliation, using bmad-correct-course for cross-cutting changes. Do not dispatch later waves automatically.

## Preliminary code map

Delivered Tree/Planning review, approval settings, Activity and Restore points UI; generic submission/status surfaces; 4.12 fixture/recipe; operational `scripts/start.mjs`/`verify.mjs`; accepted ADRs 0003/0004. Planned result: `_bmad-output/planning-artifacts/validation-gate.md` with local evidence references. No source implementation target is introduced.

## Acceptance outline

- **Given** delivered prerequisites and browser control, **when** validation runs, **then** five scenarios use disposable Projects/recorded inputs and actual browser publish/review/adjust controls; no user data or recruited users are involved.
- **Given** protection/approval scenario, **when** policy is exercised, **then** default-off approval, enabled Agent self-approval, protected Agent apply refusal and human UI apply are evidenced.
- **Given** selection/re-publication/conflict/restore scenarios, **when** executed, **then** input/actions/timestamps/screenshots/applied operations/rollback Activity are recorded and source adjustment uses fixture/recipe without future drift features.
- **Given** five observed sessions, **when** SM-8/SM-9 are computed, **then** raw domain kept/applied counts and first-publish-to-reviewed-board elapsed times accompany threshold results; setup and intentional restore are separate and zero-denominator retention is undefined.
- **Given** failed acceptance/measurement or unavailable browser controls, **when** the report is written, **then** actual completed/failed/blocked states are separated, unexecuted work never passes and failed acceptance stops the gate.
- **Given** findings, **when** recommendations are recorded, **then** they are evidence-based and scope changes await the maintainer's explicit decision with planning updates; no claim of external demand is made.

## Out of scope

Application changes, browser substitutes based only on API/component tests, fabricated sessions/measurements, real-user recruitment, live user Projects, Epic 5 drift functionality, automatic scope changes or later-wave dispatch.

## Risks and mitigations

Browser/auth availability can block execution, not preparation readiness: record that limitation truthfully at execution. Intentional recovery must not distort retention/rollback interpretation. If a scenario fails, record later scenarios as unexecuted unless separately authorized work establishes actual evidence.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial five-browser-simulation and measured gate plan.
