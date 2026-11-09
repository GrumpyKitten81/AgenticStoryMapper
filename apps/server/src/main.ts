import { dirname } from "node:path";
import type { FastifyInstance } from "fastify";
import { loadLocalEnv } from "@storymapper/server/config/local-env";
import { getRuntimeConfig, isLoopbackHost } from "@storymapper/server/config/runtime";
import { getDatabasePath, installRuntimePort, listenOnAppPort } from "@storymapper/server/config/runtime-port";
import { failure, nativeFailure, portFailure, redact, renderFailure } from "@storymapper/server/config/failures.mjs";

let server: FastifyInstance | undefined;
const debug = process.argv.includes("--debug");
let shutdown: Promise<void> | undefined;

function shutDown(): Promise<void> {
  shutdown ??= finishShutdown();
  return shutdown;
}

async function finishShutdown(): Promise<void> {
  try {
    await server?.close();
  } catch (error) {
    process.stderr.write(`${renderFailure(failure("Agentic Story Mapper server failed to shut down.", "Stop the process and run node scripts/doctor.mjs.", error), debug)}\n`);
    process.exit(1);
  }
  process.exit(0);
}

function startupFailure(error: unknown): Error {
  const cause = error instanceof Error ? error : new Error(String(error));
  const code = "code" in cause ? cause.code : undefined;
  if (cause.message.includes(" Next action: ")) return cause;
  if (code === "EADDRINUSE") return portFailure(getRuntimeConfig().port, "unknown process", cause);
  if (code === "ERR_DLOPEN_FAILED" || /better[-_]sqlite3|bindings file|NODE_MODULE_VERSION/.test(cause.message)) return nativeFailure(cause);
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return failure("Installed server dependencies are missing.", "Run node scripts/setup.mjs.", cause);
  if (code === "EEXIST" && "path" in cause && typeof cause.path === "string" && cause.path.endsWith(".port")) return failure(`A runtime port file already exists: ${cause.path}.`, "If no Agentic Story Mapper server is running, delete this .port file and restart.", cause);
  const databaseMkdirFailure = "syscall" in cause && cause.syscall === "mkdir" && ["ENOTDIR", "EEXIST", "EACCES", "EPERM", "EISDIR"].includes(String(code));
  if (databaseMkdirFailure || ["SQLITE_CANTOPEN", "SQLITE_READONLY"].includes(String(code)) || /unable to open database|Cannot open database|database is readonly/i.test(cause.message)) {
    const directory = "path" in cause && typeof cause.path === "string" ? cause.path : process.env.STORYMAPPER_DB_PATH ? dirname(process.env.STORYMAPPER_DB_PATH) : "local-projects/default.lsm";
    return failure(`Project database directory cannot be opened: ${directory}.`, "Make this path a writable directory with readable/writable database files, or set STORYMAPPER_DB_PATH to a database file inside a writable directory; then restart.", cause);
  }
  if (/^(Non-loopback HOST requires|PORT must be)/.test(cause.message)) return failure(cause.message, "Set HOST to a loopback address and PORT to a number from 1 to 65535, or explicitly opt in to direct remote binding with STORYMAPPER_ALLOW_REMOTE_HOST=true.", cause);
  return failure(cause.message, "Run node scripts/doctor.mjs, repair failed checks and restart.", cause);
}

try {
  loadLocalEnv();
  for (const arg of process.argv.slice(2)) {
    if (arg !== "--dev" && arg !== "--debug") throw failure("Unknown server argument.", "Use only --dev or --debug with the server command.");
  }
  const runtimeConfig = getRuntimeConfig();
  // DESIGN: IPC-owned starts require loopback even with explicit remote binding opt-in.
  if (process.send && !isLoopbackHost(runtimeConfig.host)) throw new Error("Launcher requires a loopback HOST.");
  const { buildServer } = await import("@storymapper/server/server");
  server = await buildServer({ development: process.argv.includes("--dev"), runtimeConfig });
  // DESIGN: Abrupt launcher SIGKILL drops IPC; stop the owned server so ports do not leak.
  if (process.send) {
    process.on("disconnect", () => { void shutDown(); });
    process.on("message", (message: unknown) => {
      if (message && typeof message === "object" && "type" in message && message.type === "shutdown") void shutDown();
    });
  }
  const { host } = runtimeConfig;
  const publishPort = installRuntimePort(server, getDatabasePath(), host);
  if (!isLoopbackHost(host)) server.log.warn({ host }, "Remote binding enabled by STORYMAPPER_ALLOW_REMOTE_HOST=true; only loopback Host authorities are admitted");
  await listenOnAppPort(server, runtimeConfig, process.env.PORT === undefined);
  publishPort();
  const address = server.server.address();
  if (!address || typeof address === "string") throw new Error("Agentic Story Mapper listener has no TCP port.");
  const port = address.port;
  const displayHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const url = `http://${displayHost}:${port}`;
  process.send?.({ type: "listening", url });
  server.log.info(`Agentic Story Mapper server listening on ${url}`);
  process.once("SIGINT", () => { void shutDown(); });
  process.once("SIGTERM", () => { void shutDown(); });
} catch (error) {
  try { await server?.close(); }
  catch (cleanupError) { error = new AggregateError([error, cleanupError], "Agentic Story Mapper startup and cleanup failed."); }
  const diagnostic = startupFailure(error);
  if (process.send) {
    const [message, fix] = diagnostic.message.split(" Next action: ");
    process.send({ type: "startup-error", message: redact(message), fix: redact(fix), ...(debug ? { details: renderFailure(diagnostic, true) } : {}) }, () => process.exit(1));
  } else {
    process.stderr.write(`${renderFailure(diagnostic, debug)}\n`, () => process.exit(1));
  }
}
