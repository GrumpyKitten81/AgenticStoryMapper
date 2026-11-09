#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

function main() {
  const { values } = parseArgs({ options: {
    'run-id': { type: 'string' }, manifest: { type: 'string' },
    apply: { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/bmad-loop-reconcile-sprint.mjs --run-id RUN --manifest FILE [--apply]');
    console.log('Default: verify without changing run files. --apply adopts verified external completion; never changes sprint status.');
    return 0;
  }
  if (!values['run-id'] || !values.manifest) throw new Error('--run-id and --manifest are required');
  const runtime = spawnSync('uv', ['tool', 'dir'], { encoding: 'utf8' });
  if (runtime.error || runtime.status !== 0) throw new Error('uv tool dir failed; install the bmad-loop uv tool first');
  const python = join(runtime.stdout.trim(), 'bmad-loop', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!existsSync(python)) throw new Error('Installed bmad-loop Python runtime not found');
  const args = [join(import.meta.dirname, 'bmad-loop-reconcile.py'), '--project-root', process.cwd(),
    '--run-id', values['run-id'], '--manifest', resolve(values.manifest)];
  if (values.apply) args.push('--apply');
  const result = spawnSync(python, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

process.exitCode = main();
