export function redact(value, env = process.env) {
  let text = String(value);
  for (const [key, secret] of Object.entries(env)) {
    if (/token|secret|password|credential|authorization|api[_-]?key/i.test(key) && secret) {
      for (const value of new Set([secret, ...secret.split(/\r\n|[\r\n]/).filter(Boolean)])) {
        for (const representation of [JSON.stringify(value).slice(1, -1), value]) text = text.split(representation).join('[redacted]');
      }
    }
  }
  return text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+/gi, '$1 [redacted]')
    .replace(/(["']?[\w-]*(?:token|secret|password|credential|authorization|api[_-]?key)[\w-]*["']?\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, '$1[redacted]');
}

export function failure(message, fix, cause) {
  return new Error(`${message} Next action: ${fix}`, cause ? { cause } : undefined);
}

export function nativeFailure(cause) {
  return failure('better-sqlite3 could not load its native binding.', 'Under the same installed Node 24 runtime, run corepack pnpm --filter @storymapper/db rebuild better-sqlite3.', cause);
}

export function portFailure(port, holder = 'unknown process', cause) {
  return failure(`Port ${port} is occupied by ${holder} (EADDRINUSE).`, 'Change or remove the process PORT override, which takes precedence over .env, or choose another PORT in the optional root .env; then run node scripts/start.mjs.', cause);
}

export function renderFailure(error, debug = false, env = process.env) {
  const text = debug ? [error.stack ?? error.message, error.cause?.stack ?? error.cause?.message].filter(Boolean).join('\nCaused by: ') : error.message;
  return redact(text, env);
}
