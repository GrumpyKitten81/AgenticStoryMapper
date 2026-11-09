---
epic: 7
story: 4
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.4: Push with a mandatory Dry Run

Reproducing statement: Replace boolean-only confirmation with an immutable reviewed remote plan, explicit Issue/Milestone effects and crash-safe intent/reconciliation while preserving selected-set and Agent protection semantics. Version: 1. Date: 2026-10-18.

## Intent

Show exactly what will be written, obtain human consent for those exact effects, and resume interrupted pushes without duplicate Issues or hidden Milestone writes.

## Cross-story constraints

- Follow [Epic preparation](epic-7-preparation.md), accepted D5/D6 and [7.3](story-plan-7-3-github-identity-in-external-references.md).
- [ADR 0003](../../docs/adr/0003-changeset-file-and-remote-effect-boundary.md) separates remote effects from SQLite ChangeSets. Agent approval permission never authorizes a remote effect.
- 7.5 and 7.6 must reuse this plan/confirm/resume executor for every outgoing sync/conflict effect. No quick action may call the provider directly.

## Design decisions (this story)

- Persist one immutable plan with id, actor, scope, epoch, version/content/connection/mapping fingerprints, explicit Issue/Milestone items and dependencies. A human confirmation references the plan id; the server never accepts a changed selection or silently recomputed payload under old consent.
- Refresh remote state/type/capability inputs at confirmation; refuse changed reviewed values. Invalidate on local changes, safety flips, connection/mapping drift and Restore. Consume once; double clicks/concurrent confirmation cannot execute an item twice.
- Persist item intent before each modifying call. An item records exact payload, marker, attempt/outcome and actual remote id/URL; uncertain remote outcomes remain visible and block blind recreation. Persist successful effect before proceeding. Resume explicitly reconciles by the stable 7.3 marker and retains exact payload. Partial/search/auth failure is not a negative marker match.
- Expose Milestone create/update as distinct reviewed effects (name, goal/description, due date and released/open state); shared Milestones are planned once. Provider Issue creation may no longer hide `ensureMilestone` writes. Release push includes an explicit Milestone even when no Story belongs to that Release; Notes are excluded, and no implicit unrelated Card scope is added.
- Accepted D5: connection-level Activity/Step/Story → repository-native issue-type mapping, preserving imported type in sync metadata. Verify available types and permissions before readiness; remove title-prefix guessing. Missing/unsupported mapping produces an actionable blocked plan, never an Issue with a silently omitted type. Both CLI and token adapters apply it.
- Accepted D6: manage status/export/structure labels and opted-in Annotation labels while preserving unrelated remote labels. Show label additions/removals explicitly. A configured label missing from the repository blocks readiness with an action to create it there; this story adds no implicit label-management feature or hidden write. Local Workflow Status is never serialized into the Issue body.
- Protection refuses Agent push before credentials/provider mutation. Unprotected Agents can prepare/read proposals; only human UI confirmation sends. Human push remains allowed under Agent protection when GitHub is enabled and connection writable.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `schemas/sync-results.ts`: exact plan/item/intent/outcome/read/confirm/resume schemas, explicit selection, Release items and issue-type mapping. Define strict state transitions, including retained remote success after local failure.
2. `packages/db/src/schema/tables.ts`, `connection.ts`, Sync classification and `repositories/work-item-repository.ts`: plan/intents/outcomes persistence and guarded single consumption under the existing write gate. Keep secrets out and classify all tables/redaction.
3. `packages/core/src/publishing` and existing pure plan helpers: exact payload/type/label/footer construction, Notes exclusion, Release dependencies and complete item counts. Keep pure computation separate from application/provider awaits.
4. `packages/github/src/providers/work-item-provider.ts`, `github-provider.ts`: normalized type discovery, explicit Milestone operations, marker reconciliation and remote input reads; apply native issue types for both auth transports and propagate typed failures.
5. `apps/server/src/services/work-item-sync.ts`, `application/sync`, HTTP routes and manifest: shared plan confirmation/execution/resume. Replace selection-plus-boolean execution and direct quick routes; retain separate Agent proposal policy without treating its stored ChangeSet as remote authorization.
6. `apps/web/src/features/github-sync/GitHubSyncPanel.tsx`, `CardDetailModal.tsx`, `BoardToolbar.tsx`, API and strings: render exact plan including exclusions/dependencies/types/labels; confirm by plan id; per-item results/Retry, stale-plan re-review and epoch-safe pending holds/focus.
7. Fault-inject twelve Issue effects, interrupted sixth outcome, unknown create result, local persistence/audit failure, Milestone failure, confirmation races and Restore/reopen. Assert provider-call payload equals the confirmed plan and no duplicate marker is created.

## Preliminary code map

- `apps/server/src/services/work-item-sync.ts`: `pushWorkItems`, `pushItem`, `persistPushResult`, `finishPush`; currently regenerates a plan and has no pre-call durable intent.
- `apps/server/src/application/sync/github-command.ts`: `proposeRemotePush`; current Agent proposal is not a human-confirmed persisted execution plan.
- `packages/db/src/repositories/work-item-repository.ts`: `createWorkItemPushPlan`, currently returns only Issue-oriented items.
- `packages/core/src/publishing/export-formatters.ts`: current title-prefix type guess and footer generator.
- `packages/github/src/providers/github-provider.ts`: hidden `ensureMilestone`, CLI/token type disparity and swallowed errors.
- `apps/web/src/features/github-sync/github-selection.test.tsx`, `github-visibility.test.tsx`: preserve selection/Notes/pending scope behavior.
- `apps/server/src/mcp/github-command-sdk.test.ts`, `services/work-item-sync.test.ts`: current boolean-only human confirmation fixtures must change to actual plan identity.

## Acceptance outline

- **Given** a selected set/Release **When** Dry Run opens **Then** every Issue and Milestone effect, type, labels, exclusions and dependency is visible; explicit empty selection never means whole Map.
- **Given** a reviewed plan **When** a human confirms its id **Then** only its exact validated effects execute once; changed local/remote inputs or a stale epoch require re-review.
- **Given** twelve Issues and an interruption after six **When** resumed after reopening **Then** each attempted item has a pre-call intent and reconciliation prevents duplicate Issue creation, including provider-success/local-persist-failure.
- **Given** a remote success followed by failure **When** results appear **Then** each item exposes success/error/not-attempted status and actual links; no remote rollback is claimed.
- **Given** any Agent push **When** protected **Then** it is `protected`; otherwise it remains a proposal until separate human UI confirmation. `allowAgentApproval` cannot bypass that boundary.

## Out of scope

Background retries, automatic conflict decisions, remote rollback, new provider shipping, local Card-field mutation during push, legacy confirmation bypasses and type inference from title prefixes.

## Risks and mitigations

- Remote effects are not transactionally atomic with SQLite or external editors. Stop on uncertain outcomes and preserve evidence; do not promise an impossible cross-system rollback or retry blind creates.
- GitHub type availability differs by repository; test actual supported CLI/API behavior using official docs and fake-provider failures, then explicitly authorize any live smoke.
- Local Restore rewinds bookkeeping, not GitHub: stable entity markers and remote reconciliation must still protect a re-push after Restore.

## Open questions

None. D5/D6 accepted 2026-10-18; concrete method/table names are refined in step 02 within the shared contract.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Bound human confirmation, explicit remote effects and recovery plan |
