import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { browserCommand, corepackEntry } from './runtime.mjs';
import { productionCommand } from './launcher.mjs';
import { alive, closedWithin, fixture, git, interrupt, listener, ownedServerPid, port, portClosed, until, withFixture } from './fixtures/checkout.mjs';

test('setup installs, builds and launches the healthy app without config, and repeats safely', { timeout: 120_000 }, async () => {
  await withFixture({ fresh: true, built: false }, async (f) => {
    assert.equal(existsSync(join(f.root, '.env')), false);
    let savedMap;
    let projectId;
    for (let run = 0; run < 2; run++) {
      rmSync(f.config.browser.urlFile, { force: true });
      const owned = f.launch('setup.mjs');
      try { await until(() => existsSync(f.config.browser.urlFile) || owned.child.exitCode !== null || owned.child.signalCode !== null, 60_000); }
      catch (error) { assert.fail(`${error.message}\n${owned.output}`); }
      assert.ok(existsSync(f.config.browser.urlFile), owned.output);
      const origin = readFileSync(f.config.browser.urlFile, 'utf8');
      assert.equal(owned.child.exitCode, null);
      assert.equal((await fetch(`${origin}/health`)).status, 200);
      const projects = await (await fetch(`${origin}/api/projects`)).json();
      if (run === 0) {
        projectId = projects.projects[0].id;
        assert.deepEqual((await (await fetch(`${origin}/api/story-maps?projectId=${projectId}`)).json()).storyMaps, []);
        const response = await fetch(`${origin}/api/story-maps`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ projectId, name: 'Saved first map' }) });
        assert.equal(response.status, 201);
        savedMap = await response.json();
      } else {
        assert.equal(projects.projects[0].id, projectId);
        assert.deepEqual((await (await fetch(`${origin}/api/story-maps?projectId=${projectId}`)).json()).storyMaps, [savedMap]);
      }
      interrupt(owned, 'SIGINT');
      const result = await closedWithin(owned);
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /Setup completed.*Ctrl\+C/);
      assert.ok(result.output.includes(`Agent setup (required for guided planning): ${origin}/agent-setup`));
      await portClosed(origin);
      assert.ok(existsSync(join(f.root, 'apps/web/dist/index.html')));
      assert.ok(existsSync(join(f.root, 'local-projects/default.lsm')));
      assert.ok(existsSync(f.env.STORYMAPPER_DB_PATH));
    }
  });
});

function dependencySnapshot(root) {
  const snapshot = {};
  const visit = (path) => {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const relative = join(path, entry.name);
      if (entry.isSymbolicLink()) snapshot[relative] = readlinkSync(join(root, relative));
      else if (entry.isDirectory()) visit(relative);
      else if (['.modules.yaml', 'lock.yaml'].includes(entry.name)) snapshot[relative] = readFileSync(join(root, relative), 'utf8');
    }
  };
  for (const path of ['node_modules', 'apps/server/node_modules', 'apps/web/node_modules', ...['contracts', 'core', 'db', 'github', 'importers', 'mcp'].map((name) => `packages/${name}/node_modules`)]) visit(path);
  return snapshot;
}

test('frozen install and build failures preserve shared dependency links and metadata under CI and prevent later setup steps', async () => {
  for (const phase of ['install', 'build']) {
    await withFixture({ built: false }, async (f) => {
      const dependencies = dependencySnapshot(process.cwd());
      const links = ['node_modules', 'apps/server/node_modules', 'apps/web/node_modules', ...['contracts', 'core', 'db', 'github', 'importers', 'mcp'].map((name) => `packages/${name}/node_modules`)];
      const targets = links.map((path) => readlinkSync(join(f.root, path)));
      f.config.command = { phase, mode: 'fail' };
      const result = await closedWithin(f.launch('setup.mjs', [], { env: { CI: 'true' } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /exit code 17/);
      assert.match(result.output, /Next action:/);
      assert.equal(existsSync(f.config.browser.urlFile), false);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
      assert.equal(existsSync(join(f.root, 'local-projects/default.lsm')), false);
      const installs = readFileSync(f.config.processesFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter(({ args }) => args.includes('install'));
      assert.equal(installs.length, 1);
      assert.ok(installs[0].args[0].endsWith('command.mjs'));
      assert.deepEqual(dependencySnapshot(process.cwd()), dependencies);
      for (const [index, path] of links.entries()) {
        assert.ok(lstatSync(join(f.root, path)).isSymbolicLink());
        assert.equal(readlinkSync(join(f.root, path)), targets[index]);
      }
    });
  }
});

test('real setup rejects a manifest that disagrees with the frozen lockfile', async () => {
  await withFixture({ fresh: true, built: false }, async (f) => {
    const manifest = JSON.parse(readFileSync(join(f.root, 'package.json')));
    manifest.devDependencies.typescript = '0.0.0';
    writeFileSync(join(f.root, 'package.json'), JSON.stringify(manifest));
    const result = await closedWithin(f.launch('setup.mjs'), 60_000);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /OUTDATED_LOCKFILE.*Next action: Restore matching package\.json and pnpm-lock\.yaml/);
    assert.equal(existsSync(join(f.root, 'local-projects/default.lsm')), false);
  });
});

test('start serves actual app/API on its owned URL and only opens the browser after health', async () => {
  for (const built of [true, false]) {
    await withFixture({ built }, async (f) => {
      const value = await port();
      const origin = `http://127.0.0.1:${value}`;
      const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
      try {
        if (!built) {
          const asset = join(f.root, 'apps/web/dist/index.html');
          await until(() => existsSync(asset) || owned.child.exitCode !== null || owned.child.signalCode !== null, 60_000);
          assert.ok(existsSync(asset), owned.output);
        }
        await until(() => existsSync(f.config.browser.urlFile));
      }
      catch (error) { assert.fail(`${error.message}\n${owned.output}`); }
      assert.equal(readFileSync(f.config.browser.urlFile, 'utf8'), origin);
      for (const path of ['/', '/story-maps/map-id', '/api/projects']) {
        const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(2000) });
        assert.equal(response.status, 200);
      }
      interrupt(owned, 'SIGINT');
      const result = await closedWithin(owned);
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, new RegExp(`Agentic Story Mapper is ready at ${origin}`));
      assert.ok(result.output.includes(`Agent setup (required for guided planning): ${origin}/agent-setup`));
      await portClosed(origin);
    });
  }
});

test('IPv6 host overrides reach the real server and exact browser URL', async () => {
  await withFixture({}, async (f) => {
    const value = await port('::1');
    const origin = `http://[::1]:${value}`;
    const owned = f.launch('start.mjs', [], { env: { HOST: '::1', PORT: String(value) } });
    await until(() => existsSync(f.config.browser.urlFile));
    assert.equal(readFileSync(f.config.browser.urlFile, 'utf8'), origin);
    interrupt(owned, 'SIGTERM');
    const result = await closedWithin(owned);
    assert.equal(result.code, 0, result.output);
    await portClosed(origin);
  });
});

test('invalid configuration and missing dependencies/runtime fail before database creation or browser opening', async () => {
  await withFixture({}, async (f) => {
    f.config.nodeVersion = '22.0.0';
    const result = await closedWithin(f.launch('start.mjs'));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Node 24 is required/);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
  });
  for (const env of [{ HOST: '0.0.0.0' }, { HOST: '0.0.0.0', STORYMAPPER_ALLOW_REMOTE_HOST: 'true' }, { PORT: '0' }, { PORT: 'not-a-port' }, { PATH: '' }]) {
    await withFixture({}, async (f) => {
      const result = await closedWithin(f.launch('start.mjs', [], { env }));
      assert.equal(result.code, 1, result.output);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
      assert.equal(existsSync(f.config.browser.urlFile), false);
    });
  }
  await withFixture({ fresh: true }, async (f) => {
    const result = await closedWithin(f.launch('start.mjs'));
    assert.equal(result.code, 1);
    assert.match(result.output, /Installed dependencies are missing/);
    assert.match(result.output, /node scripts\/setup.mjs/);
  });
});

test('unexpected pnpm version rejects public setup and start before later work', async () => {
  for (const script of ['setup.mjs', 'start.mjs']) {
    await withFixture({ built: false }, async (f) => {
      f.config.command = { phase: 'preflight', mode: 'success', version: '0.0.0' };
      const result = await closedWithin(f.launch(script));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Expected pnpm 9\.15\.4, got 0\.0\.0/);
      assert.equal(existsSync(join(f.root, 'apps/web/dist/index.html')), false);
      assert.equal(existsSync(join(f.root, 'local-projects/default.lsm')), false);
      assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
      assert.equal(existsSync(f.config.browser.urlFile), false);
    });
  }
});

test('launcher preflight rejects server-local non-loopback configuration before spawning the server, DB or bind', async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    writeFileSync(join(f.root, 'apps/server/.env'), 'HOST=0.0.0.0\nSTORYMAPPER_ALLOW_REMOTE_HOST=true\n');
    const result = await closedWithin(f.launch('start.mjs', [], { env: { PORT: String(value) }, removeEnv: ['HOST', 'STORYMAPPER_ALLOW_REMOTE_HOST'] }));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Launcher requires a loopback HOST/);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    assert.equal(existsSync(f.config.browser.urlFile), false);
    const observed = readFileSync(f.config.processesFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(!observed.some(({ role }) => role === 'server'));
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('server IPC loopback guard rejects non-loopback configuration before DB or bind', async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    const owned = f.launch('', [], { directServer: true, ipc: true, cwd: join(f.root, 'apps/server'), env: { PORT: String(value), HOST: '0.0.0.0', STORYMAPPER_ALLOW_REMOTE_HOST: 'true' } });
    const messages = [];
    owned.child.on('message', (message) => messages.push(message));
    const result = await closedWithin(owned);
    assert.equal(result.code, 1, result.output);
    assert.equal(messages[0]?.type, 'startup-error', result.output);
    assert.match(messages[0].message, /Launcher requires a loopback HOST/);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('a healthy occupied port cannot authorize browser opening', async () => {
  const occupied = await listener((req, res) => res.end(JSON.stringify({ ok: true, mode: 'local', databasePath: 'fixture.sqlite' })));
  try {
    await withFixture({}, async (f) => {
      const result = await closedWithin(f.launch('start.mjs', [], { env: { PORT: String(occupied.port) } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /EADDRINUSE/);
      assert.equal(existsSync(f.config.browser.urlFile), false);
    });
  } finally { await occupied.close(); }
});

test('failed missing-asset build and early server exit never open a browser', async () => {
  await withFixture({ built: false }, async (f) => {
    f.config.command = { phase: 'build', mode: 'fail' };
    const result = await closedWithin(f.launch('start.mjs'));
    assert.equal(result.code, 1, result.output);
    assert.equal(existsSync(f.config.browser.urlFile), false);
    assert.equal(existsSync(f.env.STORYMAPPER_DB_PATH), false);
  });
  await withFixture({}, async (f) => {
    f.config.server = { mode: 'exit' };
    const result = await closedWithin(f.launch('start.mjs'));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /before reporting/);
    assert.equal(existsSync(f.config.browser.urlFile), false);
  });
});

test('unhealthy owned server times out loudly and releases its port', { timeout: 45_000 }, async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    f.config.server = { health: { ok: false, mode: 'local', databasePath: 'fixture.sqlite' } };
    const result = await closedWithin(f.launch('start.mjs', [], { env: { PORT: String(value) } }), 40_000);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /did not become healthy/);
    assert.equal(existsSync(f.config.browser.urlFile), false);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('browser failure is loud and cleans up the healthy real server', async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    f.config.browser.mode = 'fail';
    const result = await closedWithin(f.launch('start.mjs', [], { env: { PORT: String(value) } }));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /exit code 19/);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('hanging opener deadline fails nonzero and cleans its descendants and server', { timeout: 25_000 }, async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    Object.assign(f.config.browser, { mode: 'hang', pidFile: join(f.directory, 'browser-pid'), descendantFile: join(f.directory, 'descendant-pid') });
    const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
    await until(() => existsSync(f.config.browser.descendantFile));
    const browser = Number(readFileSync(f.config.browser.pidFile, 'utf8'));
    const descendant = Number(readFileSync(f.config.browser.descendantFile, 'utf8'));
    const result = await closedWithin(owned, 20_000);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Browser opener did not finish within ten seconds/);
    await until(() => !alive(browser) && !alive(descendant), 5000);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('unexpected ready server exit fails the launcher during and after browser opening', { timeout: 25_000 }, async () => {
  for (const hanging of [true, false]) {
    await withFixture({}, async (f) => {
      const value = await port();
      if (hanging) Object.assign(f.config.browser, { mode: 'hang', pidFile: join(f.directory, 'browser-pid'), descendantFile: join(f.directory, 'descendant-pid') });
      const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
      await until(() => existsSync(f.config.browser.urlFile) && (!hanging || existsSync(f.config.browser.descendantFile)));
      if (!hanging) {
        await until(() => readFileSync(f.config.processesFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter(({ role }) => role === 'browser').every(({ pid }) => !alive(pid)));
      }
      process.kill(ownedServerPid(f), 'SIGKILL');
      const result = await closedWithin(owned, 8000);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Server stopped/);
      if (hanging) {
        await until(() => !alive(Number(readFileSync(f.config.browser.pidFile, 'utf8'))) && !alive(Number(readFileSync(f.config.browser.descendantFile, 'utf8'))), 5000);
      }
      await portClosed(`http://127.0.0.1:${value}`);
    });
  }
});

test('platform browser commands and Windows Corepack discovery preserve argument boundaries', () => {
  const loader = new URL(productionCommand()[1][1]);
  assert.equal(loader.protocol, 'file:');
  assert.ok(existsSync(fileURLToPath(loader)));
  const url = 'http://[::1]:4317';
  assert.deepEqual(browserCommand(url, 'win32'), ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]);
  assert.deepEqual(browserCommand(url, 'darwin'), ['open', [url]]);
  assert.deepEqual(browserCommand(url, 'linux'), ['xdg-open', [url]]);
  const directory = mkdtempSync(join(tmpdir(), 'storymapper-corepack-'));
  try {
    writeFileSync(join(directory, 'corepack.cmd'), '');
    const entry = join(directory, 'node_modules/corepack/dist/corepack.js');
    mkdirSync(dirname(entry), { recursive: true });
    writeFileSync(entry, '');
    assert.equal(corepackEntry({ PATH: directory }, 'win32'), entry);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('abrupt launcher loss disconnects and stops its owned real server', async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
    await until(() => existsSync(f.config.browser.urlFile));
    const serverPid = ownedServerPid(f);
    owned.child.kill('SIGKILL');
    await closedWithin(owned);
    await portClosed(`http://127.0.0.1:${value}`);
    await until(() => !alive(serverPid), 8000);
  });
});

test('fixture cleanup after abrupt setup install loss stops descendants before fixture removal', async () => {
  const f = fixture({ built: false });
  try {
    f.config.command = { phase: 'install', mode: 'hang', pidFile: join(f.directory, 'install-pid'), descendantFile: join(f.directory, 'descendant-pid') };
    const owned = f.launch('setup.mjs');
    await until(() => existsSync(f.config.command.descendantFile));
    const command = Number(readFileSync(f.config.command.pidFile, 'utf8'));
    const descendant = Number(readFileSync(f.config.command.descendantFile, 'utf8'));
    owned.child.kill('SIGKILL');
    await until(() => owned.child.exitCode !== null || owned.child.signalCode !== null);
    await closedWithin({ closed: f.cleanup() }, 12_000);
    assert.equal(alive(command), false);
    assert.equal(alive(descendant), false);
    assert.equal(existsSync(f.directory), false);
  } finally {
    if (existsSync(f.directory)) await f.cleanup();
  }
});

test('test-only IPC interruption invokes the launcher signal handler and cancellation', async () => {
  await withFixture({}, async (f) => {
    f.config.command = { phase: 'preflight', mode: 'hang', pidFile: join(f.directory, 'preflight-pid'), descendantFile: join(f.directory, 'descendant-pid') };
    const owned = f.launch('start.mjs');
    await until(() => existsSync(f.config.command.descendantFile));
    const pid = Number(readFileSync(f.config.command.pidFile, 'utf8'));
    const descendant = Number(readFileSync(f.config.command.descendantFile, 'utf8'));
    owned.child.send({ type: 'test-interrupt', signal: 'SIGINT' });
    const result = await closedWithin(owned, 8000);
    assert.equal(result.code, 0, result.output);
    await until(() => !alive(pid) && !alive(descendant), 5000);
  });
});

test('interrupted preflight, build and opener terminate their whole process trees within a bound', { timeout: 60_000 }, async () => {
  for (const phase of ['preflight', 'build', 'browser']) {
    await withFixture({ built: phase !== 'build' }, async (f) => {
      const pidFile = join(f.directory, 'command-pid');
      const descendantFile = join(f.directory, 'descendant-pid');
      if (phase === 'browser') Object.assign(f.config.browser, { mode: 'hang', pidFile, descendantFile });
      else f.config.command = { phase, mode: 'hang', pidFile, descendantFile };
      const value = await port();
      const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
      await until(() => existsSync(pidFile) && existsSync(descendantFile));
      const pid = Number(readFileSync(pidFile, 'utf8'));
      const descendant = Number(readFileSync(descendantFile, 'utf8'));
      interrupt(owned, 'SIGINT');
      const result = await closedWithin(owned, 8000);
      assert.equal(result.code, 0, result.output);
      await until(() => !alive(pid) && !alive(descendant), 5000);
      if (phase === 'browser') await portClosed(`http://127.0.0.1:${value}`);
    });
  }
});

test('cancellation waits for the owned delayed shutdown beyond the former two-second cutoff', async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    f.config.server = { mode: 'delayed', pidFile: join(f.directory, 'server-pid') };
    const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
    await until(() => existsSync(f.config.browser.urlFile));
    const started = Date.now();
    interrupt(owned, 'SIGTERM');
    const result = await closedWithin(owned, 8000);
    assert.equal(result.code, 0, result.output);
    assert.ok(Date.now() - started >= 2500);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('interruption before server readiness stops the child without a browser', async () => {
  await withFixture({}, async (f) => {
    const value = await port();
    f.config.server = { mode: 'silent', pidFile: join(f.directory, 'server-pid') };
    const owned = f.launch('start.mjs', [], { env: { PORT: String(value) } });
    await until(() => existsSync(f.config.server.pidFile));
    interrupt(owned, 'SIGINT');
    const result = await closedWithin(owned, 8000);
    assert.equal(result.code, 0, result.output);
    assert.equal(existsSync(f.config.browser.urlFile), false);
    await portClosed(`http://127.0.0.1:${value}`);
  });
});

test('public verify preserves hygiene and gate failure propagation', async () => {
  await withFixture({ gitRepository: true }, async (f) => {
    f.config.command = { phase: 'all', mode: 'success' };
    let result = await closedWithin(f.launch('verify.mjs'));
    assert.equal(result.code, 0, result.output);
    writeFileSync(join(f.root, '.env.local'), '');
    git(f.root, ['add', '-f', '.env.local']);
    result = await closedWithin(f.launch('verify.mjs'));
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Sensitive files/);
  });
  for (const phase of ['typecheck', 'build', 'check-hygiene', 'test:a11y']) {
    await withFixture({ gitRepository: true }, async (f) => {
      f.config.command = { phase: 'all', mode: 'success', failurePhase: phase };
      const result = await closedWithin(f.launch('verify.mjs'));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /exit code 17/);
    });
  }
});

test('public verify rejects missing env ignore, ignored env example and env history', async () => {
  for (const variant of ['missing-ignore', 'ignored-example', 'history']) {
    await withFixture({ gitRepository: true }, async (f) => {
      f.config.command = { phase: 'all', mode: 'success' };
      const empty = join(f.directory, 'empty-ignore');
      writeFileSync(empty, '');
      git(f.root, ['config', 'core.excludesFile', empty]);
      const ignore = join(f.root, '.gitignore');
      if (variant === 'missing-ignore') writeFileSync(ignore, readFileSync(ignore, 'utf8').split('\n').filter((line) => !line.includes('.env')).join('\n'));
      if (variant === 'ignored-example') {
        writeFileSync(ignore, `${readFileSync(ignore, 'utf8')}\n.env.example\n`);
        git(f.root, ['rm', '--cached', '--ignore-unmatch', '--', '.env.example']);
      }
      if (variant === 'history') {
        const hooks = join(f.directory, 'empty-hooks');
        mkdirSync(hooks);
        writeFileSync(join(f.root, '.env'), '');
        git(f.root, ['add', '-f', '--', '.env']);
        git(f.root, ['-c', `core.hooksPath=${hooks}`, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--no-gpg-sign', '--only', '-m', 'test: record empty fixture env history', '--', '.env']);
        git(f.root, ['rm', '--cached', '--', '.env']);
      }
      const result = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build']));
      assert.equal(result.code, 1, `${variant}: ${result.output}`);
      assert.match(result.output, variant === 'history' ? /\.env appears in Git history/ : variant === 'ignored-example' ? /\.env.example must not be ignored/ : /git failed with exit code 1/);
    });
  }
});

test('public verify rejects tracked input, local Project and SQLite data', async () => {
  for (const path of ['input/empty.txt', 'local-projects/isolated.lsm/empty.data', 'isolated.sqlite', 'isolated.sqlite-wal', 'isolated.sqlite3']) {
    await withFixture({ gitRepository: true }, async (f) => {
      f.config.command = { phase: 'all', mode: 'success' };
      const target = join(f.root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, '');
      git(f.root, ['add', '-f', '--', path]);
      const result = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build']));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Sensitive files are tracked by Git/);
      assert.ok(result.output.includes(path));
    });
  }
});

test('public verify rejects an unusable default Project folder and accepts a usable one', async () => {
  const unwritable = process.platform !== 'win32' && process.getuid?.() !== 0;
  for (const layout of ['directory', 'file', ...(unwritable ? ['readonly'] : [])]) {
    await withFixture({ gitRepository: true }, async (f) => {
      f.config.command = { phase: 'all', mode: 'success' };
      const folder = join(f.root, 'local-projects/default.lsm');
      mkdirSync(dirname(folder), { recursive: true });
      if (layout === 'file') writeFileSync(folder, '');
      else mkdirSync(folder, { mode: layout === 'readonly' ? 0o500 : 0o700 });
      const result = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build']));
      assert.equal(result.code, layout === 'directory' ? 0 : 1, result.output);
      if (layout !== 'directory') assert.match(result.output, /must be a directory|EACCES/);
    });
  }
});

test('public verify health requires exact HTTP200 and valid databasePath', async () => {
  for (const variant of [
    { status: 200, body: { ok: true, mode: 'local', databasePath: 'fixture.sqlite' }, code: 0 },
    { status: 201, body: { ok: true, mode: 'local', databasePath: 'fixture.sqlite' }, code: 1 },
    { status: 200, body: { ok: false, mode: 'local', databasePath: 'fixture.sqlite' }, code: 1 },
    { status: 200, body: { ok: true, mode: 'remote', databasePath: 'fixture.sqlite' }, code: 1 },
    ...[undefined, 5, ''].map((databasePath) => ({ status: 200, body: { ok: true, mode: 'local', databasePath }, code: 1 })),
    { status: 200, body: { ok: true, mode: 'local', databasePath: '  ' }, code: 1 }
  ]) {
    let runtimeDirectory;
    const health = await listener((req, res) => { res.writeHead(variant.status); res.end(JSON.stringify({ ...variant.body, runtimeDirectory })); });
    try {
      await withFixture({ gitRepository: true }, async (f) => {
        f.config.command = { phase: 'all', mode: 'success' };
        runtimeDirectory = dirname(f.env.STORYMAPPER_DB_PATH);
        mkdirSync(dirname(f.env.STORYMAPPER_DB_PATH), { recursive: true });
        writeFileSync(join(dirname(f.env.STORYMAPPER_DB_PATH), '.port'), JSON.stringify({ host: '127.0.0.1', port: health.port, owner: 'verify-fixture' }));
        const result = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build', '--check-health'], { env: { PORT: String(health.port) } }));
        assert.equal(result.code, variant.code, result.output);
      });
    } finally { await health.close(); }
  }
});

test('public verify loads repository-root config from an unrelated cwd and preserves explicit overrides', async () => {
  let runtimeDirectory;
  const health = await listener((req, res) => res.end(JSON.stringify({ ok: true, mode: 'local', databasePath: 'fixture.sqlite', runtimeDirectory })));
  try {
    await withFixture({ gitRepository: true }, async (f) => {
      f.config.command = { phase: 'all', mode: 'success' };
      runtimeDirectory = dirname(f.env.STORYMAPPER_DB_PATH);
      mkdirSync(dirname(f.env.STORYMAPPER_DB_PATH), { recursive: true });
      writeFileSync(join(dirname(f.env.STORYMAPPER_DB_PATH), '.port'), JSON.stringify({ host: '127.0.0.1', port: health.port, owner: 'verify-fixture' }));
      writeFileSync(join(f.root, '.env'), `PORT=${health.port}\nHOST=127.0.0.1\n`);
      const elsewhere = join(f.directory, 'elsewhere');
      mkdirSync(elsewhere);
      writeFileSync(join(elsewhere, '.env'), 'PORT=1\n');
      let result = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build', '--check-health'], { cwd: elsewhere }));
      assert.equal(result.code, 0, result.output);
      result = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build', '--check-health'], { cwd: elsewhere, env: { PORT: '0' } }));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /PORT must/);
    });
  } finally { await health.close(); }
});

test('public verify refuses a healthy service belonging to a different runtime', async () => {
  const health = await listener((req, res) => res.end(JSON.stringify({ ok: true, mode: 'local', databasePath: 'foreign.sqlite', runtimeDirectory: 'foreign-runtime' })));
  try {
    await withFixture({ gitRepository: true }, async (f) => {
      f.config.command = { phase: 'all', mode: 'success' };
      const directory = dirname(f.env.STORYMAPPER_DB_PATH);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, '.port'), JSON.stringify({ host: '127.0.0.1', port: health.port, owner: 'foreign-fixture' }));
      const result = await closedWithin(f.launch('verify.mjs', ['--skip-typecheck', '--skip-build', '--check-health']));
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /not this Agentic Story Mapper runtime/);
    });
  } finally { await health.close(); }
});
