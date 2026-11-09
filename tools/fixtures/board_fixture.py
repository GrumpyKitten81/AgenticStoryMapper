"""Run github_board_import.py against a JSON board file instead of GitHub (tests only).

Usage: board_fixture.py <board.json> [github_board_import arguments]

The file holds `issues` (BoardIssue fields) and optional `states`, a map from
`owner/repo#number` to the issue state reported for issues that left the board.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import github_board_import as tool  # noqa: E402


class FixtureSource:
    def __init__(self, path: Path) -> None:
        self.data = json.loads(path.read_text(encoding="utf-8"))

    def read(self, status, limit):
        issues = [tool.BoardIssue.from_mapping(entry) for entry in self.data["issues"]]
        return tool.BoardRead(title="Fixture board", url="https://github.com/orgs/fixture/projects/1", open_issues=issues)

    def issue_state(self, repository, number):
        return self.data.get("states", {}).get(tool.issue_key(repository, number), "OPEN")


if __name__ == "__main__":
    board_file = Path(sys.argv.pop(1))
    sys.exit(tool.main(source_factory=lambda args: FixtureSource(board_file)))
