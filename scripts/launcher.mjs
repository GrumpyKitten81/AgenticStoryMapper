import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { ownedProcess, stopProcess } from './processes.mjs';
import { checkHealth, openBrowser, repository } from './runtime.mjs';
import { buildDiagnostics, webBuildPresent } from './diagnostics.mjs';
import { failure, redact } from '../apps/server/src/config/failures.mjs';

const DIAGNOSTIC_TAIL_LIMIT = 16 * 1024;

function captureStderr(stream, env, debug) {
  let tail = '';
  let pending = '';
  let omitted = false;
  const emit = (line) => {
    const safe = redact(line, env);
    tail = `${tail}${safe}\n`.slice(-DIAGNOSTIC_TAIL_LIMIT);
    if (debug) console.error(safe);
  };
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = chunk.split('\n');
    for (let index = 0; index < lines.length; index++) {
      if (pending.length + lines[index].length > DIAGNOSTIC_TAIL_LIMIT) omitted = true;
      if (!omitted) pending += lines[index];
      else pending = '';
      if (index === lines.length - 1) continue;
      emit(omitted ? 'Server diagnostic line exceeded 16384 characters; omitted.' : pending);
      pending = '';
      omitted = false;
    }
  });
  stream.on('end', () => {
    if (pending || omitted) emit(omitted ? 'Server diagnostic line exceeded 16384 characters; omitted.' : pending);
    pending = '';
  });
  return () => tail;
}

export function productionCommand() {
  const require = createRequire(join(repository, 'apps/server/package.json'));
  return [process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, 'src/main.ts']];
}

async function ready(owned, signal) {
  const address = new Promise((resolve, reject) => {
    owned.child.on('message', (message) => {
      if (message?.type === 'listening') resolve(message.url);
      if (message?.type === 'startup-error') reject(failure(message.message, message.fix, new Error(message.details ?? message.message)));
    });
    owned.closed.then((result) => reject(result.error ?? new Error('Server exited before reporting its listening address.')));
  });
  let deadline;
  let abort;
  const timeout = new Promise((resolve, reject) => {
    deadline = globalThis.setTimeout(() => reject(new Error('Server did not report its listening address within 30 seconds.')), 30_000);
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([address, timeout]);
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', abort);
  }
}

async function waitForHealth(url, owned, signal) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    if (owned.child.exitCode !== null || owned.child.signalCode !== null) throw new Error('Server exited before becoming healthy.');
    try {
      await checkHealth(url, signal);
      return;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (!(error instanceof TypeError) && error.name !== 'TimeoutError' && !error.message.startsWith('Healthcheck')) throw error;
    }
    await setTimeout(100, undefined, { signal });
  }
  throw new Error(`Server did not become healthy at ${url}.`);
}

async function stopServer(owned) {
  if (owned.child.exitCode !== null || owned.child.signalCode !== null) return owned.closed;
  if (owned.child.connected) {
    await new Promise((resolve, reject) => owned.child.send({ type: 'shutdown' }, (error) => error ? reject(error) : resolve()));
    return owned.closed;
  }
  return stopProcess(owned);
}

export async function launch({ pnpm, env, debug = false }, signal) {
  if (!webBuildPresent()) await pnpm(['--filter', '@storymapper/web', 'build'], { diagnostics: buildDiagnostics(debug) });
  signal.throwIfAborted();
  const [command, args] = productionCommand();
  const owned = ownedProcess(command, [...args, ...(debug ? ['--debug'] : [])], { cwd: join(repository, 'apps/server'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const stderr = captureStderr(owned.child.stderr, env, debug);
  let stdout = '';
  owned.child.stdout.setEncoding('utf8');
  owned.child.stdout.on('data', (chunk) => {
    stdout += chunk;
    const lines = stdout.split('\n');
    stdout = lines.pop();
    for (const line of lines) console.log(redact(line, env));
  });
  owned.child.stdout.on('end', () => { if (stdout) console.log(redact(stdout, env)); });
  let stopping;
  const stop = () => { stopping ??= stopServer(owned); };
  signal.addEventListener('abort', stop, { once: true });
  const interrupted = new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  const startup = new AbortController();
  const startupSignal = AbortSignal.any([signal, startup.signal]);
  try {
    const url = await ready(owned, startupSignal);
    startup.abort();
    await waitForHealth(url, owned, signal);
    signal.throwIfAborted();
    console.log(`Agentic Story Mapper is ready at ${url}`);
    console.log(`Agent setup (required for guided planning): ${new URL('/agent-setup', url).href}`);
    console.log('Keep this terminal open. Press Ctrl+C to stop Agentic Story Mapper.');
    const browser = new AbortController();
    owned.closed.then((result) => browser.abort(result.error ?? new Error(`Server stopped during browser opening with ${result.signal ?? `exit code ${result.code}`}.`)));
    await openBrowser(url, env, AbortSignal.any([signal, browser.signal]), debug);
    const result = await Promise.race([owned.closed, interrupted]);
    if (result?.error) throw result.error;
    if (!signal.aborted && result.code !== 0) throw new Error(`Server stopped with ${result.signal ?? `exit code ${result.code}`}.`);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (!error.message.includes('Next action:')) throw failure(error.message, 'Run node scripts/doctor.mjs, repair failed checks and restart.', new Error(stderr() || error.stack));
    throw error;
  } finally {
    startup.abort();
    signal.removeEventListener('abort', stop);
    stop();
    await stopping;
  }
}
