---
title: 'Central Agentic Story Mapper design system'
type: 'refactor'
created: '2026-10-31'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'b226c574629d8ba10cd509d384818a5128179506'
context: []
---

<frozen-after-approval>

## Intent

Reproducing statement: Implement the approved central design-system plan, preserving the existing light green visual identity and unifying UI colors, spacing, radii, typography and controls across the application and exports.

## Boundaries & Constraints

Use native CSS custom properties, no dependencies or theme editor. Preserve user-authored domain colors, API contracts, persisted data, board geometry, zoom and drag behavior. Existing work must be preserved. No commits or remote operations.

</frozen-after-approval>

## Code Map

- `apps/web/src/styles/`: existing global import entry, foundation, feature styles and contrast tests.
- `apps/web/src/features/story-map/export/`: standalone HTML plus canvas PNG/PDF exports; static export styling currently duplicates UI values.
- `apps/web/src/test-fixtures/styles.ts`: recursive local stylesheet reader for tests.

## Tasks & Acceptance

- [x] Centralize semantic colors and reusable dimensions in tokens.css and consume throughout UI CSS.
- [x] Extract shared controls and migrate feature styling while preserving functional geometry.
- [x] Extract export styling and ensure exports carry tokens offline.
- [x] Resolve token references in contrast tests and enforce centralized UI colors and valid references.
- [x] Run focused tests, accessibility suite, typecheck and build.

Acceptance criteria:
- Given the app styles, when a semantic token changes, then all corresponding UI surfaces consume that definition.
- Given arbitrary user card/status colors, when UI tokens change, then stored domain colors remain unchanged.
- Given an HTML export, when opened offline, then its styling contains token definitions and export styles without external CSS dependencies.
- Given normal text/focus/input pairs, when contrasts are tested, then existing 4.5:1 and 3:1 bounds remain enforced.

## Implementation Notes

Version 1, 2026-10-31. User explicitly approved implementation of the preceding plan; no additional approval required. Source investigation completed during planning. Graph MCP tools unavailable in this session.

## Verification

Run web tests, test:a11y, typecheck, build and source-size/hygiene checks. Record actual results and visual verification limits.

## Changelog

- 2026-10-31: Record approved implementation scope and baseline.

## Verification Results

- 28 token/contrast/export tests passed; 47 focused token/contrast/restore-point tests passed after updating literal-color assertions.
- Accessibility suite: 19 files, 264 tests passed. Web typecheck and production build passed; final CSS bundle rebuilt successfully after graph-focus correction.
- Source hygiene passed outside sandbox; git diff whitespace check passed.
- Independent review found graph focus inheritance regression; fixed with light-surface ring and regression assertion for page surroundings.
- Full web-suite runs were interrupted without a final verdict after extended execution; early stale-candidate assertions were repaired and passed in focused runs. No full-suite success is claimed.
- Aggregate verifier stopped at pnpm version detection; existing unchanged story-maps.index.tsx function exceeds 50 lines in size check.
- Interactive browser/layout and real PNG/PDF visual inspection remain outstanding. No visual approval claimed. No commit created.

## Page Consistency Follow-up — 2026-10-31

User reported remaining cross-page button differences. Centralize default action typography and navigation-link styling, remove per-page sizes, share explicit compact treatment, highlight selected Activity toggle, and align filter form spacing. Persona tiles explicitly use semantic text color on their light surface. Source policy prevents page action overrides; compact contract includes navigation links.

Browser inspection after rebuilt assets: Onboarding action and GitHub link, Activity tabs/filter action, and all Customize actions measure36px high,14px font,8px12px padding,8px radius. Customize has no horizontal overflow at the current viewport. Personas empty state checked; no user data authored or modified.

Independent follow-up found compact rows omitted action links; fixed and regression-tested. Earlier graph-focus severity was overstated because the global focus rule already supplies dual shadow rings; the explicit light outline remains valid.

Follow-up verification: 268 accessibility tests passed across19 files;29 focused style tests and72 focused page/restore/customization tests passed. Web typecheck plus production build passed; final CSS rebuild and diff whitespace check passed. No full-suite rerun or PNG/PDF visual claim.
