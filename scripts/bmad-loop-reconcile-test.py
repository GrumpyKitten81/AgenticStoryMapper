import hashlib
import importlib.util
import json
import os
import stat
import subprocess
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from bmad_loop.journal import state_lock
from bmad_loop.runs import read_pid, write_pid
from fixtures.external_completion_fixture import CompletionFixture, OTHER_STORY, SCRIPTS, STORY

WORKER_SPEC = importlib.util.spec_from_file_location("completion_worker", SCRIPTS / "bmad-loop-reconcile.py")
WORKER = importlib.util.module_from_spec(WORKER_SPEC)
WORKER_SPEC.loader.exec_module(WORKER)


@contextmanager
def injected_write_failure(step, run_dir):
    original_write = WORKER.atomic_write_text
    original_unlink = Path.unlink

    def fail_journal(journal, kind, **fields):
        with journal.path.open("ab") as output:
            output.write(b'{"kind":')
        raise OSError("Injected journal write failure")

    def fail_atomic(path, text, **options):
        if (step == "state" and path == run_dir / "state.json"
                or step == "receipt" and path.name == "receipt.json"):
            raise OSError(f"Injected {step} write failure")
        return original_write(path, text, **options)

    def fail_unlink(path, *args, **options):
        if path == run_dir / "ATTENTION":
            raise OSError("Injected attention write failure")
        return original_unlink(path, *args, **options)

    if step == "journal":
        with patch.object(WORKER.Journal, "append", fail_journal):
            yield
    elif step == "attention":
        with patch.object(Path, "unlink", fail_unlink):
            yield
    else:
        with patch.object(WORKER, "atomic_write_text", fail_atomic):
            yield


class CompletionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = CompletionFixture()
        self.addCleanup(self.fixture.close)

    def refusal(self, text, **env):
        before = self.fixture.run_files()
        result = self.fixture.run(**env)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(text, result.stderr)
        self.assertEqual(self.fixture.run_files(), before)

    def test_dry_run_executes_gates_without_run_mutations(self):
        before = self.fixture.run_files()
        result = self.fixture.run(apply=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["result"], "verified-dry-run")
        self.assertEqual(output["verification"][0]["exit_code"], 0)
        self.assertEqual(self.fixture.run_files(), before)
        failed = self.fixture.run(apply=False, P1_FIXTURE_VERIFY_MODE="fail")
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn("failed: exit 17", failed.stderr)
        self.assertEqual(self.fixture.run_files(), before)

    def test_success_preserves_history_metadata_refs_and_board(self):
        before = self.fixture.run_files()
        refs = self.fixture.git("for-each-ref")
        board = (self.fixture.artifacts / "sprint-status.yaml").read_bytes()
        result = self.fixture.run()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["result"], "adopted")
        state = json.loads((self.fixture.run_dir / "state.json").read_bytes())
        for name in ("unknown_future_field", "sessions", "policy_snapshot", "crash_error"):
            self.assertEqual(state[name], self.fixture.state[name])
        original = self.fixture.state["tasks"][STORY]
        for name in ("preserve_ref", "preserve_from_attempt", "defer_reason", "future_task_field", "sessions"):
            self.assertEqual(state["tasks"][STORY][name], original[name])
        self.assertTrue(state["finished"])
        self.assertEqual(state["tasks"][STORY]["phase"], "done")
        self.assertEqual(state["tasks"][STORY]["commit_sha"], self.fixture.head)
        self.assertIsNone(state["paused_reason"])
        self.assertEqual(self.fixture.git("for-each-ref"), refs)
        self.assertEqual((self.fixture.artifacts / "sprint-status.yaml").read_bytes(), board)
        journal = (self.fixture.run_dir / "journal.jsonl").read_bytes()
        self.assertTrue(journal.startswith(before["journal.jsonl"]))
        self.assertIn(b'"external-completion-adopted"', journal)
        backups = list((self.fixture.run_dir / "external-completions").iterdir())
        self.assertEqual(len(backups), 1)
        for name in ("state.json", "journal.jsonl", "ATTENTION"):
            self.assertEqual((backups[0] / name).read_bytes(), before[name])
        after = self.fixture.run_files()
        repeated = self.fixture.run()
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assertEqual(json.loads(repeated.stdout)["result"], "already-adopted")
        self.assertEqual(self.fixture.run_files(), after)

    def test_artifact_tampering_and_missing_proof_refuse(self):
        self.fixture.manifest["stories"][0]["spec"]["sha256"] = "0" * 64
        self.fixture.save_manifest()
        self.refusal("Artifact hash")
        self.fixture.write_manifest()
        self.fixture.manifest["stories"][0]["acceptance"] = []
        self.fixture.save_manifest()
        self.refusal("Acceptance evidence required")
        self.fixture.write_manifest()
        self.fixture.manifest["stories"][0]["acceptance"][0]["path"] = "missing.json"
        self.fixture.save_manifest()
        self.refusal("Missing regular file")

    def test_exact_ancestry_and_verification_revision(self):
        self.fixture.manifest["stories"][0]["delivery_commit"] = self.fixture.head[:8]
        self.fixture.save_manifest()
        self.refusal("Full commit SHA required")
        self.fixture.write_manifest()
        self.fixture.manifest["verification_revision"] = self.fixture.initial_commit
        self.fixture.save_manifest()
        self.refusal("Verification revision must equal current HEAD")
        self.fixture.write_manifest()
        self.fixture.manifest["stories"][0]["delivery_commit"] = self.fixture.initial_commit
        self.fixture.save_manifest()
        self.refusal("returned non-zero exit status")

    def test_nonancestor_delivery_refused(self):
        tree = self.fixture.git("rev-parse", "HEAD^{tree}").strip()
        unrelated = self.fixture.git("commit-tree", tree, "-m", "unrelated evidence").strip()
        self.fixture.manifest["stories"][0]["delivery_commit"] = unrelated
        self.fixture.save_manifest()
        self.refusal("not an ancestor")

    def test_uncommitted_proof_is_not_accepted_with_its_new_hash(self):
        proof = self.fixture.artifacts / f"{STORY}-acceptance.json"
        proof.write_text('{"new":"uncommitted"}')
        self.fixture.manifest["stories"][0]["acceptance"][0] = self.fixture.proof(proof)
        self.fixture.save_manifest()
        self.refusal("committed evidence mismatch")

    def test_pinned_commands_and_failures_refused(self):
        self.fixture.state["policy_snapshot"]["verify"]["commands"] = ["different command"]
        self.fixture.save_state()
        self.refusal("Current and pinned verification commands differ")
        self.fixture.state["policy_snapshot"]["verify"]["commands"] = [self.fixture.command]
        self.fixture.save_state()
        self.refusal("Verification command 1 failed", P1_FIXTURE_VERIFY_MODE="fail")

    def test_source_manifest_policy_and_ref_changes_refused(self):
        for mode in ("source", "manifest", "policy", "ref", "engine", "chmod", "state", "journal", "attention"):
            with self.subTest(mode=mode):
                before = self.fixture.run_files()
                source_mode = stat.S_IMODE((self.fixture.root / "source.txt").stat().st_mode)
                result = self.fixture.run(P1_FIXTURE_VERIFY_MODE=mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("fingerprint changed", result.stderr)
                after = self.fixture.run_files()
                self.assert_verifier_mutation(mode, before, after, source_mode)
                self.fixture.close()
                self.fixture = CompletionFixture()
                self.addCleanup(self.fixture.close)

    def assert_verifier_mutation(self, mode, before, after, source_mode):
        if mode == "engine":
            self.assertGreater(read_pid(self.fixture.run_dir), 0)
            after.pop("engine.pid")
        if mode == "chmod":
            changed_permission = stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH if os.name == "nt" else stat.S_IXUSR
            self.assertEqual(stat.S_IMODE((self.fixture.root / "source.txt").stat().st_mode),
                             source_mode ^ changed_permission)
        if mode == "state":
            self.assertEqual(json.loads(after["state.json"]),
                             {**json.loads(before["state.json"]), "fixture_verifier_mutation": True})
            after["state.json"] = before["state.json"]
        if mode == "journal":
            self.assertEqual(after["journal.jsonl"], before["journal.jsonl"]
                             + b'{"kind":"fixture-verifier-mutation"}\n')
            after["journal.jsonl"] = before["journal.jsonl"]
        if mode == "attention":
            self.assertEqual(after["ATTENTION"], before["ATTENTION"] + b"Verifier changed attention\n")
            after["ATTENTION"] = before["ATTENTION"]
        self.assertEqual(after, before)

    def test_live_and_unverifiable_engines_refused(self):
        write_pid(self.fixture.run_dir)
        self.refusal("engine is live or unverifiable")
        (self.fixture.run_dir / "engine.pid").unlink()
        (self.fixture.run_dir / "engine.pid").mkdir()
        self.refusal("engine is live or unverifiable")

    def test_lock_contention_refused(self):
        with patch.dict(os.environ, self.fixture.env):
            with state_lock(self.fixture.run_dir, blocking=False):
                self.refusal("External completion refused")

    def test_incomplete_scope_and_cap_handling(self):
        self.fixture.state["story_filter"] = None
        self.fixture.save_state()
        self.refusal("complete selected run scope")
        self.fixture.state["max_stories"] = 2
        self.fixture.save_state()
        self.refusal("complete selected run scope")
        self.fixture.state["max_stories"] = 1
        self.fixture.save_state()
        result = self.fixture.run(apply=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_complete_uncapped_scope_requires_all_proofs(self):
        self.fixture.state["story_filter"] = None
        self.fixture.save_state()
        self.fixture.manifest["stories"].append(self.fixture.story_entry(OTHER_STORY))
        self.fixture.save_manifest()
        result = self.fixture.run()
        self.assertEqual(result.returncode, 0, result.stderr)
        state = json.loads((self.fixture.run_dir / "state.json").read_bytes())
        self.assertEqual(set(state["tasks"]), {STORY})

    def test_undispatched_backlog_is_not_silently_finished(self):
        self.fixture.state["story_filter"] = None
        self.fixture.save_state()
        self.fixture.manifest["stories"].append(self.fixture.story_entry(OTHER_STORY))
        self.fixture.save_manifest()
        board = self.fixture.artifacts / "sprint-status.yaml"
        board.write_text(board.read_text().replace(f"{OTHER_STORY}: done", f"{OTHER_STORY}: backlog"))
        self.refusal("Undispatched selected stories must already be done")

    def test_exceeded_cap_still_requires_every_recorded_task(self):
        self.fixture.state.update(story_filter=None, max_stories=1)
        self.fixture.state["tasks"][OTHER_STORY] = {"story_key": OTHER_STORY, "phase": "pending"}
        self.fixture.save_state()
        self.refusal("complete selected run scope")
        self.fixture.manifest["stories"].append(self.fixture.story_entry(OTHER_STORY))
        self.fixture.save_manifest()
        result = self.fixture.run(apply=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_torn_or_invalid_journal_refused(self):
        (self.fixture.run_dir / "journal.jsonl").write_text('{"partial":')
        self.refusal("Torn journal tail")
        (self.fixture.run_dir / "journal.jsonl").write_text("not json\n")
        self.refusal("External completion refused")

    def test_finished_label_does_not_prove_completion(self):
        self.fixture.state["finished"] = True
        self.fixture.save_state()
        self.refusal("no matching adoption provenance")

    def test_incomplete_receipt_and_changed_adopted_state_refuse(self):
        result = self.fixture.run()
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = next((self.fixture.run_dir / "external-completions").glob("*/receipt.json"))
        original = receipt.read_bytes()
        receipt.unlink()
        self.refusal("Incomplete prior adoption receipt")
        receipt.write_bytes(original)
        state_path = self.fixture.run_dir / "state.json"
        state = json.loads(state_path.read_bytes())
        state["unknown_future_field"] = "changed after adoption"
        state_path.write_text(json.dumps(state))
        self.refusal("Adopted state differs from its receipt")

    def test_done_commit_mismatch_does_not_get_overwritten(self):
        self.fixture.state["tasks"][STORY].update(phase="done", commit_sha=self.fixture.initial_commit)
        self.fixture.save_state()
        self.refusal("Existing done commit mismatch")

    def test_specs_require_done_identity_and_delivery_commit(self):
        entry = self.fixture.manifest["stories"][0]
        entry["spec"]["commit"] = self.fixture.head
        self.fixture.save_manifest()
        self.refusal("Spec must be recorded in the exact delivery commit")
        self.fixture.write_manifest()
        entry = self.fixture.manifest["stories"][0]
        entry["spec"] = self.fixture.proof(self.fixture.artifacts / f"spec-{OTHER_STORY}.md")
        self.fixture.save_manifest()
        self.refusal("Spec does not identify")

    def test_separate_exact_acceptance_commit_is_supported(self):
        proof = self.fixture.artifacts / f"{STORY}-acceptance.json"
        proof.write_text('{"verified":"later independent acceptance"}')
        self.fixture.git("add", ".")
        self.fixture.git("commit", "-qm", "test: record later acceptance")
        later = self.fixture.git("rev-parse", "HEAD").strip()
        self.fixture.manifest["verification_revision"] = later
        self.fixture.manifest["stories"][0]["acceptance"] = [{**self.fixture.proof(proof), "commit": later}]
        self.fixture.save_manifest()
        result = self.fixture.run(apply=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_interrupted_backup_and_task_fail_closed(self):
        manifest_hash = hashlib.sha256((self.fixture.root / "manifest.json").read_bytes()).hexdigest()
        (self.fixture.run_dir / "external-completions" / manifest_hash).mkdir(parents=True)
        self.refusal("backup already exists")
        (self.fixture.run_dir / "external-completions" / manifest_hash).rmdir()
        self.fixture.state["tasks"][STORY]["phase"] = "dev-running"
        self.fixture.save_state()
        self.refusal("Interrupted active task")

    def test_duplicate_evidence_and_invalid_manifest_refused(self):
        self.fixture.manifest["stories"].append(self.fixture.story_entry(STORY))
        self.fixture.save_manifest()
        self.refusal("Duplicate story evidence")
        self.fixture.write_manifest()
        self.fixture.manifest["run_id"] = "other-run"
        self.fixture.save_manifest()
        self.refusal("Manifest run/version mismatch")

    def test_empty_commands_and_outside_tasks_refused(self):
        (self.fixture.root / ".bmad-loop/policy.toml").write_text("[verify]\ncommands = []\n")
        self.refusal("Nonempty configured verification commands")
        self.fixture.write_state()
        self.fixture.state["tasks"][OTHER_STORY] = {"story_key": OTHER_STORY, "phase": "escalated"}
        self.fixture.save_state()
        self.refusal("outside selected scope")

    def test_unsafe_paths_and_ambiguous_selectors_refused(self):
        self.fixture.manifest["stories"][0]["spec"]["path"] = "../outside.md"
        self.fixture.save_manifest()
        self.refusal("Artifact path must stay inside")
        self.fixture.write_manifest()
        self.fixture.state["story_filter"] = "t"
        self.fixture.save_state()
        self.refusal("Ambiguous story selector")

    def test_node_cli_requires_explicit_run_and_manifest(self):
        result = subprocess.run(["node", str(SCRIPTS / "bmad-loop-reconcile-sprint.mjs")],
                                cwd=self.fixture.root, env=self.fixture.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--run-id and --manifest are required", result.stderr)
        result = subprocess.run(["node", str(SCRIPTS / "bmad-loop-reconcile-sprint.mjs"),
                                 "--run-id", "fixture-run", "--manifest", "manifest.json"],
                                cwd=self.fixture.root, env=self.fixture.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["result"], "verified-dry-run")


class PartialWriteTests(unittest.TestCase):
    def interrupted_adoption(self, step, retry_error):
        fixture = CompletionFixture()
        self.addCleanup(fixture.close)
        original = fixture.run_files()
        refs = fixture.git("for-each-ref")
        board = (fixture.artifacts / "sprint-status.yaml").read_bytes()
        with patch.dict(os.environ, fixture.env):
            with injected_write_failure(step, fixture.run_dir):
                with self.assertRaisesRegex(OSError, f"Injected {step} write failure"):
                    WORKER.reconcile(fixture.root, "fixture-run", fixture.root / "manifest.json", True)
        backup = next((fixture.run_dir / "external-completions").iterdir())
        for name in ("state.json", "journal.jsonl", "ATTENTION"):
            self.assertEqual((backup / name).read_bytes(), original[name])
        self.assertEqual((backup / "manifest.json").read_bytes(), (fixture.root / "manifest.json").read_bytes())
        self.assertFalse((backup / "receipt.json").exists())
        journal = (fixture.run_dir / "journal.jsonl").read_bytes()
        self.assertTrue(journal.startswith(original["journal.jsonl"]))
        if step == "journal":
            self.assertEqual(journal, original["journal.jsonl"] + b'{"kind":')
        else:
            records = [json.loads(line) for line in journal[len(original["journal.jsonl"]):].splitlines()]
            self.assertEqual([entry["kind"] for entry in records], ["external-completion-adopted"])
        state = (fixture.run_dir / "state.json").read_bytes()
        if step in {"journal", "state"}:
            self.assertEqual(state, original["state.json"])
        else:
            self.assertTrue(json.loads(state)["finished"])
        if step == "receipt":
            self.assertFalse((fixture.run_dir / "ATTENTION").exists())
        else:
            self.assertEqual((fixture.run_dir / "ATTENTION").read_bytes(), original["ATTENTION"])
        before_retry = fixture.run_files()
        result = fixture.run()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(retry_error, result.stderr)
        self.assertEqual(fixture.run_files(), before_retry)
        self.assertEqual(fixture.git("for-each-ref"), refs)
        self.assertEqual((fixture.artifacts / "sprint-status.yaml").read_bytes(), board)

    def test_actual_journal_write_failure_preserves_backup_and_refuses_retry(self):
        self.interrupted_adoption("journal", "Torn journal tail")

    def test_actual_state_write_failure_preserves_backup_and_refuses_retry(self):
        self.interrupted_adoption("state", "Incomplete prior adoption")

    def test_actual_attention_failure_preserves_backup_and_refuses_retry(self):
        self.interrupted_adoption("attention", "Incomplete prior adoption receipt")

    def test_actual_receipt_failure_preserves_backup_and_refuses_retry(self):
        self.interrupted_adoption("receipt", "Incomplete prior adoption receipt")


if __name__ == "__main__":
    unittest.main(verbosity=2)
