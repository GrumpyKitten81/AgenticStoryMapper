import { commandMain, run } from './processes.mjs';
import { runtime } from './runtime.mjs';
import { verifyChecks } from './verify.mjs';
import { repositoryRoot } from './source-inventory.mjs';

process.env.COREPACK_ENABLE_NETWORK = '0';
process.env.npm_config_offline = 'true';

export async function runQualityGate(signal) {
  const { pnpm } = await runtime(signal);
  const node = (script, args = []) => run(process.execPath, [script, ...args], { cwd: repositoryRoot, signal });
  await node('scripts/check-boundaries.mjs');
  await node('scripts/check-size.mjs');
  await node('scripts/check-hygiene.mjs');
  await node('scripts/check-licenses.mjs');
  await pnpm(['check-capabilities']);
  await pnpm(['build']);
  await run(process.execPath, ['--test', '--test-concurrency=1', 'scripts/*.test.mjs'], { cwd: repositoryRoot, signal });
  await node('scripts/check-coverage.mjs');
  await pnpm(['--filter', '@storymapper/server', 'test:audit-performance']);
  await verifyChecks(signal, { flags: new Set(['--skip-build']), checkProjectFolder: false });
  console.log('All local quality gates completed.');
}

await commandMain(runQualityGate, { interruptExitCode: 1 });
