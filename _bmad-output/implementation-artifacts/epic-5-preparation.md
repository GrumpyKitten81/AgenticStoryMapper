---
epic: 5
status: ready
date: 2026-10-16
version: 4
---

# Epic 5 Preparation: See and judge the cut

Reproducing statement: Prepare Epic 5 only after reconciling its current requirements and the maintainer-confirmed Plan-state comparison; update all five developer plans from current source without implementation, loop start or orchestrator-ledger edits.

## Goal

Expose Card dependencies, Release Slices, a dependency graph, changes since last seen and source-plan drift. Historical Story 4.13 acceptance and timing exceptions remain evidence; the current orchestrator follow-up is paused on unavailable browser controls. On 2026-10-13 the maintainer explicitly instructed: “Comitte und starte epic 5”. This authorizes a separate Epic-5-only run after the reconciled plans are committed, despite the paused 4.13 follow-up. It does not mark 4.13 passed, change its evidence or restart its run; future Epic 5 gates remain mandatory. The timing exception does not relax Epic 5 performance requirements. Ready means developer planning inputs are complete, not implementation or runtime acceptance.

## Story sequence

| Order | Story and detail plan | Depends on | Deliverable |
| --- | --- | --- | --- |
| 1 | [5.1 Dependencies](story-plan-5-1-dependencies-between-cards.md) | Epic 4 registry/executor; existing UoW | Same-map acyclic Card edges and auditable edits |
| 2 | [5.2 Slices](story-plan-5-2-slices-view.md) | 5.1 | Release lanes, violations, recorded Plan states and progress |
| 3 | [5.3 Graph](story-plan-5-3-dependency-graph-view.md) | 5.1, shared 5.2 calculations | Filtered graph with accessible table twin |
| 4 | [5.4 What changed](story-plan-5-4-what-changed-since-i-looked.md) | Epic 3 Activity/SSE/Restore; 5.1–5.3 views | Per-client last-seen markers and change drawer |
| 5 | [5.5 Drift](story-plan-5-5-plan-drift-report.md) | Epic 4 scoped references/publication; 5.2 Release movement | Read-only per-system drift with durable baselines |

Numbered execution is the unattended sequence. Each story's spec must read earlier completed specs and current source rather than assume every planned symbol exists.

## Shared design decisions

### Layers and mutation ownership

Contracts are the sole schema source; core computes dependency rules, Slice comparison/progress and drift without I/O. DB repositories own SQL and snapshots. Shared application descriptors serve HTTP/MCP, with actor attribution and human-only policy where applicable. Human edits run through existing UoW; Agent/GitHub writes first produce a ChangeSet. Extend typed registry describe/resolve, projection, executor, snapshot and preview coherently. Card dependencies are domain edges, distinct from ChangeSet operation-selection dependency closure.

AD-17 assigns card_dependencies to the dependent Card aggregate. Directed edges mean dependent -> prerequisite; allow Cards of any level within one Story Map. Unique ordered pairs make repeats idempotent. Reject self-edges, foreign-map edges and cycles using resolved identities, including external-reference aliases. Set/unset changes the owned edge and bumps the dependent Card once in the transaction that changes it; repeated no-op set/unset does not bump it. Multiple owned changes follow existing transaction-level root-version semantics. Deletion removes incident edges atomically and versions surviving owners whose outgoing edges change; FK cascade alone is insufficient. Archive preserves edges; map copy remaps internal edges only. Follow AD-3 version ownership and existing rollback/audit/restore invariants.

### Read shapes and views

Use stable Card/Release IDs and configured workflow groups; do not hardcode done statuses or label unscheduled Stories as a real Release. Dependency adjacency is shared by badge, Slices, Planning and Graph. Blockers and order violations are distinct pure results with named prerequisite keys. Use explicit words/glyphs as well as colors. UI route root is /projects/:projectId/story-maps/:storyMapId; actual strings live in apps/web/src/ui-strings. Preserve board-preview read-only semantics and current dirty-editor/hold-updates handling.

Plan-state comparison is now a binding product decision: two recorded states of the same Story Map, labelled Before and After, each containing its Release lanes. Capture explicitly from canonical committed state; store immutable, schema-versioned data with stable state ID, Project/map ownership and UTC capture time. Include stable Story IDs, Release IDs/names/order and the displayed Story fields needed for membership and summaries. The capture is auditable and uses repositories/UoW; Agent-initiated persistence follows the existing ChangeSet-first rule. Comparing or selecting states is read-only and never changes or restores the board. Persistence must survive reopening and integrate with existing archive/Restore classification; do not claim coalesced Card Versions can reconstruct it.

Pure comparison takes the complete active Story sets: After-only IDs are Added, Before-only IDs are Removed, shared IDs whose releaseId differs are Moved, including null (Unscheduled) transitions. A shared ID is not both Added and Removed. Release rename or within-lane position change alone is not Moved. Archived Stories are absent from the active cut; the recorded earlier state still contains their captured data. Inverting states inverts Added/Removed and the movement endpoints. Reject cross-map or unsupported state payloads visibly. Missing old states are not manufactured from current data. Story 5.2 specifies exact schema, capture/read capabilities and repository ownership in its runnable spec; an architecture-level persistence decision requires an ADR under the global policy before implementation.

### Live and history boundaries

AD-11 uses contentless SSE epoch:seq notifications and canonical read refetch, no polling. Sequence and last-seen state are scoped per Project and epoch. DB Activity already stores originClientId, but Activity's output schema currently omits it. Story 5.4 exposes safe origin/sequence metadata through contracts and a dedicated after-sequence read, preserving current audit pagination. Exclude the actual current browser client's writes, not all human edits; another tab remains visible. Mark all as seen advances only to the observed high-water sequence so concurrent arrivals are not lost. Per-group seen actions acknowledge only that group; persisted acknowledgements and global-cursor advancement must preserve unseen events in other groups. Restore resets epoch/seen state and honors undone historical events.

### Source-plan baselines

AD-10 scoped refs and syncedVersion exist; only addressed applied refs advance. CardVersions coalesces same-actor saves and deletion cleans references, so syncedVersion plus current refs cannot reliably reconstruct old fields or removed Cards. Story 5.5 must retain a per-system/map synchronized snapshot and deletion evidence, using an explicit versioned synchronized baseline rather than relying on coalesced history. Reuse the typed Plan-state field projection from 5.2, but keep manual comparison states and external synchronization baselines distinct: recording a manual state never advances syncedVersion. Baselines advance from the final committed publication only for addressed applied entities; partial/deselected operations and other systems remain unchanged. Keep baseline identity/values after physical deletion without retaining dangling ordinary external_refs. Compare the scoped active cut with that system baseline, including unreferenced local additions; distinguish archived from physically deleted removals. Freeze its exact persistence design in the runnable spec and record an architecture decision if ownership changes. Never silently fall back to missing/coalesced CardVersions or global baselines. Report calculations remain pure and source files are never written.

### Schema and integration

No tagged release requires preservation of disposable developer DBs (AD-9), but restore/import schema classification, atomicity and explicit versioned snapshot handling remain mandatory. Register capabilities centrally, prove HTTP/MCP parity, and preserve actor/version/conflict checks. Unknown systems return available referenced systems without fabricated data. No outbound network is introduced except the explicit Graph-library research in 5.3; no SaaS, telemetry or provider dependency.

## Interfaces between stories

5.1 supplies typed edge snapshots and adjacency to 5.2/5.3; the complete dependent-Card mutation contract applies to copy/delete/restore and later publication. 5.2 supplies pure blocker/order/progress/comparison calculations and accessible lane cues reusable in 5.3. It also supplies the immutable schema-versioned Story/Release state projection reused by 5.5; manual state capture is independent of synchronization-baseline advancement. 5.4 adds shared observed-change marker state to these board views without modifying domain versions for seen state. 5.5 extends publication baselines without changing the previously accepted approval/ownership model or swallowing human conflicts.

## Non-goals (epic)

No Epic 6 everyday-board features, source-plan file editing, cloud services, cycle acceptance, duplicated contract schemas, new raw DB access outside repositories, or global timing relaxation. Preparation does not write runnable specs, sprint-status.yaml or deferred-work.md.

## Verification strategy

Core golden tests cover DAG rules, aliases, violations/blockers, comparison/progress and drift. DB tests cover aggregate versions, deletion/copy, rollback, baseline durability and Restore. Server tests cover descriptors, manifest/parity, human versus Agent paths, approval/conflicts and complete ChangeSet preview/application. Web tests cover keyboard/table parity, configured statuses, same-client exclusion, epoch reset and seen races. Actual isolated browser acceptance verifies new flows; measured 1,000-Card views and 200-node post-layout interactions use unchanged PRD budgets. Run focused checks during development and configured loop gates before completion; no fabricated browser/timing claims.

## Open questions

None. The maintainer explicitly confirmed Plan states on 2026-10-13. Exact schema/table names and the Graph library are implementation choices for developer planning; requirements, comparison semantics, ownership constraints and acceptance are fixed here. The maintainer separately authorizes the scoped Epic 5 dispatch; the 4.13 escalation stays recorded.

## Changelog

- Version 3 (2026-10-13): Recorded explicit commit/start authorization for a separate Epic 5 run; preserved the paused 4.13 follow-up result and all future acceptance gates.

- Version 2 (2026-10-13): Reprepared after canonical story/PRD/UX reconciliation; bound immutable Before/After Plan states, shared snapshot projection, distinct scoped sync baselines and story-specific acceptance. Preparation is ready; runtime dispatch is held.

- Version 1 (2026-10-13): Prepared ordered Epic 5 contracts/plans after the accepted Story 4.13 gate; anchored missing dependency, Activity output and drift-baseline capabilities in source.

### Story5.5 reconciliation amendment — 2026-10-16

Version4: The maintainer explicitly accepted a separate human-reviewed and human-approved source-reconciliation ChangeSet step. It only acknowledges proposed source projections that match the reviewed current local state, rechecks current versions and baseline/binding evidence on apply, and advances addressed synchronization evidence without changing Card fields. Stale/divergent proposals fail atomically. Existing ordinary upsert refusal, other-system isolation and ChangeSet protections remain intact. This resolves the later-discovered SM-10 planning gap; see story-plan5.5v4 and docs/adr/0006-source-plan-reconciliation.md.
