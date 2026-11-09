---
title: 'Close Epic 6 retrospective findings and reassess acceptance'
type: 'bugfix'
created: '2026-10-18'
version: 1
status: 'done'
route: 'dispatch'
baseline_commit: '0ab788ae126be12acd48cbf0f546dbcca39cd692'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-17.md'
---

Reproducing statement: Execute the user's 2026-10-18 instruction to repair the Epic6 retrospective findings, work through its ten follow-up actions and reassess acceptance using actual evidence. Version:1; updated2026-10-18.

<frozen-after-approval reason="human-owned intent authorized by explicit remediation request">

## Intent

**Problem:** The loop completed all ten stories, but acceptance was rejected for default-color filtering and status re-review retry defects; the retrospective records further scope, position, live-edit and accessibility risks.

**Approach:** Repair confirmed defects, reproduce uncertain ones before repair, validate the integrated result, and reassess Epic6 against its declared requirements. The user explicitly requested the complete follow-up set; retain it as one remediation wave with separately testable groups. Existing uncommitted retrospective artifacts are this task's owned inputs, preserved without requiring a commit.

## Boundaries & Constraints

**Always:** Preserve canonical contracts, repository ownership, atomic version/conflict behavior, retained selection, source provenance and ChangeSet safeguards. Use disposable local fixtures. Honor accepted Epic6 timing diagnostics without changing older gates. Keep native/manual evidence distinct from DOM tests. Count visible selection as actually displayed in Discovery, following the existing UX language; retain hidden targets.

**Never:** Claim unavailable platform/screen-reader checks passed; change acceptance criteria to hide failures; operate on user databases; auto-apply live GitHub writes; commit or start Epic7. No irreversible changes or migration required.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
|---|---|---|---|
| Standard category | Absent and explicit default colors | Same visible chip/filter membership | Preserve other combined predicates |
| Status retry | Concurrent A→B, retained A draft, explicit re-review | Submit refreshed reviewed definition and affected versions | Atomic refusal for genuinely stale evidence |
| Restore adoption | Acknowledged10, actual restored4 | Next mounted edit submits4 | Normal stale writes still conflict |
| Positions | Mixed-role siblings / interleaved Release positions | Move choices match canonical rank; contextual create appends | Preserve explicit authored positions |
| Persona scopes | Removed creation map, valid selected Persona | Only unavailable target is disabled | Existing selected-scope validation retained |
| Tracking | Focused status/Release change removes control | Stable meaningful focus after adoption | Do not steal deliberately moved focus |
| Planning draft | Failed/invalid dirty text, blur, remote update | Hold adoption or require reviewed-version conflict | Retain draft and actionable error |
| Collapse | Selected descendants hidden by hierarchy/lane | Truthful displayed/hidden count; retained action targets | Inaccessible/deleted targets excluded |

</frozen-after-approval>

## Code Map

- `apps/web/src/features/story-map/useStoryMapBoardState.ts` — canonical filtering, retained selection and mutation version capture.
- `apps/web/src/features/customization/CustomizationEditor.tsx`, `features/personas/PersonasPanel.tsx` — refreshed review evidence and independent scopes.
- `apps/web/src/features/story-map/components/{MoveAreaDialog,CardComposer}.tsx`; `packages/core/src/changesets/position-resolution.ts`; DB Card repository — authoritative placement semantics; no alternate persistence path.
- `apps/web/src/features/conflicts/useLatestVersions.ts`, `features/releases/ReleaseKanban.tsx`, `components/PlanningNumberField.tsx` — epoch adoption, focus ownership and dirty drafts.
- `components/{DiscoveryMatrix,BoardToolbar}.tsx`, collapse stores — displayed selection counts; reuse one visibility calculation.
- `features/story-map/board-accessibility.test.tsx`, CRUD editor tests, `apps/web/package.json` — nonempty dedicated accessibility gate and actual consumers.

## Tasks & Acceptance

**Execution:**
- [x] A1/A2/A5 — repair color/re-review/Persona scope with focused regressions.
- [x] A4 — align placement UI defaults/options and prove real persisted ordering.
- [x] A3/A6/A7 — reproduce version/focus/dirty-draft boundaries, repair and regress.
- [x] A8 — share displayed-visibility rules and cover both collapse forms.
- [x] A9 — add populated CRUD-dialog accessibility coverage; exercise available native/browser matrix and state unavailable checks explicitly.
- [x] P1 — reconcile Epic6 umbrella state and record integrated acceptance evidence; preserve previous epic items.
- [x] Run focused tests, independent review, full workspace tests and release verification, then update retrospective verdict and exact action dispositions.

**Acceptance Criteria:**
- Given the retrospective's confirmed failures, when equivalent user flows execute, then expected filter, retry, position and scope behavior succeeds without weakening refusal guards.
- Given adopted live/Restore updates, when mounted editors continue, then versions, drafts, selection counts and focus remain truthful.
- Given unavailable platform evidence, when acceptance is assessed, then the release-conditional manual boundary stays explicitly tracked rather than silently waived.

## Implementation Notes

Completed2026-10-18:2478executed tests; release verify passes130capabilities and260a11y tests. All code findings repaired; A9 automated work complete, native release matrix remains explicitly in-progress. Earlier failures and exact final source fingerprint retained under evidence/epic-6-remediation. No commit/push.

User request authorizes execution of all existing retrospective actions and necessary tracking updates. Separate groups delegated with exclusive source ownership. No unresolved intent choice; contextual append is already stated in Story6.2 plan. Host lacks Windows/NVDA; attempt available checks without introducing software/account dependencies.

## Spec Change Log

## Review Triage Log

| Report | Verdict | Evidence / disposition |
|---|---|---|
| Blind1 | medium | Shared toolbar rendered outside Discovery; collapse leaked into other views. Patched with scoped Discovery wrapper and explicit view display IDs; route navigation regressions pass. |
| Blind2 | medium | Planning released rows are hidden independently. Shared existing show-all UI state with board context and used exact visible Story IDs; toggle regression passes. |
| Blind3 | low | Immediate deliberate edit after Restore originally required an avoidable refused submit. Explicit edit now captures changed revision; untouched old text still cannot write. |
| Blind4 | medium | Ordinary ConflictError could permanently retain obsolete numeric version. Existing ChangeAlert Reload/Keep mine now reviews current version; typed error, refusal and successful retry regressions pass. |
| Blind5 | medium | Refreshed status name was invisible alongside retained opening draft. Reviewed status name is displayed and tested independently of unchanged draft/title. |
| Blind6 | medium | Delayed acknowledgement guard was initially untested. Pending-response tests now prove actual board/Tracking callbacks cannot poison restored versions. |
| Blind7 | medium | Queued old Tracking edit could execute after Restore. Captured admitted epoch now refuses before API; exact pending/queued/restored regression passes. |
| Blind8 | medium | Separate UI request and repository tests did not establish complete Move path. Actual disposable runtime mixed Step/Note Move form offered2same-role positions, saved desired0, HTTP readback confirmed Step0/1 and Note4. SQLite close/reopen regression separately proves persistence. |
| Blind9 | low | Initial Tracking focus test omitted other controls. Added Release/detail/Unscope removal and deliberately moved focus cases. |
| Blind10 | maybe-false | DOM audits cannot establish native contrast/zoom/reader conformance. Existing A9/DW-96 release matrix retained as unverified; no invented WCAG failure. Available browser checks recorded separately. |
| Edge1 | medium | Same cross-view visibility defect as Blind1; independently verified and repaired. |
| Edge2 | medium | Same ordinary numeric retry defect as Blind4; explicit reviewed recovery repaired. |
| Gap1 | medium | Filed delayed-save verification gap confirmed; late-response tests now fail without epoch handling. |
| Gap-other1 | medium | Same shared-toolbar consumer defect; repaired with per-view IDs. |
| Gap-followup1 | medium | Remaining board writers skipped old success but still executed queued old intent after Restore. Extend admission guards before API and parameterized queue tests; 16epoch tests and45lifecycle tests passed; final workspace suite includes them. |


## Verification

- Focused affected web/core/DB regressions; demonstrate observed failures before repairs where practical.
- `corepack pnpm test` followed serially by `node scripts/verify.mjs`; retain exact results.
- Disposable built-in sample browser: default color, dirty modal, collapse and applicable editing/Restore flows. Native rendered and reader checks only where actually available.

## Changelog

- 2026-10-18 — v1: Scope derived from authorized ten-action retrospective remediation; no product edits at planning time.
