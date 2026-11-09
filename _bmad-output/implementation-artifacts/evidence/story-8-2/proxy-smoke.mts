import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildServer } from '@storymapper/server/server';
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository } from '@storymapper/db';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const requireWeb = createRequire(join(root, 'apps/web/package.json'));
const { createServer } = await import(requireWeb.resolve('vite'));
const directory = mkdtempSync(join(tmpdir(), 'story82-proxy-'));
const databasePath = join(directory, 'smoke.lsm/storymapper.sqlite');
process.env.STORYMAPPER_DB_PATH = databasePath;
process.env.LOG_LEVEL = 'error';
let server: Awaited<ReturnType<typeof buildServer>> | undefined;
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
const statuses: Record<string, number> = {};
try {
  server = await buildServer({ development: true, runtimeConfig: { host: '127.0.0.1', port: 4317, allowRemoteHost: false } });
  await server.listen({ host: '127.0.0.1', port: 4317 });
  vite = await createServer({ root: join(root, 'apps/web'), configFile: join(root, 'apps/web/vite.config.ts'), server: { host: '127.0.0.1', port: 5173, strictPort: true } });
  await vite.listen();
  const apiAddress = server.server.address();
  const viteAddress = vite.httpServer?.address();
  assert.ok(apiAddress && typeof apiAddress !== 'string');
  assert.ok(viteAddress && typeof viteAddress !== 'string');
  assert.equal(apiAddress.address, '127.0.0.1');
  assert.equal(viteAddress.address, '127.0.0.1');
  for (const path of ['/health', '/api/projects', '/', '/story-maps/proxy-smoke/tree']) {
    const response = await fetch(`http://127.0.0.1:5173${path}`, { signal: AbortSignal.timeout(2000) });
    statuses[path] = response.status;
    assert.equal(response.status, 200);
    if (path === '/health') assert.equal((await response.json()).ok, true);
    else if (path === '/api/projects') {
      const direct = await fetch(`http://127.0.0.1:4317${path}`, { signal: AbortSignal.timeout(2000) });
      assert.deepEqual(await response.json(), await direct.json());
    } else assert.match(await response.text(), /<div id="root"><\/div>/);
  }
  const entry = await fetch('http://127.0.0.1:5173/src/main.tsx', { signal: AbortSignal.timeout(5000) });
  assert.equal(entry.status, 200);
  await entry.text();
  await vite.waitForRequestsIdle();
  const optimizer = vite.environments.client.depsOptimizer;
  assert.ok(optimizer);
  await optimizer.scanProcessing;
  await Promise.all(optimizer.metadata.depInfoList.map((dependency) => dependency.processing));
  await vite.close();
  vite = undefined;
  await server.close();
  server = undefined;
  const reopened = openStoryMapperDb(databasePath);
  try { assert.ok(new StoryMapperRepository(new DatabaseHandle(reopened)).listProjects().length > 0); }
  finally { reopened.$client.close(); }
  process.stdout.write(`${JSON.stringify({ statuses, loopback: true, nativeOpenReopen: true })}\n`);
} finally {
  try { await vite?.close(); }
  finally {
    try { await server?.close(); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
}
