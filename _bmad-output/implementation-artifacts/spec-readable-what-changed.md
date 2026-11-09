---
title: 'Readable Map changes with direct Card opening'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
baseline_commit: 'a891a79f78ae11b0e5e132323652c8ca85fb577e'
review_loop_iteration: 0
context: []
---

# Readable What changed

Date: 2026-10-31. Version: 1.
Reproducing statement: Implement the approved What changed plan: useful scoped Card summaries, direct Card dialog navigation, successful-open acknowledgement and sparse target-specific unread tracking.

<frozen-after-approval reason="User approved conversational plan with Implement the plan">

## Intent

Replace raw actor/session-first event lists with readable, newest-first groups for affected Cards. Default scope is the active Map; offer entire Project and separate non-Card Project changes. Count unread affected Cards of active Map, not raw audit events. Each row shows Card key/title, concise field/action summary, latest actor and local readable time; Project scope includes Map name. Aggregate multiple changes to one Card while keeping expandable details. Filter raw reads/successful tool calls/internal bookkeeping; do not count duplicate ChangeSet wrappers and underlying committed changes twice. Preserve distinct substantive changes and original audit records.

Card key/title opens the existing Card details dialog directly; close drawer and switch Map if needed. Mark only that Card's captured displayed changes read after dialog successfully mounts. New events arriving during navigation remain unread. Multi-Card event acknowledgement is per target so visiting one Card never acknowledges another. Provide explicit per-group and all-displayed-group read actions. Deleted/inaccessible Cards remain readable as history, no failed navigation or automatic ack. Show first25groups with More and key/title search. Do not add permanent text to board.

## Boundaries & Constraints

Reuse shared contracts, repositories, pure core summaries, existing Card dialog/route selection and central GUI design primitives. No raw full before/after snapshots over feed; historical names/values come from committed evidence, current lookup only for navigation availability/map metadata. No fabricated historical names. Use existing readable audit labels where applicable. Technical IDs/session/action names only collapsed. Preserve prior read receipts, own-client exclusion, epochs/Restore boundaries, error handling and live invalidation. No data migration, user-data mutation, external side effects, new dependencies, commit or push.

## I/O & Edge-Case Matrix

| State/action | Required outcome |
| --- | --- |
| Many events for same Card | One newest-first Card group; count distinct unread Cards; expandable meaningful details |
| Current Map vs Project | Correct targets/filter/count; Map name disambiguates identical titles; Project-only changes separate |
| Open existing Card | Close drawer, navigate correct Map/Card, confirm captured target seqs only after actual dialog mount |
| Failed/stale/blocked navigation | No ack; feedback and retry or return path; no silent loss |
| New event during open | Captured earlier seqs acknowledged; later event stays unread |
| Multi-Card event | Acknowledging one target leaves other target unread |
| Deleted/archived/inaccessible target | State labelled, historical summary retained, no invalid link or auto ack |
| Storage failure/Restore | Error visible; previous receipts retained; epoch reset correct |

</frozen-after-approval>

## Code Map

- packages/contracts/src/schemas/audit.ts defines ActivityChange/Card evidence/SeenState. Extend using shared summary schema fields and target navigation metadata. Extend read state with optional/default-empty per-target acknowledgements preserving existing stored throughSeq/acknowledgedSeqs. No separate schema copies.
- packages/db/src/repositories/audit-repository.ts:listActivityChanges currently strips snapshots, returns cards and Restore point; pages raw ascending fixed highWater. Preserve cursor/epoch/exclusion. Build minimal safe summaries with core summarizeActivity and existing activity-card-evidence.ts. Enrich current targets with Card key, Map id/name and availability through DB repos, including deleted lookup where supported; historical snapshots remain historical. Keep domain reads repository-only.
- packages/core/src/audit/summaries.ts/subjects.ts already build safe historical subjects/field changes; reuse rather than duplicate parsing. Applied operations carry after.changes[].entity/entityId/before/after. Dedup only when canonical committed evidence identifies duplicate projection, never heuristics based on similar title/time.
- apps/web/src/features/what-changed/{api,model,WhatChangedProvider,WhatChangedDrawer}.tsx/ts own full feed drain, sparse receipts, Card marker and drawer. Current provider gets only projectId; supply active Map scope from story-map-shell.tsx. Live invalidation already invalidates activity-changes per project. Preserve marker semantics and keyboard behavior, render only shown groups.
- apps/web/src/features/activity/ActivityEntry.tsx and ui-strings/activity-history.ts provide readable action/field/value/date formatting. Extract shared presenter helpers only as needed; keep technical details collapsed and unknown IDs out of primary copy.
- apps/web/src/app/routes/story-map-shell.tsx mounts CardDetailModal with selectedCardId and current snapshot; use its actual successful mount/selection confirmation for pending captured read intent. Detail draft/dirty-close and preview must not be bypassed. Use enabled default Map view when cross-Map switching, retain current view when valid.
- Existing tests: packages/db/src/activity-changes.test.ts; core audit summary tests; web features/what-changed/{api,model,WhatChangedProvider}.test.*; Card modal/navigation/accessibility and live invalidation tests. Existing1000raw-event DOM retention assertions must change to bounded rendered groups, while preserving source feed completeness.

## Tasks & Acceptance

- [x] Safe enriched feed/target evidence and schemas with historical/current identity distinction, no snapshots leaked.
- [x] Grouped readable filtered model and target-specific sparse seen state, backwards preservation of existing receipts and Restore semantics.
- [x] Default active-Map badge/drawer, Project scope, search25+More, Project-only section, central design layout, meaningful summary/details.
- [x] Direct Card dialog open and real successful-mount captured acknowledgement; deleted/failed/pending paths and focus handled.
- [x] Focused contract/core/db/web tests covering matrix, build/typecheck/hygiene and actual desktop/narrow UI inspection.

Acceptance criteria:
- Given140raw events, when drawer opens, then relevant Cards are readable/identifiable without technical audit knowledge.
- Given Card selection, when correct details mount, then only captured shown Card changes become read, never other Cards or later changes.
- Given a changed Card in another Map, when opened from Project mode, then the correct Map/dialog opens and unread siblings remain.
- Given same-title Cards and mixed technical/read/domain events, when displayed, then keys/Map distinguish real changes and count excludes noise.

## Implementation Notes

Clean main at a891a79f78ae11b0e5e132323652c8ca85fb577e includes newer Tree column feature; preserve it. User chose active-Map default, automatic successful-open read, and existing detail dialog navigation. No remaining intent gaps. Root handles review/live smoke/final handoff. No repeated approval needed.

## Review Triage Log

- Blind Card/child projection: medium, patch. Version-bumped Card snapshots suppressed dependency/assignment evidence; retain distinct child actions with field changes and test actual mixed operations.
- Blind Project targets: medium, patch. Mixed Release deletion/Card unassignment lost Project target; preserve separate historical domain target and sparse receipt.
- Blind noise cursor: medium, patch. Filtered-only feeds could not advance without an enabled explicit ack action; automatically compact observed noise and retain substantive target receipts.
- Edge Card/child projection: medium, patch. Same root cause, verified and corrected as above.
- Edge no-op operations: medium, patch. Operation action alone included internal/no-op changes; classify projected meaningful evidence, including genuine Project snapshot comparison.
- Edge failed navigation focus: medium, patch. Hidden drawer removed focused Card action; provide visible focused recovery control and test failure.
- Verification Restore: medium, patch. Wrapper-only DB test and removed drawer test did not exercise retained operation link; assert actual association/retention and exact audit row navigation.
- Verification preview: medium, patch. Direct click during preview was untested; verify route/drawer/receipts retained with restriction message.
- Root lifecycle summaries: medium, patch. Created Card default fields looked like seven edits; use created/deleted action copy and aggregate only actual update fields, with singular/plural copy.
- Root Graph fixture: low, patch. Old feed fixture omitted Map ownership after Map scoping; add actual new evidence shape and rerun17Graph tests.

## Verification

Focused web/model/API/interaction tests; focused DB/core/contracts tests; web/server typecheck/build as affected. Native loopback/subprocess tests may require escalation. Known unrelated changesets/review.test.tsx size violation remains; no timeout relaxations. Use isolated /tmp database for live inspection, no user-data changes.

## Changelog

- 2026-10-31 v1: Record approved plan.


## Final evidence

Initial150focused web tests passed; review29focused tests plus final17provider tests passed,13DB feed tests,7core privacy/summary tests and1HTTP feed test passed. Broader a11y initially315passed/1failed due stale Graph fixture; after fixture correction all17Graph tests pass (all316a11y cases covered successfully across runs). Full server dependency build (includes web/contracts/core/db/server) and final DB/web build/typecheck pass. Native hygiene and whitespace pass; only pre-existing changesets/review.test.tsx:66 size violation remains.

Native isolated browser:21events become1Card group; currentMap badge3; successful direct detail open reduces3to2; Project mode disambiguates identical names with Map names and correctly opens secondMap detail. New event after reading reappears, receipts persist across restart. Final rows say Card created / Description, Status changed;390px drawer width390/client374/scroll374, no horizontal overflow. Screenshot /tmp/storymapper-readable-changes.png. No private data mutation, commit or push.
