# Epic 6 Context: Everyday board work

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

Reproducing statement: Compile focused Epic 6 developer context from the accepted epics, PRD, architecture and UX planning artifacts, preserving orchestrator-owned sprint status. Date: 2026-10-17. Version: 1.

Changelog: Initial compilation incorporating the accepted 2026-10-17 scope decisions.

## Goal

Make everyday board work complete and accessible: users can create, edit, move, find and plan Cards with mouse, keyboard or forms, reach every user-facing page, and bookmark their current View or Card. Preserve transactional integrity, actor attribution and existing Agent/GitHub safeguards while completing the five core Views.

## Stories

- Story 6.1: Every function reachable and addressable
- Story 6.2: Create and edit Cards
- Story 6.3: Move Cards by mouse, keyboard or form
- Story 6.4: Search, filter and bulk actions
- Story 6.5: Collapse, Card Keys and Notes
- Story 6.6: The five core Views
- Story 6.7: Card detail as a deep-linkable modal
- Story 6.8: Manage Personas, Annotations, Statuses and Templates
- Story 6.9: Manage Releases and read their summary
- Story 6.10: Performance and accessibility budgets

## Requirements & Constraints

- Every user page and View has a real URL, active navigation and working history/reload behavior. Remove environment gating of user functions. Keep Export actions in existing View toolbars and Activity; no Export route or rail entry is required. Roadmaps and Timeline remain Later-tier, visibly Experimental when below the quality bar.
- Support Activity, Step, Story and Note with central role labels and all required Card fields. Creating any kind takes at most opening and submitting the composer; text entry is counted separately. Notes remain legal at root, Activity and Step positions. Descriptions persist as Markdown; estimates use the map's unit.
- Search title, description, Source Links and GitHub links; combine the required filters. Filtering retains hidden selections and announces visible/hidden counts, while deleted or inaccessible Cards cease to be targets. Bulk local changes are atomic and report all version conflicts. Archive and Delete are separate; Delete confirms affected subtrees and the existing child strategy, normalizing overlaps. Selected-set GitHub push retains its Dry Run and human confirmation.
- Persist collapse state per map. Card Key prefix changes affect future Cards only, and allocated numbers are never reused. Delivery count, estimate and status distribution include visible Stories only, excluding Notes, other levels and parked/archived ancestry; zero is an estimate. Default Release list, Planning and Tracking show open Releases with explicit show-all and accessible Unscheduled; Discovery retains Release lanes.
- Used-status rename and deletion update affected Cards atomically within the effective Project/map scope; deletion requires a distinct valid replacement. Refuse ambiguous ownership. Persona/Annotation deletion confirms unlinking; template deletion does not rewrite descriptions copied into Cards.
- Record every raw sample on a reproducible 1,000-Card fixture, with environment, measured boundary and cold/warm context. Read/mutation/interaction/search references of 150/30/100/300 ms are diagnostic only; no Epic 6 timing gate or derived tolerance applies. Earlier-story timing gates and historical evidence remain unchanged. ETags, conditional reads and aggregate cache revisions are deferred.
- Accessibility and correctness remain binding: desktop WCAG 2.1 AA at widths of at least 768 px, excluding Reflow. Automated accessibility/behavior checks must actually run; browser contrast, targets, zoom, forced colors, reduced motion and screen-reader behavior need the documented manual checks without claiming jsdom proves them.

## Technical Decisions

- Shared contracts define schemas; actor-required application use cases serve both HTTP and MCP. Domain logic remains pure; repositories own persistence. UI drag, keyboard and form commands use the same authoritative use case.
- Mutations run through the serialized unit of work: validate versions and ownership, write domain state, Card history and Activity together, then publish live invalidation after commit. Versioned roots and owned links advance together; every accepted Card save advances its version, with existing same-actor 60-second history coalescing retained. Conflicts abort the complete local operation and return the conflict list.
- Preserve ChangeSet-first external/Agent mutations and separate auditable application. Do not weaken Agent protection or human GitHub confirmation while making controls reachable.
- Server state belongs in TanStack Query, UI-local state in Zustand, and pages in code-based TanStack Router routes. Centralize English UI strings. Rich text serializes to Markdown. Keep full snapshot reads and live invalidation; search/filter diagnostics do not authorize a server search endpoint.
- Add the required Card map/parent indexes consistently through the current pre-release schema path, validating populated fixtures, reopening and current-schema Restore. Versioned baseline migrations belong to Story 8.1; introduce no parallel migration mechanism or legacy compatibility.

## UX & Interaction Patterns

- Group rail links as Work, Setup and Trust; label Audit as Activity, omit entries whose context is unavailable, and use URL-derived active state. Each page has a skip link, banner, named Main/Views navigation, one main and one heading; route changes focus that heading and update the route/map document title.
- Discovery retains Release lanes, status, estimate and priority alongside roles and Personas. Tree emphasizes hierarchy, Planning Release swimlanes, Backlog work details, and Tracking status plus Release summaries. All render one underlying map.
- Discovery uses a roving grid with one entry tab stop, named tiles and state descriptions. Tile keys act only on the tile, never editors or nested controls. Secondary controls remain keyboard reachable; moves and removals preserve sensible focus and announce results. Dragging has equivalent keyboard and form paths.
- Use the shared Dialog with containment, top-layer Escape and restored opener/tile focus. Card modal state follows `?card=<id>` and browser history; dirty fields survive incoming changes. Destructive confirmations name consequences and initially focus the least destructive action.
- Name every input and control; expose match/selection changes as status messages. Convey level, category, priority and change state with text/glyphs as well as color. Hold live updates while interaction or dirty editing requires it.

## Cross-Story Dependencies

Story 6.3 supplies the shared atomic selected-set Delete command and confirmation; 6.4 reuses them. Story 6.5 establishes Story-only delivery totals shared by 6.6 and 6.9. Existing version/conflict, Dialog, ChangeSet and live-update work underpins this epic; preserve dependency/Slices/Graph behavior from Epic 5. Story 6.10 verifies the integrated accessibility behavior and diagnostic measurements; Story 8.1 owns the release baseline migration.
