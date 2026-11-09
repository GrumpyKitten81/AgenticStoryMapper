# Epic preparation (detail plans)

Date: 2026-11-08

Version: 1.3.0

Reproducing statement: Defines the Agentic Story Mapper workflow for preparing an epic before bmad-loop dev—skill `bmad-prepare-epic`, artifact locations, and how `bmad-build-auto` must consume per-story detail plans during its planning step.

## Purpose

This is optional maintainer automation for developing Agentic Story Mapper; it is not required to install or use the application.

For the English manual contribution sequence, see the [Agentic-coding walkthrough](agentic-coding.md).

Before unattended dev (bmad-loop), a stronger planner can work story-by-story while keeping **one consistent epic design**. Output is committed under `_bmad-output/implementation-artifacts/` and consumed automatically in dev **step 02 (Plan)**.

## When to run

After sprint planning marks epic stories `ready-for-dev` or `backlog` and before the first `bmad-loop run` for that epic—especially when dev uses a weaker local model that needs concrete guidance.

Recommended order:

1. Planning artifacts current (PRD, architecture spine, epics, UX as needed).
2. `bmad-sprint-planning` → `sprint-status.yaml`.
3. **`bmad-prepare-epic`** for epic N (this document).
4. `bmad-loop run --epic N` (or per-story).

## Skill

Invoke: **`/bmad-prepare-epic`** with epic number (e.g. `4` or `epic 4`).

Install location (keep both copies in sync):

- `.claude/skills/bmad-prepare-epic/`
- `.agents/skills/bmad-prepare-epic/`

## Artifacts produced

| Artifact | Path pattern |
| --- | --- |
| Epic preparation (cross-story) | `_bmad-output/implementation-artifacts/epic-{N}-preparation.md` |
| Per-story detail plan | `_bmad-output/implementation-artifacts/story-plan-{N}-{M}-{slug}.md` |

Slug matches the story title in kebab-case (same convention as `spec-{N}-{M}-{slug}.md`).

Commit these with the epic wave (tracked implementation artifacts).

## Dev stage consumption

`bmad-build-auto` loads preparation artifacts via:

- `_bmad/custom/bmad-build-auto.toml` (activation + persistent facts)
- `_bmad/custom/references/bmad-build-auto-epic-story-plans.md` (binding rules)
- Step 01 / 02 instructions in the skill snapshot (allowlist + load hooks)

Detail plans **constrain** step-02 planning; they do not replace the Code Map or READY FOR DEVELOPMENT gate.

## Integrated epic acceptance

Before accepting a completed epic, exercise its shared state across story boundaries. Include absent/default values in filters, explicit re-review after concurrent definition changes, removal of a creation scope while editing another valid item, and mounted edit–Restore–edit with lower restored versions. Keep a save pending across Restore and verify that its late response cannot replace current state or authorize a queued old intention. Check selection counts and focus against the active View, including collapsed and released lanes, and retain dirty drafts with explicit conflict recovery.

Record exact executed tests, persistence readback and available browser checks. Establish delivery from the actual reviewed change, reproducible checks and retained evidence; neither a finished loop nor `done` story rows proves it. The retrospective assesses integrated acceptance against that evidence. Record native/platform/reader scenarios that could not run as unverified, with the reason. Apply the accepted [platform policy](adr/0012-minimal-hosted-ci-and-local-verification.md); unavailable environments alone do not create a mandatory release gate. Do not infer acceptance from automated accessibility checks or diagnostic latency samples.

## Relation to other files

| File | Difference |
| --- | --- |
| `epic-{N}-context.md` | Auto-compiled from planning docs during dev; short orientation. |
| `epic-{N}-preparation.md` | Human/agent epic wave: cross-story design and sequencing. |
| `story-plan-*` | Per-story executable intent before the runnable `spec-*`. |
| `spec-*` | Runnable dev spec (`bmad-build-auto` output, `ready-for-dev` → implement). |

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.3.0 | 2026-11-08 | Clarify maintainer-only scope and accepted platform limits |
| 1.2.0 | 2026-10-20 | Require independent delivery evidence and link the English walkthrough |
| 1.1.0 | 2026-10-18 | Add integrated acceptance checks from Epic6 retrospective P1 |
| 1.0.0 | 2026-10-10 | Initial skill, custom overrides, and dev integration |
