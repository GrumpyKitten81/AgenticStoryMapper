import childProcess from 'node:child_process';
import { appendFileSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import Module, { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(process.env.STORYMAPPER_TEST_CONFIG, 'utf8'));
if (process.send && ['setup.mjs', 'start.mjs', 'doctor.mjs', 'verify.mjs'].includes(process.argv[1]?.split(/[\\/]/).at(-1))) {
  process.on('message', (message) => {
    if (message?.type === 'test-interrupt') {
      process.emit(message.signal);
      process.disconnect();
    }
  });
  process.channel.unref();
}
if (config.nodeVersion) Object.defineProperty(process.versions, 'node', { value: config.nodeVersion });
const load = Module._load;
Module._load = function (request, ...args) {
  const sqlite = /(?:^|[/\\])better-sqlite3(?:[/\\]|$)/.test(request);
  if (sqlite && config.nativeFailure) throw new Error(config.nativeFailure);
  const result = load.call(this, request, ...args);
  if (sqlite && config.nativeLoadedFile) writeFileSync(config.nativeLoadedFile, 'JavaScript package loaded');
  return result;
};
const loadAddon = Module._extensions['.node'];
Module._extensions['.node'] = function (module, filename) {
  if (filename.endsWith('.node') && /better-sqlite3[/\\]/.test(filename) && config.nativeConstructorFailure) {
    if (config.nativeAddonAttemptFile) writeFileSync(config.nativeAddonAttemptFile, 'Native addon attempted');
    throw Object.assign(new Error('Fixture better-sqlite3 native addon could not load'), { code: 'ERR_DLOPEN_FAILED' });
  }
  return loadAddon(module, filename);
};
const spawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  const role = args?.includes('src/main.ts') ? 'server' : ['open', 'xdg-open', 'rundll32.exe'].includes(command) ? 'browser' : undefined;
  let reservation;
  if (role === 'server' && config.bindRace) {
    reservation = createServer();
    reservation.listen(Number(options.env.PORT), options.env.HOST);
  }
  if (['open', 'xdg-open', 'rundll32.exe'].includes(command)) {
    command = process.execPath;
    args = [join(directory, 'browser.mjs'), args.at(-1)];
  } else if (args?.[0]?.endsWith('corepack.js') && args[1] === 'pnpm') {
    const phase = args.includes('--version') ? 'preflight' : args.includes('install') ? 'install' : args.includes('build') ? 'build' : args.at(-1);
    const sharedInstall = phase === 'install' && lstatSync(join(options.cwd, 'node_modules'), { throwIfNoEntry: false })?.isSymbolicLink();
    if (sharedInstall || config.command?.phase === phase || config.command?.phase === 'all') {
      command = process.execPath;
      args = [join(directory, 'command.mjs'), phase];
    }
  } else if (config.slowAgentCalls && args?.includes('src/main.ts')) {
    args = [...args.slice(0, -1), 'src/fixtures/runtime-lifecycle.ts'];
  } else if (config.server && args?.includes('src/main.ts')) {
    command = process.execPath;
    args = [join(directory, 'server.mjs')];
  }
  const child = spawn(command, args, options);
  if (reservation) child.once('close', () => reservation.close());
  if (child.pid && config.processesFile) appendFileSync(config.processesFile, `${JSON.stringify({ pid: child.pid, detached: options?.detached, role, args })}\n`);
  return child;
};
syncBuiltinESMExports();
