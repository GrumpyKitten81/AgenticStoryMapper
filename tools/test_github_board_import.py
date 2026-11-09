import contextlib
import io
import json
import subprocess
import unittest
from unittest.mock import patch

import github_board_import as tool


def board_page(nodes, has_next=False, cursor=None):
    return {"data": {"repositoryOwner": {"projectV2": {
        "title": "Fixture board", "url": "https://github.com/orgs/fixture/projects/1",
        "items": {"nodes": nodes, "pageInfo": {"hasNextPage": has_next, "endCursor": cursor}},
    }}}}


def issue_node(number, state="OPEN", status="Ready"):
    return {"id": f"item-{number}", "status": {"name": status}, "content": {
        "__typename": "Issue", "repository": {"nameWithOwner": "Fixture/Repository"},
        "number": number, "title": "Überprüfung", "body": "Descripción", "state": state,
        "url": f"https://github.com/Fixture/Repository/issues/{number}",
        "labels": {"nodes": [{"name": "Risk"}]}, "assignees": {"nodes": [{"login": "fixture"}]},
        "milestone": {"title": "Release"}, "issueType": {"name": "Feature"},
        "parent": {"number": 10, "repository": {"nameWithOwner": "Fixture/Repository"}},
    }}


class BoardSourceTests(unittest.TestCase):
    def setUp(self):
        self.source = tool.GhBoardSource("fixture", 1, None)

    def test_empty_accessible_board_retains_metadata_and_can_plan_closed_removal(self):
        with patch.object(self.source, "_gh", return_value=board_page([])):
            board = self.source.read(None, 0)
        self.assertEqual((board.title, board.url), ("Fixture board", "https://github.com/orgs/fixture/projects/1"))
        self.assertEqual(board.open_issues, [])
        snapshot = {"storyMap": {"id": "map"}, "githubLinks": [
            {"cardId": "card", "repo": "fixture/repository", "issueNumber": 1},
        ]}
        plan = tool.plan_sync(snapshot, board, lambda repository, number: "CLOSED")
        self.assertEqual(plan.remove, {"card": "fixture/repository#1"})

    def test_pagination_status_filter_and_issue_normalization(self):
        pages = [board_page([issue_node(1, status="Other"), {"id": "draft", "content": {"__typename": "DraftIssue"}}], True, "next"),
                 board_page([issue_node(2, state="CLOSED"), issue_node(3, state="open", status="READY")])]
        with patch.object(self.source, "_gh", side_effect=pages) as gh:
            board = self.source.read("ready", 0)
        self.assertEqual(gh.call_count, 2)
        self.assertIsNone(gh.call_args_list[0].args[1]["variables"]["cursor"])
        self.assertEqual(gh.call_args_list[1].args[1]["variables"]["cursor"], "next")
        self.assertEqual(board.closed_keys, {"fixture/repository#2"})
        self.assertEqual(board.skipped[0]["itemId"], "draft")
        self.assertEqual(len(board.open_issues), 1)
        issue = board.open_issues[0]
        self.assertEqual(issue.key, "fixture/repository#3")
        self.assertEqual(issue.to_payload(), {
            "repository": "Fixture/Repository", "number": 3, "title": "Überprüfung", "body": "Descripción",
            "state": "open", "url": "https://github.com/Fixture/Repository/issues/3", "labels": ["Risk"],
            "assignee": "fixture", "milestone": "Release", "issueType": "Feature",
            "parentRepository": "Fixture/Repository", "parentNumber": 10,
        })

    def test_limit_counts_matching_open_issues_and_stops_before_next_page(self):
        first_page = board_page([issue_node(1, status="Other"), issue_node(2, state="CLOSED"), issue_node(3), issue_node(4)], True, "next")
        with patch.object(self.source, "_gh", return_value=first_page) as gh:
            board = self.source.read("Ready", 1)
        gh.assert_called_once()
        self.assertEqual([issue.number for issue in board.open_issues], [3])

    def test_missing_board_remains_an_error(self):
        with patch.object(self.source, "_gh", return_value={"data": {"repositoryOwner": None}}):
            with self.assertRaisesRegex(RuntimeError, "not found or is not accessible"):
                self.source.read(None, 0)

    def test_invalid_limits_and_board_numbers_fail_before_source_creation(self):
        for option in [("--limit", "-1"), ("--board-number", "0"), ("--board-number", "-1")]:
            with self.subTest(option=option), patch.object(tool, "GhBoardSource") as factory:
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                    tool.main(["--board-owner", "fixture", "--board-number", "1", *option])
                self.assertEqual(error.exception.code, 2)
                factory.assert_not_called()
        self.assertEqual(tool.parse_args(["--board-owner", "fixture", "--board-number", "1", "--limit", "0"]).limit, 0)

    def test_subprocess_errors_become_controlled_runtime_errors(self):
        errors = [(FileNotFoundError("missing"), "GitHub CLI was not found"),
                  (subprocess.TimeoutExpired(["gh"], 60), "timed out after 60 seconds")]
        for error, message in errors:
            with self.subTest(error=type(error).__name__), patch.object(tool.subprocess, "run", side_effect=error):
                with self.assertRaisesRegex(RuntimeError, message):
                    self.source._gh(["api", "graphql"])

    def test_invalid_json_is_controlled_and_utf8_is_explicit(self):
        result = subprocess.CompletedProcess(["gh"], 0, stdout="not JSON", stderr="")
        with patch.object(tool.subprocess, "run", return_value=result) as run:
            with self.assertRaisesRegex(RuntimeError, "returned invalid JSON"):
                self.source._gh(["api", "graphql"])
        self.assertEqual(run.call_args.kwargs["encoding"], "utf-8")
        result.stdout = json.dumps({"title": "Überprüfung"}, ensure_ascii=False)
        with patch.object(tool.subprocess, "run", return_value=result):
            self.assertEqual(self.source._gh(["api", "graphql"]), {"title": "Überprüfung"})

    def test_cli_and_graphql_failures_remain_errors(self):
        for result, message in [
            (subprocess.CompletedProcess(["gh"], 1, stdout="", stderr="authentication required"), "authentication required"),
            (subprocess.CompletedProcess(["gh"], 0, stdout='{"errors":[{"message":"rate limited"}]}', stderr=""), "rate limited"),
        ]:
            with self.subTest(message=message), patch.object(tool.subprocess, "run", return_value=result):
                with self.assertRaisesRegex(RuntimeError, message):
                    self.source._gh(["api", "graphql"])


if __name__ == "__main__":
    unittest.main()
