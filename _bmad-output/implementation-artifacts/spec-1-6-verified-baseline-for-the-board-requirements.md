---
title: '1.6 Verified baseline for the board requirements'
type: chore
created: '2026-10-04'
status: done
baseline_revision: 88bd95f896fd767f7a66db959768be799de0025f
review_loop_iteration: 0
followup_review_recommended: false
context:
  - [REDACTED_HOME]/.claude/CLAUDE.md
  - [REDACTED_HOME]/Projects/StoryMapper/AGENTS.md
warnings: [oversized]
deferred: []
---

Purpose: establish Story 1.6's live board baseline from exact PRD requirements and existing implementation, with regression evidence and later-story ownership. Updated: 2026-10-04. Version: 2. Reproduce from the intent and checks below.

<intent-contract>

## Intent

**Problem:** The code alignment review labels board requirements without checking the running app. Later stories need trustworthy evidence of existing behavior and remaining gaps.

**Approach:** Check FR-8, FR-9, FR-10, FR-11, FR-13, FR-14, FR-15, FR-16, FR-17, FR-23 and FR-50 on the default production app; store a reproducible Met/Partial/Missing table under planning-artifacts. Add meaningful regression coverage for every fully Met requirement lacking it and map every incomplete requirement to existing stories in Epics 2–8.

## Boundaries & Constraints

**Always:** Judge every clause of each requirement at its user-facing surface. Distinguish default discoverability from direct-route capability, Core from parked Later scope, observed behavior from source/test evidence, and missing evidence from demonstrated absence. Use installed Node 24, one loopback origin and a disposable temporary Project; retain source revision, commands, steps, observations and limits. Coverage for a Met row must fail when its behavior regresses. List named closure stories for gaps, including parked scope ownership without inventing commitments. Keep source and PRD identifiers intact.

**Never:** Implement missing board features, repair product defects, add SaaS/telemetry/remote calls, run GitHub authentication or sync, modify user Projects, commit/push, write/stage/revert sprint-status.yaml, or treat orchestrator bookkeeping as verification.

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md:225–308,343–350,393–400` — exact requirement clauses. FR-50 at 267–274. Read-only; FR-12 visibility and FR-48 attachments are Later.
- `_bmad-output/planning-artifacts/epics.md:455–478,1935–2238` — story acceptance and closure mapping: 6.1 navigation; 6.2 creation/fields; 6.3 moves; 6.4 search/filter/bulk; 6.5 collapse/prefix/Notes; 6.6 five Core Views; 6.7 modal/Markdown; 6.8 customization; 6.9 Releases. Slices/Graph: 5.2/5.3; Card versions/history: 2.3/2.4. Read-only.
- `apps/server/src/server.ts:34`, `config/runtime.ts`, `config/local-env.ts:35` — environment-isolated DB and loopback startup; seed sample without touching default data.
- `apps/web/src/app/router.tsx:50`, `routes/story-map-shell.tsx:62–111`, `routes/RootLayout.tsx:81–103` — real routes, Card query, developer-gated views and navigation.
- `apps/web/src/features/story-map/components/DiscoveryMatrix.tsx:256–266,438–445,538`, `TreeGrid.tsx:35,124`, `CardTile.tsx:77–128,210–238` — inline hierarchy creation, lane moves, role/delivery fields and tree collapse; Notes and alternate move methods need live checks.
- `apps/web/src/features/story-map/useStoryMapBoardState.ts:9–20,205–225,321–356`, `components/BoardToolbar.tsx:87–120` — filters/search/selection/bulk; no color filter or bulk push/delete in current source.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx:168–230,302–398`, `DescriptionEditor.tsx:14–28` — URL close, scalar fields, Markdown storage, history/attachments/links. Inspect live save/reload and rich formatting.
- `apps/web/src/features/customization/CustomizationPanel.tsx:26–135`, `personas/PersonaDetail.tsx:44–74`, `releases/ReleasePanel.tsx:34–84` — creation-only customization, Persona CRUD and limited Release summary.
- `apps/server/src/http/routes/index.test.ts:51,154,190,257,346`, `packages/db/src/repositories/storymapper-repository.test.ts:144,176,257,759`, `apps/web/src/ui-strings/ui-strings.test.ts:123` — existing API/repository/static regressions; do not overstate them as browser interaction coverage.
- `_bmad-output/planning-artifacts/board-requirements-baseline-2026-10-04.md` — new baseline artifact, one aggregate row per scoped FR plus detailed checks/limits and precise closure mapping.

## Tasks & Acceptance

**Execution:**
- [x] Source paths above — inspect exact clauses and relevant existing tests; carry prior sample/checklist verification limits without treating claims as current evidence.
- [x] Runtime paths above — build production with developer features disabled and run one disposable Project; operate creation/editing, move alternatives, search/filter/bulk, tree collapse, navigation/history/direct Views, modal Markdown save/reload, customization and Releases.
- [x] `board-requirements-baseline-2026-10-04.md` — record all eleven rows and clause-specific evidence, reproducible setup/actions, existing coverage and named gaps; retain unexecuted performance/platform/external checks as limits.
- [x] Relevant existing web/server/core test locations — for each fully Met row without sufficient coverage add the smallest meaningful regression using existing tooling where possible; no product changes.
- [x] Baseline/spec artifacts — validate completeness and story ownership, run focused tests and serial full tests/release verification; remove owned temporary data/process/tab.

**Acceptance Criteria:**
- Given all eleven scoped FRs, when checked against the running app, then a planning-artifact table classifies each as Met, Partial or Missing with a reproducible check and evidence limits.
- Given a fully Met row without automated coverage, when verification completes, then an automated regression covers its required behavior and fails on a meaningful regression.
- Given a Partial or Missing row, when the baseline is complete, then it names the existing Epic 2–8 story closing each Core gap; parked Later scope is explicitly owned and no requirement is left without a story or a Met test.
- Given the verification task, when it ends, then product features and user data are unchanged and sprint-status.yaml has never been edited, staged or reverted.

## Spec Change Log

- 2026-10-04 v1: planned from exact Story 1.6 acceptance, cached epic context, prior Story 1.5 continuity and two read-only investigations. Graph tools are unavailable; targeted source reads substitute for scope discovery.

- 2026-10-04 v2: completed live baseline, review repairs and final serial gates; frozen intent preserved, task complete with staged files under the global explicit-commit-authorization boundary.

## Review Triage Log

### 2026-10-04 — Review pass 1

- verdicts: 17 findings — high 0, medium 2, low 11, false 4, maybe-false 0
- Four context-free lenses returned before triage. The platform rejected concurrent reviewer threads; reviews ran sequentially in the same parent turn, with no findings acted on before all reports returned.
- Shared patch entries: one medium (current-plan body) and four low (List, cleanup, FR-8 evidence, FR-23 scope). All five shared repairs were applied by the same implementation agent and inspected by the parent. Final verification also repaired the optional Fastify cleanup handle type without changing the assertions or product code.
- findings:
  - `[low]` `[reject]` Blind: deep-link coverage does not operate every View — The shared parent route validates Card search and StoryMapShell mounts one modal outside Outlet for all implemented Views. Chrome Discovery and real-router Tree checks protect that common behavior. More View/report fixtures add test scaffolding without a demonstrated route-specific defect.
  - `[low]` `[patch]` Blind: List toolbar lacks regression coverage — The DOM case covers B/I/H2 only, while live evidence also relies on List. Applied: the same save/remount case now operates List and asserts bullet Markdown plus rendered list/emphasis.
  - `[medium]` `[patch]` Blind: current connector push body is unasserted — The modal uses work-item plan/push; legacy issue-dry-run alone leaves the independent plan body assignment unprotected. Applied: the local HTTP fixture asserts the actual selected plan body without remote calls.
  - `[low]` `[reject]` Blind: complete generated Markdown is not parsed — The prefix assertion preserves the supplied rich fixture, the actual builder appends Markdown references and scalar metadata, and the DOM test renders the serialized formatting. A separate complete-body renderer adds tooling beyond a demonstrated invalid-output regression; live GitHub rendering remains explicitly unexecuted.
  - `[low]` `[patch]` Blind: HTTP test setup occurs outside cleanup protection — Initialization, seeding and registration can fail before try, leaving owned temporary files/handles. Applied: setup is protected immediately after directory creation, with nested cleanup for every initialized handle.
  - `[low]` `[patch]` Blind: Activity/Step edit claim exceeds live saves — Only Story editing was saved independently; Activity/Step modals were opened. Applied: the artifact distinguishes observed Activity/Step fields from independently saved/reloaded Story edits.
  - `[low]` `[reject]` Blind: interaction-count convention is unresolved — The artifact records Add activation, text entry and Enter, explicitly withholding the two-interaction claim. FR-8 is already Partial due to missing Notes and maps the count requirement to 6.2. Inventing a convention would turn a verification report into a new acceptance decision.
  - `[low]` `[patch]` Blind: Release-list closure differs from board focus — FR-23 requires default board focus exclusion, while 6.9 names the default Release list. Applied: the artifact names that acceptance mismatch under existing 6.9 ownership and retains parked FR-12 scope without a new delivery commitment.
  - `[false]` `[reject]` Blind: planned verification commands prematurely claim success — The Verification command bullets state expected successful outcomes; implementation evidence explicitly says parent gates pending. Parent has now executed 191 passing tests and successful verify.mjs. Final bookkeeping replaces the pending evidence with those actual outcomes.
  - `[low]` `[patch]` Edge: setup failures bypass HTTP fixture cleanup — Same verified setup-resource root as Blind cleanup: failures before try skip handle/directory release. Applied: the shared nested cleanup repair covers this row.
  - `[medium]` `[patch]` Verification: actual push-plan Markdown can regress while tests remain green — Pre-verified: plan HTTP tests assert counts and repository tests hash the produced body without checking the original description. The filed empty-body mutation remains undetected. Applied: the shared actual-plan HTTP assertion protects this body alongside Blind current-push coverage.
  - `[low]` `[reject]` Intent: DOM coverage differs from deployed browser interaction — The tests explicitly disclose memory history, mocked root layout/fetch and editor commands. Native Chrome operated the actual production opener, reload, rich typing and history. A further browser automation harness exceeds a direct correction; no missing running-app observation is shown.
  - `[low]` `[reject]` Intent: UI and SQLite regressions are complementary rather than connected — This layer boundary is explicitly documented. Real editor/API-client serialization is asserted, and actual HTTP/SQLite persistence is asserted for the same rich Markdown shape; live production acceptance connects them. A combined backend DOM harness would add cross-package test coupling without a demonstrated mismatch.
  - `[false]` `[reject]` Intent: local body preview differs from remote GitHub rendering — Story 6.7 explicitly specifies Issue-body validity tested on a fixture. Verification does not require authenticated remote mutation; the baseline names that limit. The accepted current-plan repair protects the actual outgoing constructor locally.
  - `[false]` `[reject]` Intent: bounded observations differ from exhaustive clause operation — All eleven FRs have live checks and known-gap classifications; unexecuted clauses remain explicit limits and named later work. No unoperated clause is used to label an incomplete FR Met. Story 1.6 requires each requirement checked, not every failed requirement rebuilt or every input variant operated.
  - `[low]` `[reject]` Intent: parked clauses have no committed delivery story — Each Partial aggregate row names existing Core closure stories. The PRD/epics explicitly park Later visibility/attachments/Timeline scope without implementation stories; the artifact retains that fact. Inventing stories or commitments would exceed the verification-only request.
  - `[false]` `[reject]` Intent: a diff cannot establish historical sprint ownership or skill invocation — Parent tool history shows the renderer executed exactly once, and every edit/stage/diff scope excludes sprint-status; no revert or row-as-proof occurred. Execution history is the evidence for this operational constraint; source diffs cannot and need not encode it.

### 2026-10-04 — Review pass 2 (follow-up on a done spec)

- verdicts: 23 findings — high 0, medium 0, low 19, false 4, maybe-false 0
- Diff excluded .wolf bookkeeping, the spec and orchestrator-owned sprint-status.yaml. Verification-gap layer reported none (it ran both new tests, 22/22 web and 1/1 server pass).
- findings:
  - `[low]` `[reject]` Blind: baseline hard-codes local nvm/repository/tmp paths — it records the actual session; versions and commands are explicit and reproducible; placeholder rewrite is cosmetic.
  - `[low]` `[reject]` Blind: cited /tmp logs are not durable — the same outcomes are stated in the artifact and re-runnable with the listed commands.
  - `[low]` `[reject]` Blind: pinned revision predates the new tests — the revision identifies the verified product source, which this story leaves unchanged; the tests are part of the change set.
  - `[low]` `[reject]` Blind: launch used tsx on port 4326, not start.mjs on 4317 — the artifact documents the isolation reason (avoid repository .env/DB); same server code and production web build.
  - `[low]` `[reject]` Blind: Timeline dates, Prio label direction and Release totals lack owners — Timeline is parked Later and recorded as unverified; the Prio label/filter direction depends on unsettled priority semantics and the artifact claims nothing; Release totals are named under 6.5 Note exclusion.
  - `[low]` `[patch]` Blind: FR-14 table row omits that Discovery status/estimate contradict the no-delivery-attributes clause the detail section records — Applied: row now states the contradiction.
  - `[low]` `[reject]` Blind: FR-15 Met on partial proof — carried: earlier pass rejected the same exhaustive-operation claim; unoperated items (live Issue, title save, focus trap) are not FR-15 clauses and are disclosed.
  - `[low]` `[reject]` Blind: no per-clause matrix — the Clause evidence section covers each clause; a matrix is format preference.
  - `[low]` `[reject]` Blind: nested try/finally cleanup — carried: pass 1 added it deliberately to protect setup failures.
  - `[false]` `[reject]` Blind: weak HTML-leak assertion — startsWith(description) already fails on any HTML conversion of the prefix; seed lookup is deterministic.
  - `[low]` `[reject]` Blind: jsdom exact pin, lockfile churn, singleton router, button lookup by text — cosmetic; caret change needs lockfile regeneration with no demonstrated harm.
  - `[low]` `[reject]` Edge: padded descriptions not covered (builder trims) — editor output is not padded; fix adds fixture variants without a reachable failure.
  - `[low]` `[reject]` Edge: Story lookup depends on seed content — deterministic repo seed; a seed change fails the test loudly.
  - `[false]` `[reject]` Edge: stale savedPatch can pass second Save — savedPatch is reset in beforeEach (test line 49) and the two expected descriptions differ.
  - `[low]` `[reject]` Edge: RootLayout mock leaves default navigation untested — carried: pass 1 rejected; layer split is disclosed.
  - `[low]` `[reject]` Edge: jsdom exact pin vs caret — same as the Blind jsdom row.
  - `[false]` `[reject]` Edge: sprint-status.yaml shows 1.6 changed — orchestrator-owned bookkeeping not written, staged or reverted by this run; not a defect and not verification evidence.
  - `[low]` `[reject]` Edge: non-reproducible paths/logs — same as the Blind rows.
  - `[low]` `[reject]` Edge: prefix claim ignores trimming — same as the padded-description row.
  - `[low]` `[reject]` Intent: tests exercise jsdom and API layers rather than the production surface — carried: pass 1 rejected; disclosed, live Chrome evidence covers the production surface.
  - `[low]` `[reject]` Intent: no single cross-layer test — carried: pass 1 rejected.
  - `[low]` `[reject]` Intent: default-navigation reach to the modal untested — carried with the RootLayout row.
  - `[false]` `[reject]` Intent: test/verify outcomes are asserted, not in the diff — carried: pass 1 false row; this pass re-ran both new tests green.

## Verification

**Commands:**
- `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH corepack pnpm test` — all workspace/script tests pass; run serially with build.
- `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH node scripts/verify.mjs` — source/Git hygiene, typecheck and build pass.

**Live checks:** Use a dedicated Chrome tab on the temporary loopback server. Record visible results for all eleven rows, exact default/hidden route distinction, meaningful Markdown persistence and relevant destructive-action limitations; remove all owned resources afterward.

**Implementation evidence (2026-10-04):** Production build with `VITE_DEV_FEATURES=false` passed at `88bd95f896fd767f7a66db959768be799de0025f`. Fresh disposable Project on `127.0.0.1:4326` was operated in Chrome; baseline records one Met (FR-15), ten Partial, and clause-specific source/live limits. Rich bold/italic/H2/list descriptions saved and reloaded as Markdown; navigation/history, creation, bulk changes, collapse, customization and direct hidden routes were observed. New complementary web DOM/router/editor and real HTTP/SQLite/Issue-preview regressions passed their focused run. Owned Chrome tab, server process and `/tmp/storymapper-board-baseline-unrue6` data were removed. Four review lenses and all five shared repairs are complete. Final serial full tests passed 191 tests with zero failures/skips; release verification passed hygiene, typecheck and build. A post-review typing failure in the optional Fastify handle was repaired using FastifyInstance and verified with server typecheck, focused HTTP regression and both full gates. No sprint-status inference is used.

## Auto Run Result

Status: done

- Summary: follow-up review of the completed baseline. Four layers returned 23 findings; one low patch applied, no deferrals, 22 rejected with recorded reasons.
- Files changed in this pass: `_bmad-output/planning-artifacts/board-requirements-baseline-2026-10-04.md` (FR-14 row names the no-delivery-attributes contradiction); this spec (triage log, result).
- Patches: 1 low. Deferred: 0. Rejected: 22 (reasons in Review pass 2).
- Follow-up review recommended: false (no high patched).
- Verification: `node scripts/verify.mjs --skip-typecheck --skip-build` passed after the doc edit; verification-gap layer ran both new tests green. The edit is documentation only, so the earlier 191-test and full-verify results stand.
- Residual risks: FR-15 coverage is split across jsdom and API layers; native-browser, Windows/Linux, 1,000-Card and live GitHub behavior remain unexecuted limits.
- Not committed: the intent contract forbids commit/push and the user's global rule allows commits only on request. Story files remain staged/modified in the working tree; sprint-status.yaml untouched by this run.
