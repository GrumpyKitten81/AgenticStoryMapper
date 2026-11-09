import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';

const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const response = (vulnerabilities) => JSON.stringify({ metadata: { vulnerabilities } });
const scenarios = [
  { name: 'clean', stdout: response(counts), scannerExit: 0, expectedExit: 0 },
  { name: 'lower severity only', stdout: response({ ...counts, info: 1, low: 2, moderate: 3 }), scannerExit: 1, expectedExit: 0 },
  { name: 'high', stdout: response({ ...counts, high: 1 }), scannerExit: 1, expectedExit: 1 },
  { name: 'critical', stdout: response({ ...counts, critical: 1 }), scannerExit: 1, expectedExit: 1 },
  { name: 'unavailable', stdout: '', scannerExit: 2, expectedExit: 1 },
  { name: 'malformed', stdout: '{invalid', scannerExit: 0, expectedExit: 1 }
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'storymapper-release-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['scripts', 'apps/server/src/config', 'scanner']) mkdirSync(join(root, path), { recursive: true });
  const scripts = ['release.mjs', 'release-candidate.mjs', 'release-diagnostics.mjs', 'check-publication-audit.mjs', 'check-publication-content.mjs',
    'check-publication-git.mjs', 'ci-audit.mjs', 'runtime.mjs', 'processes.mjs'];
  for (const name of scripts) copyFileSync(new URL(name, import.meta.url), join(root, 'scripts', name));
  for (const name of ['failures.mjs', 'runtime-port.ts']) {
    copyFileSync(new URL(`../apps/server/src/config/${name}`, import.meta.url), join(root, 'apps/server/src/config', name));
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'storymapper', version: '1.0.0', type: 'module' }));
  const scanner = join(root, 'scanner');
  const entry = process.platform === 'win32' ? join(scanner, 'node_modules/corepack/dist/corepack.js') : join(scanner, 'corepack');
  if (process.platform === 'win32') {
    mkdirSync(dirname(entry), { recursive: true });
    writeFileSync(join(scanner, 'corepack.cmd'), '');
  }
  copyFileSync(new URL('./fixtures/ci-audit-scanner.mjs', import.meta.url), entry);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Release fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Release audit fixture');
  git('tag', 'v1.0.0');
  return { root, env: { ...process.env, PATH: `${scanner}${delimiter}${process.env.PATH ?? ''}`,
    COREPACK_ENABLE_NETWORK: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1',
    GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF: 'refs/tags/v1.0.0', GITHUB_SHA: git('rev-parse', 'HEAD') } };
}

for (const scenario of scenarios) test(`release audit CLI ${scenario.name}`, (t) => {
  const { root, env } = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/release.mjs', 'audit'], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
    env: { ...env, STORYMAPPER_TEST_AUDIT_STDOUT: scenario.stdout,
      STORYMAPPER_TEST_AUDIT_STDERR: 'untrusted scanner detail', STORYMAPPER_TEST_AUDIT_EXIT: String(scenario.scannerExit) }
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, scenario.expectedExit, result.stderr);
  assert.equal(result.stdout, scenario.expectedExit === 0 ? 'release: checks completed.\n' : '');
  assert.equal(result.stderr, scenario.expectedExit === 0 ? ''
    : 'release: dependency-audit. Next action: Resolve high/critical advisories or repair scanner availability/output, then rerun the audit job.\n');
});

test('release CLI candidate refusal gives a fixed repair action without raw input', (t) => {
  const { root, env } = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/release.mjs', 'validate'], {
    cwd: root, encoding: 'utf8', timeout: 15_000, env: { ...env, GITHUB_SHA: 'untrusted revision\n::warning::detail' }
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'release: candidate. Next action: Restore committed root metadata and the matching v<SemVer> tag at the exact event revision, then retry validation.\n');
});

test('release CLI unexpected filesystem failure withholds raw paths and gives a safe stop action', (t) => {
  const { root, env } = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/release.mjs', 'notes'], {
    cwd: root, encoding: 'utf8', timeout: 15_000, env
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'release: unexpected failure. Next action: Stop and inspect the workflow and remote release before retrying; raw diagnostics are withheld.\n');
});
