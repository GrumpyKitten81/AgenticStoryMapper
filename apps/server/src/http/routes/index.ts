import type { FastifyPluginAsync } from "fastify";
import { servedLoopbackOrigin } from "@storymapper/server/config/served-origin";
import type { StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { aiRoutes } from "@storymapper/server/http/routes/ai-routes";
import { cardRoutes } from "@storymapper/server/http/routes/card-routes";
import { changeSetRoutes } from "@storymapper/server/http/routes/changeset-routes";
import { connectorRoutes } from "@storymapper/server/http/routes/connector-routes";
import { customizationRoutes } from "@storymapper/server/http/routes/customization-routes";
import { exportRoutes } from "@storymapper/server/http/routes/export-routes";
import { githubLinkRoutes } from "@storymapper/server/http/routes/github-link-routes";
import { infrastructureRoutes } from "@storymapper/server/http/routes/infrastructure-routes";
import { personaRoutes } from "@storymapper/server/http/routes/persona-routes";
import { projectRoutes } from "@storymapper/server/http/routes/project-routes";
import { releaseRoutes } from "@storymapper/server/http/routes/release-routes";
import { reportRoutes } from "@storymapper/server/http/routes/report-routes";
import { restorePointRoutes } from "@storymapper/server/http/routes/restore-points";
import { roadmapRoutes } from "@storymapper/server/http/routes/roadmap-routes";
import { sourceDocumentRoutes } from "@storymapper/server/http/routes/source-document-routes";
import { storyMapRoutes } from "@storymapper/server/http/routes/story-map-routes";
import { syncRoutes } from "@storymapper/server/http/routes/sync-routes";
import { installRestoreRequestGate } from "@storymapper/server/http/restore-request-gate";

interface RouteOptions {
  repository: StoryMapperRepository;
  unitOfWork: UnitOfWork;
  databasePath: string;
  localOrigin?: () => string;
}

export const createRoutes: FastifyPluginAsync<RouteOptions> = async (server, { repository, unitOfWork, databasePath, localOrigin: suppliedOrigin }) => {
  installRestoreRequestGate(server, unitOfWork.handle);
  const localOrigin = suppliedOrigin ?? (() => servedLoopbackOrigin(server));
  await server.register(restorePointRoutes, { repository, unitOfWork });



  await server.register(storyMapRoutes, { repository, unitOfWork, databasePath });
  await server.register(cardRoutes, { repository, unitOfWork, databasePath });
  await server.register(releaseRoutes, { repository, unitOfWork, databasePath });
  await server.register(personaRoutes, { repository, unitOfWork, databasePath });
  await server.register(sourceDocumentRoutes, { repository, unitOfWork, databasePath });
  await server.register(changeSetRoutes, { repository, unitOfWork, databasePath });
  await server.register(syncRoutes, { repository, unitOfWork, databasePath, localOrigin });
  await server.register(projectRoutes, { repository, unitOfWork, databasePath });
  await server.register(customizationRoutes, { repository, unitOfWork, databasePath });
  await server.register(roadmapRoutes, { repository, unitOfWork, databasePath });
  await server.register(reportRoutes, { repository, unitOfWork, databasePath });
  await server.register(exportRoutes, { repository, unitOfWork, databasePath });
  await server.register(connectorRoutes, { repository, unitOfWork, databasePath });
  await server.register(githubLinkRoutes, { repository, unitOfWork, databasePath, localOrigin });
  await server.register(aiRoutes, { repository, unitOfWork, databasePath });

  await server.register(infrastructureRoutes, { repository, unitOfWork, databasePath, localOrigin });
};
