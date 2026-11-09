import { commandMain } from './processes.mjs';
import { checkCorepack, checkNode, checkRuntimeDiscovery, configuredRuntime } from './runtime.mjs';
import { checkDependencies, checkNative, checkPort, commandOptions, webBuildPresent } from './diagnostics.mjs';
import { failure, renderFailure } from '../apps/server/src/config/failures.mjs';

await commandMain(async (signal) => {
  const { debug } = commandOptions('doctor');
  const env = process.env;
  const checks = [
    ['Node version', checkNode],
    ['Corepack availability', () => checkCorepack(env, signal)],
    ['Configured port free', async () => checkPort(await configuredRuntime(env), signal)],
    ['Runtime port discovery', () => checkRuntimeDiscovery(env, signal)],
    ['Installed dependencies', checkDependencies],
    ['Native module loads', checkNative],
    ['Web build present', () => {
      if (!webBuildPresent()) throw failure('The web build is missing or not a readable regular file.', 'Run node scripts/setup.mjs.');
    }]
  ];
  for (const [name, check] of checks) {
    signal.throwIfAborted();
    try {
      const result = await check();
      console.log(`PASS ${name}`);
      if (name === 'Runtime port discovery' && result) console.log(`Operational health: version=${result.version} schema=${result.schemaVersion ?? 'unavailable'} epoch=${result.epoch ?? 'unavailable'} write-gate=${result.writeGate} pending-migration=${result.pendingMigration ?? 'unknown'}`);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      const diagnostic = error.message.includes('Next action:') ? error : failure(`${name} could not be checked.`, 'Run node scripts/doctor.mjs --debug under installed Node 24 and repair the reported check.', error);
      console.error(`FAIL ${name}: ${renderFailure(diagnostic, debug, env)}`);
      if (error.health) console.log(error.health.message);
      process.exitCode = 1;
    }
  }
});
