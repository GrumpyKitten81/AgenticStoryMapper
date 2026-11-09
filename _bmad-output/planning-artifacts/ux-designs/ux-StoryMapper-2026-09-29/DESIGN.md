---
name: Agentic Story Mapper
description: Calm, dense, local developer tool for reading and shaping a story map together with an agent. Ratifies the existing forest-green light UI of apps/web and adds the tokens the v1.0 surfaces still lack (actors, change markers, safety switches, conflicts).
status: final
updated: 2026-10-13
sources:
  - _bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/epics.md
  - apps/web/src/styles/global.css
colors:
  background: '#F6F7F4'
  surface: '#FFFFFF'
  surface-muted: '#FBFCFA'
  surface-selected: '#EDF6EF'
  border: '#D8DED6'
  border-strong: '#CBD5CB'
  border-subtle: '#E1E6DF'
  text: '#18201D'
  text-muted: '#5A675F'
  chrome: '#1D2A24'
  chrome-hover: '#33443B'
  chrome-text: '#CBD8D0'
  chrome-text-active: '#FFFFFF'
  primary: '#2D5F45'
  primary-hover: '#3D7C59'
  primary-foreground: '#FFFFFF'
  focus-ring-light: '#2D5F45'
  focus-ring-dark: '#FFFFFF'
  border-input: '#7A877F'
  marker-surface: '#FFFFFF'
  marker-conflict: '#7A2E2E'
  level-activity: '#DBE7FB'
  level-activity-border: '#A9C3EC'
  level-step: '#FFF7DF'
  level-step-border: '#E6D28F'
  level-story: '#FFFFFF'
  level-note: '#F6F7F4'
  danger: '#B3403F'
  danger-text: '#7A2E2E'
  danger-surface: '#FFF4F4'
  danger-border: '#D8A7A7'
  warning-text: '#6B4F00'
  warning-surface: '#FFF7DF'
  warning-border: '#E6D28F'
  success-text: '#2D5F45'
  success-surface: '#EDF6EF'
  success-border: '#BDD4C2'
  actor-human: '#2D5F45'
  actor-agent: '#4B3FA8'
  actor-agent-surface: '#F1EFFB'
  actor-github: '#24292F'
  actor-github-surface: '#EEF0F2'
  marker-added: '#2D5F45'
  marker-changed: '#8A5A00'
  marker-moved: '#1F5F8B'
  marker-removed: '#B3403F'
typography:
  page-title:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: 1.3rem
    fontWeight: '700'
    lineHeight: '1.25'
  section-title:
    fontSize: 1.1rem
    fontWeight: '700'
    lineHeight: '1.3'
  body:
    fontSize: 0.92rem
    fontWeight: '400'
    lineHeight: '1.45'
  card-title:
    fontSize: 0.86rem
    fontWeight: '700'
    lineHeight: '1.35'
  meta:
    fontSize: 0.78rem
    fontWeight: '400'
    lineHeight: '1.4'
  label:
    fontSize: 0.82rem
    fontWeight: '700'
    lineHeight: '1.3'
  label-caps:
    fontSize: 0.75rem
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.04em
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  sidebar-width: 248px
  workspace-padding: 24px
  control-height: 36px
  target-min: 24px
  target-preferred: 28px
components:
  sidebar:
    background: '{colors.chrome}'
    foreground: '{colors.chrome-text}'
  sidebar-item-active:
    background: '{colors.chrome-hover}'
    foreground: '{colors.chrome-text-active}'
    radius: '{rounded.lg}'
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.lg}'
    height: '{spacing.control-height}'
  button-danger:
    background: '{colors.danger}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.lg}'
    height: '{spacing.control-height}'
  button-secondary:
    background: '{colors.surface}'
    foreground: '{colors.primary}'
    border: '{colors.border-strong}'
    radius: '{rounded.lg}'
    height: '{spacing.control-height}'
  input-field:
    background: '{colors.surface}'
    foreground: '{colors.text}'
    border: '{colors.border-input}'
    radius: '{rounded.lg}'
    height: '{spacing.control-height}'
  view-tab-active:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  card-tile-activity:
    background: '{colors.level-activity}'
    border: '{colors.level-activity-border}'
    radius: '{rounded.lg}'
  card-tile-step:
    background: '{colors.level-step}'
    border: '{colors.level-step-border}'
    radius: '{rounded.lg}'
  card-tile-story:
    background: '{colors.level-story}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
  card-tile-note:
    background: '{colors.level-note}'
    border: '{colors.border-strong}'
    radius: '{rounded.lg}'
  switch-strip:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.full}'
  actor-badge-agent:
    background: '{colors.actor-agent-surface}'
    foreground: '{colors.actor-agent}'
    radius: '{rounded.full}'
  actor-badge-github:
    background: '{colors.actor-github-surface}'
    foreground: '{colors.actor-github}'
    radius: '{rounded.full}'
  actor-badge-system:
    background: '{colors.surface-muted}'
    foreground: '{colors.text-muted}'
    border: '{colors.border}'
    radius: '{rounded.full}'
  actor-badge-human:
    background: '{colors.success-surface}'
    foreground: '{colors.actor-human}'
    radius: '{rounded.full}'
  change-marker:
    background: '{colors.marker-surface}'
    foreground: '{colors.marker-changed}'
    border: 'currentColor'
    radius: '{rounded.sm}'
  callout-danger:
    background: '{colors.danger-surface}'
    foreground: '{colors.danger-text}'
    border: '{colors.danger-border}'
    radius: '{rounded.lg}'
  callout-warning:
    background: '{colors.warning-surface}'
    foreground: '{colors.warning-text}'
    border: '{colors.warning-border}'
    radius: '{rounded.lg}'
  callout-success:
    background: '{colors.success-surface}'
    foreground: '{colors.success-text}'
    border: '{colors.success-border}'
    radius: '{rounded.lg}'
  modal:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
  drawer:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
  toast:
    background: '{colors.surface}'
    foreground: '{colors.text}'
    border: '{colors.border-strong}'
    radius: '{rounded.lg}'
---

Reproducing statement: Align the Slice comparison component with maintainer-confirmed Before/After Plan states while preserving the existing visual system. Date: 2026-10-13. Version: 2. Changelog: Replaced ambiguous two-Slice comparison with labelled, timestamped Plan-state columns.


## Brand & Style

Agentic Story Mapper looks like a quiet workbench, not a product page. It is a local developer tool that a person and an agent operate on the same map, so the surface must stay out of the way of the map itself: cards are the content, everything else is chrome. The existing interface already has this posture, a deep forest-green navigation rail against a warm off-white canvas with white cards and thin borders. This spine ratifies it; v1.0 does not restyle, it completes.

The single new visual idea is **who did this**. A human edit, an agent change and a GitHub sync must be recognizable at a glance without ever depending on color alone. Actor identity is carried by an icon plus a text label; color only reinforces it.

No decoration: no gradients, no illustrations, no animation beyond an outline pulse of at most 1.2 s that shows a change landing (see EXPERIENCE.md, State Patterns). [ASSUMPTION: light theme only in v1.0; dark mode is a Later item, tokens are named so a dark set can be added without renaming.]

## Colors

- **Forest green (`{colors.primary}` and `{colors.primary-hover}`)** is the only brand color. It marks the active view tab, primary buttons, selection outlines and links between objects. It is never used for warnings or errors.
- **Chrome (`{colors.chrome}`)** is the navigation rail and nothing else. The header, the board and panels stay on `{colors.background}` and `{colors.surface}`.
- **Level tints** identify the three Card levels on the board: Activity blue, Step amber, Story white, Note as a dashed, muted tile. The tints are structural, so they never change meaning; users' own meaning goes into the Card color categories below.
- **Card color categories** are a user-set marker on a Card (Standard, Blocker, Risk, Dependency, Ready, Info, Team 1 to 4). They render as a chip: the swatch color behind a distinct glyph, plus the category word at 12px on Discovery tiles whenever the category is not Standard. Glyphs: Blocker square, Risk triangle, Dependency diamond, Ready circle, Info hexagon, Team 1 to 4 the letters T1 to T4. The palette is never the only carrier, because several pairs are near-equal in luminance and yellow and orange fail 3:1 on white. The chip never fills the tile, so the level tint stays readable. Values stay as they are in `apps/web/src/features/story-map/card-visual-options.ts`; labels move to English (Story 1.1); the free hex input in the bulk bar is removed. The priority badge uses `{colors.text}` on its orange, not white.
- **Semantic callouts** (`danger`, `warning`, `success`) are used for conflicts, protection notices, failed actions and confirmations. A callout always carries an icon and a sentence, never just a tint.
- **Actor colors** (`{colors.actor-human}`, `{colors.actor-agent}`, `{colors.actor-github}`) color the actor badge only. [ASSUMPTION: indigo for the agent, near-black for GitHub; both new.]
- **Change marker colors** (`marker-added`, `marker-changed`, `marker-moved`, `marker-removed`, `marker-conflict`) are used on markers together with a glyph and a word, always on the opaque `{colors.marker-surface}` pill (see Components). [ASSUMPTION, confirmed: new tokens.]
- **Focus** is `{colors.focus-ring-light}` on light surfaces and `{colors.focus-ring-dark}` on chrome and on filled primary controls. It is never used for selection or drop targets.
- **Form-control boundary** is `{colors.border-input}`. `{colors.border-strong}` stays for secondary buttons and decorative edges, where the text carries the meaning.

Contrast, computed with sRGB relative luminance. `{colors.text}` on tiles: 13.3 on the activity tint and 15.5 on the step tint. `{colors.text-muted}`: 5.93 on white, 5.52 on `{colors.background}`, 4.76 on the activity tint. `{colors.primary}` on white 7.41; `{colors.primary-hover}` on white 4.97 and on `{colors.background}` 4.62, so it is a fill and outline color, not small text on the background. `{colors.chrome-text}` on `{colors.chrome}` 10.13 and on `{colors.chrome-hover}` 7.03. `{colors.border-input}` on white 3.75, on `{colors.background}` 3.49. `{colors.focus-ring-light}` on white 7.41, on the activity tint 5.94, on the step tint 6.92; `{colors.focus-ring-dark}` on chrome 14.91 and on `{colors.chrome-hover}` 10.34. Markers on `{colors.marker-surface}`: added 7.41, changed 5.93, moved 6.84, removed 5.64, conflict above 8.6. A token unit test recomputes every pair listed here; a change that drops one below its threshold (4.5:1 text, 3:1 non-text) fails it.

## Typography

One family, the system sans stack with Inter first. The current interface sets sizes in `rem` on a 16px root and this spine keeps that. Roles: `{typography.page-title}` for the story map name in the header, `{typography.section-title}` for panel and modal headings, `{typography.body}` for form and list text, `{typography.card-title}` for titles on Card tiles, `{typography.meta}` for badges, counts and timestamps, `{typography.label-caps}` for the small uppercase eyebrow above a title. The smallest allowed size is `{typography.label-caps.fontSize}` (12px); every smaller value in the current CSS (0.66rem to 0.74rem) is raised to it and a lint rule keeps it there.

Card titles wrap to at most three lines on the board and truncate; the full title is in the Card modal, in the accessible name and in a focus-and-hover popover that is dismissible and stays open while hovered. `nowrap` truncation is reserved for numeric columns.

## Layout & Spacing

Desktop-first application shell: a fixed navigation rail (`{spacing.sidebar-width}`) and a workspace that scrolls on its own, with `{spacing.workspace-padding}` padding. The workspace header holds the story map name, the safety switches and the change indicator; below it, the view tabs; below them, the view.

Spacing follows a 4px base (`{spacing.1}` to `{spacing.6}`). Controls are `{spacing.control-height}` high. Every interactive target measures at least `{spacing.target-min}` square at Discovery zoom 100 percent (`{spacing.target-preferred}` preferred), including options inside popovers; a smaller glyph gets its size from padding, not from the icon. [ASSUMPTION, confirmed: 24px is a house rule that follows WCAG 2.2 target size.]

The Discovery board is a wide two-dimensional grid (Activities and Steps across, Release lanes down) and is the only place that scrolls horizontally. Its zoom factor (the existing 50 to 125 percent, global across Story Maps, implemented with CSS `zoom`) stays as it is by decision of 2026-09-30. It is an overview aid, not an accessibility mechanism: sizes are measured at 100 percent and browser zoom is the way to magnify. Other views are single-column or two-column layouts with a maximum content width of about 1200px.

Viewport: desktop. WCAG 2.1 AA is claimed for viewports of 768px and wider; below 980px the current CSS turns the rail into a top bar, which stays. Phones are not a target and 1.4.10 Reflow is explicitly out of the v1.0 conformance scope (decision 2026-09-30).

## Elevation & Depth

The interface is nearly flat: depth comes from borders (`{colors.border}`), not shadows. Tiles carry the existing resting hairline shadow (0 1px 2px); popovers, the Card modal, confirm dialogs, drawers and the drag preview carry larger ones. Popovers use `0 4px 12px rgb(24 32 29 / 18%)`, modals and drawers `0 20px 60px rgb(24 32 29 / 24%)`. Pinned lanes and sticky headers use a `border`, not a `box-shadow`, because shadows disappear in forced-colors mode.

## Shapes

Radii are small and consistent: `{rounded.lg}` for tiles, panels, modals, buttons and inputs (as in the code today); `{rounded.md}` for tabs and small icon buttons; `{rounded.sm}` for inline markers; `{rounded.full}` for badges, switch strips and pills. Notes use a dashed border instead of a different radius, so "not a deliverable" is a shape cue and not only a tone.

## Components

- **Sidebar / sidebar-item-active** — `{components.sidebar}`, items 40px high with an icon and a label; the active item uses `{components.sidebar-item-active}` and `aria-current`. Icons come from Lucide only. Items that lead to Later-tier surfaces carry the text "Experimental" as a small pill.
- **View tabs** — a segmented row under the header. Active tab `{components.view-tab-active}`, inactive `{colors.text-muted}`. Slices and Graph sit after a hairline divider so the row reads as map views then analysis views.
- **Form field** — a `{typography.label}` label above an input, select or textarea; help and error text below in `{typography.meta}`.
- **Input field** — `{components.input-field}`; the boundary is `{colors.border-input}` on every surface it appears on. Error state adds a `{colors.danger}` border, an icon and adjacent text.
- **Card tile** — `{components.card-tile-activity}`, `{components.card-tile-step}`, `{components.card-tile-story}`, `{components.card-tile-note}`. Anatomy, top to bottom: Card Key with bulk-select checkbox and level badge (the badge is mandatory, it carries the level when tints vanish); title; badge row (estimate, Release, source count, ticket number, dependency badge); in Discovery a footer with provider icon, ticket number, category chip and priority. Level tokens are the same in Discovery and Tree (the Tree today uses other hues and is aligned).
- **Tile states** — focus: 2px outline in `{colors.focus-ring-light}` with 2px offset and a white halo on tinted tiles; bulk-selected: checked checkbox plus a 3px left bar in `{colors.primary}` (the level tint is kept); current in modal: the same left bar plus the word "Open" in the badge row; drop target: dashed `{colors.primary}` outline plus the hint text. Focus, selection and drop target never share a style.
- **Category chip / priority badge** — swatch behind glyph plus word (see Colors); the popover for either is a Popover.
- **Switch strip** — `{components.switch-strip}` in the header: three pills, Agent access, GitHub, Agent protection. Each shows the name, `On` or `Off` as text and a dot that is filled for On and hollow with a border for Off. Agent protection has a shield icon that changes shape; no warning tone, because protection is a safe state. A blocked-call count on Agent access appears as text.
- **Actor badge** — `{components.actor-badge-human}`, `{components.actor-badge-agent}`, `{components.actor-badge-github}`, `{components.actor-badge-system}`. Icon (person, bot, GitHub mark, gear) plus the word (`You`, the agent host name, `GitHub`, `System` for migration, restore and pre-apply actions).
- **Change marker** — `{components.change-marker}`: an opaque pill on the tile's top edge with glyph, word and a 1px border in its color. Kinds: added, changed, moved, removed, conflict (see the state-cue table). Removed tiles stay visible with a strike-through, `{colors.text-muted}` text and a dashed border, never below 90 percent opacity. Highlight pulses animate the outline or the left bar, never the background.
- **Dependency badge** — a link glyph and the count of prerequisites, on both tiles of a Dependency. A violation replaces the glyph with a warning triangle and the word `Blocked order`, `{colors.danger-text}` on `{colors.danger-surface}`.
- **Slice lane** — a Release as a Slice: header with name, Story count, estimate sum and a segmented status bar with numbers; below it the Story tiles; a violation row lists `Blocked order` Stories. Comparison shows two recorded Plan states side by side, labelled Before and After with capture time and state identity. Each column retains its Release lanes; `+`, `-` and `>` rows use the change markers, with moved rows naming the old and new Slice (including Unscheduled).
- **Graph node and table** — nodes are tile-shaped chips with Card Key, level badge and title; edges are arrows with a text label in the table twin; the selected node uses the tile focus style plus a `Selected` word, its prerequisites and dependents carry `Requires` and `Required by` words. The table twin is a standard table with the columns Card, Depends on, Required by, Blocked order.
- **ChangeSet row** — one row per operation: checkbox, kind word with glyph, object name, actor badge, the change in one line ("Title: A to B", "Release: none to MVP"); `upsert` rows show "may change". A stale operation shows `{components.callout-warning}` inline.
- **What changed row** — actor badge, count and affected Card names grouped by actor; a "Mark as seen" button per group and for all.
- **Restore point row** — class word (`manual`, `pre-migration`, `pre-restore`, `pre-apply`), time, size, schema version, and a Restore button; the confirm dialog states the consequence.
- **Switch settings** — a modal with three real switches, each with its consequence sentence below, and the Agent forwarding notice.
- **Getting started checklist** — a panel with four items, each a checkbox that is checked by the app, not by the user, plus a Dismiss button.
- **Diff** — the Conflict view and ChangeSet rows show two columns labelled Local and Remote (or Before and After); differing fields carry a `Changed` marker, removed text is struck through and added text is underlined, so no diff relies on color.
- **Buttons** — `{components.button-primary}` for the one main action of a surface, `{components.button-secondary}` for others, `{components.button-danger}` only for confirms that delete or restore, always labelled with the verb.
- **Callouts** — `{components.callout-danger}`, `{components.callout-warning}`, `{components.callout-success}`: icon, one sentence, optional action.
- **Toast** — `{components.toast}` at the bottom right with icon, sentence and a Dismiss button; the same information is always kept in What changed or the Activity badge.
- **Popover** — a small floating panel with `{colors.border-strong}` border and the small shadow, rendered above the board and outside its scroll container; options are at least `{spacing.target-preferred}` high with 4px gaps.
- **Tooltip** — text only, appears on focus and hover, stays while hovered, never carries the only copy of information.
- **Drawer** — `{components.drawer}` slides from the right over the board, 420px wide, for the Plan drift report and What changed.
- **Modal** — `{components.modal}`. The Card modal is the large variant with a header (Key, title, actor of last change, close), a body of sections and a footer with save state. Confirm dialogs are the small variant.
- **Empty state** — icon-free: a title, one sentence, one primary button.
- **Lane header** — Release lane title, count, estimate sum and collapse control; sticky while scrolling horizontally.

### State cues

Each state has a word, a glyph shape and a color; the word and glyph are mandatory and are what a grayscale or forced-colors rendering keeps.

| State | Word | Glyph | Color token |
|---|---|---|---|
| Added | New | plus | `{colors.marker-added}` |
| Changed | Changed | tilde | `{colors.marker-changed}` |
| Moved | Moved | right chevron | `{colors.marker-moved}` |
| Removed | Removed | minus | `{colors.marker-removed}` |
| Conflict | Conflict | two arrows | `{colors.marker-conflict}` |
| Blocked order | Blocked order | warning triangle | `{colors.danger-text}` |
| Stale sync | Stale | clock | `{colors.warning-text}` |
| Protected | Protected | shield | `{colors.text}` |

The glyphs are decorative (`aria-hidden`); the words are read.

### Forced colors and motion

In forced-colors mode swatches and marker pills keep a `1px solid CanvasText` border and their glyph, tiles get a `CanvasText` border, focus uses `Highlight`, and hairlines are borders. `color-scheme: light` is declared. Under `prefers-reduced-motion: reduce`: no animation or transition beyond an opacity fade of at most 150 ms, sortable drag transitions off, skeletons static; the change marker remains the only cue.

## Do's and Don'ts

- Do give every state a word and a glyph in addition to a color.
- Do keep tiles compact; the board must show many Cards at once.
- Do use `{colors.primary}` for links between objects and for the active view.
- Do show the actor next to every change and history entry.
- Do give every interactive target at least `{spacing.target-min}` at zoom 100 percent.
- Don't remove an outline without replacing it; there is one global `:focus-visible` rule.
- Don't tint a tile with a Card color category; use the chip.
- Don't hide a removed object in a ChangeSet preview; strike it through. Archived and parked Cards do leave the board, into their named lists.
- Don't add a third accent color; the actor and marker tokens are the only additions.
- Don't use emoji, illustrations or celebratory motion. This is a tool.
- Don't rely on hover, or on the `title` attribute, for an action or for information.
