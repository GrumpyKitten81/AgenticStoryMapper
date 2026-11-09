import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { installRuntimePort, readRuntimePort, runtimeUrl } from '../apps/server/src/config/runtime-port.ts';
import { checkRuntimeDiscovery, repository } from './runtime.mjs';
import { closedWithin, interrupt, listener, port, portClosed, until, withFixture } from './fixtures/checkout.mjs';
import { readToolCallCount } from '../packages/db/src/fixtures/runtime-audit.mjs';

test('occupied default port starts an owned listener, publishes its port and cleans it at shutdown', { timeout: 30_000 }, async () => {
  let foreignRequests = 0;
  const foreign = createServer((request, response) => { foreignRequests++; response.end('foreign service'); });
  await new Promise((resolve, reject) => { foreign.once('error', reject); foreign.listen(4317, '127.0.0.1', resolve); });
  try {
    await withFixture({}, async (f) => {
      const owned = f.launch('start.mjs');
      await until(() => existsSync(f.config.browser.urlFile));
      const runtimeDirectory = dirname(f.env.STORYMAPPER_DB_PATH);
      const record = readRuntimePort(runtimeDirectory);
      assert.notEqual(record.port, 4317);
      const url = readFileSync(f.config.browser.urlFile, 'utf8');
      assert.equal(url, runtimeUrl(record));
      assert.equal((await (await fetch(`${url}/health`)).json()).databasePath, f.env.STORYMAPPER_DB_PATH);
      assert.equal(foreignRequests, 0);
      interrupt(owned, 'SIGTERM');
      const result = await closedWithin(owned);
      assert.equal(result.code, 0, result.output);
      assert.equal(existsSync(join(runtimeDirectory, '.port')), false);
      await portClosed(url);
    });
  } finally { await new Promise((resolve) => foreign.close(resolve)); }
});

test('runtime publication refuses an existing file and shutdown preserves a replacement owner', async () => {
  const require = createRequire(join(repository, 'apps/server/package.json'));
  const Fastify = require('fastify');
  const directory = mkdtempSync(join(tmpdir(), 'storymapper-port-'));
  const server = Fastify();
  const publish = installRuntimePort(server, join(directory, 'storymapper.sqlite'), '127.0.0.1');
  try {
    await server.listen({ port: 0, host: '127.0.0.1' });
    publish();
    assert.throws(publish, { code: 'EEXIST' });
    const record = readRuntimePort(directory);
    writeFileSync(join(directory, '.port'), JSON.stringify({ ...record, owner: 'replacement-owner' }));
    await server.close();
    assert.equal(readRuntimePort(directory).owner, 'replacement-owner');
  } finally { await server.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('owned launcher drains an actual agent HTTP call beyond two seconds before WAL and runtime cleanup', { timeout: 30_000 }, async () => {
  await withFixture({}, async (f) => {
    f.config.slowAgentCalls = true;
    const entered = join(f.directory, 'call-entered');
    const owned = f.launch('start.mjs', [], { env: { PORT: String(await port()), STORYMAPPER_TEST_CALL_ENTERED: entered } });
    await until(() => existsSync(f.config.browser.urlFile));
    const directory = dirname(f.env.STORYMAPPER_DB_PATH);
    const url = runtimeUrl(readRuntimePort(directory));
    const call = fetch(`${url}/api/mcp/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ListProjects', input: {} }) });
    await until(() => existsSync(entered));
    const started = Date.now();
    interrupt(owned, 'SIGTERM');
    assert.equal((await call).status, 200);
    const result = await closedWithin(owned, 8000);
    assert.equal(result.code, 0, result.output);
    assert.ok(Date.now() - started > 2000);
    for (const path of ['.lock', '.port', 'storymapper.sqlite-wal']) assert.equal(existsSync(join(directory, path)), false);
    assert.equal(readToolCallCount(f.env.STORYMAPPER_DB_PATH), 1);
  });
});

test('bridge fails explicitly for missing discovery or a foreign service without creating a database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'storymapper-bridge-'));
  const run = () => spawnSync(process.execPath, [join(repository, 'scripts/mcp-bridge.mjs'), directory], { input: '', encoding: 'utf8', timeout: 15_000 });
  try {
    let result = run();
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /bridge failed:.*ENOENT/);
    const foreign = await listener((request, response) => response.end(JSON.stringify({ ok: true, mode: 'local', databasePath: join(directory, 'foreign', 'storymapper.sqlite'), runtimeDirectory: join(directory, 'foreign') })));
    try {
      writeFileSync(join(directory, '.port'), JSON.stringify({ host: '127.0.0.1', port: foreign.port, owner: 'foreign-owner' }));
      const { spawn } = await import('node:child_process');
      const child = spawn(process.execPath, [join(repository, 'scripts/mcp-bridge.mjs'), directory], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
      assert.equal(code, 1);
      assert.equal(stdout, '');
      assert.match(stderr, /not this Agentic Story Mapper runtime/);
      assert.equal(existsSync(join(directory, 'storymapper.sqlite')), false);
    } finally { await foreign.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('doctor discovery uses stable runtime identity after the active database directory changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'storymapper-runtime-identity-'));
  const service = await listener((request, response) => response.end(JSON.stringify(request.url === '/api/health' ? { version: '0.1.0', schemaVersion: 'fixture', epoch: '5c792608-58d3-41ae-80f0-ab66fc80b609', writeGate: 'available', pendingMigration: null } : { ok: true, mode: 'local', databasePath: join(directory, 'imported.lsm', 'storymapper.sqlite'), runtimeDirectory: directory })));
  try {
    writeFileSync(join(directory, '.port'), JSON.stringify({ host: '127.0.0.1', port: service.port, owner: 'identity-fixture' }));
    await checkRuntimeDiscovery({ HOST: '127.0.0.1', PORT: String(service.port), STORYMAPPER_DB_PATH: join(directory, 'storymapper.sqlite') });
  } finally { await service.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('relative database startup and discovery resolve from the checkout when called elsewhere', async () => {
  await withFixture({ gitRepository: true }, async (f) => {
    const elsewhere = join(f.directory, 'elsewhere');
    mkdirSync(elsewhere);
    const relativePath = join('local-projects', 'relative-fixture.lsm', 'storymapper.sqlite');
    const directory = join(f.root, 'local-projects', 'relative-fixture.lsm');
    const environment = { STORYMAPPER_DB_PATH: relativePath, PORT: String(await port()) };
    const owned = f.launch('start.mjs', [], { cwd: elsewhere, env: environment });
    await until(() => existsSync(f.config.browser.urlFile));
    const url = runtimeUrl(readRuntimePort(directory));
    assert.equal((await (await fetch(`${url}/health`)).json()).databasePath, realpathSync(join(f.root, relativePath)));
    assert.equal(existsSync(join(elsewhere, relativePath)), false);
    assert.equal(existsSync(join(f.root, 'apps/server', relativePath)), false);
    const doctor = await closedWithin(f.launch('doctor.mjs', [], { cwd: elsewhere, env: environment }));
    assert.match(doctor.output, /PASS Runtime port discovery/);
    const health = await (await fetch(`${url}/api/health`)).json();
    assert.ok(doctor.output.includes(`version=${health.version} schema=${health.schemaVersion} epoch=${health.epoch} write-gate=${health.writeGate} pending-migration=unknown`), doctor.output);
    f.config.command = { phase: 'all', mode: 'success' };
    const verified = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build', '--check-health'], { cwd: elsewhere, env: environment }));
    assert.equal(verified.code, 0, verified.output);
    interrupt(owned, 'SIGTERM');
    assert.equal((await closedWithin(owned)).code, 0);
    assert.equal(existsSync(join(directory, '.port')), false);
  });
});
