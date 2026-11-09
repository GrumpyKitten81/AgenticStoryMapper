---
title: '1.5 Sample map and getting-started checklist'
type: feature
created: '2026-10-03'
status: done
baseline_revision: f99fd9a70324b5de544e569ddb949a43f190c17c
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/.claude/CLAUDE.md
  - [REDACTED_HOME]/Projects/StoryMapper/AGENTS.md
warnings: [oversized]
deferred:
  - summary: >-
      downloadArtifact revokes the blob URL synchronously after anchor.click(), which may cancel the download in some browsers.
    evidence: |-
      Unverified (maybe-false): Chrome acceptance downloaded real HTML and ZIP files, so the pattern works there. Firefox/Safari behavior with an immediate revoke was not exercised. Settle by downloading an HTML export and the project archive in Firefox and Safari; if it fails, delay the revoke (for example setTimeout) after click.
    location: >-
      apps/web/src/app/api.ts:143-149
    severity: medium (unverified)
---

Purpose: implement Story 1.5 from Epic 1, FR-6 and AD-23 using the existing local runtime. Updated: 2026-10-04. Version: 4. Reproduce from the frozen intent, source map and acceptance below.

<intent-contract>

## Intent

**Problem:** The first visit redirects to a privacy introduction instead of a usable sample and checklist. Existing sample content is hard-coded, cannot be deleted through the map list, and onboarding progress is local browser state.

**Approach:** Show the Story Maps list with an English sample built from a JSON template and a short checklist whose actual completion and dismissal persist per Project.

## Boundaries & Constraints

**Always:** A Project with no Story Maps and an undismissed checklist receives a sample containing Activity, Step and Story from `packages/core/templates`. Reuse a human `createStoryMapFromTemplate` use case, with pure core planning and repository persistence. Initialize once per Project, atomically; preserve the initialization marker and sample identity after deletion. Existing Projects with maps receive no sample. Deleting the sample changes no other map, Persona, Workflow Status or Project setting. The sample must not create Personas or Workflow Statuses. Checklist items are create a Story Map, add first Cards, optionally connect GitHub, export once. Mark them from a non-sample map, an explicitly human-created Card (including additions to the sample), a persisted GitHub connection, and a successful export. Initial template, imported and AI/MCP-created Cards do not count. Completion is sticky, surviving deletion of matching data, reload and restart. Persist state in `project_settings` using the existing `ensureColumn` mechanism. Recognize matching existing data when provenance is known; do not invent provenance for legacy Cards. Client visual exports notify only after generation succeeds; server exports count only successful generation. All new UI text uses `ui-strings`, is English, and keyboard operable. First visit lands on the list with the checklist above it; preserve existing privacy introduction navigation.

**Never:** Write or revert `sprint-status.yaml`, infer verification from its rows, modify user Project data during validation, add dependencies, SaaS, telemetry or remote requests, introduce a template picker, LLM provider, unrelated architecture refactor, compatibility layer, commits or pushes. Keep contracts as the schema source and all SQL in `packages/db`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| First visit | Empty Project, checklist not dismissed | One sample hierarchy; four initially incomplete items | Atomic initialization; no partial sample |
| Existing maps | Project already has maps | Maps unchanged; no sample; matching progress recognized | No destructive migration |
| Dismissed empty Project | Persisted dismissal | No sample or automatic checklist | State remains persisted |
| Remove sample | Sample plus unrelated map/customization/settings | Sample removed; unrelated data/settings identical; restart never reseeds | Missing map returns explicit 404 |
| Human versus generated Cards | Initial template/import/AI/MCP, then human Card | Only human Card completes add-Cards item | Controlled provenance, not audit actor inference |
| Optional GitHub | Other provider, then GitHub connection | Only GitHub marks the optional item | No connection/auth/network launched by checklist |
| Export | Failed export, then successful server/client export | Failed export leaves item pending; success persists completion | Show export or persistence error |
| Reload/restart | Progress/dismissal, matching records later deleted | Progress/dismissal retained per Project | Invalid/unknown Project requests rejected |

</intent-contract>

## Code Map

- `packages/db/src/repositories/storymapper-repository.ts:124,395,1372,1736,2046,2284` — hard-coded `ensureSeedData`, Card creation, exports, connections and import/ChangeSet paths. Audit stamps all Cards human; cannot establish provenance. Keep existing sample titles, fix unsupported PDF/DOCX wording. Add template application, one-time initialization, progress and map deletion through repository methods; avoid growing this oversized file with independent state logic.
- `packages/db/src/schema/tables.ts:13,77`, `packages/db/src/connection.ts:361` — `project_settings` and Cards; append state/provenance via `ensureColumn`. Add an internal deleted-map marker via ensureColumn. Logically remove maps rather than cascading physical removal: preserve all Persona/Workflow Status rows (including sample-scoped), settings and surviving roadmap reference targets. Hide removed maps and their Cards/Releases at list/snapshot/mutation boundaries and exclude their data from recognition. Preserve Persona/Workflow Status visibility and editability as well as their rows/scopes: deletion must not turn these customizations into inaccessible data. Existing project Persona listing and scoped customization reads remain usable for retained customizations. No trash/restore UI is requested.
- `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `index.ts` — own template, checklist and HTTP schemas/types. Validate boundaries; client cannot set arbitrary completion flags.
- `packages/core/templates/sample-story-map.json`, `packages/core/src/story-map/*`, `src/index.ts` — English JSON content and pure template plan, including logical parent/release references. Verify JSON import/output under existing TS path/build settings; do not duplicate template text in DB.
- `apps/server/src/server.ts:40`, `http/routes/index.ts:149,232,834`, `mcp/tools/register-tools.ts` — startup seeding, human Card boundary, exports, MCP provenance. Initialize each Project once, expose scoped checklist/dismissal/export-success and map deletion endpoints. Project archive export includes all represented Projects.
- `apps/web/src/app/routes/index.tsx`, `story-maps.index.tsx`, `app/api.ts` — remove forced browser-local onboarding redirect, mount persisted checklist above list, sample badge/deletion, query invalidation.
- `apps/web/src/features/onboarding/GettingStartedChecklist.tsx`, `features/onboarding/OnboardingPanel.tsx`, `ui-strings/index.ts` — four semantic items, textual status, native links and dismissal button; retain privacy introduction.
- `apps/web/src/features/story-map/components/StoryMapExportActions.tsx`, `app/routes/story-map-shell.tsx` — pass Project identity; notify persistence after visual export resolves, expose errors.
- `scripts/check-hygiene.mjs`, `check-hygiene.test.mjs` — include `packages/core/templates` in English scan, update isolated source fixture.
- Relevant repository, routes and web tests use temporary SQLite and QueryClient/static render patterns; real browser acceptance must use an isolated temporary database.

## Tasks & Acceptance

**Execution:**
- [x] Contracts/core/template files above — define shared schemas and English template, implement pure human template plan.
- [x] DB schema/connection/repository files above — persist checklist/provenance; atomically initialize the sample and transact existing map/Card/GitHub creation with completion/audit/history. Use logical map removal preserving scoped customizations and cross-map references; filter deleted maps at existing reads/mutations and recognition. Do not infer historical export success from activity labels written before generation: recognize export completion only from the persisted success marker. Preserve raw known-human/map/GitHub recognition. Persist all represented-Project export completion in one transaction after generation succeeds.
- [x] Server/MCP files above — integrate initialization, validated HTTP actions, export success and generated Card provenance.
- [x] Web files above — retain list/checklist, sample removal and dismissal. Load maps after the checklist request settles even if it fails, showing that error. In app/api.ts and features/project-archive/ProjectArchivePanel.tsx await the existing archive download response, trigger the local artifact download, invalidate affected checklist queries after success, and show generation/download failures.
- [x] Hygiene files above — scan sample JSON and prove rejection with file/line evidence.
- [x] Relevant repository/server/web test files — extend prior matrix coverage with sample-scoped Persona/status preservation, surviving roadmap references, creation/completion rollback, atomic all-Project export completion, genuine old-schema upgrade, raw existing-data/historical-event recognition, archive success/failure refresh and checklist-error map accessibility. Close every new SQLite fixture/reopened handle before deletion.
- [x] Re-run focused/full release gates and isolated browser acceptance against the re-derived code; record exact evidence and limits.

**Acceptance Criteria:**
- Given a fresh Project, when `/` opens, then the Story Maps list shows the sample and four-item checklist, and opening the sample shows Activity → Step → Story from the JSON template.
- Given the checklist, when a non-sample map, human Card, GitHub connection and successful export are created, then the corresponding items mark themselves and remain complete on reload and restart.
- Given the sample plus unrelated data, when its native delete action runs and the app restarts, then the sample stays absent and unrelated maps/customization/settings remain unchanged.
- Given an existing map or dismissed checklist, when the app starts, then no sample is added.
- Given the new UI, when hygiene runs and keyboard navigation operates links, deletion and dismissal, then English checks pass and every action has a usable accessible name and keyboard path.

## Spec Change Log

- 2026-10-04 v4: automation completion check confirmed no pending task process, rechecked final passing logs, and refreshed the terminal result; implementation and frozen intent remain unchanged.

- 2026-10-03 v1: planned from exact Epic 1.5 ACs, AD-23, source and prior Story 1.4 continuity; retained orchestrator ownership and no-commit boundary.

- 2026-10-03 v2: hard deletion would cascade sample-scoped Personas/statuses and remove referenced targets. Revised DB Code Map/tasks to retain map aggregate rows behind a logical-removal marker and hide removed maps at existing boundaries. Added creation/export atomicity, existing/historical recognition and concrete UI error/refresh regression requirements from the same review. KEEP: English JSON hierarchy and pure plan; sticky per-Project state/sample identity; controlled human provenance; strict scoped endpoints; first-visit list/native checklist; audit self-event rollback; tested successful client export ordering and all original matrix tests. The intent contract remains verbatim.


- 2026-10-04 v3: review exposed two bad assumptions outside the frozen intent: row retention was treated as sufficient customization preservation, and pre-generation historical labels were treated as success evidence. Preserve Persona/status listing, reading, updating and deletion behavior after sample removal; do not infer export success from legacy labels. KEEP: English JSON/pure reusable template plan, one-time atomic initialization, controlled human provenance, durable sticky flags/dismissal/sample identity, logical aggregate retention, strict scoped endpoints, list/checklist/native keyboard flows, transactional map/Card/GitHub/export operations, audit self-event rollback, genuine old-schema upgrade/raw recognition, actual artifact generation and archive refresh. Also carry verified lower repairs into this re-derivation: atomically create a Project with its initial sample, ignore removed-map Cards in status usage, preserve surviving dual-target links, validate every newly supplied Card/Release target before link writes, reject deleted release assignments before Card writes, reject deleted-map import targets before auth/network/planning, and extend source-coverage regression assertions. No public endpoint or UI feature is added.

## Review Triage Log

### 2026-10-03 — Review pass 1

- verdicts: 23 findings — high 1, medium 10, low 8, false 4, maybe-false 0
- All four lenses returned before triage; platform limited active children to three, so intent launched when blind returned. No finding was handled before all launches/results.
- findings:
  - `[high]` `[bad_spec]` Blind: hard deletion cascades sample-scoped Personas and Workflow Statuses — Public creation routes accept sample scope; both foreign keys cascade. Revise the Code Map and deletion tests to preserve these records through logical map removal, including their IDs/scopes.
  - `[medium]` `[patch]` Blind: entity insertion precedes checklist persistence — New completion calls can throw after a map, human Card or GitHub connection is inserted, skipping audit/version writes. Add immediate transactions around the complete existing creation operations in re-derivation.
  - `[medium]` `[patch]` Blind: archive completion is partial across Projects — The post-generation loop commits each Project separately. Persist represented-Project completion atomically after generation in re-derivation and cover a later update failure.
  - `[low]` `[reject]` Blind: first archive contains pre-export completion — The snapshot correctly captures state before generation succeeds; original Project completion is persisted afterward. Changing snapshot construction to include its own future completion needs an asynchronous snapshot/rollback policy beyond a direct correction; ordinary reload/restart is preserved.
  - `[medium]` `[patch]` Blind: archive download leaves visible export item pending — downloadProjectArchive assigns window.location without notifying QueryClient. Make the existing download await a successful response and invalidate checklist queries; show failure rather than assuming success.
  - `[medium]` `[patch]` Blind: checklist query failure prevents map-list loading — Map query enabled is tied to checklist success. Allow it after the checklist attempt settles, retaining initialization ordering and an explicit checklist error.
  - `[false]` `[reject]` Blind: human-source ChangeSet proves human Card creation — HTTP human Card creation passes controlled human provenance. HTTP/MCP proposal generators use ai/mcp sources; a free source label is not an authenticated human creation boundary. Marking arbitrary human-source ChangeSets human would invent provenance.
  - `[low]` `[reject]` Blind: customized sample deletion needs confirmation or undo — The named delete action deliberately removes the sample and its Cards. Confirmation/undo adds a product surface not needed to implement deletion; the concrete unintended loss of Personas/statuses is handled separately.
  - `[medium]` `[patch]` Blind: DB test fixtures retain open SQLite handles — The new fixture helper and reopened connections are not closed before rmSync. Track and close them before directory removal, including failure paths.
  - `[medium]` `[patch]` Blind: previous-schema upgrade is not exercised — Legacy fixtures already have the new columns. Add an actual pre-column SQLite fixture and verify records/privacy values, unknown provenance and repeatable initialization after reopening.
  - `[medium]` `[patch]` Edge: human Card can survive a failed checklist update without history/audit — Same creation-atomicity root as the Blind row; wrap insertion, completion, version and audit in one transaction and force a completion failure in regression coverage.
  - `[medium]` `[bad_spec]` Edge: hard map deletion leaves surviving roadmap references to removed targets — Polymorphic target IDs have no FK; hard deletion removes referenced Cards/releases. The same logical-removal design retains targets and unrelated roadmap records, avoiding physical dangling references without rewriting other map data.
  - `[medium]` `[patch]` Verification: creation hooks mask existing-data recognition — Pre-verified regression gap. Insert matching map, known human Card and GitHub records without new completion hooks, assert initially pending state is recognized and persisted across reopen.
  - `[low]` `[reject]` Verification: dismissal/delete button handlers lack automated interaction coverage — Pre-verified automated coverage gap. Parent actually operated both native buttons with keyboard and observed cache/list changes, raw data equality and restart persistence. A DOM/browser test harness is more than a direct correction; static/API tests plus recorded live acceptance establish current behavior.
  - `[low]` `[reject]` Verification: export toolbar caller lacks automated interaction coverage — Pre-verified automated coverage gap. Parent activated the real toolbar, observed export-ready, inspected its downloaded HTML and saw persisted checklist completion. The helper covers failures; additional DOM scaffolding is not a direct correction.
  - `[low]` `[reject]` Intent: automated first-visit/keyboard checks are static — Accurate automated-test limit; actual Chrome first navigation, native Tab/Enter, sample opening, Card creation, deletion and dismissal were executed and observed. No unmet current behavior was demonstrated.
  - `[low]` `[reject]` Intent: automated reload/restart checks use reconstructed stores — Actual production server was stopped/restarted twice against the same temporary SQLite; browser reload proved progress/no reseeding and dismissal persistence. The automated tests retain narrower regression coverage.
  - `[low]` `[reject]` Intent: static tests do not execute action/refetch/render chains — Actual map/Card/HTML export actions visibly completed their items. Archive refresh is the separately verified patch above; a general automated-browser harness would add scaffolding beyond direct correction.
  - `[false]` `[reject]` Intent: connection configuration does not prove remote authentication — Exact story AC selects a persisted GitHub connection. Both HTTP tests and a live local POST established it without enabling outbound access; authentication belongs to its separate story.
  - `[false]` `[reject]` Intent: generated export does not establish artifact delivery — The selected AC is successful generation, and parent additionally inspected the downloaded HTML containing all sample titles and the added Card. Failed generation/persistence is covered by executed tests.
  - `[medium]` `[patch]` Intent: historical successful export events are not recognized — Existing exports.storyMapCreated and exports.auditCreated Activity Events are the persisted matching event surface. Recognize these actions for the Project and cover pending-state recognition without a new export.
  - `[false]` `[reject]` Intent: template reuse has no user picker — The architecture requires the reusable human template use case, implemented and tested; user-selected templates are Later scope. A picker would add a feature excluded by this story.
  - `[low]` `[reject]` Intent: diff narrative alone cannot prove workflow execution/sprint ownership — The parent directly observed the one renderer invocation and workflow execution; all edits/staging paths exclude sprint status. A diff cannot encode every tool action; no unsupported orchestrator bookkeeping was used as evidence.

The two bad-spec rows share destructive physical removal as their root cause. Lower patch entries are superseded by coherent re-derivation; their requirements are carried into the Code Map/tasks below. No deferred entry was added.


### 2026-10-04 — Review pass 2

- verdicts: 24 findings — high 0, medium 11, low 11, false 2, maybe-false 0
- All four reviewers launched and returned before triage. Platform permits three children; intent launched after verification returned. Two bad-spec roots require coherent re-derivation; lower patches are carried into v3 rather than applied separately. No deferred entry added.
- findings:
  - `[medium]` `[patch]` Verification: removed-map source coverage lacks outcome assertions — Pre-verified gap: existing coverage test physically deletes links; deletion fixture has none. Carry a sample/surviving-map link fixture with details, counts, ratio and reopen assertions into re-derivation.
  - `[medium]` `[bad_spec]` Verification: project Persona listing has no removed-map regression — Pre-verified gap allows public disappearance despite identical raw rows. Amend preservation to require unchanged public Persona availability and test project-wide, sample-scoped and surviving-map Personas; do not add the proposed exclusion expectation.
  - `[low]` `[reject]` Blind: first archive contains pre-export completion — carried: snapshot captures state before generation success; making it include its own future completion requires an asynchronous snapshot/rollback policy beyond a direct correction. Live reload/restart persistence is proven.
  - `[medium]` `[patch]` Blind: removed sample Cards block status deletion — deleteWorkflowStatus counts retained hidden Cards globally. Carry visible-Card usage filtering and a post-removal status-deletion regression; preserve rejection for visible usage.
  - `[medium]` `[patch]` Blind: Card writes accept a removed sample Release — create/update lack release guards, whereas bulk update already validates visible same-map Releases. Carry validation before individual writes and unchanged-state failure assertions.
  - `[low]` `[reject]` Blind: stale customization reads return 500 rather than 404 — Source confirms an ordinary thrown error; the target remains unavailable and deletion/main map reads already return explicit 404. Broad status normalization across legacy readers requires multiple new HTTP branches; stale-map requests are uncommon and this status difference is negligible. Retained Persona/status reads will instead remain usable under the bad-spec amendment.
  - `[medium]` `[patch]` Blind: import planning permits a removed target and remote work precedes validation — createWorkItemImportPlan omits visibility, and service plan/import resolves auth and fetches first. Carry an existing visible-map check before auth/network plus repository planning rejection; no connector flow is launched in tests.
  - `[medium]` `[patch]` Blind: Project creation commits before initialization — HTTP POST createProject then initializes; trigger failure leaves a Project despite 500. Carry one transaction around this existing operation and prove rollback/retry once.
  - `[low]` `[bad_spec]` Blind: historical activity labels cannot establish export success — Baseline logs both labels before serialization/build. Amend v3 to leave legacy labels uncounted and rely on durable success state; include old failed/unknown-label regressions without inventing provenance.
  - `[low]` `[reject]` Blind: recognition scans human Cards/events in memory — Query work is real, but no current scale/latency failure is shown; typical initial Projects are small. Replacing scans with joins/existence queries adds query complexity beyond direct correction. Removing untrusted export-label recognition also removes its event scan.
  - `[low]` `[reject]` Blind: visibility filtering adds per-source-link lookups — Source confirms extra queries; no current user-visible delay is demonstrated. Joined/cached query restructuring adds complexity beyond direct correction; cover actual report correctness instead.
  - `[low]` `[reject]` Blind: deletion/dismissal lose the focused button — Native buttons disappear after success; focus returns to the page and Tab still reaches surviving controls. These are one-time onboarding actions, and actual keyboard completion works. Adding imperative focus policy/refs is more than a direct correction for the negligible loss of position.
  - `[medium]` `[patch]` Edge: failed sample initialization leaves a Project — Same demonstrated Project-creation atomicity root; carry transaction and regression above.
  - `[medium]` `[patch]` Edge: surviving dual-target GitHub link becomes inaccessible — getGitHubLink requires both targets visible while list uses either. Carry matching either-visible read semantics so surviving-map link update/delete remains possible without changing its row on sample removal.
  - `[medium]` `[patch]` Edge: new link targets fail after writing — resolveGitHubLinkProjectId checks only the Card when both supplied; getGitHubLink then rejects the deleted Release after insertion/update. Validate every newly supplied target before writing; retain operability of pre-existing cross-map links after one target disappears.
  - `[medium]` `[patch]` Edge: hidden Cards prevent visible status deletion — Same visible status-usage root; carry filter and regression above.
  - `[low]` `[reject]` Intent: navigation/keyboard automation uses static markup — carried: actual Chrome first visit and native Tab/Enter operations were executed on v2, including creation, removal and dismissal; the automated limit does not show unmet behavior.
  - `[low]` `[reject]` Intent: most action-to-refetch tests use narrower surfaces — carried: live Card/map/HTML/archive actions visibly changed checklist status. Archive mutation coverage also runs awaited generation/download/invalidation; a general browser harness adds scaffolding beyond direct correction.
  - `[low]` `[reject]` Intent: automated restarts reconstruct repositories — carried: actual production server was stopped/restarted twice; browser reload proved persistence/no reseeding and dismissal. Storage tests remain narrower regressions.
  - `[medium]` `[bad_spec]` Intent: unchanged rows do not preserve customization operability — project Persona filter and private Persona/status guards hide/reject retained records. Amend v3 to preserve their public availability and editability, IDs/scopes and raw rows; logical map/Card removal still applies.
  - `[low]` `[bad_spec]` Intent: historical export labels were written before generation — Same unknown historical-success root; amend v3 to require the persisted success marker and never treat labels alone as successful generation.
  - `[false]` `[reject]` Intent: GitHub configuration does not establish remote access — carried: the exact story chooses persisted GitHub matching data; local configuration satisfies it without auth or outbound access.
  - `[false]` `[reject]` Intent: tests do not establish saved usable artifacts — carried: parent inspected actual browser-downloaded HTML and ZIP, checked content and ZIP integrity. The selected success criterion is generation; no artifact-delivery defect is shown.
  - `[low]` `[reject]` Intent: diff alone cannot prove workflow/sprint ownership — carried: parent directly observed renderer/workflow calls and excluded sprint from all mutations. Diff visibility is not the complete tool history; no orchestrator row was used as proof.

## Verification

- Node 24.17.0 first on PATH: focused DB/server/web tests and typechecks pass.
- `corepack pnpm test` passes; then serial `node scripts/verify.mjs` passes hygiene, typecheck and build.
- Isolated live browser: first `/`, sample hierarchy, keyboard actions, real human Card, successful HTML export, persisted dismissal and deletion across restart. No real user Project data or GitHub authentication is needed.

### Parent verification evidence — 2026-10-03

- Full `corepack pnpm test`: exit 0; 148 tests passed (61 scripts, 2 importers, 7 core, 18 web, 25 DB, 35 server), zero failures/skips. Following the audit-export preservation repair, focused DB 26/26 and HTTP/MCP 24/24 passed. Serial `node scripts/verify.mjs` passed Git/source hygiene, typecheck and all builds; existing Vite size warning is non-failing.
- Matrix audit: first visit/atomic rollback, existing maps, pre-dismissal, deletion isolation/restart, actual AI/import/MCP versus human Cards, non-GitHub versus GitHub, failed/successful server/client exports and persistence/invalid scopes all have executed passing coverage in the new DB, HTTP and web suites.
- Chrome on an isolated temporary database: `/` redirects to the list with one sample and four Pending items; keyboard opens Activity→Step→Story and saves a human Activity. HTML export reports ready; the actual downloaded file contains all sample titles plus the added Activity. Browser download-event collection timed out, but filesystem output and visible/persisted success independently confirm generation.
- Native checklist links support Tab/Enter. Creating a non-sample map completes its item; Card/export items complete automatically. Keyboard sample deletion leaves raw Project settings, Personas and global Workflow Statuses identical. Restart/reload retain progress and never recreate sample; keyboard dismissal stays hidden after a second server restart. A local HTTP GitHub configuration creation completes the optional item without authenticating or enabling outbound requests.
- Tests/browser used temporary SQLite only; no existing local Project data changed. The temporary server was stopped. No sprint-status write, commit or push occurred.

### Parent verification evidence — re-derived v2, 2026-10-04

- Complete staged-source `corepack pnpm test`: exit 0, 155 tests passed (61 scripts, 2 importers, 7 core, 21 web, 31 DB, 33 server); zero failures/skips. Serial `node scripts/verify.mjs`: exit 0, Git/source hygiene, typecheck and all builds passed. Existing Vite chunk-size warning remains non-failing. Logs are in `/tmp/storymapper-1-5-v2-tests-final-20261004.log` and `/tmp/storymapper-1-5-v2-verify-20261004.log`.
- First gate was started before new files were staged; the `git ls-files` portable checkout omitted them and setup failed. The same run encountered a pre-existing opener `kill EPERM`; complete rerun passed both cases without code changes. The isolated setup rerun also passed. No expectation was weakened.
- Matrix audit: all eight rows have executed passing coverage in getting-started DB/HTTP and web export suites. Positive raw-record and historical-event recognition, actual pre-column upgrade/reopen, scoped customization/reference retention and forced insertion/export rollback are covered. New SQLite handles are closed before fixture deletion.
- Actual Chrome production acceptance used a new isolated database on loopback port 58234. First `/` landed on the list with sample/four Pending items. Enter opened Activity→Step→Story; keyboard saved `Acceptance activity v2`; HTML export reported ready and its actual downloaded file contains the hierarchy and human Card. Tab from dismissal reached map creation; Enter created `Acceptance map v2` and all three corresponding items updated automatically.
- Created sample-scoped Persona/status through local HTTP before keyboard deletion. Raw Project settings, Personas and Workflow Status rows were identical afterward; other map remained visible. Server stop/start plus reload preserved removal and progress. Keyboard dismissal remained hidden after a second stop/start and reload.
- Second disposable Project had a pending export and a local persisted GitHub configuration (no authentication/network). Enter on Export project updated the visible export item to Complete. Actual ZIP contained database and manifest and passed zip integrity validation.
- No user Project data, sprint status, commits or pushes were changed. These are observations of v2 code, independent of orchestrator bookkeeping.

### Parent verification evidence — re-derived v3, 2026-10-04

- Parent read the full source diff and corrected four direct issues through the same implementer: require the supplied artifact filename, avoid snapshot/default-status side effects during removal, preserve scoped customization reads, and exercise serialization failure after the audit self-event is inserted. Focused suites passed, then the staged final source passed `corepack pnpm test`: **170 tests**, zero failures/skips (61 scripts, 8 core, 2 importers, 20 web, 44 DB, 35 server). Log: `/tmp/storymapper-1-5-v3-tests-final-20261004.log`.
- Serial `node scripts/verify.mjs` passed Git/source hygiene, all package typechecks and builds on Node 24.17.0 / pnpm 9.15.4. Log: `/tmp/storymapper-1-5-v3-verify-20261004.log`. Existing Vite bundle-size warning remains non-failing. Every edge matrix row has an executed passing test.
- Chrome acceptance against a fresh disposable SQLite database on loopback port 60536: fresh list has one English sample and four Pending items; Activity/Step/Story hierarchy and MVP render; keyboard Enter creates a human Activity, Tab/Enter creates another map; generated HTML completes Export and its actual 72,661-byte download contains the expected sample and human Activity.
- Keyboard sample removal leaves the other map and progress intact. Before/after SQLite comparisons show identical Project settings, Personas and workflow status rows. The retained sample-scoped customization endpoint still reads both; the Persona remains visible and keyboard-editable in the UI, and the status remains PATCH-editable. A real server stop/start retains completed items and does not reseed; dismissal stays hidden after a second stop/start and browser reload.
- A second Project starts independent Pending progress. Persisting a local GitHub connection (no authentication/network) completes only its GitHub item. Keyboard archive export completes Export; its actual 11,914-byte ZIP passes CRC validation and contains `manifest.json` and `storymapper.sqlite`. Temporary database, acceptance tab and owned HTML/ZIP downloads were removed after inspection.
- Browser coverage uses macOS Chrome with keyboard/native controls; automated client failure tests verify generation/download failures do not mark progress. No real user data, tokens, outbound connector calls, sprint-status writes, commits or pushes were used.

### 2026-10-04 — Review pass 3

- verdicts: 24 findings — high 0, medium 10, low 8, false 6, maybe-false 0
- All four reviewers launched and returned before triage. Runtime permits three children; intent launched after Blind returned. Nine medium and one low shared patch entries were applied by the same implementer; repeated attachment findings share one repair. No bad-spec/intent-gap root or deferred entry remains.
- findings:
  - `[false]` `[reject]` Blind: non-sample templates count as human Cards — The frozen exclusion names initial template Cards. The initial sample passes isSample=true and persists template provenance; the separate reusable human use case intentionally uses human provenance. No initial sample completes add-Cards.
  - `[false]` `[reject]` Blind: arbitrary human/import ChangeSet labels prove genuine provenance — Production proposal generators use ai/mcp sources; actual import writers pass import directly. No production caller establishes genuine human/import authorship via a free ChangeSet source label. Treating that label as trusted would invent provenance; controlled-human completion remains excluded.
  - `[medium]` `[patch]` Blind: matching legacy progress disappears if deleted before first checklist read — Initialization set only the marker/sample identity. Existing known matching records could be removed before recognize ran; persist recognition inside initialization and test deletion before the first read. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Blind: hidden-map attachments can be deleted without audit — deleteCardAttachment deleted before checking whether getCard returned a visible Card. Reject unavailable Cards before the write and assert HTTP deletion leaves the attachment/audit intact. Applied; focused and final full tests pass.
  - `[low]` `[reject]` Blind: removed-map Annotation/template reads advertise unusable records — Scoped reads retain these records while mutation guards reject hidden map scope. Current UI offers only visible map scopes, so this stale direct-API combination is uncommon. Harmonization needs additional visibility filters/branches or a new retained-entity policy, beyond a direct correction; Persona/status availability is separately preserved.
  - `[medium]` `[patch]` Blind: target validation creates default statuses before disabled-credential rejection — getStoryMapSnapshot calls listWorkflowStatuses, which inserts defaults for an empty status table. Replace this validation with the existing side-effect-free map listing and test unchanged rows on rejection. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Blind: sync handles credentials before removed-map validation — syncWorkItems resolved auth before createSyncRun rejected the hidden map. Add the existing side-effect-free target check before connection/auth handling and assert no auth call or writes. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Blind: visual completion commits before checklist initialization can fail — The endpoint committed markExportCompleted then called initialization/read separately. Return checklist state from the same completion transaction and assert sample-initialization failure rolls back completion. Applied; focused and final full tests pass.
  - `[low]` `[reject]` Blind: recognition scans human Cards across Projects — carried: query work is real but no present latency/user harm was demonstrated; typical initial Projects are small. New scoped/short-circuit queries add complexity beyond direct correction. Correct recognized outcomes have executed regressions.
  - `[low]` `[reject]` Blind: source visibility filtering adds per-link queries — carried: repeated reads are real but no user-visible delay is demonstrated. Joined/cached restructuring adds complexity beyond direct correction; removed-map report correctness is verified separately.
  - `[low]` `[patch]` Edge: pure template planning accepts Notes below Story/Note — Repository assertParentAllowed permits Notes only at root/activity/step. Extend the existing pure hierarchy condition and test invalid and valid Note parents, avoiding a plan that fails only during persistence. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Edge: retained GitHub target bypasses cross-Project validation — resolveVisibleGitHubLinkProjectId omits the hidden target; changing the surviving target to another Project passes. Compare both physical target Project scopes before writes and test both hidden-target orientations while retaining either-visible access. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Edge: removed-map attachment deletion bypasses visibility/audit — Same verified attachment-write root as Blind: an unavailable Card still permits the physical delete. Reject before deletion and cover the public route with unchanged rows/events. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Verification: removed-map report guards lack outcome regressions — Pre-verified gap: visible-map tests survive removing any of four deleted predicates. Extend HTTP deletion coverage to all four report routes, including surviving-map successful reads. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Verification: individual writes lack visible foreign-Release coverage — Pre-verified gap: hidden Release tests exercise only existence, and bulk foreign-Release tests exercise an independent guard. Add individual create/update foreign-visible fixtures with unchanged Card/history/activity assertions. Applied; focused and final full tests pass.
  - `[medium]` `[patch]` Verification: moveCard bypasses Release validation — Source confirms direct releaseId update after only parent validation; the public move route accepts the field. Invoke the existing Release guard before writes and cover hidden and visible foreign targets plus unchanged state. Applied; focused and final full tests pass.
  - `[low]` `[reject]` Intent: keyboard/first-visit automation uses static markup — carried: actual Chrome first visit and native keyboard actions were executed on v3. Automated static coverage is narrower but no current unmet behavior is shown; a new interaction harness adds scaffolding.
  - `[low]` `[reject]` Intent: action-to-refetch tests use narrower surfaces — carried: live map/Card/HTML/archive actions visibly changed progress. Automated helpers also cover generation/persistence failures and invalidation. General browser automation is more than a direct correction.
  - `[low]` `[reject]` Intent: automated restarts reconstruct repositories — carried: a real production server was stopped/restarted twice against the same temporary database; browser reload verified sticky progress/no reseeding/dismissal. Storage regressions cover the narrower automated surface.
  - `[false]` `[reject]` Intent: customization availability differs from row-only preservation — The current diff explicitly tests public Persona/status reads, updates and deletion in repository/HTTP scopes after removal. Live Persona editing and status PATCH also succeeded. There is no remaining row-only preservation defect at these surfaces.
  - `[false]` `[reject]` Intent: GitHub configuration does not prove authentication — carried: exact Story AC selects persisted matching GitHub configuration, established by tests and local acceptance. Authentication/remote access is not the selected onboarding criterion.
  - `[false]` `[reject]` Intent: generation tests do not prove filesystem delivery — carried: actual downloaded HTML and ZIP were inspected for expected content and ZIP integrity. The selected AC is successful generation; no artifact-delivery defect is demonstrated.
  - `[false]` `[reject]` Intent: reusable template lacks a selection UI — carried: reusable core/repository human template creation is implemented/tested. A picker is explicitly excluded by the frozen intent.
  - `[low]` `[reject]` Intent: diff alone cannot prove workflow/sprint history — carried: parent observed the renderer/workflow and tool history; every mutation/staging excludes sprint status, whose diff remains empty. Source diffs cannot encode tool execution history and no orchestrator row was used as verification evidence.

### Final parent verification — reviewed patches, 2026-10-04

- Parent read every final repair hunk and its regression tests. Focused suites passed: DB getting-started 30/30, HTTP getting-started 15/15, core template 8/8.
- `corepack pnpm test` passed **187 tests**, zero failures/skips: scripts 61, importers 2, core 13, web 20, DB 49, server 42. Log: `/tmp/storymapper-1-5-v3-reviewed-tests-20261004.log`.
- Serial `node scripts/verify.mjs` passed Git/source hygiene, typecheck and build. Log: `/tmp/storymapper-1-5-v3-reviewed-verify-20261004.log`.
- Fresh macOS Chrome acceptance on the final rebuilt source and disposable database, port 61864: `/` lands on the list; one sample/four Pending items; Activity/Step/Story/MVP render. Native Enter creates a human Activity; actual HTML generation/download completes Export. The 72,668-byte HTML contains the final human title. Native map creation completes its item; sample removal leaves the surviving map and completion intact. Actual server stop/start and browser reload show no reseed and sticky progress; native dismissal stays hidden on reload. Earlier v3 acceptance additionally exercised preserved Persona/status availability/editing, two restart cycles, independent GitHub configuration and CRC-valid archive download.
- All acceptance processes/tabs and owned temporary databases/downloads were removed. Frozen intent hash remains `53f82f0ce2d92e907bf7b3a5fb12de49ec930b0fc4838aaa34462a4098c483e9`; sprint status has no diff and was never edited, staged or reverted.


### 2026-10-04 — Review pass 4 (follow-up on `done`)

- verdicts: 38 findings — high 0, medium 1, low 24, false 11, maybe-false 2
- All four reviewers launched in one message and returned before triage. No bad_spec or intent_gap root; one test patch plus one cosmetic patch applied; one deferral.
- findings:
  - `[low]` `[reject]` Blind: soft-deleted map data stays in the SQLite file shipped by project archive export — logical retention is the v2/v3 design that preserves Personas, statuses and cross-map references; filtering the archive needs a new export policy beyond a direct correction.
  - `[low]` `[reject]` Blind: visibility filtering is per-method with JS filters and per-link queries — carried: pass 2/3 rows rejected the same per-link query claim; coverage of every guarded boundary is exercised by existing and new tests.
  - `[low]` `[reject]` Blind: cross-map Release/GitHub-link checks are scope creep and the repository file is oversized — the checks are the v3 carried repairs; oversize is the pre-existing `oversized` warning; no user-visible harm.
  - `[low]` `[reject]` Blind: three overlapping GitHub-link scope helpers — developer-only duplication, no diverging caller shown; consolidation exceeds a direct correction.
  - `[false]` `[reject]` Blind: provenance defaults/inconsistent gating (maps and connections complete without provenance, HTTP Card route always human) — the frozen intent requires provenance only for Cards; the HTTP human boundary is the specified controlled source (carried pass 1/3 rows); `unknown` default is exactly the no-invented-provenance rule.
  - `[false]` `[reject]` Blind: legacy upgrade surprises (unknown Cards, startup sample, no migration test) — intent requires no provenance for legacy Cards and a sample for Projects with no maps; `getting-started.test.ts` "upgrades an actual pre-column database" covers the upgrade.
  - `[low]` `[reject]` Blind: export completion recorded inconsistently, archive lacks own flag, endpoint trusts caller — carried: pass 1/2 first-archive rows; the client export-success call is the specified notification path.
  - `[low]` `[reject]` Blind: GET checklist initializes and recognition scans all human Cards — first-visit initialization is the specified behavior; scan cost carried from pass 2/3 rows (no demonstrated latency).
  - `[maybe-false]` `[defer]` Blind: downloadArtifact revokes the blob URL right after click and buffers the blob — Chrome works (real downloads verified); other browsers unverified. Grouped with the Edge row; deferred as medium (unverified).
  - `[low]` `[reject]` Blind: duplicated project-membership lookups, safeParse style, unused schema export — developer style only; no failure shown.
  - `[low]` `[patch]` Blind: UI polish — only the double `ui-strings` import and unindented `<div key>` were real; merged the import and re-indented the JSX in `story-maps.index.tsx`. Plain-anchor links are the specified native links (false), `storyMaps[0]` target and missing confirmation are carried/negligible (pass 1 confirmation row), delete endpoint is a human UI action not an agent change.
  - `[false]` `[reject]` Blind: onboarding store/route are dead code — `OnboardingPanel` still uses `useOnboardingStore`, and the route is the preserved privacy introduction.
  - `[low]` `[reject]` Blind: template plan duplicates hierarchy rules and naming — carried from pass 3 Note-parent row; no divergence shown.
  - `[low]` `[reject]` Blind: missing ADR/docs for soft delete and provenance — decisions are local to this story and AD-23; no cross-module consumer shown.
  - `[low]` `[reject]` Blind: test gaps (static web tests, concurrency, archive excluding deleted maps) — carried pass 1-3 coverage rows plus archive row above.
  - `[false]` `[reject]` Edge: sample can reappear after the only map was removed before first read — startup `ensureSeedData` and project creation initialize every Project before any delete is possible; `initialized` marker prevents reseeding.
  - `[low]` `[reject]` Edge: Card creation invalidates the checklist with an optional undefined `projectId` — the checklist refetches on list mount; no stale state beyond that.
  - `[maybe-false]` `[defer]` Edge: blob URL revoked synchronously after click — same root as the Blind download row; deferred.
  - `[low]` `[reject]` Edge: archive download failure leaves server-persisted export pending in UI — requires a post-generation client failure that is effectively unreachable; checklist refetches on mount.
  - `[false]` `[reject]` Edge: createCard on a Project without a settings row rolls back — `ensurePrivacySettings` runs at Project creation and startup initialization, so the row always exists.
  - `[low]` `[reject]` Edge: pushWorkItems on a removed map returns a generic error — carried pass 2 500-vs-404 row; plan creation rejects before any remote call.
  - `[false]` `[reject]` Edge: stale `lastActiveStoryMapId` links a removed map — the delete runs on the list page where `activeStoryMapId` is undefined, so `lastStoryMapParams` is undefined; opening another map overwrites it.
  - `[low]` `[reject]` Edge: export-with-progress hides that the file saved when recording fails — the matrix requires a visible persistence error; a distinct message is nice-to-have.
  - `[low]` `[reject]` Verification: StoryMapExportActions wiring has no caller-level test — carried: pass 1 export-toolbar row; live toolbar export verified.
  - `[medium]` `[patch]` Verification: removed-map guards on Story Map update, Annotations, Templates, Roadmaps, Product Context, Card history/attachments and sync conflicts are untested — added repository test "rejects removed-map Story Map, Annotation, Template, Roadmap and Product Context writes and hides Card details" with unchanged-row assertions; DB suite 50/50.
  - `[low]` `[reject]` Verification: delete button handler not exercised — carried pass 1 row; real keyboard deletion verified.
  - `[low]` `[reject]` Intent: `/` first-visit and checklist asserted only via static markup — carried pass 1-3 rows; Chrome acceptance recorded.
  - `[low]` `[reject]` Intent: opening the sample is tested at snapshot level, not rendered — carried; Chrome acceptance rendered the hierarchy.
  - `[low]` `[reject]` Intent: restart simulated by reopening storage — carried; real server restarts verified.
  - `[low]` `[reject]` Intent: delete action only checked as present — carried; keyboard deletion verified live.
  - `[low]` `[reject]` Intent: keyboard operation not simulated in tests — carried; native Tab/Enter verified live.
  - `[false]` `[reject]` Intent: hygiene check not run on the real repository — `node scripts/verify.mjs` runs it and passed in earlier passes; hygiene test proves rejection with file/line evidence.
  - `[false]` `[reject]` Intent: soft delete diverges from deletion wording — the contract only requires the sample to stay absent and unrelated data unchanged; logical removal was the v2 design.
  - `[false]` `[reject]` Intent: human provenance decided by route — carried; an HTTP Card route is the controlled human boundary.
  - `[false]` `[reject]` Intent: checklist links are plain anchors — the Code Map specifies native links.
  - `[low]` `[reject]` Intent: Add-Cards link targets the first map — reasonable target; no harm shown.
  - `[low]` `[reject]` Intent: privacy-introduction navigation unasserted — route and nav link are untouched; no regression shown.
  - `[false]` `[reject]` Intent: server export marks completion at generation and archive marks all Projects — this is the specified behavior ("server exports count only successful generation", all represented Projects).

## Auto Run Result

Status: done

- Summary: follow-up review pass on the completed Story 1.5 implementation; no implementation change was needed beyond one regression test and one cosmetic cleanup.
- Files changed this pass: `packages/db/src/repositories/getting-started.test.ts` (removed-map guard regression test), `apps/web/src/app/routes/story-maps.index.tsx` (merged duplicate `ui-strings` import, re-indented list item JSX).
- Findings: 38 (high 0, medium 1, low 24, false 11, maybe-false 2). Patches applied: 1 medium (test), 1 low (cosmetic). Deferred: 1 (blob URL revoke timing, medium unverified). All other findings rejected with reasons in the triage log.
- Follow-up review recommended: false (follow-up pass patched no high finding).
- Verification: `corepack pnpm --filter @storymapper/db test` 50/50, `corepack pnpm --filter @storymapper/web test` 20/20, web typecheck clean on Node 24.17.0. Full `pnpm test` and `verify.mjs` were not rerun after these two small edits.
- Residual risks: deferred download revoke timing in non-Chrome browsers. Not committed: the frozen intent forbids commits and the orchestrator owns commits and `sprint-status.yaml`; the working tree retains the staged story files.
