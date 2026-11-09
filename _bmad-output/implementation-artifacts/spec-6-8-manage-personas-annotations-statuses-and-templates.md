---
title: '6.8 Manage Personas, Annotations, Statuses and Templates'
type: feature
created: '2026-10-17'
version: 2
status: done
baseline_revision: aa1803874792439ba0a2cd3d9dd644c96dff174e
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Native browser keyboard, visual, screen-reader and connected browser-to-persistence acceptance remain unverified.
    evidence: |-
      Browser inventory exposed no browser surface; Safari binding failed with Computer Use cgWindowNotFound. DOM/router tests, real HTTP/MCP commands and SQLite reopen/parity pass independently. A disposable native CRUD/scope/template/confirmation flow plus screen-reader checks would settle this boundary. Review Blind10 and Intent1/2 share this single deferral.
    location: >-
      apps/web/src/features/customization/CustomizationEditor.tsx; TemplatePicker.tsx; PersonasPanel.tsx
    severity: medium (unverified)
  - summary: >-
      Story Templates keep a stale defaultStatus name after the matching workflow status is renamed or deleted.
    evidence: |-
      Status rename/delete rewrites Card names only; StoryTemplate.defaultStatus is a plain string copied at apply time, so a later template apply can create a Card with a status that no longer exists. Pre-existing: definition-only rename already left templates untouched.
    location: >-
      packages/db/src/repositories/customizations-repository.ts; packages/core/src/changesets/customization-resolution.ts
    severity: low
  - summary: >-
      Personas scoped to a removed Story Map are read-only and cannot be deleted in the Persona editor.
    evidence: |-
      PersonasPanel passes unavailable=true to PersonaDetail when the Persona's map is not among visible maps, disabling edit and Delete; PersonasPanel.scope.test.tsx pins the refusal for a retained draft. Unverified whether retained removed-map Personas must stay editable/deletable (Design Notes only promise that for unused customization definitions). A product decision plus a disposable removed-map Persona flow would settle it.
    location: >-
      apps/web/src/features/personas/PersonasPanel.tsx:104
    severity: medium (unverified)
  - summary: >-
      Agent cardPersona/cardAnnotation set/unset still apply immediately when agentProtection is off.
    evidence: |-
      The new proposal-only gate covers persona, annotation, workflowStatus and storyTemplate entities only; Card link operations keep their pre-existing agentProtection behavior and were not part of this change.
    location: >-
      apps/server/src/application/changeset/changeset-command.ts:19
    severity: low
---

Reproducing statement: Run bmad-build-auto for Story6.8 using the accepted Epic6 preparation and detail plan, with independent verification and subagents; never write, stage or revert orchestrator-owned sprint-status.yaml or deferred-work.md. Date:2026-10-17. Version:2.

<intent-contract>

## Intent

**Problem:** Status, Annotation and Story Template UI is create-only, Persona deletion silently unlinks, and used-status rename/delete lacks safe scoped Card updates. Templates cannot populate the shared Card composer.

**Approach:** Complete existing CRUD surfaces and template copying, with explicit scope and confirmed destructive actions; add shared authoritative impact checks and atomic effective-scope status rename/replacement across human commands and ChangeSets.

## Boundaries & Constraints

**Always:** Follow accepted4A, Epic6 preparation and story-plan6.8. Contracts remain the schema source; core stays pure; DB repositories own persistence; actor-aware application UoW owns atomic writes/audit/events. Every changed Card advances version once per transaction, existing history coalescing retained. Capture complete affected Card IDs/baseVersions at review intent, refuse usage-set/definition/replacement drift before writes and report conflicts explicitly. Nonhuman writes produce ChangeSets and separately approved Apply. Respect visible-map ownership, parked/archived Cards, existing removed-map semantics, source provenance, Restore epochs, live-update holds, preview read-only paths and dirty drafts. Use existing Dialog/conflict/announcement and English strings. Keep Story Templates distinct from prompt templates. Node24 installed runtime. No commit or push without explicit request; leave reviewed work staged.

**Never:** Write/stage/revert sprint-status.yaml or orchestration/deferred ledgers, infer verification from their rows, mutate user Projects/live GitHub, introduce status IDs on Cards, null status replacement, cloud services, schema migration frameworks, silent cross-project updates or template live references. No speculative compatibility/fallbacks or unrelated Epic6.9/6.10 work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| CRUD | Each of four types, Project or map scope | Named keyboard controls create/edit/delete all supported fields and show effective scope and persisted results | Visible loading/pending/error; failed draft retained |
| Used status rename | Selected definition and full reviewed usage baseline | Resolve name ownership first; atomically update definition and all affected Card names/history/versions/audit | Ambiguous same-name ownership, rename collision or stale definition/usage/Card refuses all writes |
| Used status delete | Distinct replacement definition valid for every affected map | Confirm consequences, atomically replace names and remove definition | Missing/self/wrong-scope/ambiguous/stale replacement refuses without writes |
| Persona/Annotation delete | Used links and captured Card versions | Confirm unlink, remove entity/links atomically with Card history/version effects | No confirmation or stale/new/removed usage refuses; Persona root concurrency retained |
| Scoped isolation | Project/map switch and same names across maps/Projects | Project definition affects only its Project maps; map definition only its map; URL/selector cannot use foreign remembered scope | Invalid membership is refused; removed-map semantics preserved |
| Template copy | Choose template when creating Card; edit existing draft | Skeleton/status/estimate defaults including0 copy into Card; deliberate replacement decision protects dirty text | Invalid defaults/refused save visible; template deletion never rewrites copied Cards |
| Agent flow | Equivalent changes proposed/applied through ChangeSet | Preview and Apply agree with direct human effects, ownership, histories and conflicts | No direct Agent mutation; drift aborts complete Apply |

</intent-contract>

## Code Map

- `apps/web/src/app/routes/customize.tsx`, `use-workspace-scope.ts`, `workspace-navigation.test.tsx`:6.1 already validates remembered-map membership; preserve this. Expose explicit Project/map choice and effective scope, key draft/editor lifetime by scope. Existing search storyMapId handling is GitHub-only; use validated local selector or extend existing search deliberately.
- `apps/web/src/features/customization/CustomizationPanel.tsx`: create-only chips and forms, missing labels/errors/pending guards. Add dedicated editors/confirmation components if needed. Existing Persona route remains reachable from customization area.
- `apps/web/src/features/personas/PersonasPanel.tsx`, `PersonaDetail.tsx`, corresponding tests: existing full fields, versioned Save/queued conflicts/live-safe drafts. Preserve those; label scope selectors, prevent prior-Project stale scope, confirm delete with authoritative impact and visible error.
- `apps/web/src/features/story-map/components/CardComposer.tsx`, `CardDetailModal.tsx`, `card-creation.test.tsx`, `card-fields.test.ts`: composer gets snapshot.storyTemplates but lacks description/defaults; modal already copies defaults including0 but overwrites dirty drafts. Reuse existing template path with explicit replacement protection.
- `apps/web/src/app/api.ts`, `apps/web/src/ui-strings/index.ts`, `features/story-map/card-query-invalidation.ts`: wrappers/types and centralized English strings; invalidate affected map/customization/personas/report queries across Project-wide effects.
- `packages/contracts/src/api/card-customization.ts`, `schemas/remaining-operations.ts`, `schemas/change-operations.ts`: extend existing public commands/operation metadata for captured affectedCards, definitionBefore/replacementBefore and confirmed unlink. Extend customization reads with scoped Card usage/version evidence (Project scope includes links across visible Project maps). Avoid copying schema definitions. CreateCardRequest/repository must accept template estimate on creation rather than a second non-atomic save.
- `apps/server/src/application/customization/customization.use-cases.ts`, `persona/persona.use-cases.ts`, HTTP customization/persona routes and MCP register-customization-tools/input metadata: parse/forward safe command evidence on both surfaces, validate Project/map reads, preserve ChangeSet-first branches and generated parity.
- `packages/db/src/repositories/customizations-repository.ts`: status update currently changes definition only; delete globally scans visible Cards by name. Persona/Annotation delete currently unlinks without captured Card versions. Implement scoped impact read and atomic authoritative guards/status Card writes using existing version/history/audit methods. Repository types in repository.ts must follow signatures.
- `packages/core/src/changesets/customization-resolution.ts`, `card-command-resolution.ts`, `operation-dependencies.ts`, `operation-conflicts.ts`, `resolver-write-collections.ts`: share pure effective-scope impact rules where practical. Update resolver writes/copy budget/dependency and conflict tracking for status Card effects and guarded unlink; do not assign command metadata into domain rows. Check operation persistence/history/event effects and actual DB parity tests.
- Existing DB `operation-resolution-parity.test.ts`, `operation-catalog-executor.test.ts`, core `remaining-operation-resolution.test.ts` and server HTTP/MCP tests are read-only evidence until contract changes require targeted updates. Graph CLI customization search used; verify source over stale graph. Keep unrelated GitHub/Restore/history implementations unchanged.

## Tasks & Acceptance

**Execution:**
- [x] Web route/customization/Persona paths above: explicit validated scope and named full CRUD forms, field persistence, confirmed deletion and visible errors; prepare UI against shared command contracts.
- [x] Contracts/application/HTTP/MCP paths above: safe impact review evidence, affected versions, definition/replacement drift guards, full scoped read and command parity.
- [x] DB/core paths above: shared effective ownership, atomic rename/replacement/unlink, exact usage-set/current versions/history/audit and ChangeSet preview/Apply equivalence; reject collisions before writes.
- [x] Composer/modal/API/invalidation paths above: template skeleton/default copying at creation, dirty replacement protection, copied independence and refreshed scoped options/reports.
- [x] Focused contract/core/DB/application/HTTP/MCP and real DOM/router tests: execute every matrix row, including empty usage, multi-map/project collisions, parked/archived usage, stale/new usage rollback, concurrent definition/replacement changes, zero estimate, failed/pending CRUD and Project switching.

**Acceptance Criteria:**
- Given any supported customization type, when using keyboard controls to create/edit/delete it, then the persisted fields match supported API capabilities and used-item consequences require a deliberate confirmation.
- Given a used status definition, when renaming or replacing/deleting it through human or approved Agent flow, then only uniquely owned effective-scope Cards change and all effects commit atomically with captured-version concurrency.
- Given a template, when creating a Card from it and later deleting the template, then the copied skeleton/defaults persist independently; applying a template never unexpectedly replaces dirty draft text.
- Given a foreign scope, stale affected Card or changed usage/definition, when submitting, then no partial changes occur and the UI retains the draft with explicit refusal.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass 1

- verdicts:18 findings — high1, medium9, low2, false3, maybe-false3.
- findings (all reviewer rows retained before grouping):
  - `[medium]` `[patch]` Verification1, creation-template dirty confirmation lacks a consumer regression — filed evidence accepted; modal and composer use different dirty predicates. Added two-template edit/Cancel/Replace/create coverage.
  - `[medium]` `[patch]` Edge1, removed Persona creation scope becomes Project-wide — source lookup returns undefined while New remains enabled. Preserved unavailable selected scope and require deliberate reselection; grouped with Blind4 and Parent1.
  - `[medium]` `[patch]` Edge2, metadata-only status update ignores supplied baseline — both direct and resolver guards only run on rename. Honored supplied evidence without changing sparse metadata commands; grouped with Blind7.
  - `[high]` `[patch]` Blind1, generic submission bypasses separate customization review — executeChangeSetCommand deferred only explicit apply:false or agentProtection, so newly supported replacement/rename can apply via SubmitChangeSet. Central operation-family admission now requires separate review, with mixed-cut HTTP/SDK regressions.
  - `[false]` `[reject]` Blind2, status rename/delete must protect removed-map values like unlink — accepted effective ownership uses visible maps; pre-existing status deletion intentionally ignores retained hidden Cards (getting-started.test.ts), while unlink physically removes relationships and requires its different guard. No new requirement to rewrite hidden status values or broaden restoration semantics is established.
  - `[false]` `[reject]` Blind3, ambiguous legacy names need a repair path — accepted4A explicitly requires refusal of ambiguous ownership rather than guessing. A migration/disambiguation product flow would contradict the chosen safety behavior and is not a defect in refusal.
  - `[medium]` `[patch]` Blind4, stale Persona map falls back to Project scope — verified same root cause as Edge1; preserve unavailable selection and prevent submission until deliberate reselection.
  - `[medium]` `[patch]` Blind5, valid one-map replacement omitted for Project status — core permits local replacement when it covers every affected Card; the editor filters only by definition.scope. Filtered available candidates by affected map coverage and add consumer regression.
  - `[medium]` `[patch]` Blind6, usage conflict cannot be deliberately re-reviewed without losing edits — captured evidence stays stale on every retry. Added explicit fresh re-review retaining draft and renewing replacement/unlink decisions; no automatic rebasing.
  - `[medium]` `[patch]` Blind7, metadata-only status update overwrites supplied stale definition — verified same root cause as Edge2. Honor supplied baseline and cover direct/resolver refusal.
  - `[low]` `[reject]` Blind8, Persona list materializes unused Project Card usage for validation — real unnecessary read; no measured user-facing regression. Preserving retained-map membership validation would require a separate validation interface/refactor rather than direct deletion; not justified for this negligible unmeasured cost.
  - `[low]` `[patch]` Blind9, Card evidence validation is quadratic — nested some searches are directly replaced by a keyed version index while preserving duplicate/set/version checks.
  - `[maybe-false]` `[defer]` Blind10, native keyboard/visual/screen-reader acceptance remains unverified — inventory exposed no browser and Safari returned cgWindowNotFound. Actual native CRUD, nested confirmation, focus and screen-reader checks would settle it; medium unverified, grouped with Intent1/2.
  - `[maybe-false]` `[defer]` Intent1, complementary tests do not prove one connected browser-to-persistence flow — correct evidence boundary; no actual defect is demonstrated. A disposable native application flow would settle it; same native unverified group.
  - `[maybe-false]` `[defer]` Intent2, DOM events cannot establish native keyboard/visual/screen-reader behavior — correct evidence boundary; record medium unverified with actual native acceptance needed, same group.
  - `[false]` `[reject]` Intent3, diff cannot independently establish invocation/delegation/protected-file history — descriptive limit of diff evidence, not product defect. Parent execution records one exact renderer invocation, required agents and starting/final protected hashes; bookkeeping was never used as verification.
  - `[medium]` `[patch]` Parent1, removed Customization scope also falls back to Project-wide — selectedScope is retained but validScope becomes undefined; preserve explicit unavailable state and block unintended scope writes, same root cause as Edge1/Blind4.

  - `[medium]` `[patch]` Parent2, background scope read error discards customization draft — CustomizeRoute returned only an alert even with a previously validated cached Story Map. Keep the same keyed panel/editor beside visible errors, retain initial-error blocking and inventory-error write disablement; actual router tests retain exact Dialog/input identities for inventory and snapshot503 errors.

Eight patch groups:1high,6medium,1low. Parent full-gate repairs additionally aligned the existing SubmitChangeSet contract assertion with omitted versus explicit apply intent and the label-import consumer with separate proposal/approval/Apply; this is part of the same approval-policy group. Final TypeScript verification also required conditional forwarding of omitted apply under exactOptionalPropertyTypes;44submission tests pass after that correction. One shared medium unverified native deferral (three reviewer rows);4rejections. Frozen intent remains unchanged.


### 2026-10-17 — Review pass 2 (follow-up)

- verdicts:42 findings — high0, medium10, low21, false8, maybe-false3.
- findings:
  - `[low]` `[reject]` Blind1, evidence optional in contracts but mandatory at run time — missing evidence fails loudly with a conflict that tells the caller to re-read current usage; tightening schemas touches shared generated contracts for developer ergonomics only.
  - `[low]` `[reject]` Blind2, MCP tools still advertise apply — apply:true is rejected with an explicit validation message, so it is loud, not silent; removing the field churns generated tool schemas.
  - `[low]` `[defer]` Blind3, template defaultStatus not updated on status rename/delete — pre-existing (definition-only rename never touched templates); recorded low in deferred.
  - `[low]` `[patch]` Blind4, template apply blanks description/status when the template value is empty — modal now falls back with `||` as before; grouped with Edge7.
  - `[false]` `[reject]` Blind5, removed-map Persona/Annotation delete is a dead end — Design Notes document the refusal ("restore the map before unlinking"); the two extra snapshot joins are negligible.
  - `[maybe-false]` `[defer]` Blind6, removed-map Persona read-only/undeletable — would be medium if removed-map Personas must stay editable; deferred unverified, product decision needed.
  - `[medium]` `[patch]` Blind7, Persona delete keeps stale evidence after a conflict — verified: ownsConflict skips the global refetch and customization has no focus refetch; failed delete now closes the dialog and invalidates, so reopening captures fresh evidence; grouped with Edge1.
  - `[low]` `[patch]` Blind8, editor stuck after failed refresh — Review again now also shows for refreshReview.error.
  - `[medium]` `[patch]` Blind9, colour/metadata edits conflict on unrelated Card changes — editor sent evidence on every edit; now only on rename; repository and resolver compute ownership/impact only for rename or supplied evidence; grouped with Edge4 and VG4.
  - `[low]` `[reject]` Blind10, status update reads all Cards in dependency tracking — only serializes operations inside one ChangeSet; fix adds a branch for negligible gain.
  - `[low]` `[reject]` Blind11, affected-Card logic duplicated across web/core/repo — no divergence demonstrated; web evidence is advisory and the server recomputes authoritatively.
  - `[low]` `[reject]` Blind12, listPersonas validates scope through getCustomization — `carried` Blind8 of pass 1: no measured regression, validation interface refactor not justified.
  - `[low]` `[reject]` Blind13, usageCards ships full Card records — no measured cost; slimming changes the public read contract.
  - `[low]` `[reject]` Blind14, customizationGuard relabels DomainErrors as conflict — message is preserved, only the category label differs inside ChangeSet refusals.
  - `[medium]` `[patch]` Blind15, new items always sent at position 0 — verified in editor and customization.test expectations; position now omitted on create unless entered so the server appends; grouped with Edge6 and Edge12.
  - `[low]` `[patch]` Blind16, smaller items — only the unused panelStrings.noTemplate was real (removed); URL-encoding of UUIDs, inline fieldset style, scope seeding by Project key and body spread are not defects.
  - `[false]` `[reject]` Blind17, tests weakened — Agent rename path is still covered by customization-management and customization-impact tests; extra activity counts reflect the new approve/Apply step.
  - `[low]` `[reject]` Blind18, no ADR/doc update — proposal-first Agent writes are existing AGENTS policy under accepted 4A; docs/mcp-tools.md lists tools without input shapes.
  - `[medium]` `[patch]` Edge1, Persona delete evidence from cached data — same root cause as Blind7.
  - `[low]` `[reject]` Edge2, listPersonas getCustomization read — `carried` pass-1 Blind8; the unknown-Project not_found is now covered by a route test.
  - `[low]` `[reject]` Edge3, getCustomization loads all Cards/links for map-scoped reads — no measured regression; part of the chosen single read capability in Design Notes.
  - `[medium]` `[patch]` Edge4, legacy overlapping names block any status update — verified workflowStatusImpact ran unconditionally; same fix as Blind9.
  - `[false]` `[reject]` Edge5, rename leaves removed-map Cards on the old name — `carried` pass-1 Blind2: accepted ownership covers visible maps only.
  - `[medium]` `[patch]` Edge6, create position defaults to 0 — same root cause as Blind15.
  - `[low]` `[patch]` Edge7, modal template apply drops the empty-value fallback — same fix as Blind4.
  - `[low]` `[reject]` Edge8, composer sends empty template status — editor requires a status and schema defaults to todo; only reachable by API-created empty values.
  - `[false]` `[reject]` Edge9, stored ChangeSets lacking evidence now conflict on Apply — fail-closed is the required behavior ("No confirmation or stale usage refuses").
  - `[low]` `[defer]` Edge10, cardPersona/cardAnnotation not gated — pre-existing agentProtection behavior unrelated to customization CRUD; recorded in deferred.
  - `[false]` `[reject]` Edge11, DELETE body spread of non-object — a non-object body fails strict schema parsing with a 400 validation error.
  - `[low]` `[patch]` Edge12, NaN written to controlled Position input — position is now a string draft; same fix as Blind15.
  - `[medium]` `[patch]` VG1, create-time Project/Story Map scope check untested — added table-driven repository test for the four creates.
  - `[medium]` `[patch]` VG2, listPersonas scope validation untested — added foreign-map 400 and unknown-Project 404 route test.
  - `[medium]` `[patch]` VG3, Card estimate on create untested at the route — added POST /api/cards estimate 0 and 5 persistence test.
  - `[medium]` `[patch]` VG4, ambiguous legacy names uneditable — same root cause as Blind9; added seeded-duplicate test (colour edit allowed, rename refused).
  - `[low]` `[reject]` VG other1, listPersonas full scan — `carried` pass-1 Blind8.
  - `[low]` `[reject]` VG other2, no test that Persona Delete is disabled when unavailable — behavior itself is the open question in the Blind6 deferral.
  - `[maybe-false]` `[reject]` Intent A, no live-region announcements in new customization components — would be low; Dialog and role=alert are reused, native screen-reader check already deferred.
  - `[false]` `[reject]` Intent B, Persona create/edit not added to Customize — intent says "Complete existing CRUD surfaces"; Persona create/edit already exist in the Persona route.
  - `[low]` `[reject]` Intent C, composer silently applies status/estimate and re-pick replaces defaults — matches "defaults copy into Card"; dirty confirmation protects text.
  - `[false]` `[reject]` Intent D, proposal-only gate broader than the status/unlink rows — Boundaries state "Nonhuman writes produce ChangeSets and separately approved Apply".
  - `[false]` `[reject]` Intent E, parity tests sit in the db package — descriptive; HTTP/MCP parity is also covered in server tests.
  - `[maybe-false]` `[reject]` Intent F, live-update holds/preview read-only/Restore epochs not visible in customization UI — would be low; Customize lives outside the Story Map shell that owns those paths.

Seven patch groups: 4 medium, 3 low (Persona delete evidence; status metadata edit guard; position handling; modal template fallback; editor retry button and dead string; new verification tests). No high patched. Three deferred (one medium unverified, two low); the earlier native-browser deferral is retained.

## Design Notes

Use existing customization read capability to expose authoritative usage evidence for Project-wide review rather than client snapshot loops or a new capability. Effective Project status ownership covers visible maps in the same Project; map-only definitions cover that map. Because Cards store names, multiple effective definitions with the old or proposed/replacement name are refused rather than guessed. Project/map overlap is a collision even if one is more specific; same names in unrelated scopes are legal. Capture complete affected usage and definition/replacement evidence, then recompute in the transaction. Last-write-wins definition roots do not relax Card concurrency. UI review evidence is not authority. Existing6.1 scope repair is retained and extended, not replaced.

Removed-map boundary: Persona/Annotation deletion with physical links to retained hidden Cards refuses identically before direct writes, preview and approved Apply. Those hidden roots/links/history stay intact; restore the map before unlinking. Unused retained definitions remain readable/editable/deletable. Status effects retain established visible-map ownership; hidden status values are not rewritten. The refusal closes a pre-existing direct-versus-ChangeSet mismatch without silently mutating unreviewed hidden Cards.

Review repairs retain the same contracts: generic nonhuman customization cuts now share the dedicated command review gate, including mixed cuts/provider execution. Sparse metadata commands remain last-write-wins when no evidence is supplied; supplied evidence is authoritative and never silently rebased. Explicit re-review refreshes usage/definition/options and renews destructive confirmation while retaining entered fields. Selected unavailable scopes block writes until deliberate reselection.

## Verification

Run gates serially with `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` on PATH. Focused suites must execute nonzero tests. Save sanitized evidence under `evidence/story-6-8/`.

- `corepack pnpm --filter @storymapper/contracts test`, core, DB, server and web test suites for changed boundaries; verify real HTTP and MCP proposal/Apply plus persisted reopen and negative rollback.
- `corepack pnpm test`: exact root regression gate; stage new source fixtures first because setup tests copy tracked files.
- `node scripts/verify.mjs`: hygiene/capability parity/typecheck/build passes.
- `git diff aa1803874792439ba0a2cd3d9dd644c96dff174e --check` and staged whitespace; audit protected-file hashes and exact staged scope.
- Attempt disposable native UI keyboard/scope/template CRUD acceptance using available browser; record screen-reader/native limitations without calling DOM coverage a native pass. No real user data.

## Changelog

- 2026-10-17 v1: Planned from accepted6.8 detail plan,6.7 continuity and independent UI/domain investigation.

- 2026-10-17 v2: Implemented and triaged four independent review lenses; repaired eight groups, retained native evidence limit and protected ledgers. Final parent gates recorded under Auto Run Result.

## Auto Run Result

Status: done

Summary: Follow-up review pass over Story 6.8 (full CRUD for Status/Annotation/Template, confirmed Persona/Annotation delete, atomic scoped status rename/replacement across human and ChangeSet flows, template copying into the Card composer/modal). Pass found no high issues; seven patch groups applied.

Files changed in this pass:
- `packages/core/src/changesets/customization-resolution.ts`, `packages/db/src/repositories/customizations-repository.ts` — ownership/impact review runs only for rename, delete or supplied evidence.
- `apps/web/src/features/customization/CustomizationEditor.tsx` — position omitted on create, string draft, evidence only on rename, Review again after failed refresh.
- `apps/web/src/features/personas/PersonaDetail.tsx` — failed delete closes the dialog and refreshes evidence.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx` — empty template values keep the draft values.
- `apps/web/src/ui-strings/index.ts` — removed unused `noTemplate`.
- Tests: `customization-impact.test.ts` (create scope, legacy duplicates), `customization-management.test.ts` (Persona list scope, estimate on create), `PersonaDetail.test.ts`, `workspace-navigation.test.tsx`.

Review findings: 42 reviewer rows — patches applied 7 groups (4 medium, 3 low), deferred 3 (Blind6 medium unverified, Blind3 and Edge10 low), rejected the rest with reasons in the triage log.

Follow-up review recommendation: false (this follow-up pass patched no high). Patched counts: high 0, medium 4, low 3.

Verification: `corepack pnpm typecheck` passed; `corepack pnpm test` passed (contracts 152, importers 7, core 388, web 574, db 442, server 681 + 14); `node scripts/verify.mjs` completed; `git diff --check` clean for code.

Residual risks: native browser keyboard/screen-reader acceptance still unverified (existing deferral); removed-map Persona editability needs a product decision. Reviewed work is left staged per the spec boundary (no commit); protected `sprint-status.yaml` and `deferred-work.md` were not touched.
