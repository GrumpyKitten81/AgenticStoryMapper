---
title: Separate map levels, planning types and GitHub issues
type: feature
created: 2026-11-08
status: in-review
route: dispatch
baseline_commit: 469e28d386f2645c42de6a991745493fce9dba42
review_loop_iteration: 1
context: []
---

Date: 2026-11-08. Version: 2.

Reproducing statement: Implement the user-approved concept separating Story Map levels, optional planning types and linked GitHub Issue types; add a local map-wide Epic context, neutral level templates and a short English explanation. Preserve the existing uncommitted planning-template edits as input.

<frozen-after-approval>

## Intent

Make Activity/Step/Story structural levels independent of optional Card planning type (Epic, Feature, User Story, Bug, Task, Spike, Theme) and GitHub's observed/mapped Issue types. Add an optional local Epic context above the entire map, not a fourth row or parent Card. Keep existing enum values and GitHub mappings; improve presentation rather than silently reinterpret synchronization.

## Boundaries & Constraints

Epic context belongs to one StoryMap: required nonblank title and goal when present, optional canonical GitHub Issue URL. No GitHub call, verification claim, synchronization link, hierarchy mutation or Issue creation when saving context. Null clears it. Same URL can frame several maps. Existing Card types stay optional with no automatic inference from level. Notes retain existing rules.

Use existing versioned map create/update commands and ChangeSets, shared contracts, DB repositories and central UI primitives. Preserve default import placement and outbound type mapping behaviors, conflict/refusal rules, human remote confirmation and existing user templates. No unrelated refactor, new dependency, network integration, portfolio aggregate or Git history operation. No commit or push in this implementation dispatch. User already authorized the current uncommitted files; do not treat them as a blocking dirty tree or revert them.

## I/O & Edge-Case Matrix

| Scenario | Expected result |
| --- | --- |
| Existing map / absent context | Existing content unchanged, context absent |
| Valid context / no GitHub | Save and reload locally, display above map |
| Context link | Validate canonical Issue URL; no remote request or sync receipt |
| Blank title/goal or invalid URL | Refuse invalid save with actionable error |
| Context clear / stale map version | Clear only context; stale update refused |
| Agent map update | Existing ChangeSet approval/access/version boundaries apply |
| Copy, JSON/Markdown export, archive/Restore | Context retained with map metadata, original source unaffected |
| Level / planning type / GitHub binding changes | No implicit retype or reparent beyond existing explicit operations |
| Apply neutral level template | Only description changes, confirm before replacing existing description |

</frozen-after-approval>

## Code Map

- `packages/contracts/src/schemas/domain.ts`, `api/http.ts`, `schemas/operation-fields.ts`, `mcp/tool-inputs.ts`: StoryMap contracts/operation fields and derived MCP inputs. Add nullable epicContext using shared canonical Issue locator validation.
- `packages/db/src/schema/tables.ts`, `repositories/projects-repository.ts`, `repositories/row-mappers.ts`, `repositories/map-copy-repository.ts`, migrations and migration assets: map persistence, versioned history, copy and current migration journal (last 0003). Audit archive/restore and serializers for metadata preservation.
- `apps/server/src/application/story-map/story-map.use-cases.ts`: existing map command authorization/versioning. Preserve GitHub import/remote-push semantics; update pure exporters as required.
- `apps/web/src/app/routes/story-map-shell.tsx`: compact Epic context above all views; edit/add/remove via existing Dialog and map update API. No large empty block without context.
- `apps/web/src/features/story-map/components/CardComposer.tsx`, `CardDetailModal.tsx`, `features/card-review/CardTypeField.tsx`, `features/github-sync/GitHubConnectionFields.tsx`: distinct Map level / Planning type / GitHub issue labels, observed native type and sync state. Do not couple the fields. User Story display label for local `story` type.
- `apps/web/src/features/customization/TemplatePicker.tsx`, central styles/ui-strings: reuse and preserve user templates; explicit built-in Activity/Step/Story templates, description-only application with replace confirmation. Keep type templates separate.
- `.github/ISSUE_TEMPLATE`, `docs/templates`, `.cursor/rules/card-authoring.mdc`, `CONTRIBUTING.md`: existing uncommitted Epic/Feature/Story drafts; remove hard-coded level/type equivalences. Add neutral map-level Markdown templates alongside independent planning-type issue templates.
- `docs/story-map-levels-and-issues.md`, README and Story Map help: about one page in English with four-concept table, small diagram and primary source links (Jeff Patton, Azure Boards and Avion). Help must link to a usable rendered/served guide, not an unavailable filesystem path.

## Tasks & Acceptance

- [x] Contracts, additive migration, repositories, history and operations support epicContext.
- [x] Map-wide compact context UI, optional reference, existing version/error handling.
- [x] Clearly separated level, optional planning type and GitHub type/status presentation, plus separate import placement/outbound mapping sections.
- [x] Explicit neutral templates for each structural level, description-only replacement confirmation; preserve saved templates.
- [x] Correct pending issue/Markdown drafts and authoring guidance; write/link the short English guide.
- [x] Meaningful matrix tests, desktop/narrow workflow verification and complete repository quality gate.
- [ ] Visually recheck the corrected narrow guide table after the Mac is available; this external verification limit keeps the spec in review.

Given a Card at any allowed structural level, when its planning type or binding changes, then the UI retains independent labels and only explicit structural operations affect placement. Given a map without context, when first opened, then no extra empty layout row appears. Given a linked native type, then label it as last observed rather than imply a live lookup or equality with local type.

## Implementation Notes

The approved plan is the scope. Existing uncommitted draft forms/docs are authorized input. No sprint-status or deferred ledger edits. Capture actual verification limits. Tool graph is unavailable in this runtime; inspect implementation and relevant tests directly.

## Verification

Use installed Node24 on PATH: /Users/alexander/.nvm/versions/node/v24.17.0/bin. Run focused contracts/DB/server/web tests, typecheck/build, source hygiene/size, then full check/release verification when feasible. Do not weaken tests or bounds. Use disposable fixture data for browser acceptance, never user Projects. This dispatch implements and tests; parent performs final independent audit and browser verification if unavailable here.

## Changelog

- 2026-11-08 v2: Implement and verify the approved model, triage review fixes and record the locked-Mac visual follow-up.
- 2026-11-08 v1: Record the approved implementation intent and acceptance criteria.


## Review Triage Log

Date: 2026-11-08. Review iteration: 1. Implementation and automated verification complete; corrected narrow guide visual follow-up remains open.

| Finding | Verdict | Resolution and evidence |
| --- | --- | --- |
| Shared description lock disabled saved-template defaults | Accepted, fixed | `TemplatePicker.descriptionDisabled` guards only the built-in description selector/confirmation. Detail retains its pending-write guard for saved templates and its per-field application locks. Actual locked-detail regression saves estimate8 while preserving disputed description and GitHub-owned status. Existing policy locks status for all linked Cards; unlinked composer/detail consumer tests independently preserve saved status/estimate. |
| Epic context delayed success could close a draft after Restore | Accepted, fixed | Context editor checks its reviewed epoch and Restore pending state before sending, before invalidation and after invalidation. A changed epoch retains the draft, disables stale save and offers explicit reload. Delayed response/invalidation tests cover both completion boundaries. |
| Neutral templates lacked real composer/detail submit coverage | Accepted, fixed | Real consumers apply saved defaults, author planning type/placement, cancel neutral replacement, confirm replacement and submit. Exact requests retain status/estimate and independent level/type/parent/release/position/title. |
| Context UI lacked valid Add/Edit and refusal/recovery coverage | Accepted, fixed | Query-backed context tests assert versioned Add/Edit requests, mixed-case URL canonicalization, refreshed disclosure, rejection/stale draft retention and explicit reload followed by successful save with the refreshed version. |
| Narrow guide table broke concept names character by character | Accepted, fixed | Single guide source wraps its table in an accessible focusable scroll region. Central guide styles provide a36rem table minimum and normal word wrapping. The Mac locked before the fresh-build recheck; the user is not on site. Corrected narrow rendering remains unverified. |
| Setup/start smoke checkout omitted the new bundled guide asset | Accepted, fixed | Minimal materialization reproduced copied consumer but missing guide. Checkout fixture now includes exactly `docs/story-map-levels-and-issues.md`; targeted real setup/start smoke rerun verifies build/start rather than changing product behavior. |
| Guide repeats the dialog title as its document heading | Non-blocking cosmetic finding, retained | The source heading preserves a usable standalone guide and the Dialog retains its accessible title. Parent requested focus on narrow table readability. |

Focused regression evidence (2026-11-08):

- `card-creation.test.tsx`: “submits a neutral description without changing saved defaults or the authored type and placement”.
- `card-fields.test.ts`: “saves only the neutral description and prior saved defaults while retaining independent Card fields”.
- `sync-field-locks.test.tsx`: “keeps saved template estimate editable while description conflict and GitHub-owned status stay locked”.
- `epic-context-editor.test.tsx`: “submits Add and Edit with map versions and refreshes the canonical context disclosure”; “preserves a rejected draft for correction and a stale draft until explicit reload and recovery”; “ignores delayed response completion after Restore and retains the draft until explicit reload”; “ignores delayed invalidation completion after Restore and retains the draft until explicit reload”.
- `scripts/commands.test.mjs`: “setup installs, builds and launches the healthy app without config, and repeats safely”; “start serves actual app/API on its owned URL and only opens the browser after health”. Both real smoke cases pass after the exact guide asset materialization fix.

The focused web run covers six files (template/context consumers plus central copy), with78tests passing. The fresh web typecheck/build, source boundaries/size and whitespace checks pass. Final full `corepack pnpm check` passed (exit0): all workspace coverage floors, 238 script cases with236passes/2existing platform skips, 14 performance cases, 319 accessibility cases, boundaries/size/hygiene/licenses/capabilities, build, typecheck and release verification. All43 checked local documentation targets resolve and whitespace passes. Safari verified context create/validation/canonicalization/reload/removal, independent Activity + Bug classification and neutral-template creation, plus composer/detail/context/connection layouts at desktop and narrow widths. The corrected guide table could not be visually rechecked because the Mac locked and the user is not on site. The disposable QA server was stopped and its port closure verified; the QA tab remains open behind the lock.
