"""Propose an Agentic Story Mapper Story Map from the open issues of a GitHub ProjectV2 board.

GitHub is only read, through the authenticated GitHub CLI (`gh api`). Agentic Story Mapper is
only reached over its loopback HTTP API: the script proposes a ChangeSet, and applying
it is a separate, explicit call (`--apply-change-set`).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Protocol

from storymapper_http import DEFAULT_URL, StoryMapperClient

PAGE_SIZE = 50
GH_TIMEOUT_SECONDS = 60

BOARD_QUERY = """
query($login: String!, $number: Int!, $cursor: String) {
  repositoryOwner(login: $login) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        title
        url
        items(first: %d, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            status: fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
            content {
              __typename
              ... on Issue {
                number
                title
                body
                state
                url
                repository { nameWithOwner }
                labels(first: 50) { nodes { name } }
                assignees(first: 1) { nodes { login } }
                milestone { title }
                issueType { name }
                parent { number repository { nameWithOwner } }
              }
            }
          }
        }
      }
    }
  }
}
""" % PAGE_SIZE


def issue_key(repository: str, number: int) -> str:
    """Case-insensitive identity of an issue, matching the server's duplicate check."""
    return f"{repository.lower()}#{number}"


@dataclass(frozen=True)
class BoardIssue:
    repository: str
    number: int
    title: str
    body: str
    state: str
    url: str
    labels: tuple[str, ...] = ()
    assignee: str | None = None
    milestone: str | None = None
    issue_type: str | None = None
    parent_repository: str | None = None
    parent_number: int | None = None

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "BoardIssue":
        return cls(
            repository=str(data["repository"]),
            number=int(data["number"]),
            title=str(data["title"]),
            body=str(data.get("body") or ""),
            state=str(data.get("state") or "OPEN").upper(),
            url=str(data["url"]),
            labels=tuple(str(label) for label in data.get("labels") or ()),
            assignee=data.get("assignee"),
            milestone=data.get("milestone"),
            issue_type=data.get("issue_type"),
            parent_repository=data.get("parent_repository"),
            parent_number=data.get("parent_number"),
        )

    @property
    def key(self) -> str:
        return issue_key(self.repository, self.number)

    def to_payload(self) -> dict[str, Any]:
        has_parent = bool(self.parent_repository and self.parent_number)
        return {
            "repository": self.repository,
            "number": self.number,
            "title": self.title,
            "body": self.body,
            "state": self.state.lower(),
            "url": self.url,
            "labels": list(self.labels),
            "assignee": self.assignee,
            "milestone": self.milestone,
            "issueType": self.issue_type,
            "parentRepository": self.parent_repository if has_parent else None,
            "parentNumber": self.parent_number if has_parent else None,
        }


@dataclass
class BoardRead:
    title: str
    url: str
    open_issues: list[BoardIssue] = field(default_factory=list)
    closed_keys: set[str] = field(default_factory=set)
    skipped: list[dict[str, Any]] = field(default_factory=list)


class BoardSource(Protocol):
    def read(self, status: str | None, limit: int) -> BoardRead: ...

    def issue_state(self, repository: str, number: int) -> str | None: ...


class GhBoardSource:
    """Reads one ProjectV2 board of a user or organization with `gh api`."""

    def __init__(self, owner: str, number: int, token_env: str | None) -> None:
        self.owner = owner
        self.number = number
        self.env = dict(os.environ)
        if token_env:
            token = os.environ.get(token_env)
            if not token:
                raise RuntimeError(f"{token_env} is not set")
            self.env["GH_TOKEN"] = token

    def read(self, status: str | None, limit: int) -> BoardRead:
        board: BoardRead | None = None
        for project in self._pages():
            board = board or BoardRead(title=project["title"], url=project["url"])
            for node in project["items"]["nodes"]:
                self._collect(board, node, status)
                if limit and len(board.open_issues) >= limit:
                    return board
        if board is None:
            raise RuntimeError(f"Board {self.owner}/{self.number} is not accessible")
        return board

    def issue_state(self, repository: str, number: int) -> str | None:
        try:
            payload = self._gh(["api", f"repos/{repository}/issues/{number}"])
        except RuntimeError:
            return None
        state = payload.get("state") if isinstance(payload, dict) else None
        return str(state).upper() if state else None

    def _pages(self) -> Iterator[dict[str, Any]]:
        cursor: str | None = None
        while True:
            variables = {"login": self.owner, "number": self.number, "cursor": cursor}
            response = self._gh(["api", "graphql", "--input", "-"], {"query": BOARD_QUERY, "variables": variables})
            owner = (response.get("data") or {}).get("repositoryOwner") or {}
            project = owner.get("projectV2")
            if not project:
                raise RuntimeError(f"Board {self.owner}/{self.number} was not found or is not accessible")
            page = project["items"]
            yield project
            if not page["pageInfo"]["hasNextPage"]:
                return
            cursor = page["pageInfo"]["endCursor"]

    @staticmethod
    def _collect(board: BoardRead, node: dict[str, Any], status: str | None) -> None:
        content = node.get("content") or {}
        if content.get("__typename") != "Issue":
            board.skipped.append({"itemId": node.get("id"), "reason": f"not an accessible issue ({content.get('__typename') or 'no content'})"})
            return
        issue = issue_from_graphql(content)
        if issue.state != "OPEN":
            board.closed_keys.add(issue.key)
            return
        item_status = (node.get("status") or {}).get("name")
        if status and (item_status or "").casefold() != status.casefold():
            return
        board.open_issues.append(issue)

    def _gh(self, args: list[str], body: dict[str, Any] | None = None) -> Any:
        try:
            result = subprocess.run(
                ["gh", *args],
                input=json.dumps(body) if body is not None else None,
                capture_output=True, encoding="utf-8", env=self.env, timeout=GH_TIMEOUT_SECONDS, check=False,
            )
        except FileNotFoundError as error:
            raise RuntimeError("GitHub CLI was not found; install gh before reading GitHub") from error
        except subprocess.TimeoutExpired as error:
            raise RuntimeError(f"GitHub CLI request timed out after {GH_TIMEOUT_SECONDS} seconds") from error
        if result.returncode != 0:
            raise RuntimeError(f"gh {args[0]} {args[1]} failed: {result.stderr.strip() or result.returncode}")
        try:
            payload = json.loads(result.stdout or "{}")
        except json.JSONDecodeError as error:
            raise RuntimeError("GitHub CLI returned invalid JSON") from error
        if isinstance(payload, dict) and payload.get("errors"):
            raise RuntimeError("; ".join(str(error.get("message")) for error in payload["errors"]))
        return payload


def issue_from_graphql(content: dict[str, Any]) -> BoardIssue:
    parent = content.get("parent") or {}
    assignees = [node["login"] for node in (content.get("assignees") or {}).get("nodes", [])]
    return BoardIssue(
        repository=content["repository"]["nameWithOwner"],
        number=int(content["number"]),
        title=content["title"],
        body=content.get("body") or "",
        state=str(content["state"]).upper(),
        url=content["url"],
        labels=tuple(node["name"] for node in (content.get("labels") or {}).get("nodes", [])),
        assignee=assignees[0] if assignees else None,
        milestone=(content.get("milestone") or {}).get("title"),
        issue_type=(content.get("issueType") or {}).get("name"),
        parent_repository=(parent.get("repository") or {}).get("nameWithOwner"),
        parent_number=parent.get("number"),
    )


@dataclass
class SyncPlan:
    story_map_id: str
    update: list[str] = field(default_factory=list)
    add: list[str] = field(default_factory=list)
    remove: dict[str, str] = field(default_factory=dict)
    kept_open: list[str] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "storyMapId": self.story_map_id,
            "toUpdate": len(self.update),
            "toAdd": len(self.add),
            "toRemoveClosed": len(self.remove),
            "keptOpenOutOfBoard": len(self.kept_open),
            "removalUnresolved": len(self.unresolved),
            "toAddSample": self.add[:20],
            "toRemoveSample": list(self.remove.values())[:20],
            "keptOpenSample": self.kept_open[:20],
            "removalUnresolvedSample": self.unresolved[:20],
        }


def linked_cards(snapshot: dict[str, Any]) -> dict[str, str]:
    """Map each linked issue key to its Card; one issue must not back two Cards."""
    cards: dict[str, str] = {}
    for link in snapshot.get("githubLinks", []):
        card_id, repository, number = link.get("cardId"), link.get("repo"), link.get("issueNumber")
        if not (card_id and repository and number):
            continue
        key = issue_key(repository, number)
        if cards.get(key, card_id) != card_id:
            raise RuntimeError(f"{key} is linked to more than one Card")
        cards[key] = card_id
    return cards


def plan_sync(snapshot: dict[str, Any], board: BoardRead, state_of: Callable[[str, int], str | None]) -> SyncPlan:
    plan = SyncPlan(story_map_id=snapshot["storyMap"]["id"])
    linked = linked_cards(snapshot)
    wanted = {issue.key for issue in board.open_issues}
    for issue in board.open_issues:
        (plan.update if issue.key in linked else plan.add).append(issue.key)
    for key, card_id in linked.items():
        if key in wanted:
            continue
        state = "CLOSED" if key in board.closed_keys else state_of(*split_key(key))
        if state == "CLOSED":
            plan.remove.setdefault(card_id, key)
        elif state == "OPEN":
            plan.kept_open.append(key)
        else:
            plan.unresolved.append(key)
    return plan


def split_key(key: str) -> tuple[str, int]:
    repository, number = key.rsplit("#", 1)
    return repository, int(number)


def board_report(board: BoardRead) -> dict[str, Any]:
    return {
        "mode": "dry-run",
        "board": {"title": board.title, "url": board.url},
        "importableIssues": len(board.open_issues),
        "closedOnBoard": len(board.closed_keys),
        "repositories": sorted({issue.repository for issue in board.open_issues}),
        "skippedItems": len(board.skipped),
        "skippedSample": board.skipped[:20],
    }


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default=DEFAULT_URL, help="Agentic Story Mapper loopback origin")
    parser.add_argument("--apply-change-set", metavar="ID", help="Approve and apply a reviewed ChangeSet; nothing else is read")
    parser.add_argument("--board-owner", help="User or organization that owns the board")
    parser.add_argument("--board-number", type=int, help="ProjectV2 number")
    parser.add_argument("--status", help="Only import items whose Status field has this value")
    parser.add_argument("--limit", type=int, default=0, help="Stop after this many open issues (0 = all)")
    parser.add_argument("--token-env", help="Environment variable whose token gh should use instead of its own login")
    parser.add_argument("--project-id", help="Agentic Story Mapper Project; required when several exist")
    parser.add_argument("--story-map-name", default="GitHub board import")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--sync", action="store_true", help="Reconcile the existing Story Map of that name")
    mode.add_argument("--cleanup", action="store_true", help="Also propose deleting the Project's existing Story Maps")
    parser.add_argument("--execute", action="store_true", help="Submit the proposal as a ChangeSet (does not apply it)")
    args = parser.parse_args(argv)
    if args.limit < 0:
        parser.error("--limit must be nonnegative")
    if args.board_number is not None and args.board_number <= 0:
        parser.error("--board-number must be positive")
    if args.apply_change_set:
        if args.board_owner or args.board_number or args.execute or args.sync or args.cleanup:
            parser.error("--apply-change-set cannot be combined with reading or proposing")
    elif not (args.board_owner and args.board_number):
        parser.error("--board-owner and --board-number are required")
    return args


def run(args: argparse.Namespace, source: BoardSource) -> dict[str, Any]:
    board = source.read(args.status, args.limit)
    report = board_report(board)
    report["cleanupEnabled"] = args.cleanup
    if not (args.sync or args.execute):
        return report
    storymapper = StoryMapperClient(args.url)
    project_id = storymapper.project_id(args.project_id)
    plan = None
    if args.sync:
        plan = plan_sync(storymapper.story_map(args.story_map_name, project_id), board, source.issue_state)
        report["syncPlan"] = plan.summary()
    if args.execute:
        request: dict[str, Any] = {
            "projectId": project_id,
            "storyMapName": args.story_map_name,
            "boardUrl": board.url,
            "cleanup": args.cleanup,
            "issues": [issue.to_payload() for issue in board.open_issues],
            "removeCardIds": list(plan.remove) if plan else [],
        }
        if plan:
            request["storyMapId"] = plan.story_map_id
        report.update(storymapper.request("POST", "/api/tool-proposals/github-board", request))
        report["mode"] = "proposed"
    return report


def main(argv: list[str] | None = None, source_factory: Callable[[argparse.Namespace], BoardSource] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.apply_change_set:
            result = StoryMapperClient(args.url).apply(args.apply_change_set)
        else:
            factory = source_factory or (lambda parsed: GhBoardSource(parsed.board_owner, parsed.board_number, parsed.token_env))
            result = run(args, factory(args))
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
