import { configuredRuntime, runtime } from './runtime.mjs';
import { launch } from './launcher.mjs';
import { checkDependencies, checkNative, checkPort } from './diagnostics.mjs';

export async function startup(signal, debug = false) {
  const environment = await runtime(signal, debug);
  const config = await configuredRuntime(environment.env);
  Object.assign(process.env, environment.env);
  checkDependencies();
  checkNative();
  if (environment.env.PORT !== undefined) await checkPort(config, signal);
  await launch({ ...environment, debug }, signal);
}
