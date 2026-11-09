# Prepare Epic Workflow

**Goal:** For epic `{epic_num}`, produce `epic-{N}-preparation.md` and one `story-plan-{N}-{M}-{slug}.md` per story in that epic, with a single coherent design across stories.

**Language:** `{{.communication_language}}` for dialogue; `{{.document_output_language}}` for files.

## Inputs

Resolve `{epic_num}` from the invocation (required). Load:

- Epics file under `{{.planning_artifacts}}`
- `{{.implementation_artifacts}}/sprint-status.yaml` when present
- Architecture spine / PRD / UX companions when needed for design decisions (prefer spine + epics first)

## Outputs (exact paths)

| Output | Path |
| --- | --- |
| Epic preparation | `{{.implementation_artifacts}}/epic-{epic_num}-preparation.md` |
| Story detail plan | `{{.implementation_artifacts}}/story-plan-{epic_num}-{story_num}-{slug}.md` per story |

Use `assets/epic-preparation-template.md` and `assets/story-plan-template.md`.

## Procedure

1. **Extract epic scope** — title, goal, ordered story list (number + title + acceptance hints from epics).
2. **Investigate codebase** — enough to anchor cross-story boundaries (packages, contracts, DB, API/MCP surfaces). Record shared decisions in the epic preparation doc, not repeated long prose in every story plan.
3. **Write `epic-{epic_num}-preparation.md`** — cross-story API/shape, sequencing, shared types, forbidden approaches, dependency graph. Set frontmatter `status: ready` when complete.
4. **For each story in order** (respect dependencies):
   - Draft `story-plan-{epic_num}-{story_num}-{slug}.md` from the template.
   - Reference epic preparation by path; do not contradict it.
   - Carry forward decisions from earlier story plans in the same epic (interfaces already fixed, tables already extended).
   - Include ordered tasks with target paths, acceptance outline (Given/When/Then), risks, and explicit **Out of scope**.
   - Set frontmatter `status: ready` when the plan is complete.
5. **Consistency pass** — re-read all story plans and epic preparation; fix contradictions.
6. **Report** — list files written; remind that dev consumes these via `bmad-build-auto` step 02 (`docs/bmad-epic-preparation.md`).

## Rules

- Do not write runnable `spec-*.md` files (that is dev step 02).
- Do not modify `sprint-status.yaml` (orchestrator-owned).
- Slug: kebab-case from story title; match the slug you expect for `spec-{epic}-{story}-{slug}.md`.
- If epic or stories cannot be resolved, stop and state what is missing.

## On Complete

Summarize artifact paths and recommend committing implementation artifacts before `bmad-loop run --epic {epic_num}`.
