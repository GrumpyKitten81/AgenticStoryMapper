---
epic: 4
story: 12
status: ready
date: 2026-10-10
version: 2
epic_preparation: epic-4-preparation.md
---

# Story Plan 4.12: The BMad round trip

Reproducing statement: Prepare Story 4.12's generic-tool BMad publish/re-publish recipe and 6-epic/34-story acceptance without adding a product-specific parser or title-based identity matching.

## Intent

Publish BMad planning files as a story map, preserve human edits on refresh and show delivery status through generic Agent tools. Fulfills FR-54, SM-7 and AD-4/AD-10.

## Cross-story constraints

- Follow [Epic 4 preparation](epic-4-preparation.md); requires 4.1–4.3 and [4.8 submission](story-plan-4-8-an-agent-submits-its-own-changeset.md), 4.9 review, 4.10 slices and 4.11 delivery.
- Supply deterministic recorded fixture inputs for 4.13 browser simulations. Agent reads planning files/sprint status; product does not parse BMad formats or alter orchestrator tracking.

## Design decisions (this story)

Document a recipe using only actual manifested capabilities, their real schemas and returned ids/locators. Source files are imported through inline content; bind each generated Card to the appropriate chunk. Agent instructions read epics, per-story files and sprint status externally and compose generic operations.

Map Epic to Activity and one Step with the Epic's name, Story to Story with acceptance criteria in description, MVP/sprint slice to Release. Stable map-scoped refs are `bmad:epic-<n>`, `bmad:step-<n>`, `bmad:story-<epic>.<n>` plus recipe-defined stable Release ids. Store external ids separately from display titles. Publish one whole-cut command with ordered local refs. If source documents are not already persisted, include their prepared import operations in that same cut before dependent links, using 4.5's explicit local source-import reference plus chunk locator. Protection therefore creates one complete proposal on an empty Project, with no prerequisite source/domain writes. Generating a separate suggested slice uses explicit apply=false as in 4.10; initial whole-cut publication still uses the requested apply=true behavior.

Compare only the same map's bmad-owned refs during refresh. Unchanged input produces no duplicate domain rows/version bumps. Edited files become new immutable documents with replacement Card links to current chunks; old source history remains. Missing/renumbered ids are archive-plus-create, never title guesses. Missing Cards are proposed for archive, never deletion; human-edited removed targets conflict against last bmad baseline before archive. Updated refs/versions may advance only after successful application.

## Task sequence

1. `docs/` planned BMad recipe document (choose a concise path during dev): write Agent instructions, exact mapping/ref rules, explicit Release target, source linking and apply/protection/review/status workflow based on actual manifest.
2. Existing server test-fixture area or new focused fixture directory: define recorded 6-epic/34-story planning inputs, expected hierarchy/refs/Releases and the two-edit/one-remove/one-add variant. Use the acceptance-defined fixture, without fabricated user evidence.
3. Real HTTP/MCP integration tests: execute generic source/submission/approval/apply capabilities against disposable SQLite/Projects; compare unprotected automatic apply with protected one-cut proposal then human API approval/apply.
4. Repeat publication tests: verify no-op versions, edited/new/archive operations, retained source history/replaced current links, map/system isolation, renumbering behavior and human-edit conflicts including removed Cards.
5. Recipe integration for slices/delivery: exercise generic Release assignments and preconfigured method statuses; verify resulting board data/Activity through current read tools.
6. Source guard test over production `packages`/`apps`: forbid BMad-specific parsers while allowing fixture/docs recipe data. Run the 30-plus-Story E2E scenario, source guard and affected checks; record actual evidence for 4.13 consumption.

## Preliminary code map

Delivered 4.8 submission and 4.11 status capability; `application/source-document/`, `application/changeset/`, external-ref repository from 4.3; `application/capability-manifest.json`, `docs/mcp-tools.md`; existing `mcp/http.test.ts`, `mcp/tools/complete-surface.test.ts` fixture patterns. Recipe and BMad-specific test fixture are future artifacts; no product parser exists or is needed.

## Acceptance outline

- **Given** the documented recipe, **when** it reads epics/story/sprint files, **then** only manifested generic tools publish the required mapping, acceptance descriptions, stable Epic/Step/Story/Release refs and file-chunk source evidence.
- **Given** 6 epics/34 stories, **when** auto-applied, **then** 6 Activities, derived Steps, 34 Stories, Releases/refs exist; protected publish stores one cut proposal and human API approval/apply yields equivalent semantic state.
- **Given** an empty protected Project, **when** sources and their linked cut are submitted together, **then** one proposal previews the source chunks/hierarchy and creates no source/chunk/Card rows until approved application.
- **Given** identical re-run, **when** refreshed, **then** no duplicate domain rows/entity version changes occur; required lifecycle/call audit remains truthful.
- **Given** 2 edited Stories, 1 removed and 1 added, **when** refreshed, **then** edits update, addition creates, removal proposes archive, and no Card duplicates/deletions/title identity guesses occur.
- **Given** changed source/renumbered ids, **when** refreshed, **then** new immutable source versions/current links are used with old history retained; ids resolve as archive-plus-create within the same map/bmad system.
- **Given** human-edited existing or removed Cards, **when** republished, **then** all relevant baseline conflicts are reported without overwrite/archive or partial application.
- **Given** E2E/source guard tests, **when** run, **then** the 30-plus-Story SM-7 scenario passes and no BMad parser appears in production packages/apps outside allowed fixtures/docs.

## Out of scope

Product BMad parser, sprint-status mutation, title-based reconciliation, real-user recruitment, Epic 5 drift report, new slicing algorithms or provider integration.

## Risks and mitigations

Unchanged refresh can accidentally relink evidence or bump versions: compare current immutable document/chunk identities and semantic payloads before emitting mutations. Archive candidates must be strictly map/system-owned; forced human edits before removal test that no baseline reset conceals conflicts.

## Open questions

None.

## Changelog

- Version 1 (2026-10-10): Initial generic recipe and repeat-publication acceptance plan.
- Version 2 (2026-10-10): Closed protected first-publication source dependencies and distinguished slice proposal mode.
