import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { fixture } from './fixtures/checkout.mjs';
import { repository, corepackEntry } from './runtime.mjs';

before(() => {
  const result = spawnSync(process.execPath, [corepackEntry(), 'pnpm', '--filter', '@storymapper/server', 'build'], { cwd: repository, encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

function versionFixture(compiled) {
  const f = fixture({ built: false });
  cpSync(join(repository, 'apps/server/src/app-version.ts'), join(f.root, 'apps/server/src/app-version.ts'));
  mkdirSync(join(f.root, 'apps/server/src/fixtures'), { recursive: true });
  cpSync(join(repository, 'apps/server/src/fixtures/app-version.mjs'), join(f.root, 'apps/server/src/fixtures/app-version.mjs'));
  if (compiled) {
    cpSync(join(repository, 'apps/server/dist'), join(f.root, 'apps/server/dist'), { recursive: true });
    cpSync(join(repository, 'apps/server/src/config/failures.mjs'), join(f.root, 'apps/server/dist/apps/server/src/config/failures.mjs'));
    for (const name of ['contracts', 'core', 'db', 'github', 'importers', 'mcp']) {
      const target = join(f.root, 'apps/server/dist/packages', name);
      mkdirSync(target, { recursive: true });
      symlinkSync(join(repository, 'packages', name, 'node_modules'), join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    const config = JSON.parse(readFileSync(join(f.root, 'tsconfig.base.json'), 'utf8'));
    for (const [name, paths] of Object.entries(config.compilerOptions.paths)) config.compilerOptions.paths[name] = paths.map((path) => `apps/server/dist/${path.replace(/\.ts$/, '.js')}`);
    writeFileSync(join(f.root, 'tsconfig.base.json'), JSON.stringify(config));
  }
  const require = createRequire(join(repository, 'apps/server/package.json'));
  const command = () => spawnSync(process.execPath, [require.resolve('tsx/cli'), '--tsconfig', join(f.root, 'apps/server/tsconfig.json'), join(f.root, 'apps/server/src/fixtures/app-version.mjs')], { cwd: f.directory, env: { ...f.env, NODE_OPTIONS: '', FIXTURE_ROOT: f.root, FIXTURE_COMPILED: String(compiled) }, encoding: 'utf8', timeout: 30_000 });
  return { ...f, command };
}

for (const compiled of [false, true]) {
  test(`actual ${compiled ? 'compiled' : 'source'} health, archive, HTTP and stdio MCP use root metadata`, async () => {
    const f = versionFixture(compiled);
    try {
      const root = JSON.parse(readFileSync(join(f.root, 'package.json'), 'utf8'));
      root.version = '8.8.42-rc.3+contract';
      writeFileSync(join(f.root, 'package.json'), JSON.stringify(root));
      const result = f.command();
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const surfaces = JSON.parse(result.stdout.trim());
      for (const name of ['health', 'archive', 'http', 'stdio']) assert.equal(surfaces[name], root.version, name);
      assert.equal(surfaces.liveness.ok, true);
      assert.equal(surfaces.liveness.mode, 'local');
      assert.equal('version' in surfaces.liveness, false);
    } finally { await f.cleanup(); }
  });

  test(`${compiled ? 'compiled' : 'source'} reports bridge failure promptly before initialization`, async () => {
    const f = versionFixture(compiled);
    try {
      cpSync(join(repository, 'scripts/fixtures/app-version-bridge-failure.mjs'), join(f.root, 'scripts/mcp-bridge.mjs'));
      const started = Date.now();
      const result = f.command();
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.notEqual(result.status, null);
      assert.ok(Date.now() - started < 20_000, 'Bridge failure must precede the child timeout.');
      assert.match(result.stderr, /MCP bridge closed before initialization \(code 23, signal null\)/);
      assert.match(result.stderr, /Repair scripts\/mcp-bridge.mjs and retry/);
      assert.match(result.stderr, /Version bridge failure fixture: initialization unavailable/);
    } finally { await f.cleanup(); }
  });

  for (const [name, metadata, message] of [
    ['missing', undefined, 'cannot be read'], ['JSON', '{', 'invalid JSON'],
    ['identity', { name: 'different', version: '1.2.3' }, 'identity is invalid'],
    ['version', { name: 'storymapper', version: '1.2.3-01' }, 'version is invalid'],
    ['absent version', { name: 'storymapper' }, 'version is invalid'],
    ['overlong version', { name: 'storymapper', version: `1.2.3+${'a'.repeat(59)}` }, 'version is invalid']
  ]) test(`${compiled ? 'compiled' : 'source'} refuses ${name} root metadata with a repair action`, async () => {
    const f = versionFixture(compiled);
    try {
      const path = join(f.root, 'package.json');
      if (metadata === undefined) rmSync(path);
      else writeFileSync(path, typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
      const result = f.command();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(message));
      assert.match(result.stderr, /Restore the Agentic Story Mapper root package.json/);
    } finally { await f.cleanup(); }
  });
}
