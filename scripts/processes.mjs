import { spawn } from 'node:child_process';
import { failure, redact, renderFailure } from '../apps/server/src/config/failures.mjs';

export function ownedProcess(command, args, options = {}) {
  const child = spawn(command, args, { detached: process.platform !== 'win32', ...options });
  const closed = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  return { child, closed };
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}

export async function stopProcess(owned) {
  const { child, closed } = owned;
  if (!child.pid) return;
  if (process.platform === 'win32') {
    if (processExists(child.pid)) {
      const killer = ownedProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'pipe' });
      killer.child.stdout.resume();
      killer.child.stderr.resume();
      let deadline;
      const timeout = new Promise((resolve) => {
        deadline = setTimeout(() => { killer.child.kill('SIGKILL'); resolve({ timedOut: true }); }, 5000);
      });
      let result;
      try { result = await Promise.race([killer.closed, timeout]); }
      finally { clearTimeout(deadline); }
      if (result.timedOut) {
        await killer.closed;
        throw new Error('taskkill did not finish within five seconds.');
      }
      if (result.error) throw result.error;
      if (result.code !== 0 && processExists(child.pid)) throw new Error(`taskkill failed with exit code ${result.code}.`);
    }
  } else {
    signalGroup(child.pid, 'SIGTERM');
    let deadline;
    try {
      await Promise.race([closed, new Promise((resolve) => { deadline = setTimeout(resolve, 5000); })]);
    } finally {
      clearTimeout(deadline);
    }
    signalGroup(child.pid, 'SIGKILL');
  }
  await closed;
}

export async function run(command, args, { signal, capture = false, diagnostics, ...options } = {}) {
  signal?.throwIfAborted();
  const owned = ownedProcess(command, args, { stdio: capture || diagnostics ? ['ignore', 'pipe', 'pipe'] : 'inherit', ...options });
  let output = '';
  let details = '';
  if (capture || diagnostics) {
    owned.child.stdout.setEncoding('utf8');
    owned.child.stderr.setEncoding('utf8');
    owned.child.stdout.on('data', (chunk) => { output += chunk; });
    if (diagnostics) owned.child.stderr.on('data', (chunk) => { details += chunk; });
    else owned.child.stderr.pipe(process.stderr);
  }
  let stopping;
  let resolveInterrupted;
  const interrupted = new Promise((resolve) => { resolveInterrupted = resolve; });
  const abort = () => {
    stopping ??= stopProcess(owned);
    resolveInterrupted();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const result = await Promise.race([owned.closed, interrupted]);
    if (stopping) await stopping;
    signal?.throwIfAborted();
    if (result.error) throw diagnostics ? failure(`${diagnostics.phase} could not run.`, diagnostics.fix, result.error) : result.error;
    if (result.code !== 0) {
      stopping ??= stopProcess(owned);
      await stopping;
      if (diagnostics) {
        const code = `${output}\n${details}`.match(/\bERR_[A-Z0-9_]+\b/)?.[0];
        const cause = new Error(redact(`${output}\n${details}`, options.env));
        const underlying = cause.message.split(/\r?\n/).find((line) => /\berror\b|\berror TS\d+\b|failed|cannot/i.test(line) && !/^\s*at\b/.test(line));
        const summary = code || underlying?.trim().slice(0, 400);
        const fix = code === 'ERR_PNPM_OUTDATED_LOCKFILE' ? 'Restore matching package.json and pnpm-lock.yaml from the same checkout revision, then run node scripts/setup.mjs.' : code === 'ERR_PNPM_UNEXPECTED_STORE' ? 'Use the same Corepack/pnpm store configuration that installed node_modules, then run node scripts/setup.mjs.' : diagnostics.fix;
        throw failure(`${diagnostics.phase} failed with ${result.signal ?? `exit code ${result.code}`}${summary ? ` (${summary})` : ''}.`, fix, cause);
      }
      throw new Error(`${command} failed with ${result.signal ?? `exit code ${result.code}`}.`);
    }
    if (diagnostics?.debug && details.trim()) console.error(redact(details.trim(), options.env));
    return output.trim();
  } finally {
    signal?.removeEventListener('abort', abort);
    if (stopping) await stopping;
  }
}

export async function commandMain(action, { debug = process.argv.includes('--debug'), interruptExitCode = 0 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on('SIGINT', abort);
  process.on('SIGTERM', abort);
  try {
    await action(controller.signal);
  } catch (error) {
    process.exitCode = controller.signal.aborted && (error === controller.signal.reason || error.name === 'AbortError') ? interruptExitCode : 1;
    if (!controller.signal.aborted || error !== controller.signal.reason && error.name !== 'AbortError') {
      console.error(renderFailure(error, debug));
      process.exitCode = 1;
    }
  } finally {
    process.off('SIGINT', abort);
    process.off('SIGTERM', abort);
  }
}
