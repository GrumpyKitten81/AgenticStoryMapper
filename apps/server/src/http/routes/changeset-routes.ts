import { changeSetPreviewQuerySchema, changeSetSelectionRequestSchema, uuidSchema } from "@storymapper/contracts";
import type { FastifyPluginAsync } from "fastify";
import { previewChangeSet, previewChangeSetDescriptor } from "@storymapper/server/application/changeset/preview-changeset.use-cases";
import { localHumanActor } from "@storymapper/server/application/actors";
import { asDomainError, replyWithError } from "@storymapper/server/application/errors";
import {
  applyChangeSet,
  approveChangeSet,
  listChangeSets,
  rejectChangeSet
} from "@storymapper/server/application/changeset/changeset.use-cases";
import type { RouteDeps } from "@storymapper/server/http/routes/route-deps";
import { toApplicationDeps } from "@storymapper/server/http/routes/route-deps";
import { proposeGitHubBoard, proposeGitHubBoardDescriptor, proposeStoryMapCopy, proposeStoryMapCopyDescriptor } from "@storymapper/server/application/changeset/tool-proposals.use-cases";
import { registerApplicationRoute } from "@storymapper/server/http/routes/application-route";

export const changeSetRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, previewChangeSetDescriptor, (request) => previewChangeSet(application, actor, uuidSchema.parse((request.params as { changeSetId: string }).changeSetId), changeSetPreviewQuerySchema.parse(request.query).selectedOperationIds));
  registerApplicationRoute(server, proposeGitHubBoardDescriptor, (request) => proposeGitHubBoard(application, actor, request.body));
  registerApplicationRoute(server, proposeStoryMapCopyDescriptor, (request) => proposeStoryMapCopy(application, actor, request.body));

  server.get("/api/changesets", async (request, reply) => {
    try {
      const projectId = (request.query as { projectId?: string }).projectId;
      return listChangeSets(application, actor, projectId);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.post("/api/changesets/:changeSetId/approve", async (request, reply) => {
    try {
      const { changeSetId } = request.params as { changeSetId: string };
      return approveChangeSet(application, actor, uuidSchema.parse(changeSetId), changeSetSelectionRequestSchema.parse(request.body ?? {}).selectedOperationIds);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.post("/api/changesets/:changeSetId/reject", async (request, reply) => {
    try {
      const { changeSetId } = request.params as { changeSetId: string };
      return rejectChangeSet(application, actor, changeSetId);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.post("/api/changesets/:changeSetId/apply", async (request, reply) => {
    try {
      const { changeSetId } = request.params as { changeSetId: string };
      return applyChangeSet(application, actor, uuidSchema.parse(changeSetId), changeSetSelectionRequestSchema.parse(request.body ?? {}).selectedOperationIds);
    } catch (error) {
      return replyWithError(reply, asDomainError(error), request.log);
    }
  });
};
