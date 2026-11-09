import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { buildServer } from '@storymapper/server/server';
import { installRuntimePort } from '@storymapper/server/config/runtime-port';

assert.equal(import.meta.resolve('@storymapper/server/server').endsWith(process.env.FIXTURE_COMPILED === 'true' ? '/server.js' : '/server.ts'), true);
const server = await buildServer({ development: true });
const publish = installRuntimePort(server, process.env.STORYMAPPER_DB_PATH, '127.0.0.1');
const base = await server.listen({ host: '127.0.0.1', port: 0 });
publish();
const initialization = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'version-contract', version: '1.0.0' } } };

async function bridgeVersion() {
  const child = spawn(process.execPath, [join(process.env.FIXTURE_ROOT, 'scripts/mcp-bridge.mjs'), dirname(process.env.STORYMAPPER_DB_PATH)], { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '' } });
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8192); });
  const failure = new Promise((resolve, reject) => {
    const failed = (error) => reject(new Error(`Version fixture could not run the MCP bridge. Repair scripts/mcp-bridge.mjs and retry: ${error.message}`, { cause: error }));
    child.once('error', failed);
    child.stdin.once('error', failed);
  });
  const lines = createInterface({ input: child.stdout });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
  try {
    const response = once(lines, 'line');
    child.stdin.write(`${JSON.stringify(initialization)}\n`);
    const [line] = await Promise.race([response, failure, closed.then(({ code, signal }) => {
      throw new Error(`MCP bridge closed before initialization (code ${code}, signal ${signal}). Repair scripts/mcp-bridge.mjs and retry. ${stderr}`);
    })]);
    const message = JSON.parse(line);
    assert.equal(message.id, 1);
    return message.result.serverInfo.version;
  } finally {
    lines.close();
    child.stdin.end();
    await closed;
    clearTimeout(timer);
  }
}

try {
  const health = await (await fetch(`${base}/api/health`)).json();
  const liveness = await (await fetch(`${base}/health`)).json();
  const { projects } = await (await fetch(`${base}/api/projects`)).json();
  const archive = await fetch(`${base}/api/projects/export?projectId=${projects[0].id}`);
  assert.equal(archive.status, 200);
  const require = createRequire(join(process.env.FIXTURE_ROOT, 'apps/server/package.json'));
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(Buffer.from(await archive.arrayBuffer()));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(initialization) });
  assert.equal(response.status, 200);
  const mcp = await response.json();
  const stdio = await bridgeVersion();
  process.stdout.write(`${JSON.stringify({ health: health.version, archive: manifest.appVersion, http: mcp.result.serverInfo.version, stdio, liveness })}\n`);
} finally { await server.close(); }
