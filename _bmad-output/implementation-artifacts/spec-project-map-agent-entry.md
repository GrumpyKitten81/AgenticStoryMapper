---
title: 'Clarify Projects and Maps with compact help and Agent setup'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
baseline_commit: '6f624eff84001a8c807d66bed6f86c2693a89a77'
review_loop_iteration: 0
context: []
---

# Project, Map and Agent entry refinement

Date: 2026-10-31. Version: 1.
Reproducing statement: Correct the previous first-use UI: clear Project/Map roles, consistent central design spacing, no permanent explanation in the Map workspace, and immediately accessible optional working Agent setup.

<frozen-after-approval reason="Explicit user implementation request">

## Intent

The current creation-first overview obscures the Project container and uses inconsistent spacing. Its persistent map guidance wastes workspace. AI-agent control is a core app concept and its setup must be clearly available immediately after setup, before any map exists.

Show the active Project first, then explicitly subordinate Story Maps belonging to that Project, using the central design system. Keep immediate map creation/navigation. Put help behind a small accessible control inside the existing map toolbar; no persistent explanatory block or completion/autosave text in map content. Make optional MCP host setup directly accessible from overview/navigation without a map, giving working generated config, copy actions, prerequisites and verification steps.

## Boundaries & Constraints

Always follow and document the central design system for GUI work. Add an explicit project rule outside the managed AGENTS.md block: inspect central tokens/layout/form/action primitives, reuse them, verify actual affected page/dialog spacing at desktop/narrow viewport, no ad hoc local visual overrides. Preserve persistence, startup flow, safety/approval and map creation behavior. Keep GitHub separate and optional. User content and external host configuration files stay untouched. No commit/push requested.

Never consume Map workspace with instructional panels. No extra dependencies, external accounts or integrations required on Agentic Story Mapper side. Agent host login/provider setup remains the host's responsibility and must be explained, not performed silently. No silent enabling permissions or claims that a host is connected merely because config is available.

## I/O & Edge-Case Matrix

| State/action | Expected behavior |
| --- | --- |
| Empty/existing Project overview | Project identity and role precede owned maps; clear named creation and separated project-wide archive actions; consistent token spacing |
| Create map | Same trimmed/pending/error/retry behavior and direct enabled-default navigation |
| Map open | Existing toolbar contains compact help control; explanation/completion/autosave hidden unless explicitly opened; help can invoke correctly parented existing composer |
| Preview | Help never enables mutations |
| No maps yet | Agent setup reachable and usable through project or global route without map context |
| Config pending/error/copy failure | Explicit status, error and retry/copy outcome; never undefined configuration |
| Agent configuration | Generated absolute Node/bridge/stable startup-directory values reused; host restart/reconnect and read-only Projects/maps check explained |

</frozen-after-approval>

## Code Map

- AGENTS.md: append GUI design rule outside managed markers; relevant styles tokens.css, controls.css, foundation.css, changeset-panels.css define central forms/buttons/panels and Project styles. Follow .cursor/rules and global guidance.
- apps/web/src/app/routes/story-maps.index.tsx: current create form first; ProjectDetails last; GettingStartedChecklist constant. Restore Project as top container and make owned maps clear. Use form-stack/button-row/panel-heading primitives; avoid panel nesting and excessive copy. Keep checklist/help secondary/collapsible.
- FirstMapGuidance.tsx: currently shared-shell panel before Outlet; nextFirstMapAction correctly traces persisted visible hierarchy and composer integration. Move compact trigger into view-toolbar-actions, use existing Dialog for optional guidance, preserve valid parent and preview behavior and awaited canonical mutations.
- apps/web/src/features/ai-mcp/AiMcpPanel.tsx: HostConfigView and ConfigBlock render copyable generated host configs but setup buried after proposals. Extract reusable host-only AgentSetupPanel; existing map panel reuses it. useMcpHostConfigs() independent of maps, returns full typed configs through /api/mcp/host-configs. No backend change needed.
- apps/server/src/http/routes/infrastructure-routes.ts: generated configs use absolute node, bridge, stable startup runtimeDirectory and actual port discovery. Preserve existing endpoint and schema. Available configs: development command, claudeDesktop, cursor, vsCode. No need to fabricate Codex CLI syntax.
- apps/web/src/app/router.tsx, RootLayout.tsx, route-heading.ts: introduce map-free Agent setup entry; make it reachable from Setup navigation and overview even for zero maps. Add optional generic/global /agent-setup route using active/first Project if useful to print a stable launcher URL. Use existing SafetySwitchStrip/settings affordance to show/manage Agent mode, keep provider forwarding explanation and GitHub independent.
- scripts/launcher.mjs can print actual runtime URL + /agent-setup immediately after health; setup success can mention Agent setup. README/Runbook describe optional host installation/sign-in, copy config, host reload and read-only verification. Explain local deterministic templates are not an embedded LLM.

## Tasks & Acceptance

- [x] Project hierarchy and spacing: clear container identity above owned-map creation/list; subordinate storage/archive details and checklist; regression assertions reflect relationships.
- [x] Compact help: move to existing toolbar; no permanent first-map text panel; opened dialog/composer focus, valid hierarchy and preview checks.
- [x] Reusable map-free Agent setup: generated host configuration/copy, prerequisite/steps, safety and loading/error/retry states. Reuse in map AI/MCP and expose immediately after startup.
- [x] Record GUI design-system rule in AGENTS.md and update affected docs/strings.
- [x] Focused web/setup regressions, web typecheck/build, source hygiene; actual browser desktop/narrow inspection and real read-only bridge smoke against isolated runtime.

Acceptance:
- Given zero maps, when opening the app, then Project and owned-map roles are explicit and Agent setup is available.
- Given any supported map view, when opened, then help consumes only a toolbar control until requested.
- Given a running setup, when copying host configuration, then its bridge process can initialize and list tools without any map or external provider credentials.
- Given default safety settings, when viewing setup, then it never claims GitHub is enabled or a host is connected without evidence.

## Implementation Notes

No intent gaps or irreversible actions. Use existing supported host configurations while awaiting optional user host preference; no host-specific CLI automation required. Root will verify isolated bridge protocol and UI after implementation. Prior user instruction explicitly authorizes optimizing code and adding project guidance.

## Review Triage Log

- Blind path wrapping: medium, patch. Relocated code lost the ancestor selector supplying overflow-wrap:anywhere; use central path primitive and long-path regression.
- Blind all-view help: medium, patch. Export view-kind gate excludes slices/graph/github; help must be independent from export capability.
- Edge all-view help: medium, patch. Same verified gate as blind finding; retain export gating while exposing help in all supported views.
- Verification stale canonical-refetch tests: medium, patch. Two normal-suite guided creation tests wait for permanent help and fail before assertions; update explicit open/reopen steps and retain delayed-refetch checks.
- Root form spacing: low, patch. Separate label/input siblings use general grid gap instead of central label/input token; use a wrapping label and standard action row.

## Verification

Run focused web interaction/style/navigation/config-copy tests and launcher output tests as needed; web build/typecheck; native hygiene. Use isolated /tmp data for browser and MCP smoke. Existing unrelated changesets/review.test.tsx size violation and missing-build launcher20s timeout remain known baseline limits, do not alter them.

## Changelog

- 2026-10-31 v1: Capture requested refinements.


## Final evidence

All review patches complete. Root browser verification at desktop and390px confirms clear Project-owned Maps, input label gap4px, anywhere path wrapping, no panel overflow, Agent config blocks fitting narrow width and help absent from workspace until its toolbar icon opens one dialog. Help-to-composer Escape returns focus to toolbar. Empty Discovery uses232px rather than42px sole column. Supported alternate-view normal/preview help covered by component tests.

Verification:98targeted tests after patches;316a11y tests20files; final web build including typecheck; native source hygiene and whitespace pass. Size check reports only existing changesets/review.test.tsx:66 limit. Real isolated generated MCP bridge initialized, listed103tools and successfully called ListProjects with zero maps. No provider login, external host config installation or permission changes performed. Launcher output change is covered by updated test expectation; sandbox launcher runner failed without body diagnostic, no full lifecycle rerun claimed. Existing lifecycle was already verified in previous feature.

Screenshots: /tmp/storymapper-project-overview.png and /tmp/storymapper-compact-map.png. No user data changed, commit or push.
