import { dirname, join } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";
import { registerWebApp, validateWebBuild } from "@storymapper/server/http/web-app";
import { installRestoreRequestGate } from "@storymapper/server/http/restore-request-gate";
import { getRuntimeConfig, type RuntimeConfig } from "@storymapper/server/config/runtime";
import { installRequestSecurity } from "@storymapper/server/http/request-security";
import { getDatabasePath } from "@storymapper/server/config/runtime-port";
import { registerMcpHttp } from "@storymapper/server/mcp/http";
import { ProjectOwnership } from "@storymapper/server/config/project-lock";
import { createRuntimeLog } from "@storymapper/server/config/runtime-log";
import { requestActor } from "@storymapper/server/http/request-origin";
import { registerLiveEvents } from "@storymapper/server/http/live-events";

interface ServerOptions {
  development?: boolean;
  webBuildDirectory?: string;
  runtimeConfig?: RuntimeConfig;
}

function installOwnedShutdown(server: FastifyInstance, ownership: ProjectOwnership, current: () => DatabaseHandle | undefined): void {
  const runtimeCleanup: Array<() => void> = [];
  server.decorate("registerRuntimeCleanup", (cleanup: () => void) => { runtimeCleanup.push(cleanup); });
  server.decorate("runtimeOwner", ownership.owner);
  server.addHook("onClose", async () => {
    const handle = current();
    if (handle?.current.$client.open) {
      const result = handle.current.$client.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
      if (result[0]?.busy) throw new Error("Shutdown checkpoint is busy; ownership is retained.");
      handle.current.$client.close();
    }
    for (const cleanup of runtimeCleanup) cleanup();
    ownership.close();
  });
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const runtimeConfig = options.runtimeConfig ?? getRuntimeConfig();
  const databasePath = getDatabasePath();
  const webBuildDirectory = options.development ? undefined : validateWebBuild(options.webBuildDirectory);
  const takeovers: Array<{ pid: number; processStartTime: string }> = [];
  let logTakeover = (owner: { pid: number; processStartTime: string }) => { takeovers.push(owner); };
  const ownership = new ProjectOwnership(databasePath, (owner) => logTakeover(owner));
  let server: FastifyInstance;
  try {
    server = Fastify({
      return503OnClosing: false,
      http: { requireHostHeader: false },
      bodyLimit: 26_214_400,
      logger: { level: process.env.LOG_LEVEL ?? "info", stream: createRuntimeLog(join(dirname(databasePath), "logs")) }
    });
  } catch (error) { ownership.close(); throw error; }
  logTakeover = (owner) => server.log.warn(`Reclaimed dead Project owner PID ${owner.pid}, process start time ${owner.processStartTime}.`);
  let handle: DatabaseHandle | undefined;
  installOwnedShutdown(server, ownership, () => handle);
  try {
    for (const owner of takeovers) logTakeover(owner);
    installRequestSecurity(server, runtimeConfig.port, options.development === true);
    if (options.development) await server.register(cors, { origin: ["http://127.0.0.1:5173", "http://localhost:5173"] });
    await server.register(multipart, { limits: { fileSize: 209_715_200 } });
    handle = new DatabaseHandle(openStoryMapperDb(databasePath, (outcome) => server.log.info(outcome)), ownership);
    installRestoreRequestGate(server, handle);
    const repository = new StoryMapperRepository(handle);
    const unitOfWork = new UnitOfWork(handle, undefined, requestActor, (error) => server.log.error({ err: error }, "Post-commit publication failed; database changes remain committed."));
    unitOfWork.run({ actorType: "system", actorId: "sample-initialization" }, (tx) => tx.repository.ensureSeedData());
    registerMcpHttp(server, repository, unitOfWork);
    registerLiveEvents(server, handle, unitOfWork);
    await server.register(createRoutes, { repository, unitOfWork, databasePath });
    if (webBuildDirectory) await registerWebApp(server, webBuildDirectory);
    return server;
  } catch (error) { await server.close(); throw error; }
}
