import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { closedWithin, interrupt, listener, port, portClosed, until, withFixture } from './fixtures/checkout.mjs';

function checkoutSnapshot(root) {
  const result = {};
  function visit(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isSymbolicLink()) result[path] = readlinkSync(path);
      else if (item.isDirectory()) {
        result[path] = [statSync(path).mtimeMs, statSync(path).mode];
        visit(path);
      }
      else result[path] = [statSync(path).mtimeMs, readFileSync(path).toString('base64')];
    }
  }
  visit(root);
  return result;
}

function assertSevenChecks(output) {
  const rows = output.split('\n').filter((line) => /^(PASS|FAIL) (Node version|Corepack availability|Configured port free|Runtime port discovery|Installed dependencies|Native module loads|Web build present)/.test(line));
  assert.equal(rows.length, 7, output);
}

function privateDependency(f, folder, name) {
  const modules = join(f.root, folder, 'node_modules');
  const source = realpathSync(modules);
  unlinkSync(modules);
  mkdirSync(modules);
  for (const entry of readdirSync(source)) {
    if (entry !== name) symlinkSync(join(source, entry), join(modules, entry), process.platform === 'win32' ? 'junction' : 'dir');
  }
  const privatePackage = join(modules, name);
  cpSync(realpathSync(join(source, name)), privatePackage, { recursive: true });
  return privatePackage;
}

test('doctor before setup collects independent failures without writes or Corepack downloads', async () => {
  await withFixture({ fresh: true, built: false }, async (f) => {
    f.config.nodeVersion = '22.0.0';
    const snapshot = checkoutSnapshot(f.root);
    const result = await closedWithin(f.launch('doctor.mjs', [], { env: { PATH: '', PORT: String(await port()) } }));
    assert.equal(result.code, 1, result.output);
    assertSevenChecks(result.output);
    assert.match(result.output, /FAIL Node version:.*>=24 <25.*found 22.0.0/);
    assert.match(result.output, /https:\/\/nodejs.org\/en\/download/);
    assert.match(result.output, /FAIL Corepack availability:.*Next action:/);
    assert.match(result.output, /FAIL Installed dependencies:.*node scripts\/setup.mjs/);
    assert.match(result.output, /FAIL Native module loads:.*rebuild better-sqlite3/);
    assert.match(result.output, /FAIL Web build present:.*node scripts\/setup.mjs/);
    assert.equal(existsSync(f.config.processesFile), false);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    assert.deepEqual(checkoutSnapshot(f.root), snapshot);
  });
});

test('doctor on installed checkout passes seven checks read-only without opening Project data', async () => {
  await withFixture({}, async (f) => {
    const snapshot = checkoutSnapshot(f.root);
    const result = await closedWithin(f.launch('doctor.mjs', [], { env: { PORT: String(await port()) } }));
    assert.equal(result.code, 0, result.output);
    assertSevenChecks(result.output);
    assert.equal(result.output.split('\n').filter((line) => line.startsWith('PASS ')).length, 7);
    const checks = readFileSync(f.config.processesFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(checks.map(({ args }) => args.slice(1)), [['--version']]);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    assert.deepEqual(checkoutSnapshot(f.root), snapshot);
  });
});

test('doctor reports healthy, unhealthy, malformed, stalled, oversized and redirected occupied services within a bound', { timeout: 30_000 }, async () => {
  for (const variant of ['healthy', 'unhealthy', 'invalid-json', 'null', 'http-error', 'stalled', 'stalled-body', 'oversized', 'redirect']) {
    let requests = 0;
    const occupied = await listener((request, response) => {
      requests++;
      if (variant === 'stalled') return;
      if (variant === 'stalled-body') {
        response.writeHead(200);
        response.write('{');
        return;
      }
      if (variant === 'http-error') response.writeHead(503);
      if (variant === 'redirect') response.writeHead(302, { location: 'https://example.invalid/remote' });
      if (variant === 'oversized') return response.end(JSON.stringify({ ok: true, mode: 'local', databasePath: 'fixture.sqlite', padding: 'x'.repeat(2 * 1024 * 1024) }));
      response.end(variant === 'invalid-json' ? 'malformed' : variant === 'null' ? 'null' : JSON.stringify({ ok: variant === 'healthy', mode: 'local', databasePath: 'fixture.sqlite' }));
    });
    try {
      await withFixture({}, async (f) => {
        const snapshot = checkoutSnapshot(f.root);
        const result = await closedWithin(f.launch('doctor.mjs', [], { env: { PORT: String(occupied.port) } }), 7000);
        assert.equal(result.code, 1, result.output);
        assertSevenChecks(result.output);
        assert.match(result.output, new RegExp(`FAIL Configured port free:.*Port ${occupied.port}.*Next action:.*PORT`));
        assert.match(result.output, variant === 'healthy' ? /Agentic Story Mapper-compatible service.*\n\/health PASS/ : /unknown process.*\n\/health FAIL/);
        if (variant === 'http-error') assert.match(result.output, /HTTP 503/);
        if (variant === 'redirect') assert.match(result.output, /HTTP 302/);
        if (variant === 'invalid-json') assert.match(result.output, /invalid JSON/);
        if (variant === 'oversized') assert.match(result.output, /Healthcheck body exceeds 16384 bytes.*Next action:/);
        if (variant.startsWith('stalled')) assert.match(result.output, /timed out after two seconds/);
        assert.equal(requests, 1);
        assert.equal(occupied.server.listening, true);
        assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
        assert.deepEqual(checkoutSnapshot(f.root), snapshot);
      });
    } finally {
      occupied.server.closeAllConnections();
      await occupied.close();
    }
  }
});

test('public commands validate flags and keep default failures free of diagnostic traces', async () => {
  for (const script of ['setup.mjs', 'start.mjs', 'doctor.mjs']) {
    await withFixture({}, async (f) => {
      const result = await closedWithin(f.launch(script, ['--unknown']));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Unknown .* argument.*Next action:.*--debug/);
      assert.doesNotMatch(result.output, /\n\s+at /);
      assert.equal(existsSync(f.config.processesFile), false);
      f.config.nodeVersion = '25.0.0';
      const debug = await closedWithin(f.launch(script, ['--debug'], { env: { PORT: String(await port()) } }));
      assert.equal(debug.code, 1, debug.output);
      assert.match(debug.output, /Node 24 is required.*found 25.0.0/);
      assert.match(debug.output, /\n\s+at /);
      if (script === 'doctor.mjs') assertSevenChecks(debug.output);
    });
  }
});

test('native binding failures stop start before DB or browser and remain diagnosable in doctor', async () => {
  for (const debug of [false, true]) {
    await withFixture({}, async (f) => {
      f.config.nativeFailure = 'Fixture native binding failure';
      for (const script of ['start.mjs', 'doctor.mjs']) {
        const result = await closedWithin(f.launch(script, debug ? ['--debug'] : [], { env: { PORT: String(await port()) } }));
        assert.equal(result.code, 1, result.output);
        assert.match(result.output, /better-sqlite3 could not load its native binding.*Next action:.*same installed Node 24.*corepack pnpm --filter @storymapper\/db rebuild better-sqlite3/);
        if (debug) assert.match(result.output, /Fixture native binding failure.*\n\s+at /);
        else assert.doesNotMatch(result.output, /Fixture native binding failure|\n\s+at /);
        if (script === 'doctor.mjs') assertSevenChecks(result.output);
        assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
        assert.equal(existsSync(f.config.browser.urlFile), false);
      }
    });
  }
});

test('setup child diagnostics identify phase and redact credentials in normal and debug output', async () => {
  for (const debug of [false, true]) {
    await withFixture({ built: false }, async (f) => {
      f.config.command = { phase: 'install', mode: 'fail', details: 'ERR_PNPM_UNEXPECTED_STORE\nError: diagnostic-private-value\n    at fixtureInstall (fixture:1:1)\n{"password":"fixture-private-password"}\nAuthorization: Bearer fixture-private-authorization' };
      const result = await closedWithin(f.launch('setup.mjs', debug ? ['--debug'] : [], { env: { DIAGNOSTIC_PASSWORD: 'diagnostic-private-value' } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Dependency installation failed.*ERR_PNPM_UNEXPECTED_STORE.*Next action: Use the same Corepack\/pnpm store configuration that installed node_modules/);
      assert.doesNotMatch(result.output, /diagnostic-private-value/);
      assert.doesNotMatch(result.output, /fixture-private-password|fixture-private-authorization/);
      if (debug) assert.match(result.output, /\[redacted\].*\n\s+at fixtureInstall/);
      else assert.doesNotMatch(result.output, /\n\s+at /);
      assert.equal(existsSync(join(f.root, 'apps/web/dist/index.html')), false);
      assert.equal(existsSync(join(f.root, 'local-projects/default.lsm')), false);
    });
  }
});

test('setup redacts credentials split across UTF-8 byte chunks on stdout and stderr', async () => {
  for (const stream of ['stdout', 'stderr']) {
    for (const debug of [false, true]) {
      await withFixture({ built: false }, async (f) => {
        const secret = 'synthetic-\u4e2d\u6587-secret';
        const bytes = Buffer.from(`Error: ${stream} ${secret}\n`);
        const split = Buffer.byteLength(`Error: ${stream} synthetic-`) + 1;
        f.config.command = { phase: 'build', mode: 'fail', [`${stream}Chunks`]: [Array.from(bytes.subarray(0, split)), Array.from(bytes.subarray(split))] };
        const result = await closedWithin(f.launch('setup.mjs', debug ? ['--debug'] : [], { env: { DIAGNOSTIC_SECRET: secret } }));
        assert.equal(result.code, 1, result.output);
        assert.match(result.output, new RegExp(`Web build failed.*Error: ${stream} \\[redacted\\].*Next action:`));
        assert.doesNotMatch(result.output, /synthetic-|\ufffd/);
      });
    }
  }
});

test('doctor and start use process, root and nearest server env precedence from unrelated cwd', async () => {
  const occupied = await listener((request, response) => response.end(JSON.stringify({ ok: true, mode: 'local', databasePath: 'fixture.sqlite' })));
  try {
    await withFixture({}, async (f) => {
      const elsewhere = join(f.directory, 'elsewhere');
      mkdirSync(elsewhere);
      writeFileSync(join(elsewhere, '.env'), 'PORT=0\n');
      writeFileSync(join(f.root, 'apps/server/.env'), `PORT=${occupied.port}\nHOST=127.0.0.1\n`);
      let result = await closedWithin(f.launch('doctor.mjs', [], { cwd: elsewhere }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, new RegExp(`Port ${occupied.port} is occupied`));
      writeFileSync(join(f.root, '.env'), `PORT=${await port()}\n`);
      result = await closedWithin(f.launch('doctor.mjs', [], { cwd: elsewhere }));
      assert.equal(result.code, 0, result.output);
      result = await closedWithin(f.launch('doctor.mjs', [], { cwd: elsewhere, env: { PORT: String(occupied.port) } }));
      assert.equal(result.code, 1, result.output);
      result = await closedWithin(f.launch('start.mjs', [], { cwd: elsewhere, env: { PORT: String(occupied.port) } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Agentic Story Mapper-compatible service.*Next action:.*PORT/);
      assert.match(result.output, /process PORT override.*takes precedence over .env/);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
      assert.equal(existsSync(f.config.browser.urlFile), false);
    });
  } finally { await occupied.close(); }
});

test('server database startup failure is reported at the launcher boundary without a default stack', async () => {
  for (const debug of [false, true]) {
    await withFixture({}, async (f) => {
      writeFileSync(join(f.directory, 'data'), '');
      const result = await closedWithin(f.launch('start.mjs', debug ? ['--debug'] : [], { env: { PORT: String(await port()) } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Project database directory cannot be opened:.*data.*Next action:.*writable directory.*STORYMAPPER_DB_PATH/);
      if (debug) assert.match(result.output, /\n\s+at /);
      else assert.doesNotMatch(result.output, /\n\s+at |"stack":/);
      assert.equal(existsSync(f.config.browser.urlFile), false);
    });
  }
});

test('bind race is reported through real server IPC with actionable cause and no browser', async () => {
  await withFixture({}, async (f) => {
    f.config.bindRace = true;
    const value = await port();
    const result = await closedWithin(f.launch('start.mjs', [], { env: { PORT: String(value) } }));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, new RegExp(`Port ${value} is occupied by unknown process.*Next action:.*PORT`));
    assert.doesNotMatch(result.output, /\n\s+at |"stack":/);
    assert.equal(existsSync(f.config.browser.urlFile), false);
  });
});

test('direct server startup catches configuration, binding and native failures in normal and debug mode', async () => {
  const occupied = await listener((request, response) => response.end('unrelated service'));
  try {
    for (const variant of ['config', 'bind', 'native']) {
      for (const debug of [false, true]) {
        await withFixture({}, async (f) => {
          if (variant === 'native') f.config.nativeFailure = 'better-sqlite3 fixture native binding failure';
          const value = variant === 'config' ? '0' : variant === 'bind' ? String(occupied.port) : String(await port());
          const result = await closedWithin(f.launch('', debug ? ['--debug'] : [], { directServer: true, cwd: join(f.root, 'apps/server'), env: { PORT: value } }));
          assert.equal(result.code, 1, result.output);
          assert.match(result.output, /Next action:/);
          if (variant === 'config') assert.match(result.output, /PORT must be a number.*Next action: Set HOST to a loopback address and PORT/);
          if (variant === 'bind') assert.match(result.output, /occupied by unknown process/);
          if (variant === 'native') assert.match(result.output, /corepack pnpm --filter @storymapper\/db rebuild better-sqlite3/);
          if (debug) assert.match(result.output, /\n\s+at /);
          else assert.doesNotMatch(result.output, /\n\s+at |"stack":/);
          assert.equal(occupied.server.listening, true);
          assert.equal(existsSync(f.config.browser.urlFile), false);
        });
      }
    }
  } finally { await occupied.close(); }
});

test('direct server flushes a large startup diagnostic to piped stderr before exiting', async () => {
  await withFixture({}, async (f) => {
    f.config.nativeFailure = `better-sqlite3 fixture native binding failure ${'diagnostic-padding '.repeat(16 * 1024)} diagnostic-end-marker`;
    const result = await closedWithin(f.launch('', ['--debug'], { directServer: true, cwd: join(f.root, 'apps/server'), env: { PORT: String(await port()) } }));
    assert.equal(result.code, 1);
    assert.match(result.output, /corepack pnpm --filter @storymapper\/db rebuild better-sqlite3/);
    assert.match(result.output, /diagnostic-end-marker\n\s+at /);
    assert.equal(result.output.endsWith('\n'), true);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
  });
});

test('doctor rejects an empty local Corepack entry while collecting seven checks without cache writes', async () => {
  await withFixture({}, async (f) => {
    const bin = join(f.directory, 'bin');
    mkdirSync(bin);
    const entry = process.platform === 'win32' ? join(bin, 'node_modules/corepack/dist/corepack.js') : join(bin, 'corepack');
    mkdirSync(join(bin, 'node_modules/corepack/dist'), { recursive: true });
    writeFileSync(entry, '');
    if (process.platform === 'win32') writeFileSync(join(bin, 'corepack.cmd'), '');
    const cache = join(f.directory, 'corepack-cache');
    const snapshot = checkoutSnapshot(f.root);
    const result = await closedWithin(f.launch('doctor.mjs', [], { env: { PATH: bin, COREPACK_HOME: cache, PORT: String(await port()) } }));
    assert.equal(result.code, 1, result.output);
    assertSevenChecks(result.output);
    assert.match(result.output, /FAIL Corepack availability:.*Corepack did not report a valid version.*Next action:/);
    assert.equal(existsSync(cache), false);
    assert.deepEqual(checkoutSnapshot(f.root), snapshot);
  });
});

test('doctor rejects missing CommonJS entries and imported ESM subpath targets with intact CommonJS counterparts', async () => {
  for (const name of ['fastify', 'drizzle-orm']) {
    await withFixture({}, async (f) => {
      const privatePackage = privateDependency(f, name === 'fastify' ? 'apps/server' : 'packages/db', name);
      const metadata = JSON.parse(readFileSync(join(privatePackage, 'package.json'), 'utf8'));
      if (name === 'fastify') unlinkSync(join(privatePackage, metadata.main));
      else {
        const target = metadata.exports['./better-sqlite3'];
        unlinkSync(join(privatePackage, target.import.default));
        assert.equal(existsSync(join(privatePackage, target.require.default)), true);
      }
      const snapshot = checkoutSnapshot(f.root);
      const result = await closedWithin(f.launch('doctor.mjs', [], { env: { PORT: String(await port()) } }));
      assert.equal(result.code, 1, result.output);
      assertSevenChecks(result.output);
      assert.match(result.output, new RegExp(`FAIL Installed dependencies:.*incomplete: ${name}.*Next action:.*setup.mjs`));
      assert.deepEqual(checkoutSnapshot(f.root), snapshot);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    });
  }
});

test('start and doctor report malformed installed dependency metadata with the setup action', async () => {
  await withFixture({}, async (f) => {
    const privatePackage = privateDependency(f, 'apps/server', 'fastify');
    writeFileSync(join(privatePackage, 'package.json'), '{ malformed metadata');
    const snapshot = checkoutSnapshot(f.root);
    for (const script of ['start.mjs', 'doctor.mjs']) {
      const result = await closedWithin(f.launch(script, [], { env: { PORT: String(await port()) } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Installed dependencies.*incomplete: fastify.*Next action:.*setup.mjs/);
      if (script === 'doctor.mjs') assertSevenChecks(result.output);
      assert.doesNotMatch(result.output, /SyntaxError|\n\s+at /);
      assert.deepEqual(checkoutSnapshot(f.root), snapshot);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
      assert.equal(existsSync(f.config.browser.urlFile), false);
    }
  });
});

test('doctor rejects a directory web entry and start attempts its missing-build repair', async () => {
  await withFixture({}, async (f) => {
    const entry = join(f.root, 'apps/web/dist/index.html');
    unlinkSync(entry);
    mkdirSync(entry);
    let result = await closedWithin(f.launch('doctor.mjs', [], { env: { PORT: String(await port()) } }));
    assert.equal(result.code, 1, result.output);
    assertSevenChecks(result.output);
    assert.match(result.output, /FAIL Web build present:.*readable regular file.*setup.mjs/);
    f.config.command = { phase: 'build', mode: 'fail', details: 'Web build fixture error' };
    result = await closedWithin(f.launch('start.mjs', [], { env: { PORT: String(await port()) } }));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Web build failed.*Web build fixture error.*Next action:/);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    assert.equal(existsSync(f.config.browser.urlFile), false);
  });
});

test('normal build failures include one redacted compiler cause without stack lines', async () => {
  await withFixture({ built: false }, async (f) => {
    f.config.command = { phase: 'build', mode: 'fail', details: 'src/App.tsx(5,7): error TS2322: Type diagnostic-private-value is not assignable to string.\n    at compilerFixture (fixture:1:1)' };
    const result = await closedWithin(f.launch('setup.mjs', [], { env: { DIAGNOSTIC_SECRET: 'diagnostic-private-value' } }));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Web build failed.*src\/App.tsx\(5,7\): error TS2322: Type \[redacted\] is not assignable to string.*Next action:/);
    assert.doesNotMatch(result.output, /diagnostic-private-value|\n\s+at /);
  });
});

test('doctor loads SQLite JavaScript but fails at the native constructor without Project writes', async () => {
  await withFixture({}, async (f) => {
    f.config.nativeConstructorFailure = true;
    f.config.nativeLoadedFile = join(f.directory, 'native-js-loaded');
    f.config.nativeAddonAttemptFile = join(f.directory, 'native-addon-attempt');
    const snapshot = checkoutSnapshot(f.root);
    const result = await closedWithin(f.launch('doctor.mjs', [], { env: { PORT: String(await port()) } }));
    assert.equal(result.code, 1, result.output);
    assertSevenChecks(result.output);
    assert.match(result.output, /FAIL Native module loads:.*native binding.*corepack pnpm --filter @storymapper\/db rebuild better-sqlite3/);
    assert.equal(existsSync(f.config.nativeLoadedFile), true);
    assert.equal(existsSync(f.config.nativeAddonAttemptFile), true);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    assert.deepEqual(checkoutSnapshot(f.root), snapshot);
  });
});

test('successful launch forwards redacted server stdout including an unterminated final line', async () => {
  await withFixture({}, async (f) => {
    const secret = 'synthetic-stdout-secret\nsynthetic-"stdout\\second';
    const stdoutWrittenFile = join(f.directory, 'stdout-written');
    f.config.server = { stdoutChunks: ['Server log: ', `${secret}\n`, 'Final unterminated line'], stdoutWrittenFile };
    const value = await port();
    const owned = f.launch('start.mjs', [], { env: { PORT: String(value), DIAGNOSTIC_SECRET: secret } });
    await until(() => existsSync(stdoutWrittenFile) && existsSync(f.config.browser.urlFile) && owned.output.includes('Server log: [redacted]'));
    assert.doesNotMatch(owned.output, /Final unterminated line/);
    interrupt(owned, 'SIGINT');
    const result = await closedWithin(owned);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Server log: \[redacted\]\n\[redacted\]/);
    assert.match(result.output, /Final unterminated line/);
    assert.doesNotMatch(result.output, /synthetic-/);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('doctor ignores a .env in the working directory when no checkout .env exists', async () => {
  await withFixture({}, async (f) => {
    const elsewhere = join(f.directory, 'elsewhere');
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, '.env'), 'HOST=0.0.0.0\n');
    const result = await closedWithin(f.launch('doctor.mjs', [], { cwd: elsewhere, env: { PORT: String(await port()) }, removeEnv: ['HOST'] }));
    assert.equal(result.code, 0, result.output);
    assertSevenChecks(result.output);
  });
});

test('successful normal launch suppresses confirmed server stderr diagnostics and stack lines', async () => {
  await withFixture({}, async (f) => {
    const stderrWrittenFile = join(f.directory, 'stderr-written');
    f.config.server = { stderrChunks: ['Normal diagnostic marker\n', '    at normalFixture (fixture:1:1)\n'], stderrWrittenFile };
    const value = await port();
    const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
    await until(() => existsSync(stderrWrittenFile) && existsSync(f.config.browser.urlFile));
    assert.doesNotMatch(owned.output, /Normal diagnostic marker|\n\s+at /);
    interrupt(owned, 'SIGINT');
    const result = await closedWithin(owned);
    assert.equal(result.code, 0, result.output);
    assert.doesNotMatch(result.output, /Normal diagnostic marker|\n\s+at /);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('successful debug launch forwards redacted stderr across chunk boundaries and omits overlong lines', async () => {
  await withFixture({}, async (f) => {
    const secret = 'synthetic-"quote\\slash-value\nsynthetic-"second\\line-value';
    const serialized = JSON.stringify(secret).slice(1, -1);
    f.config.server = { stderrChunks: ['x'.repeat(20 * 1024), '\nDiagnostic: ', serialized.slice(0, 12), `${serialized.slice(12)}\nRaw diagnostic: ${secret}\nDebug diagnostic complete\n`] };
    const value = await port();
    const owned = f.launch('start.mjs', ['--debug'], { env: { PORT: String(value), DIAGNOSTIC_SECRET: secret } });
    await until(() => existsSync(f.config.browser.urlFile) && owned.output.includes('Debug diagnostic complete'));
    assert.match(owned.output, /Server diagnostic line exceeded 16384 characters; omitted/);
    assert.match(owned.output, /Diagnostic: \[redacted\]/);
    assert.match(owned.output, /Raw diagnostic: \[redacted\]\n\[redacted\]/);
    assert.doesNotMatch(owned.output, /synthetic-|quote|slash-value/);
    assert.equal(owned.child.exitCode, null);
    interrupt(owned, 'SIGINT');
    const result = await closedWithin(owned);
    assert.equal(result.code, 0, result.output);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('owned server launched from unrelated cwd uses root PORT before conflicting server-local PORT', async () => {
  await withFixture({}, async (f) => {
    const rootPort = await port();
    const serverPort = await port();
    writeFileSync(join(f.root, '.env'), `PORT=${rootPort}\n`);
    writeFileSync(join(f.root, 'apps/server/.env'), `PORT=${serverPort}\n`);
    const elsewhere = join(f.directory, 'elsewhere');
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, '.env'), 'PORT=0\n');
    const owned = f.launch('start.mjs', [], { cwd: elsewhere });
    await until(() => existsSync(f.config.browser.urlFile));
    const origin = `http://127.0.0.1:${rootPort}`;
    assert.equal(readFileSync(f.config.browser.urlFile, 'utf8'), origin);
    const response = await fetch(`${origin}/api/projects`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 200);
    await portClosed(`http://127.0.0.1:${serverPort}`);
    interrupt(owned, 'SIGINT');
    const result = await closedWithin(owned);
    assert.equal(result.code, 0, result.output);
    await portClosed(origin);
  });
});

test('server reports a concrete writable-directory repair when SQLite cannot open the database', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async () => {
  await withFixture({}, async (f) => {
    const directory = join(f.directory, 'data');
    mkdirSync(directory);
    chmodSync(directory, 0o500);
    try {
      const result = await closedWithin(f.launch('start.mjs', [], { env: { PORT: String(await port()) } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Project database directory cannot be opened:.*data.*Next action:.*writable directory.*STORYMAPPER_DB_PATH/);
      assert.doesNotMatch(result.output, /\n\s+at /);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    } finally { chmodSync(directory, 0o700); }
  });
});

test('direct server reports unreadable optional env without a Project database directory repair', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async () => {
  await withFixture({}, async (f) => {
    const envFile = join(f.root, 'apps/server/.env');
    writeFileSync(envFile, '');
    chmodSync(envFile, 0o000);
    try {
      const result = await closedWithin(f.launch('', [], { directServer: true, cwd: join(f.root, 'apps/server'), env: { PORT: String(await port()) } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /EACCES:.*\.env.*Next action:/);
      assert.doesNotMatch(result.output, /Project database directory|writable directory|STORYMAPPER_DB_PATH|\n\s+at /);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    } finally { chmodSync(envFile, 0o600); }
  });
});
