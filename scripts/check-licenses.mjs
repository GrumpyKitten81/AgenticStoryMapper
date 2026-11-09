import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseCompatible } from './license-policy.mjs';
import { commandMain } from './processes.mjs';
import { runtime } from './runtime.mjs';
import { repositoryRoot } from './source-inventory.mjs';

export function inspectLicenses(report) {
  if (!report || Array.isArray(report) || typeof report !== 'object' || !Object.keys(report).length) throw new Error('licenses: missing resolved dependency report.');
  const violations = [];
  for (const entries of Object.values(report)) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('licenses: invalid resolved dependency entries.');
    for (const entry of entries) inspectEntry(entry, violations);
  }
  return violations;
}

function inspectEntry(entry, violations) {
  if (!entry.name || !Array.isArray(entry.versions) || !entry.versions.length || !Array.isArray(entry.paths) || entry.paths.length !== entry.versions.length) throw new Error('licenses: invalid resolved package identity.');
  for (let index = 0; index < entry.paths.length; index++) {
    const metadata = JSON.parse(readFileSync(join(entry.paths[index], 'package.json'), 'utf8'));
    const identity = `${entry.name}@${entry.versions[index]}`;
    if (metadata.name !== entry.name || metadata.version !== entry.versions[index]) throw new Error(`${identity}: licenses: resolved metadata identity mismatch.`);
    if (!licenseCompatible(metadata.license)) violations.push(`${identity}: licenses: missing, unknown or incompatible installed license.`);
  }
}

export async function checkLicenses(signal, root = repositoryRoot) {
  const { pnpm } = await runtime(signal);
  const output = await pnpm(['licenses', 'list', '--json'], { cwd: root, capture: true });
  const violations = inspectLicenses(JSON.parse(output));
  if (violations.length) throw new Error(violations.join('\n'));
  console.log('Resolved dependency licenses pass the explicit compatibility policy; upstream obligations remain.');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.env.COREPACK_ENABLE_NETWORK = '0';
  await commandMain(checkLicenses, { interruptExitCode: 1 });
}
