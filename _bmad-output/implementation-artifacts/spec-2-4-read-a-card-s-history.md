---
title: "2.4 Read a Card's history"
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: 'e5e3fe4c8ffb5c564a8c84f0071f1422a6b9406a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '[REDACTED_HOME]/.claude/CLAUDE.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/AGENTS.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/OPENWOLF.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.wolf/cerebrum.md'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/code.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/comments.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/typescript.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/logging.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/testing.mdc'
  - '[REDACTED_HOME]/Projects/StoryMapper/.cursor/rules/markdown.mdc'
warnings: [oversized]
deferred:
  - summary: >-
      Existing saved Card snapshots do not retain owned relationship or attachment values for historical comparison.
    evidence: |-
      The unchanged baseline writeCardVersion stores only Card scalar snapshots. Owned-only actions already created versions without relationship snapshots before Story 2.4. Historical relationships cannot be reconstructed accurately from current join tables; this read feature exposes every retained version and explicitly reports the absence of scalar changes, without inventing values. Complete aggregate historical capture would require a separate write/storage change.
    location: >-
      packages/db/src/repositories/cards-repository.ts:414
    severity: medium
---

Date: 2026-10-04. Version: 3. Purpose: implement Story 2.4 and FR-47 from Epic 2: paged, attributed Card history in the detail modal with field comparisons and expandable long descriptions. The orchestrator owns sprint-status.yaml; never write, revert or stage it. No commit/push is authorized.

<intent-contract>

## Intent

**Problem:** The Card modal eagerly loads every history snapshot, hides all but eight, and omits actor type/session and before/after values. Users cannot inspect who changed a Card or browse its full saved history.

**Approach:** Expose bounded newest-first history pages and display them on demand in a dedicated detail-modal panel with attributed entries, scalar field comparisons and expandable long values.

## Boundaries & Constraints

**Always:** Preserve atomic attributed version creation and AD-7 save coalescing. Use actual saved versions, not individual coalesced saves. Show every saved version through pagination, newest first, with version number, actor type, actor identity/host, optional MCP session and time. Compare the existing Card snapshot fields against the immediately preceding saved version, including the oldest item on each page. Creation has no prior snapshot and is labeled clearly. Owned-only revisions with no scalar changes remain visible and explicitly say no Card field changes; do not invent missing historical relationship data. Long description before/after values truncate initially and offer keyboard expansion. Lazy-load the first bounded page when History opens; a 200-version fixture must render the first page within 300 ms in the real browser/local API. Show loading, empty and actionable error/retry states, preserving existing entries on page failure. Refresh History after successful modal mutations. All UI copy is English from the string module; controls have visible focus and native keyboard behavior. Use contracts as schema source and repositories for all persistence. Preserve full ascending internal history reads for MCP/export callers, existing hidden-map filtering and HTTP missing-Card 404 behavior.

**Never:** Restore individual versions, change coalescing/counter rules, migrate disposable development databases, implement generic Dialog behavior owned by Story 6.7, add dependencies/cloud/network, touch user data, silently hide failures, commit/push, or modify/stage/revert sprint-status.yaml. Required workflow artifacts and meaningful tests are authorized by this skill invocation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Saved history | Three actual versions by distinct actors | Three newest-first entries with actor/type/session/time and accurate field before/after | Empty history has explicit empty state |
| Long description | Before or after exceeds display preview | Bounded preview; expand/collapse reveals exact full text with keyboard | Text is rendered safely, never interpreted as HTML |
| Large history | 200 actual versions | Bounded first page under 300 ms; subsequent pages reach oldest without duplicate/omitted rows | Page failure retains loaded entries with retry |
| Page boundary | First/last item and noncontiguous versions | Immediate older stored snapshot supplies before values; creation has null predecessor | Invalid cursor/limit rejected by shared query schema |
| Attribution and refresh | human/agent/GitHub/system and modal save | Text/icon actor cue, optional session; successful mutation refetches current history | Loading/error announced, never mistaken for empty |
| Access and controls | Missing/hidden Card; keyboard navigation | Existing 404/visibility; open, load-more, expand operable with visible focus; no restore action | Explicit API errors |

</intent-contract>

## Code Map

- `packages/contracts/src/schemas/domain.ts:309`, `src/api/http.ts:214` — existing version summary and HTTP response; define a paged entry with nullable previousSnapshot plus bounded query/cursor/response schemas and inferred types.
- `packages/db/src/repositories/cards-repository.ts:328`, `storymapper-repository.ts:49` — existing ascending read/binding; add descending bounded read using indexed (card_id, version), one extra predecessor row and existing visibility checks. Reuse `repository-values.ts:126` scalar comparison; do not change writers at :414.
- `apps/server/src/http/routes/index.ts:331` — history route currently loads all; validate shared query and call page repository. Existing `index.test.ts:172` checks history and attachment compatibility.
- `apps/web/src/app/api.ts:339` — hook becomes enabled-on-open infinite query with typed parsed response and version cursor.
- `apps/web/src/features/story-map/components/CardDetailModal.tsx:32,63,313` — remove eager/capped history, mount keyed dedicated panel and invalidate history alongside successful mutations.
- New `CardHistoryPanel.tsx` and bounded presentation helper/component in the same directory — lazy History button, attributed field comparisons, native expansion, page action and status/error regions.
- `apps/web/src/ui-strings/index.ts:513,620`, `styles/global.css:1524,3156` — reuse labels/date formatting and focus styling; add only needed copy/layout.
- `card-detail.test.ts` — real router/modal with fetch fixtures; extend for lazy pages and comparisons. New focused db/server tests exercise true SQLite/page predecessors and invalid queries; rendered panel tests cover errors, expansion and refresh.
- Cached Epic 2 context is current. Story 2.3 established coalescing, durable snapshots and hidden-map visibility. Two read-only investigation agents inspected actual source; graph tools unavailable in tool inventory.

## Tasks & Acceptance

**Execution:**
- [x] contracts `domain.ts`, `api/http.ts` — add paged history schemas and inferred types.
- [x] db dedicated `card-history-repository.ts` and `storymapper-repository.ts` — bounded descending page read with predecessor and owner visibility; preserve existing full read.
- [x] server `http/routes/index.ts` and focused history tests — validate parameters and serve bounded pages/explicit failures.
- [x] web `app/api.ts`, `CardDetailModal.tsx`, new History panel/presentation components, strings and CSS — lazy paged accessible comparison UI and mutation invalidation.
- [x] focused db/server/web tests and production browser acceptance — execute every matrix row with real saved-version fixtures, page boundary checks and measured 200-version first-page rendering.

**Acceptance Criteria:**
- Given three saved versions, when History opens in the Card detail modal, then all three appear newest first with version, actor type/identity, time and changed fields before/after.
- Given an agent entry with an MCP session, when rendered, then agent and session identity are visible.
- Given a long description change, when rendered, then both values are truncated with a keyboard-operable control revealing the complete values.
- Given 200 versions, when History opens, then only the first bounded page loads and renders within 300 ms; when more pages are requested, then every saved version becomes accessible.
- Given the History panel, when operated by keyboard, then opening, paging and expansion have visible focus and English labels, and no restore action is offered.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass 1
- verdicts: 14 findings — high 0, medium 10, low 1, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: frontend fixture uses cursor 3 after versions 3/2 — Corrected exclusive cursor to 2 and exact forwarded-request assertion; real SQLite/HTTP already used the correct last-visible-version cursor.
  - `[medium]` `[patch]` Blind: reopening renders and refetches all cached pages — Retain the first page on close/unmount and on later closed-cache updates; rendered reopen/remount tests verify a single initial request/page.
  - `[low]` `[patch]` Blind: delayed mutation invalidates the newly displayed Card — Removed current-card restriction and invalidate the history prefix; delayed A-save completion after B navigation now verifies A's cached query invalidation.
  - `[false]` `[reject]` Blind: oldest surviving version above 1 is mislabeled creation — No production path deletes Card Version rows; only explicit test SQL deletes history. Creation version 1 is retained even after Card deletion, and prototype migrations are excluded by AD-9. Missing initial history from manual database corruption was not demonstrated as a reachable application state.
  - `[medium]` `[patch]` Blind: loading announcements are deferred by aria-busy — Move the always-mounted status region outside the busy content; pending-state regression verifies no busy ancestor.
  - `[medium]` `[patch]` Blind: recovery/final paging removes the focused button — Remember whether the user focused that action; after its removal return focus to the stable History button without taking focus from another control. Rendered retry/final-page checks pass.
  - `[medium]` `[patch]` Blind: expansion controls have duplicate names between versions — Include the saved version in the field/side accessible label; rendered tests verify unique names and correct expanded labels.
  - `[medium]` `[patch]` Blind: character previews preserve hundreds of short lines — Bound previews to six lines and 240 characters; an 80-line description expands to its exact complete value in the rendered regression.
  - `[medium]` `[defer]` Intent: complete aggregate history includes owned relationships — Baseline writers already omit relationship/attachment snapshots; no read can reconstruct historical values from current joins. All retained versions are shown, owned-only revisions explicitly state no scalar Card changes, and the pre-existing capture limitation is recorded in the single deferred list.
  - `[medium]` `[patch]` Intent: mocked UI pagination differs from real cursor semantics — Same fixture root cause as Blind's first finding; corrected to cursor 2 and tested across the page boundary.
  - `[false]` `[reject]` Intent: native keyboard/performance acceptance is not executable in committed tests — The story requires the real-browser outcomes, not a committed browser automation runner. Parent actually operated production Chrome, measured 24.4 ms for the first 20/200 versions and paged/expanded with Enter/Space; separate rendered/API/SQLite tests remain automated. No claim is made that mocked clicks establish native behavior.
  - `[false]` `[reject]` Intent: a diff cannot prove sprint-status/workflow execution — This is an evidentiary limitation of reviewing a diff, not a defect. Tool evidence records one exact renderer invocation, snapshot execution, independent gates and explicit staging paths; no command wrote, reverted or staged sprint-status.yaml, and its rows supplied no verification evidence.
  - `[medium]` `[patch]` Gap: boolean/numeric/cleared comparison branches lack verification — Added field-scoped exact before/after assertions for true/false, 5/0 and reader/null, preventing false zero values from becoming empty strings.
  - `[medium]` `[patch]` Gap: owned attachment mutations do not verify open History refresh — Operate both attachment creation and deletion through the actual modal; new revisions 4/5 appear with no scalar fields. Assertions target the newest entry.

Edge Case Hunter returned zero findings. Every reported finding has an individual row; shared patch root causes are grouped only for patch-count computation.

### 2026-10-04 — Review pass 2 (follow-up)
- verdicts: 26 findings — high 0, medium 3, low 10, false 13, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: page payload carries snapshot plus previousSnapshot and unbounded descriptions — Bound is entries per page (max 100) on a loopback API; no demonstrated harm and the fix redesigns the contract.
  - `[false]` `[reject]` Blind: unguarded snapshot parsing turns an old row into a 500 — Rows are only written by the app in the current shape; prototype/legacy databases are excluded by AD-9 and a loud failure is the fail-fast policy.
  - `[low]` `[reject]` Blind: changed-field list duplicated in `changedCardFields` and `FIELD_LABELS` — Both hold the same 13 fields today; divergence is speculative and the fix adds a shared constant.
  - `[medium]` `[patch]` Blind: `changedCardFields` null/absent normalization applies to every caller without tests — Behavior is correct (no phantom changes) and only history paths call it; the missing regression coverage is fixed with the gap patch below.
  - `[low]` `[reject]` Blind: raw ids, markup text and position numbers shown instead of readable values — Intent asks for scalar before/after values with text rendered safely; resolved titles are nice-to-have.
  - `[low]` `[patch]` Blind: expanded button's accessible name omits its visible text (label-in-name) — Expanded label now reads "Collapse value for Version N, field, side"; rendered test updated.
  - `[medium]` `[patch]` Blind: focus returns to History button after paging/retry instead of the new entry — `carried` from pass 1 (focus-return repair); decision stands and no further change.
  - `[low]` `[reject]` Blind: cache trimming brittle, history stale after outside writes, 404-before-400 untested — Effects list all closure inputs; 404-first preserves existing behavior; React Query refetches on window focus; the fix adds invalidation plumbing.
  - `[false]` `[reject]` Blind: new `@storymapper/web` alias for one feature — Mirrors the existing `@storymapper/server/*` alias convention; relative imports elsewhere in the modal are pre-existing.
  - `[false]` `[reject]` Blind: endpoint contract undocumented — Markdown documentation is excluded by project rules; the shared Zod contract is the schema source.
  - `[low]` `[reject]` Blind: loose strings (unknown actor, fixed `en` locale, surrogate split) — actorType is a closed enum validated by the contract; locale matches the string module's existing date formatting.
  - `[low]` `[reject]` Blind: test gaps (limit=100 boundary, concurrent insert, UI-only coalescing note) — Page boundaries, 200-version paging, hidden maps and defaults are covered; remaining cases are speculative.
  - `[false]` `[reject]` Edge: stored snapshot failing parse breaks the page — Same as the Blind parse row; fail-fast, unreachable via the application.
  - `[low]` `[reject]` Edge: open panel stale after writes outside the modal — Intent requires refresh after modal mutations only; window-focus refetch already applies.
  - `[low]` `[reject]` Edge: 240-character slice can split a surrogate pair — Cosmetic in a preview only; expansion shows the exact value and the fix adds code-point handling.
  - `[low]` `[reject]` Edge: trailing newline after six lines shows an expander with nothing to reveal — Negligible whitespace-only case; the fix adds a branch.
  - `[false]` `[reject]` Edge: `limit=1e1`/padded numerics accepted — Coerced values still pass the integer, range and positive checks; no wrong result follows.
  - `[false]` `[reject]` Edge: shared helper change alters MCP/export `changedFields` — Only removes phantom absent-versus-null changes; ordering, shape and snapshots unchanged. Coverage added by the gap patch.
  - `[false]` `[reject]` Edge: oldest retained row above version 1 labeled created — `carried` from pass 1; no application path deletes version rows.
  - `[false]` `[reject]` Edge: out-of-range cursor returns 200 with empty versions — Intended keyset behavior; the UI never requests it and an empty page is a valid response.
  - `[medium]` `[patch]` Gap: absent-versus-null and cleared-value `changedFields` branches unpinned — Added a real SQLite regression: absent→null gives no change on both paged and ascending reads, value→null reports `assignee`.
  - `[false]` `[reject]` Intent: 300 ms real-browser budget not asserted in committed tests — `carried` from pass 1; browser measurement is recorded evidence and automated tests cover the logic.
  - `[false]` `[reject]` Intent: real key events not exercised in committed tests — Controls are native buttons; Enter/Space operation was exercised in production Chrome and recorded as evidence.
  - `[false]` `[reject]` Intent: no focus-visible styling in the diff — Existing global button focus styling applies and the 2px outline was verified in a production screenshot.
  - `[false]` `[reject]` Intent: HTTP route order flipped to descending — The intent requires newest-first in the modal; the ascending read is the repository `listCardHistory`, which is unchanged.
  - `[false]` `[reject]` Intent: first-page cache trimming is an unrequested addition — It implements the bounded lazy-load requirement and was introduced by pass 1 repair with its own tests.

## Design Notes

Use descending version keyset pagination with one extra row: it both indicates another page and supplies the predecessor for the last visible entry. Historical relationships cannot be reconstructed from today's tables; the saved Card snapshots remain authoritative. Keep internal full-history callers unchanged because MCP currently takes the last five ascending rows.

## Verification

Use installed Node 24 via `PATH=[REDACTED_HOME]/.nvm/versions/node/v24.17.0/bin:$PATH`. Explicitly stage new source files for portable git-ls-files fixtures, excluding sprint-status.yaml. Run tests and production build serially.

- Focused db/server/web tests: all matrix checks pass, no skips.
- `corepack pnpm test`: workspace tests pass without failures/skips.
- `node scripts/verify.mjs`: hygiene, runtime, typecheck and production build pass.
- Disposable production browser/server: measure History opening to rows with 200 saved versions; exercise agent/session, long text, keyboard paging/expansion, visible focus and no restore. Clean only owned temporary resources.

## Changelog

- 2026-10-04 v3: checked automation completion; no pending processes or agents, and refreshed the persisted terminal result.

- 2026-10-04 v1: source-grounded plan from Epic 2/Story 2.4 and two investigations.
- 2026-10-04 v2: four-lens review, fourteen individual verdicts, nine shared repair groups and one pre-existing historical-capture limitation.

## Implementation Verification Evidence

Independent parent workspace validation passes 414 tests with zero failures/skips: 61 scripts, 2 importers, 13 core, 32 web, 201 db and 105 server. Release verification passes hygiene, installed Node/pnpm, workspace typecheck and production build. After actor-icon/creation-value corrections, parent re-read the repaired diffs, all 32 web tests pass, and release verification passes.

Production Chrome uses disposable SQLite data with 200 actual saved versions and a separate three-version Card. Temporary useLayoutEffect/requestAnimationFrame instrumentation measured keyboard activation through first 20 rendered rows at 24.4 ms; newest/oldest on page are 200/181. Nine Enter/Space page activations reach counts 40 through 200, oldest version 1 and no remaining page/restore controls. Native keyboard expansion reveals exact complete descriptions, with visible 2px green focus outline verified in screenshot. Final production rebuild removes all instrumentation; the three-version Card renders 3/2/1, GitHub/agent/system attribution, agent host and MCP session, creation scalar values and exact expanded after text. No local user data accessed.

Every matrix row has executed passing coverage: SQLite predecessor/gap/200-version/attribution/coalescing tests; HTTP defaults/invalid-query/missing/hidden/empty checks; real-router rendered loading/error/retry/page-retention/refresh/safe-text/creation tests; production native-keyboard/page/focus/timing acceptance. First-page timing is measured on this Mac, not a cross-platform guarantee. No actual screen-reader speech was operated.

Logs: /tmp/storymapper-2-4-parent-workspace.log, /tmp/storymapper-2-4-parent-web-repair.log, /tmp/storymapper-2-4-parent-verify.log, /tmp/storymapper-2-4-final-web-build.log.

## Final Verification Evidence

After every review repair, parent independently read all modified implementations and rendered-test assertions. Final `corepack pnpm test` passes **418 tests**, zero failures/skips: 61 script, 2 importer, 13 core, 36 web, 201 db and 105 server. Serial `node scripts/verify.mjs` passes Git/source hygiene, installed Node/pnpm, all workspace typechecks and production build on Node 24.17.0. The existing bundle-size advisory remains nonblocking.

Fresh final Chrome acceptance uses another disposable real 200-version Project. Temporary layout/frame instrumentation measures first 20 rows at **24.7 ms**; six-line before/after previews are bounded, version-specific names are present, Space expansion reveals the exact 80-line value, and nine Enter/Space page activations reach all 200 saved versions. On final-page completion focus returns to History with the visible 2px green outline. Closing/reopening renders only versions 200–181. Instrumentation is removed, final release verification rebuilds exact production source, and browser reload confirms 20 entries, agent/session and no timing attribute. Parent stopped the owned server and removed the disposable data. No user data was opened. One obsolete early browser tab lost its debugger attachment; the final acceptance tabs were closed and the obsolete tab was left to ephemeral turn cleanup.

All six matrix rows still have passing executed coverage, supplemented by repair regressions for exclusive cursor correctness, bounded reopen/remount, delayed A/B mutation invalidation, status placement, retry/final-page focus, unique expansion names, multiline truncation, true/false/zero/null values and attachment creation/deletion refresh. Native Windows/Linux and actual screen-reader speech remain unoperated; no automated committed browser budget runner is claimed.

Final logs: /tmp/storymapper-2-4-parent-workspace-final.log and /tmp/storymapper-2-4-parent-verify-final.log. There are no pending tool processes or running child agents.


## Auto Run Result

Status: done

Follow-up review pass 2 (2026-10-04). Summary: Story 2.4 history reads (bounded newest-first pages with predecessor comparisons, lazy attributed panel, expandable long values, mutation refresh) were re-reviewed by four independent lenses; no behavior defect was found.

Files changed in this pass:
- `packages/db/src/repositories/card-history.test.ts` — real SQLite regression pinning absent-versus-null equality and cleared-value `changedFields` on paged and ascending reads.
- `apps/web/src/ui-strings/index.ts` — expanded history button label now starts with its visible text ("Collapse value for ...").
- `apps/web/src/features/story-map/components/card-detail.test.ts` — expected expanded label updated.

Review findings: 26 — high 0, medium 3, low 10, false 13. Patched: 2 entries (1 medium test gap grouped with its Blind counterpart, 1 low label-in-name); 1 medium carried from pass 1 (focus return, no re-patch). Deferred this pass: none; the single pre-existing deferred entry is untouched. Rejected rows and reasons are individually recorded in Review Triage Log pass 2.

Follow-up review recommendation: false. This follow-up pass patched no high finding (patched counts: high 0, medium 1, low 1); the work has converged.

Verification: `corepack pnpm test` passes (61 script, 2 importer, 13 core, 36 web, 202 db, 105 server; no failures). `node scripts/verify.mjs` passes hygiene, Node/pnpm, typecheck and production build on Node 24.17.0 (existing bundle-size advisory only). New files staged explicitly; sprint-status.yaml and the deferred-work ledger were not touched.

Residual risks: native Windows/Linux and screen-reader speech remain unoperated; first-page timing is a one-machine browser measurement. No commit was made because the spec forbids commit/push; the orchestrator owns commit and sprint bookkeeping, and the working tree keeps its own uncommitted changes.
