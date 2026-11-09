import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { commandMain } from './processes.mjs';
import { repository, runtime } from './runtime.mjs';
import { buildDiagnostics, commandOptions } from './diagnostics.mjs';
import { startup } from './startup.mjs';
import { failure } from '../apps/server/src/config/failures.mjs';

await commandMain(async (signal) => {
  const { debug } = commandOptions('setup');
  const { pnpm } = await runtime(signal, debug);
  console.log('Setup: installing dependencies.');
  await pnpm(['install', '--frozen-lockfile'], { diagnostics: { debug, phase: 'Dependency installation', fix: 'Use the pinned Corepack/pnpm environment, repair the reported install or store error with node scripts/setup.mjs --debug, then rerun setup.' } });
  console.log('Setup: building the app.');
  await pnpm(['--filter', '@storymapper/web', 'build'], { diagnostics: buildDiagnostics(debug) });
  signal.throwIfAborted();
  try { await mkdir(join(repository, 'local-projects', 'default.lsm'), { recursive: true }); }
  catch (error) { throw failure('Setup could not create the default Project folder.', 'Make local-projects/default.lsm a writable directory, then run node scripts/setup.mjs.', error); }
  console.log('Setup completed. Starting Agentic Story Mapper. Guided Agent use requires MCP setup before map work; browser-only use needs no MCP. Keep this terminal open. Stop with Ctrl+C. Later, run node scripts/start.mjs.');
  await startup(signal, debug);
});
