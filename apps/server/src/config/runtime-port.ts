import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

export interface RuntimePort { host: string; port: number; owner: string }

export function readRuntimePort(directory: string): RuntimePort {
  const record: unknown = JSON.parse(readFileSync(join(directory, ".port"), "utf8"));
  if (!record || typeof record !== "object" || !("host" in record) || !["127.0.0.1", "localhost", "::1"].includes(String(record.host)) || !("port" in record) || typeof record.port !== "number" || !Number.isInteger(record.port) || record.port < 1 || record.port > 65535 || !("owner" in record) || typeof record.owner !== "string" || !record.owner) {
    throw new Error("Invalid Agentic Story Mapper runtime .port file.");
  }
  return record as RuntimePort;
}

export function runtimeUrl(runtime: RuntimePort): string {
  return `http://${runtime.host === "::1" ? "[::1]" : runtime.host}:${runtime.port}`;
}

export function getDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const repository = fileURLToPath(new URL("../../../../", import.meta.url));
  return resolve(repository, env.STORYMAPPER_DB_PATH ?? "local-projects/default.lsm/storymapper.sqlite");
}

export function installRuntimePort(server: FastifyInstance, databasePath: string, host: string): () => void {
  const directory = dirname(resolve(databasePath));
  const path = join(directory, ".port");
  const owner = server.hasDecorator("runtimeOwner") ? server.getDecorator<string>("runtimeOwner") : randomUUID();
  let published = false;
  const publish = () => {
    const address = server.server.address();
    if (!address || typeof address === "string") throw new Error("Agentic Story Mapper listener has no TCP port.");
    writeFileSync(path, JSON.stringify({ host, port: address.port, owner }), { flag: "wx" });
    published = true;
  };
  const cleanup = () => {
    if (!published) return;
    try {
      if (JSON.parse(readFileSync(path, "utf8")).owner === owner) unlinkSync(path);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  };
  if (server.hasDecorator("registerRuntimeCleanup")) server.getDecorator<(cleanup: () => void) => void>("registerRuntimeCleanup")(cleanup);
  else server.addHook("onClose", async () => { cleanup(); });
  return publish;
}

export async function listenOnAppPort(server: FastifyInstance, config: { host: string; port: number }, useAvailablePort: boolean): Promise<void> {
  try {
    await server.listen({ host: config.host, port: config.port });
  } catch (error) {
    if (!useAvailablePort || !(error instanceof Error) || !("code" in error) || error.code !== "EADDRINUSE") throw error;
    await server.listen({ host: config.host, port: 0 });
  }
}
