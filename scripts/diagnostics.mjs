import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { failure, nativeFailure, portFailure } from '../apps/server/src/config/failures.mjs';
import { checkHealth, repository } from './runtime.mjs';
import { probeNativeSqlite } from '../packages/db/src/native-probe.mjs';

export function commandOptions(name) {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg !== '--debug') throw failure(`Unknown ${name} argument.`, `Use node scripts/${name}.mjs with only the optional --debug flag.`);
  }
  return { debug: args.includes('--debug') };
}

export function checkDependencies() {
  const folders = ['apps/server', 'apps/web', ...readdirSync(join(repository, 'packages'), { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => `packages/${item.name}`)];
  for (const folder of folders) {
    const manifestPath = join(repository, folder, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const require = createRequire(manifestPath);
    const imports = packageImports(folder);
    const dependencies = { ...manifest.dependencies, ...(folder === 'apps/web' ? manifest.devDependencies : {}) };
    for (const [name, version] of Object.entries(dependencies)) {
      if (version.startsWith('workspace:')) continue;
      const metadataPath = require.resolve.paths(name)?.map((directory) => join(directory, name, 'package.json')).find(existsSync);
      if (!metadataPath || !dependencyEntriesPresent(require, name, metadataPath, imports)) throw failure(`Installed dependencies are missing or incomplete: ${name} in ${folder}.`, 'Run node scripts/setup.mjs before starting Agentic Story Mapper.');
    }
  }
}

export function readableFile(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.R_OK);
    return true;
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    return false;
  }
}

function packageImports(folder) {
  const source = join(repository, folder, 'src');
  if (!existsSync(source)) return new Set();
  return new Set(readdirSync(source, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.(?:tsx?|mjs)$/.test(entry.name)).flatMap((entry) => [...readFileSync(join(entry.parentPath, entry.name), 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)["']([^"']+)["']/g)].map((match) => match[1])));
}

function runtimeExportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).filter(([condition]) => ['node', 'import', 'require', 'default'].includes(condition) || condition.startsWith('./')).flatMap(([, target]) => runtimeExportTargets(target));
}

function dependencyEntriesPresent(require, name, metadataPath, imports) {
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const directory = dirname(metadataPath);
    if (name.startsWith('@types/')) return readableFile(join(directory, metadata.types ?? 'index.d.ts'));
    const subpaths = metadata.exports && typeof metadata.exports === 'object' ? Object.keys(metadata.exports).filter((key) => key.startsWith('./') && !key.includes('*')) : [];
    const required = [...imports].filter((entry) => entry === name || entry.startsWith(`${name}/`));
    const entries = required.length ? required : subpaths.length && !metadata.exports['.'] ? subpaths.map((key) => name + key.slice(1)) : [name];
    return entries.every((entry) => readableFile(require.resolve(entry)) && exportedTargets(metadata.exports, entry.slice(name.length) || '.').every((target) => readableFile(join(directory, target))));
  } catch (error) {
    if (!(error instanceof SyntaxError) && !['MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_INVALID_PACKAGE_CONFIG', 'ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EISDIR'].includes(error.code)) throw error;
    return false;
  }
}

function exportedTargets(exports, suffix) {
  if (!exports) return [];
  const key = suffix === '.' ? '.' : `.${suffix}`;
  if (typeof exports === 'string' || !Object.keys(exports).some((item) => item.startsWith('.'))) return runtimeExportTargets(exports);
  if (exports[key]) return runtimeExportTargets(exports[key]);
  for (const [pattern, target] of Object.entries(exports)) {
    const [prefix, ending] = pattern.split('*');
    if (ending === undefined || !key.startsWith(prefix) || !key.endsWith(ending)) continue;
    const match = key.slice(prefix.length, ending.length ? -ending.length : undefined);
    return runtimeExportTargets(target).map((path) => path.replace('*', match));
  }
  return [];
}

export function webBuildPresent() {
  return readableFile(join(repository, 'apps/web/dist/index.html'));
}

export function checkNative() {
  try {
    probeNativeSqlite();
  } catch (error) {
    throw nativeFailure(error);
  }
}

export async function portAvailable({ host, port }) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, resolve);
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function inspectHealth(url, signal) {
  try {
    await checkHealth(url, signal);
    return { holder: 'an Agentic Story Mapper-compatible service', message: '/health PASS: HTTP 200, valid local health response.' };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    const message = error.message.startsWith('Healthcheck') ? error.message : ['TimeoutError', 'AbortError'].includes(error.name) ? 'Request timed out after two seconds.' : 'No valid HTTP health response.';
    return { holder: 'unknown process', message: `/health FAIL: ${message}`, error };
  }
}

export async function checkPort(config, signal) {
  try { await portAvailable(config); }
  catch (error) {
    if (error.code !== 'EADDRINUSE') throw failure(`Configured port ${config.port} could not be checked.`, 'Check the loopback HOST and PORT in the optional .env.', error);
    const health = await inspectHealth(config.url, signal);
    const occupied = portFailure(config.port, health.holder, error);
    occupied.health = health;
    throw occupied;
  }
}

export function buildDiagnostics(debug) {
  return { debug, phase: 'Web build', fix: 'Run node scripts/setup.mjs --debug and repair the reported web build error.' };
}
