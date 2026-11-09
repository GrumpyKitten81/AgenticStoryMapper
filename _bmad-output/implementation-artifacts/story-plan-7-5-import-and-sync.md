---
epic: 7
story: 5
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.5: Import and sync

Reproducing statement: Reconcile existing human/direct and Agent/ChangeSet GitHub paths into one incoming executor flow and the confirmed outgoing plan protocol, honoring accepted Unscheduled, read-only and mapped-label behavior. Version: 1. Date: 2026-10-18.

## Intent

Import Issues into a usable Unscheduled hierarchy and synchronize explicitly reviewed local/remote field changes without losing identity, attribution or user edits.

## Cross-story constraints

- Follow [Epic preparation](epic-7-preparation.md), accepted D2/D3/D6 and [ADR 0008](../../docs/adr/0008-epic-7-github-connection-and-sync-policy.md).
- Consume canonical refs/operations from [7.3](story-plan-7-3-github-identity-in-external-references.md) and every outbound effect through [7.4](story-plan-7-4-push-with-a-mandatory-dry-run.md).
- Preserve ADR 0004 approval/protection semantics and AD-8 restore points. Incoming proposals alone create no restore point; every actual apply follows the existing executor/snapshot policy.
- 7.6 owns final conflict lifecycle/UI; this story provides the shared merge fields, durable conflict operations and baselines it consumes. 7.7 reuses the incoming builder with a single explicit target.

## Design decisions (this story)

- Human-triggered import/pull is still externally sourced mutation: propose actor `github`, retain initiating actor/host/session, preview and apply through the existing executor. Remove the human-only direct Card/release/annotation repository branch rather than maintaining parallel semantics.
- Accepted D2: newly imported Stories have `releaseId:null`; initial import creates no Release from Milestone/iteration. Retain Activity/Step hierarchy, mapped statuses, remote identity/type and source evidence. Existing linked items return an explicit skipped/already-linked result and are not silently re-imported/unarchived.
- Keep separate last-observed remote and acknowledged local baseline values where initial Unscheduled placement differs from a remote Milestone. First explicit inbound Release sync can then propose the Milestone assignment rather than incorrectly treating null as an outgoing removal or declaring a false conflict. Release/milestone identity is durable; never resolve renames only by title.
- Shared three-way merge covers title, authored description, state/status mapping, managed labels/Annotations and Release assignment. Canonical footer stripping/hashes are identical to push/health; removal/null is explicit. Preserve the existing hierarchy parentOverrideLocal and assignee behavior unless directly required to maintain these fields; do not silently broaden assignee synchronization.
- Accepted D3: read-only blocks all provider writes, not conflict detection. Local-only edits remain unsynced; overlapping divergence creates a persisted conflict; non-conflicting incoming fields may still apply. Choosing local later cannot write until the connection becomes writable.
- Accepted D6: only mapped status/opted-in Annotation labels synchronize; unrelated remote labels survive, adapter-managed export/structure labels stay separate. The effective local Annotation name supplies the mapping, limited to unambiguous existing definitions; synchronize assignments and preserve reusable definitions. Unknown remote labels remain unrelated rather than auto-creating every label as an Annotation. A label update/removal is represented in both preview and baseline, not treated as incidental status metadata.
- Split Sync into prepared incoming operations and outgoing plan. Applying the local half does not authorize sending the remote half. Outbound sync must carry the exact human-confirmed 7.4 plan; Agent sync performs reads/proposals only.
- Return one result per source item, including unchanged/already-linked, conflict, succeeded, failed and not attempted as appropriate. Refine `SyncItemResult` once in contracts rather than manufacturing success for skipped items or omitting them.

## Task sequence

1. `packages/contracts/src/api/http.ts`, `schemas/domain.ts`, `schemas/sync-results.ts`, change-operation schemas: shared import/pull/preview/apply results, label fields and local/remote acknowledged baseline representation; preserve strict ownership/scope.
2. `apps/server/src/application/sync/github-command.ts`, `github-import-command.ts`, `github-pull-command.ts`: reuse preparation/revalidation/builders for humans and Agents with initiating-actor attribution; import new Cards Unscheduled and expose executable preview of dependencies.
3. `apps/server/src/services/work-item-sync.ts`, `sync-merge.ts`, DB import helpers: remove duplicate human direct mutation paths; implement one normalization/merge/baseline path and route outgoing effects through 7.4. Keep core calculations pure, data access in DB repositories.
4. `packages/core/src/changesets/github-sync-resolution.ts`, operation registry/conflicts/dependencies and DB snapshot/persistence: apply Card/Release/Annotation/ref/baseline/run/audit updates atomically; revalidate scope/versions and protection at apply.
5. `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`, Card modal and API/strings: render incoming ChangeSet preview/result separately from outgoing human-confirmed Dry Run; no quick Sync bypass, no hidden whole-map expansion.
6. Port existing HTTP/MCP import/pull/merge tests to the shared path; add protected human/Agent cases, stale/disabled after provider awaits, raw-body/no-op round trips, cross-connection same issue number, Unscheduled first Release sync and explicit label add/remove preservation.

## Preliminary code map

- `apps/server/src/services/work-item-sync.ts`: human `importWorkItems`, `syncWorkItems`, `pullStoryMapWorkItems` currently differ from non-human branches.
- `apps/server/src/application/sync/github-import-command.ts`: existing operation builder includes Release assignment and duplicate legacy GitHub links.
- `apps/server/src/application/sync/github-pull-command.ts`: `prepareIncomingItems`, `incomingOperations`, current read-only overwrite branch and incoming-only Agent behavior.
- `apps/server/src/services/sync-merge.ts`: `changedFieldsForRemote`, `mergedPayload`, `remoteBaseline`, `applyRemoteFields`.
- `packages/db/src/repositories/work-item-repository.ts`, `repository-values.ts`: import hierarchy/type/Release behavior and linked-item detection.
- `apps/server/src/services/work-item-sync.test.ts`, `sync-review.test.ts`, `application/sync/github-command-regressions.test.ts`: exact current behavior and fixtures deliberately changed by D2/D3.
- `packages/core/src/publishing/sync-fields.ts`, `reports/sync-health.ts`: normalization consumed across stories.

## Acceptance outline

- **Given** a connection/query containing hierarchical Issues with Milestones **When** imported **Then** new Cards retain hierarchy/source/type but are Unscheduled, and a `github` ChangeSet plus restore point/audit proves the local apply.
- **Given** an Unscheduled imported Card with unchanged remote Milestone **When** explicit Release sync is reviewed **Then** it proposes the inbound assignment rather than remote removal or a manufactured conflict.
- **Given** independent local/remote field edits **When** synced **Then** incoming non-conflicting fields apply through one executor and outgoing effects await human-confirmed Dry Run; overlapping divergence is preserved as a conflict.
- **Given** read-only and local divergence **When** refreshed **Then** local values survive, no provider write occurs and conflicts/unsynced state remain truthful.
- **Given** managed and unrelated labels **When** either side adds/removes mapped labels **Then** only the agreed managed subset changes and baselines remain healthy on a no-op repeat.
- **Given** provider failure, flag flip, ownership drift or Restore **When** preparation completes **Then** stale operations do not apply and item results distinguish failure/not attempted without false success.

## Out of scope

Automatic background sync, implicit remote confirmation, authoritative read-only replacement, ProjectV2 writes, new providers, arbitrary assignee/hierarchy synchronization and duplicate import ownership.

## Risks and mitigations

- Unscheduled local placement deliberately differs from remote milestone: one shared acknowledged baseline must encode that distinction before implementation.
- Current tests explicitly expect read-only overwrite and Release-at-import. Update those expectations with D2/D3 evidence; do not retain old branches to satisfy obsolete tests.
- Per-item provider reads precede atomic incoming application; incomplete preparation/failure must not produce an apparently complete applied run.

## Open questions

None. D2/D3/D6 accepted 2026-10-18. Step 02 fixes exact shared baseline/result schemas before subsequent story work.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Unified incoming ChangeSets and agreed import/merge/label policy |
