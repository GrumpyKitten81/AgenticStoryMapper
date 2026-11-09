# A contributor's agentic-coding walkthrough

Date: 2026-11-08. Version: 8.

Reproducing statement: Keep a short current contribution workflow, separate optional maintainer automation and historical rehearsals from normal development, and preserve instruction, verification and publication boundaries.

This guide concerns changing the repository. To use Agentic Story Mapper with a coding Agent, follow the [README](../README.md#with-codex-or-claude-code), including its initial MCP connection. Ordinary contributions do not require a BMad installation or an Agent subscription.

## Make a focused change

1. Read [AGENTS.md](../AGENTS.md), its referenced global rules when present, and the matching [topic rules](../.cursor/rules/). Follow the [OpenWolf handoff protocol](../.wolf/OPENWOLF.md); inspect current source and tests after using available graph/index tools to narrow scope.
2. Identify the concrete problem, intended behavior and affected files. Use an applicable existing spec/detail plan for planned work. For a small correction, a short scope and validation description is enough; do not create an epic or replay a historical exercise just to edit documentation.
3. Implement the smallest complete change. Keep user Projects, credentials and ignored machine state out of the diff. Do not change orchestrator-owned sprint/deferred tracking as part of ordinary contribution work.
4. Run checks appropriate to the change using [Contributing](../CONTRIBUTING.md#implementation-and-validation). Test changed behavior and meaningful refusals, inspect affected links/anchors for documentation, and record actual commands, failures and unverified behavior. Final candidate requirements remain in the [release procedure](RUNBOOK.md#versioned-releases).
5. Review the diff and obtain independent review where the selected workflow requires it. Address demonstrated findings and keep the current handoff concise. A completed loop or a `done` tracking row is not acceptance evidence.
6. Prepare the [PR description](../.github/PULL_REQUEST_TEMPLATE.md) with purpose, behavior and validation. Commit, push, remote PR, login, tag and publication actions follow the task's authorization; do not perform them merely to check documentation.

Story Map data changes are a separate workflow: the Agent uses MCP and the product's ChangeSet/approval controls. Editing repository files does not authorize direct database changes or human-only operations.

## Optional maintainer workflows

- [Epic preparation](bmad-epic-preparation.md): cross-story preparation and per-story detail plans before an authorized epic wave.
- [Loop operations](bmad-loop.md): local adapters, multiplexer, preflight and explicit dispatch/resume. Machine-local policy examples are not clone defaults or permission grants.
- [Development tools](agent-tooling.md): optional RTK, code-review-graph and OpenWolf integration for maintainers.
- Installed skills: follow the selected `SKILL.md`, render its workflow when required and use the printed snapshot. Do not mix source and rendered workflow steps.

Complete noninteractive checks before requesting a login or trust action. Time-sensitive interactive work needs confirmed human presence. Tool installation, hook setup and Agent dispatch are operational actions, not documentation validation.

## Historical evidence

The [Story8.9 spec](../_bmad-output/implementation-artifacts/spec-8-9-agentic-coding-reference-material.md) retains the old pinned README-correction rehearsal and its acceptance context. That historical exercise is not the current contributor workflow and need not be repeated for normal changes. Current startup, recovery and release instructions live in the [Runbook](RUNBOOK.md); it also records accepted platform limits and exact-candidate publication safeguards.

## Changelog

- 2026-11-08 v8: Remove the old pinned-revision exercise and repeated evidence-manifest ceremony from the active guide; retain a concise current workflow and links to historical evidence.
