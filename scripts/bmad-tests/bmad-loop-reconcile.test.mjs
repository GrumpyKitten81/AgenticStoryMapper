import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

test('external completion worker verifies and adopts only isolated temporary runs', { timeout: 120_000 }, () => {
  const runtime = spawnSync('uv', ['tool', 'dir'], { encoding: 'utf8' });
  assert.equal(runtime.status, 0, 'P1 acceptance requires the installed bmad-loop uv tool');
  const python = join(runtime.stdout.trim(), 'bmad-loop', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const result = spawnSync(python, [join(import.meta.dirname, '..', 'bmad-loop-reconcile-test.py')], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
