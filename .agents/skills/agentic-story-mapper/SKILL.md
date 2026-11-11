---
name: agentic-story-mapper
description: >-
  Start, verify, and use Agentic Story Mapper locally with MCP (story maps,
  ChangeSets, Product Context). Use when the user wants guided planning,
  MCP host setup, or agent-driven map work in this repository.
---

# Agentic Story Mapper

Local-first story mapping with MCP for coding Agents. Browser-only editing needs no MCP.

## Quick workflow

1. From the repository root: `node scripts/setup.mjs` (first time) or `node scripts/start.mjs`.
2. Use the **URL printed by the launcher** (preferred `http://127.0.0.1:4317`).
3. In the app: **Setup → Agent**. Choose your host and copy the **Agent prompt** or the registration command.
4. Reconnect the host, then call `ListProjects` and `ListStoryMaps` through MCP — not HTTP.
5. Review **Safety switches** in the header before proposing changes. Review proposals in **Trust → Activity**.

## MCP bridge

Register stdio server `storymapper` using `command` and `args` from `GET /api/mcp/host-configs` at the launcher URL, quoted as given:

`claude mcp add --transport stdio --scope local storymapper -- "<node>" "<repo>/scripts/mcp-bridge.mjs" "<runtime-directory>"`

The runtime directory is the startup `.lsm` folder (where `.port` lives), not necessarily the active Project after import.

## Working on a Story Map

- The user identifies a map by its **Story Map ID** (map toolbar, copy button) or name from `ListStoryMaps`.
- Read the map's **Agent context** with `GetProductContext` (with `storyMapId`) before proposing; update it with `UpsertProductContext`.
- Story Templates: `CreateStoryTemplate`, `UpdateStoryTemplate`, `DeleteStoryTemplate`.

## MCP tools for proposals

- `CreateAiProposal`, `ProposeMapFromSourceDocument`, `ProposeBacklogGrooming`, `ProposeReleaseSlice`
- Application changes: `SubmitChangeSet` with `apply=false`, then human review in Activity / board preview

See `docs/mcp-tools.md` and `docs/RUNBOOK.md#connect-codex-or-claude-code`.

## Rules

- Use MCP for domain data; do not read SQLite or domain HTTP as a substitute.
- `CreateProject` and safety changes remain human-only.
- GitHub integration is optional and separate from MCP registration.
