# Agent-authored templates, map-specific template assignment and a global Agent page

Date: 2026-11-11. Version: 1.
Reproducing statement: Replace the overloaded per-map AI/MCP tab with a global Agent guide while keeping map identification, map context, deterministic proposals and templates; move template authoring out of the UI and keep template reference and assignment per map in the UI.

- Status: accepted
- Deciders: Project owner

## Context and Problem Statement

The per-map AI/MCP tab mixed host JSON, a tool list, a ten-field Product Context form, a prompt-template editor, proposal forms, source actions and a ChangeSet list. Normal users could not understand or maintain it, and in an agent-driven app most of it does not need manual upkeep. A first refactor removed the tab completely. That also removed Product Context editing, AI function template editing (human-only HTTP, unreachable via MCP) and agent-free proposals, which conflicted with FR-17 and FR-35.

## Decision Drivers

- The UI explains how to instruct an Agent; configuration lives in skills, files and scripts.
- Story Maps stay identifiable by ID, and map context stays maintainable.
- Templates belong to the GitHub work-item context: authoring is not a UI task, but referencing and assigning templates per map is.
- Browser-only use keeps deterministic proposals.
- ChangeSet-first and audit rules stay intact.

## Considered Options

1. Keep the tab and tidy it up.
2. Remove the tab and rely only on MCP.
3. Use a global Agent guide and move each retained function to where the work happens; Agents author templates and the UI assigns them.

## Decision Outcome

Chosen option: 3, because it removes configuration noise without losing functions and matches the agent-first goal.

- **Setup → Agent** (`/agent`, global) shows host choice, a quoted CLI registration or host JSON, and a copyable Agent prompt. `/agent-setup` and `…/ai-mcp` redirect there.
- The map toolbar shows the copyable **Story Map ID** and an **Agent context** dialog for the map's Product Context: core fields visible, the others collapsed.
- Deterministic proposals are buttons in Sources, Backlog and Releases. ChangeSet review, including **Preview on board**, lives in Activity.
- **Template authoring through Agents:**
  - Story Templates are created, changed and deleted through the existing MCP tools as ChangeSets, typically from Markdown sources such as `docs/templates/` or `.github/ISSUE_TEMPLATE/`.
  - AI function templates get `aiTemplate` ChangeSet operations exposed to MCP, replacing the human-only HTTP administration.
  - Customize lists templates read-only.
- **Template assignment per map:** the map's GitHub context assigns a Story Template per Card type (`templateAssignments: [{ cardType, storyTemplateId }]` on the Story Map, written through `set:map`). Card creation preselects the assigned template, and Agents read the assignment with the map.
- Until the assignment and the `aiTemplate` operations exist, the prompt-template editor remains as a collapsed Customize disclosure.

### Consequences

- Good: the setup page is understandable; retained functions sit next to the work they affect; templates are versionable files and auditable ChangeSets.
- Bad: humans without an Agent can no longer author templates in the UI; the Story Map contract, database and operation registry need a migration for `templateAssignments`.
- Neutral: the generic `CreateAiProposal` picker leaves the UI and remains available to Agents; the MCP tool list is replaced by the header's Safety switches.

## Changelog

- 2026-11-11 v1: Record the global Agent page, relocated functions and agent-authored, map-assigned templates.
