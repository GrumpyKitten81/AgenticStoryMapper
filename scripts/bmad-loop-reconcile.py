import argparse
import hashlib
import json
import re
import stat
import subprocess
import sys
import tempfile
import time
import tomllib
from pathlib import Path

import yaml
from bmad_loop.journal import Journal, state_lock
from bmad_loop.platform_util import LockUnavailableError, atomic_write_text
from bmad_loop.runs import engine_liveness
from bmad_loop.sprintstatus import load, parse_selector

SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"[0-9a-f]{64}")
RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args, check=True):
    return subprocess.run(["git", "-C", str(root), *args], check=check,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def confined_file(root, name):
    require(isinstance(name, str) and name, "Artifact path must be nonempty")
    relative = Path(name)
    require(not relative.is_absolute() and ".." not in relative.parts,
            "Artifact path must stay inside the project")
    path = root / relative
    require(path.resolve().is_relative_to(root), "Artifact escapes the project")
    require(path.is_file() and not path.is_symlink(), f"Missing regular file: {name}")
    return path


def ancestor(root, revision, head):
    require(isinstance(revision, str) and SHA.fullmatch(revision), "Full commit SHA required")
    require(git(root, "cat-file", "-t", revision).stdout.strip() == b"commit", "Commit required")
    require(git(root, "merge-base", "--is-ancestor", revision, head,
                check=False).returncode == 0, "Commit is not an ancestor of verification revision")


def artifact(root, item, commit, head):
    require(isinstance(item, dict) and set(item) <= {"path", "sha256", "commit"},
            "Artifact requires path, sha256 and optional exact commit")
    require(DIGEST.fullmatch(str(item.get("sha256", ""))), "Artifact SHA-256 required")
    path = confined_file(root, item.get("path"))
    revision = item.get("commit", commit)
    ancestor(root, revision, head)
    current = path.read_bytes()
    recorded = git(root, "show", f"{revision}:{path.relative_to(root).as_posix()}").stdout
    require(digest(current) == item["sha256"] == digest(recorded),
            f"Artifact hash or committed evidence mismatch: {item['path']}")
    return current


def manifest_evidence(root, manifest, run_id):
    require(set(manifest) == {"version", "run_id", "verification_revision", "stories"},
            "Manifest requires version, run_id, verification_revision and stories")
    require(manifest["version"] == 1 and manifest["run_id"] == run_id, "Manifest run/version mismatch")
    head = git(root, "rev-parse", "HEAD").stdout.decode().strip()
    require(manifest["verification_revision"] == head, "Verification revision must equal current HEAD")
    ancestor(root, head, head)
    entries = manifest["stories"]
    require(isinstance(entries, list) and entries, "Story evidence required")
    stories = {}
    for entry in entries:
        validate_story(root, entry, head)
        key = entry["story_key"]
        require(key not in stories, "Duplicate story evidence")
        stories[key] = entry
    return stories


def validate_story(root, entry, head):
    require(isinstance(entry, dict) and set(entry) == {
        "story_key", "delivery_commit", "spec", "acceptance"}, "Invalid story evidence fields")
    key = entry["story_key"]
    require(isinstance(key, str) and re.fullmatch(r"\d+-\d+[a-z]?-.+", key), "Full story key required")
    ancestor(root, entry["delivery_commit"], head)
    require(isinstance(entry["spec"], dict) and "commit" not in entry["spec"],
            "Spec must be recorded in the exact delivery commit")
    content = artifact(root, entry["spec"], entry["delivery_commit"], head).decode()
    require(content.startswith("---\n"), "Spec frontmatter required")
    front = content.split("---", 2)
    require(len(front) == 3, "Unterminated spec frontmatter")
    metadata = yaml.safe_load(front[1])
    require(isinstance(metadata, dict) and metadata.get("status") == "done", "Spec must be done")
    identity = metadata.get("story_key") or Path(entry["spec"]["path"]).stem.removeprefix("spec-")
    require(identity == key, "Spec does not identify the selected story")
    require(isinstance(entry["acceptance"], list) and entry["acceptance"], "Acceptance evidence required")
    for proof in entry["acceptance"]:
        artifact(root, proof, entry["delivery_commit"], head)


def read_run(root, run_id):
    run_dir = root / ".bmad-loop" / "runs" / run_id
    require(run_dir.is_dir() and run_dir.resolve() == run_dir, "Run directory missing or linked")
    state_path = confined_file(root, f".bmad-loop/runs/{run_id}/state.json")
    state = json.loads(state_path.read_bytes())
    require(state.get("run_id") == run_id and state.get("run_type", "story") == "story",
            "Run identity/type mismatch")
    require(state.get("source", "sprint-status") == "sprint-status", "Only sprint-status runs supported")
    for field in ("project", "repo_root"):
        project = state.get(field)
        require(isinstance(project, str) and Path(project).is_absolute()
                and Path(project).resolve() == root, "Run project mismatch")
    require(isinstance(state.get("tasks"), dict) and state["tasks"], "Run tasks required")
    for name in ("journal.jsonl", "ATTENTION"):
        path = run_dir / name
        require(not path.is_symlink(), f"Linked run artifact refused: {name}")
    journal = (run_dir / "journal.jsonl").read_bytes()
    require(not journal or journal.endswith(b"\n"), "Torn journal tail; repair separately")
    for line in journal.splitlines():
        require(isinstance(json.loads(line), dict), "Invalid journal record")
    return run_dir, state


def selected_scope(root, state, stories):
    board = root / "_bmad-output/implementation-artifacts/sprint-status.yaml"
    selector = parse_selector(state.get("epic_filter"), state.get("story_filter"))
    matches = [story for story in load(board).stories if selector.matches(story)]
    require(matches, "Run selector has no current stories")
    require(not selector.slug or len(matches) == 1, "Ambiguous story selector")
    keys = {story.key for story in matches}
    tasks = state["tasks"]
    require(set(tasks) <= keys, "Run contains tasks outside selected scope")
    cap = state.get("max_stories")
    require(cap is None or type(cap) is int and cap > 0, "Invalid run story cap")
    # DESIGN: Engine._dispatched_count counts every recorded task, including wedges.
    required = set(tasks) if cap is not None and len(tasks) >= cap else keys
    require(set(stories) == required, "Manifest must cover the complete selected run scope")
    require(all(story.status == "done" for story in matches
                if story.key in required and story.key not in tasks),
            "Undispatched selected stories must already be done; board repair is separate")
    for key, task in tasks.items():
        require(isinstance(task, dict) and task.get("story_key") == key, "Task identity mismatch")
        require(task.get("phase") in {"done", "escalated", "deferred", "awaiting-operator", "pending"},
                "Interrupted active task requires explicit recovery first")
        if task["phase"] == "done":
            require(task.get("commit_sha") == stories[key]["delivery_commit"], "Existing done commit mismatch")
    return board


def verification_commands(root, state):
    path = root / ".bmad-loop/policy.toml"
    current = tomllib.loads(path.read_text())["verify"]["commands"]
    pinned = state.get("policy_snapshot", {}).get("verify", {}).get("commands")
    require(isinstance(current, list) and current and all(isinstance(c, str) and c.strip() for c in current),
            "Nonempty configured verification commands required")
    require(current == pinned, "Current and pinned verification commands differ")
    return current


def fingerprint(root, run_dir, manifest_path):
    names = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").stdout.split(b"\0")
    paths = {root / name.decode() for name in names if name}
    paths.update({manifest_path, root / ".bmad-loop/policy.toml",
                  root / "_bmad-output/implementation-artifacts/sprint-status.yaml",
                  run_dir / "state.json", run_dir / "journal.jsonl", run_dir / "ATTENTION",
                  run_dir / "engine.pid"})
    hashes = {}
    for path in sorted(paths):
        require(not path.is_symlink(), f"Linked source refused: {path.name}")
        hashes[str(path)] = {"sha256": digest(path.read_bytes()),
                             "mode": stat.S_IMODE(path.stat().st_mode)} if path.exists() else None
    hashes["HEAD"] = git(root, "rev-parse", "HEAD").stdout.decode().strip()
    hashes["refs"] = digest(git(root, "for-each-ref", "--format=%(refname) %(objectname)").stdout)
    hashes["index"] = digest(git(root, "ls-files", "--stage", "-z").stdout)
    return hashes


def verify(root, commands):
    results = []
    for index, command in enumerate(commands):
        started = time.monotonic()
        with tempfile.TemporaryFile() as output:
            result = subprocess.run(command, shell=True, cwd=root, stdout=output, stderr=subprocess.STDOUT)
            output.seek(0)
            output_hash = hashlib.file_digest(output, "sha256").hexdigest()
        require(result.returncode == 0, f"Verification command {index + 1} failed: exit {result.returncode}")
        results.append({"command_sha256": digest(command.encode()), "exit_code": result.returncode,
                        "duration_seconds": time.monotonic() - started, "output_sha256": output_hash})
    return results


def completed_before(run_dir, state, manifest_hash):
    events = Journal(run_dir).entries()
    matching = [entry for entry in events if entry.get("kind") == "external-completion-adopted"
                and entry.get("manifest_sha256") == manifest_hash]
    if matching:
        require(state.get("finished") and all(t["phase"] == "done" for t in state["tasks"].values()),
                "Incomplete prior adoption; inspect its backup before retrying")
        receipt_path = run_dir / "external-completions" / manifest_hash / "receipt.json"
        require(receipt_path.is_file() and not receipt_path.is_symlink(),
                "Incomplete prior adoption receipt; inspect its backup before retrying")
        receipt = json.loads(receipt_path.read_bytes())
        require(receipt.get("manifest_sha256") == manifest_hash and receipt.get("state_sha256")
                == digest((run_dir / "state.json").read_bytes()), "Adopted state differs from its receipt")
    require(not state.get("finished") or matching, "Finished run has no matching adoption provenance")
    return bool(matching)


def backup_run(run_dir, manifest_hash, manifest_bytes):
    backup = run_dir / "external-completions" / manifest_hash
    require(not backup.parent.is_symlink() and backup.resolve().is_relative_to(run_dir),
            "Linked adoption backup directory refused")
    require(not backup.exists(), "Adoption backup already exists; inspect interrupted adoption")
    backup.mkdir(mode=0o700, parents=True)
    for name in ("state.json", "journal.jsonl", "ATTENTION"):
        path = run_dir / name
        if path.exists():
            (backup / name).write_bytes(path.read_bytes())
    (backup / "manifest.json").write_bytes(manifest_bytes)
    return backup


def apply_adoption(run_dir, state, stories, manifest, raw_manifest, checks, source_hash):
    manifest_hash = digest(raw_manifest)
    backup = backup_run(run_dir, manifest_hash, raw_manifest)
    previous_state_hash = digest((run_dir / "state.json").read_bytes())
    for key, task in state["tasks"].items():
        task.update(phase="done", commit_sha=stories[key]["delivery_commit"],
                    board_advance_intended="done", spec_file=stories[key]["spec"]["path"])
    state.update(finished=True, stopped=False, crashed=False,
                 paused_reason=None, paused_stage=None, paused_story_key=None)
    journal = Journal(run_dir)
    journal.append("external-completion-adopted", manifest_sha256=manifest_hash,
                   verification_revision=manifest["verification_revision"], stories=stories,
                   previous_state_sha256=previous_state_hash, verification=checks,
                   verified_source_sha256=source_hash,
                   backup=backup.relative_to(run_dir).as_posix())
    atomic_write_text(run_dir / "state.json", json.dumps(state, indent=2) + "\n",
                      follow_symlinks=False, require_writable_target=True)
    attention = run_dir / "ATTENTION"
    if attention.exists():
        attention.unlink()
    atomic_write_text(backup / "receipt.json", json.dumps({"manifest_sha256": manifest_hash,
                      "state_sha256": digest((run_dir / "state.json").read_bytes())}) + "\n")


def reconcile(root, run_id, manifest_path, apply):
    require(RUN_ID.fullmatch(run_id), "Invalid run ID")
    require(git(root, "rev-parse", "--show-toplevel").stdout.decode().strip() == str(root), "Project root required")
    run_dir, _ = read_run(root, run_id)
    with state_lock(run_dir, blocking=False):
        require(engine_liveness(run_dir) == "dead", "Run engine is live or unverifiable")
        run_dir, state = read_run(root, run_id)
        before = fingerprint(root, run_dir, manifest_path)
        raw_manifest = manifest_path.read_bytes()
        manifest = json.loads(raw_manifest)
        stories = manifest_evidence(root, manifest, run_id)
        selected_scope(root, state, stories)
        commands = verification_commands(root, state)
        previous = completed_before(run_dir, state, digest(raw_manifest))
        checks = verify(root, commands)
        require(before == fingerprint(root, run_dir, manifest_path), "Source or run fingerprint changed during verification")
        require(engine_liveness(run_dir) == "dead", "Run engine changed during verification")
        source_hash = digest(json.dumps(before, sort_keys=True).encode())
        if apply and not previous:
            apply_adoption(run_dir, state, stories, manifest, raw_manifest, checks, source_hash)
        return {"run_id": run_id, "result": "already-adopted" if previous else "adopted" if apply else "verified-dry-run",
                "verification_revision": manifest["verification_revision"], "verified_source_sha256": source_hash,
                "stories": sorted(stories), "verification": checks}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    result = reconcile(args.project_root.resolve(), args.run_id, args.manifest.resolve(), args.apply)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, subprocess.CalledProcessError,
            LockUnavailableError, yaml.YAMLError) as error:
        print(f"External completion refused: {error}", file=sys.stderr)
        sys.exit(1)
