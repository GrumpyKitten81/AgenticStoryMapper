---
name: github-board-import
description: Import the open issues of a GitHub ProjectV2 board into Agentic Story Mapper via tools/github_board_import.py. Use for board imports, dry-runs, sync of an existing imported Story Map, and the optional cleanup proposal.
---

# GitHub Board Import

Date: 2026-11-08. Version: 3.0.0.

Reproducing statement: Turn the open issues of one ProjectV2 board into a reviewable Agentic Story Mapper ChangeSet with `tools/github_board_import.py`; apply it only as a separate, user-approved step.

## Requirements

- Python 3 and an authenticated GitHub CLI with the `read:project` scope (`gh auth refresh -s read:project`). `--token-env <VARIABLE>` makes `gh` use the token in that variable instead. Never print, log or store token values.
- A running Agentic Story Mapper server for `--sync`, `--execute` and `--apply-change-set`. Use `--url` or `STORYMAPPER_URL` for its loopback origin (default `http://127.0.0.1:4317`) and `--project-id` when more than one Project exists. A plain dry-run only reads GitHub.

## Workflow

1. Dry-run and inspect the JSON: `importableIssues`, `closedOnBoard`, `repositories` and `skippedItems` with `skippedSample`.
2. Add `--execute` to submit a ChangeSet. It is only proposed, not applied.
3. Show the user the returned operations. Use `--cleanup` (delete the Project's other Story Maps) only when the user asked for it.
4. After the user approves, run `--apply-change-set <id>`. The server records approval and applies atomically; GitHub is not read again.
5. To refresh an imported map later, use `--sync` (dry-run) and then `--sync --execute`, and apply as above.

The script never opens or copies a database; all Agentic Story Mapper access goes through `POST /api/tool-proposals/github-board` and `POST /api/changesets/<id>/approve` and `/apply`. GitHub is only read.

## Usage

Run from the repository root; on Windows use `py` instead of `python3`.

```sh
python3 tools/github_board_import.py --board-owner <owner> --board-number <number> --limit 10
python3 tools/github_board_import.py --board-owner <owner> --board-number <number> --status "<status>"
python3 tools/github_board_import.py --board-owner <owner> --board-number <number> --story-map-name "<name>" --execute
python3 tools/github_board_import.py --apply-change-set <changeset-id>
python3 tools/github_board_import.py --board-owner <owner> --board-number <number> --story-map-name "<name>" --sync --execute
```

## What gets imported

- All open issues on the board; `--status` keeps only items whose Status field has that value. Draft issues and issues the credentials cannot read are skipped and listed in `skippedSample`.
- The server maps the GitHub issue type: Epic becomes an Activity, Feature a Step, everything else a Story. Parents come only from GitHub's parent relation, never from titles or labels.
- Sync updates linked Cards, adds new issues, and proposes removing Cards whose issue is closed. Issues that left the board but are still open are kept (`keptOpenOutOfBoard`); issues whose state cannot be read are reported in `removalUnresolved`. Local parent overrides survive a sync.

## Checking the result

Read `GET /api/story-maps?projectId=<project-id>` and `GET /api/story-maps/<story-map-id>` on the server, or the MCP tools `GetStoryMapCards`, `ListGitHubLinks` and `GetGitHubSyncHealth` (see [RUNBOOK](../../../docs/RUNBOOK.md#mcp-operation) and [MCP tools](../../../docs/mcp-tools.md)). Use `github-projects` to explore a board and `github-issues` to read single issues.

## Changelog

- 2026-11-08 v3.0.0: New importer `tools/github_board_import.py` reading through `gh`; any board view and owner type, optional Status filter, one token option.
