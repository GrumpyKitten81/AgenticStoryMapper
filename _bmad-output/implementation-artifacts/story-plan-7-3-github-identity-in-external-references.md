---
epic: 7
story: 3
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.3: GitHub identity in external references

Reproducing statement: Prepare the GitHub identity cutover against current external refs, sync links, typed source evidence, copying, exports and Restore without retaining duplicate legacy bookkeeping. Version: 1. Date: 2026-10-18.

## Intent

Give each linked Card/Release one canonical Issue/Milestone identity and preserve usable navigation and provenance throughout the application's existing lifecycle.

## Cross-story constraints

- Follow [Epic preparation](epic-7-preparation.md), especially constraints 3–6; [ADR 0008](../../docs/adr/0008-epic-7-github-connection-and-sync-policy.md) records accepted D1–D6.
- 7.4 consumes canonical identity, stable Card marker/footer and explicit provider failures; 7.5 consumes the new operation shapes; 7.6 consumes deletion history.
- AD-9 pre-release schema policy applies. No legacy database migration, compatibility facade or automatic conversion of stored commands is introduced.

## Design decisions (this story)

- Adapter-created `external_refs` with reserved system `github` are authoritative. Canonical normalized HTTPS Issue/Milestone locators include repository and number; numbers alone are not identities. Enforce existing one-binding-per-entity and scoped remote uniqueness.
- Sync state is keyed by `external_ref_id`, with connection association/baselines. Remove duplicated entity/URL/remote identity columns; derive public projections from canonical refs. Do not use a connection id as the remote identity.
- Re-key typed GitHub Source Links to canonical references. Preserve source-only attachments, Release-owned evidence, copies and multiple Cards citing an Issue independently of active sync ownership. Reject foreign-Project evidence, duplicate ownership and unsafe/non-GitHub URLs.
- Before hard delete removes a canonical ref, persist typed `externalRef.deleted` Activity evidence with reason `entity-deleted`, Project/Map/entity identity and canonical before snapshot in the same transaction. Supply a scoped repository read for non-undone deletion events without a current equivalent live binding. Source detach, ref rebind, park and archive do not create deleted-entity evidence. Reuse the existing Activity store, without a tombstone table or live-identity resolver; archive redaction removes GitHub payloads. 7.6 consumes this exact contract.
- Footer generation uses one delimited machine-owned section, names the Story Map and Card Key, carries the stable entity marker and includes a clickable local deep link using the current served loopback origin plus Project/Map/Card ids. Changing name/prefix never changes the marker. Existing prose is preserved and footer contents are excluded from merge hashes/local descriptions.
- `getRemoteItem` must distinguish missing/inaccessible from provider failure. Remove catch-all-to-undefined and swallowed Milestone errors. A masked 404 cannot prove deletion; display stale/unavailable information with identity intact rather than dropping the Card.

## Task sequence

1. `packages/contracts/src/schemas/domain.ts`, `change-operations.ts`, `operation-fields.ts`, `operation-resolution.ts`, `api/http.ts`: replace legacy identity/source-link shapes, define joined public views and adapter-owned operations, increment the operation schema version for breaking changes.
2. `packages/db/src/schema/tables.ts`, `connection.ts`, `schema/classification.ts`: cut over current-schema bootstrap and indexes, re-key evidence/sync rows, supply deletion-history representation, remove `github_links` and test referential integrity.
3. `packages/db/src/repositories/external-refs-repository.ts`, `work-item-repository.ts`, `source-evidence-repository.ts`, Card/Release/copy repositories: add guarded adapter-only ref mutation and joined reads; preserve explicit affected-root version/history/audit semantics and provenance-only copies.
4. `packages/core/src/changesets` registry/resolvers/dependencies/snapshots plus DB operation snapshot/persistence: remove legacy `githubLink` execution, update GitHub board-import operations and ownership/safety collection. Generic Agent external-ref setters still refuse `github`.
5. `packages/github/src/providers/github-provider.ts`, provider interface and `packages/core/src/publishing/export-formatters.ts`: typed provider read failures, canonical footer/marker/parser and normalized locators. Do not make provider calls during pure read/export/health operations.
6. Update application github-link/report/export use cases, HTTP/MCP contracts/manifest and all web projections (tile/Tree/detail/filter/Tracking/Release risks) to canonical joined reads. Existing public tool names may remain with changed schemas; no duplicate storage or compatibility execution.
7. `packages/db/src/snapshot.ts`, `archive-database.ts`, `restore-history.ts`, restore validation and schema tests: row-level GitHub-ref redaction, dependent evidence/Activity/ChangeSet/copied snapshots, retained non-GitHub refs and truthful post-Restore remote-link notices.
8. At the cutover update `.cursor/rules/card-authoring.mdc` to require adapter-owned canonical `github` external refs instead of the removed table; preserve its footer/status/provenance rules. Port and extend provenance/external-ref/operation parity/archive/Restore and web link tests. Assert `github_links`/`ensureLegacyGitHubLink` are absent from current executable code; historical evidence documents are not executable references.

## Preliminary code map

- `packages/db/src/repositories/external-refs-repository.ts`: generic reservation and scoped uniqueness.
- `packages/db/src/repositories/source-evidence-repository.ts`, `card-provenance.test.ts`: direct and attached evidence, cross-map copy/delete version semantics.
- `packages/db/src/repositories/work-item-repository.ts`; `apps/server/src/services/work-item-sync.ts`: duplicate identity creation and `ensureLegacyGitHubLink`.
- `packages/core/src/changesets/link-resolution.ts`, `github-sync-resolution.ts`, `board-import-resolution.ts`, `operation-dependencies.ts`, `operation-conflicts.ts`: executor and reference ownership.
- `packages/db/src/operation-schema-transition.ts`: existing pending-command invalidation; retain historical payloads without executing the old shape.
- `packages/db/src/snapshot.ts`, `archive-database.ts`, `restore-history.ts`: redaction/current-schema Restore consumers.
- `apps/web/src/features/story-map/components/CardTile.tsx`, `TreeGrid.tsx`, `CardDetailModal.tsx`, board filter/Tracking/Release summaries: visible identity consumers.

## Acceptance outline

- **Given** the same Issue through two connections **When** it is linked/imported **Then** one scoped binding exists and it cannot silently move to another Card.
- **Given** canonical direct/attached/copied evidence **When** identity is edited, owner removed or Project reopened **Then** surviving provenance, affected versions/history and links remain consistent.
- **Given** a pushed Issue **When** its footer is read **Then** Map name, Card Key, stable marker and clickable local Card route identify the originating Card without changing authored prose or embedding local Workflow Status.
- **Given** an inaccessible/missing Issue or network/auth failure **When** sync/health is read **Then** the Card and link remain readable with truthful stale/error state; a transport error is never recorded as confirmed deletion.
- **Given** current-schema archive/Restore **When** exported/imported/restored **Then** redacted archives contain no GitHub sync data and preserve non-GitHub refs; operational Restore retains canonical data and reports remote effects it cannot undo.

## Out of scope

Old prototype database migration, Issue transfers across repositories, GitHub Enterprise host configuration, multiple active GitHub identities per Card, remote deletion, active sync ownership on copies and legacy API/storage fallbacks.

## Risks and mitigations

- This is a broad dependency cut, not a two-table rename: enumerate every current symbol consumer in step 02 and verify operation catalog/capability parity.
- Archive classification is table-based today while `external_refs` mixes systems: require row-level redaction and import rejection of unredacted GitHub refs, without discarding Agent source-plan bindings.
- Evidence deletion may affect roots in removed Maps: reuse explicit cross-root version/audit semantics, never FK cascades that bypass them.

## Open questions

None. Deletion history uses the typed Activity contract above. Step 02 refines exact operation/projection schemas within the shared constraints.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Canonical identity, provenance, operation and lifecycle cutover plan |
