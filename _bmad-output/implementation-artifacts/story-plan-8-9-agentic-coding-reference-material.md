---
epic: 8
story: 9
status: ready
date: 2026-10-19
version: 2
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.9: Agentic-coding reference material

Reproducing statement: Plan a concise English contributor walkthrough for the actual instruction/planning/review/check workflow, verified by a safe end-to-end dry run and included in final publication audit.

## Intent

An outside contributor can understand and reproduce a small spec-driven Agent change from setup to a PR-ready result without maintainer-only knowledge.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md); use the delivered commands/community rules, standard one-commit-per-story finalization and current publication restrictions.
- Keep the app methodology-agnostic. Explain repository practice without adding BMad features to the product or requiring SaaS accounts for local app use.
- 8.7 predates this story: include the completed reference material/evidence in the final candidate rescan before public push.

## Design decisions (this story)

Write one focused `docs/agentic-coding.md` linked from CONTRIBUTING/README. Explain checked-in `AGENTS.md`, topic rules, optional local user instructions, planning artifacts, epic preparation, story-plan consumption, runnable specs, independent review, meaningful verification and orchestrator-owned tracking. Personal absolute paths, tokens, account identity and private historical excerpts do not belong in examples.

Separate app requirements from optional contributor Agent/CLI prerequisites. Commands must exist in the actual repository/tool CLI. Document that loop dispatch has side effects and requires preflight/auth; do not silently launch an unattended workflow to verify prose. Describe standard sequential story execution, including 8.2, and its one reviewed story commit; intermediate upgrades require checks but no separate commits.

Verify the walkthrough in a disposable clone/branch with a small bounded real change selected from generic repository needs. Perform planning, implementation, review, local checks, commit/PR preparation according to the authorized dry-run scope. Keep final material a local PR-ready title/body/diff unless an actual remote PR is separately requested; record the remote creation step as simulated. Do not claim hosted PR/branch protection results from local preparation, or an outside human trial that did not occur.

Have the dry-run participant follow only the instructions and record each missing dependency/command/link and repair it. An isolated Agent reproduction may be useful evidence but must be identified as such; do not label it a real external-contributor validation. Reference installed skills by current paths and avoid claiming globally installed tools are available to every clone.

## Task sequence

1. Inspect `AGENTS.md`, `.cursor/rules`, current skills/customizations and `_bmad-output` layout; enumerate the actual minimal contributor sequence and distinguish repo files from optional local tooling.
2. New `docs/agentic-coding.md`: explain instruction hierarchy, preparation → detail plan → runnable spec → implementation → independent review → verification → PR, with concrete current commands and safe generic examples.
3. `CONTRIBUTING.md`, `README.md`, `docs/bmad-loop.md` as needed: link the walkthrough and repair actual contradictory command/workflow claims; keep one authoritative explanation per topic.
4. Execute the documented dry run in disposable state, retaining actual command results, changed paths and PR-ready artifact. Do not modify real user Projects, start an interactive login or publish a branch/PR without authorization.
5. Record participant type, revision, executed steps, simulated remote step and remaining external validation limits in story evidence. Validate all named paths/commands/links and run relevant local gates.
6. Re-run 8.7's final publication audit over this new material and safe dry-run evidence; preserve blockers until the actual final candidate and maintainer prerequisites pass.

## Preliminary code map

- New `docs/agentic-coding.md`; `CONTRIBUTING.md`, `README.md`, `docs/bmad-loop.md`, `docs/bmad-epic-preparation.md`.
- `AGENTS.md`, `.cursor/rules`, `.agents/skills/bmad-build-auto`, `_bmad/custom/bmad-build-auto.toml`, `_bmad/custom/references/bmad-build-auto-epic-story-plans.md`.
- `_bmad-output/planning-artifacts`, implementation preparation/plans/spec examples, shared check/release commands.
- `scripts/bmad-loop-preflight.mjs`, `scripts/bmad-loop-reconcile-sprint.mjs`, 8.7 publication gate.

## Acceptance outline

- **Given** the walkthrough **When** read by a contributor **Then** instruction files, planning artifacts, review/check flow and reproducible PR preparation are explained in current English terms.
- **Given** a bounded small change **When** following only documented steps **Then** a local reviewed/checked PR-ready result is produced and actual versus simulated steps are recorded.
- **Given** every named command/path/link **When** validated **Then** it exists and matches current behavior, including explicit optional-tool prerequisites.
- **Given** final walkthrough/evidence **When** publication is considered **Then** it is included in the exact-candidate rescan and introduces no private/employer content.

## Out of scope

New product methodology features, a second orchestration system, paid-tool requirements for app users, real contributor recruitment claims, remote PR/publication or credentials in examples.

## Risks and mitigations

- Maintainer machine tooling can hide missing setup: execute from disposable state with only documented prerequisites and record participant type.
- A local dry run is not a hosted PR test: name simulated steps explicitly while completing all local review/check work.
- New docs follow the initial audit: require final rescan instead of carrying a stale clean verdict.

## Open questions

None. Real remote PR/external participant evidence is not invented by the local dry run.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 2 | 2026-10-19 | Align contributor guidance with standard loop finalization for 8.2 |
| 1 | 2026-10-19 | Reproducible contributor walkthrough, honest dry-run evidence and final audit handoff |
