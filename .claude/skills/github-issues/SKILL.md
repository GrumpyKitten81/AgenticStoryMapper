---
name: github-issues
description: Read GitHub issue details, bodies, and comments via GitHub CLI or REST.
---

# GitHub Issues

Date: 2026-11-08. Version: 2.0.0.

Reproducing statement: Read issues and their comments with the GitHub CLI only; no repository-specific script, no cache.

## Requirements

An authenticated GitHub CLI (`gh auth status`) with read access to the repositories involved. `gh` keeps its own credentials; to use a different token for one command, prefix it with `GH_TOKEN="$OTHER_TOKEN_VARIABLE"`. Never print, log or store token values.

## Reading

One issue with body and comments:

```sh
gh issue view <number> --repo <owner>/<repo> --json number,title,state,url,body,labels,assignees,milestone,issueType,createdAt,updatedAt,closedAt,comments
```

Drop `comments` from `--json` when only the body is needed. Add `--jq` to keep the output small, for example `--jq '{title, state, comments: [.comments[] | {author: .author.login, body}]}'`.

List or search:

```sh
gh issue list --repo <owner>/<repo> --state all --limit 50 --json number,title,state,labels,url
gh search issues "<query>" --owner <org> --state open --limit 20 --json repository,number,title,state,url
```

Fields `gh` does not expose (for example sub-issues) come from the REST or GraphQL API:

```sh
gh api repos/<owner>/<repo>/issues/<number>/sub_issues --jq '.[] | {number, title, state}'
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){parent{number repository{nameWithOwner}}}}}' -f o=<owner> -f r=<repo> -F n=<number>
```

## Issues from a board

Take `owner/repo` and number from the board items (see the `github-projects` skill) and read each issue with `gh issue view`. Items without readable content are draft issues or issues the credentials cannot see; report them instead of guessing a match by title.

## Limits

Read-only: this skill never creates, edits, comments on or closes issues, and never runs workflows. Treat private issue contents as private local data and do not write them into the repository.

## Changelog

- 2026-11-08 v2.0.0: Replace the bundled Python reader and its cache with direct `gh` commands.
