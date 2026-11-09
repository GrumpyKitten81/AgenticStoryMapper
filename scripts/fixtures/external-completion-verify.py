import os
import json
import stat
import subprocess
import sys
from pathlib import Path

mode = os.environ.get("P1_FIXTURE_VERIFY_MODE", "pass")
if mode == "fail":
    sys.exit(17)
if mode == "source":
    Path("source.txt").write_text("changed during verification\n")
if mode == "chmod":
    source = Path("source.txt")
    changed_permission = stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH if os.name == "nt" else stat.S_IXUSR
    source.chmod(source.stat().st_mode ^ changed_permission)
if mode == "ref":
    subprocess.run(["git", "update-ref", "refs/attempt-preserve-dirty/fixture", "HEAD"], check=True)
if mode == "policy":
    with Path(".bmad-loop/policy.toml").open("a") as policy:
        policy.write("\n# changed during verification\n")
if mode == "manifest":
    with Path("manifest.json").open("a") as manifest:
        manifest.write("\n")
if mode == "engine":
    from bmad_loop.runs import write_pid
    write_pid(Path(".bmad-loop/runs/fixture-run"))
if mode == "state":
    state_path = Path(".bmad-loop/runs/fixture-run/state.json")
    state = json.loads(state_path.read_bytes())
    state["fixture_verifier_mutation"] = True
    state_path.write_text(json.dumps(state))
if mode == "journal":
    with Path(".bmad-loop/runs/fixture-run/journal.jsonl").open("a") as journal:
        journal.write('{"kind":"fixture-verifier-mutation"}\n')
if mode == "attention":
    with Path(".bmad-loop/runs/fixture-run/ATTENTION").open("a") as attention:
        attention.write("Verifier changed attention\n")
