---
title: '1.1 English UI from one string module'
type: 'refactor'
created: '2026-10-03'
status: done
baseline_revision: ba1c9f40a4dc8059420cc1b8ebb2e4b9bdb7c48f
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Existing linked sentences retain component-level word order; translating into a language that requires moving the link would require adjusting composition.
    evidence: |-
      CardDetailModal already split the GitHub connection notices around Link elements before this story. All phrase text is now centralized, but JSX still determines link placement. No alternate locale or localization runtime is requested in Story 1.1.
    location: >-
      apps/web/src/features/story-map/components/CardDetailModal.tsx:288
    severity: low
  - summary: >-
      HTTP test fixtures retain temporary SQLite directories and do not explicitly close their database clients.
    evidence: |-
      All eleven existing createRoutes tests construct temporary repositories, while Fastify close has no database-client cleanup hook. The new default-language regression follows this pre-existing fixture convention. Address the shared test fixture lifecycle separately; no local project database is involved.
    location: >-
      apps/server/src/http/routes/index.test.ts:12
    severity: low
  - summary: >-
      Existing English count labels do not consistently handle singular and plural forms.
    evidence: |-
      Before this story, RootLayout rendered cards/releases for every count, BacklogList rendered stories for every count, and CardTile rendered source for every positive count. Central formatters preserve those existing outputs. A grammar correction is separate from this same-meaning copy extraction.
    location: >-
      apps/web/src/ui-strings/index.ts:103
    severity: low
  - summary: >-
      Contract enum values such as sync states, privacy mode and last-run mode/status are rendered as raw identifiers instead of English labels, and the same sync state is labeled differently in two filters.
    evidence: |-
      Before this story, BoardToolbar showed the option text remote_deleted/local_deleted while GitHubSyncPanel showed Remote deleted for the same value; GitHubSyncPanel rendered link.syncState and lastRun mode/status directly, and PrivacyExportPanel rendered privacyMode with a strict-local fallback. The migration centralized these with unchanged output. One label map per contract enum would resolve both.
    location: >-
      apps/web/src/features/story-map/components/BoardToolbar.tsx:66
    severity: low
  - summary: >-
      Interface timestamps in Card version history and the audit route use the browser default locale, while the HTML export pins en-US.
    evidence: |-
      Before this story, CardDetailModal and audit.tsx both called toLocaleString() without a locale; the migration kept that behavior (ui-strings versionHistory, audit.tsx:20) and only replaced the hard-coded de-DE export locale. A German-locale browser shows German date order in the interface.
    location: >-
      apps/web/src/app/routes/audit.tsx:20
    severity: low
  - summary: >-
      English copy capitalizes object names inconsistently (Story Map, Story map, story map), contrary to the epic's consistent naming rule.
    evidence: |-
      The original English copy already mixed these forms; the migration preserved each site's wording in appStrings, panelStrings and storyMapStrings. Epic 1 context requires consistent names (Project, Story Map, Card, ...), but Story 1.1 acceptance only requires same-meaning translation and behavior unchanged apart from language.
    location: >-
      apps/web/src/ui-strings/index.ts:7
    severity: low
  - summary: >-
      Tracked OpenWolf files hard-code a machine-specific Node path and record agent tooling issues as project bugs.
    evidence: |-
      .wolf/STATUS.md and .wolf/cerebrum.md name [REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin, which does not exist on other machines; .wolf/buglog.json holds story-1-1 tooling entries. The fix edits agent-context files, so it is deferred.
    location: >-
      .wolf/cerebrum.md
    severity: low
---

Purpose: implement Story 1.1 with centralized English interface copy, preserved behavior and checked default content. Version: 4. Updated: 2026-10-03. Reproduce from the Story 1.1 acceptance criteria and the verified source paths below.

<intent-contract>

## Intent

**Problem:** Agentic Story Mapper mixes German and English interface text across panels, route states, tooltips, generated content and exports. Distributed literals make translation inconsistent and hard to maintain.

**Approach:** Put all web interface copy in the `apps/web/src/ui-strings` module and consume it from the existing UI. Translate German copy with the same meaning, protect existing English defaults, and add the story's German string hygiene check.

## Boundaries & Constraints

**Always:** Preserve interactions, routing, enum and option values, selectors, configuration values and persisted user content. Centralize headings, buttons, messages, accessible labels, tooltips, empty/loading states, count formatters, generated card text and export interface copy. Use typed English values and formatters without an i18n library. Match existing English default content. Keep loopback and ChangeSet boundaries intact.

**Never:** Write or revert `sprint-status.yaml`, infer verification from its bookkeeping, alter existing user records, invent missing default Personas/templates, translate authoring documents in `docs/templates`, add new UX features, add providers/dependencies, introduce locale configuration/fallbacks, or commit without an explicit request.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Existing content | Custom Card/Persona/Workflow names, descriptions, paths and links | Content displayed unchanged with English surrounding copy | Preserve existing handling |
| Dynamic copy | Counts, labels, archive paths, HTTP status and export dates | Central formatters preserve values; English export timestamp | Preserve request failures |
| Hygiene violation | Umlaut, sharp s, or whole German stopword in scanned source | Nonzero check with relative file and correct line | Report every offending location |
| Hygiene boundary | English token containing a stopword substring; schema identifier `fachexpertise` | No false failure from substring matching | No error expected |

</intent-contract>

## Code Map

- `apps/web/src/app/routes/{RootLayout,index,story-maps.index,story-map-shell,audit}.tsx`: navigation, API banner, route loading/empty states and view labels.
- `apps/web/src/features/{onboarding,project-archive,personas}/`: German onboarding/privacy descriptions, portable import/export messages, new Persona name and labels.
- `apps/web/src/features/story-map/components/`: `CardDetailModal.tsx` editing/errors/history/close dialog/generated story template; `BoardToolbar`, `CardTile`, `DiscoveryMatrix`, `BacklogList`, `SwimlaneGrid`, `TreeGrid`, `DescriptionEditor`, `StoryMapExportActions` labels, dialogs, counts and accessible names.
- `apps/web/src/features/story-map/{card-taxonomy,card-visual-options}.ts`, `features/github-sync/sync-status.ts`: human label records; leave keys unchanged.
- Remaining panels under `apps/web/src/features/{ai-mcp,customization,github-sync,privacy,releases,reports,roadmaps,source-documents}`: all visible static copy and formatters.
- `apps/web/src/app/api.ts:102,117,126,436`: HTTP failure copy displayed in UI. `features/story-map/export/story-map-view-export.ts`: generated HTML labels, script fallback Card name, German footer and `de-DE` timestamp.
- `apps/web/vite.config.ts`, `tsconfig.base.json`: current absolute package aliases; add one alias for the string module.
- `packages/db/src/repositories/storymapper-repository.ts:125,175,1084,1290,2669`: seed creation, Project language, Persona/template defaults and Workflow Statuses. Source is already English; no default Personas/Story Templates are seeded.
- `packages/ai/src/prompt-templates/templates.ts`, `apps/server/src/http/routes/index.ts:86`: existing English built-in AI templates, both must remain English. `apps/server/src/http/routes/index.test.ts`: public Project/customization API regression surface.
- `scripts/verify.ps1`, `package.json`: verification integration. No actual `check-hygiene` script exists despite stale anatomy entry. No existing web tests; baseline workspace tests pass after frozen-lockfile dependency restore with Node 24.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/ui-strings/index.ts` (split within module only if size requires), `tsconfig.base.json`, `apps/web/vite.config.ts` — create typed central copy/formatters and an absolute module alias.
- [x] `apps/web/src/app/` and feature paths in Code Map — consume central copy everywhere, translating German and the export date locale while preserving runtime values and behavior.
- [x] `scripts/check-hygiene.mjs`, `scripts/german-stop-words.txt`, `package.json`, `scripts/verify.ps1` — scan web source, seed directory, actual repository seed/default implementation and both built-in AI template sources; maintain whole-word stopwords and report violations as file:line; wire verification.
- [x] `scripts/check-hygiene.test.mjs`, `apps/web/src/ui-strings/ui-strings.test.ts`, `apps/server/src/http/routes/index.test.ts` — meaningful regression coverage for hygiene edge cases, raw JSX/accessibility copy outside the module, rendered English representative panels and new Project defaults. Do not invent sample records or mutate local projects; use existing seed/public API fixtures.
- [x] Run hygiene, all workspace tests, typecheck and build; inspect final diff and preserve all existing values/data behavior.

**Acceptance Criteria:**
- Given the web source, when the migration finishes, then every static user-visible string comes from `apps/web/src/ui-strings` and no nonblank JSX text remains in the three named panels or route states.
- Given onboarding, archive and Card detail panels, when rendered, then they show English with the original meaning and retain their existing actions and values.
- Given a new Project and the existing seeded demo, when the public API exposes their defaults, then language, Workflow Statuses, seed and built-in template text are English; absent default Personas/Story Templates stay absent.
- Given scanned source, when any German umlaut, sharp s or maintained whole German stopword appears, then `check-hygiene` fails with file and line; when migrated source is checked, then it passes.
- Given completed changes, when workspace tests, typecheck and build run, then they pass.

## Spec Change Log

- 2026-10-03 v1: created from Story 1.1 and source investigation; baseline claims about German seeds and default Personas/templates did not match source, so preserve existing English/absent defaults.

- 2026-10-03 v2: resumed the committed migration; preserved the supplied current-HEAD baseline, reran implementation verification and four review lenses, repaired two source-guard gaps, and recorded fresh evidence. The intent contract remains unchanged.

- 2026-10-03 v3: confirmed terminal completion for the automation handoff; all validation processes finished, with no background run pending.

- 2026-10-03 v4: fresh source audit found that the two resumed-review guard repairs were absent from the checked-in source; restored them, centralized the remaining ChangeSet summary, covered assertion/array expressions, and recorded a new four-lens review with final verification. Preserved the intent contract and orchestrator files.

## Review Triage Log

### 2026-10-03 — Review pass

- verdicts: 22 findings — high 0, medium 11, low 4, false 6, maybe-false 1
- findings:
  - `[low]` `[patch]` Blind: missing spaces after GitHub labels — reproduced in static markup; restored trailing spaces and asserted the rendered messages.
  - `[medium]` `[patch]` Blind: capital sharp S bypasses hygiene — reproduced `STRAẞE`; case-insensitive forbidden-letter matching and positive regression now pass.
  - `[medium]` `[patch]` Blind: decomposed umlauts bypass hygiene — reproduced decomposed Übersicht; NFC normalization preserves line numbers and regression now passes.
  - `[false]` `[reject]` Blind: escaped character decoding is required by the source hygiene rule — an escape sequence has no literal prohibited character in source; the stated rule is lexical source hygiene, not evaluation of arbitrary runtime strings. Current migrated copy is verified in source and representative render/export tests.
  - `[false]` `[reject]` Blind: Workflow names must be replaced with translated labels — inspected CardDetailModal, BoardToolbar and TreeGrid: these render persisted/custom Workflow names or stable protocol defaults. Preserving their names and option values is intentional; defaults are already English and custom names are tested unchanged.
  - `[medium]` `[patch]` Blind: JSX checks miss binary/parenthesized copy — added direct expression handling and positive/negative AST cases. The guard explicitly checks JSX copy; protocol literals and indirect data sources are separately inspected rather than treated as prose.
  - `[medium]` `[patch]` Blind: hygiene regression suite is not routine — root test now runs the four Node tests before workspace tests; full root run confirmed execution.
  - `[low]` `[reject]` Blind: static renders do not test interactions — true coverage limitation, but handlers and behavior-bearing attributes are unchanged in the reviewed diff. Adding an interaction framework is disproportionate for this text migration; misleading test-name wording was removed.
  - `[medium]` `[patch]` Blind: date assertion bypasses the exporter — replaced it with a fixed-clock exportStoryMapView HTML Blob assertion exercising production formatting and download filename.
  - `[medium]` `[patch]` Blind: export title uses technical view id — display title now uses the existing central view label; download filename keeps its original route-id suffix. Export regression verifies both.
  - `[maybe-false]` `[reject]` Blind: linked fragments cannot support a future translation — no target language or rearranged-link requirement establishes a current defect. If true its grade is low; existing composition is recorded below without adding a localization runtime.
  - `[false]` `[reject]` Blind: privacy-description cast causes an invalid-mode defect — the cast and strict-local selection behavior mirror the prior typed map; all three current contract modes have entries. An unspecified future contract extension does not establish a reachable missing-mode defect.
  - `[medium]` `[patch]` Edge path: uppercase/decomposed character detection misses — same verified Unicode root cause as the blind findings; normalized case-insensitive scan and all character regressions pass.
  - `[medium]` `[patch]` Edge claim: declared German-character coverage excludes Unicode forms — same Unicode repair; real checker and CLI nonzero/location tests pass.
  - `[medium]` `[patch]` Verification gap: hygiene tests not registered in root verification — pre-verified finding; root test command now executes the Node suite, confirmed in final output.
  - `[medium]` `[patch]` Verification gap: timestamp test never executes downloadable export — pre-verified finding; actual HTML Blob regression observes the English medium/short timestamp at the exporter boundary.
  - `[low]` `[reject]` Intent: runtime behavior is broader than static render tests — source comparison verifies unchanged actions and values; no changed interaction failure was found. Browser interaction coverage remains an explicit residual verification limit.
  - `[false]` `[reject]` Intent: lexical checks do not prove every runtime text originates in the module — data such as custom names, API messages and templates deliberately retain authoritative data sources. Static interface copy is centralized; tests and exact source review complement the lexical guard.
  - `[false]` `[reject]` Intent: absent default Personas/Story Templates differ from populated-default reading — source has no such seeded records. Inventing them would add behavior beyond the language migration; existing English defaults and absence are protected through the public API.
  - `[medium]` `[patch]` Intent: example locale assertion differs from actual export — same exporter regression repair as both other lenses; surrogate assertion removed.
  - `[false]` `[reject]` Intent: source hygiene does not translate existing user records — user-record translation is explicitly forbidden by the preservation boundary; unchanged content is tested and no persistence mutation is introduced.
  - `[low]` `[defer]` Intent: component-level linked sentence composition remains — verified pre-existing split around Link elements; centralized text preserves English placement. Deferred for any future locale requiring link reordering.

Six shared patch entries were applied: five medium (Unicode coverage, JSX expression guard, root test wiring, export boundary coverage, central export view labels) and one low (message spacing). One pre-existing low composition issue is deferred. All rejected findings have their individual reasons above.

### 2026-10-03 — Resumed review pass

- verdicts: 18 findings — high 0, medium 1, low 8, false 8, maybe-false 1
- Review artifact included committed implementation `1c9ed37015745aae2e38ab4efa5d0181f7df3b12` against `c9d7c3898a8c0311e48b8f95697819618c28fa47`, plus the resume diff against baseline `ba1c9f40a4dc8059420cc1b8ebb2e4b9bdb7c48f`. The platform allowed three simultaneous reviewers; the fourth launched when a slot opened. All four returned before triage.
- findings:
  - `[false]` `[reject]` Blind: German UI vocabulary absent from stopwords — the requirement covers the maintained whole-word stopword list, rather than every German noun or verb. All listed stopwords and forbidden characters are checked; missing unlisted vocabulary is not a failed current requirement.
  - `[false]` `[reject]` Blind: sprint status changes require reconciliation — the change existed before this run and belongs to the orchestrator, as the user explicitly states. Neither its content nor its index entry was changed; its value was never used as verification evidence.
  - `[low]` `[defer]` Blind: temporary API fixture database/directory cleanup missing — verified the same lifecycle omission across the pre-existing route tests and no cleanup hook in createRoutes. Recorded the shared fixture-lifecycle issue for separate work; no local user database was used.
  - `[low]` `[reject]` Blind: regression checks only two of twelve AI templates — all twelve current templates remain English and unchanged in both source collections; the production hygiene gate scans both collections. Additional exact-copy assertions would duplicate the unchanged implementation without demonstrating a current failure.
  - `[low]` `[reject]` Blind: root test does not execute production source hygiene — root tests execute checker/CLI regressions; the separate required check-hygiene command checks the actual tree and passed. Release verification invokes that gate after runtime discovery. No command falsely claims that fixture tests scan the production tree; the known platform runtime issue remains outside this story.
  - `[low]` `[patch]` Blind: existing custom label prop excluded from JSX guard — added label to the existing copy-bearing attribute list; current AddControl consumers use central strings and the focused/full suites pass.
  - `[false]` `[reject]` Blind: JSX guard proves every indirect source is centralized — carried: the prior triage explicitly limits the lexical guard to JSX and complements it with exact source inspection. API errors, taxonomy, setStatus and confirmation literals in the migration are centralized; no remaining static-copy violation was demonstrated.
  - `[low]` `[reject]` Blind: exported description interactions lack a browser test — carried: conditional/browser interactions remain an explicit verification limit; source handlers are unchanged and the shared production HTML timestamp boundary is tested. No changed interaction failure was found, and adding a browser framework is disproportionate for these copy substitutions.
  - `[false]` `[reject]` Blind: special user-title characters are not preserved/escaped — buildStandaloneHtml still applies the unchanged escapeHtml implementation to the title; cloned content and form-value preservation are unchanged. The migration adds no interpolation or escaping failure at this location.
  - `[false]` `[reject]` Blind: English-only custom fixtures cannot establish German-content preservation — carried: persisted records and custom display values retain their authoritative data sources with no translation or database migration. Exact source comparison and unchanged values establish the preservation boundary; a German fixture is not evidence of a missing implementation requirement.
  - `[maybe-false]` `[reject]` Blind: repeated words in central groups will diverge — no divergent current label or named caller defect was demonstrated. Establishing harm would require an actual inconsistent terminology edit; its if-true grade is low, so speculative reuse work is rejected.
  - `[medium]` `[patch]` Edge: template interpolation expressions bypass literal guard — reproduced in the AST helper; recurse into span.expression and add literal/nonliteral interpolation regressions. Focused tests and the full root run pass.
  - `[false]` `[reject]` Intent: English terminology normalization violates preservation — the contract protects existing English defaults and runtime values, rather than prohibiting consistent interface vocabulary. Epic context explicitly requires Activity/Step in place of misleading epic/feature wording. Export display-title capitalization is the previously reviewed central-label correction; the filename and selector remain unchanged.
  - `[low]` `[defer]` Intent: indirect source detection and linked sentence composition differ from full-copy ownership — carried: source inspection confirms central static phrases; component-level Link placement is exactly the prior pre-existing low deferred issue. Retained the original deferred item without adding a duplicate or a localization runtime.
  - `[low]` `[reject]` Intent: static fixtures do not exercise existing-record writes and all interactions — carried: rendering coverage is deliberately bounded, while source comparison verifies unchanged handlers, values and persistence behavior. No changed interaction failure was found; browser/editor round trips remain a stated verification limit.
  - `[low]` `[reject]` Intent: formatter and stubbed HTML tests do not exercise every export/action path — carried: the actual HTML Blob boundary and English timestamp are covered; PNG/PDF share the changed formatter and their remaining capture paths are unchanged. Verification-gap review found no new gap, and no altered action failure was identified.
  - `[false]` `[reject]` Intent: duplicate offending words on one line hide locations — diagnostics are file:line, so repeated identical text on that line has the same reported location. Every distinct offending file/line remains reported; no column-level diagnostic requirement exists.
  - `[false]` `[reject]` Intent: sprint bookkeeping contradicts this run — the supplied diff contains the orchestrator's pre-existing change. User ownership takes precedence; neither writing/reverting it nor interpreting it as a verification claim is authorized.

Verification-gap reviewer: no findings. This pass applied two separate patches (one medium, one low), added one pre-existing low deferred fixture issue, carried the prior linked-sentence item, and rejected fourteen findings with the individual reasons above.

### 2026-10-03 — Fresh autonomous resume review

- verdicts: 18 findings — high 0, medium 1, low 12, false 5, maybe-false 0
- Artifact: committed production migration `1c9ed37015745aae2e38ab4efa5d0181f7df3b12` against `c9d7c3898a8c0311e48b8f95697819618c28fa47`, followed by all staged, unstaged and untracked changes against current baseline `ba1c9f40a4dc8059420cc1b8ebb2e4b9bdb7c48f`. Three concurrent reviewer slots were available; the fourth launched when one finished. All four returned before triage. Findings below retain each layer's order; the blind review's arithmetic line is not a finding.
- findings:
  - `[false]` `[reject]` Blind: unattended permission setting is an unauthorized part of this migration — the untracked setting existed in the initial working tree, before this run. No tool in this run created or edited it; it is included only because the review artifact includes existing untracked files.
  - `[medium]` `[patch]` Blind: ChangeSet operation summary formatting remains outside the module — verified the visible ChangeSetItem summary uses a local count/key/list formatter. Moved its unchanged implementation into panelStrings.summarizeOperations; permitted operation values now verify counts, grouping, order and empty output.
  - `[low]` `[patch]` Blind: assertion wrappers bypass the JSX copy guard — reproduced the direct assertion expression case; unwrap as, satisfies and non-null expressions. Literal and central-string negative cases pass.
  - `[low]` `[reject]` Blind: object-literal JSX spreads bypass accessibility checks — the syntax is outside this deliberately bounded lexical check; no current literal copy is supplied by such a spread. Adding object/spread analysis would add branches for an unused form, so this low prospective gap is rejected.
  - `[low]` `[patch]` Blind: child arrays and String conversions bypass the guard — arrays are a direct rendered literal form and now recurse through elements, with central-string/protocol negative coverage. No current String(literal) JSX caller exists; adding special function-call semantics for that prospective form is rejected as low complexity without current harm.
  - `[low]` `[defer]` Blind: count formatters retain singular/plural grammar errors — exact pre-story RootLayout, BacklogList and CardTile source demonstrates identical output. Recorded one pre-existing cosmetic grammar item; preserving counts/output is the current migration boundary.
  - `[low]` `[reject]` Blind: empty export DOM stubs omit description labels — carried: the prior export-description coverage row already records bounded DOM/browser coverage, while source comparison preserves the description handler and uses centralized English labels. No changed interaction failure was found; a new DOM/browser harness is disproportionate here.
  - `[low]` `[reject]` Blind: export tests cover only Discovery's six-way title mapping — exportTitle directly indexes the existing central labels for the typed six-view union, and the unchanged filename construction uses viewKind. No distinct behavior branch or wrong label was demonstrated; repeated label assertions would mirror that mapping.
  - `[low]` `[reject]` Blind: Persona creation payload is not directly tested — inspected PersonasPanel: only name/role literal sources changed to the exact English New Persona/User strings; projectId, scope selection and mutation handling are unchanged. No behavior defect was demonstrated; an interaction harness would add complexity for already inspected literal substitutions.
  - `[false]` `[reject]` Blind: current review metadata conflicts with completed earlier passes — in-review describes this actively running pass, review_loop_iteration counts bad-spec re-derivations, and followup_review_recommended is computed from this pass during finalization. The prior handoff describes an earlier run. A finding whose fix edits the spec is rejected by the workflow.
  - `[low]` `[patch]` Edge: asserted literal accessibility copy bypasses the guard — same verified wrapper root cause as the blind assertion finding; the shared unwrap repair and positive/negative regression pass.
  - `[low]` `[patch]` Edge: literal child arrays bypass the guard — same verified array root cause as the blind array finding; the shared element-recursion repair and positive/negative regression pass.
  - `[false]` `[reject]` Intent: English terminology normalization violates preservation — carried: the prior intent row verifies the contract preserves defaults/runtime values, and the epic requires Activity/Step display terminology. Canonical view labels keep original filename/selector values.
  - `[low]` `[defer]` Intent: complete copy ownership exceeds lexical checks and component link composition — carried: the prior row explicitly bounds lexical coverage, and the same pre-existing Link placement remains recorded in the original deferred item. The independently verified ChangeSet formatter gap is repaired above. No duplicate deferred entry is added.
  - `[low]` `[reject]` Intent: markup tests do not exercise all data writes/interactions or German records — carried: exact source comparison preserves handlers, values and data sources; no changed interaction failure was demonstrated. Disabled queries and mocked router/editor keep the declared rendering boundary explicit.
  - `[low]` `[reject]` Intent: HTML Blob test does not exercise browser dialogs or PNG/PDF downloads — carried: the production HTML Blob boundary and shared changed timestamp formatter are exercised; remaining capture/interaction paths are unchanged. This remains a residual verification limit, not a demonstrated changed behavior defect.
  - `[false]` `[reject]` Intent: hygiene diagnostics cover token locations without columns or all German vocabulary — carried: the contract requires file:line and maintained whole stopwords, which the CLI fixtures verify. Columns and recognition of unlisted vocabulary are not required.
  - `[false]` `[reject]` Intent: aggregate sprint/settings changes violate this run's boundary — carried: both changes predate this run and remain untouched. The user explicitly owns sprint bookkeeping; no row is used as verification evidence and no reconciliation is authorized.

Verification-gap reviewer: no findings. Three shared patch entries were applied (one medium, two low), one pre-existing low grammar item was added, and the original linked-sentence deferred item was carried without duplication. Every rejected finding has its individual reason above.

### 2026-10-03 — Review pass (follow-up)

- verdicts: 27 findings — high 0, medium 0, low 13, false 14, maybe-false 0
- Artifact: committed migration `1c9ed37015745aae2e38ab4efa5d0181f7df3b12` against `c9d7c3898a8c0311e48b8f95697819618c28fa47`, plus all working changes against baseline `ba1c9f40a4dc8059420cc1b8ebb2e4b9bdb7c48f` and the untracked orchestrator ledger `deferred-work.md`; the untracked `.bmad-loop/` orchestrator runtime directory was excluded. All four layers ran in parallel and returned before triage.
- findings:
  - `[low]` `[defer]` Blind: BoardToolbar sync-state options show raw remote_deleted/local_deleted while GitHubSyncPanel labels the same value Remote deleted — verified pre-story source c9d7c38 shows identical raw option text in BoardToolbar and Remote deleted in GitHubSyncPanel; the migration preserved both. Grouped with the next row under one deferred enum-label item.
  - `[low]` `[defer]` Blind: raw identifiers (privacyMode, syncState, lastRun mode/status) rendered as copy — verified the same raw renderings in pre-story PrivacyExportPanel:58 and GitHubSyncPanel:172,275. Pre-existing; deferred together with the previous row.
  - `[low]` `[defer]` Blind: interface timestamps use the browser locale while export pins en-US — pre-story CardDetailModal:318 and audit.tsx:19 already used toLocaleString() without a locale; the intent names only the export timestamp. Deferred as pre-existing.
  - `[false]` `[reject]` Blind: summarizeOperations is domain logic that does not belong in the copy module — the intent explicitly centralizes count formatters; the grouping exists only to produce the displayed count summary and its output is unchanged from the pre-story component. Raw op/entity values are the pre-existing enum display covered by the deferred enum-label item.
  - `[low]` `[defer]` Blind: three string objects repeat keys with conflicting casing (Story Map/Story map/story map) — the inconsistent capitalization is preserved verbatim from pre-story English copy; Story 1.1 acceptance requires same meaning and unchanged behavior, while the epic naming rule is broader. Deferred as pre-existing terminology inconsistency.
  - `[low]` `[reject]` Blind: punctuation/single-letter entries fragment sentences to satisfy the JSX guard — real but no user-visible defect; they only matter for a future reordered-language translation, which no story requests, and the fix means rewriting sentence composition in many components rather than a direct correction. Related link composition is already deferred.
  - `[low]` `[patch]` Blind: storyMapStrings keys epic/featureKind/feature/newFeature/parkEpic/parkEpicQuestion contradict their Activity/Step values — verified at DiscoveryMatrix:393,394,514,553,554 (`target.level === "activity" ? strings.epic`). Renamed to activityKind/stepKind/step/newStep/parkActivity/parkActivityQuestion in the module and its only consumer; values unchanged.
  - `[false]` `[reject]` Blind: copy guard scans only .tsx and JSX positions — carried: the prior row "JSX guard proves every indirect source is centralized" still applies; the guard is deliberately bounded to JSX and complemented by source inspection.
  - `[low]` `[reject]` Blind: stop-word list has English false positives (die/den/des) and lacks common German words — carried for the missing-vocabulary half (maintained-list requirement, prior false row). The false-positive half is real but these words do not appear in the app's English copy, and a hit fails loudly with file:line; curating the user-maintained list is not a direct correction.
  - `[false]` `[reject]` Blind: hygiene scan scope misses templates, mcp and server sources, and decodes binaries — the acceptance scope is apps/web/src, seed data and built-in templates, all scanned; `packages/core/templates` does not exist yet; scanned directories contain only ts, tsx, css and .gitkeep files.
  - `[false]` `[reject]` Blind: apiUnavailable names only the Windows start script — it translates the pre-story German banner with the same meaning, and `scripts/start.ps1` is the only start script in the repository; cross-platform start belongs to Story 1.3.
  - `[false]` `[reject]` Blind: privacyDescriptions cast and exportTitle re-declared union drift silently — carried for the cast (prior false row). exportTitle's caller passes StoryMapViewKind, so adding a view kind fails typecheck at story-map-view-export.ts:60 instead of rendering undefined.
  - `[false]` `[reject]` Blind: root tsconfig alias lets server/packages import web copy — no file outside apps/web imports `@storymapper/ui-strings`; the Code Map required this alias, and no boundary violation occurs.
  - `[false]` `[reject]` Blind: workflow artifacts contradict (in-review vs done, deleted Auto Run Result, two deferred stores, empty memory header) — carried: in-review describes this running pass, the Auto Run Result is rewritten at finalization, sprint-status and deferred-work.md are orchestrator-owned, and .wolf/memory.md is hook-maintained.
  - `[low]` `[defer]` Blind: tracked .wolf files hard-code a machine-specific Node path and log tooling issues as project bugs — verified in STATUS.md and cerebrum.md. The fix edits agent-context files, so it is deferred.
  - `[low]` `[patch]` Edge: GitHub Sync tab icon touches its label after the migration dropped the literal space — verified pre-story `<GitBranch size={16} /> GitHub Sync` became `/>{strings.githubSync}` and `.view-tabs a` has no flex gap (other dropped spaces sit in containers with gap). Restored the space as JSX whitespace text.
  - `[false]` `[reject]` Edge: literal copy in .ts modules or non-JSX call arguments bypasses the guard — carried: same bounded-guard claim as the prior JSX-guard row.
  - `[false]` `[reject]` Edge: removed German UI words (abbrechen, speichern, ...) not in the stop-word list — carried: prior row "German UI vocabulary absent from stopwords".
  - `[false]` `[reject]` Edge: already-English epic/feature wording changed to Activity/Step — carried: prior "English terminology normalization violates preservation" row; the epic requires Activity/Step.
  - `[low]` `[reject]` Verification gap: root test never runs checkHygiene() against the real repository and verify.ps1 stops before it on macOS — carried: prior row "root test does not execute production source hygiene"; the separate check-hygiene command passed on the real tree in this pass.
  - `[false]` `[reject]` Intent: sprint-status.yaml written backlog → done — carried: orchestrator-owned pre-existing change, never written or reverted by this run.
  - `[low]` `[defer]` Intent: centralization is enforced only for JSX in .tsx files — carried: prior "indirect source detection ... differ from full-copy ownership" row; no new deferred entry.
  - `[low]` `[reject]` Intent: rendered tests cover only a few panels — carried: prior "static fixtures do not exercise ... all interactions" row.
  - `[low]` `[reject]` Intent: only the HTML export timestamp is tested, not PNG/PDF — carried: prior "HTML Blob test does not exercise ... PNG/PDF downloads" row.
  - `[false]` `[reject]` Intent: server-generated content and checker scope are partial under a repo-wide reading — the story acceptance names apps/web/src, seed data and built-in templates; server, seed and template sources are English, scanned and pinned by the public API test.
  - `[false]` `[reject]` Intent: per-line reporting and umlaut-free German detection — carried: prior rows on duplicate words per line and unlisted vocabulary.
  - `[false]` `[reject]` Intent: alias, exportLocale constant and summarizeOperations are borderline — the auditor notes exportLocale is a constant, not configuration; the alias has no outside importer; summarizeOperations is a count formatter the intent centralizes.

Two low patches applied (icon spacing, key renames); four new pre-existing low items deferred (enum labels, interface timestamp locale, naming capitalization, .wolf portability); one carried deferred item without a new entry. Verification-gap reviewer's single finding was carried as rejected.

## Verification

The user authorizes subagents as needed. Delegate disjoint migration work when useful; keep the string module coherent and inspect all resulting changes. Do not invoke another build-auto render/run. Use installed Node 24 at `[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin` first on PATH for checks; global default is Node 22. Dependencies were restored with the unchanged frozen lockfile and baseline tests (41) pass, including native SQLite tests. For required `scripts/verify.ps1`, its existing Windows-only runtime discovery is a known platform limitation to record, rather than alter or block the language migration.

- `corepack pnpm check-hygiene` — no German source findings.
- `node --test scripts/check-hygiene.test.mjs` — positive, negative and location cases pass.
- `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm build` — all pass with Node 24 and pnpm 9.15.4.
- `scripts/verify.ps1` — attempt required release check and record any platform runtime limitation without changing the separate runtime story. Windows-only local runtime is absent on this macOS checkout; noninteractive tests use installed Node 24 with its verified compatible native modules.


## Auto Run Result

Status: done. Follow-up review pass over the complete Story 1.1 migration (all web interface copy in `apps/web/src/ui-strings`, German translated with the same meaning, English defaults pinned by the public API test, `check-hygiene` gate). Four review layers ran; two low findings were patched without changing displayed values, handlers, option values or data.

Files changed in this pass:

- `apps/web/src/app/routes/story-map-shell.tsx`: restores the space between the GitHub Sync tab icon and its label (`.view-tabs a` has no flex gap).
- `apps/web/src/ui-strings/index.ts`: renames storyMapStrings keys epic/featureKind/feature/newFeature/parkEpic/parkEpicQuestion to activityKind/stepKind/step/newStep/parkActivity/parkActivityQuestion; values unchanged.
- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx`: uses the renamed keys.
- This spec: follow-up triage log, four new deferred items, this result.

Review: 27 findings — high 0, medium 0, low 13, false 14. Patched: 2 low (icon spacing, key renames). Deferred (new, all pre-existing low): raw enum identifiers and divergent sync-state labels, browser-locale interface timestamps, inconsistent Story Map capitalization, machine-specific `.wolf` entries; the JSX-only guard row was carried to the existing deferred item. Rejected with recorded reasons: fragment punctuation keys (no user-visible defect, non-trivial rewrite), stop-word false positives (loud failure, user-maintained list), and the false/carried rows listed in the follow-up triage log.

Follow-up review recommendation: false. This is a follow-up pass and no high entry was patched (patched counts: high 0, medium 0, low 2).

Verification after patches, Node 24.17.0 and pnpm 9.15.4:

- `corepack pnpm check-hygiene`: pass, no findings.
- `node --test scripts/check-hygiene.test.mjs`: 4 pass, 0 fail.
- `corepack pnpm test`: pass — web 9, db 19, server 16, core 5, importers 2, plus the four hygiene tests.
- `corepack pnpm typecheck`, `corepack pnpm build`: pass; build keeps the existing large-chunk warning.
- `pwsh -NoProfile -File scripts/verify.ps1`: stops at line 89 with "Local Node 24 was not found" — the known Windows-only runtime lookup on this macOS checkout.

Residual risks: browser-only paths (conditional dialogs, PNG/PDF downloads, Persona interaction round trips) remain covered by source inspection rather than browser tests. The icon-spacing fix was checked against CSS, not visually rendered.

Finalization: no commit was created, following the spec's "never commit without an explicit request" boundary; the orchestrator commits after its verify gate. The orchestrator-owned `sprint-status.yaml` change, untracked `.bmad-loop/` and `deferred-work.md` were not touched.
