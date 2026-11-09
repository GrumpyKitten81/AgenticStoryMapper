---
name: github-projects
description: Read and filter the GitHub ProjectsV2 planning board by milestone, iteration, team, type, or project.
---

# GitHub Projects

Date: 2026-11-08. Version: 2.0.1.

Reproducing statement: Read and filter ProjectsV2 boards with the GitHub CLI only; resolve issue details separately with `github-issues`.

## Requirements

An authenticated GitHub CLI with the `read:project` scope (`gh auth refresh -s read:project` adds it). The owner is the user or organization login of the board. Never print, log or store token values.

## Reading

Board metadata, fields and views:

```sh
gh project view <number> --owner <owner> --format json
gh project field-list <number> --owner <owner> --format json
```

Items, including custom field values such as Status, Iteration or Team:

```sh
gh project item-list <number> --owner <owner> --limit 500 --format json > board-items.json
```

Each item has `content` (`type`, `repository`, `number`, `title`, `url`) plus one key per set field value (for example `status`). Key names and value shapes depend on the board's fields; inspect one item (`jq '.items[0]' board-items.json`) before filtering.

## Filtering

`gh project item-list` returns up to the requested limit. Before filtering, verify the export is complete:

```sh
jq -e '.totalCount == (.items | length)' board-items.json
```

If this fails, rerun the export with `--limit` equal to the reported `totalCount` and repeat the check. Filter the complete export locally with `jq`. Examples, to adapt to the inspected keys:

```sh
jq '[.items[] | select(.status == "<status>")]' board-items.json
jq '[.items[] | select((.iteration.title // "") == "<iteration>")]' board-items.json
jq '[.items[] | select(.content.type == "Issue" and (.labels // [] | index("<label>")))]' board-items.json
jq '[.items[] | select(.content.repository == "<owner>/<repo>")]' board-items.json
```

View filters configured in the GitHub UI are not applied by the CLI; express them as `jq` filters.

## Limits

Read-only: this skill never edits boards, items, fields or issues. Read issue bodies and comments with the `github-issues` skill; import a board into Agentic Story Mapper with the `github-board-import` skill.

## Changelog

- 2026-11-08 v2.0.1: Verify exported item count before filtering; increase the limit when needed.

- 2026-11-08 v2.0.0: Replace the bundled Python reader with `gh project` commands and local `jq` filters.
