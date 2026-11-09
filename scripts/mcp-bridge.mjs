import { once } from 'node:events';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { readRuntimePort, runtimeUrl } from '../apps/server/src/config/runtime-port.ts';

const REQUEST_TIMEOUT = 10_000;

async function endpoint(directory) {
  const url = runtimeUrl(readRuntimePort(directory));
  const response = await fetch(`${url}/health`, { redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
  if (!response.ok) throw new Error(`Runtime discovery failed: HTTP ${response.status}.`);
  const health = await response.json();
  if (health?.ok !== true || health?.mode !== 'local' || typeof health.databasePath !== 'string' || !health.databasePath.trim() || health.runtimeDirectory !== directory) throw new Error('Discovered service is not this Agentic Story Mapper runtime.');
  return `${url}/mcp`;
}

async function post(directory, message, sessionId) {
  return fetch(await endpoint(directory), {
    method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) },
    body: JSON.stringify(message)
  });
}

async function requireSuccess(response) {
  if (response.status === 202) return;
  let message;
  try { message = await response.json(); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error('MCP endpoint returned invalid JSON.');
  }
  if (response.ok || (response.status === 400 && message?.jsonrpc === '2.0' && message.error && 'id' in message)) return message;
  throw new Error(`MCP request failed: HTTP ${response.status}${response.status === 403 ? ' (disabled or forbidden)' : ''}.`);
}

async function initialize(directory, params) {
  const response = await post(directory, { jsonrpc: '2.0', id: 'bridge-initialize', method: 'initialize', params });
  const initialized = await requireSuccess(response);
  if (initialized?.error) throw new Error('MCP session initialization failed.');
  const sessionId = response.headers.get('mcp-session-id');
  if (!sessionId) throw new Error('MCP initialization did not issue a session ID.');
  await requireSuccess(await post(directory, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId));
  return sessionId;
}

async function closeSession(directory, sessionId) {
  if (sessionId) {
    const response = await fetch(await endpoint(directory), { method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT), headers: { 'Mcp-Session-Id': sessionId, Accept: 'application/json, text/event-stream' } });
    if (!response.ok && response.status !== 404) throw new Error(`MCP session close failed: HTTP ${response.status}.`);
  }
}

function parseMessage(line) {
  try { return JSON.parse(line); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error('Invalid JSON-RPC input.');
  }
}

async function bridge(directory) {
  let sessionId, recovery, initializationParams;
  const pending = new Set();
  await endpoint(directory);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stopInput = () => { lines.close(); process.stdin.destroy(); };
  const forward = async (message) => {
    try {
      await recovery;
      const previous = sessionId;
      let response = await post(directory, message, previous);
      if (response.status === 404 && previous) {
        if (sessionId === previous && !recovery) recovery = initialize(directory, initializationParams).then((replacement) => { sessionId = replacement; }).finally(() => { recovery = undefined; });
        await recovery;
        response = await post(directory, message, sessionId);
      }
      sessionId = response.headers.get('mcp-session-id') ?? sessionId;
      const result = await requireSuccess(response);
      if (message?.method === 'initialize' && response.ok && result?.result && initializationParams === undefined) initializationParams = message.params;
      if (result !== undefined && !process.stdout.write(`${JSON.stringify(result)}\n`)) await once(process.stdout, 'drain');
    } catch (error) {
      if (message && Object.hasOwn(message, 'id')) {
        const response = { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: error instanceof Error ? error.message : 'MCP request forwarding failed.' } };
        if (!process.stdout.write(`${JSON.stringify(response)}\n`)) await once(process.stdout, 'drain');
      }
    }
  };
  process.on('SIGINT', stopInput);
  process.on('SIGTERM', stopInput);
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const message = parseMessage(line);
      if (!sessionId || message?.method === 'initialize' || message?.method === 'notifications/initialized') { await forward(message); continue; }
      const task = forward(message);
      pending.add(task);
      void task.finally(() => pending.delete(task));
    }
    await Promise.allSettled(pending);
  } finally {
    process.off('SIGINT', stopInput);
    process.off('SIGTERM', stopInput);
    stopInput();
    await Promise.allSettled(pending);
    await closeSession(directory, sessionId);
  }
}

try {
  const [directory, ...extra] = process.argv.slice(2);
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node 24 is required.');
  if (!directory || !isAbsolute(directory) || extra.length) throw new Error('Pass the absolute Agentic Story Mapper runtime directory as the only argument.');
  await bridge(resolve(directory));
} catch (error) {
  process.stderr.write(`Agentic Story Mapper MCP bridge failed: ${error.message}\n`, () => process.exit(1));
}
