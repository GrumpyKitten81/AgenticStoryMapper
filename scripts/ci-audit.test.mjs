import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditOutcome, renderAudit, scanAudit } from './ci-audit.mjs';

const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const response = (vulnerabilities) => JSON.stringify({ metadata: { vulnerabilities } });
const scenarios = [
  { name: 'clean', stdout: response(counts), status: 0, expected: 'Clean', counts },
  { name: 'advisories', stdout: response({ ...counts, high: 2, critical: 1 }), status: 1, expected: 'Advisories found', counts: { ...counts, high: 2, critical: 1 } },
  { name: 'untrusted details', stdout: JSON.stringify({ metadata: { vulnerabilities: counts }, actions: [{ detail: 'untrusted stdout\n::warning::untrusted annotation' }] }), status: 0, expected: 'Clean', counts },
  { name: 'transport failure', stdout: '', status: 1, expected: 'Invalid scanner result' },
  { name: 'registry error', stdout: JSON.stringify({ error: { message: 'untrusted scanner detail' }, metadata: { vulnerabilities: counts } }), status: 1, expected: 'Scanner unavailable' },
  { name: 'malformed JSON', stdout: '{invalid', status: 0, expected: 'Invalid scanner result' },
  { name: 'missing counts', stdout: '{}', status: 0, expected: 'Invalid scanner result' },
  { name: 'partial counts', stdout: response({ high: 0 }), status: 0, expected: 'Invalid scanner result' },
  { name: 'unknown severity', stdout: response({ ...counts, unknown: 1 }), status: 0, expected: 'Invalid scanner result' },
  { name: 'negative count', stdout: response({ ...counts, high: -1 }), status: 1, expected: 'Invalid scanner result' },
  { name: 'string count', stdout: response({ ...counts, high: '1' }), status: 1, expected: 'Invalid scanner result' },
  { name: 'fraction count', stdout: response({ ...counts, high: 0.5 }), status: 1, expected: 'Invalid scanner result' },
  { name: 'unsafe count', stdout: response({ ...counts, high: Number.MAX_SAFE_INTEGER + 1 }), status: 1, expected: 'Invalid scanner result' },
  { name: 'unsafe total', stdout: response({ ...counts, high: Number.MAX_SAFE_INTEGER, low: 1 }), status: 1, expected: 'Invalid scanner result' },
  { name: 'zero counts with failure', stdout: response(counts), status: 1, expected: 'Invalid scanner result' },
  { name: 'advisories with success', stdout: response({ ...counts, high: 1 }), status: 0, expected: 'Invalid scanner result' },
  { name: 'unexpected exit', stdout: response(counts), status: 2, expected: 'Scanner unavailable' }
];

for (const scenario of scenarios) test(`audit classification: ${scenario.name}`, () => {
  const outcome = auditOutcome(scenario);
  assert.deepEqual(outcome, { status: scenario.expected, ...(scenario.counts ? { counts: scenario.counts } : {}) });
});

test('spawn errors and termination cannot report clean counts', () => {
  for (const result of [{ error: new Error('untrusted') }, { signal: 'SIGTERM', status: null }, { error: { code: 'ETIMEDOUT' }, status: 0 }]) {
    assert.deepEqual(auditOutcome({ stdout: response(counts), ...result }), { status: 'Scanner unavailable' });
  }
});

function scannerFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'storymapper-ci-audit-'));
  const entry = process.platform === 'win32' ? join(directory, 'node_modules/corepack/dist/corepack.js') : join(directory, 'corepack');
  if (process.platform === 'win32') {
    mkdirSync(join(directory, 'node_modules/corepack/dist'), { recursive: true });
    writeFileSync(join(directory, 'corepack.cmd'), '');
  }
  cpSync(new URL('./fixtures/ci-audit-scanner.mjs', import.meta.url), entry);
  return { directory, env: { ...process.env, PATH: directory, GITHUB_STEP_SUMMARY: join(directory, 'summary') } };
}

test('scanner uses selected Node and suppresses both untrusted streams', () => {
  const fixture = scannerFixture();
  try {
    const outcome = scanAudit((command, args, options) => {
      assert.equal(command, process.execPath);
      assert.deepEqual(args.slice(1), ['pnpm', 'audit', '--json']);
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore']);
      assert.equal(options.timeout, 60_000);
      return { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: counts }, detail: 'untrusted stdout' }), stderr: 'untrusted stderr' };
    }, fixture.env);
    assert.equal(renderAudit(outcome).includes('untrusted'), false);
    assert.deepEqual(outcome, { status: 'Clean', counts });
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('missing Corepack is informational and never clean', () => {
  assert.deepEqual(scanAudit(() => assert.fail('scanner must not run'), { PATH: '' }), { status: 'Scanner unavailable' });
});

test('actual spawn failure is informational', () => {
  const fixture = scannerFixture();
  try {
    assert.deepEqual(scanAudit(() => spawnSync(join(fixture.directory, 'missing-executable')), fixture.env), { status: 'Scanner unavailable' });
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

for (const scenario of scenarios) test(`CLI safely reports ${scenario.name} with successful informational exit`, () => {
  const fixture = scannerFixture();
  try {
    const result = spawnSync(process.execPath, ['scripts/ci-audit.mjs'], {
      encoding: 'utf8', env: { ...fixture.env, STORYMAPPER_TEST_AUDIT_STDOUT: scenario.stdout, STORYMAPPER_TEST_AUDIT_STDERR: 'untrusted stderr', STORYMAPPER_TEST_AUDIT_EXIT: String(scenario.status) }
    });
    assert.equal(result.status, 0, result.stderr);
    const expectedCounts = scenario.counts ? [
      `info: ${scenario.counts.info}`, `low: ${scenario.counts.low}`, `moderate: ${scenario.counts.moderate}`,
      `high: ${scenario.counts.high}`, `critical: ${scenario.counts.critical}`
    ].join('\n') : 'Advisory counts are unavailable.';
    const expected = `## Dependency audit (informational)\n\nStatus: ${scenario.expected}.\n\n${expectedCounts}\n\nThis PR report does not enforce the release audit policy.\n`;
    assert.equal(result.stdout, expected);
    assert.equal(result.stderr, '');
    assert.equal(readFileSync(fixture.env.GITHUB_STEP_SUMMARY, 'utf8'), expected);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});
