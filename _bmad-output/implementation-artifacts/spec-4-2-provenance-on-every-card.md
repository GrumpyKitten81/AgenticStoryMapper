---
title: Provenance on every Card
type: feature
created: 2026-10-11
version: 2
status: done
baseline_revision: 9784b7a843a6641dff2cc8670693de17e43ebd59
baseline_commit: 9784b7a843a6641dff2cc8670693de17e43ebd59
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/Projects/StoryMapper/AGENTS.md
  - [REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md
warnings: [oversized]
deferred:
  - summary: >-
      GitHub issue URLs are not scheme-restricted and are rendered as anchor hrefs.
    evidence: |-
      github_links.url is validated only with URL.canParse and Card detail renders it with href; the same pattern existed at baseline in the linked GitHub rows.
    location: >-
      packages/contracts/src/api/http.ts:483, apps/web/src/features/story-map/components/CardDetailModal.tsx:358
    severity: low
---

Reproducing statement: Implement Story 4.2 from the Epic 4 preparation and detail plan, preserving orchestrator-owned sprint-status.yaml without writing, staging or reverting it. Date: 2026-10-11. Version: 2. Changelog: implementation, independent completion-review repairs and final full-suite verification complete.

<intent-contract>

## Intent

**Problem:** Cards cannot consistently explain their origin: chunk evidence and GitHub identities are separate, free-text notes are missing, and creation labels do not prove historical authorship.

**Approach:** Record immutable creation origin separately from effective provenance and expose typed chunk/GitHub/note evidence. Render actionable origin details and accessible inference/unknown labels in Card detail.

## Boundaries & Constraints

**Always:** Contracts are the single schema source; DB access stays in repositories, attributed writes in UoW. Preserve Card root version/history/Activity and source visibility. Actual human direct creation is manual; non-human or proposal/import creation is inference; supported evidence makes provenance linked. Last evidence removal restores recorded creation origin independently of the removing actor. Existing structured GitHub identity remains canonical. Historical evidence is retained; historical origin without trustworthy creation evidence is unknown, displayed as “Origin not recorded”. English interface strings live in string modules. Include all creation paths, copies, persistence and archive/history readers. Keep loopback/local-first policy.

**Never:** Never write, stage, revert or treat sprint-status.yaml bookkeeping as verification; preserve unrelated changes. No host-path interpretation of notes, fabricated historical authorship, GitHub identity migration, new provider/network call, universal ChangeSet routing, compatibility adapter, commit or push. Historical source labels/latest editor alone cannot establish origin.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Chunk | Card and same-Project chunk | Typed evidence persists; detail names document and locator; provenance linked | No error |
| GitHub | Card and existing structured same-Project issue identity | Typed evidence uses canonical GitHub issue identity; detail names repo/issue and permits opening URL | No error |
| Note | Nonblank free-text note including path-like text | Trimmed note persists and renders as text; provenance linked; no file access | No error |
| Invalid | Foreign/missing chunk or GitHub issue; blank note | No evidence, Card version/history or partial domain mutation | Typed validation/not-found/ownership refusal |
| Creation | Human direct versus Agent/proposal/import/copy | Unlinked manual versus inference; accessible Inferred label | No error |
| Mixed evidence | Add chunk/GitHub/note then remove all, by another actor | Linked until final removal; returns to immutable manual/inference/unknown | No error |
| Historical | Existing linked/unlinked Card with absent creation evidence | Retain evidence; linked or unknown; never invented manual/inference | No error |
| Persistence | Reopen/copy/archive/history and evidence changes | Evidence/origin survive; truthful snapshots and Card root history/version/Activity | Invalid archives rejected by existing policy |
| Agent visibility | Accessible Card with unavailable source Project | Preserve current chunk filtering; do not leak inaccessible evidence or linked Cards | Existing access refusal/filtering |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts:73,296,328,354,712` — Card, chunk links, history, source detail and snapshot schemas; introduce creationOrigin/provenance and discriminated evidence; keep source-document chunk-only responses typed appropriately.
- `packages/contracts/src/api/http.ts`, `mcp/tool-inputs.ts` — source-link request and delete selectors; union breaks current .extend/.shape.chunkId assumptions; update shared consumers together.
- `packages/db/src/schema/tables.ts`, `connection.ts`, `repositories/row-mappers.ts` — persisted Card origin/effective provenance and typed evidence mapping/bootstrap DDL. Existing historical snapshots lack fields; reconcile explicitly with unknown, not guessed authorship.
- `packages/db/src/repositories/cards-repository.ts:30,219,426` — direct creation, cleanup, history finalization; list/get must return accurate provenance, not only detail.
- `packages/db/src/repositories/sources-repository.ts:118,183,365` — chunk link ownership/history; GitHub CRUD currently lacks Card history; linked-source visibility assumes chunkId.
- `packages/db/src/repositories/{projects-repository,changesets-repository,work-item-repository,tool-proposals-repository,map-copy-repository}.ts` — actual creation paths; map copy bypasses createCard and has table copy registry. Human-approved proposals are still inference; classify templates from actual recorded creation action, not latest editor.
- `apps/server/src/application/card/card.use-cases.ts`, `card/card-children.use-cases.ts`, `github-link/github-link.use-cases.ts` — actual ActorContext and attributed creation/evidence writes. Existing GitHub creation is local structured identity creation, not remote issue push.
- `apps/server/src/http/routes/card-routes.ts`, `mcp/tools/register-card-tools.ts`, `application/project-scopes.ts`, `application/snapshot-source-visibility.ts` — shared validation, identifier ownership and conditional evidence visibility; audit exact affected IDs.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx` — DetailSourceSections chunk controls, separate GitHub display; locator lookup currently only selected document, use snapshot chunks immediately.
- `apps/web/src/app/api.ts`, `apps/web/src/ui-strings/` — typed evidence calls and English labels/errors.
- `packages/db/src/*test.ts`, `apps/server/src/ai-proposal-change-set.test.ts`, `apps/server/src/mcp/tools/{surface,complete-surface}.test.ts`, `apps/web/src/features/story-map/components/card-detail.test.ts` — extend real SQLite, ownership, MCP visibility and mounted detail coverage. Read exact relevant tests before edits.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `mcp/tool-inputs.ts` — define creationOrigin manual/inference/unknown and provenance linked/manual/inference/unknown; typed chunk/GitHub/note evidence and requests/responses; update consumers rather than retain permissive legacy variants.
- [x] `packages/db/src/schema/tables.ts`, `connection.ts`, `repositories/row-mappers.ts`, `cards-repository.ts` — persist truthful origin/effective provenance; historical default unknown unless trustworthy creation record proves more; retain actual evidence. Creation origin cannot change through ordinary Card editing.
- [x] `packages/db/src/repositories/{sources-repository,map-copy-repository,projects-repository,changesets-repository,work-item-repository,tool-proposals-repository}.ts` — cover actual creation/copy/import/proposal paths; add note persistence and typed evidence reads; canonical GitHub evidence contributes automatically; all link/unlink/reassignment/deletion paths update affected Card versions/history/Activity atomically. Include note cleanup/copy and archive/history parser updates where needed.
- [x] `apps/server/src/application/card/`, `application/github-link/`, `http/routes/card-routes.ts`, `mcp/tools/register-card-tools.ts`, `application/{project-scopes,snapshot-source-visibility}.ts` — adapt typed evidence operations, actual ownership and Agent filtering; nonblank notes never enter file preparation. Adapt metadata/generated capability artifacts if wire schema changes require them.
- [x] `apps/web/src/features/story-map/components/CardDetailModal.tsx`, `app/api.ts`, `ui-strings/` — display immediate chunk document/locator, structured GitHub issue and note; add accessible note and existing-GitHub evidence link/unlink controls; Inferred and Origin not recorded words; errors visible, query invalidation consistent with existing detail controls.
- [x] Focused tests in mapped packages — execute every matrix row including mixed final-removal, different remover, actual creation paths, historical missing evidence, root/history/Activity, source filtering and mounted UI controls.

**Acceptance Criteria:**
- Given a Card and valid chunk, existing GitHub Issue or note, when linked through UI and shared use case, then typed evidence persists and opening detail states its origin.
- Given an Agent/proposal-created unlinked Card, when stored and opened, then provenance is inference and the readable Inferred badge appears; human direct creation stores manual.
- Given recorded creation origin, when another actor removes the final evidence, then effective provenance restores that recorded origin.
- Given pre-existing Cards, when schema reconciliation and detail rendering run, then evidence remains and absent trustworthy origin shows Origin not recorded.
- Given the change, when focused package tests and workspace typecheck/build run, then they pass and interface strings come from English string modules.

## Spec Change Log

- Version 2: completed the approved plan, triaged 17 additional independent completion findings (14 patches, 3 rejections), and reran all required gates.

## Implementation Notes

- Resumed the existing in-review implementation against the human-approved plan. Chunk and note evidence share `card_source_links`; historical chunk reconciliation preserves evidence IDs. The unreleased separate-note-table prototype is removed. GitHub identities remain canonical, with Card-owned attachment references rather than duplicated issue records.
- Added real template/sample/import/proposal creation-path assertions, scoped live invalidation for the GitHub issue picker, submitted-note clearing without discarding newer drafts, and latest-action error handling. Preserved independently updated server fixtures after reading their exact source.
- Initial DB verification failed because the sandbox denied the tsx IPC socket before the crash fixture ran. The unchanged crash test passes outside the sandbox. Initial server verification exposed outdated raw fixture inserts and an inventory key; corrected fixtures now pass the focused 66-test suite.

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 16 findings — high 1, medium 9, low 2, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: direct GitHub Unlink also deletes shared references — Canonical delete cascades card_github_evidence. Existing destructive control will explicitly name the broader effect; identity semantics stay canonical.
  - `[medium]` `[patch]` Blind: copied release-owned GitHub evidence points to original Release — storyMapCopyRows filters GitHub rows only by Card ids; include owned Release ids in that same collection/remapping.
  - `[medium]` `[patch]` Blind: issue picker excludes other maps in the same Project — DetailSourceSections receives only snapshot.githubLinks; reuse existing map/GitHub reads to populate the existing selector.
  - `[false]` `[reject]` Blind: removed milestone stays stale due new omitted field — Prior Drizzle update used milestone undefined; Drizzle also skips undefined values. No new milestone-clearing regression was introduced.
  - `[high]` `[patch]` Blind: copied Map Activity leaks nested GitHub payloads into redacted archive — copyStoryMap logs getStoryMapSnapshot and redaction only handles sourceLink top-level payloads; scrub nested identity/evidence arrays, preserving business data.
  - `[false]` `[reject]` Blind: Card history must snapshot every evidence record — Story4.2 requires existing Card root/history/Activity rules. Card versions retain provenance, while attributed sourceLink/GitHub Activity preserves actual evidence changes; prior owned-link history likewise stores Card fields only.
  - `[medium]` `[patch]` Blind: GitHub evidence reader performs global quadratic attachment scans — Each identity iterates all attachment rows. Scope queries to requested Cards and index/join references without changing response shape.
  - `[medium]` `[patch]` Blind: sync bookkeeping versions unrelated Cards — updateGitHubLink unconditionally finalizes all evidence owners even for syncState/milestone-only changes; compare evidence-relevant identity/ownership fields.
  - `[medium]` `[patch]` Blind: archive accepts inconsistent effective provenance — Archive hierarchy validation validates Card shape but not effective provenance versus surviving chunk/note evidence. Add consistency validation and invalid archive test.
  - `[medium]` `[patch]` Blind: startup reconciliation rewrites all Cards on reopen — migrate executes unconditional UPDATE cards; limit writes to inconsistent rows and verify unchanged reopen.
  - `[medium]` `[patch]` Edge: attachment cannot unlink after original Map logical deletion — getGitHubLink hides identity whose owner Map is deleted, while raw evidence list still returns attachment; deletion can use already-owned link identity without dereferencing hidden owner.
  - `[low]` `[patch]` Edge: linked historical Card conceals missing creation origin — Effective Linked label alone masks unknown creationOrigin; render existing Origin not recorded wording alongside Linked.
  - `[medium]` `[patch]` Gap: deleting shared identity owner Card lacks provenance regression — Verified gap: tests cover canonical/Release deletion but not deleteCard referencingCards finalization. Add real SQLite/UoW survivor evidence/origin/version/actor assertions.
  - `[false]` `[reject]` Intent: unopened board Cards have no provenance badges — Story4.2 explicitly anchors evidence display at opening Card detail; board scanning is not an unresolved alternative once the referenced story acceptance is read.
  - `[low]` `[reject]` Intent: mounted UI does not exercise continuous browser-to-database flow — Mounted controls plus real repository/HTTP/MCP persistence tests cover specified surfaces. Additional actual-browser integration would add a new test harness; no browser requirement appears in Story4.2.
  - `[false]` `[reject]` Intent: diff alone cannot prove workflow execution or untouched tracking — Renderer ran exactly once and command logs independently verify checks; no sprint-status mutation/revert/stage was issued. The auditor describes a diff-evidence limit, not a defect.

### 2026-10-11 — Independent completion review

- `[medium]` `[patch]` Blind: referenced other-map GitHub identities were absent from copy fingerprints; include canonical evidence and cover reviewed-copy drift plus copied evidence lifecycle.
- `[medium]` `[patch]` Blind: Drizzle omitted the bootstrap attachment uniqueness constraint; declare the same Card/identity uniqueness in both schema representations.
- `[low]` `[reject]` Blind: reverse identity lookups lack a dedicated index; no demonstrated acceptance-bound failure justifies additional indexing in this story.
- `[low]` `[patch]` Blind: chunk/note reads scan unrelated Cards; restrict evidence selection to actual map Card IDs in SQL.
- `[medium]` `[patch]` Blind: redacted copied snapshots retain linked provenance after removing their sole GitHub evidence; recompute embedded provenance from retained evidence.
- `[low]` `[patch]` Blind: successful note submission retains its draft; clear only the submitted draft after success and preserve failures/newer edits.
- `[medium]` `[patch]` Blind: earlier create errors can mask the current unlink error; reset the competing mutation when starting an evidence action.
- `[low]` `[reject]` Blind: project issue selection makes one listing request per map; no workload or violated latency bound was demonstrated, and adding a new read API exceeds the required correction. Reads run only while a Card is selected.
- `[medium]` `[patch]` Blind: mounted evidence failures lack assertions; cover refused note/GitHub creation and unlink with visible latest errors, preserved evidence/drafts and enabled retry controls.
- `[medium]` `[patch]` Blind: other-map canonical identity copy lifecycle lacks coverage; add actual reviewed-copy drift and subsequent edit/delete version/history assertions.
- `[medium]` `[patch]` Edge: updating an identity with attachments in logically deleted Maps dereferences visibility-filtered Cards; join persisted owner rows for Project validation.
- `[medium]` `[patch]` Edge: canonical deletion skips hidden retained Cards; finalize persisted affected Cards and verify atomic history rollback.
- `[false]` `[reject]` Edge: carried milestone-clearing claim; the prior Drizzle update also omitted undefined values. No new milestone-clearing regression was introduced.
- `[medium]` `[patch]` Edge: inventory still expects the removed note-table key; the current source now reflects consolidated persistence and focused HTTP tests pass.
- `[medium]` `[patch]` Gap: Agent snapshot/data/JSON export retained only chunk evidence in tests; add note/GitHub assertions alongside inaccessible chunk filtering.
- `[medium]` `[patch]` Gap: board search over new evidence lacks coverage; mounted note-only and attached-GitHub searches retain the matching Card and exclude unrelated Cards.
- `[medium]` `[patch]` Gap: raw visibility fixtures omit the required discriminator; all three source/audit fixture insertions now specify `kind = chunk` and the focused suites pass.

### 2026-10-11 — Review pass (follow-up)
- verdicts: 38 findings — high 0, medium 6, low 24, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: direct GitHub Unlink deletes the canonical identity behind an id convention — carried: same claim as the first pass row; UI already names the broader effect and the intent keeps canonical identity semantics.
  - `[low]` `[reject]` Blind: notes have no maximum length — no contract string in the codebase carries a max (Card description is unbounded either); a new limit would be unrequested configuration.
  - `[low]` `[defer]` Blind: GitHub `url` has no scheme restriction and is rendered as `href` — the same `github_links.url` validation and `<a href={link.url}>` pattern predate this story (lines 358-359 at baseline); recorded under `deferred`.
  - `[low]` `[reject]` Blind: startup migration scans all `card_versions` each open — the `IS NULL` filter writes only unstamped rows (reopen asserts zero changes); no bound is violated and any fix adds a schema-version gate.
  - `[low]` `[reject]` Blind: redacted archives keep `card_versions` provenance — history rows record the state at that time and name no identity; recomputing needs JSON rewrites over history.
  - `[low]` `[reject]` Blind: aggregate register and ADR missing for `card_github_evidence` — the enforced classification test is the source of truth, the table lives inside the existing Card/Sync aggregates and no cross-module decision changed.
  - `[false]` `[reject]` Blind: map copy duplicates GitHub identities — copied identities are scoped to the target Map (conflict checks are per Map) and the Design Notes require copied evidence; the test asserts new ids.
  - `[low]` `[reject]` Blind: repository re-parses input and mutates arguments — a ZodError is mapped to a validation DomainError in `application/errors.ts`; the reassigned parameter is local.
  - `[low]` `[reject]` Blind: MCP input root is a bare `oneOf` — valid JSON Schema, wrapped with `type: object` by the server, and `cardId` is present in every branch.
  - `[low]` `[reject]` Blind: audit `inputIds` now accepts the key `id` — only entity-shaped UUID values are recorded, which is the desired effect for `DeleteCardSourceLink`; no harm named.
  - `[low]` `[reject]` Blind: remaining full-table scans — local SQLite scale, no violated bound, not introduced by this change alone.
  - `[false]` `[reject]` Blind: note/GitHub evidence bypasses ChangeSet — the intent explicitly excludes universal ChangeSet routing.
  - `[low]` `[reject]` Blind: copied-activity redaction parses payload without guards — payloads are produced by `copyStoryMap` from `getStoryMapSnapshot`; fixing adds guards for unreachable shapes.
  - `[false]` `[reject]` Blind: DDL and Drizzle declarations diverge — runtime uses the bootstrap DDL only and both declare Card/note uniqueness; the migrated and fresh fingerprints are asserted equal.
  - `[low]` `[reject]` Blind: duplicated test fixture fields — developer-only churn, no named divergence.
  - `[false]` `[reject]` Blind: UI keeps stale GitHub selection — the link button is disabled unless the id is among the available issues.
  - `[low]` `[reject]` Blind: spec paths and REST shape undocumented — fix would edit this spec; MCP and REST schemas live in contracts.
  - `[medium]` `[patch]` Blind: sync no longer clears a milestone removed remotely — re-verified: `GitHubBoardIssue.milestone` is `string | null`, so the baseline direct update wrote NULL, while the new update path skips it (the first-pass refutation assumed `undefined`). Fixed in `upsertIssueLinks`, covered by the board re-import test.
  - `[medium]` `[patch]` Edge: sync milestone not cleared — same root cause as the row above.
  - `[low]` `[patch]` Edge: backlog-health and release reports count note/GitHub evidence as source-linked — `getStoryMapReportData` now passes chunk links only, preserving the existing source semantics and the separate GitHub metric.
  - `[low]` `[reject]` Edge: legacy copied-map payload without `creationOrigin` — the spec forbids compatibility adapters; payloads are written by this code.
  - `[low]` `[reject]` Edge: `card_versions` provenance after redaction — duplicate of the Blind row above.
  - `[false]` `[reject]` Edge: bare ZodError on changeset source link — `application/errors.ts` maps ZodError to a validation DomainError.
  - `[low]` `[reject]` Edge: note maximum length — duplicate of the Blind row above.
  - `[low]` `[defer]` Edge: non-http GitHub URL rendered as href — duplicate of the deferred URL item.
  - `[low]` `[reject]` Edge: repo comparison is case-sensitive in the issue picker — both sides come from stored `github_links.repo`; a mismatch needs two identities created with different case.
  - `[medium]` `[patch]` Edge: owner-identity unlink through MCP/HTTP — carried: same claim as the first pass row.
  - `[low]` `[reject]` Edge: stale mutation error after switching Cards — the pre-existing error pattern of this modal; the Card changes only after the overlay is reopened.
  - `[low]` `[reject]` Edge: `json_type` on malformed snapshot rows — `snapshot_json` is written by the application only.
  - `[low]` `[reject]` Edge: duplicate identities show as duplicate evidence — requires separately created identities for one issue; deduplicating adds a second identity rule.
  - `[medium]` `[patch]` Gap: legacy databases without provenance columns have no backfill test — added `backfills linked or unknown provenance when upgrading…` covering chunk, owned-GitHub, attached-GitHub and bare Cards.
  - `[low]` `[reject]` Gap: canonical-identity delete payload untested in the mounted UI — repository deletion and the payload of the note unlink are covered; a second payload assertion adds little.
  - `[low]` `[reject]` Gap: MCP schema tests mirror the server transform — contracts test asserts the three union branches independently.
  - `[low]` `[reject]` Gap: GitHub kind untested over real HTTP — shared use case and route validation are covered through the note kind and MCP.
  - `[medium]` `[patch]` Intent: unlinking an owned issue deletes the canonical identity — carried: same claim as the first pass row.
  - `[false]` `[reject]` Intent: history carries no evidence records — carried: first pass rejected this; Card versions carry provenance and Activity carries evidence changes.
  - `[false]` `[reject]` Intent: origin classification derives from creation source and actor — every creation path passes an explicit source and the intent defines human direct creation as manual.
  - `[false]` `[reject]` Intent: Agent filtering keeps note and GitHub evidence — those rows belong to the accessible Card; only chunk rows can point at another Project's documents.

## Design Notes

Keep canonical chunk/GitHub stores, with note persistence and a typed combined evidence view. GitHub source linking may reference an existing issue identity from the same Project; resolve the real record, require an issue number and retain its canonical repo/issue/URL. Never move an identity away from another Card to attach evidence; attach locally without a remote call and avoid duplicate identical evidence. Removal uses typed evidence identity and existing stores. Adapt all chunk-specific readers when exposing union evidence; source document summaries remain chunk-specific.

Effective provenance includes every supported evidence store, even when the UI has not selected a document. Maintain it through creation/evidence mutation and Card history finalization. New copy is a new inference creation with copied evidence. Historical creationOrigin defaults unknown because creation mode is absent from old snapshots; do not infer from creation_source alone. Preserve existing development schema/archive rejection policy, not prototype compatibility.

## Verification

Use Node 24 via `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH` for each command.

- `corepack pnpm --filter @storymapper/contracts test` — shared schemas pass.
- `corepack pnpm --filter @storymapper/db test` — provenance, creation, ownership, history and persistence pass.
- `corepack pnpm --filter @storymapper/server test` — use cases, HTTP/MCP and source visibility pass, including isolated performance phase if configured.
- `corepack pnpm --filter @storymapper/web test` — mounted detail evidence and badges pass.
- `node scripts/verify.mjs` — hygiene, parity, workspace typecheck and build pass.
- `git diff --check` — no whitespace defects; inspect diff and confirm sprint-status.yaml excluded from every mutation/staging operation.

### 2026-10-11 — Supplemental verification of concurrent edits
- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Unified-evidence migration produces a different archive schema fingerprint — SQLite retains DDL whitespace and the archive policy hashes exact schema SQL. Share fresh/migrated DDL; a real upgraded database now exports and validates with retained chunk evidence and a newly added note.
  - `[medium]` `[patch]` Server fixtures omit the new mandatory evidence kind and expect a removed notes table — Four files caused five server failures. Tag intentionally seeded chunk evidence and update the exact copy inventory; all 66 affected tests pass.
  - `[medium]` `[patch]` Note-success callback supplies an explicitly undefined optional mutation option — Workspace typecheck rejects this under exactOptionalPropertyTypes. Pass options only when the callback exists; mounted controls and workspace typecheck/build pass.

## Auto Run Result

Status: done

### Summary
Follow-up review pass over the Story 4.2 implementation. Four reviewers produced 38 findings; 3 earlier decisions were carried, 3 root causes were patched, 1 low item was deferred and the rest were rejected with reasons (see the follow-up triage log).

### Patches applied
- `packages/db/src/repositories/tool-proposals-repository.ts` — board sync clears a local milestone again when the remote milestone is null (medium).
- `packages/db/src/repositories/releases-repository.ts` — report source coverage counts chunk links only, keeping prior semantics (low).
- `packages/db/src/repositories/card-provenance.test.ts`, `apps/server/src/http/routes/tool-proposals.test.ts` — legacy-database provenance backfill test and milestone-clearing assertion (medium).

### Deferred
- Non-http GitHub URL scheme rendered as href (low, pre-existing pattern).

### Follow-up review recommendation
`false`: this follow-up pass patched no high finding (patched: medium 2, low 1).

### Verification
Node 24: contracts 55, core 39, db 279, server 397 plus 5 performance, web 194 tests pass; `node scripts/verify.mjs` passed (hygiene, typecheck, build); `git diff --check` clean. sprint-status.yaml was not written, staged or reverted.

### Residual risks
- Nothing was committed: the intent contract forbids commits, so the working tree stays dirty (reviewed files, orchestrator-owned sprint-status.yaml and OpenWolf bookkeeping) for the orchestrator to commit.
