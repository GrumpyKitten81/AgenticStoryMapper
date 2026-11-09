---
title: 'External references on Cards, Releases and Personas'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '5b55d694e00f50ef72b67f6654c435d690682ab9'
baseline_commit: '5b55d694e00f50ef72b67f6654c435d690682ab9'
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-4-preparation.md']
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Cards, Releases and Personas carry no stable external identity, so a repeat Agent publication cannot address an existing object without creating duplicates (FR-52 storage, AD-10).

**Approach:** New `external_refs` table with the two AD-10 unique keys, owner-derived scope and a creation-time version baseline; set/read use cases through UoW + ActorContext on HTTP/MCP; refs in the story-map snapshot for `system:id` badges and board search; atomic ref deletion on entity delete, retention on archive.

## Boundaries & Constraints

**Always:**
- Table `external_refs(id, entity_type, entity_id, system, external_id, scope_id NOT NULL, synced_version, created_at)`; unique `(scope_id, entity_type, system, external_id)` and `(entity_type, entity_id, system)`.
- Scope is derived from the real owner: card/release → its `storyMapId`; persona → `storyMapId ?? projectId`. Caller-supplied scope is never accepted.
- `system` matches `[a-z0-9-]+`; reserved `github` is refused for every caller in this story (adapter path arrives in Epic 7). `external_id` is trimmed, case-sensitive, non-empty after trim.
- Identical repeated set changes nothing: existing row returned, no new row, no activity, `synced_version` not reset.
- Conflicting binding (same entity+system, different external id) and the same scoped key on another entity are refused before mutation.
- `synced_version` = entity version at reference creation; setting a ref does not bump the entity root version (same as source/GitHub links).
- Deleting a card/release/persona removes its refs in the same UoW; archiving keeps them.
- Contracts stay the single schema source; every consumer of a changed shape updates in the same change. Use cases require actual ActorContext and run inside UoW.

**Never:**
- No Epic 7 GitHub identity migration, no title-based matching, no cross-map Card moves.
- No automatic upsert/preview behavior (4.4–4.6), no new server search endpoint, no compatibility for pre-change restore points (AD-9: dev databases disposable).
- No FK on `entity_id` (polymorphic); no second client schema or permissive catch-all.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New ref set | valid system + id, entity exists | 201 `{ref, status:"created"}`; scope from owner; `synced_version` = entity version | No error expected |
| Identical repeat set | same entity/system/external id again | 200 `{ref, status:"unchanged"}`; no new row/activity/baseline reset | No error expected |
| Conflicting binding | same entity+system, different external id | refused | 409 conflict |
| Scoped key reuse | same scoped key on another entity | refused | 409 conflict |
| Reserved system | `system: "github"` via HTTP or MCP | refused before mutation | 400 validation |
| Invalid system/id | `Bad_System`, whitespace-only id | schema rejection | 400 validation |
| Unknown entity | nonexistent card/release/persona id | refused | 404 not_found |
| Project-level persona | `persona.storyMapId` null | `scope_id` = persona project id | No error expected |
| Entity deleted | delete card/release/persona with refs | refs gone in same transaction | No error expected |
| Card archived | archiveCard on referenced card | refs retained | No error expected |
| Display/search | snapshot carries `externalRefs` | badge names `system:id`; board search for `system:id` finds the card | No error expected |
| Redacted snapshot | project A snapshot while B's entities hold refs | no `external_refs` rows for excluded entities remain | No error expected |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts:73-133` -- cardSchema (73-95) / releaseSchema (97-108) / personaSchema (110-133); all three carry `version`; persona has `projectId` + nullable `storyMapId` (scope source); :696-714 storyMapSnapshotSchema -- arrays use `.default([])`, no externalRefs yet (add there)
- `packages/contracts/src/schemas/errors.ts:3-23` -- DomainError codes (validation 400, not_found 404, conflict 409; plus disabled/protected/restoring/internal)
- `packages/contracts/src/api/http.ts:173-184` -- request/response schema pattern (createCardSourceLinkRequest/Response; existing responses carry no status field, setExternalRef adds `status` per contract)
- `packages/contracts/src/mcp/tools.ts:9-97,99` -- mcpToolNameSchema enum (PascalCase members; :46 SetCardPersona) + McpToolName type -- add `SetExternalRef`; `mcp/tool-inputs.ts:40-51` -- MCP input derivation (request schema + `.extend({ entityId })`)
- `packages/db/src/schema/tables.ts:45-137` -- releases (45-55) / cards (84-113) / personas (115-137); Drizzle uniqueIndex examples :111, :239, :393
- `packages/db/src/schema/classification.ts:1-22` -- aggregateTables; assertClassifiedTables throws on unclassified tables
- `packages/db/src/connection.ts:35,40-481` -- migrate() (called :35): raw DDL region ~:40-458 with `CREATE UNIQUE INDEX IF NOT EXISTS` pattern at :416/:429; ensureColumn tail :460-481 -- add external_refs table + both unique indexes in the DDL region (AD-9 in-place, no entity_id FK)
- `packages/db/src/repositories/sources-repository.ts:118-152` -- createCardSourceLink pattern (existence check, no root bump, logActivity)
- `packages/db/src/repositories/cards-repository.ts:196-225` -- archiveCard (196-205, status only); deleteCard (207-225) child-table loop: card_annotations, card_attachments, card_personas, card_source_links, github_links, remote_work_item_links, sync_conflicts
- `packages/db/src/repositories/releases-repository.ts:85-105` -- deleteRelease link deletions (githubLinks, remoteWorkItemLinks)
- `packages/db/src/repositories/customizations-repository.ts:147-162` -- deletePersona (cardPersonas links + row); persona rows store `projectId` + nullable `storyMapId` (:91-92)
- `packages/db/src/repositories/root-versions.ts:10-24` -- createRootVersion/bumpRootVersion (ROOTS: cards, personas, releases, roadmaps, storyMaps)
- `packages/db/src/repositories/projects-repository.ts:213-238` -- getStoryMapSnapshot construction (assembles all entity arrays)
- `packages/db/src/snapshot.ts:67-84` -- redactProject (project_id rule :78; pruneForeignRows is FK-only, cannot reach polymorphic rows)
- `packages/db/src/restore-validation.ts:12-15` -- DDL-hash schema version `dev-sha256-${JSON.stringify(ddl)}` (updates automatically)
- `packages/db/src/repositories/storymapper-repository.ts` -- central binding file (import + `.bind(this as unknown as StoryMapperRepository<"transaction">)` with Mode guard, bindings from :35); logActivity(projectId, "entity.action", entityType, entityId, before?, after?) takes actor from this.context.actor
- `apps/server/src/application/card/card-children.use-cases.ts:70-79` -- descriptor + UoW use-case pattern (deps.unitOfWork.run(actor, ({ repository }) => ...), DomainError mapping)
- `apps/server/src/application/descriptors.ts:60-61` -- applicationCapabilityDescriptors registry (array of descriptor objects)
- `apps/server/src/http/routes/card-routes.ts:25` -- registerApplicationRoute pattern (http/routes/application-route; :25 createCardSourceLink is the template); release-routes.ts and persona-routes.ts exist for the sibling POST routes
- `apps/server/src/mcp/tools/register-card-tools.ts:19` -- registerTool pattern; siblings register-customization/structure/content-tools.ts, aggregator register-tools.ts
- `apps/web/src/features/story-map/useStoryMapBoardState.ts:282-368` -- filterStoryMap (282-330) + cardMatchesFilters (332-368); search haystack :345-348; per-card index records (sourceSearchTextByCardId, githubLinksByCardId) are the pattern for externalRefs
- `apps/web/src/features/story-map/components/CardTile.tsx:76,106-156` -- badge pattern (card-level-badge at :76; detail badges 106-156)
- `apps/web/src/features/personas/PersonasPanel.tsx:73-88` -- persona tile rendering (receives Persona object)
- `apps/web/src/features/releases/ReleasePanel.tsx:68-85` -- release row rendering (receives Release object)
- `apps/web/src/app/api.ts:495-526` -- API client methods (sendJson pattern); snapshot delivery via useStoryMap hook (~:632) -> /api/story-maps/{id}; `apps/web/src/ui-strings/index.ts:120-416` -- panelStrings
- Test anchors: `packages/db/src/unit-of-work.test.ts:8` (openStoryMapperDb temp db + UoW), `apps/server/src/application/mcp-http-parity.test.ts`, `apps/web/src/features/story-map/components/lifecycle.test.tsx`

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `mcp/tools.ts`, `mcp/tool-inputs.ts` -- externalRefSchema (entityType enum card|release|persona, system `[a-z0-9-]+`, trimmed non-empty externalId); setExternalRef request `{system, externalId}` + response `{ref, status: created|unchanged}`; storyMapSnapshotSchema `+externalRefs` default []; McpToolName `+SetExternalRef`; MCP SetExternalRef input `{entityType, entityId, system, externalId}` -- single schema source
- [x] `packages/db/src/schema/tables.ts`, `schema/classification.ts`, `connection.ts` -- externalRefs table + both unique indexes in migrate() DDL (AD-9 in-place, no entity_id FK); classify `external_refs`
- [x] `packages/db/src/repositories/external-refs-repository.ts` (new) + storymapper-repository bindings -- setExternalRef: entity existence (not_found), owner-derived scope, github refusal (validation), identical → unchanged, conflicting binding / scoped-key reuse → conflict; catch SQLITE_CONSTRAINT_UNIQUE on insert (re-read: identical → unchanged, else conflict); `synced_version` = resulting entity version; listExternalRefsForStoryMap (map cards+releases+personas incl. project-level); deleteExternalRefsForEntity
- [x] `packages/db/src/repositories/{cards,releases,customizations}-repository.ts` -- deleteCard :218 loop, deleteRelease :99, deletePersona :152 also delete `external_refs` rows for the entity type in the same UoW; archive paths untouched
- [x] `packages/db/src/snapshot.ts` -- redactProject: after project pruning, delete `external_refs` rows whose (entity_type, entity_id) no longer exists among retained cards/releases/personas
- [x] `apps/server/src/application/external-ref/external-ref.use-cases.ts` (new) + `descriptors.ts` -- setExternalRef use case (UoW + ActorContext, DomainError mapping) and descriptor; register in applicationCapabilityDescriptors
- [x] `apps/server/src/http/routes/{card,release,persona}-routes.ts` -- POST `/api/cards/:cardId/external-refs`, `/api/releases/:releaseId/external-refs`, `/api/personas/:personaId/external-refs` (201 created / 200 unchanged)
- [x] `apps/server/src/mcp/tools/register-card-tools.ts` (or sibling register file) -- SetExternalRef tool with the unified entityType+entityId input
- [x] `packages/db/src/repositories/projects-repository.ts:213-238` -- getStoryMapSnapshot `+externalRefs`
- [x] `apps/web/src/features/story-map/useStoryMapBoardState.ts`, `CardTile.tsx`, `ReleasePanel.tsx:62` (release row), `PersonasPanel.tsx:73-88`, `ui-strings/index.ts` -- `system:id` badges on cards/releases/personas; add ref text to filterStoryMap search fields
- [x] Tests: contracts schema tests; db real-SQLite tests (both constraints incl. racing second writer, scope derivation, no-op vs conflict, baseline equals resulting root version with no bump, delete/archive, redaction prune); server HTTP + real MCP acceptance (github refusal, 201/200, 409/400/404); web mounted badge + `system:id` search tests

**Acceptance Criteria:**
- Given the table, when scoped keys/bindings are inserted including a racing second writer, then both exact unique constraints hold and the same external id in another valid scope remains legal.
- Given a Card/Release/Persona and a valid trimmed case-sensitive id, when set via HTTP or MCP, then owner-derived scope and initial baseline persist with no root-version bump; an identical repeated set changes nothing and conflicting bindings are refused.
- Given reserved `github` or a forged scope, when a generic caller sets a ref, then validation refuses before mutation.
- Given a referenced entity, when deleted versus archived (card), then deletion removes refs atomically in the same transaction and archive keeps them.
- Given a referenced object, when displayed or searched by `system:id` on the board, then badges show and search finds it; use cases run through UoW with actual ActorContext.
- Given a redacted snapshot of another project, when created, then no `external_refs` rows for the excluded entities remain.

## Spec Change Log

## Review Triage Log

- medium — `listExternalRefsForStoryMap` read every reference in the database before filtering — confirmed; snapshots for one map scan unrelated projects, so constrain the SQL query by map/project scope — patch.
- low — the racing scoped-identity key case was not exercised — confirmed; same-binding race coverage does not prove a different entity winning that key becomes conflict — patch.
- low — the racing entity-binding key with a different external id was not exercised — confirmed; add it to verify the conflict branch preserves the winning binding — patch.
- medium — redacted snapshot pruning covered only Card references — confirmed; Release and Persona rows need proof of retained/excluded polymorphic pruning — patch.
- low — HTTP Release and Persona routes had creation-only acceptance — confirmed; exercise repeat and conflict handling on both sibling routes — patch.
- low — mounted badge/search coverage exercised only Cards — confirmed; add Release and Persona display assertions — patch.
- low — the changed `PersonasResponse` shape lacked list-response coverage — confirmed; assert project-wide and Story Map filters return only refs for their returned Personas — patch.
- low — project-level Persona references were not checked across maps and project boundaries — confirmed; prove they appear on maps of their owning Project only — patch.
- low — deletion coverage inferred Release/Persona cleanup from snapshot filtering — confirmed; assert physical rows are removed for every deleted entity type — patch.
- low — Release and Persona rendering repeatedly filtered all refs per entity — confirmed; pre-group the references once in each panel — patch.
- medium — SQLite `trim(external_id)` accepts tab-only values — confirmed by SQLite trim semantics; enforce ECMAScript whitespace trimming at the DDL boundary and test raw inserts — patch.
- low — Persona badge display had no mounted assertion — confirmed; add a PersonasPanel test with API-provided refs — patch.
- low — Release badge display had no mounted assertion — confirmed; add ReleasePanel/release-band rendering coverage — patch.

### 2026-10-11 — Review pass
- verdicts: 33 findings — high 0, medium 2, low 16, false 15, maybe-false 0
- findings:
  - `[false]` `[reject]` Orphaned refs after story map or project removal — Story Map deletion is a soft delete (`deleted = true`), nothing is hard-deleted, so no orphan rows arise; snapshot listing filters by existing entity ids.
  - `[false]` `[reject]` Persona scope/baseline can go stale — `updatePersona` never changes `projectId` or `storyMapId`, so owner-derived scope cannot drift.
  - `[false]` `[reject]` No unbind or lookup/read tool — the intent defines read as snapshot/persona-list delivery; upsert/lookup belong to 4.4-4.6.
  - `[false]` `[reject]` `SetExternalRef` is a direct agent write — the intent mandates MCP set via UoW + ActorContext; `kind: "write"` has wide precedent in `card.use-cases.ts`.
  - `[medium]` `[patch]` Validation rules repeated in the MCP `SetExternalRef` input — confirmed at `tool-inputs.ts:51`; derived it from `setExternalRefRequestSchema.extend({ entityType, entityId })`.
  - `[low]` `[patch]` Owner resolution written twice — `externalRefProjectId` now reuses the shared scope resolvers and `resolveOwner` uses the repository getters.
  - `[false]` `[reject]` Dead code in the repository — bare `this.context.database;` is the repository-wide open-guard idiom; the unique-race handler is required by the task list and tested; id filtering is already bounded by scope.
  - `[low]` `[reject]` Weak test hygiene — trivial truthy assertions and repeated raw INSERTs are cosmetic; missing MCP persona/unknown-entity coverage is handled by the gap patch.
  - `[low]` `[reject]` Frontend ref grouping repeated three times — three small, differently shaped reducers; a shared helper adds an abstraction for no named divergence.
  - `[low]` `[patch]` `api.setExternalRef` has no caller — confirmed by grep; removed it and its two imports.
  - `[low]` `[reject]` UI polish (release-name list in ReleasePanel, no aria/truncation, Swimlane release refs) — design choices outside the acceptance criteria; the fix is new UI, not a direct correction.
  - `[low]` `[reject]` Route reply expression and duplicate imports — repeated one-liners match sibling routes; no named harm.
  - `[low]` `[reject]` Odd Zod definitions — `createdAt` union is the established pattern in `domain.ts`; cosmetic.
  - `[false]` `[reject]` Export/import/copy not covered — project archive carries no link tables either (no githubLinks/sourceLinks), and a copied map creates new objects that need new identities.
  - `[low]` `[patch]` HTTP binds refs to cards/releases in soft-deleted maps while MCP refuses — `resolveOwner` bypassed visibility; it now uses `getCard`/`getRelease`/`getPersona`.
  - `[low]` `[reject]` No maximum length on `system`/`externalId` — loopback-only local tool, only deliberate callers can submit oversize values; the fix touches contracts, DDL and tests.
  - `[false]` `[reject]` Project-level and map-level persona may share a ref id — direct consequence of the intent's `storyMapId ?? projectId` scope.
  - `[false]` `[reject]` Live tracking at unchanged version — `trackLiveActivity` tracks the card/release/persona root with its current version, same mechanism as source and persona links.
  - `[false]` `[reject]` Repository skips agent write-safety — the project safety gate runs in `resolveToolProjectIds` for every MCP tool, as for all other writes.
  - `[false]` `[reject]` Release/persona refs are not board-searchable — the spec asks for card search via `filterStoryMap`; releases and personas are not filtered by that search.
  - `[false]` `[reject]` ChangeSet policy bypass claim — same as the direct-write finding above.
  - `[low]` `[patch]` Planning (swimlane) and Backlog badge wiring untested — added a render test asserting both views show `agent:Card-42`.
  - `[low]` `[patch]` MCP persona path and unknown entity untested — added persona-success and `not_found` assertions to the parity test; the write-disabled gate is shared with every tool and not re-tested here.
  - `[low]` `[patch]` Carried: `api.setExternalRef` has no caller — removed (see above).
  - `[low]` `[patch]` Carried: duplicated owner lookup — consolidated (see above).
  - `[false]` `[reject]` No dedicated read use case — an alternative reading of "read"; Tasks and ACs define snapshot-based display and search.
  - `[low]` `[reject]` Test weight on repository and human HTTP over the agent path — the agent path gained persona and unknown-entity cases via the gap patch.
  - `[low]` `[reject]` ActorContext enforcement not tested with a fabricated actor — enforcement is the shared `UnitOfWork.run` contract tested in `unit-of-work.test.ts`.
  - `[low]` `[reject]` Delete exercised at repository level only — the transport deletes call the same repository methods; physical-row deletion is asserted in db tests.
  - `[false]` `[reject]` Snapshot lists project-scoped persona refs in every map — persona visibility in a map includes project-level personas by design.
  - `[false]` `[reject]` Search is card-only — same as the board-search finding above.
  - `[medium]` `[patch]` Carried: schema duplication in the MCP input — fixed above; the `github` refusal lives only in the repository by design (single enforcement point).
  - `[false]` `[reject]` `CREATE TABLE IF NOT EXISTS` without migration gate — consistent with AD-9 and the intent's no-compatibility rule.

## Design Notes

- Scope is derived, never supplied: the use case takes (entityType, entityId) and the repository re-reads the entity row to compute scope — forged ownership is structurally impossible at every entry point.
- No root-version bump on set, matching createCardSourceLink/createGitHubLink (separate rows, own activity). The baseline reads the entity's resulting version inside the creation transaction, so any in-transaction bump owned by the binding is captured automatically.
- One unified MCP tool `SetExternalRef` (strict 3-value entityType enum, not a catch-all) because the operation is entity-generic; HTTP stays per-entity to match existing route conventions.
- `github` refusal lives in the repository (single enforcement point) so the Epic 7 adapter path is later the only writer.
- `external_refs` has no project_id column, so snapshot redaction needs the explicit entity-existence prune — FK-only pruneForeignRows cannot reach polymorphic rows.
- AD-9: migrate() creates the table/indexes in place; the DDL-hash schema version updates automatically and pre-change restore points fail validation by design.

## Verification

**Commands:**
- `corepack pnpm --filter @storymapper/contracts test` -- expected: pass (externalRef + request/response schemas, snapshot shape)
- `corepack pnpm --filter @storymapper/db test` -- expected: pass (constraints/races, scope, no-op/conflict, baseline, delete/archive, redaction prune)
- `corepack pnpm --filter @storymapper/server test` -- expected: pass (HTTP 201/200/409/400/404 + real MCP SetExternalRef)
- `corepack pnpm --filter @storymapper/web test` and `corepack pnpm --filter @storymapper/web typecheck` -- expected: pass (badge + search mounted tests)
- `node scripts/verify.mjs` -- expected: Git/source hygiene, typecheck and build pass

## Auto Run Result

Status: done
Blocking condition: none

### Summary

External references (`external_refs` table, owner-derived scope, creation-time baseline) on Cards, Releases and Personas, with HTTP routes, a unified MCP `SetExternalRef` tool, snapshot delivery, `system:id` badges and card search. This follow-up review pass patched schema duplication, owner resolution, visibility parity and test coverage.

### Files changed in this pass

- `packages/contracts/src/mcp/tool-inputs.ts` -- SetExternalRef input derived from the request schema.
- `apps/server/src/mcp/tools/project-scopes.ts` -- SetExternalRef project scope reuses the shared resolvers.
- `packages/db/src/repositories/external-refs-repository.ts` -- owner resolution uses visibility-aware getters.
- `apps/web/src/app/api.ts` -- removed unused `setExternalRef` client method.
- `apps/server/src/application/mcp-http-parity.test.ts` -- MCP persona and unknown-entity cases.
- `apps/web/src/features/story-map/components/lifecycle.test.tsx` -- planning and backlog badge render test.

### Review findings

Patches applied: 7 entries (2 medium, 5 low counting carried rows). Deferred: none. Rejected findings and their reasons are in the Review Triage Log above.

Follow-up review recommended: false -- this follow-up pass patched no `high` entry.

### Verification

`@storymapper/contracts`, `db`, `server` and `web` test suites pass; `web typecheck` passes; `node scripts/verify.mjs --skip-build` completes (hygiene and all package typechecks).

### Residual risks

No maximum length on `system`/`externalId`; release/persona refs are not board-searchable; project archive does not carry refs. Release-name list in `ReleasePanel` repeats release names.
