import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './processes.mjs';
import { failure } from '../apps/server/src/config/failures.mjs';
import { getDatabasePath, readRuntimePort, runtimeUrl } from '../apps/server/src/config/runtime-port.ts';

export const repository = fileURLToPath(new URL('../', import.meta.url));
const HEALTH_BODY_LIMIT = 16 * 1024;

export function corepackEntry(env = process.env, platform = process.platform) {
  const names = platform === 'win32' ? ['corepack.cmd'] : ['corepack'];
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    for (const name of names) {
      const executable = join(directory, name);
      if (!existsSync(executable)) continue;
      if (platform !== 'win32') return realpathSync(executable);
      const entry = join(directory, 'node_modules', 'corepack', 'dist', 'corepack.js');
      if (existsSync(entry)) return entry;
    }
  }
  throw failure('Corepack is not available on PATH.', 'Install Corepack for your installed Node 24 runtime, then run node scripts/setup.mjs.');
}

export function checkNode() {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw failure(`Node 24 is required (>=24 <25); found ${process.versions.node}.`, 'Install Node 24 from https://nodejs.org/en/download and use it for setup and startup.');
}

export async function checkCorepack(env, signal) {
  const entry = corepackEntry(env);
  const version = await run(process.execPath, [entry, '--version'], {
    capture: true, signal: AbortSignal.any([AbortSignal.timeout(2000), ...(signal ? [signal] : [])]),
    env: { ...env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_ENABLE_PROJECT_SPEC: '0' },
    diagnostics: { phase: 'Corepack availability check', fix: 'Install a usable Corepack for Node 24 on PATH.' }
  });
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw failure('Corepack did not report a valid version.', 'Install a usable Corepack for Node 24 on PATH.');
}

export async function runtime(signal, debug) {
  checkNode();
  const metadata = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'));
  const expectedVersion = metadata.packageManager.replace(/^pnpm@/, '');
  const entry = corepackEntry();
  const env = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}` };
  const pnpm = (args, options = {}) => run(process.execPath, [entry, 'pnpm', ...args], { cwd: repository, env, signal, diagnostics: debug === undefined ? undefined : { debug, phase: 'pnpm command', fix: 'Run node scripts/setup.mjs --debug to diagnose the failing command.' }, ...options });
  const version = await pnpm(['--version'], { capture: true, diagnostics: debug === undefined ? undefined : { debug, phase: 'Corepack/pnpm version check', fix: `Use Corepack with pinned pnpm ${expectedVersion}, then run node scripts/setup.mjs.` } });
  if (version !== expectedVersion) throw failure(`Expected pnpm ${expectedVersion}, got ${version}.`, 'Use Corepack with the packageManager version in package.json, then run node scripts/setup.mjs.');
  return { pnpm, env };
}

export async function configuredRuntime(env = process.env) {
  try {
    const { loadLocalEnv, findEnvFile } = await import('../apps/server/src/config/local-env.ts');
    const { getRuntimeConfig, isLoopbackHost } = await import('../apps/server/src/config/runtime.ts');
    loadLocalEnv(join(repository, '.env'), env);
    const serverEnvFile = findEnvFile(join(repository, 'apps/server'));
    if (serverEnvFile) loadLocalEnv(serverEnvFile, env);
    const config = getRuntimeConfig(env);
    if (!isLoopbackHost(config.host)) throw new Error('Launcher requires a loopback HOST.');
    return { ...config, url: `http://${config.host === '::1' ? '[::1]' : config.host}:${config.port}` };
  } catch (error) {
    throw failure(error.message, 'Use installed Node 24, and set HOST to 127.0.0.1, localhost or ::1 and PORT to a number from 1 to 65535 in the readable optional .env or process environment.', error);
  }
}

export async function configuredUrl() {
  await configuredRuntime();
  const directory = dirname(getDatabasePath());
  const url = runtimeUrl(readRuntimePort(directory));
  await checkRuntimeIdentity(directory, url);
  return url;
}

export async function checkRuntimeDiscovery(env, signal) {
  await configuredRuntime(env);
  const directory = dirname(getDatabasePath(env));
  if (!existsSync(join(directory, '.port'))) return;
  const url = runtimeUrl(readRuntimePort(directory));
  await checkRuntimeIdentity(directory, url, signal);
  return checkOperationalHealth(url, signal);
}

async function checkRuntimeIdentity(directory, url, signal) {
  const health = await checkHealth(url, signal);
  if (health.runtimeDirectory !== directory) throw new Error('Discovered service is not this Agentic Story Mapper runtime.');
}

async function readHealth(url, pathname, signal) {
  const response = await fetch(new URL(pathname, url), { redirect: 'manual', signal: AbortSignal.any([AbortSignal.timeout(2000), ...(signal ? [signal] : [])]) });
  if (response.status !== 200) throw new Error(`Healthcheck returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > HEALTH_BODY_LIMIT) throw new Error(`Healthcheck body exceeds ${HEALTH_BODY_LIMIT} bytes. Next action: Repair the service's /health response or choose another PORT.`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  let health;
  try { health = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new Error('Healthcheck returned invalid JSON.', { cause: error }); }
  return health;
}

export async function checkOperationalHealth(url, signal) {
  const { operationalHealthSchema } = await import('../packages/contracts/src/schemas/health.ts');
  const result = operationalHealthSchema.safeParse(await readHealth(url, '/api/health', signal));
  if (!result.success) throw new Error('Healthcheck returned invalid operational health.');
  return result.data;
}

export async function checkHealth(url, signal) {
  const health = await readHealth(url, '/health', signal);
  if (health?.ok !== true || health?.mode !== 'local' || typeof health?.databasePath !== 'string' || !health.databasePath.trim()) {
    throw new Error('Healthcheck must report ok=true, mode=local and a nonempty databasePath.');
  }
  return health;
}

export function browserCommand(url, platform = process.platform) {
  if (platform === 'win32') return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'linux') return ['xdg-open', [url]];
  throw new Error(`Unsupported browser platform: ${platform}.`);
}

export async function openBrowser(url, env, signal, debug = false) {
  const [command, args] = browserCommand(url);
  const deadline = new AbortController();
  const timeout = setTimeout(() => deadline.abort(new Error('Browser opener did not finish within ten seconds.')), 10_000);
  try {
    await run(command, args, { env, diagnostics: { debug, phase: 'Browser opening', fix: 'Configure the operating system default browser, then run node scripts/start.mjs.' }, signal: AbortSignal.any([deadline.signal, ...(signal ? [signal] : [])]) });
  } finally {
    clearTimeout(timeout);
  }
}
