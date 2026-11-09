import { spawnSync } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { corepackEntry, repository } from './runtime.mjs';

const severities = ['info', 'low', 'moderate', 'high', 'critical'];

export function auditOutcome(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) return { status: 'Scanner unavailable' };
  let data;
  try { data = JSON.parse(result.stdout); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: 'Invalid scanner result' };
  }
  if (!data || typeof data !== 'object' || Object.hasOwn(data, 'error')) return { status: 'Scanner unavailable' };
  const counts = data.metadata?.vulnerabilities;
  if (!counts || Object.keys(counts).length !== severities.length || severities.some((severity) => !Object.hasOwn(counts, severity) || !Number.isSafeInteger(counts[severity]) || counts[severity] < 0)) return { status: 'Invalid scanner result' };
  const total = severities.reduce((sum, severity) => sum + counts[severity], 0);
  if (!Number.isSafeInteger(total) || (total === 0) !== (result.status === 0)) return { status: 'Invalid scanner result' };
  return { status: total ? 'Advisories found' : 'Clean', counts: Object.fromEntries(severities.map((severity) => [severity, counts[severity]])) };
}

export function scanAudit(scan = spawnSync, env = process.env) {
  let entry;
  try { entry = corepackEntry(env); }
  catch (error) {
    if (!error.message.startsWith('Corepack is not available on PATH. Next action:')) throw error;
    return { status: 'Scanner unavailable' };
  }
  return auditOutcome(scan(process.execPath, [entry, 'pnpm', 'audit', '--json'], {
    cwd: repository, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000, maxBuffer: 8 * 1024 * 1024
  }));
}

export function renderAudit(outcome) {
  const lines = ['## Dependency audit (informational)', '', `Status: ${outcome.status}.`];
  if (outcome.counts) lines.push('', ...severities.map((severity) => `${severity}: ${outcome.counts[severity]}`));
  else lines.push('', 'Advisory counts are unavailable.');
  lines.push('', 'This PR report does not enforce the release audit policy.');
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = renderAudit(scanAudit());
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
