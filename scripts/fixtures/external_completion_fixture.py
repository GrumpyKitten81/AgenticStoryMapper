import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
STORY = "4-13-validation-gate"
OTHER_STORY = "4-12-import-sources"


class CompletionFixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix="storymapper-p1-")
        self.root = Path(self.temp.name).resolve()
        self.env = {**os.environ, "BMAD_LOOP_STATE_DIR": str(self.root / ".test-loop-state")}
        self.run_dir = self.root / ".bmad-loop/runs/fixture-run"
        self.run_dir.mkdir(parents=True)
        self.artifacts = self.root / "_bmad-output/implementation-artifacts"
        self.artifacts.mkdir(parents=True)
        self.git("init", "-b", "main")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "P1 fixture")
        (self.root / ".gitignore").write_text(".bmad-loop/\n.test-loop-state/\nmanifest.json\n")
        (self.root / "source.txt").write_text("verified source\n")
        shutil.copyfile(SCRIPTS / "fixtures/external-completion-verify.py", self.root / "verify.py")
        self.git("add", ".")
        self.git("commit", "-qm", "test: establish initial source")
        self.initial_commit = self.git("rev-parse", "HEAD").strip()
        self.write_artifacts()
        self.git("add", ".")
        self.git("commit", "-qm", "test: record delivered story evidence")
        self.head = self.git("rev-parse", "HEAD").strip()
        self.command = f'"{sys.executable}" verify.py'
        self.write_state()
        self.write_manifest()

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout

    def write_artifacts(self):
        for key in (STORY, OTHER_STORY):
            (self.artifacts / f"spec-{key}.md").write_text(f"---\nstatus: done\nstory_key: {key}\n---\n")
            (self.artifacts / f"{key}-acceptance.json").write_text(json.dumps({"story_key": key, "verified": True}))
        (self.artifacts / "sprint-status.yaml").write_text(
            f"development_status:\n  epic-4: done\n  {OTHER_STORY}: done\n  {STORY}: backlog\n")

    def write_state(self):
        self.state = {"run_id": "fixture-run", "run_type": "story", "source": "sprint-status",
                      "project": str(self.root), "repo_root": str(self.root), "epic_filter": 4,
                      "story_filter": STORY, "max_stories": None, "finished": False,
                      "paused_reason": "historical escalation", "paused_stage": "escalation",
                      "paused_story_key": STORY, "unknown_future_field": {"retain": [1, 2]},
                      "crashed": True, "crash_error": "historical verification failure",
                      "sessions": [{"failed": True, "attempt": 2}],
                      "policy_snapshot": {"verify": {"commands": [self.command]}},
                      "tasks": {STORY: {"story_key": STORY, "phase": "escalated", "epic": 4,
                                         "preserve_ref": "refs/attempt-preserve-dirty/old",
                                         "preserve_from_attempt": True, "defer_reason": "historical",
                                         "future_task_field": {"keep": True}, "sessions": ["old-session"]}}}
        self.save_state()
        (self.root / ".bmad-loop/policy.toml").write_text("[verify]\ncommands = " + json.dumps([self.command]) + "\n")
        (self.run_dir / "journal.jsonl").write_text('{"kind":"historical-failure","payload":"retain"}\n')
        (self.run_dir / "ATTENTION").write_text("Historical blocked attempt\n")
        self.git("update-ref", "refs/attempt-preserve-dirty/old", self.initial_commit)

    def save_state(self):
        (self.run_dir / "state.json").write_text(json.dumps(self.state, indent=2) + "\n")

    def proof(self, path):
        relative = path.relative_to(self.root).as_posix()
        return {"path": relative, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

    def story_entry(self, key):
        return {"story_key": key, "delivery_commit": self.head,
                "spec": self.proof(self.artifacts / f"spec-{key}.md"),
                "acceptance": [self.proof(self.artifacts / f"{key}-acceptance.json")]}

    def write_manifest(self):
        self.manifest = {"version": 1, "run_id": "fixture-run", "verification_revision": self.head,
                         "stories": [self.story_entry(STORY)]}
        self.save_manifest()

    def save_manifest(self):
        (self.root / "manifest.json").write_text(json.dumps(self.manifest, indent=2) + "\n")

    def run(self, apply=True, **env):
        args = [sys.executable, str(SCRIPTS / "bmad-loop-reconcile.py"), "--project-root", str(self.root),
                "--run-id", "fixture-run", "--manifest", str(self.root / "manifest.json")]
        if apply:
            args.append("--apply")
        return subprocess.run(args, env={**self.env, **env}, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True)

    def run_files(self):
        return {p.relative_to(self.run_dir).as_posix(): p.read_bytes()
                for p in self.run_dir.rglob("*") if p.is_file()}

    def close(self):
        self.temp.cleanup()
