---
epic: 4
story: 6
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.6: ChangeSet executor

Reproducing statement: Prepare Story 4.6's atomic local executor, restore/conflict/selection behavior and accepted optional Agent approval policy, preserving explicit filesystem/remote boundaries.

## Intent

Apply selected ChangeSet operations safely through one executor with a restore point, optimistic checks and durable actor/audit evidence. Fulfills FR-31/FR-57, NFR-4 and AD-4/6/7/8.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md); consumes [4.5](story-plan-4-5-operation-registry-for-the-remaining-objects.md), 4.3 identities and Epic 3 restore/version/audit/live behavior.
- Accepted ADRs 0002/0003/0004 bind concurrency, file/remote effects and approval. 4.7 switches all command routing; 4.8/4.9 consume this executor/preview contract.

## Design decisions (this story)

Application owns write-gated orchestration; core resolves; transaction-bound repositories persist. Store proposal and apply as distinct audited actions. New command auto-apply may proceed without approval only in the command creation flow with protection off; applying a previously stored proposal requires recorded approval. Never use a caller boolean to bypass approval on an arbitrary stored id.

Selection uses stable operation ids and transitive closure. Bind approved operations/selection immutably; changes require fresh approval. Collect transaction-start conflicts for all selected existing roots/operations before writes; external upserts use their addressed baseline. New roots have none. Empty selection does not create a snapshot; invalid ids and applied/restore-undone replay fail. Take one pre-apply snapshot outside SQLite while holding the gate; it also satisfies first-session apply. Revalidate state/policy inside UoW.

Commit domain rows, versions/history, per-operation Activity, final applied event and successful mutation audit atomically. Preserve exactly one tool-call audit per admitted call. Move existing synchronous audit-wrapper transaction boundaries as needed so snapshot/file preparation can precede the applying transaction. Failed domain/audit insertion rolls back; rejection/conflict metadata may be recorded separately. Emit live events after commit only.

Default-off human-controlled `allowAgentApproval` permits admitted Agent self/other approval when enabled, even under protection. Approval records actual actors and never applies domain work or takes a snapshot. Agent apply still requires current access and protection off; human apply remains available. A later flag disable retains earlier approval. Reject/settings/restore remain human-only; preserve legitimate re-approval of rejected proposals.

## Task sequence

1. Shared contracts and ChangeSet persistence: add immutable proposal/approval actor identity, selected ids, schema-aware lifecycle and unified operation-indexed conflict responses; distinguish command auto-apply from stored-id apply.
2. `apps/server/src/application/changeset/changeset.use-cases.ts`, `packages/db/src/database-handle.ts`, restore-point services and UoW: implement gated preparation/snapshot/transaction phases and complete baseline/selection/policy checks.
3. `packages/db/src/repositories/changesets-repository.ts` and owning repositories: replace whitelist semantics with resolved-change persistence; advance only addressed external baselines and preserve monotonic keys/no-op behavior.
4. Card/root persistence and human move/drag use cases: reuse core hierarchy/position resolution, then delete duplicated `assertParentAllowed`/repository position semantics. Keep Card history coalescing separate from concurrency counters.
5. Safety contracts/storage/settings UI/use cases, MCP approval registration and capability metadata: implement `allowAgentApproval=false`, human-only audited toggle and conditional guarded Agent approval. Adapt parity assumptions that currently equate human-only approval with no tool.
6. MCP audit orchestration, HTTP routes, file preparation/attachment paths and archive/restore readers: integrate atomic success audit, truthful retained-file effects and historical/schema refusal. No remote call occurs inside the array transaction.
7. Run actual temporary-SQLite failure/conflict/restore tests, HTTP and both Agent transport policy/identity tests, and serial 1,000-Card/200-operation full-cost budget. Verify db/core/contracts/server tests, web typecheck and release checks as appropriate.

## Preliminary code map

Existing executor/use cases and `packages/db/src/unit-of-work.ts`; `packages/db/src/restore-points.ts`, `snapshot.ts`, `database-handle.ts`; root/history tests; `apps/server/src/mcp/tools/audit-tool-call.ts`; `apps/server/src/mcp/tools/register-tools.ts`; safety use cases in `apps/server/src/application/customization/customization.use-cases.ts` and persistence in `packages/db/src/repositories/projects-repository.ts`; `apps/web/src/features/safety/SafetySwitchStrip.tsx`. The current wrapper opens UoW before synchronous handler execution: inspect this integration before attempting an outside-transaction snapshot.

## Acceptance outline

- **Given** new unprotected command apply, **when** executed, **then** one pre-apply restore point precedes ordered atomic operations, versions/history and one operation event each plus applied event; failure at operation k applies nothing and retains the snapshot.
- **Given** repeated-root operations/new local roots, **when** checked, **then** existing roots compare transaction-start versions once, every conflicting operation id/index is listed, new roots need no persisted baseline and no operation partially applies.
- **Given** selected/deselected ids, **when** applied, **then** dependents are skipped transitively; invalid ids/replay fail; empty selection changes no domain rows and takes no snapshot. Approval changes require fresh approval.
- **Given** external upserts, **when** applied, **then** only the addressed system baseline equals the resulting entity version; overlapping pending refs produce a warning naming the other proposal.
- **Given** all approval-flag/protection combinations, self/other proposals and real HTTP/MCP identities, **when** approving/applying or flipping flags under the gate, **then** the accepted matrix holds, actual actors persist, disabling approval preserves history and protection always blocks Agent apply.
- **Given** file preparation, SQLite or successful-audit failure, **when** applying, **then** no visible document/attachment links survive rollback, retained prepared effects are explicitly reported and remote effects remain outside local atomicity.
- **Given** human move/drag and ChangeSet hierarchy/position operations, **when** tested, **then** they share core rules and duplicated semantics are removed only after verified integration.
- **Given** the specified fixture, **when** 200 operations apply including snapshot/history/audit, **then** the recorded 2-second nominal/2x CI budget passes in a serial measurement; failures remain evidence.

## Out of scope

Universal routing (4.7), board rendering (4.9), remote rollback, inverse-operation undo, cleanup/retry services, new policy decisions.

## Risks and mitigations

Nested UoW/snapshot orchestration and async preparation can violate SQLite boundaries: prove transaction ordering and forced audit rollback. Executor/repository layering can duplicate history/events; assert exact effects and durable reopen. Never mutate approved input to attach resolved ids; persist execution result metadata separately.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial executor/approval and atomicity plan.
- Version 2 (2026-10-10): Corrected the current safety use-case location during consistency verification.
