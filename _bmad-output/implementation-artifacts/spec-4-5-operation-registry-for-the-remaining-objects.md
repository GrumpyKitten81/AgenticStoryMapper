---
title: 'Operation registry for the remaining objects'
type: 'feature'
created: '2026-10-12'
status: done
version: 4
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-4-preparation.md', '_bmad-output/implementation-artifacts/story-plan-4-5-operation-registry-for-the-remaining-objects.md']
warnings: []
deferred: []
baseline_revision: 56ebc8bdd3e4bd2735ba6e231c1852cf97c1cc69
---

Reproducing statement: Investigate and implement Story 4.5 using bmad-build-auto and independent source investigations; never write, stage or revert orchestrator-owned sprint-status.yaml or infer verification from its rows. Date: 2026-10-12. Version: 3.

<intent-contract>

## Intent

**Problem:** Story 4.4 supplies the core typed operation registry, but remaining writable domain families and stored-operation schema staleness are missing.

**Approach:** Extend the existing strict contract union and pure describe/resolve registry against actual capabilities and ownership; version stored operations, invalidate incompatible pending proposals and preserve readable historical data.

## Boundaries & Constraints

**Always:** Follow Epic 4 preparation and the 4.5 detail plan. Keep ownership, persisted-first references, sequential dependencies, deterministic simulation and transaction-coalesced root versions. Prepare files, hashes and allocated identities outside core. Incompatible active pending rows, including approved/reapprovable rows, become stale; applied and restore-undone history cannot execute. Current-schema resubmission requires fresh approval. Include Source import/chunks, Card relationships and copy/import effects as the planning acceptance requires.

**Scope decision (locked by supervisor 2026-10-12):** `view_settings` is classified as a **planned-only family outside Epic 4's exposed-write catalog**. The DB classification lists exactly four customization families (annotations, workflow_statuses, story_templates, ai_function_templates); no `view_settings` family exists in DB schema, contracts or implementation; FR-12 Focus Release/per-View settings remains a documented PRD-gap that is explicitly "not committed to as new functionality" (board-baseline note). Implementing it as a new persisted DB family with invented fields/ownership is brand-new feature work, not an operation-registry-for-existing-families story. Treat the plan's View Settings inclusions as a planning requirement revision, not an omitted effect to implement — no silent removal.

**Never:** Invent unspecified View Settings fields, ownership or persistence. No permissive executable payload, historical execution adapter, prototype database compatibility, executor integration, universal Agent routing, new Card dependencies, AI-template Agent editing, provider dependency, commit or push. Never write, stage or revert sprint-status.yaml; tracking rows are not implementation evidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Current catalog | Supported remaining typed pairs | One pure describe/resolve pair, actual owner and complete effects | Unsupported pairs/fields fail |
| Prepared import | Earlier import then locator-addressed link | Prepared chunks visible without persistence; transitive deselection | Unknown locator, foreign literal chunk and forward import fail |
| Copy/import | Reviewed source/connector fingerprint and prepared identities | Actual copy/import effects, preserved scope and immutable approved input | Source/connector drift fails |
| Schema transition | Incompatible active pending/approved vs applied/undone rows | Active rows stale; original tag/payload and historical readability retained | Stale approval/apply fails before domain writes |
| Restore/import | Current-DDL database with old operation versions | Same operation-data transition at publication as startup | Invalid schema/status/version fails; DDL mismatch remains refused |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/change-operations.ts` — `makeChangeOperationSchema`, strict catalog authority; two typed copy/import members await real handlers.
- `packages/contracts/src/schemas/operation-fields.ts` — reusable payloads and already-typed earlier-import locator selector.
- `packages/contracts/src/schemas/operation-resolution.ts` — expand snapshot, supplied preparation, resolved changes and owners beyond four roots; currently Product Context is ownership-only.
- `packages/core/src/changesets/operation-registry.ts` — `RESOLVERS`, `PENDING`, sequential simulation, entity diffs, addressed/changed owners and initial versions. Deletes require before-state ownership rather than looking up removed roots.
- `packages/core/src/changesets/{resolution-context,operation-dependencies,source-resolution}.ts` — widen actual references/collision checks/owner dependencies; implement import selectors without treating literal chunk IDs as aliases.
- `packages/db/src/repositories/{roadmaps,customizations,cards,sources,map-copy,tool-proposals}-repository.ts` — read exact available files/functions as golden persistence semantics, not a second new engine. Roadmap creation seeds Now/Next/Later and Default children. Persona/Annotation deletion affects linked Cards. Copy includes owned customization/roadmaps/relations/attachments and resets Card origin to inference.
- `apps/server/src/services/prepare-source-document-import.ts` and DB sources repository — application preparation supplies content/hash; existing persisted dedup is Project/type/hash and chunk IDs hash document ID plus locator.
- `apps/server/src/application/descriptors.ts`, `scripts/{generate-capability-manifest,check-capabilities}.mjs`, server capability manifest tests — inventory every write and require explicit member or exception. GitHubLink CRUD changes displayed evidence and affected Card versions, so cannot be blanket bookkeeping exceptions. Remote push/connector baseline/run/conflict bookkeeping are distinct exceptions.
- `packages/contracts/src/schemas/domain.ts:654` — current ChangeSet lacks schema version/stale; separate strict executable submission from version-tagged historical reading.
- `packages/db/src/schema/tables.ts:369`, `connection.ts:397`, repositories `row-mappers.ts:395` / `changesets-repository.ts` — persist/validate operation version; transition incompatible active rows; reject status-reactivation and apply of stale/historical rows.
- `packages/db/src/{restore-validation,archive-database,restore-project,restore-history}.ts` — archive/restore existing-open paths bypass bootstrap migration; transition operation data at publication too. Preserve exact DDL hash refusal and historical payload/tag bytes.
- Relevant tests: Core operation resolution/selection; DB operation parity/selector regressions, root versions, source import, card visibility, restore-project; server archive fixtures. Extend meaningful golden, scope, dependency, transition and purity coverage.
- Read-only constraint: `sprint-status.yaml` belongs to the orchestrator. No tracking row or historical spec status substitutes for source/tests.

## Tasks & Acceptance

**Execution:**
- [x] Validate the locked View Settings exclusion and classify every exposed write in the generated capability manifest.
- [x] Extend strict contracts and pure core registry/resolvers for actual remaining families, prepared imports/locators, relationships and composite copy/import effects.
- [x] Persist operation schema version and transition incompatible active proposals at startup and archive/restore publication; retain raw historical reads and reject replay.
- [x] Integrate historical HTTP/MCP/UI reads with strict current mutation responses and disabled stale controls.
- [x] Run deterministic/ownership/dependency and real SQLite golden tests, workspace tests/typechecking, capability parity and release verification.
- [x] Complete independent review and triage every finding.

**Acceptance Criteria:**
- Given every currently writable domain family, when catalog/parity/golden tests run, then each has strict operations and one pure handler pair or an authorized explicit exception, with no unexplained gaps.
- Given earlier prepared imports and selected links, when simulated and deselected, then locator resolution and dependency closure preserve actual ownership without I/O.
- Given incompatible pending/approved schemas and applied/undone history, when transitioned at startup or restore/import publication, then active incompatible rows are stale, historical bytes remain readable and stale/historical execution fails.
- Given identical valid snapshot/operations/supply, when resolved twice, then state/effects are deterministic and input stays unchanged.


**Review repair acceptance (iteration 1):**
- Bulk Card payload must represent the existing four Persona/Annotation add/remove fields and individual target baseline versions, including differently versioned Cards. Follow existing command schema semantics; preserve persisted-first local references, owner scopes, atomic simulation and coalesced versions. Do not add new operations or writable capabilities. Nested patch Release/relationship references must participate in sequential dependencies and deselection.
- Partial Product Context edits preserve every omitted populated field; defaults apply only to new contexts. Direct GitHub identity creation without Issue number does not touch Card provenance/version, matching repository behavior.
- Dependency analysis must follow actual sequential composite Map creation, unpark placement, archive/park visibility and GitHub ownership changes. Selecting a later operation without an earlier prerequisite must remove it transitively rather than fail or choose a different structural neighbor.
- Idempotent relationship/external-reference descriptions retain actual addressed ownership even when no entity changes. Customization entityId references must resolve aliases before Project privacy lookup; disabled foreign Project operations are hidden.
- For every remaining pair, assert exact resulting effects, unchanged fields, owner and root versions (not only presence of some change); keep deterministic/input-immutable checks and real SQLite parity. Add standalone park/archive state plus described changes and valid-current UI proposed/approved enabled-control/request regressions.
- Preserve every KEEP behavior from the change log and review fixes above while re-deriving. No orchestrator tracking mutation/staging/reversion, commit or push.

## Spec Change Log

- 2026-10-12 — Review repair 1: Actual bulk command exposes four relationship patch fields and individual Card baselines; generic smoke tests did not establish complete effects. Amend acceptance below to preserve existing writable-command behavior and exact state/effect/version/owner oracles. Avoid incomplete bulk payloads and destructive defaulted partial edits. KEEP strict current/history separation, startup/publication stale transitions, privacy checks, catalog exceptions, deterministic prepared import/copy graphs and all passing SQLite parity cases. The repair checkpoint `4-5-preserved-implementation.patch` held known defects for re-derivation; it was consumed by the repair agent and removed after successful convergence.

- 2026-10-12: Current Card and Release reorder behavior is covered by `move:card` and `update:release`. Removed the inherited standalone `reorder:card` draft member because no current descriptor/API/repository supports its unspecified cross-lane payload. This refines the runnable catalog without removing existing reorder behavior or inventing new functionality.
- 2026-10-12: Completed remaining pure handlers against repository behavior; copy resets creation origin to inference while effective provenance remains linked when copied evidence exists. Sequential source edits invalidate reviewed copy/import fingerprints. Literal chunk selectors require persisted ownership; prepared chunks use explicit earlier-import locators.

## Review Triage Log

### 2026-10-12 — Review pass 1
- verdicts: 21 findings — high 2, medium 14, low 0, false 5, maybe-false 0
- findings:
  - `[high]` `[patch]` Product Context partial edit clears omitted defaulted fields — Zod defaults survive partial(); Object.assign applies those defaults to the existing context. Remove defaults in the patch schema and verify preserved populated fields.
  - `[medium]` `[bad_spec]` Bulk omits exposed relationship changes — Existing bulkUpdateCardsPatchSchema and repository accept all four relationship fields; strict bulk member rejects them. Amend payload/effect acceptance.
  - `[medium]` `[bad_spec]` Bulk cannot express per-Card baselines — bulkUpdateCardsCommandSchema requires individual id/baseVersion pairs; one operation baseline cannot validate differently versioned targets. Amend baseline contract using existing command semantics.
  - `[medium]` `[patch]` Nested bulk Release dependency missing — readPayload checks only top-level releaseId; bulk patch.releaseId is not visited. Read nested references before selection closure.
  - `[medium]` `[patch]` GitHub identity creation increments Card without Issue — Repository finalizeEvidenceCards on create requires issueNumber; pure resolver adds every direct Card. Preserve repository create semantics.
  - `[medium]` `[patch]` Unpark placement absent from dependency simulation — registerPlacement excludes unpark although resolver changes parent and tail position. Track these actual placement effects.
  - `[medium]` `[patch]` Visibility changes absent from dependency simulation — Structural neighbor choice reads original snapshot visibility after archive/park edits. Track visibility and dependencies on changed candidate neighbors.
  - `[medium]` `[patch]` GitHub ownership update absent from dependency simulation — Only create adds snapshot identity/affected sets; update retains old owner for subsequent deletion/evidence analysis. Track actual changed ownership.
  - `[medium]` `[patch]` Idempotent relationship/reference descriptions omit owner — addressedOwner skips set; unchanged existing relationships/reference produce zero changes and therefore zero owners. Retain addressed ownership for no-op descriptions.
  - `[medium]` `[bad_spec]` Pair-wide smoke assertions lack complete effect oracles — Generic checks establish one named change but not full fields/versions/owners; Product Context and GitHub discrepancies escape. Require exact resulting effects for each pair, with SQLite parity for affected cases.
  - `[high]` `[patch]` Customization entityId bypasses scope aliases — collectScopes synthesized workflowStatusId/storyTemplateId keys bypass scopeAliases and have no resolver, exposing a disabled foreign Project payload. Normalize synthesized keys before lookup.
  - `[medium]` `[patch]` Composite creation fails dependency closure — registerOperation records composite entity key but later map reads use storyMap key. Register the actual created Map address.
  - `[medium]` `[patch]` Archive-dependent neighbor selection diverges — Original snapshot visibility plus no read dependency on candidate neighbor lets selected child reassignment silently choose another Activity. Same structural visibility defect as above.
  - `[medium]` `[patch]` Park/archive verification immediately undoes effects — Verification reviewer demonstrated missing assignments still pass common assertions and final-state reverse batch. Add standalone returned-state and described-effect assertions.
  - `[medium]` `[patch]` UI executable gate lacks current enabled control tests — Every mutation-control fixture expects disabled controls; executable=false would pass. Add valid current proposed/approved enabled and request assertions.
  - `[false]` `[reject]` Catalog membership does not derive indirect behavior — Auditor describes evidence boundaries, not a missing behavior; authored classifications explicitly enumerate remote push/import/pull/sync domain effects. Golden behavior breadth is separately retained above.
  - `[medium]` `[bad_spec]` Golden effects exceed generic pair assertions — Auditor confirms common assertions do not establish full effects for each pair. Same complete-effect oracle defect as blind finding ten; amend acceptance without extending product scope.
  - `[false]` `[reject]` Prepared-input tests bypass application preparation pipeline — Contract explicitly excludes executor integration and requires core to consume supplied preparation; direct prepared-input tests exercise the intended surface.
  - `[false]` `[reject]` Catalog checks alone do not prove all root coalescing — Catalog checks claim membership only; core sequential/root-version tests and SQLite UnitOfWork/root-version tests separately verify coalescing. No specific wrong root version identified beyond retained cases.
  - `[false]` `[reject]` Agent history readability is conditional — Existing Agent privacy rules require recognizable authorized owners; conservative filtering preserves human raw history and satisfies readable-history scope without exposing disabled Projects.
  - `[false]` `[reject]` Tests use current DDL rather than prototype upgrade — Intent explicitly forbids prototype compatibility and matrix requires current-DDL operation transitions; exact DDL refusal is expected.



### 2026-10-12 — Review pass 2

- verdicts: 19 findings — high 2, medium 12, low 0, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` In-use Workflow Status rejection is untested — Verification reviewer demonstrated guard removal is invisible to matrix and DB repository tests; add indexed conflict assertions for both registry entry points and immutable input. Applied: Added exact in-use status conflict/index/immutability regressions for resolution and description.
  - `[high]` `[patch]` External binding writes do not constrain subsequent selectors — references is updated only by upsert; new set/delete writes can change an upsert between create and update after deselection. Track binding reads and actual sequential binding state. Applied: Tracked sequential binding writes, reads and removals, including root deletion, with transitive selection regressions.
  - `[medium]` `[patch]` External reference local Map scope fails — referenceOwner compares literal scopeId to resolved row.storyMapId; accepted earlier Map alias therefore conflicts. Resolve persisted-first scope before storing/comparing and selection. Applied: Resolved persisted-first Map scopes before validating/storing references; covered full local creation chains.
  - `[medium]` `[patch]` Prepared import local id hides authorized proposal — canReadChangeSet ownIds/createdIds handle create/upsert/link but not import, so sourceDocumentId synthesis cannot resolve its not-yet-persisted local id. Include import without weakening persisted ownership. Applied: Included import in proposal creation identities while retaining persisted foreign-owner precedence.
  - `[medium]` `[patch]` Primary baseline incorrectly validates collateral Cards — changedCard always calls assertBaseline with operation.baseVersion; Persona delete and Activity parking apply that primary value to differently versioned collateral Cards. Validate primary root and coalesce actual collateral roots independently. Applied: Separated primary baseline validation from collateral Card ownership; covered differently versioned deletion, park and GitHub roots.
  - `[high]` `[patch]` External binding scanner misses set/delete — Same binding-index/read defect as edge finding; Card external-selector work can survive removal of a required binding and fail or target a different root. Register binding changes and prerequisite edges. Applied: Tracked binding state and selector prerequisites, including root-delete/replacement-upsert/new-id edit chains.
  - `[medium]` `[patch]` Workflow Status deletion loses status-change prerequisite — Deletion guard reads Card status while dependency state never registers its read dependencies; excluding prior archive/update can retain a newly conflicting deletion. Track the actual guard prerequisites. Applied: Tracked prior Card writes read by the status-deletion guard; covered archive/update/bulk deselection.
  - `[medium]` `[patch]` Remaining contracts permit unsupported external selectors — Shared base selector permits externalRef but remainingTarget rejects it for these entities. Restrict remaining targets using existing persisted/local selector schema, retaining supported earlier core external selectors. Applied: Restricted unsupported remaining targets to persisted/local selectors; kept existing Card/Release/Persona external selectors.
  - `[medium]` `[patch]` External reference scope aliases remain literal — Same local-Map scope defect as edge finding. Resolve alias before validation and stored reference identity. Applied: Resolved scope aliases and retained canonical persisted scopes with exact graph assertions.
  - `[medium]` `[patch]` Roadmap child collision check omits snapshot families — allocatedChildId scans only remaining collections and Maps; allocatedId scans allEntities including Projects/connections/documents/chunks/evidence. Share the complete existing check and cover real Project/Document collisions. Applied: Reused complete allocatedId collision checks; covered Project, connection, document, chunk and evidence collisions.
  - `[medium]` `[patch]` Explicit undefined patch properties erase fields — Nonempty bulk check counts status:undefined and updateCard Object.assign overwrites it; Product Context similarly applies undefined. Normalize defined fields before validation and assignment. Applied: Normalized undefined values before assignment and bulk nonempty validation; preserved valid scope-only Product Context creation and populated edits.
  - `[medium]` `[patch]` Source import creation scope is not exempted — Same canReadChangeSet import omission as edge finding; valid proposed prepared document local target is not persisted. Extend creation handling with persisted-first regressions. Applied: Included import local identities with real MCP authorized/disabled persisted-ID regressions.
  - `[medium]` `[patch]` Supported historical deletion ownership cannot recover — deletedScopeTypes omits Annotation/WorkflowStatus/StoryTemplate/attachment, although repository deletion Activity records proven owner; attachment Activity uses cardAttachment. Extend known recovery preserving unique-owner and access checks. Applied: Added supported deletion Activity families, including cardAttachment, with authorized/disabled/ambiguous-owner tests.
  - `[medium]` `[patch]` Prepared Source values bypass domain schema validation — importSource validates selected approved fields and locator membership but pushes unchecked chunk IDs/text/document timestamps. Parse existing domain schemas before publication and test malformed values. Applied: Parsed supplied document/chunks through the existing domain schemas before publication; malformed values reject without input mutation.
  - `[false]` `[reject]` Manifest parity is not comprehensive semantic execution evidence — Auditor describes intended evidence boundaries; exact registry effect oracles, selected real SQLite golden cases and root-version tests provide semantic evidence separately. No additional missing effect asserted here.
  - `[false]` `[reject]` Pure resolution does not prove production executor coverage — Captured intent explicitly excludes executor integration and universal routing; pure registry plus SQLite parity is the intended Story4.5 surface.
  - `[false]` `[reject]` Prepared-input tests do not execute an end-to-end preparation pipeline — Captured intent requires supplied preparation outside core and excludes new executor integration; existing application preparation remains responsible for files/hashes/IDs. This diff tests its core consumption boundary.
  - `[false]` `[reject]` Historical readability varies by audience — Project privacy forbids unrestricted Agent reads; human opaque history remains readable. Supported recoverable Agent deletion histories are separately patched above.
  - `[false]` `[reject]` Current-DDL transition fixtures omit prototype migrations — Captured intent expressly forbids prototype DB compatibility and matrix requires current-DDL operation-version transition. The described boundary matches expected behavior.

Grouped patch entries: 11 (high 1, medium 10); duplicate findings retain individual rows above. Same implementation agent repaired all groups. Parent source verification extended the previously logged no-op ownership correction to deduplicated imports, repeated Product Context sets, existing Roadmap references and unchanged coalesced bulk, with exact owner/effect/state regressions. Final fixture corrections omit invalid Workflow Status null color and parse Connector Connection defaults through its existing domain schema. No findings deferred.

### 2026-10-12 — Review pass 3 (follow-up)
- verdicts: 25 findings — high 0, medium 2, low 15, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` Operation schema version not bumped despite in-place shape changes — `OPERATIONS_SCHEMA_VERSION` first appears in the unreleased baseline commit of this same story, so no stored version-2 row in an older shape exists; prototype compatibility is excluded by intent.
  - `[false]` `[reject]` No ADR for ChangeSet versioning — the stale/historical/fresh-approval decisions are already recorded as accepted decisions in the architecture spine this story implements.
  - `[false]` `[reject]` Response parse after commit can flip status then fail — `updateChangeSetStatus` and `applyChangeSet` parse the stored row with `changeSetSchema` before any status write; the response parse sees the same operations.
  - `[low]` `[reject]` project-scopes appends `delete:sourceLink`, hides unrecognized history and throws differently on execution authorization — fail-closed by design for Agents, historical operation vocabulary is intentional; fix would add branches for no reachable harm.
  - `[low]` `[reject]` Disabled web controls show no reason for non-stale historical rows — only applied/undone rows can be non-current and non-stale; active incompatible rows are transitioned to stale and show the reason.
  - `[low]` `[reject]` Repeated Zod parsing and unbounded raw payload dump in the panel — bounded history list, cosmetic cost.
  - `[low]` `[reject]` Capability coverage is hand-maintained in four places; pull gained `confirmed-remote-write` and lost `update:githubLink` — manifest parity and scan tests pass; classification is conservative and pull requires confirmation; no wrong behavior shown.
  - `[low]` `[patch]` Leftover `pending-extension` classification, status member, assertion and test title after `PENDING` removal — removed the dead field and union member (`operation-registry.ts`, `operation-resolution.ts`, capability manifest test, core registry test title).
  - `[low]` `[reject]` Board import accepts duplicate new issues, key-order dependent connector comparison, overwrite of existing cards — proposals are generated from a unique board listing and the comparison runs on identically produced preview objects; any collision fails loudly on a supplied-identity check.
  - `[false]` `[reject]` Bulk relationship supply read with non-null assertion hides a missing supply — `allocatedId` refuses with "Application must supply an allocated id." before any effect.
  - `[low]` `[reject]` Evidence/provenance rule duplicated across finalize, reconcile, copy and link resolvers — refactor only, no divergence shown.
  - `[low]` `[reject]` Empty-snapshot literal and raw ChangeSet insert helper duplicated across tests; brittle positional oracle table — test hygiene only.
  - `[false]` `[reject]` Version-2 rows with old bulk/reorder shape abort startup or import (edge) — same as the first row: no such row can exist.
  - `[low]` `[reject]` `delete:externalRef` has no Project scope resolver — Agents have no tool that proposes it, production apply rejects the pair, and no repository lookup by reference id exists.
  - `[low]` `[reject]` Board-import `removeCardIds` and expected map keys are not scope-scanned — visibility only; Agents have no tool producing board-import ChangeSets and core resolution refuses foreign targets.
  - `[medium]` `[patch]` Board-import cleanup and Card removal branches have no resolver parity test — added a SQLite golden test (Card removal, imported-and-removed refusal, cleanup) in `packages/db/src/board-import-resolution.test.ts`; resolver state and effects match the real apply.
  - `[medium]` `[patch]` Roadmap reference dependency on an earlier Release or Card creation is untested — added a deselection regression in `operation-selection-regressions.test.ts`; commenting out the dependency read fails it.
  - `[low]` `[reject]` Copy `sourceStoryMapId` Agent scoping lacks an MCP test — Agents have no tool that creates copy ChangeSets; fail-closed alias.
  - `[low]` `[reject]` Earlier-created local aliases of new entity types make a ChangeSet hidden or unauthorizable for Agents — fail-closed, and Agents can only propose Card, Release and Persona based ChangeSets today; universal Agent routing is excluded by intent.
  - `[low]` `[reject]` Version-2 history fixtures use payloads outside the current schema — fixtures only; no production effect.
  - `[low]` `[reject]` Panel `executable` guard's unparseable-operation half is untested — current-version stored operations always parse, so the state is unreachable.
  - `[false]` `[reject]` Transition code is not changed in the diff (intent alignment) — descriptive; transition lives at the baseline commit and its tests exercise it.
  - `[false]` `[reject]` Nothing outside tests calls the registry (intent alignment) — executor integration is excluded by intent.
  - `[low]` `[reject]` Capability manifest is a third surface (intent alignment) — same as the manifest row above.
  - `[false]` `[reject]` Rejected and conflict statuses outside the matrix wording (intent alignment) — they are reapprovable active rows; transitioning them is the stated behavior.

## Design Notes

Current registry prerequisite is present in source: 14 core pairs and two pending copy/import members. The earlier result file's missing-4.4 dependency claim is historical and no longer the blocker. Retain existing executor until 4.6 and direct-routing closure until 4.7. Development DDL bootstrap and versioned operation-data transitions are distinct; test old operation versions inside current-DDL databases rather than adding prototype compatibility.

## Verification

Use Node 24.17.0 (`PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH`):

- `corepack pnpm test` — passed the full configured suite: Scripts81, Contracts117, Core212, Importers7, DB305, Web197, Server411 and Performance5 (1,335 tests). The subsequent no-op ownership correction and fixture-only type repair were verified by the complete final Core suite (216 tests), bringing current suite coverage to 1,339 tests. The final core rerun covers every core test on the final source; no broader suite rerun is claimed after those final core-only edits.
- `corepack pnpm --filter @storymapper/core test` — passed all 216 tests on final source, including the 56 remaining operation cases and 42 selection regressions.
- `corepack pnpm --filter @storymapper/db exec vitest run src/repositories/operation-resolution-parity.test.ts src/repositories/operation-selector-regressions.test.ts` — final 14 SQLite tests passed.
- `node scripts/verify.mjs` — final exit 0; Git/source hygiene, 115-capability parity, all eight workspace typechecks and complete build passed. Earlier invalid connection defaults/null status color fixtures were corrected before this final complete gate. Existing Vite chunk-size advisory remains non-blocking.
- `git diff --check` — passed.

All five verification matrix rows have executed passing tests: strict catalog/parity; prepared source locator/import and selection; complete SQLite copy/board import plus fingerprint/connector drift; current-DDL schema startup/archive/restore publication transitions and historical HTTP/MCP/UI reads; deterministic state/effects and immutable inputs. Fresh four-layer reviews ran twice over the full inherited-plus-session implementation. All 40 individual findings are triaged above; no deferred work remains from this run.

Review includes inherited implementation commit `56ebc8bdd3e4bd2735ba6e231c1852cf97c1cc69` and this session's repairs, from `ced55c079559df8913a97f1f2f1865566329558b`. Final unified source diff is `/tmp/story-4-5-review-final.diff`. Sprint/deferred tracking was never edited, staged or reverted; its status is not verification evidence. No real browser session or new executor/universal-routing behavior is claimed.

## Auto Run Result

Status: done

Summary: Follow-up review pass over the uncommitted Story 4.5 repairs on top of baseline `56ebc8b`. Two medium test gaps were closed and dead `pending-extension` state removed; nothing else was verified as a defect.

Files changed this pass:
- `packages/db/src/board-import-resolution.test.ts` — golden test for board-import Card removal, the imported-and-removed refusal and cleanup.
- `packages/core/src/changesets/operation-selection-regressions.test.ts` — Roadmap reference deselection with an excluded Release creation.
- `packages/core/src/changesets/operation-registry.ts`, `packages/contracts/src/schemas/operation-resolution.ts` — removed the dead `classification` field and `pending-extension` status member.
- `apps/server/src/application/capability-manifest.test.ts`, `packages/core/src/changesets/operation-resolution.test.ts` — dropped the matching assertion and title wording.

Review findings: 25 — patched 3 entries (2 medium, 1 low), deferred 0, rejected 22 with the reasons logged above.

Follow-up review recommendation: false (no high patched; only tests and dead-code deletion changed).

Verification: Node 24.17.0 — core 217, contracts 117, db 306 and server 411 plus 5 audit-performance tests passed; `node scripts/verify.mjs` completed (hygiene, capability parity, typecheck, build); `git diff --check` clean. A mutation check confirmed the new Roadmap dependency test fails without the dependency read.

Residual risks: the registry still has no production caller until Story 4.6; Agent scoping of the new local-alias families is fail-closed and untested at MCP level. Nothing was committed, per the intent contract's Never list; `sprint-status.yaml` and the staged/unstaged Story 4.5 files remain for the orchestrator.

## Changelog

- Version 4 (2026-10-12): Follow-up review pass 3; added two tests, removed dead pending-extension state.
- Version 3 (2026-10-12): Completed one spec-repair iteration, two full independent review passes, all corrections and final release verification; recorded uncommitted orchestrator handoff.

- Version 2 (2026-10-12): Completed implementation, golden/schema/consumer verification and prepared full-range independent review.
- Version 1 (2026-10-12): Recorded current prerequisite verification, distilled source map and unresolved View Settings planning conflict; halted before implementation.
