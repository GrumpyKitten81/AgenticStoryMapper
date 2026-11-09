---
epic: 6
story: 1
status: ready
date: 2026-10-17
version: 2
epic_preparation: epic-6-preparation.md
source_revision: ab50aa78263d10bdcd32c410a7aee97f106ca912
---

# Story Plan 6.1: Every function reachable and addressable

Reproducing statement: Prepare Story 6.1 as part of the requested Epic 6 consistency, open-decision and current-codebase assessment, incorporating the accepted selections 1A/2C/3A/4A/5A/6B/7C/8A/9C. Define ordered implementation tasks and acceptance checks without implementing the story.

## Intent

Expose all existing user functions through real navigation and repair page structure without losing current map, Card, preview or Restore links.

## Cross-story constraints

- Accepted decision record: [ADR 0007](../../docs/adr/0007-epic-6-board-scope-and-diagnostic-performance.md), 2026-10-17.
- Apply the shared decisions and ownership table in [Epic 6 preparation](epic-6-preparation.md). This is a detail plan for dev step 02, not a runnable spec or implementation authorization.
- Preserve actor-aware use cases, root baseVersion checks, ChangeSet-first nonhuman writes, source provenance, live-update holds, Restore epochs and read-only preview behavior.
- All static interface text comes from the English string modules. Reuse existing Dialog/announcement/conflict components and query invalidation.

## Design decisions (this story)

- Extend existing TanStack routes and the active-map store; derive scope from the URL and validate availability before offering map links.
- Keep `/audit` as the working route while displaying Activity; route renaming is unnecessary. Sources/Personas/Customization/Connections are project-scoped; Releases/AI-MCP/Roadmaps and Views need a valid map.
- Work/Setup/Trust grouping and Experimental Timeline/Roadmaps follow EXPERIENCE. Preserve Slices/Graph and prescribed tab order.
- Accepted 6B retains Export on existing View/Activity surfaces with no new Export route or rail entry. Page heading focus reacts to pathname/scope changes; Card/preview query changes retain their own focus lifecycle.

## Task sequence

1. `apps/web/src/app/router.tsx; app/routes/RootLayout.tsx; app/routes/story-map-shell.tsx`: Inventory existing routes, links, search validators and missing-function entries; verify existing Export actions remain reachable without adding a route or rail entry.
2. `apps/web/src/vite-env.d.ts; RootLayout.tsx; story-map-shell.tsx`: Remove feature flag reads/type declarations, expose real links, label Later surfaces Experimental and omit unavailable map entries.
3. `RootLayout.tsx; app/components/Announcements.tsx; ui-strings/app.ts`: Add skip target, banner, named Main/Views nav and one main/h1; set route/map-aware document titles and focus without stealing modal/query focus.
4. `app/routes/root-layout.test.ts; router-level tests`: Exercise deep reload/history, map-less and project switches, preview/Card queries, navigation inventory and focus. Scan rendered entries for noninteractive decorations masquerading as links.

## Preliminary code map

Concrete existing entry points (repository-relative); short filenames in the tasks refer to these paths:

- `apps/web/src/app/router.tsx`
- `apps/web/src/app/routes/RootLayout.tsx`
- `apps/web/src/app/routes/story-map-shell.tsx`
- `apps/web/src/app/routes/root-layout.test.ts`
- `apps/web/src/vite-env.d.ts`
- `apps/web/src/features/story-map/components/StoryMapExportActions.tsx`
- `apps/web/src/features/privacy/PrivacyExportPanel.tsx`

Dev refines this map against actual implementation and relevant tests before changes; graph coverage is stale. Proposed new contracts/components/tests are design targets, not existing files.

## Acceptance outline

- Given each existing page with valid scope, when navigating/reloading/back/forward, then the right page and active link persist with no env flag.
- Given no available map, when rendering the rail, then map-only links are absent and project functions remain reachable.
- Given route change versus modal query change, when focus updates, then page focus and dialog focus each follow their own contract.
- Given Timeline/Roadmaps, when exposed, then Experimental is visible; existing Slices/Graph remain ordinary reachable Views.

## Out of scope

Completing Later features, redesigning the Project switcher, adding an Export route/rail entry or consolidating an export center or changing GitHub setup.

## Risks and mitigations

Export controls remain on existing surfaces under 6B; only page entries require URLs. Root layout landmarks affect every route. Inspect nested headings and all query validators; test direct links independently of remembered store state.

## Open questions

None. The maintainer resolved all nine preparation questions on 2026-10-17. Apply the accepted decisions in the epic preparation and ADR 0007; readiness is planning readiness only.

## Changelog

- 2026-10-17 v1: Source-anchored detail plan; ownership, existing behavior, acceptance and open decisions reconciled with Epic 6 preparation.
- 2026-10-17 v2: Applied the maintainer's accepted decisions, resolved open planning questions and marked this detail plan ready. ETags/new Export navigation and binding Epic 6 timing gates remain outside scope.
