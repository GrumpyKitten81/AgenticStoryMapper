---
epic: 4
status: ready
date: 2026-10-10
version: 2
---

# Epic 4 Preparation: Agents cut and publish, humans review

Reproducing statement: Prepare Epic 4's cross-story implementation contract and all 13 detail plans from the reconciled epics, architecture, UX, accepted ADRs and current source. Preserve orchestrator tracking; generate no runnable specs or application implementation.

## Goal

Let Agents publish and refresh an entire planning cut through one reviewable ChangeSet, with stable source evidence and external identities, server preview, atomic local application, restore points and delivery updates. Humans control protection and approval permissions. BMad supplies content through generic tools. Readiness here means the plans are complete for developer investigation, not that implementation or acceptance has passed.

## Story sequence

| Order | Story and detail plan | Depends on | Deliverable |
| --- | --- | --- | --- |
| 1 | [4.1 Import](story-plan-4-1-import-markdown-and-txt-sources-with-stable-chunks.md) | Epic 3 use cases/UoW | Immutable, deduplicated Markdown/TXT documents and deterministic chunks |
| 2 | [4.2 Provenance](story-plan-4-2-provenance-on-every-card.md) | 4.1 | Typed evidence and honest creation origin |
| 3 | [4.3 References](story-plan-4-3-external-references-on-cards-releases-and-personas.md) | Epic 3 versions | Scoped external identities and sync baselines |
| 4 | [4.4 Core registry](story-plan-4-4-operation-registry-for-the-core-objects.md) | 4.1–4.3 | Typed operations and pure sequential resolution |
| 5 | [4.5 Remaining registry](story-plan-4-5-operation-registry-for-the-remaining-objects.md) | 4.4 | Complete current domain catalog and schema staleness |
| 6 | [4.6 Executor](story-plan-4-6-changeset-executor.md) | 4.5; Epic 3 restore/audit/versions | Write-gated atomic apply and accepted approval policy |
| 7 | [4.7 Routing](story-plan-4-7-writing-agent-tools-run-through-changesets.md) | 4.6 | All non-human domain writes use the executor |
| 8 | [4.8 Submission](story-plan-4-8-an-agent-submits-its-own-changeset.md) | 4.7 | One generic whole-cut submission |
| 9 | [4.9 Preview](story-plan-4-9-preview-a-changeset-on-the-board.md) | 4.8; Epic 3 live updates | Tree/Planning server preview and review controls |
| 10 | [4.10 Slicing/notes](story-plan-4-10-slicing-proposals-and-release-notes.md) | 4.7 | Deterministic proposals and read-only notes |
| 11 | [4.11 Delivery](story-plan-4-11-delivery-status-from-agents.md) | 4.7 | Atomic scoped status batches |
| 12 | [4.12 BMad](story-plan-4-12-the-bmad-round-trip.md) | 4.1–4.3, 4.8–4.11 | Generic recipe and repeat-publication acceptance |
| 13 | [4.13 Validation](story-plan-4-13-validation-gate-with-five-bmad-users.md) | Epics 1–3 and 4.1–4.12 | Five actual-browser simulations and measured gate |

Dependency edges permit 4.10/4.11 after 4.7, but the unattended wave may execute the numbered sequence. The 4.13 historical title/key remains unchanged. Epic 3 prerequisite claims must be verified in source/tests; sprint rows are not evidence.

## Shared design decisions

### Boundaries and source of truth

Contracts own all API/MCP/UI shapes. Core owns pure operation description, resolution, hierarchy and position semantics. Database repositories persist resolved changes and own all SQL. Application use cases require actual `ActorContext`; transport adapters only validate, resolve identity and invoke them. No provider, SaaS dependency, telemetry or host-file access in core is introduced.

Current anchors: `packages/contracts/src/schemas/domain.ts` has untyped `before/after/context`; `packages/db/src/repositories/changesets-repository.ts` has five ordinary operation handlers plus map-copy/board-import handlers. `apps/server/src/application/changeset/changeset.use-cases.ts` supplies approval/apply/proposal orchestration. `packages/db/src/unit-of-work.ts` requires synchronous callbacks and rejects nested actor changes. These are verified baselines, not target APIs.

### Shared operation and response shapes

- A stable operation id identifies selection, dependencies, errors and Activity; array index is also returned for invalid/conflicting input. Typed `(op, entity)` members specify selector, payload, sources/rationale, versioned owner and supported failure cases. Unsupported pairs fail validation. Do not add a permissive catch-all member.
- Selectors address persisted ids, scoped external references or unique ChangeSet-local ids. Local references point only backward. Resolve persisted ownership first; alias collisions cannot exempt literal Project/map/chunk ids or any existing entity from authorization.
- Source Links may address a persisted chunk id or an explicitly typed local source-import reference plus locator. The latter selects a chunk derived by an earlier source-import operation in the same ChangeSet, using 4.1's deterministic locators. It never reinterprets a literal chunk id as an alias. Resolve/preview expose prepared chunks without inserting source rows; deselecting the import deselects its dependent links. This allows protected initial publication as one proposal, including source imports, with no prerequisite domain writes.
- The core registry exposes one `describe(snapshot, operation)` and one `resolve(snapshot, operation)` pair per member. Resolution yields typed entity changes and dependencies; application supplies time/ids and database state. Preview folds selected resolutions over simulated state in array order, and apply reruns resolution inside the transaction.
- Preview results expose operation id/index, kind, status, dependencies, labelled before/after and resulting state. Created Cards use `NEW-n`; real Card Keys come from the monotonic map counter at apply. External-reference upserts show “may change” and implicit unarchive.
- Submission/command results identify the ChangeSet, proposed/applied outcome and preview reference. Protected commands and `apply=false` persist a proposal only. Existing tool response consumers must be updated together with shared schemas; no compatibility fallback is planned.
- One `ConflictReport` carries version/sync conflicts, actual targets and all offending operation ids/indexes. `stale` means incompatible operation schema; `conflict` means current state disagrees with the reviewed baseline. Neither silently skips work.

The concrete exported names/file splits are refined in dev step 02. The semantics above are fixed; no second client schema or preview engine is allowed.

### Catalog ownership

| Family | Typed coverage | Owner/version boundary |
| --- | --- | --- |
| Core (4.4) | Story Map, Card, Release, Persona commands; Source Link link/unlink; scoped external-reference upsert | Existing root version; Source Link belongs to Card |
| Remaining (4.5) | Roadmap/column/swimlane/card/reference, Annotation, Workflow Status, Story Template, Product Context, attachment, park/unpark, archive/unarchive, reference set/unset, reorder, delete child strategy, bulk status | Roadmap children → Roadmap; Product Context → map when scoped; Card children/links → Card; customization lists intentionally last-write-wins |
| Existing omitted effects (4.5) | Source Document import with derived chunks; Card-Persona/Card-Annotation links; map-copy/board-import domain effects | Use current manifest and aggregate register; preserve actual ownership/fingerprints |
| Explicit exceptions | Human Project/settings/credentials/AI-template administration; ChangeSet propose/approve/reject/apply lifecycle; restore/archive lifecycle; confirmed remote push; audit/sync bookkeeping | Named descriptor classification; lifecycle never recursively proposes itself |

Story 4.4 records the exact supported pair catalog; 4.5 extends it against every current descriptor and requires an empty unexplained-gap list. New Card dependency operations remain in Story 5.1. GitHub identity storage migration remains in Epic 7. Exceptions do not authorize direct non-human Card/domain writes.

### Sources and external identities

Import deduplicates `(Project, supported type, content hash)` inside the write gate. One immutable document identity is reused on unchanged import; deterministic chunk ids derive from document id and locator. Different Projects cannot share document/chunk identities. Changed input creates a new document and keeps old evidence. Markdown locators carry heading paths and stable block indices; headings inside fences are content. MCP remains inline-only; human file preparation precedes SQLite.

Provenance stores typed chunk, existing structured GitHub evidence or nonblank free-text note. Record creation origin independently from effective `linked/manual/inference` display; absent historical evidence displays “Origin not recorded”. Removing the last link uses creation evidence, never the unlinking actor. Preserve source visibility rules and root version/history semantics.

`external_refs` uses the two unique constraints in Story 4.3, real map/Project scope and case-sensitive trimmed ids; `github` is reserved to the adapter. Identical binding is unchanged, conflicting binding is refused. Deletion removes refs atomically; archive retains them. A new reference's `synced_version` captures the resulting entity version in its creation transaction, including any version bump owned by that binding. Later application advances only the addressed system. No-op repeat publication must not bump versions or reset baselines to hide human edits.

### Approval and execution

New command ChangeSets default `apply=true` and can apply without approval when protection is off; stored proposals require explicit approval. Proposal generators always propose. Proposal creation and domain apply are separate audited actions even in one request. Disabled Agent/GitHub access still refuses.

`allowAgentApproval` defaults false and is human-controlled. The local human may approve its own UI proposal. Enabled, admitted Agents may approve their own/others' proposals even under protection, without applying domain rows or taking a snapshot. Record actual proposing/approving actor type/id/host/session, not payload claims. Approval validates actual ownership, access and current flag inside its transaction. Turning the flag off blocks new approvals and retains earlier approvals. Agent apply requires current access and protection off; human apply can proceed under protection. Rejection, settings and restore remain human-only. See accepted [ADR 0004](../../docs/adr/0004-optional-agent-changeset-approval.md).

Approval binds immutable operations and selected operation ids after transitive dependency closure. Changed operations/selection require fresh approval. A stale preview cannot silently advance the submitted baseline. Rejected proposals retain the established ability to be re-approved; applied and restore-undone proposals cannot replay.

The applying write gate validates selection/state/policy, takes one pre-apply snapshot outside SQLite, then runs one synchronous local transaction. This snapshot also satisfies first-session-apply requirements. Empty selections produce no domain changes or snapshot. Existing roots compare once to transaction-start versions; collect every conflicting selected operation. Newly created roots have no persisted baseline. Invalid/conflicting work aborts the whole batch; record conflict/rejection evidence after rollback without partial domain effects.

Domain rows, root versions, Card history, per-operation Activity, `changeset.applied` and successful mutation audit commit together; live events publish only after commit. Preserve ADR 0002: every accepted Card save increments the concurrency counter; same-actor history coalescing may leave gaps. Do not count a no-op publication as a save. Avoid duplicate Activity/audit rows from repository/executor/transport layering.

The existing synchronous MCP audit wrapper may open a UoW before invoking the handler. Executor integration must move snapshot orchestration outside that transaction while retaining exactly one durable tool-call audit row and atomic successful apply audit. Do not run `VACUUM INTO` inside the wrapper transaction or async file/provider work inside UoW.

### Files, remote effects and schema

Prepare/validate files before the applying SQLite transaction. Preparation failure changes no domain data; SQLite/audit failure leaves no visible document/attachment links. Report retained prepared-file effects explicitly. Remote effects remain outside the operation array; GitHub import/pull's local half goes through the executor, with original Agent initiator retained for protection checks. Remote push keeps its human-confirmed Dry Run. Recheck permissions and runtime/database identity after provider awaits. See accepted [ADR 0003](../../docs/adr/0003-changeset-file-and-remote-effect-boundary.md).

ChangeSets carry `operationsSchemaVersion`. Incompatible pending rows, including approved rows, become `stale`; applied history remains readable and never executable through a compatibility adapter. Resubmission uses current typed schemas and fresh approval. Update schema/classification/archive/restore parsers together. The checkout currently uses development bootstrap DDL in `packages/db/src/connection.ts`; apply AD-9's pre-tag development schema policy and implement the required versioned operation-data transition explicitly. Do not claim a tagged migration journal exists or create prototype-database compatibility. After the release baseline, use generated/custom Drizzle migrations as AD-9 requires.

## Interfaces between stories

1. 4.1 exposes stable locators, immutable document/chunk results and an unchanged outcome; 4.2 builds evidence on them.
2. 4.2 exposes typed provenance/creation evidence; 4.3 exposes scoped identity reads/writes and baseline lookup. 4.4 consumes both without duplicating contracts.
3. 4.4 supplies the catalog, sequential resolver and dependency closure; 4.5 adds current domain members/schema versioning. Existing persistence remains operational until 4.6 replaces it.
4. 4.6 supplies preview resolution, immutable selection/approval and write-gated executor plus persistence primitives. It removes duplicate hierarchy/position semantics only after golden/integration coverage proves parity.
5. 4.7 makes routing universal on both Agent surfaces and the local GitHub/import halves. Until then, the known direct Agent-write gap remains staged and must not be reported closed.
6. 4.8 exposes generic submission; 4.9 renders server previews, approval/apply and live invalidation. 4.10/4.11 consume the same command/proposal engine without bespoke apply paths.
7. 4.12 uses only manifested tools and stable generic refs; 4.13 exercises the delivered workflow in disposable Projects through browser controls.

## Non-goals (epic)

No DOCX/PDF/XLSX/image import, product BMad parser, new slicing strategy engine, provider integration, dependency/drift/Slices/Graph view, GitHub identity migration, inverse-operation undo, new cleanup daemon/retries, local-process security boundary, real-user recruitment or inference of product demand from simulations. Preparation does not launch the loop, create specs, change application code or edit sprint/deferred ledgers.

## Verification strategy

Use contracts schema tests, core golden/purity/dependency tests, real temporary SQLite UoW/restore/archive tests, server HTTP plus real `/mcp` and `/api/mcp/call` acceptance, mounted web tests and actual browser evidence where required. Read implementation and relevant tests before finalizing each dev spec. Force operation/audit failures, source/owner drift, repeated-root conflicts, schema staleness, alias collisions, flag changes and restore-in-flight behavior. Verify durable actor/session and post-commit event evidence, not handler source alone.

Keep performance measurements serial: on the 1,000-Card fixture, 200-operation apply includes snapshot/history/audit with 2-second nominal and 2x CI tolerance; server preview has its separate 500 ms bound; 100-status call has its separate 2-second bound. Preserve failed measurements. Audit relative overhead remains diagnostic under the accepted Story 3.8 policy. Run relevant package tests and typecheck/build/release verification during implementation; no runtime test success is claimed by this preparation.

Sources: [epics](../planning-artifacts/epics.md), [architecture](../planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md), [readiness audit](../planning-artifacts/epic-4-readiness-2026-10-10.md), [compiled context](epic-4-context.md), [DESIGN](../planning-artifacts/ux-designs/ux-StoryMapper-2026-09-29/DESIGN.md), [EXPERIENCE](../planning-artifacts/ux-designs/ux-StoryMapper-2026-09-29/EXPERIENCE.md). Requested graph tools are unavailable; scope was anchored through the file index and focused source/test reads.

## Open questions

None. Developer step 02 must verify changing source/prerequisites and refine exported names, file splits and exact catalog members without changing these accepted semantics.

## Preparation consistency pass

All 13 plans were checked against the current Epic 4 acceptance blocks, shared policy and the dev loader's one-file-per-story rule. Exact slugs, frontmatter/required sections, links, dependency order and acceptance coverage passed. The pass clarified local source-import chunk selectors for one protected whole-cut proposal, explicit proposal-only generic slices and the resulting-version reference baseline; corrected current source-map paths. No runtime tests, browser scenarios or performance measurements were executed by preparation. Sprint/deferred tracking and application source remain unchanged.

## Changelog

- Version 1 (2026-10-10): Initial coherent Epic 4 contract and dependency graph, preserving accepted policy and measured acceptance boundaries.
- Version 2 (2026-10-10): Completed 13-plan consistency pass; aligned protected source/link publication, reference baseline and proposal-only slice behavior.
