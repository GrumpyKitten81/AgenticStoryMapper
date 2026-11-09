---
title: 'Hide auxiliary views and complete page control design conformance'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
baseline_commit: '3ad6293eae8a2bde3aab13cc39f062a3ff401815'
context: []
---

<frozen-after-approval reason="human-owned intent — approved conversation plan">

## Intent

Hide Releases and Roadmaps by default behind independent view flags and systematically correct remaining page layout/control deviations from the existing central design system. Preserve the uncommitted Sources implementation. No commit or push requested.

## Boundaries & Constraints

Always reuse the strict boolean flag reader, existing design tokens and control primitives. Add VITE_FEATURE_VIEW_RELEASES and VITE_FEATURE_VIEW_ROADMAPS, default false. Gate navigation and direct routes consistently. Redirect disabled map auxiliary routes to the first enabled regular view of the same map, preserving validated card/preview search. Auxiliary flags must not satisfy the minimum-one-main-map-view requirement. Keep release data, assignments, APIs and other planning views available. Document the new flags in the runbook with purposes and defaults, updating metadata/changelog.

Inspect all page components and dialogs, including hidden flag views: Story Maps, Discovery/Tree and other map views, Sources, Releases/Roadmaps, Connections, Personas, Customize, AI/MCP, Activity/Restore and Onboarding. Fix proven design deviations in button variants, action spacing, form spacing, wrapping and stretched actions. Preserve structural card/chip/drag controls. Do not redesign content or change business behavior. Ordinary actions use central36px controls, compact/icon actions32px. Use primary for main actions, secondary for subordinate/edit/cancel actions, danger for destructive actions. Links presented as actions use button-link variants.

Never modify user data or introduce migrations/APIs. Preserve pre-existing work, especially .wolf/memory.md. Existing story-maps.index.tsx58-line size violation is out of scope.

## Tasks & Acceptance

- [x] Add independent release/roadmap flag exports and guard sidebar/router; update test environment and configuration/navigation tests.
- [x] Inspect page action/form layouts and fix confirmed deviations using central patterns; explicitly repair Releases full-width create action and abutting release names/edit buttons. Ensure action groups wrap at390px.
- [x] Update Runbook with both new flags and actual view purposes.
- [x] Add targeted regressions for fixed design flaws; run focused tests and frontend typecheck/build.

Given flags unset/false, navigation omits both views and direct URLs redirect within the same map. Given true, each view is reachable independently. Given invalid values, configuration fails clearly. Given no regular map view, auxiliary flags do not permit startup. Given desktop/390px layouts, actions have consistent central variants, spacing and no accidental stretching or overflow.

</frozen-after-approval>

## Code Map

- apps/web/src/app/feature-flags.ts: strict reader currently private, Sources independent; story-map-view-paths.ts regular tabs only. Add auxiliary flags without adding tabs.
- apps/web/src/app/router.tsx: releasesRoute/roadmapsRoute currently unguarded. Existing storyMapViewRoute demonstrates redirect with params/search.
- apps/web/src/app/routes/RootLayout.tsx: sidebar has ungated releases/roadmaps links. workspace-navigation.test.tsx mocks Sources flag via mutable getter; extend to auxiliary flags. vite.config.ts enables all views for integration tests. feature-flags.test.ts isolates env/module state.
- apps/web/src/styles/controls.css: button variants, form-stack/button-row. workspace-panels.css contains grid panels including release-tracking-panel. ReleasePanel.tsx creates button as direct grid child causing full-width action; release-external-refs rows have no layout rules and edit buttons lack secondary class.
- docs/RUNBOOK.md: v0.4.2 table currently ten flags.

## Implementation Notes

User already approved complete conversation plan; no additional approval needed. Existing tree changes are authorized earlier Sources work. Graph tools unavailable; inspect source directly. Report inspected surfaces and any validation limitations, not a blanket visual-conformance claim based only on static tests. Parent agent handles browser inspection and final independent review; implement source/tests/doc changes and report results. Do not invoke skills or spawn agents.

## Review Triage Log

- medium, patch: blind/edge reviews independently confirmed release badges inherit white-space:nowrap; overflow-wrap alone cannot break long IDs. Apply scoped wrapping/max-width and regression.
- low, patch: blind review confirmed global input width100% makes wrapping inline Roadmap rows stack on desktop. Restore flexible input basis within inline-add groups and regression.
- medium, patch: verification review confirmed synthetic Slice primitive coverage misses actual StorySliceMove markup. Add computed-style checks to the existing real SlicesView interaction test.

## Verification

- Implementation agent:239 tests across15 files and frontend typecheck passed. Parent:302 accessibility tests across20 files passed (counts overlap). Default production build, source hygiene and git diff --check passed.
- Live desktop: Activity/Restore, Connections, Personas, Customize, Onboarding; AI/MCP and Releases fixed controls confirmed intrinsic36px actions. Hidden-view sweep included Sources/Roadmaps(empty), Planning/Backlog/Tracking/Slices/Graph/GitHub. Planning move controls and GitHub grid actions found and repaired.
- Live390px: Restore/Connections/Personas/Customize and fixed Releases/Roadmaps(empty)/AI-MCP/Onboarding no action/panel overflow. Populated Roadmaps/dialog edge states covered by component tests rather than live data mutation.
- Default build restored. Releases and Roadmaps absent in sidebar; both direct URLs redirect to same map Discovery, confirmed live. No persisted user data changed.

- All three review findings patched;44 focused tests in ReleasePanel/RoadmapPanel/SlicesView passed after final corrections. Final default Vite build and whitespace passed. No deferred findings. No commit/push requested or performed.
