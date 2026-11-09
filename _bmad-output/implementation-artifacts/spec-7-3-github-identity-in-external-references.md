---
title: '7.3 GitHub identity in external references'
type: feature
created: 2026-10-19
updated: 2026-10-19
version: 2
status: done
baseline_revision: d7dd71fcdd0b35b0f7178c1ad310fb7e198e20de
review_loop_iteration: 0
followup_pass: true
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/story-plan-7-3-github-identity-in-external-references.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-preparation.md'
warnings: [oversized]
deferred:
  - summary: >-
      Token-mode Milestone lookup does not search later result pages.
    evidence: |-
      Blind review B8 confirmed the unchanged token listMilestones call inspects one page. An existing exact Milestone beyond that page can trigger a redundant create and visible422 failure. CLI pagination is handled; a separately scoped token pagination repair and multi-page regression remain.
    location: >-
      packages/github/src/providers/github-provider.ts:198
    severity: medium
  - summary: >-
      Native browser navigation and screen-reader/platform acceptance remain unverified.
    evidence: |-
      Intent audit I3 and native-acceptance.json record no available CUA browser surface. Automated DOM links and actual ephemeral HTTP/SDK origins pass. Native link activation, browser navigation, reader behavior and the platform matrix require observation before native release acceptance.
    location: >-
      apps/web/src/features/story-map/components/TreeGrid.tsx
    severity: medium (unverified)
  - summary: >-
      Live GitHub account and installed CLI acceptance remain unverified.
    evidence: |-
      Intent audit I4 distinguishes controlled provider/CLI transports from a live account smoke. No real credentials, live GitHub or user Projects were accessed. A separately authorized real-account run would settle this boundary; any interactive login requires confirmed human presence.
    location: >-
      packages/github/src/providers/github-provider.ts
    severity: medium (unverified)
  - summary: >-
      Issue bodies no longer publish the Estimate and Priority lines.
    evidence: |-
      Follow-up blind review BH2: the replaced body builder wrote Estimate and Priority beneath the references block; the footer-only builder omits them, and neither the intent nor the plan says whether that loss is wanted. A maintainer decision on whether Issue bodies must keep both values would settle it; no test asserted them.
    location: >-
      packages/core/src/publishing/github-footer.ts:21
    severity: medium (unverified)
---

Reproducing statement: Execute bmad-build-auto for Story 7.3 with source investigation, implementation and independent verification, preserving orchestrator-owned sprint-status.yaml. Date: 2026-10-19. Version: 2.

<intent-contract>

## Intent

**Problem:** GitHub identity is duplicated across legacy GitHub links, sync links and source evidence. This permits inconsistent ownership, navigation and lifecycle behavior.

**Approach:** Make adapter-owned canonical `github` external references the single identity source, key sync/evidence to their ids, and cut all current consumers over together. Preserve provenance, auditable deletion, safe archives/Restore and authored Issue prose.

## Boundaries & Constraints

**Always:** Canonical normalized HTTPS github.com Issue/Milestone locators contain validated plain owner/repository and positive numbers, without credentials/query/fragment. One GitHub binding per entity and scoped remote uniqueness apply independently of connection ids. Adapter-only mutations require validated scope/authority; generic external-ref set/delete cannot claim GitHub. Sync storage holds externalRefId, connection and state/baselines, deriving public identity via joins. Source-only evidence can cite Issue refs owned by Card or Release; only sync membership grants outbound ownership, requiring Card→Issue or Release→Milestone. Copies retain provenance without sync ownership. Hard entity deletion atomically records typed externalRef.deleted Activity with reason entity-deleted, Project/Map/entity and canonical before snapshot; scoped indexed reads exclude undone events and equivalent live bindings. Explicitly version/history/audit every surviving affected root, including removed Maps. Rebind/detach/park/archive are not entity deletion. Increment operation schema version; stale old pending proposals while retaining history. Footer contains Map name, Card Key, immutable marker and clickable loopback deep link using actual served origin; strip only delimited machine footer for local descriptions and merge hashes. Preserve authored Markdown and never serialize local Workflow Status. Unavailable/masked404 retains identity and stale state; transport/auth/rate/partial failures remain errors. Portable archives redact all GitHub rows and nested Activity/ChangeSet/copied payloads while retaining other external refs/source-plan data. Operational Restore retains canonical sync data and reports remote effects it cannot undo.

**Never:** Write, stage, unstage or revert sprint-status.yaml or alter orchestrator/deferred-ledger state; infer verification from done/awaiting-operator bookkeeping; commit/push; access real credentials/user databases or live GitHub. No prototype migration/backfill, legacy compatibility reader/executor, duplicate identity store, tombstone table, historical live resolver, automatic remote recreation/deletion, new provider, cloud dependency or future-story remote-plan/conflict UX implementation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Duplicate identity | Same Issue through two connections or another Card | One scoped binding, no reassignment; state derives from it | Explicit ownership conflict before mutation |
| Evidence | Direct/attached/Release-owned Issue, cross-Project input, copies | Canonical Issue evidence; copies have no sync rows; surviving versions/history consistent | Reject foreign Project, non-Issue/unsafe URL and duplicate ownership |
| Hard delete | Entity owns canonical GitHub ref cited elsewhere | Atomic typed deletion Activity, dependent cleanup and surviving root versions | Rollback audit/data together; removed-map citing roots included |
| Nondelete lifecycle | Rebind, detach, park, archive | Correct provenance/root effects without deleted-entity evidence | No false local-deleted classification |
| Provider read | Missing/inaccessible Issue versus auth/network/rate/partial error | Retained Card/URL with unavailable state, or explicit sanitized provider failure | Never turn provider failure into confirmed deletion |
| Footer | Push/import/merge, renamed Map/prefix, authored references | One machine section, stable marker and valid current local route; prose retained; hashes footer-free | Reject unsafe origin; no hardcoded port |
| Archive / Restore | Populated current schema, GitHub and non-GitHub refs plus history | Redacted portable archive, strict import rejection, operational Restore retains canonical refs and truthful notices | No unredacted nested payload or silent data loss |
| Old operations | Pending old version and historical old payloads | Pending stale/refused, history readable | No conversion or legacy execution |

</intent-contract>

## Code Map

Final extraction: `packages/contracts/src/schemas/{identifiers,external-refs,github-identity}.ts` owns shared strict schemas; `apps/server/src/fixtures/mcp-scope-evidence.ts` holds reusable canonical evidence seeds. This keeps the touched production/test modules within the repository source-size gate. Final operation schema is version 5; current storage has no legacy GitHub identity table. The bullets below retain the source-investigation map.

- `packages/contracts/src/schemas/domain.ts`: canonical refs, typed source evidence, joined public GitHub/sync projection, deletion evidence and snapshot/report shapes. `change-operations.ts`, `remaining-operations.ts`, `operation-fields.ts`, `operation-resolution.ts`: replace githubLink operations/references; generic reserved deletes need guards too. `change-set-schemas.ts` currently version 4; increment; existing DB operation transition handles history.
- `packages/db/src/schema/tables.ts`, `connection.ts`, `schema/classification.ts`: synchronized bootstrap/declarations/indexes; remove github_links, re-key card_github_evidence and remote_work_item_links. `repositories/external-refs-repository.ts`, `sources-repository.ts`, `work-item-repository.ts`, `source-evidence-repository.ts`: guarded adapter mutations and canonical joined reads, source-only Issue refs independent of sync.
- `cards-repository.ts`, `releases-repository.ts`, `map-copy-repository.ts`: hard delete evidence, explicit affected roots, provenance copies and fingerprints. Reuse `writeCardVersion` and `finalizeEvidenceCards` (raw surviving roots include logically removed Maps). Story Map delete in projects-repository is logical.
- `operation-snapshot-repository.ts`, `operation-supply-repository.ts`, `operation-persistence-repository.ts`: canonical snapshot/supply, FK insertion/deletion order, source evidence persistence and deletion Activity. Core `operation-registry.ts`, `link-resolution.ts`, `github-sync-resolution.ts`, `operation-dependencies.ts`, `operation-conflicts.ts`, context/owner/collection helpers explicitly simulate identity ownership and must change together.
- Core `github-evidence.ts`, `source-resolution.ts`, `selected-deletion.ts`, `card-command-resolution.ts`, `copy-resolution.ts`, `board-import-resolution.ts`: canonical source projection, scope validation, root effects and import allocation. Synthesized direct source identity remains distinct from physical attachments.
- Server `application/github-link/github-link.use-cases.ts`, HTTP routes/contracts, `application/sync/github-{import,pull,conflict}-command.ts`, `github-command.ts`, preview-board projection, capability manifest, MCP `tools/project-scopes.ts`/register tools: retain suitable public names with new shapes; update all safety ownership/deleted-scope inspection, operation fingerprints and generated parity. Current import emits duplicate legacy plus sync link.
- `packages/github/src/providers/github-provider.ts`, `work-item-provider.ts`: getRemoteItem already propagates most failures; ambiguous Issue absence must be explicit unavailable. CLI ensureMilestone still swallows arbitrary422; remove that path. `packages/core/src/publishing/export-formatters.ts`: shared delimited footer/parser/stable marker, CSV canonical identity.
- Server `work-item-sync.ts`, `sync-merge.ts`, `sync-conflict-resolution.ts` and incoming builders; DB push plan/baselines and core `reports/sync-health.ts`: all use one footer-free representation. Inject current actual served origin through ApplicationDeps/runtime preparation and push-plan inputs; existing route is /projects/{projectId}/story-maps/{storyMapId}/discovery?card={cardId}.
- Web `useStoryMapBoardState.ts`, `CardTile.tsx`, `TreeGrid.tsx`, `CardDetailModal.tsx`, `TrackingView.tsx`, Restore dialog and report/filter consumers: one joined identity index, no duplicate badges; re-key source evidence. DB release-report risk inputs use canonical refs.
- `packages/db/src/snapshot.ts`, `archive-database.ts`, `restore-history.ts`: mixed external_refs row redaction, nested payload scrubbing/rejection and canonical before/after Restore comparison, including identity changes at same id.
- Tests: contracts provenance/external-refs/change-operations/version; core resolution/selection/copy/reports/health; DB card-provenance/external-refs/root-versions/parity/catalog/snapshot/Restore/transition; server sync services/commands and both MCP transports; web provenance/Tree/Tracking/filter tests. Source-verified by three investigation agents; graph tools unavailable.
- Read-only: orchestrator/sprint/deferred ledgers, user Project data and real credentials. Global commit policy forbids commit here. Use [REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin ahead of shell Node22.

## Tasks & Acceptance

**Execution:**
- [x] Contracts paths above — define strict canonical adapter operations, persisted sync-state versus joined public projections and typed deletion evidence; increment operation version and port schema tests.
- [x] DB schema/bootstrap/repository paths above — remove legacy identity store, implement canonical guarded storage/joins, evidence/delete/copy/root behavior, indexed deletion query and current-schema reopen/integrity tests.
- [x] Core/DB operation paths above — cut over resolver/registry/dependencies/conflicts/persistence, board import and old-version refusal without compatibility execution; preserve source ownership and atomic audit.
- [x] Provider/formatter/server services above — explicit unavailable/errors, no swallowed Milestone errors, shared machine footer/description normalization and actual loopback origin injection.
- [x] Server HTTP/MCP/manifest and web/report/export paths above — cut over every visible/safety projection and regenerate capability artifacts; update `.cursor/rules/card-authoring.mdc` to canonical adapter-owned refs.
- [x] Snapshot/archive/Restore paths above — row and nested-payload redaction/import validation, operational identity retention and truthful remote notices.
- [x] Focused suites above — cover every matrix row using disposable SQLite and controlled providers, then workspace tests and release verification; retain native/manual limitations explicitly.

**Acceptance Criteria:**
- Given the same remote Issue through multiple configured connections, when actual HTTP/MCP import/link and board reads execute, then only one scoped owner exists and displayed links all derive from its canonical ref.
- Given direct, attached, Release-owned and copied Issue evidence, when identity is edited, owner removed or Project reopened, then surviving source navigation and affected root versions/history/audit stay consistent and copies cannot sync outbound.
- Given a generated Issue body, when read through actual export/push/import/merge paths, then Map name, Card Key, stable marker and current clickable local route identify the source while authored prose and local description remain unchanged.
- Given unavailable remote resources or provider failures, when actual sync/health paths execute, then local entities and canonical links remain readable with truthful unavailable/error state and no false deletion claim.
- Given populated current-schema archive/Restore, when exported/imported/restored, then portable content contains no GitHub sync payload, retains other refs, and operational Restore retains identity with explicit remote-effect notices.

## Spec Change Log

- 2026-10-19 v2: Implementation, source-size extraction, independent review repairs and final automated evidence recorded outside the frozen intent. Preserve source-only Note provenance, scope parent lookups by repository, retire obsolete open conflicts on rebind/detach, and use sequential simulated owners against initial root versions. No change to the intent contract.

## Review Triage Log

### 2026-10-19 — Review pass

- verdicts: 19 findings — high 0, medium 12, low 1, false 4, maybe-false 2
- patched findings: 12 entries (11 medium, 1 low), grouped into 11 repairs (10 medium, 1 low); 3 deferrals; 4 rejected observations.
- findings:
  - `[medium]` `[patch]` E1: Valid rebind between different owner versions fails. — Independent pure resolver reproduces the same old/new owner baseline mismatch as B2. Resolver validates the previous owner baseline independently of destination scope. Executor uses the dependency simulator owner before each operation against initial root versions; distinct-version and sequential-owner tests pass.
  - `[medium]` `[patch]` E2: Incoming Note mapping aborts import. — Note mapping is valid but all imported Cards get sync membership, which the new outbound Note guard rejects. Preserve source-only provenance. Incoming human/MCP builders retain Note canonical provenance without active sync rows and report every imported item; mixed imports pass.
  - `[medium]` `[patch]` B1: Direct imports pool parent Issue numbers across repositories. — The direct parent index includes every joined link; Agent import already filters repository. Direct parent indexing now filters canonical repository before Issue-number lookup; cross-repository regression passes.
  - `[medium]` `[patch]` B2: Rebind compares old-owner baseVersion against destination owner. — Both previous and new referenceOwner calls assert the same operation baseline; unequal owner versions reject valid rebind. Resolver validates the previous owner baseline independently of destination scope. Executor uses the dependency simulator owner before each operation against initial root versions; distinct-version and sequential-owner tests pass.
  - `[medium]` `[patch]` B3: Unchanged canonical updates bump roots in core. — Resolver finalizes every affected Card/Release even when owner/locator are unchanged; direct repository only finalizes actual identity change. Both direct and core canonical updates return unchanged when owner/scope/locator match; root/history no-op regression passes.
  - `[medium]` `[patch]` B4: Rebind/detach leaves obsolete open conflicts. — Sync membership is removed while conflict rows remain; prepareConflictResolution requires the removed link. Identity rebind/detach atomically retires only obsolete open conflicts, records attributed before evidence, and preserves closed/unrelated conflicts; four direct/executor cases pass.
  - `[medium]` `[patch]` B5: Human public mutation can edit a removed-map identity. — Human application branch calls retained-owner repository directly without visible-owner check; internal maintenance must remain possible. Application update/delete validates visible owner through linkProjectId before mutation; actual HTTP refusal passes while retained citation maintenance remains available.
  - `[false]` `[reject]` B6: Sync does not update footer-only metadata on otherwise unchanged content. — Current served origin is required when generating pushed content. Footer is intentionally excluded from merge hashes; no automatic metadata-only remote write requirement exists.
  - `[medium]` `[patch]` B7: Complete footer after one newline survives stripping. — Parser only admits start-of-body or two-newline prefix; a manually edited complete block can be duplicated. Also preserve malformed earlier delimiter prose. Parser recognizes complete non-nested blocks with short separators and preserves unmatched earlier prose;12 footer tests pass.
  - `[medium]` `[defer]` B8: Token Milestone lookup omits later pages. — Token listMilestones first-page lookup is unchanged from baseline; CLI pagination was repaired here. Separate provider pagination work remains.
  - `[medium]` `[patch]` B9: Non-GitHub externalRef.deleted history is erased or rejected. — Archive predicates act on action alone although valid historical Activity permits non-GitHub refs; whole-payload handling must inspect typed GitHub evidence. Typed GitHub-only whole-event predicates and scoped deletion reads preserve valid non-GitHub history; archive roundtrip/refusal tests pass.
  - `[medium]` `[patch]` B10: Archive scans materialize all serialized history. — New redaction/validation .all() loads complete Activity/ChangeSet/Card history tables before processing; iterate to bound retained payload memory. Serialized payload scanners use32-row keyset batches;3×257-row history test verifies full processing without a new timing threshold.
  - `[false]` `[reject]` I1: Diff alone cannot prove exact skill execution or absence of temporary sprint writes. — Actual parent transcript records the exact renderer invocation once and only explicitly scoped writes/staging; protected file remains unchanged. No claimed code defect.
  - `[false]` `[reject]` I2: Detailed scope might be self-authored expansion of story identifier. — Binding story-plan7.3 and epic7 preparation predate this diff and were loaded before planning; the spec refines their existing requirements.
  - `[maybe-false]` `[defer]` I3: Native navigation/platform/reader acceptance is unverified. — CUA inventory exposes no browser surface. DOM anchors and actual HTTP listener/SDK routes pass; native browser/reader observation would settle the boundary.
  - `[maybe-false]` `[defer]` I4: Live GitHub account behavior is unverified. — Controlled provider and CLI transports prove local behavior; a separately authorized live account smoke would establish live access. No login or real credentials used.
  - `[false]` `[reject]` I5: Existing prototype Project conversion is not demonstrated. — AD9 and binding detail plan explicitly exclude prototype migration/backfill; populated current-schema reopen/Restore is the required surface.
  - `[medium]` `[patch]` V1: Successful malformed search-page guard has no regression test. — Pre-verified gap: existing partial-page tests reject promises and never return hasNextPage true with null cursor. Both auth modes now exercise successful malformed continuation pages and assert rejection.
  - `[low]` `[patch]` V2: Card Detail paired-ref deduplication lacks consumer test. — Pre-verified gap: Tree covers paired projections; Card Detail fixture has empty sync rows, so duplicate detail rows could regress undetected. Mounted Card Detail paired canonical/sync fixture asserts one Issue row with joined state.

### 2026-10-19 — Review pass (follow-up)

- verdicts: 40 findings — high 0, medium 10, low 16, false 11, maybe-false 3
- patched findings: 9 rows (medium) in 6 repairs; 1 new deferral; 3 carried deferrals; 27 rejected.
- findings:
  - `[low]` `[reject]` BH1: A Map name containing the footer end delimiter leaves residue after stripping. — Needs a user to type the delimiter into their own Map name; the fix adds a sanitising branch for a case nobody meets.
  - `[maybe-false]` `[defer]` BH2: Estimate and Priority lines are no longer published; the legacy Referenzen block is no longer stripped. — Dropping both lines is real but whether it is wanted is unspecified (a maintainer decision settles it); the legacy block is excluded by the no-legacy-compatibility rule.
  - `[false]` `[reject]` BH3: Footer links go stale, leak ids, and the origin throws for non-loopback listeners. — Metadata-only pushes are excluded (carried B6 reasoning); the marker ids are the requested stable marker; the non-loopback throw is the specified unsafe-origin rejection.
  - `[low]` `[reject]` BH4: Pre-7.3 databases fail obscurely instead of with an unsupported-schema error. — The intent excludes prototype migration and backfill; detection would be new surface for unsupported databases.
  - `[low]` `[reject]` BH5: The single binding per entity has no database index. — Every writer goes through assertUnique in the repository; no second writer exists.
  - `[low]` `[reject]` BH6: SQL LIKE classifies a Milestone URL in a repository named issues as an Issue. — Needs a repository literally named issues carrying a Milestone ref on a Card; the pattern only feeds the provenance backfill.
  - `[medium]` `[patch]` BH7: listDeletedGitHubRefs loads every GitHub ref in the database. — Confirmed at external-refs-repository.ts:100: the live-binding exclusion was unscoped. It now reads live refs only for scopes named by the deletion evidence; deletion and Restore suites pass.
  - `[false]` `[reject]` BH8: Archive redaction misses JSON columns and relies on shape heuristics. — Checked live_entities_json (entity ids and versions only), proposed_by_json (actor) and plan_states.payload_json (buildPlanStateProjection holds no external refs); kind github appears only on GitHub payloads.
  - `[low]` `[reject]` BH9: Locator and merge logic is duplicated between use cases and repository. — No named divergence; both paths share parseGitHubLocator and the repository still enforces ownership.
  - `[low]` `[reject]` BH10: localOrigin is typed optional but consumed as required. — A missing origin already fails fast with a validation DomainError in buildGitHubIssueBody; the fix is a type refactor across about 12 signatures.
  - `[false]` `[reject]` BH11: The owner/undefined repository key flattens imported hierarchy. — The provider throws when connection.repository is missing (github-provider.ts:377) before any item reaches the parent index.
  - `[false]` `[reject]` BH12: Provider hardening is asymmetric and tolerant paths were removed. — Failing on partial results and unrecognised errors is the specified behavior; token pagination is the carried DW-102.
  - `[false]` `[reject]` BH13: Ledger edits, spec typos and hygiene. — This build did not touch the deferred ledger; the remaining items only fix the build's own spec.
  - `[medium]` `[patch]` BH14: No ADR for the identity-store replacement. — ADR 0008 does not cover it and the global rule requires one; added docs/adr/0009-canonical-github-identity-in-external-references.md with status proposed.
  - `[false]` `[reject]` EC1: A source-only Card ref aborts the whole push plan. — Refusal is the specified fail-fast behavior and github-command-sdk.test.ts:234 asserts it.
  - `[false]` `[reject]` EC2: A transferred Issue url makes persistence throw after the remote write. — persistPushResult failures go through remotePersistenceFailure, which reports the already-written remote item.
  - `[low]` `[reject]` EC3: A non-canonical board Issue url hits a non-null assertion. — Operations are schema-validated and board urls come from GitHub's own canonical links; fix is a one-line guard for a case nobody meets.
  - `[low]` `[reject]` EC4: A duplicate Issue url in one Agent import batch creates two refs. — GitHub listings do not repeat an Issue within a call; the fix adds a dedupe branch.
  - `[low]` `[reject]` EC5: A duplicate Issue url in one direct import batch rolls back the import. — Same unlikely trigger as EC4.
  - `[false]` `[reject]` EC6: A null repository yields owner/undefined in import. — Same disproof as BH11.
  - `[medium]` `[patch]` EC7: listDeletedGitHubRefs reads all Projects' refs. — Same defect and repair as BH7.
  - `[low]` `[reject]` EC8: An IPv4-mapped loopback address is refused. — The launcher binds loopback addresses directly, so Node reports 127.0.0.1 or ::1.
  - `[low]` `[reject]` EC9: projectGitHubRefs is quadratic in refs times states. — No measured bottleneck; the audit-performance suites pass.
  - `[medium]` `[patch]` EC10: The deleted-ref read is scoped and indexed only for activity. — Same defect and repair as BH7.
  - `[medium]` `[patch]` VG1: CLI Milestone creation and multi-page listing are untested. — Pre-verified; added a later-page lookup test asserting paginate and slurp arguments without a create, and a single-create test with the Issue call after it.
  - `[medium]` `[patch]` VG2: parseGitHubLocator rejection and normalization rules lack direct tests. — Pre-verified; added packages/contracts/src/schemas/github-identity.test.ts covering 11 rejected inputs and case normalization.
  - `[medium]` `[patch]` VG3: The human sync path for an unavailable Issue is untested. — Pre-verified; added a sync-review case asserting retained url, stale state, unchanged Card and no provider write.
  - `[medium]` `[patch]` VG4: Agent import repository-scoped parent lookup has no cross-repository test. — Pre-verified; added a regression case that fails when the repository filter is removed (mutation-checked) and passes with it.
  - `[low]` `[reject]` VG5: requireFoundItem and requireRemoteItem are near-duplicates. — Different layers and messages; no named divergence.
  - `[low]` `[reject]` VG6: Two import statements from the contracts package in two server files. — Cosmetic.
  - `[low]` `[reject]` VG7: Non-null assertions on localOrigin. — Same as BH10.
  - `[medium]` `[defer]` VG8: Token Milestone lookup omits later pages. — carried: B8 and DW-102, same location and claim.
  - `[low]` `[reject]` IA1: Footer tests inject a literal origin; only served-origin.test binds a real listener. — Descriptive; the real ephemeral listener test exists and the SDK and HTTP tests exercise the wiring.
  - `[maybe-false]` `[defer]` IA2: Provider failures are proven against mocked transports only. — carried: I4, live account smoke remains unverified.
  - `[false]` `[reject]` IA3: Restore does not state that remote effects are not undone. — RestoreResultDialog renders strings.githubUnchanged and lists the retained links; the diff only retargets the comparison to canonical refs.
  - `[false]` `[reject]` IA4: deferred-work.md appears in the diff. — Ledger rows belong to the orchestrator; this pass did not write them.
  - `[medium]` `[patch]` IA5: The indexed deletion read is not index-covered beyond activity predicates. — Same defect and repair as BH7.
  - `[low]` `[reject]` IA6: Shape-based redaction could match non-GitHub payloads. — Matching needs system, provider or kind equal to github; other external refs use their own system values.
  - `[false]` `[reject]` IA7: GitHubLink names remain on API and UI surfaces. — The Code Map says to retain suitable public names with new shapes.
  - `[maybe-false]` `[defer]` IA8: Native browser navigation and screen-reader acceptance are unobserved. — carried: I3.

## Design Notes

Canonical refs may own Issue or Milestone source identity on either entity kind; active sync membership separately enforces resource type. This preserves Release-owned Issue evidence without a second identity store. A second different GitHub ref on the same entity is a conflict. Copy canonical refs into the new Map scope and remap evidence without copying sync rows. Existing tests that install both Issue and Milestone on one Release must use distinct owners under the new invariant.

Keep persisted sync state minimal and construct joined public projections once. No connection id determines remote identity. Retain direct evidence synthesis rather than persist duplicate source attachments. Scope/authority must be enforced at actual application/executor boundaries; caller-controlled source attribution is insufficient.

## Verification

- Node24 PATH for all commands; no live provider/auth/user data. Focused meaningful regression suites exercise all matrix rows and both operation/direct repository paths.
- `corepack pnpm test` — script and workspace tests pass, no excluded failures.
- `node scripts/verify.mjs` — source/Git hygiene, capability parity, typecheck and build pass; run serially after tests.
- Assert github_links and ensureLegacyGitHubLink absent from current executable code. Inspect actual UI link routes/footer output where native browser available; explicitly defer unavailable native/platform acceptance.

## Changelog

- 2026-10-19 v1: Source-verified canonical identity cutover plan with three investigation summaries and accepted Epic7 constraints.
- 2026-10-19 v2: Canonical cutover implemented; all 19 review findings triaged, 11 repair groups applied, final 2,659-test and release gates pass; three deferred boundaries retained.

- 2026-10-19 v2 follow-up: second review pass triaged 40 findings; 6 repairs applied (scoped deleted-ref read, ADR 0009, four regression tests), 1 deferral added, no high findings.

## Auto Run Result

Status: done

Summary: GitHub identity lives only in canonical adapter-owned `github` external refs; sync state and source evidence key to the ref id. Deletion evidence, footer/marker, unavailable-versus-error provider reads, archive redaction and operational Restore follow the intent contract. The follow-up pass added no behavior beyond narrowing one read.

Files changed by this follow-up pass:
- `packages/db/src/repositories/external-refs-repository.ts` — deleted-ref read excludes live bindings per evidence scope instead of loading every GitHub ref.
- `docs/adr/0009-canonical-github-identity-in-external-refs.md` — proposed ADR for the identity-store replacement.
- `packages/contracts/src/schemas/github-identity.test.ts` — locator rejection and normalization table.
- `packages/github/src/providers/github-provider.test.ts` — later-page Milestone lookup and single create.
- `apps/server/src/services/sync-review.test.ts` — human sync keeps identity and marks stale when the Issue is unavailable.
- `apps/server/src/application/sync/github-command-regressions.test.ts` — Agent import does not parent across repositories.

Review findings: 40 triaged; 9 rows patched in 6 repairs (all medium); 1 deferred (Estimate/Priority lines, unverified); 3 carried deferrals (token Milestone pagination, native acceptance, live account); 27 rejected with the reasons recorded in the triage log.

Follow-up review recommendation: false. This pass patched no high finding, so the work has converged. Patched counts: high 0, medium 9, low 0.

Verification: `corepack pnpm test` exit 0 (contracts 167, core 404, db 472, github 38, importers 7, server 750 plus 14 audit-performance, web 740); `node scripts/verify.mjs` exit 0 (hygiene, typecheck, build); the Agent cross-repository test was mutation-checked and fails without the repository filter. Node 24.17.0.

Residual risks: native browser, reader and platform acceptance and a live GitHub account run remain unobserved (carried deferrals); the Estimate/Priority removal awaits a maintainer decision; ADR 0009 is `proposed`. Nothing was committed because the intent contract forbids it; the orchestrator owns the commit, so the working tree is intentionally not clean. sprint-status.yaml and the deferred ledger were not touched.
