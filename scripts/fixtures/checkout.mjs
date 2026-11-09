import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { before } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { repository, runtime } from '../runtime.mjs';
import { stopProcess } from '../processes.mjs';

const preload = new URL('./preload.mjs', import.meta.url).href;

before(async () => {
  if (!existsSync(join(repository, 'apps/web/dist/index.html'))) {
    const { pnpm } = await runtime();
    await pnpm(['--filter', '@storymapper/web', 'build']);
  }
});

export function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

export function fixture({ fresh = false, built = true, gitRepository = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'storymapper-scripts-'));
  const root = join(directory, 'checkout');
  if (gitRepository) git(directory, ['clone', '--shared', '--no-checkout', repository, root]);
  else mkdirSync(root);
  copyCheckout(root, fresh, built);
  const configPath = join(directory, 'config.json');
  const config = { browser: { urlFile: join(directory, 'browser-url') }, processesFile: join(directory, 'processes.jsonl') };
  const children = [];
  const env = { ...process.env, HOST: '127.0.0.1', STORYMAPPER_ALLOW_REMOTE_HOST: 'false', STORYMAPPER_DB_PATH: join(directory, 'data', 'storymapper.sqlite'), LOG_LEVEL: 'error', STORYMAPPER_TEST_CONFIG: configPath, NODE_OPTIONS: `--import=${JSON.stringify(preload)}` };
  delete env.PORT;
  const launch = (script, args = [], extra = {}) => {
    writeFileSync(configPath, JSON.stringify(config));
    const childEnv = { ...env, ...extra.env };
    for (const name of extra.removeEnv ?? []) delete childEnv[name];
    const entry = extra.directServer ? ['--import', pathToFileURL(createRequire(join(root, 'apps/server/package.json')).resolve('tsx')).href, join(root, 'apps/server/src/main.ts')] : [join(root, 'scripts', script)];
    const child = spawn(process.execPath, [...entry, ...args], { cwd: extra.cwd ?? root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe', ...(extra.directServer && !extra.ipc ? [] : ['ipc'])], detached: process.platform !== 'win32' });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal, output }));
    });
    const owned = { child, closed, get output() { return output; } };
    children.push(owned);
    return owned;
  };
  return { root, directory, config, env, launch, cleanup: () => cleanupFixture(children, config, directory) };
}

export function interrupt(owned, signal) {
  if (process.platform === 'win32') owned.child.send({ type: 'test-interrupt', signal });
  else owned.child.kill(signal);
}

export function ownedServerPid(f) {
  return readFileSync(f.config.processesFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).find(({ role }) => role === 'server').pid;
}

export function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code !== 'ESRCH') throw error; return false; }
}

export async function until(predicate, milliseconds = 20_000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) {
    if (await predicate()) return;
    await setTimeout(50);
  }
  assert.fail(`Condition did not complete within ${milliseconds}ms.`);
}

export async function closedWithin(owned, milliseconds = 15_000) {
  let deadline;
  try {
    return await Promise.race([owned.closed, new Promise((resolve, reject) => { deadline = globalThis.setTimeout(() => reject(new Error('Command did not exit within bound.')), milliseconds); })]);
  } finally { clearTimeout(deadline); }
}

export async function listener(handler, host = '127.0.0.1') {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve); });
  return { server, port: server.address().port, async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}

export async function port(host = '127.0.0.1') {
  const reservation = await listener(() => {}, host);
  const value = reservation.port;
  await reservation.close();
  return value;
}

export async function portClosed(origin) {
  const { hostname, port } = new URL(origin);
  await until(() => new Promise((resolve, reject) => {
    const socket = createConnection({ host: hostname.replace(/^\[|\]$/g, ''), port: Number(port) });
    const finish = (closed, error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve(closed);
    };
    socket.once('connect', () => finish(false));
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') finish(true);
      else if (error.code === 'ECONNRESET') finish(false);
      else finish(false, error);
    });
    socket.setTimeout(500, () => finish(false, new Error('Port-closure connection did not complete within 500ms.')));
  }), 8000);
}

export async function withFixture(options, inspect) {
  const f = fixture(options);
  try { await inspect(f); } finally { await f.cleanup(); }
}

function copyCheckout(root, fresh, built) {
  const files = git(repository, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter((path) => path && (/^(apps\/|packages\/|patches\/|[^/]+$)/.test(path) || path === 'docs/story-map-levels-and-issues.md') && !path.startsWith('.env') && !path.endsWith('.sqlite'));
  for (const path of files) {
    const source = join(repository, path);
    if (!existsSync(source)) continue;
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  cpSync(join(repository, 'scripts'), join(root, 'scripts'), { recursive: true });
  cpSync(join(repository, 'apps/server/src/config'), join(root, 'apps/server/src/config'), { recursive: true });
  writeFileSync(join(root, '.env.example'), '');
  if (!fresh) {
    for (const path of ['node_modules', 'apps/server/node_modules', 'apps/web/node_modules', ...['contracts', 'core', 'db', 'github', 'importers', 'mcp'].map((name) => `packages/${name}/node_modules`)]) {
      symlinkSync(join(repository, path), join(root, path), process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
  if (built) cpSync(join(repository, 'apps/web/dist'), join(root, 'apps/web/dist'), { recursive: true });
}

async function cleanupFixture(children, config, directory) {
    const stopping = Promise.allSettled(children.map((owned) => closedWithin({ closed: stopProcess(owned) }, 8000)));
    const processes = existsSync(config.processesFile) ? readFileSync(config.processesFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
    for (const { pid, detached } of processes) {
      if (!alive(pid)) continue;
      if (process.platform === 'win32') {
        const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
        assert.ok(result.status === 0 || !alive(pid));
      } else {
        try { process.kill(detached ? -pid : pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error; }
      }
    }
    await until(() => processes.every(({ pid }) => !alive(pid)), 5000);
    for (const path of [config.command?.pidFile, config.command?.descendantFile, config.browser.pidFile, config.browser.descendantFile, config.server?.pidFile]) {
      if (path && existsSync(path)) {
        const pid = Number(readFileSync(path, 'utf8'));
        if (alive(pid)) {
          if (process.platform === 'win32') {
            const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
            assert.equal(result.status, 0);
          } else process.kill(pid, 'SIGKILL');
        }
      }
    }
    const stopped = await stopping;
    for (const owned of children) await closedWithin(owned, 5000);
    rmSync(directory, { recursive: true, force: true });
    for (const result of stopped) if (result.status === 'rejected') throw result.reason;
}
