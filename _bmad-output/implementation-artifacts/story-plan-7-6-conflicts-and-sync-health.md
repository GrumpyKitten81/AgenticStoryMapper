---
epic: 7
story: 6
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.6: Conflicts and Sync Health

Reproducing statement: Prepare durable field conflict resolution and consistent Sync Health using the existing conflict wire contract, canonical refs and shared sync baselines; cover duplicate conflicts and read-only overwrite gaps. Version: 1. Date: 2026-10-18.

## Intent

Show both sides of a disagreement, preserve it until an explicit decision succeeds, and make health counts explain the same durable state users see on Cards.

## Cross-story constraints

- Follow [Epic preparation](epic-7-preparation.md), accepted D3/D6, canonical identity/deletion evidence from [7.3](story-plan-7-3-github-identity-in-external-references.md) and merge baselines from [7.5](story-plan-7-5-import-and-sync.md).
- Any local-wins outgoing effect uses [7.4](story-plan-7-4-push-with-a-mandatory-dry-run.md). Selecting local in a diff is not remote-write confirmation.
- Share the existing version/sync ConflictReport wire shape; the word `ConflictReport` in the story does not require a parallel schema or UI error family.

## Design decisions (this story)

- Canonical conflict key is external ref plus field. Repeated pulls reuse one unresolved conflict and preserve its reviewed local/remote values; drift requires explicit re-review rather than quietly rewriting a decision's evidence. Convergence is visible but does not automatically resolve an existing row.
- Reuse/extend `conflictResponseSchema`, `conflictEntrySchema`, `reason:sync`, `syncConflictId` for HTTP/MCP/ChangeSet errors. Version and sync conflicts can coexist on the same Card without hiding either.
- Only the disputed field is blocked. Server enforcement covers human HTTP updates, generic operations/upsert, inline editing and imported operations; UI `aria-disabled` alone is insufficient. Unrelated editable fields remain usable.
- Remote-wins prepares the chosen field then applies a `github` ChangeSet. Local-wins prepares a one-field remote plan preserving independent remote edits; resolve the row only after successful confirmed effect/baseline persistence. Cancel, stale input, protected/disabled/read-only refusal and remote/persistence failure keep the conflict unresolved.
- Read-only has ordinary conflicts under D3. Local-wins cannot write until made writable; UI names that requirement without silently dropping the conflict or replacing the field.
- Health is a pure core projection over current canonical links, matching baseline representation, durable conflicts and typed `externalRef.deleted` Activity evidence from 7.3 (reason `entity-deleted`, not undone by Restore, no equivalent current live binding). An open conflict outranks synced/unsynced status; stale/error and deleted-remote are distinct evidence. `local_deleted` history retains Map/Card identity and Issue link even when the Card cannot be opened; exclude parked/archived items from ordinary visible counts without pretending they were deleted.
- No provider call on health read. Display last observation/error truthfully; a permission-masked 404 is not a proven deletion. Count/list identities consistently and refresh own mutations as well as external events.

## Task sequence

1. `packages/contracts/src/schemas/conflicts.ts`, `domain.ts`, `api/http.ts`, `schemas/sync-results.ts`: durable conflict/health projection fields using the shared envelope and 7.3 deletion representation.
2. `packages/db/src/repositories/work-item-repository.ts`, Sync schema/bootstrap: enforce one unresolved ref/field, explicit durable resolution and scoped reads; preserve conflict evidence and audit/root version invariants.
3. `packages/core/src/changesets/operation-conflicts.ts`, GitHub sync resolution, `packages/core/src/reports/sync-health.ts`: field-specific blocking and health precedence from the shared 7.5 normalization; no duplicate live identity resolver.
4. `apps/server/src/services/sync-conflict-resolution.ts`, `application/sync/sync-conflict.use-cases.ts`, `github-conflict-command.ts`: shared actor-safe remote/local resolution, captured inputs revalidation, incoming executor and outgoing 7.4 plan; eliminate direct provider-write resolution bypasses.
5. `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`, `features/conflicts`, `CardDetailModal.tsx`, inline editors: accessible value diffs, field-level lock reason, local/remote choice, explicit re-review and focus/alert state; reuse current change/conflict primitives.
6. Verify repeat pulls, independent conflicts, convergence, version+sync errors, partial failure, flag/connection/epoch drift, read-only choice, deleted-local history, no-op health normalization and mounted edit–Restore–edit with pending resolution.

## Preliminary code map

- `packages/contracts/src/schemas/conflicts.ts`: existing shared conflict entries/envelope.
- `packages/core/src/changesets/operation-conflicts.ts`: touched-field detection and persisted sync lock checks.
- `apps/server/src/services/sync-conflict-resolution.ts`: current revalidation, field payload and baseline finalization.
- `apps/server/src/application/sync/github-conflict-command.ts`, `sync-conflict.use-cases.ts`: actor-dependent resolution paths to unify.
- `packages/core/src/reports/sync-health.ts`, `sync-health.test.ts`: pure counts and canonical-body comparison.
- `apps/web/src/features/conflicts/ConflictAlert.tsx`, `ChangeAlert.tsx`; GitHub panel's current direct conflict buttons.
- `apps/server/src/services/sync-review.test.ts`, `application/sync/github-command-regressions.test.ts`: conflict evidence, other-field preservation and explicit obsolete read-only expectations.
- Deferred ledger observations DW-48, DW-65/66 and historical DW-37 inform scope; do not modify their tracking state during preparation.

## Acceptance outline

- **Given** title divergence **When** Sync repeats **Then** one persisted conflict retains both reviewed values and blocks only title until an explicit decision succeeds.
- **Given** a version conflict plus a sync conflict **When** an update is rejected **Then** the shared conflict response reports both and the UI preserves the draft with separate recovery.
- **Given** local-wins **When** its Dry Run is cancelled or fails **Then** no conflict is resolved; successful human confirmation changes only the chosen field and preserves unrelated remote data.
- **Given** read-only **When** local-wins is chosen **Then** the UI names the write restriction and performs no remote write; remote-wins still uses a local ChangeSet.
- **Given** unsynced/conflict/stale/deleted-remote/deleted-local evidence **When** health opens **Then** counts and listed identities agree, including a retained link for deleted local entities, without network traffic.
- **Given** a pending resolution followed by Restore **When** the old response arrives **Then** it cannot clear a restored conflict, overwrite a draft or authorize a queued stale action.

## Out of scope

Automatic conflict closure, whole-Card lock, remote-write bypass, automatic undelete/recreation, network polling on health read and unrelated conflict UI rewrites.

## Risks and mitigations

- Existing duplicate conflicts can deadlock resolution. Pre-release fixtures use the new uniqueness; historical active prototypes are not migrated. Repeated current-schema pulls must never recreate duplicates.
- Card deletion removes live refs, so health reads 7.3's typed scoped deletion Activity evidence without truncating it to the ordinary paginated Activity UI limit; exclude undone events and currently rebound identities.
- Native diff focus and screen-reader behavior need actual acceptance; passing DOM tests alone is not WCAG certification.

## Open questions

None. Accepted D3 removes the previous read-only conflict-policy ambiguity.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Field conflict lifecycle and truthful health plan |
