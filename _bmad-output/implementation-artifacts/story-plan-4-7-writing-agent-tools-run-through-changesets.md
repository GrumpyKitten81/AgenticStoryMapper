---
epic: 4
story: 7
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.7: Writing agent tools run through ChangeSets

Reproducing statement: Prepare Story 4.7 to route every current non-human domain write through the shared executor, replace protected domain refusals with proposals, and verify actual transport/audit behavior.

## Intent

Close the staged direct Agent-write gap for all current domain families and the local GitHub import/pull half. Fulfills FR-30/FR-32/FR-59 and AD-4/AD-6.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md) and consume [4.6's executor](story-plan-4-6-changeset-executor.md) and 4.4/4.5 catalog without another apply path.
- Supply universal command/proposal behavior for 4.8 submission, 4.10 slicing and 4.11 delivery. Registry parity does not replace runtime routing acceptance.

## Design decisions (this story)

Current tools already call shared application use cases, but those use cases still write transaction-bound repositories directly. Both the transport authorizer and permission computation currently refuse protected write/GitHub calls. Protected local domain commands must instead reach the proposal path while Agent/GitHub-disabled calls still fail and remote push remains protected.

Build typed ChangeSets in application use cases, with `apply=true` default. Preserve current human command behavior through the same core rules. Proposal generators always propose; lifecycle actions invoke their existing executor/approval use cases without recursive ChangeSet creation. Read capabilities with bookkeeping effects must be explicitly classified, not overlooked by a write-only handler scan.

GitHub import/pull prepares provider data outside SQLite and represents its local changes with source/actor `github`. Preserve the actual initiating Agent host/session separately so changing effective actor cannot bypass access/protection. UoW forbids changing actor inside a nested transaction: end preparation and use an explicitly attributed executor transaction rather than nesting actor substitution. Recheck permissions, owner versions and runtime identity after provider awaits. Push requires human-confirmed Dry Run and keeps truthful per-item remote evidence.

## Task sequence

1. Current application descriptors/manifest and registry catalog: enumerate domain writers and explicit lifecycle/admin/remote/bookkeeping exceptions; map every domain capability to typed operation construction.
2. `apps/server/src/application/` Card, map, Release, Persona, customization, Roadmap, source, link and copy/import use cases: route non-human domain writes into the shared executor; return shared proposed/applied responses and preview references.
3. `packages/contracts/src/mcp/tool-inputs.ts`, API commands/responses, `apps/server/src/mcp/tools/register-*.ts`: add applicable command `apply` inputs/defaults, keep handlers thin and update all response consumers together.
4. `apps/server/src/mcp/tools/register-tools.ts` and actual Project permission checks: permit protected proposal creation for domain writers while preserving disabled access, conditional approval, protected ApplyChangeSet and protected remote push.
5. `apps/server/src/application/sync/`, `apps/server/src/services/work-item-sync.ts` and related sync/conflict modules: convert local GitHub effects to ChangeSets, retain initiator identity, integrate the shared `ConflictReport` and post-await policy/runtime checks.
6. Capability generation/parity scripts and `docs/mcp-tools.md`: regenerate metadata, account for explicit exceptions and require no unexplained current-domain gaps or handler repository writes.
7. Extend real HTTP MCP and stateful `/mcp`/stdio tests, source/alias scope regressions, audit failure/restore tests and provider-await fixtures. Verify durable SQLite outcomes, not only handler structure; run affected contracts/core/db/server tests and typecheck.

## Preliminary code map

`apps/server/src/mcp/tools/register-tools.ts` `authorizeTool`/`permissionsForProject`; `register-card-tools.ts`, `register-content-tools.ts`, `register-customization-tools.ts`, `register-structure-tools.ts`; `application/sync/sync.use-cases.ts`; `services/work-item-sync`; `packages/contracts/src/schemas/conflicts.ts`; `application/capability-manifest.test.ts`; `mcp/http.test.ts`, `mcp/stdio-main.test.ts`, `mcp/tools/{register-tools,complete-surface,tool-call-audit}.test.ts`. Current protection tests intentionally expect refusals and must change only for newly proposal-routed domain commands.

## Acceptance outline

- **Given** every current non-human domain writer, **when** called, **then** it creates a ChangeSet and uses the executor; handler inspection plus real transport evidence proves no direct repository domain write bypass.
- **Given** `apply=false` or protection on, **when** a domain command runs, **then** one proposed ChangeSet/preview reference returns with no domain apply/snapshot; omitted apply defaults true when permitted.
- **Given** GitHub import/pull, **when** local effects apply, **then** github attribution, actual Agent initiator, restore point and version increments are recorded; protected Agent initiation stores a proposal only.
- **Given** disabled Agent/GitHub access or protected remote push, **when** called, **then** typed refusal persists and no unauthorized provider/domain effect occurs; push cannot bypass confirmed Dry Run.
- **Given** version/sync conflicts, **when** returned, **then** one ConflictReport shape reports them without partial local application.
- **Given** real `/mcp` and `/api/mcp/call`, including provider-await flag flips, **when** acceptance runs, **then** persisted proposals/applies, host/session, rollback and current-policy enforcement match on both surfaces.
- **Given** parity and lifecycle/proposal calls, **when** checked, **then** the Story 3.7 domain gap list is empty, exceptions are named and generators/ApplyChangeSet never recursively propose themselves.

## Out of scope

Whole-cut submission UI, new domain features, GitHub identity migration, remote rollback, new provider/auth flow or permission policy.

## Risks and mitigations

Removing only the top-level protection check can leave permission/repository refusals inconsistent: exercise both actual transports and the entire policy path. Actor substitution must retain initiating authority. Read/export bookkeeping and indirect copy/import writes need explicit classification and evidence.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial universal routing and transport acceptance plan.
- Version 2 (2026-10-10): Corrected the current work-item sync service path during consistency verification.
