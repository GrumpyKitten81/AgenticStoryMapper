---
title: 'Complete audited design-rule application'
type: 'bugfix'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
baseline_commit: 'b214d18325381a0274b5134e586c20e2a061095b'
context: []
---

<frozen-after-approval>

## Intent

Reproducing statement: Systematically and fully fix every finding from the detailed design audit following commit b214d18. Preserve the existing green visual identity and all functional behavior.

## Boundaries & Constraints

Use existing CSS tokens, native HTML and shared classes. No dependency, backend, data, remote or credential changes. Do not save live test records, perform destructive actions or modify user-authored domain colors. No commit requested in this turn. Keep prior uncommitted audit metadata.

Acceptance criteria:
- Given a390px viewport, when opening card detail, then header actions wrap, content stacks and all controls including Close remain within the viewport. Desktop retains two columns.
- Given checkbox/radio/range controls in Releases, GitHub, AI/MCP or Discovery, when rendered, then they use semantic accent color and type-appropriate geometry rather than text-input widths/heights.
- Given Sources, Connections and ReleaseEditor forms/actions, when rendered, then shared field and action groups provide consistent spacing and wrapping; fieldsets have no native decorative frame.
- Given cancellation, close, discard or permanent-delete actions, when displayed, then secondary and danger semantics apply consistently, including hover. Existing guards and handlers remain unchanged.
- Given a multi-line ChangeSet title, when its AI/MCP grid renders, then the review action retains standard control height instead of stretching to the title's row height.
- Given topbar title/key editing icons, when displayed, then shared compact sizing32px applies consistently with neighbouring icons.
- Given headings, dialogs or inline errors, when rendered, then heading scale and dialog radius use central roles; generic dialog error paragraphs use danger text rather than muted text. Ordinary panels use the approved16px padding.

</frozen-after-approval>

## Code Map

- `apps/web/src/styles/`: tokens, shared controls, foundation headings, card-editing dialogs, changeset grid, responsive rules. Existing controls.css is the shared action primitive; keep specialized board color/priority/dnd controls distinct.
- `apps/web/src/features/source-documents/SourceDocumentsPanel.tsx`: labels and Import action lack layout grouping.
- `apps/web/src/features/github-sync/GitHubConnectionsPanel.tsx`: panel-actions has no rule; classless Delete. GitHubConnectDialog cancellation is classless.
- `apps/web/src/features/releases/ReleaseEditor.tsx`: native fieldset and labels, Save/Cancel without shared action spacing. ReleasePanel checkbox lacks checkbox-row.
- `apps/web/src/features/story-map/components/`: LifecycleActions/DeleteCardsDialog/ReleaseDeleteDialog confirmation and PersonaDetail deletion review need consistent danger/secondary variants.
- `apps/web/src/features/ai-mcp/AiMcpPanel.tsx`: changeset-item title/button share stretched grid row.
- `apps/web/src/styles/design-system.test.ts` and `contrast-tokens.test.ts`: existing source-policy/contrast tests need broader semantic class coverage and typed-input selectors. Browser checks must verify actual computed layout too.

## Tasks & Acceptance

- [x] Fix responsive card dialog and shared primitive CSS, typography, radii, alerts, action alignment.
- [x] Migrate affected TSX form groups, checkbox wrappers and action semantic classes throughout app.
- [x] Update/add focused regression checks, preserving text/focus/input contrast bounds.
- [x] Verify typecheck/build and focused page/a11y tests; inspect live pages/dialogs at desktop and390px.
- [x] Independently review the resulting diff and fix concrete findings.

## Implementation Notes

Version1,2026-10-31. User explicitly requests implementation of every audited finding; no unresolved intent or irreversible steps. Parent implements CSS, style tests and browser verification. The implementation handoff owns TSX changes ONLY across affected feature components and relevant existing TSX tests; do not edit CSS, style test files, package scripts or metadata.

Shared interface: use class `form-stack` on vertical forms/fieldsets/source panel; direct field labels are grid with4px gap and group gap12px. Use existing `button-row` on action containers, including prior panel-actions; it supplies wrapping and8px gap. Checkbox/radio labels use `checkbox-row`/`radio-row`. Do not put primary action Save and Cancel as ungrouped fieldset children. Secondary class for Cancel/Close, danger for permanent deletion/discard; archive/park remains secondary. For LifecycleDialog conditional confirm action use danger only for delete. Review ALL existing classless delete/cancel actions, including Personas, release discard, dependency/source unlink where destructive identity removal is explicit; domain-neutral unlink stays secondary. Topbar title edit should acquire icon-button in TSX if needed; parent removes its duplicate visual sizing.

## Verification

Web typecheck/build; focused style, releases, customization, source/onboarding/audit and action tests; full a11y suite. Live browser checks use existing data, cancel all editors without saving and reset viewport. Explicitly compare normal controls36px, compact32px, typed checkbox geometry/accent, title-driven grid actions, centralized title/radius/error styling and mobile bounds.

## Changelog

- 2026-10-31: Record approved complete remediation and audit baseline.

## Verification Results

All seven audited findings corrected. Shared type-aware native controls use18px square checkbox/radio geometry and primary accent. Shared form-stack/button-row provide12/4/8px spacing. Dialogs use12px radius and18px titles; h2/h3/h4 now use explicit central sizes. Inline alert states load after feature styles. Text-input selectors exclude native selection/range/color types. Error/source tests exposed and corrected a split selector group during implementation.

Independent reviews found global button alignment shrinking persona tiles/chips, obsolete native-input feature geometry, connection fieldset framing and legacy6px gap overrides. These were fixed; reviewers rechecked and reported no residual concrete regressions. Non-stretch is scoped to changeset grids, not all structural buttons.

Verification:285 accessibility tests across20 files pass;46 focused style/CSSOM tests pass;139 scoped feature tests pass;44 connection-dialog tests pass after review fixes;17 export/onboarding/audit tests pass; final export3 tests pass. Counts overlap. Web typecheck/build and final CSS bundle rebuild pass. Source hygiene and diff whitespace pass. Existing unchanged58-line function in story-maps.index.tsx remains the sole size-check failure; no unrelated refactor performed.

Browser confirms390px card dialog bounds24..366px, single column, no overflowing controls; desktop retains791px/330px columns. Title icons32px, board checkboxes18px square, slider primary green. Sources group12px/label4px/actions8px/panel16px. Connections group12px and borderless fieldsets, green18px checkboxes, secondary Cancel/danger Delete. ReleaseEditor shares same spacing/radius/title scale and normal checkbox. AI/MCP review actions remain36px despite large row content. Viewport reset, all dialogs cancelled without saving, initial Customize page restored. Error color and danger-hover contracts verified against actual loaded CSS in DOM/CSSOM tests. No live auth, destructive actions or persisted user-data writes.

## Review Triage Log

- Corrected global action alignment regression; contextual persona/detail-chip regression test added.
- Corrected feature checkbox/radio overrides; tests exercise card-checkbox, lifecycle radio, safety and generic row contexts.
- Corrected connection form spacing cascade and native nested fieldset; shared-context test plus live computed styles pass.

## Changelog

- 2026-10-31: Complete remediation, independent review corrections and browser/automated verification. No commit requested or created.
