---
title: 'Operation registry for the core objects'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: 'c6fd520bca02de4937654d72f8ab66c5a1f6dc5e'
baseline_commit: 'c6fd520bca02de4937654d72f8ab66c5a1f6dc5e'
version: 2
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-4-preparation.md', '_bmad-output/implementation-artifacts/story-plan-4-4-operation-registry-for-the-core-objects.md']
warnings: [oversized]
deferred: []
---

Reproducing statement: Implement Story 4.4 typed operation contracts and pure sequential resolution from the Epic 4 preparation; preserve orchestrator-owned sprint-status.yaml without writing, staging or reverting it. Date: 2026-10-11. Version: 2. Changelog: completion corrections, three independent reviews and final acceptance gates passed.

<intent-contract>

## Intent

**Problem:** ChangeOperations accept unknown payloads and unsupported pairs. Preview has no canonical pure resolver, allowing future preview and apply to disagree.

**Approach:** Define a strict typed catalog and one pure describe/resolve pair per core member, with sequential simulation, scoped selectors and transitive dependencies. Migrate current producers and consumers together. Keep the current persistence executor operational until Story 4.6.

## Boundaries & Constraints

**Always:** Contracts are the single schema source. Every operation has a unique stable operation id distinct from its optional creation-local id, typed selector/payload and optional sources/rationale. Reject unsupported pairs and fields. Core has no node imports, Date, random or crypto calls; application supplies time/ids. Persisted identities win over local aliases; literal Project/map/chunk ids are never aliases. Validate real ownership, including referenced parents/releases/chunks/GitHub identities. Never mutate input snapshots/operations. Errors identify operation id/index. Fold selected resolutions in array order over simulated state. Return typed changes, affected owners, dependencies and labelled before/after state. Card preview keys are NEW-n. Upserts are marked “may change”; archived Cards update plus explicitly preview implicit unarchive. External identity scope follows Story 4.3, rejects reserved github, advances only the addressed system baseline after actual change and does not bump versions/reset baselines on no-op repeat publication. Unchanged upsert with a human-advanced baseline conflicts rather than hiding changes.

**Catalog:** create/update StoryMap; create/update/move Card; create/update Release (including existing position movement); create/update Persona; link/unlink SourceLink (chunk, note, GitHub); upsert Card/Release/Persona by scoped external reference. Retain strictly typed create StoryMapCopy/GitHubBoardImport vocabulary for existing producers; their full pure effect resolution belongs to 4.5 and these must be explicitly classified as pending extension rather than silently resolved. Source-import-local locator selector contracts can be defined now but resolution requires prepared earlier-import chunks supplied by the subsequent catalog extension; unknown/forward imports fail now.

**Never:** Do not implement remaining-object handlers, explicit lifecycle/parking/reorder/delete-child-strategy/reference-set/unset/bulk operations, executor integration, UI preview rendering, generic submission or universal Agent routing. Do not remove DB hierarchy/position semantics before 4.6. No compatibility adapter, unknown escape hatch, new provider or dependency. Do not write, stage, restore or revert sprint-status.yaml; done/awaiting-operator rows are not verification. Do not commit or push in this invocation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Catalog | every supported pair, typed payload | schema and exactly one pure core handler pair for each core member; optional sources/rationale | unsupported pair/field/payload refused |
| Sequential create | new activity, step, story, release and links with earlier local refs | deterministic simulated state, NEW-n keys, dependencies; original state unchanged | duplicate operation/local ids and forward refs give indexed validation |
| Invalid scope | unknown or foreign parent/release/target, persisted-id alias collision | actual persisted owner checked, literal Project/map/chunk never alias | indexed validation |
| Card placement | mixed siblings, hidden cards, equal positions and moves | DB golden parity including changed sibling positions | invalid hierarchy refused |
| Release movement | move within lanes or beyond remaining count | reindexed lanes with affected root changes; assignments unchanged | out-of-range refused |
| Source evidence | chunk/note/GitHub link repeats, last unlink, direct/shared GitHub unlink | repeats no-op; true changes reconcile provenance from immutable creationOrigin and include every affected Card | unknown/mismatched evidence refused |
| External upsert | scoped missing/existing/archived ref, repeat publication, human baseline drift | create/update; may-change label; explicit Card unarchive; no-op preserves versions/baselines | invalid scope/binding/system or drift refused |
| Deselection | local refs, same-target work, descendants, chain | all later dependents deselected transitively, independent work retained | no silent partial dependency execution |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts:650` changeOperationSchema is loose; `:35/76/102/115/291/319` domain entity/source schemas provide reusable fields. Extract focused operation modules without domain→api/http initialization cycles; api/tool-proposals has no domain import.
- `packages/contracts/src/api/tool-proposals.ts` copy/import request shapes and reviewed fingerprint/preview payloads must remain strictly typed.
- `packages/core/src/changesets/changeset.ts:3` require createdAt (remove default Date); `packages/core/src/index.ts` exports; add focused registry/snapshot/resolution modules under changesets.
- `packages/core/src/proposals/{proposal-builders,ai-proposals,release-slice}.ts` all current generators; ai-proposals uses unknown patch/context helpers which need typed replacements. `proposals/proposals.test.ts` existing exact-output tests.
- `packages/core/src/story-map/hierarchy.ts` allowed levels and pure hierarchy validation; current title tie-breaking reindex differs from DB and cannot directly implement parity.
- Read-only behavior baselines: `packages/db/src/repositories/cards-repository.ts:28/74/153`, structural helpers in cards repository/structure modules: creation position counts all siblings; story moves set requested position then reindex all levels by position/createdAt at old/new parents; non-story moves clamp among same-level siblings. Sibling Card positional changes do not bump their versions; moved Card bumps once.
- `packages/db/src/repositories/releases-repository.ts:27/49/74` create defaults to lane count; update position rejects index beyond other-lane count, reindexes lanes and bumps changed roots once.
- `packages/db/src/repositories/{projects,customizations}-repository.ts` Map/Persona creation and updates supply authoritative defaults and ownership.
- `packages/db/src/repositories/{sources,source-evidence}-repository.ts` chunk/note/GitHub no-op identities, Card provenance; direct GitHub unlink deletes canonical identity and affects attached Cards. Snapshot must contain typed GitHub evidence/identities to represent these effects.
- `packages/db/src/repositories/external-refs-repository.ts` map scope for Card/Release, map-or-Project Persona scope, unique binding and no-op semantics; baseline creation does not bump owner.
- `packages/db/src/repositories/changesets-repository.ts:74` existing seven-pair whitelist and executor retained; migrate shape consumption without expanding executor behavior. `tool-proposals-repository.ts` emits typed copy/import and supplies createdAt from application layer.
- `packages/db/src/fixtures/archive-demo.ts`, DB/server tests construct operations; update fixtures coherently. `apps/server/src/application/changeset/changeset.use-cases.ts` slice proposal needs explicit supplied time.
- `apps/server/src/mcp/tools/project-scopes.ts:109/162` scans operation ownership/dependencies; migrate selector handling without weakening persisted-first security. `apps/web/src/features/ai-mcp/AiMcpPanel.tsx` operation display consumes after; update if shape changes.
- Existing parity evidence: DB root-versions.test.ts, storymapper-repository.test.ts, external-refs-repository.test.ts and provenance tests; server complete-surface.test.ts historical/foreign scope tests must retain security intent. Archive/restore validation includes typed ChangeSets via snapshots.

## Tasks & Acceptance

**Execution:**
- [x] Contracts domain/operation modules and exports: strict pair catalog, selectors, ids, typed metadata/payloads and retained tool proposals.
- [x] Core changesets modules: typed snapshot/resolved changes and catalog, one describe/resolve pair per core member; injected time/id supply, immutable sequential fold, indexed errors and ownership.
- [x] Core hierarchy/position helpers and registry: parity semantics, scoped external upsert/no-op/conflict/unarchive, source evidence effects and dependency/deselection closure.
- [x] Core proposal modules and changeset helper, DB tool producers/fixture and server consumers: migrate typed operations, timestamps and ownership scanning; retain existing proposal-only/application behavior.
- [x] Contracts/core golden tests plus affected DB/server tests: every catalog member, deterministic purity, all matrix rows, hierarchy/position baseline, selectors and external identity scopes. Update fixtures without weakening assertions.

**Acceptance Criteria:**
- Given each core catalog member, when schema/catalog/golden tests run, then every member has exactly one pure describe/resolve pair, typed fields/owner/dependencies/errors, no unknown payload and no unsupported pair acceptance.
- Given unchanged input snapshot, supplied time/ids and selected operations, when simulated twice, then outputs match and inputs stay unchanged; no core ambient clock/random/node use remains.
- Given current proposal consumers, when existing temporary SQLite and HTTP/MCP regression suites run, then supported proposals still persist/apply through the current executor and actual dependent ownership remains enforced.
- Given selection/deselection and sequential simulation, when golden tests cover the matrix, then every matrix outcome is tested and passing; copy/import pending pure coverage is explicitly classified for4.5.

## Spec Change Log

- 2026-10-11: Investigation fixes the exact4.4 catalog using4.5's explicit lifecycle/reorder/deletion ownership. Release update.position retains existing movement; no new explicit reorder operation. Persistence is the golden positioning baseline because existing core title tie-breaking differs. Complete copy/import resolution and source import remain4.5, as required by preparation; their payloads become typed now.

## Review Triage Log

### Independent completion reviews — 2026-10-11

- B1 `[medium] [patch]`: Card create accepts priority/businessValue/effort/estimate/color, but actual createCard constructs only the current creation fields. Restrict create payload to supported fields; retain richer upsert publications separately.
- B2 `[medium] [patch]`: Release create accepts released, but actual creation always persists false. Reject that unsupported creation field; retain it for updates/upserts.
- B3 `[medium] [patch]`: Map create accepts defaultConnectionId, but existing creation ignores it. Reject unsupported creation input; retain validated Map update.
- B4 `[medium] [patch]`: static Persona addresses omit map ownership while runtime personaOwner reads the map. Track map-scoped Persona dependencies.
- B5 `[medium] [patch]`: canonical GitHub deletion overwrites attached Card dependency roots without reading their prior writes. Read each affected owner before registering implicit writes.
- B6 `[medium] [patch]`: undefined-valued patch keys pass nonempty and Object.assign can erase required fields. Normalize away undefined optional patch values before effective-nonempty validation.
- B7 `[medium] [patch]`: externalRef selector is accepted for StoryMap despite no Map ExternalRef entity type. Restrict Map selectors to id/local.
- B8 `[medium] [patch]`: accepted Product Context/template metadata lacks pure ownership validation. Validate builtin template IDs using the canonical shared enum; supply typed Product Context ownership records in the resolver snapshot and validate actual Project/map ownership. This adds ownership input, not remaining-object operation handlers.
- B9 `[false] [reject]`: independent default-position creations must not necessarily be deselected with earlier siblings. They have no local/same-target/descendant reference; selected operations are re-simulated and valid positions recomputed. Add an assertion of this intended independent-creation behavior rather than inventing a dependency.
- B10 `[medium] [patch]`: selector cases for Map/Release/Persona lack direct assertions. Add effective-selector, persisted-first/foreign ownership and dependency cases for those distinct owner paths.
- E1 `[medium] [patch]`: independently confirmed Persona map ownership mismatch; same correction as B4 with runtime/selection parity test.
- E2 `[medium] [patch]`: independently confirmed unsupported Card creation fields; same correction as B1 with boundary rejection tests.
- E3 `[medium] [patch]`: independently confirmed released creation mismatch; same correction as B2 with strict create contract.
- G1 `[medium] [patch]`: note/GitHub/nested literal-chunk application and prepared-import rollback bypass the retained executor in current tests. Add approved ChangeSet application and atomic rollback assertions.
- G2 `[medium] [patch]`: Map connection ownership needs pure valid/unknown/foreign and unchanged-input assertions. Cover Map update and strict rejection on creation.
- G3 `[medium] [patch]`: independently confirmed Persona dependency mismatch through test/source tracing; same correction as B4.

### 2026-10-11 — Review pass
- verdicts: 22 findings — high 2, medium 14, low 2, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: excluded invalid operations execute before selection — Verified resolveOperations calls full simulate first; determine dependencies before resolving only retained operations.
  - `[medium]` `[patch]` Blind: existing-target upsert alias is absent — Verified simulate registers only changes with no before; bind the resolved existing entity too.
  - `[medium]` `[patch]` Blind: Release sibling dependencies are absent — Verified both reorder paths read lanes without readDependency; track actual sibling reads.
  - `[medium]` `[patch]` Blind: redundant entityId hides explicit selectors — Verified MCP scans entityId plus selector; scope only effective target while retaining payload dependencies.
  - `[high]` `[patch]` Blind: local selector stale baseline checks wrong Card — Verified conflict loop ignores local selector while apply selects localId; share effective target resolution and test rollback.
  - `[medium]` `[patch]` Blind: selectors accepted on members which ignore them — Verified operationBase gives create/link/unlink optional selectors; reject undefined-meaning selector fields.
  - `[low]` `[reject]` Blind: ambiguous external bindings can be selected by find — Two exact SQLite unique constraints prevent this state in repository-produced snapshots. No actual caller producing duplicated valid bindings is demonstrated; additional corruption guards are not an everyday-use correction.
  - `[low]` `[reject]` Blind: injected allocated ids can violate UUID format — Allocation supply is an internal application contract, not user operation input; application supplies UUIDs. Adding guards for forged internal supplies is not an everyday-use correction in this milestone.
  - `[medium]` `[patch]` Blind: unchanged operations have no addressed owners — Verified owners derive only from changes; retain validated target owner and use it in same-target dependency tracking.
  - `[medium]` `[patch]` Blind: no direct resolver/repository parity tests — Golden expectations run in isolation; add focused real SQLite parity for positioning, sources and root versions.
  - `[medium]` `[patch]` Verification: Map and Persona update effects unasserted — Filed gap evidence establishes determinism assertions survive dropped payloads; add independent field/version/owner/before-after expectations.
  - `[medium]` `[patch]` Verification: Release upsert lane movement untested — Filed gap evidence establishes existing move golden calls different update handler; test existing upsert lane positions/displaced roots/assignments/bounds.
  - `[high]` `[patch]` Edge: persisted local selector bypasses stale baseline — Same verified preflight/apply mismatch as Blind baseline finding; fix same effective target path.
  - `[medium]` `[patch]` Edge: ignored entityId blocks explicit selector — Same verified MCP scope defect; scope effective target.
  - `[medium]` `[patch]` Edge: unselected invalid operation prevents valid work — Same verified full-simulate-before-selection defect; compute dependencies without excluded effects.
  - `[medium]` `[patch]` Edge: raw IDs differ from normalized schema IDs — Verified duplicate checks and alias registration use raw operations while resolveNext trims; normalize once before identity handling.
  - `[medium]` `[patch]` Edge: sequential versions differ from persisted UoW — Source root-versions.ts bumps existing roots once and preserves created roots; core increments each op. Match actual transaction boundary with real SQLite regression evidence.
  - `[false]` `[reject]` Intent: registry versus application capability — Approved Epic4 preparation explicitly places executor integration in4.6 and routing in4.7;4.4 is pure typed registry. No missed4.4 transport executor requirement.
  - `[false]` `[reject]` Intent: returned preview versus visible UI — Approved sequence places board preview rendering in4.9. This change fulfills library preview data, as4.4 requires.
  - `[medium]` `[patch]` Intent: parity checked separately rather than shared execution — True missing direct parity evidence, also filed by Blind; add scoped real SQLite comparison without integrating executor early.
  - `[false]` `[reject]` Intent: expanded registry catalog not all executed by current producers — Approved4.4 catalog is an implementation prerequisite; current producers need typed migration, not premature new application commands.
  - `[false]` `[reject]` Intent: final diff alone cannot prove workflow/sprint ownership — Read-only hash evidence and tool execution prove skill invoked once and sprint unchanged; no status row is used as verification. Reviewer correctly states a diff limitation, not an implementation defect.


## Design Notes

Use existing domain field schemas rather than importing API modules into domain (API already imports domain). Concrete exported names/file splits are implementation choices. Snapshot must represent Project ownership and cross-Card GitHub evidence, not just one map's visible Cards. Stable ids are scoped to operations/local creations, distinct from allocated entity ids. Reject malformed public operations before resolution. Preserve explicit no-op results so4.6 can skip version/history/Activity writes.

## Verification

Use Node24 with PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH for every command.

**Commands:**
- `corepack pnpm --filter @storymapper/contracts test` — strict catalog regressions pass.
- `corepack pnpm --filter @storymapper/core test` — golden/purity/dependency matrix passes.
- `corepack pnpm --filter @storymapper/db test` — current executor, provenance, versions, archive and scope fixtures pass.
- `corepack pnpm --filter @storymapper/server test` — HTTP/MCP ownership and proposal regressions pass; run performance serially if separate script.
- `corepack pnpm --filter @storymapper/web test` — operation display regressions pass.
- `corepack pnpm typecheck` — entire workspace typechecks after contract migration.
- `node scripts/verify.mjs` — source/git hygiene, capability parity, typecheck/build pass.
- `git diff --check` — no whitespace errors.

## Approved completion plan — 2026-10-11

Complete the existing implementation while preserving concurrent changes. Register creation-local aliases for existing and unchanged upserts, with dependencies on that upsert and persisted identity precedence. Normalize and validate operations before checking duplicate operation/local ids. Track later same-target work and descendant work, including unchanged upserts, for transitive deselection.

Core, the retained executor and MCP must inspect the effective selector target consistently. An explicit selector takes precedence over an unused entityId. Preserve validation of actual target/parent/release/source ownership and foreign Projects; retain the executor's supported-pair whitelist and explicit refusal of external-reference execution pending Story4.6.

Add genuine SQLite-versus-resolver parity tests for creation, mixed/archived siblings, Card moves and Release ordering/version effects. Add Core/DB/MCP regressions for selectors, alias collisions, existing/new/no-op upserts with subsequent local refs, indexed normalized-ID errors and transitive deselection. Audit every existing matrix scenario and fill only missing behavior/assertions. Run focused tests during implementation; then three independent reviews and the full Contracts/Core/DB/Server/Web suites, workspace typecheck, capability parity and release verify.

Preserve orchestrator-owned sprint-status.yaml and deferred-work.md without writing, staging or reverting either. Do not stage changes, commit or push. No new dependencies, Story4.5/4.6 executor integration or preview UI. Keep spec in-progress until all acceptance and independent review/final gates pass. Report verification and any remaining risks to the parent.

Completion parity decision: fully tied Card position/createdAt values are reachable and must remain covered. OperationSnapshot.cards supplies persisted insertion order as its stable tie-order input; simulation preserves it while positions change. Obtain this order in the DB snapshot read rather than changing repository positioning semantics or weakening the fixture.

## Completion implementation evidence

Upsert aliases include existing/unchanged targets; operation normalization precedes duplicate checks and selection IDs are normalized. MCP scopes and retained executor conflicts use the explicit effective selector. Core versions coalesce per SQLite UnitOfWork. Snapshot Card order is read in persisted insertion order, preserving fully tied Card ordering. Shared pure placement helpers model exact sibling writes for both runtime and selection closure; canonical GitHub deletion tracks all evidence owners and subsequent identity reads.

Matrix coverage: strict catalog/schema tests; deterministic catalog and injected-supply assertions; indexed scope/alias/hierarchy errors; genuine SQLite creation and tied/hidden sibling movement; Release movement and repeated-UoW root versions; source repeat/unlink/shared canonical effects; scoped upsert no-op/conflict/unarchive; selected/excluded invalid work and transitive local/same-target/descendant/implicit-sibling closure. Focused Contracts96/Core112, DB9/MCP22 and workspace typecheck passed before the final sibling patch; afterward 60 affected Core tests and Core typecheck passed. Full final gates and independent-review triage follow.

Review correction decisions: create payloads use actual retained creation fields; richer upsert publication fields remain supported through separate typed publication payloads. Metadata builtin template IDs share the existing request enum, and Product Context ownership is supplied explicitly in OperationSnapshot; no compatibility fallback or remaining-object handlers. Null SQL representations of absent optional Card fields are normalized only by parity comparison, never by weakening required parent/release/version/position assertions.

## Final acceptance and handoff — 2026-10-11

All approved completion work is finished. Three independent completion reviews (adversarial, edge cases, verification gaps) produced 16 individually triaged findings: 15 patched, one rejected with an intended-behavior regression. No completion finding remains open or deferred. Earlier review evidence above remains historical.

Final Node24 gates: Contracts107, Core126, DB291, Web194, Server399 plus isolated Performance5 — **1,122 tests passed**. Full `node scripts/verify.mjs` passed Git/source hygiene, workspace typecheck, generated115-capability parity and every workspace build. `git diff --check` passed. Existing Rollup annotation/bundle-size advisories and JSDOM requestSubmit diagnostic do not fail these gates. Test logs: `/private/tmp/storymapper-4-4-{contracts,core,db,web,server}-final.log`; release log: `/private/tmp/storymapper-4-4-verify-final.log`.

The competing Story4.4 CLI worker PID18194 and its bmad-loop controller PID63137 were identified and terminated under explicit user authorization; worker descendants were stopped and absence confirmed. All concurrent source contributions were retained and incorporated before final tests.54 source/test fingerprints remained unchanged during the closing gates. Final full-range review artifact: `/private/tmp/storymapper-4-4-completion-review.diff`.

HEAD remains2152a5849802188ce327dd481364774200804200. Sprint/deferred tracking hashes remain5096d707776f8a14b57955151716c244d12f3672 andc5de374ebe5c1bbf9ed9a8e809ebe90497a3941f respectively. No staging, commit, push, dependency addition, Story4.5/4.6 executor integration or new preview UI. The retained executor's unsupported operation/selector refusals remain explicit. Next work requires authorization for a subsequent story; orchestration tracking belongs to the orchestrator.

## User-authorized commit and loop continuation — 2026-10-11

The subsequent user request authorizes committing the completed state and preparing smooth continuation. Implementation commit: `e94a2c0`. The complete loop-configured workspace test command passes1,208 tests (Scripts79,Contracts107,Core126,Importers7,DB291,Web194,Server399+Performance5). Git-based disposable fixtures initially omitted untracked creation files; the final full rerun after committing those files passes unchanged assertions. Log: `/private/tmp/storymapper-epic4-resume-workspace-test-final.log`.

The old run was stopped through the orchestrator CLI. Its own locked, non-regressing status writer reconciled only Story4.4 from backlog to done; deferred-work remains unchanged. The final dry-run selects exactly nine remaining stories4.5–4.13, all with prepared detail plans. Node24, authenticated Codex/Claude, current Codex hook trust and detached tmux wrapper pass. The user explicitly approved completing local unattended Claude review flags. A fresh durable Epic4 run is prepared; no new implementation session or push was launched.
