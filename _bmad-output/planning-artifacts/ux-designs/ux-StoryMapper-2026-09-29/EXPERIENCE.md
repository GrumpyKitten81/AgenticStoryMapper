---
name: Agentic Story Mapper
status: final
updated: 2026-10-18
sources:
  - _bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/epics.md
  - apps/web/src
---

Reproducing statement: Align GitHub connection, Dry Run, import, conflict and ticket-composer behavior with accepted Epic 7 decisions D1–D6 and the current shared Dialog/scope/epoch patterns. Date: 2026-10-18. Version: 7. Changelog: Applied accepted Epic 7 decisions D1–D6 and current-code preparation boundaries; retained previous epic requirements and evidence.

# Agentic Story Mapper — Experience Spine

> Brownfield spine. Derived from the running web app (`apps/web`), the PRD (FR-13 to FR-16, FR-32, FR-47, FR-51 to FR-53, FR-57 to FR-64) and the v1.0 epics. Sections say what to keep, what to change and what to add. Paired with `DESIGN.md`. Vocabulary is the PRD glossary.

## Foundation

Single-surface web application served by the local server on one port; desktop-first, keyboard-operable, English only. No accounts, no roles, one Project open at a time, one human plus any number of agents acting on the same data. React with TanStack Router, TanStack Query and Zustand; icons from Lucide; no UI component library is adopted, the existing CSS-based components are the system and `DESIGN.md` is its visual contract. State that is not stored server-side (zoom, collapsed lanes, last-seen change sequence, selected filters) lives in the browser per Project and is never required to render correctly.

The map is the product; everything else supports reading it, changing it and trusting it. Three questions every surface must answer at a glance: what is here, who changed it last (you, an agent, GitHub), and what may an agent do right now (the safety switches and optional Agent-approval permission).

## Information Architecture

Navigation is a fixed left rail. Every page entry is a real link with its own URL and active state (FR-13, FR-16); nothing hides behind an environment switch. Export remains an action on existing View toolbars and Activity surfaces, without a new route or rail entry (6B).

| Group | Rail entry | Route | Purpose |
|---|---|---|---|
| Work | Story Maps | `/projects/:p/story-maps` | List, create, open; Project archive export and import |
| Header | Project switcher | rail header, below the brand | Shows the Project name; menu to switch, create or open a Project (FR-2) [ASSUMPTION: new] |
| Work | Sources | `/projects/:p/sources` | Import Markdown and TXT, chunks, coverage |
| Work | Releases | `/projects/:p/story-maps/:m/releases` | Release list, summary, tracking |
| Work | Roadmaps *(Experimental)* | `/projects/:p/story-maps/:m/roadmaps` | Roadmap boards (Later tier, kept, labeled) |
| Setup | Connections | `/projects/:p/github` | Connect GitHub, connections, Sync Health entry |
| Setup | Personas | `/projects/:p/personas?persona=` | Personas list and detail |
| Setup | Customize | `/projects/:p/customize` | Workflow statuses, Annotations, Templates |
| Setup | AI / MCP | `/projects/:p/story-maps/:m/ai-mcp` | MCP host setup, Product Context, proposals from sources |
| Trust | Activity | `/projects/:p/audit` | Activity Log, ChangeSets, restore points, audit export |
| Footer | Getting started | `/onboarding` | Checklist until dismissed, then a link only |

Inside a Story Map the header carries the map name (inline rename), the switch strip, the "What changed" indicator, live connection state and counts. Under it the view tabs, each its own route with the Card modal addressable by `?card=<id>` (FR-15):

| View | Route suffix | Purpose |
|---|---|---|
| Discovery | `/discovery` (default) | Three levels, Personas, Release lanes, unscheduled and not-assigned areas; retain Workflow Status, estimate and priority (2C) |
| Tree | `/tree` | Indented hierarchy; also shows ChangeSet previews |
| Planning | `/planning` | Release swimlanes; priority, value, effort editable; also shows previews |
| Backlog | `/backlog` | Status, estimate, description preview, ticket and source indicators |
| Tracking | `/tracking` | Kanban by Workflow Status with Release summary |
| Slices | `/slices` | Each Release as a Slice: Stories, count, estimate sum, status, blockers, Before/After Plan-state comparison, progress per Activity |
| Graph | `/graph` | Cards and Dependencies as graph, filters, blocked list, accessible table |
| Timeline *(Experimental)* | `/timeline` | Release bars with dates and progress |
| GitHub Sync | `/github` | Plan, Dry Run, push, import, sync, conflicts, Sync Health |

Slices provides explicit Record plan state and Before/After state selection controls. Recorded states retain their identity, capture time and immutable Story/Release membership after later edits and reopening. Compare two states of the same map: Added/Removed use stable Story identity, Moved names old/new Release or Unscheduled; a Release rename or within-lane reorder is not a move. Missing or unsupported state data is explained visibly, without inferred history. Comparison is read-only and does not apply or restore the selected state.

Tab order is Discovery, Tree, Planning, Backlog, Tracking, then a divider, Slices, Graph, Timeline (Experimental), then a second divider and GitHub Sync. GitHub Sync is a page inside the Story Map, not a View in the glossary sense. New surfaces that are not tabs:

| Surface | Reached from | Purpose |
|---|---|---|
| Switch settings | Switch strip | Toggle Agent access, GitHub, Agent protection; human only |
| What changed panel | Header indicator | Changes by agents, GitHub and other tabs since last look (FR-64) |
| ChangeSet review | Activity, header badge, `?preview=<id>` on Tree and Planning | Per-operation list plus in-place markers on the board (FR-53) |
| Plan drift drawer | Slices header action | Differences between map and source plan per external system (FR-60) [ASSUMPTION: drawer, not a tab] |
| Restore points | Activity (tab: Log, ChangeSets, Restore points) | List, create, restore with a consequence dialog (FR-57) |
| Export | Existing View toolbars and Activity | Existing export actions; no dedicated Export route/rail entry. The export center (FR-38) stays Later (6B). |
| Card modal | Any Card | Fields, description editor, dependencies, GitHub, sources, attachments, history |
| Parked and Archived lists | Board toolbar | Restore parked Activities and archived Cards (Story 2.5); the baseline board area "Not assigned" holds Cards without a parent |

## Voice and Tone

Microcopy in English from one string module; brand posture lives in `DESIGN.md`. Direct, concrete, verbs and counts. An error names the cause and the next action. Object names are the glossary terms: Project, Story Map, Card, Activity, Step, Story, Note, Release, Slice (a Release in the Slices view), ChangeSet, Restore point, Card Key.

| Do | Don't |
|---|---|
| "Agent protection is on. Writes from agents become ChangeSets you review." | "Protected mode enabled!" |
| "12 operations, 2 may change. Apply 10 selected." | "Ready to apply your changes." |
| "Someone changed this Card while you edited. Your text is kept below." | "Save failed (409)." |
| "Restore to 14:32? Everything since is undone. A restore point is created first." | "Are you sure?" |
| "Can't reach the server. Start it with the start command from the README." | "Network error." |
| "No cards match. 2 filters active. Clear filters." | "Nothing found." |
| Agent named by host: "Claude Code changed 30 Cards" | "AI changed things" |

Never blame the user; never use exclamation marks, emoji or marketing words. German strings that exist today (`Willkommen`, `Prioritäten`, color category names, tooltips, the API banner) are replaced (Story 1.1).

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Rail entry | Navigation | A link, never a button. Active state from the URL and `aria-current`. Entries for an unavailable context (no Project) are absent, not disabled. |
| View tab | Story Map header | A link; the tab row is the only view switcher. Switching keeps `?card`, filters and scroll per view. |
| Switch strip | Every page header | Three buttons named like `Agent access: On. Open switch settings`; they open the switch settings, not instant flips. The settings hold real switches; GitHub turning on asks for a one-line confirmation. The actor is logged. Agents cannot change them. A switch changed elsewhere is announced. Shows the notice that an enabled agent may forward context to its own provider. |
| Card tile | All board views | Its primary element is one button: `Enter` opens the Card. Secondary controls (checkbox, move left and right, park or unschedule, restore, delete, color chip, priority) are reached by `Tab` from the tile and hidden from the tab order of every other tile. Park applies to Activities only and leads to the Parked list; a Story is unscheduled instead; archive and delete are separate controls. Delete asks for confirmation naming the Card. Drag is pointer-only; the keyboard path is the Move dialog and the tile's secondary controls. Accessible name is `{Card Key} {level} {title}`; state goes into the accessible description ("Changed by Claude Code. Blocked order behind K-4. Conflict."). |
| Move dialog | Any tile, `m` on a focused tile | Form: parent, position and Release; applies through the same use case as a drag. Focus continuity rules apply. |
| Card modal | `?card=<id>` | Uses the shared Dialog (below). Initial focus on the heading; opener recorded; unsaved edits ask before closing; any incoming update never changes a dirty field and shows "This Card changed. Reload / Keep mine" with typed text kept. |
| Shared Dialog | Card modal, confirms, Move, switch settings, restore | One component: focus contained, background inert, `Esc` closes only the topmost layer, closing restores focus to the recorded opener if still present, else to the tile with the same Card id, else to the board. Confirms are `alertdialog` with the least destructive button focused first; title and consequence are its name and description. The non-dismissible Restoring dialog gets focus on its container. Multi-way choices ("where do child Cards go") are radio buttons plus one confirm button named with the verb. |
| Description editor | Card modal | Rich text stored as Markdown; toolbar with named toggle buttons (Bold, Italic, Bullet list, Heading 2); editor named "Description"; visible focus on the frame; `Esc` leaves the editor first, and closes the modal only from outside it. |
| Category chip and priority | Discovery tile, modal | A button named with its value (`Color: Blocker. Change color`, `Priority 2. Change priority`), `aria-haspopup="listbox"`; the popover is a listbox with the current option selected, arrows move, `Enter` selects and returns focus to the trigger, `Esc` closes. |
| Bulk action bar | Appears at 1+ selected | A labelled region with named controls and a status count; keyboard order places it before the board. Applies to all selected or none; if any Card conflicts it shows an alert listing all conflicts and focus moves to it. Filtering that hides selected Cards announces how many. |
| Filters | Toolbar | Search on top, filter row opens on demand, count "N matches / M cards" announced as status, Clear resets all. Every select has a visible or accessible name. |
| Lane header | Release lanes | Rename inline (commit on `Enter`, cancel on `Esc`), move up or down, collapse (`aria-expanded`), pin (`aria-pressed`), delete with a dialog stating where child Cards go. |
| Actor badge | History, Activity, panels | Person, bot or GitHub icon plus name; agent name comes from host and session. |
| Change marker | Preview, What changed | Glyph, word and color per kind (state cues in `DESIGN.md`); removed tiles stay visible. Markers clear on "Mark as seen" (changes) or when the ChangeSet is applied or discarded (preview). |
| ChangeSet review | Activity, Tree, Planning | Lists operations grouped by object kind with a checkbox each; deselecting an operation deselects its dependents; `upsert` shows "may change". The human may approve its own UI proposal. Agent approval is disabled by default; a human-only Agent-settings toggle controls `allowAgentApproval`, and the review shows the actual approver. With the toggle on, Agents may approve their own proposals, even under protection, but protection always blocks Agent apply; human Apply remains available; an applied result matches its preview. |
| Dry Run | GitHub Sync | Lists each explicit Issue/Milestone effect, native type, label changes, dependencies and exclusions from one persisted immutable plan. Human Confirm uses its id; changed local/remote inputs, connection or Restore require a new review. Quick Sync/local-wins reuse this flow. Results and explicit resume appear per item, with actual links/errors; uncertain remote outcomes block blind Retry. |
| Conflict view | GitHub Sync, Card modal | Diff of both sides; the field stays `aria-disabled` with the reason "Resolve the conflict to edit" until the user picks local or remote; the callout is an alert and takes focus on its heading. |
| Dependency badge | Card tiles, modal | Prerequisites listed; a violation shows `Blocked order` and names the offending prerequisite in its description. |
| Graph | Graph view | Focusable canvas: arrows pan, `+` and `-` zoom (only while the canvas has focus), `Tab` cycles nodes in dependency then title order, `Enter` selects. A toggle button (`aria-pressed`) switches to the table twin (Card, Depends on, Required by, Blocked order), which shares selection and filters; the hidden one is removed from the tab order. Filters announce the resulting count. |
| Toast and status | Global | One always-mounted polite status region and one alert region. Rules under Accessibility Floor. |
| Drawer | Plan drift, What changed | Opens from a button, holds focus like a Dialog without inert background, `Esc` closes and returns focus to its button. |
| Popover and tooltip | Anywhere | Open on click or focus, never hover only; dismissible with `Esc`; content of a tooltip is never the only copy of information. |
| Empty state | Any empty surface | Title, one sentence, one primary action. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load | Any view | A skeleton of the layout, not a spinner alone; text "Loading story map" for assistive tech. |
| No Project data yet | First start | Sample Story Map exists; Getting started checklist opens as a panel over the list. |
| No Story Maps | Story Maps list | Empty state: "No story maps yet." Primary: Create story map. |
| Empty Story Map | Any view | Empty state pointing to the Card composer; Discovery shows the three level headers with an add button each. |
| Filter has no matches | Board views | "No cards match. N filters active." plus Clear filters; the count reads 0 / M. |
| Server unreachable | Global banner | `callout-danger` with `role="alert"`: cause and the start command; views keep their last data, editing is disabled. |
| Live stream reconnecting | Header | Small "Reconnecting" text in the header; on `reset` all views refetch; after 30 s [ASSUMPTION] of failure the danger banner shows. |
| Agent changed something | Board | Changed tiles get `Changed` markers and a brief outline pulse (removed under reduced motion); the What changed count rises within 2 s; one coalesced status message is announced. |
| Agent access off | Switch strip, agent tools | Pill shows `Agent access: Off`; agent calls are rejected and logged; the header counts blocked calls since last look. |
| GitHub off | Anywhere GitHub is used | Buttons remain visible and explain that the switch blocks import, sync and push. The human connection dialog alone permits an explicit Verify while off; it saves nothing and does not flip the switch. After successful verification say: "Connection verified. GitHub is off and blocks import, sync and push. Confirm Connect to enable GitHub." Final Connect is separate, explicit and audited. No background/MCP exception. |
| Not connected | GitHub Sync, Card composer ticket field | Leads to the connect dialog; never fails silently. |
| Agent protection on | Header | Pill with shield icon; an agent write shows up as a stored ChangeSet with a badge on Activity and a toast "Claude Code proposed 12 changes. Review." The toast stays at least 10 s, pauses on hover and focus, is dismissible, and its content persists in the Activity badge. |
| Updates held | Board, header | While a dialog, popover, drag or text field has focus, board-shape changes queue; a status line reads "3 changes waiting" and they apply on close. "Hold updates" in the header does the same on demand. |
| ChangeSet stale | ChangeSet review | Banner: "This proposal uses an outdated operation schema. Resubmit it." No operation applies until current-schema resubmission and fresh approval. Ordinary version conflicts are listed separately and require explicit deselection/resubmission. |
| Version conflict | Card modal, panels, bulk | `callout-warning` naming each object, current values shown, typed text kept, Reload and Resubmit. |
| Sync conflict | GitHub Sync, tile | Tile carries a conflict marker; the field is blocked until resolved. |
| Remote Issue deleted | Card | Stale Sync State shown; no error. |
| Push partially failed | GitHub Sync | Per-item result list; failed items have a Retry; retry never duplicates. |
| Restore in progress | Global | Modal, non-dismissible: "Restoring. The app reloads when done." All Views reload on epoch change. |
| Snapshot failed | Restore points | `callout-danger` with the cause; no partial entry appears. |
| Drift report empty | Plan drift drawer | "In line with `<source>`." with the time of the last publish. |
| What changed empty | What changed panel | "Nothing new since you last looked." |
| Large map | Board views | Interactions meet NFR-1; if a view must virtualize, keyboard focus and search still reach off-screen Cards. |
| Card not found | `?card=<id>` | Modal replaced by a callout "This card no longer exists" with a link back to the view; the query parameter is dropped. |
| ChangeSet closed | `?preview=<id>` | Callout "This ChangeSet was applied or discarded" with a link to Activity. |
| Project cannot be opened | Startup | Full-page callout naming the cause (newer schema, prototype folder, unreadable) and the manual recovery. |
| Save state | Card modal, panels | Footer text: Saving, Saved, or Save failed with cause and Retry; while the server is unreachable editing is disabled with `aria-disabled` and the reason. |
| Apply failed | ChangeSet review | Callout: nothing was applied (atomic), cause named; the ChangeSet stays open. ChangeSet status words: Proposed, Approved, Applied, Rejected, Discarded, Stale, Conflict. |
| Restore refused | Restore points | Callout naming the integrity or schema reason; nothing changed. After a restore a result note lists what stays (attachments, GitHub links created later). |
| Empty list | Sources, Activity, Personas, Releases, Restore points | Empty state with one action; Activity and lists with filters add "No entries match. Clear filters." |
| GitHub unreachable | GitHub Sync, Connections | Callout with cause (token invalid, scope missing, rate limit, network) and the fix; the switch state is unchanged. |

## Interaction Primitives

**Pointer:** click to open, drag to move, drag between Release lanes to plan; drop targets show a dashed outline and a text hint. Discovery zoom by slider and buttons (50 to 125 percent, global); lane collapse persists per Story Map in the browser.

**Keyboard on the board:** the Discovery board is one grid with a single tab stop (roving focus on the current tile's primary element). Keys act only when focus is on a tile itself, never from a text field, select, editor or button inside it, and there are no global single-key shortcuts (the `/` search shortcut is dropped; Search is reached by `Tab` and the skip link).

| Key (focus on a tile) | Action |
|---|---|
| Left, Right | Previous or next column in the same lane |
| Up, Down | Through the stack, then into the previous or next lane; collapsed lanes are skipped |
| Home, End | First or last tile of the row; `Ctrl` with them: first or last of the grid |
| Page Up, Page Down | Previous or next lane |
| Enter | Open the Card modal |
| Space | Toggle bulk selection of this tile |
| `m` | Open the Move dialog |
| Delete | Delete this tile, or the whole selection if this tile is in it; always through a confirm dialog that names the count |
| Tab | Move into this tile's secondary controls, then out of the grid; `Esc` inside a control returns to the tile |

Add cells and lane headers are ordinary controls reached by `Tab`. The drag library's keyboard sensor is removed so drag is pointer-only. [ASSUMPTION, confirmed 2026-09-30: this key set; single keys are active only while a tile has focus.]

**Focus continuity:** every tile has a stable id. Before an operation that can re-mount tiles (move, park, delete, archive, filter, lane collapse, incoming update) the focused id is recorded; afterwards focus goes to that tile in its new place, else to the next sibling in previous grid order, else to the previous one, else to the grid itself. The result is announced ("Moved K-12 to Release 2, position 3"). An incoming update never moves focus: if the focused tile would move or vanish, the change is held until focus leaves it.

**Undo:** there is no per-edit undo in v1.0. Recovery is a Restore point (manual, or created automatically before migration, restore and ChangeSet apply). The panel and the ChangeSet result link to Restore points. The inverse operation is Later.

**Live updates:** the board updates itself within 2 seconds; the user's own edits are not echoed as changes; a dirty field is never replaced; updates queue while a dialog, popover, drag or text field has focus, and can be held with "Hold updates". Changes from others pulse once, then wear a marker until seen.

**Banned everywhere:** browser `alert` or `confirm`; hover-only or `title`-only actions and information; color as the only carrier of status; silent overwrite; `outline: none` without a replacement; a write to GitHub without a Dry Run; auto-applying an agent ChangeSet while protection is on; global single-key shortcuts.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md.Colors`.

**Scope (decision 2026-09-30):** WCAG 2.1 AA for desktop viewports of 768px and wider. WCAG 1.4.10 Reflow is out of scope for v1.0 and is stated as such in the README. The house rules of 24px targets and text of at least 12px follow WCAG 2.2 and are kept.

**Testable criteria**

- Names: every interactive element has an English name of the form action plus object; controls with state expose it in the name (`Color: Blocker. Change color`); visible label text is contained in the accessible name; no German names remain.
- Keyboard: every function has a keyboard path; every move type (reorder, reparent, assign Release, unschedule, park, unpark) can be completed with the keyboard alone and leaves focus on the moved tile; no keyboard trap; tab order follows reading order; single-key shortcuts exist only while a tile has focus.
- Focus: every focusable element on every surface color shows an outline of at least 2px with at least 3:1 against both neighbors; nothing sticky covers the focused tile (scroll padding equals sticky header plus pinned lane heights).
- Dialogs: with a dialog open, `Tab` and `Shift+Tab` never leave it and the background is inert; `Esc`, the close button and browser Back all close it and restore focus to the opener or its documented fallback.
- Status messages: one always-mounted polite status region and one alert region. Agent, GitHub and other-tab changes are coalesced over a 1.5 s trailing window into at most one message per 5 s, at most 120 characters ("30 cards changed by Claude Code. Open What changed."); the user's own actions announce one past-tense message naming the object ("Moved K-12 to Release 2"); errors and conflicts use the alert region; reconnecting is silent for 30 s. A toast lasts at least 10 s, pauses on hover and focus, is dismissible and never holds the only copy of its content.
- Auto-updating content: a user can hold updates; updates queue while focus is in a dialog, popover, drag or text field (WCAG 2.2.2).
- Forms: an error is text next to the field with `aria-invalid` and `aria-describedby`; on submit focus moves to the first error; a conflict callout is an alert and takes focus on its heading.
- Cues: every state uses a word and a glyph (state-cue table); with `filter: grayscale(1)` and in forced-colors mode nothing is lost.
- Contrast: text 4.5:1, non-text and form-control boundaries 3:1 on every surface listed in `DESIGN.md`; a token unit test recomputes the documented pairs.
- Targets: every interactive target measures at least 24px square at Discovery zoom 100 percent.
- Structure: skip link to the workspace; landmarks banner, `nav` "Main", `nav` "Views", one `main`; `document.title` is `{Route} - {Story Map} - Agentic Story Mapper`; on route change focus moves to the page heading; one `h1` per page, `h2` for panels and modals, no headings inside tiles; text `lang="en"`.
- Discovery grid: `role="grid"` with row and column counts, a two-row header (Activities with column span, then Steps), Release lanes as rows with a row header, Step-by-Release cells holding the tile stack, `aria-multiselectable`, filler cells outside the grid. If this proves brittle, a `<table>` twin ships as the Graph does.
- Graph: the table twin carries all edges with direction, the blocked list and selection state; each edge is one row.
- Motion: under `prefers-reduced-motion: reduce` no animation or transition beyond a 150 ms opacity fade; drag transitions and skeleton shimmer are off.
- Browser zoom to 200 percent must not cut off controls on non-board surfaces (WCAG 1.4.4); the Discovery zoom is an overview aid and does not count toward it.

**How it is checked (decision 2026-09-30: jsdom with axe-core, no browser runner)**

- Story 6.10 runs `axe-core` in jsdom on the main Views, the Card modal (open and with its unsaved-changes dialog), a confirm dialog, the Move dialog and the Graph table for names, roles, landmarks, headings and ARIA validity, and fails when zero specs ran.
- Vitest with Testing Library covers behavior: roving grid traversal, keyboard moves with focus assertions, dialog containment, restore and Esc, status message count and text, the hold-updates queue.
- A token unit test computes every documented contrast pair.
- What jsdom cannot see stays manual: color contrast on real rendering, target size, focus visibility over sticky rows, browser zoom at 200 percent, forced-colors, reduced motion, screen readers. A release checklist covers NVDA with Firefox, VoiceOver with Safari, a keyboard-only pass of UJ-1 and UJ-3, and 200 percent zoom on non-board surfaces. Findings from it go into the story notes of Story 6.10.

## Responsive & Platform

| Viewport | Behavior |
|---|---|
| 1280px and wider | Rail visible; Discovery shows about six Steps across; side panels open beside the board. |
| 980 to 1279px | Rail visible; panels overlay the board. |
| 768 to 979px | The rail becomes a top bar (existing behavior); panels are full-width sheets; Discovery scrolls horizontally. |
| below 768px | Not supported in v1.0; the app renders, does not block, and is untested; Reflow is out of scope. |

Browsers: current Chrome, Edge, Firefox and Safari. The app runs on localhost only and assumes a mouse plus keyboard.

## Existing GUI: keep, change, add

Derived from `apps/web` on 2026-09-29 and corrected against the reviews of 2026-09-30. Each row maps to an epic story so nothing becomes free-floating work.

| Area | Keep | Change | Add | Story |
|---|---|---|---|---|
| Rail and routes | Code-based router, real links, all current routes | Drop `VITE_DEV_FEATURES` gating; group entries; rename "Audit" to Activity; label Roadmaps and Timeline Experimental; landmarks and skip link | Getting started as checklist | 1.5, 6.1 |
| Header | Inline rename, zoom (50 to 125 percent), counts | Replace "Strict local by default" eyebrow and the German API text; zoom slider gets a value text | Switch strip, What changed, live state | 1.1, 3.5, 3.10, 5.4 |
| Board | Discovery matrix, lanes, pins, filters, bulk bar, drag with dnd-kit | English labels; in-app Dialog instead of `window.confirm` (two calls in `DiscoveryMatrix.tsx`) and the three home-made dialogs; keyboard sensor removed; grid semantics; category chip and readable priority badge; hex input in bulk bar removed; unnamed selects named | Roving grid and Move dialog, focus continuity, dependency badge, change markers | 6.2 to 6.5, 6.10, 5.1 |
| Card modal | Deep link, editor, history, attachments | Shared Dialog behavior, focus rules, editor toolbar names, dirty-field guard | Dependencies section, actor on history, conflict view | 6.7, 3.11, 2.4, 5.1 |
| Views | Tree, Planning, Backlog, Tracking | Content per view verified against FR-14; Tree uses the same level tokens as Discovery | Slices, Graph, preview overlays | 6.6, 5.2, 5.3, 4.9 |
| GitHub | Sync panel, plan, conflicts, health | Guided connect dialog; mandatory Dry Run wording | Ticket field in Card composer | 7.2, 7.4 to 7.7 |
| Safety and history | Activity list | Move export next to it | Restore points, ChangeSet review, drift drawer | 2.2, 2.6, 4.9, 5.5 |
| Accessibility debt | Icon buttons with names | Global `:focus-visible` rule, `.tiptap` outline, input borders, form names, contrast of `.has-priority`, font sizes below 12px | Announcer and shared Dialog components, skip link | 6.10, 1.1 |
| Language | Icons, layout | All strings to one English module, including the Personas route, the modal close dialog, the priority popover and dialog wording that says "epic" and "feature" instead of Activity and Step | | 1.1 |

## Key Flows

### Flow 1 — UJ-1. Maya, a Product Owner, gets to a first map without help

1. Maya runs the setup command and the start command from the README; the browser opens on the app.
2. The Getting started checklist opens over a Story Maps list that already holds the sample map.
3. She opens the sample map, reads the three levels, edits one Story title inline in the Card modal.
4. She creates her own Story Map and adds her first Activity, Step and Story.
5. **Climax:** the checklist ticks "Add first cards" by itself, names the next open item, and the map shows three levels of her own product.
6. She exports the map as HTML with the Export button in the view toolbar and shares the file.

Failure: setup found a Node version below 24; the terminal names the required version and the next command. In the app, an unreachable server shows the danger banner with the start command.

### Flow 2 — UJ-2. Tom, a Tech Lead, builds a map from existing tickets

1. Tom opens Connections and chooses guided GitHub CLI login. The dialog explains `gh auth login`; he runs it in his own terminal and returns to Recheck, or pastes a token for in-memory candidate verification. No `.env` editing or app-managed login process is needed.
2. He explicitly clicks Verify. This human-consented check is permitted while GitHub is off and saves nothing. After success the dialog states that the off switch still blocks import/sync/push. Only separate Confirm Connect saves credentials/configuration and turns the switch on with audit; the header then shows `GitHub: On`. Defaults remain read-only and the actual credential source is shown.
3. On GitHub Sync he reviews and applies an incoming `github` ChangeSet. New Issues retain hierarchy/source/type but start Unscheduled with no Release assignment. Explicit later Release sync may propose Milestone/iteration assignment without interpreting initial null placement as remote removal.
4. In the Card composer he pastes an Issue URL; title and description fill in and the Card links to the Issue.
5. **Climax:** every Card shows its Issue number and one click opens GitHub.

Failure: the pasted Issue does not exist; the composer names the problem and creates nothing. A remotely deleted Issue shows a stale Sync State on the tile.

### Flow 3 — UJ-3. Lena, a Product Manager, works with an agent

1. Agent protection is on. Lena asks Claude Code in her terminal to propose a map from the imported requirements.
2. The agent submits a ChangeSet; a toast and the Activity badge read "Claude Code proposed 47 changes. Review."
3. She opens ChangeSet review; the Tree view shows new Cards with `+ New` markers and Source Chunks behind each.
4. She deselects two operations; their dependents deselect with them; she chooses Approve and Apply.
5. **Climax:** the map appears on the board through live update, each Card linked to its Source Chunk, and the Activity Log names the agent and the ChangeSet.
6. She keeps editing by hand; a later agent slice proposal arrives the same way.

Failure: with Agent access off the agent's call is rejected and logged, and the pill counts it. If a Card changed since the ChangeSet was made, its operation is marked as a conflict and the selected apply changes nothing; the user explicitly deselects/resubmits before retrying.

### Flow 4 — UJ-4. Sam plans a Release and pushes it to GitHub

1. On the Planning view Sam drags Stories into a Release lane; the Release summary updates.
2. He starts a GitHub push from GitHub Sync; the Dry Run lists every Issue and Milestone.
3. He checks the list and confirms; results appear per Issue with links.
4. **Climax:** Issues and a Milestone exist on GitHub and the tiles show their numbers.
5. The Tracking view shows Release progress; Sync Health shows zero problems.

Failure: a title changed on both sides; the conflict view shows the diff and blocks that field until Sam chooses local or remote. With protection on an agent's push is refused as protected; only Sam confirms a Dry Run.

### Flow 5 — UJ-5. Jonas, a privacy-minded lead, audits what left the machine

1. Jonas opens Activity, filters by actor type Agent and GitHub, and exports the audit log.
2. **Climax:** the export lists every GitHub write and every agent tool call with actor, time and affected objects.
3. He opens the switch settings, turns GitHub and Agent access off, and confirms in the header that both pills read `Off`.
4. He triggers a GitHub action to check; it is rejected as disabled with the message naming the switch.

Failure: an agent call arriving after the switch change is rejected and shows in Activity as blocked.

### Flow 6 — UJ-7. Nora publishes BMad epics and stories as a story map

1. Protection is on; Nora asks the agent to publish 6 epics and 34 stories.
2. She opens the ChangeSet preview on Planning: epics are Activities, one Step per epic carries the epic's name, the MVP slice is a Release lane.
3. She deselects one story cluster and applies.
4. In Slices the view flags Story 3.2 as `Blocked order` behind its prerequisite 2.4; she drags it into the next Slice (or uses Move) and the flag clears; the change is logged as her edit.
5. **Climax:** the whole cut is on one board and she can judge it by Slice, count and estimate sum.
6. She opens the Plan drift drawer, lists the moved Story, asks the agent to bring the source files in line, publishes again, and the drawer reads "In line with bmad".
7. After BMad sprint planning the agent sets delivery status by external reference; the tiles show the new Workflow Status and the Tracking view updates.

Failure: the agent renumbers Stories; the ChangeSet proposes archiving unmatched Cards and marks Cards Nora edited by hand as conflicts instead of overwriting them.

UJ-6 (Alex, contributor) has no product surface; its experience is documentation and CI and is out of scope of this spine.

## Open Items

- **Confirmed 2026-09-30:** light theme only; new actor and marker tokens; Activity as the new name of the Audit route with Restore points as a tab; plan drift as a drawer; the key set (focus-scoped single keys, no `/`); responsive scope (desktop; 1.4.10 Reflow excluded); WCAG 2.1 AA; the Discovery zoom stays as is (50 to 125 percent, CSS `zoom`, global); checks by jsdom with axe-core plus manual release checks.
- **[NOTE FOR UX]** No mocks were rendered (fast path). The surfaces with no current counterpart are worth a wireframe before their stories start: ChangeSet review with in-place markers, Slices view, Graph view, What changed panel.
- **[NOTE FOR UX]** The baseline board area "Not assigned" is not a glossary term; Story 2.5 introduces the Parked and Archived lists. Naming and placement of the two need one decision when Story 2.5 starts.
- **[NOTE FOR UX]** Whether MCP host setup should appear on the Getting started checklist is open.
- **[ASSUMPTION, new 2026-09-30]** The Project switcher in the rail header (FR-2 requires create, open and switch in the UI; the current app only shows the name). Needs the user's confirmation.
- **Confirmed 2026-10-17 (2C):** Discovery retains Release lanes, Workflow Status, estimate and priority alongside roles/Personas; the old no-delivery-attributes restriction is superseded. Notes remain visible in legal hierarchy positions.
- **[NOTE FOR UX]** The category names "Dependency" and "Blocker" collide with the Dependency feature (FR-61); they are manual tags, and a rename is open.
- **Deferred, non-blocking:** keyboard models for Tree, Backlog, Tracking and Slices (written when their stories start); hover, disabled and selected interaction tokens; a wireframe pass before Story 4.9 and Epic 5 is recommended; the epics need acceptance criteria for the shared Dialog, the announcer, the roving grid, `?preview` and the Move dialog, and the line "No UX design contract exists" is to be updated.
- **Known limits accepted by decision:** CSS `zoom` on the Discovery board keeps its engine-dependent sticky offsets and drag coordinates and halves targets below 100 percent; contrast, target size, forced-colors and screen-reader behavior are not automated (jsdom only); Reflow is not claimed.
- **Omitted on purpose:** Inspiration & Anti-patterns (no reference products were supplied); dark mode; phone layouts; a shortcut palette.

## Epic 6 accepted behavior — 2026-10-17

- Creation uses at most two control actions (open and submit); text entry inside the form counts separately (1A).
- Filtering retains hidden selected Cards and announces visible/hidden counts. Bulk Archive and Delete are separate; confirmed Delete states full target count and the existing child-handling strategy, normalizes overlapping subtrees once and commits atomically after all target version checks. Push uses the existing selected-set Dry Run/confirmation (3A).
- Used Workflow Status rename and deletion/replacement update the effective-scope Cards atomically; deletion requires a distinct valid replacement. Ambiguous same-name ownership is refused before writes. Persona/Annotation unlinking is confirmed; copied template descriptions are never rewritten by template deletion (4A).
- Release summaries use visible Stories only for count, estimate sum and status distribution, list all unestimated Stories and treat 0 as estimated. Default Release list, Planning and Tracking show open Releases with an explicit show-all path; keep Unscheduled, assignments and history. Discovery retains its Release lanes. This adds no Later per-View settings (5A).
- ETags/conditional snapshot reads are deferred (7C). Use the existing pre-release schema path for required indexes and current-schema Restore tests; baseline migration remains Story 8.1 (8A).
- Epic 6 performance is diagnostic only: record raw 1,000-Card measurements with fixture/environment and cold/warm context. Binding timing gates are later work, while accessibility/functionality gates and earlier-story evidence remain intact (9C).

### Epic 7 interaction decisions

Accepted 2026-10-18; source of truth: [ADR 0008](../../../../docs/adr/0008-epic-7-github-connection-and-sync-policy.md).

- Connections use one reusable keyboard-operable dialog. Explicit Verify, the blocking off-switch notice and final Connect are separate steps. Invalid credentials, unavailable repository/permission, rate limit and network failure preserve the draft and name the next action; a pasted token is never echoed. Report retained file effects if final DB confirmation fails.
- Read-only means no GitHub writes, not permission to overwrite local drafts. Local-only edits remain unsynced, overlapping field edits persist as conflicts and only the disputed field is blocked. Remote-wins uses a local ChangeSet; local-wins opens the shared human-confirmed Dry Run and remains unresolved on Cancel/failure/read-only refusal. Repeated refresh or convergence never silently closes it.
- Connection settings map Activity/Step/Story to available repository-native Issue types; imported type is retained. Unavailable type mapping blocks push with an action to fix it. Do not infer native type from a title prefix or add a GitHub type field to the ordinary Card form.
- Sync changes only mapped status labels and opted-in Annotation labels, preserving unrelated GitHub labels. Existing effective scoped Annotation names supply the mapping; unknown remote labels remain unrelated, and removing an assignment preserves its reusable definition. Export/structure labels remain adapter-managed; preview removals as well as additions. Milestone name, description, due date and open/released state are explicit plan effects; Notes are excluded.
- Health counts/list entries share durable conflict/baseline/deletion evidence, including historical Card identity/Issue links after local deletion. Provider errors are shown explicitly and reading health causes no remote request.
- Ticket creation accepts a GitHub Issue HTTPS URL, `owner/repo#N`, or `N`/`#N` with selected/default connection. It retains composer level/parent/position/Release and text/template across lookup, connection detour, Cancel and errors. Populate authored text deliberately, refuse duplicate scoped ownership and create Card/ref/source/baseline atomically through the incoming ChangeSet path. Protected proposals are not announced as already-created Cards. Notes keep manual/source-citation behavior and do not acquire active outbound ticket ownership.
- Every pending verification/plan/import/resolution captures current scope/epoch. Restore, navigation or input changes invalidate old responses and consent; preserve dirty drafts and return focus to the current valid opener.

## Changelog

- 2026-10-18 v7: Applied Epic 7 D1–D6, explicit verification consent/blocking notice, canonical incoming/outgoing workflows, Unscheduled and read-only conflict behavior, mapped types/labels and retained ticket-composer state.

- 2026-10-17 v6: Reconciled all nine accepted Epic 6 decisions, removed the Discovery delivery-field contradiction and kept Export on existing surfaces. Keyboard, Dialog, live-update and manual/automated accessibility requirements are unchanged.
