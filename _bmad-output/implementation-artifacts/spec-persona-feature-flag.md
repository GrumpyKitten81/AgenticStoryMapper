---
title: 'Disable Persona throughout the app interface behind a feature flag'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
baseline_commit: 'ac36592d960677da28907571a8e12a9bc62243b1'
context: []
---

<frozen-after-approval reason="human-owned request">

## Intent

After committing the completed auxiliary view/design work, hide Persona and disable its usage consistently behind a default-disabled feature flag, analogously to the existing feature flags. Preserve existing Persona data so enabling it restores functionality.

## Boundaries & Constraints

Implement the frontend capability gate using VITE_FEATURE_PERSONAS (not merely a view flag), default false with the shared exact true/false reader. Hide navigation, guard direct Persona URLs to the same Project Story Maps list, hide Customize links and Persona card details/chips/badges/accessible descriptions, remove Persona filter/bulk-edit controls, disable Persona search/filter effects and prevent Persona fields in UI bulk mutations while disabled. Filter the built-in Persona AI template out of app template choices when disabled. Preserve annotations, statuses, other templates and unrelated functionality.

Keep persisted data unchanged; enabling the flag restores existing Persona data and functionality. Existing API/MCP/exports/history stay intact for the frontend gate; parent has asked user whether backend capability blocking is additionally desired. Do not introduce backend changes without parent direction. Do not erase query/cache/snapshot Persona data to hide it. Audit other UI entry points and guard feature use at the relevant consumers. Old in-memory Persona filters must not invisibly filter cards or appear as active when disabled.

Update the Runbook flag description to explain this broader frontend capability gate and build-time operation; maintain metadata/changelog. No second commit or push requested.

## Tasks & Acceptance

- [x] Add flag/navigation/route gate, update test env and strict parser/navigation tests.
- [x] Gate Persona consumers throughout UI and neutralize hidden Persona search/filter/bulk payload effects, preserving enabled behavior.
- [x] Hide the built-in Persona AI template in frontend choices without mutating server or user data.
- [x] Document feature scope/defaults and run focused real-component regressions and typecheck/build.

Given unset/false, Persona navigation/deep links/assignment/filter/bulk/template controls are unavailable. Given persisted Persona links and stale filter/bulk state, disabled mode neither displays Persona labels nor searches/filters by them nor submits Persona mutation fields. Given true, existing Persona operations/labels/filtering work unchanged. Given invalid flag value, initialization fails clearly. Existing data remains unchanged across builds.

</frozen-after-approval>

## Code Map

- apps/web/src/app/feature-flags.ts: private strict boolean reader, independent Sources/Releases/Roadmaps exports. Add isPersonasEnabled. vite.config.ts integration test env should explicitly enable Persona for existing behavior tests; new tests exercise disabled with existing Persona data.
- app/routes/RootLayout.tsx, app/router.tsx, features/customization/CustomizationPanel.tsx: sidebar, deep route and secondary link.
- features/story-map/components/BoardToolbar.tsx: Persona filter and add/remove bulk selects. useStoryMapBoardState.ts: matchBoardCard haystack/Persona filtering, hasActiveBoardFilters consumer, personaNamesByCardId, bulk request fields. board-filters.ts active filter detection must ignore disabled Persona filter.
- features/story-map/components/CardDetailModal.tsx: ChipSection Persona assignment and mutations. CardTile.tsx: displayed Persona names and describeCardState accessible labels; DiscoveryLanes/Matrix pass personaNames props. Gate final tile consumer as well as computed board metadata.
- features/ai-mcp/AiMcpPanel.tsx and TemplateEditor.tsx: template options from defaultAiFunctionTemplates and server template data; built-in id is personas. Investigate state selection so disabled stale choice cannot execute accidentally.
- app/api.ts usePersonas query may gate enabled; do not alter backend, generic exports/history or delete data.

## Implementation Notes

Graph tools unavailable; source inspected directly. Commit of prior work is ac36592d960677da28907571a8e12a9bc62243b1; tree clean initially. Parent handles browser smoke tests, independent review and final bookkeeping. Do not invoke skills, spawn agents, commit or push. Report actual coverage/remaining limits. Read matching repository guidance before edits.

- Scope clarification offered asynchronously: recommended frontend-only gate, consistent with existing flags. No user answer yet; implementation proceeds only on independent frontend work. Backend/API/MCP changes not authorized by a resolved choice and not made.
- Edge review exposed explicit Persona/cardPersona operations through generic ChangeSet review; include UI approve/apply/undo guard while preserving readable history and unrelated changes. No blanket blocking of implicit link effects from ordinary card operations.

## Review Triage Log

- Blind review: no actionable findings in original flag/consumer implementation.
- medium, patch: edge review verified existing Persona/cardPersona ChangeSets could still be approved/applied through generic browser review. Added selection-aware UI eligibility and direct mutation guard; readable history, reject and unrelated selected operations preserved. No undo UI caller exists.
- medium, patch: verification reviewer demonstrated removing cardPersona classifier branch would evade initial mixed-operation test. Add standalone set/unset selection assertions with blocked writes/no POST.


Implementation verification note: the first focused run passed 88/90 tests. Two new card tests assumed an `aria-pressed` chip state and a `.sr-only` description; the existing components use the `selected` chip class and `aria-description`. Assertions were corrected to inspect those actual semantics. Typecheck also caught omitted `projectId`/`releaseName` fixture fields; fixtures were completed without changing production contracts.

Implementation verification: 93 focused tests across seven files passed, including explicit card-Persona-only ChangeSet selections, disabled/enabled card consumers, stale filters and bulk intent, template choices and reserved IDs, strict flag parsing and same-Project navigation. Frontend typecheck, Persona-enabled build, final unset/default Persona build and `git diff --check` passed. Only existing Vite native-config and chunk-size advisories remain. Browser smoke tests, independent review and final bookkeeping remain with the parent. No backend or persisted-data changes, commit or push.

Final parent verification:310 Accessibility tests20files passed (overlap with93 focused); source hygiene and whitespace passed. Live default build confirms no Persona sidebar/Customize link, same-Project bookmark redirect, card assignment heading absent while Annotations remains, and no Persona AI template button/option. No user-data writes performed. Three review layers complete; explicit ChangeSet write gap and cardPersona-only test gap patched. Backend/MCP remain intentionally available; frontend-only behavior documented. Prior work committed as ac36592d960677da28907571a8e12a9bc62243b1; new Persona work left uncommitted as only the initial commit was requested.
