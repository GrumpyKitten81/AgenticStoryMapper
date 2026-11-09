import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / '_bmad-output/implementation-artifacts'
REPORT = ART / 'evidence/epic-4-5-orchestrator-reconciliation-20261016.json'
OUTPUT = ART / 'evidence/epic-4-5-reconciliation-check-20261016.json'
TASK_WRITES = {'phase', 'commit_sha', 'board_advance_intended', 'spec_file'}
RUN_WRITES = {'tasks', 'paused_reason', 'paused_stage', 'paused_story_key', 'finished', 'stopped'}
APPROVED = {'4-13-validation-gate-with-five-bmad-users', '5-5-plan-drift-report', 'epic-4', 'epic-5', 'epic-5-retrospective'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def object_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def command(argv):
    result = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True)
    return {'command': argv, 'exit_code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}


def git(*args):
    result = command(['git', *args])
    assert result['exit_code'] == 0, result['command']
    return result['stdout'].strip()


def immutable(value, excluded):
    return {k: v for k, v in value.items() if k not in excluded}


def summary(state):
    keys = ['epic_filter', 'story_filter', 'max_stories', 'finished', 'stopped', 'paused_stage', 'paused_story_key']
    return {k: state.get(k) for k in keys}


def check_task(key, before, after):
    assert after['phase'] == 'done', key
    assert immutable(before, TASK_WRITES) == immutable(after, TASK_WRITES), key
    if before['phase'] == 'done':
        assert before == after, key
    assert command(['git', 'merge-base', '--is-ancestor', after['commit_sha'], 'HEAD'])['exit_code'] == 0
    front = (ART / f'spec-{key}.md').read_text().split('---', 2)[1]
    assert re.search(r'^status:\s*[\'"]?done[\'"]?\s*$', front, re.M), key
    return {'story_key': key, 'before': {'phase': before['phase'], 'commit_sha': before.get('commit_sha')},
            'after': {'phase': after['phase'], 'commit_sha': after['commit_sha']},
            'sessions': {'count': len(before['sessions']), 'before_sha256': object_sha(before['sessions']), 'after_sha256': object_sha(after['sessions'])},
            'immutable_task_fields': {'before_sha256': object_sha(immutable(before, TASK_WRITES)), 'after_sha256': object_sha(immutable(after, TASK_WRITES))},
            'commit_is_head_ancestor': True, 'current_spec_done': True}


def check_run(entry, backup):
    run = ROOT / '.bmad-loop/runs' / entry['run_id']
    old = backup / entry['run_id']
    before, after = [json.loads(p.read_text()) for p in [old / 'state.json', run / 'state.json']]
    assert immutable(before, RUN_WRITES) == immutable(after, RUN_WRITES)
    assert after['finished'] and not after['stopped'] and after['paused_stage'] is None
    assert set(before['tasks']) == set(after['tasks'])
    files = {}
    for name, expected in entry['files'].items():
        original, current = (old / name).read_bytes(), (run / name).read_bytes()
        assert sha(original) == expected['before_sha256'], name
        assert sha(current) == expected['after_sha256'], name
        files[name] = {'before_sha256': sha(original), 'after_sha256': sha(current)}
        if name == 'ATTENTION':
            assert original == current
    prefix, journal = (old / 'journal.jsonl').read_bytes(), (run / 'journal.jsonl').read_bytes()
    assert journal.startswith(prefix)
    appended = [json.loads(line) for line in journal[len(prefix):].splitlines() if line.strip()]
    assert appended[-1]['kind'] == 'run-complete'
    assert all(row['operator_reconciliation'] == 'epic45-operator-adoption-20261016' for row in appended)
    return {'run_id': entry['run_id'], 'before': summary(before), 'after': summary(after), 'files': files,
            'immutable_run_fields': {'before_sha256': object_sha(immutable(before, RUN_WRITES)), 'after_sha256': object_sha(immutable(after, RUN_WRITES))},
            'tasks': [check_task(k, v, after['tasks'][k]) for k, v in before['tasks'].items()],
            'journal_prefix': {'byte_length': len(prefix), 'before_sha256': sha(prefix), 'current_prefix_sha256': sha(journal[:len(prefix)])},
            'appended_events': [{k: row[k] for k in ['kind', 'story_key', 'commit', 'operator_reconciliation'] if k in row} for row in appended]}


def rows(text):
    return {m.group(1): m.group(2) for m in re.finditer(r'^  ([\w-]+):\s*([^\r\n]+)$', text, re.M)}


def check_board(backup):
    before = (backup / 'sprint-status.yaml').read_text()
    after = (ART / 'sprint-status.yaml').read_text()
    old_rows, new_rows = rows(before), rows(after)
    assert set(old_rows) == set(new_rows)
    changed = {key for key in old_rows if old_rows[key] != new_rows[key]}
    assert changed == APPROVED, changed
    assert all(new_rows[key] == 'done' for key in APPROVED)
    assert old_rows['4-9-preview-a-changeset-on-the-board'] == new_rows['4-9-preview-a-changeset-on-the-board'] == 'done'
    assert new_rows['epic-4-retrospective'] == 'optional' and new_rows['epic-6'] == 'backlog'
    stories = {k: v for k, v in new_rows.items() if re.match(r'^[45]-\d+-', k)}
    assert len(stories) == 18 and set(stories.values()) == {'done'}
    normalized = before
    for key in APPROVED:
        normalized = re.sub(r'(^  ' + re.escape(key) + r':\s*)[^\r\n]+', lambda m: m.group(1) + 'done', normalized, flags=re.M)
    normalized = re.sub(r'^last_updated:.*$', 'last_updated: 2026-10-16', normalized, flags=re.M)
    assert normalized == after, 'Unexpected board byte/text changes'
    return {'approved_row_changes': {k: {'before': old_rows[k], 'after': new_rows[k]} for k in sorted(APPROVED)},
            'preexisting_4_9_done_preserved': True, 'epic4_retrospective': 'optional', 'epic6': 'backlog',
            'story_count': len(stories), 'story_statuses': stories, 'pending_stories': [], 'only_other_change': 'last_updated: 2026-10-16'}


def cli_outputs(targets):
    listing = command(['bmad-loop', 'list', '--json'])
    assert listing['exit_code'] == 0
    parsed = json.loads(listing['stdout'])
    relevant = [r for r in parsed['runs'] if r['run_id'] in targets]
    assert len(relevant) == 11 and all(r['status'] == 'finished' and not r['paused_stage'] for r in relevant)
    outputs = [{'command': listing['command'], 'exit_code': 0, 'stdout_json': {'schema_version': parsed['schema_version'], 'runs': relevant, 'listing_fault': parsed['listing_fault']}, 'filter': 'Only approved target run rows retained.'}]
    for rid in targets:
        result = command(['bmad-loop', 'status', rid, '--json'])
        assert result['exit_code'] == 0
        doc = json.loads(result['stdout'])
        clean = {k: doc[k] for k in ['schema_version', 'run_id', 'status', 'finished', 'stopped', 'crashed', 'paused_stage', 'paused_story_key']}
        clean['tasks'] = [{k: t[k] for k in ['story_key', 'epic', 'phase', 'commit_sha']} for t in doc['tasks']]
        outputs.append({'command': result['command'], 'exit_code': 0, 'stdout_json': clean, 'filter': 'Token counts, adapter settings and session details omitted.'})
    parked = command(['bmad-loop', 'confirm', '--list', '--json'])
    assert parked['exit_code'] == 0
    outputs.append({'command': parked['command'], 'exit_code': 0, 'stdout_json': json.loads(parked['stdout'])})
    return outputs


def detect_outputs():
    helper = '.agents/skills/bmad-retrospective/scripts/sprint_status.py'
    results = []
    for epic in (4, 5):
        result = command([sys.executable, helper, 'detect-epic', '--file', str((ART / 'sprint-status.yaml').relative_to(ROOT)), '--epic', str(epic)])
        if result['exit_code'] == 0:
            results.append({'command': result['command'], 'exit_code': 0, 'stdout_json': json.loads(result['stdout'])})
        else:
            assert "ModuleNotFoundError: No module named 'ruamel'" in result['stderr']
            results.append({'command': result['command'], 'exit_code': result['exit_code'], 'stderr_last_line': result['stderr'].splitlines()[-1], 'limitation': 'Installed Python lacks ruamel.yaml; actual CLI and explicit board checks supply completion evidence.'})
    return results


def check_git(report):
    current_text = git('for-each-ref', '--format=%(refname) %(objectname)')
    current = dict(line.split(' ', 1) for line in current_text.splitlines())
    previous_output = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    baseline = previous_output.get('git', {}).get('baseline_refs')
    if baseline is None:
        assert sha(current_text.encode()) == report['git_refs_sha256']
        baseline = current
    baseline_text = '\n'.join(f'{key} {value}' for key, value in sorted(baseline.items()))
    assert sha(baseline_text.encode()) == report['git_refs_sha256']
    branch = 'refs/heads/main'
    assert immutable(current, {branch}) == immutable(baseline, {branch})
    assert command(['git', 'merge-base', '--is-ancestor', baseline[branch], current[branch]])['exit_code'] == 0
    return {'head': git('rev-parse', 'HEAD'), 'refs_sha256': sha(current_text.encode()),
            'baseline_refs': baseline, 'baseline_refs_sha256': report['git_refs_sha256'],
            'preserved_refs_except_main': True, 'main_baseline_is_ancestor': True,
            'allowed_change': 'Only main may advance after reconciliation; every other ref must remain exact.'}


def main():
    report = json.loads(REPORT.read_text())
    backup = ROOT / report['backup_directory']
    assert backup.is_dir(), 'Recovery files are local-only; obtain the operator backup directory before running.'
    result = {'schema_version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
              'command': 'python3 _bmad-output/implementation-artifacts/evidence/epic-4-5-reconciliation-check.py',
              'report_sha256': sha(REPORT.read_bytes()), 'checker_sha256': sha(Path(__file__).read_bytes()),
              'recovery_scope': 'Raw backups and session logs stay local and ignored. This tracked output contains sanitized summaries and hashes only.',
              'runs': [check_run(r, backup) for r in report['runs']], 'board': check_board(backup)}
    unchanged = {}
    for relative, expected in report['non_target_state_snapshot'].items():
        actual = sha((ROOT / relative).read_bytes())
        assert actual == expected, relative
        unchanged[relative] = {'expected_sha256': expected, 'actual_sha256': actual}
    result['non_target_states'] = unchanged
    result['git'] = check_git(report)
    result['cli_observations'] = cli_outputs([r['run_id'] for r in report['runs']])
    result['detect_epic_observations'] = detect_outputs()
    result['verification_result'] = 'PASS'
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'verification_result': 'PASS', 'output': str(OUTPUT.relative_to(ROOT)), 'runs': len(result['runs'])}))


if __name__ == '__main__':
    main()
