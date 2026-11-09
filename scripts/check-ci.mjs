import { commandMain, run } from './processes.mjs';
import { runtime } from './runtime.mjs';
import { repositoryRoot } from './source-inventory.mjs';

process.env.COREPACK_ENABLE_NETWORK = '0';
process.env.npm_config_offline = 'true';

async function runCiGate(signal) {
  const { pnpm } = await runtime(signal);
  for (const script of ['check-boundaries', 'check-size', 'check-hygiene', 'check-licenses']) {
    await run(process.execPath, [`scripts/${script}.mjs`], { cwd: repositoryRoot, signal });
  }
  await pnpm(['check-capabilities']);
  await pnpm(['build']);
  for (const workspace of ['contracts', 'core']) await pnpm(['--filter', `@storymapper/${workspace}`, 'exec', 'vitest', 'run', '--exclude', '**/dist/**', '--maxWorkers=1']);
  await pnpm(['--filter', '@storymapper/server', 'exec', 'vitest', 'run', 'src/http/routes/changeset-preview.test.ts', '--maxWorkers=1']);
  await pnpm(['--filter', '@storymapper/web', 'exec', 'vitest', 'run', 'src/features/onboarding/first-map-creation.test.tsx', 'src/features/releases/filtered-reports.test.tsx', '--maxWorkers=1']);
  console.log('All CI quality gates completed.');
}

await commandMain(runCiGate, { interruptExitCode: 1 });
