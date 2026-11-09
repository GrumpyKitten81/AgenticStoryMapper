import hashlib
import json
import os
import pathlib
import platform
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request


COMMAND_TIMEOUT = 180
SHUTDOWN_TIMEOUT = 30
FORCE_TIMEOUT = 5
OBSERVATION_TIMEOUT = 120


def safe(context, text):
    source, node_bin = (context[key] for key in ('source', 'node_bin'))
    return text.replace(str(node_bin), "<NODE24_BIN>").replace(str(source), "<SOURCE_CHECKOUT>").replace(str(pathlib.Path.home()), "<HOST_HOME>")


def save(context):
    report_path, report = (context[key] for key in ('report_path', 'report'))
    report_path.write_text(safe(context, json.dumps(report, indent=2)) + "\n")


def signal_group(process, value):
    try:
        os.killpg(process.pid, value)
    except ProcessLookupError:
        return False
    return True


def terminate(process):
    signal_group(process, signal.SIGKILL)
    process.wait(timeout=FORCE_TIMEOUT)


def run(context, args, name, cwd, env=None):
    evidence, report = (context[key] for key in ('evidence', 'report'))
    started = time.monotonic()
    command = {"argv": list(map(str, args)), "cwd": str(cwd), "log": f"native-{name}.log", "deadline_seconds": COMMAND_TIMEOUT}
    report["commands"].append(command)
    process = subprocess.Popen(args, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    output = ""
    try:
        output, _ = process.communicate(timeout=COMMAND_TIMEOUT)
    except subprocess.TimeoutExpired as error:
        command["timed_out"] = True
        output = error.output or ""
        if isinstance(output, bytes):
            output = output.decode(errors="replace")
    finally:
        if command.get("timed_out") or process.poll() is None:
            try:
                terminate(process)
                output, _ = process.communicate(timeout=FORCE_TIMEOUT)
            except (OSError, subprocess.TimeoutExpired) as error:
                command["cleanup_error"] = str(error)
        (evidence / command["log"]).write_text(safe(context, output))
        command.update(exit_code=process.returncode, seconds=round(time.monotonic() - started, 3))
        save(context)
    if command.get("timed_out") or process.returncode:
        raise RuntimeError(f"{name} failed; retained {command['log']}")
    return output.strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def health(url):
    with urllib.request.urlopen(url, timeout=2) as response:
        return {"status": response.status, "body": json.loads(response.read())}


def capture(context, process, errors):
    evidence = context['evidence']
    try:
        with (evidence / "native-start.log").open("w") as log:
            for line in process.stdout:
                log.write(safe(context, line))
                log.flush()
    except (OSError, UnicodeError) as error:
        errors.append(f"Launcher log capture failed: {error}")


def probe_ready(context, process, errors):
    checkout = context['checkout']
    port_file = checkout / "local-projects/default.lsm/.port"
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if errors:
            raise RuntimeError(errors[0])
        if process.poll() is not None:
            raise RuntimeError(f"start exited early: {process.returncode}; retained native-start.log")
        if port_file.exists():
            record = json.loads(port_file.read_text())
            url = f"http://{record['host']}:{record['port']}"
            try:
                observed = health(url + "/health")
                if observed["body"].get("ok") is True:
                    return url, observed
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.1)
        else:
            time.sleep(0.1)
    raise RuntimeError("start health deadline elapsed; retained native-start.log")


def prepare(context):
    source, node_bin, root, checkout, report = (context[key] for key in ('source', 'node_bin', 'root', 'checkout', 'report'))
    report["platform"]["sw_vers"] = run(context, ["sw_vers"], "platform", root)
    revision = run(context, ["git", "rev-parse", "HEAD"], "source-revision", source)
    run(context, ["git", "clone", "--no-hardlinks", "--no-checkout", str(source), str(checkout)], "clone", root)
    run(context, ["git", "checkout", "--detach", revision], "checkout", checkout)
    run(context, ["git", "remote", "remove", "origin"], "remove-origin", checkout)
    report["revision"] = run(context, ["git", "rev-parse", "HEAD"], "revision", checkout)
    report["clean_checkout_status"] = run(context, ["git", "status", "--porcelain"], "clean-status", checkout)
    forbidden = [checkout / ".env", checkout / "node_modules"]
    forbidden += [ancestor / ".env" for ancestor in checkout.parents]
    if any(path.exists() for path in forbidden):
        raise RuntimeError("Fresh checkout unexpectedly contains or inherits environment/dependency/user state")
    if list((checkout / "local-projects").iterdir()) != [checkout / "local-projects/.gitkeep"]:
        raise RuntimeError("Fresh local-projects contains more than its tracked .gitkeep")
    report["initial_absent"] = [".env and all parent .env files", "node_modules", "local-projects user state (tracked .gitkeep only)"]
    for directory in ["home", "cache", "config", "tmp", "corepack"]:
        (root / directory).mkdir()
    env = {"PATH": f"{node_bin}:/usr/bin:/bin:/usr/sbin:/sbin", "HOME": str(root / "home"),
           "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"),
           "TMPDIR": str(root / "tmp"), "COREPACK_HOME": str(root / "corepack"),
           "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0", "LANG": "en_US.UTF-8", "TERM": "dumb"}
    report["environment"] = env
    report["copied_state"] = "None: no .env, node_modules, package store, user Projects or credentials copied"
    report["runtime"] = {"node": run(context, ["node", "--version"], "node", checkout, env),
                          "corepack": run(context, ["corepack", "--version"], "corepack", checkout, env)}
    save(context)
    return env


def setup(context, env):
    source, checkout, report = (context[key] for key in ('source', 'checkout', 'report'))
    run(context, ["node", "scripts/setup.mjs"], "setup", checkout, env)
    report["runtime"]["pnpm"] = run(context, ["corepack", "pnpm", "--version"], "pnpm", checkout, env)
    project = checkout / "local-projects/default.lsm"
    report["outcomes"]["after_setup"] = {"project_directory": project.is_dir(), "database_exists": (project / "storymapper.sqlite").exists()}
    report["documentation_overlay"] = {}
    for name in ["README.md", "docs/RUNBOOK.md"]:
        shutil.copyfile(source / name, checkout / name)
        report["documentation_overlay"][name] = digest(checkout / name)
    report["overlay_note"] = "Working-tree documentation only; application/setup/start source comes from exact clean committed revision"
    report["overlay_status"] = run(context, ["git", "status", "--porcelain"], "overlay-status", checkout)


def stop(context, process, thread, errors):
    checkout, report = (context[key] for key in ('checkout', 'report'))
    outcome = {"action": "SIGINT to owned launcher (Ctrl+C equivalent)", "forced_cleanup": False}
    report["outcomes"]["stop"] = outcome
    try:
        if process.poll() is None:
            process.send_signal(signal.SIGINT)
        try:
            outcome["launcher_exit_code"] = process.wait(timeout=SHUTDOWN_TIMEOUT)
        except subprocess.TimeoutExpired:
            outcome["shutdown_timed_out"] = True
            outcome["forced_cleanup"] = True
    finally:
        if process.poll() is None:
            outcome["forced_cleanup"] = True
            try:
                terminate(process)
                outcome["launcher_exit_code"] = process.returncode
            except (OSError, subprocess.TimeoutExpired) as error:
                outcome["cleanup_error"] = str(error)
        if thread is not None and thread.ident is not None:
            thread.join(timeout=FORCE_TIMEOUT)
            if thread.is_alive():
                outcome["forced_cleanup"] = True
                signal_group(process, signal.SIGKILL)
                thread.join(timeout=FORCE_TIMEOUT)
            outcome["capture_finished"] = not thread.is_alive()
        else:
            outcome["capture_finished"] = False
        outcome["port_discovery_removed"] = not (checkout / "local-projects/default.lsm/.port").exists()
        outcome["health_unavailable"] = stopped_health(context)
        if not outcome["port_discovery_removed"] or outcome["health_unavailable"] is False:
            outcome["forced_cleanup"] = True
            signal_group(process, signal.SIGKILL)
        outcome["capture_errors"] = errors
        outcome["passed"] = outcome.get("launcher_exit_code") == 0 and not outcome["forced_cleanup"] and outcome["capture_finished"] and outcome["port_discovery_removed"] and outcome["health_unavailable"] and not errors
        retain(context)
    if not outcome["passed"]:
        raise RuntimeError("Owned launcher stop postconditions failed; retained native-macos.json and logs")


def stopped_health(context):
    report = context['report']
    url = report["outcomes"].get("actual_url")
    if not url:
        return None
    try:
        with urllib.request.urlopen(url + "/health", timeout=2):
            return False
    except urllib.error.HTTPError:
        return False
    except urllib.error.URLError as error:
        return not isinstance(error.reason, TimeoutError)
    except TimeoutError:
        return False
    return False


def retain(context):
    evidence, root, report = (context[key] for key in ('evidence', 'root', 'report'))
    report["retained_disposable_state"] = str(root)
    report["log_hashes"] = {path.name: digest(path) for path in sorted(evidence.glob("native-*.log"))}
    report["log_provenance"] = {"retained_bytes": "UTF-8 decoded command output with source, Node installation and host home paths replaced by safe().", "hashes": "SHA-256 of retained sanitized log files only; original stream bytes and hashes not retained."}
    save(context)


def observe(context, process, errors):
    root, checkout, report = (context[key] for key in ('root', 'checkout', 'report'))
    url, observed = probe_ready(context, process, errors)
    report["outcomes"].update(health=observed, operational_health=health(url + "/api/health"), actual_url=url,
                              database_created_on_start=(checkout / "local-projects/default.lsm/storymapper.sqlite").is_file())
    save(context)
    print(json.dumps({"ready": url, "root": str(root), "pid": process.pid}), flush=True)
    print("Inspect native browser; press Enter for owned-launcher SIGINT (120-second deadline).", flush=True)
    ready, _, _ = select.select([sys.stdin], [], [], OBSERVATION_TIMEOUT)
    if not ready:
        raise RuntimeError("Native observation deadline elapsed; no visual acceptance recorded")
    sys.stdin.readline()


def launch(context, env):
    evidence, checkout, report = (context[key] for key in ('evidence', 'checkout', 'report'))
    (evidence / "native-start.log").touch(exist_ok=False)
    process = subprocess.Popen(["node", "scripts/start.mjs"], cwd=checkout, env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, stdin=subprocess.DEVNULL, start_new_session=True)
    thread, errors = None, []
    try:
        thread = threading.Thread(target=capture, args=(context, process, errors), daemon=True)
        thread.start()
        report["commands"].append({"argv": ["node", "scripts/start.mjs"], "cwd": str(checkout), "pid": process.pid, "log": "native-start.log"})
        save(context)
        observe(context, process, errors)
    except (OSError, RuntimeError, ValueError, urllib.error.URLError) as error:
        report["outcomes"]["launcher_failure"] = {"type": type(error).__name__, "message": str(error)}
        raise
    finally:
        stop(context, process, thread, errors)


def main():
    source, node_bin, evidence = map(pathlib.Path, sys.argv[1:])
    evidence.mkdir(parents=True, exist_ok=False)
    root = pathlib.Path(tempfile.mkdtemp(prefix="storymapper-story-8-6-", dir="/tmp"))
    checkout, report_path = root / "checkout", evidence / "native-macos.json"
    report = {"date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "root": str(root),
              "platform": {"system": platform.system(), "release": platform.release(), "machine": platform.machine()},
              "commands": [], "outcomes": {}, "unverified": ["Windows native quickstart: environment unavailable", "Linux native quickstart: environment unavailable", "No hosted CI, screen-reader, native clipboard, credential or provider certification"]}
    context = {"source": source, "node_bin": node_bin, "evidence": evidence, "root": root,
               "checkout": checkout, "report_path": report_path, "report": report}
    try:
        env = prepare(context)
        setup(context, env)
        launch(context, env)
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError, urllib.error.URLError) as error:
        report["outcomes"]["failure"] = {"type": type(error).__name__, "message": str(error)}
        retain(context)
        return 1
    retain(context)
    print("Native run stopped; evidence saved.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
