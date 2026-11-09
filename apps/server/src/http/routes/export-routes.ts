import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { DomainError, storyMapExportQuerySchema, auditExportQuerySchema, projectArchiveExportQuerySchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { requestHumanActor } from "@storymapper/server/http/request-origin";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/export/export.use-cases";
import { registerApplicationRoute } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

function sendExport(reply: FastifyReply, file: { contentType: string; fileName: string; content: string | Buffer }): FastifyReply {
  return reply.header("content-type", file.contentType).header("content-disposition", `attachment; filename="${file.fileName}"`).send(file.content);
}

export const exportRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.exportStoryMapDescriptor, (request, reply) => {
    const query = parseInput(storyMapExportQuerySchema, request.query);
    return sendExport(reply, useCases.exportStoryMap(application, actor, query.storyMapId, query.format));
  });
  registerApplicationRoute(server, useCases.exportAuditDescriptor, (request, reply) => {
    const query = parseInput(auditExportQuerySchema, request.query);
    return sendExport(reply, useCases.exportAudit(application, actor, query.projectId, query.format));
  });
  registerApplicationRoute(server, useCases.getProjectArchiveCapabilitiesDescriptor, () => useCases.getProjectArchiveCapabilities(application, actor));
  registerApplicationRoute(server, useCases.exportProjectArchiveDescriptor, async (request, reply) => {
    const query = parseInput(projectArchiveExportQuerySchema, request.query);
    return sendExport(reply, { ...await useCases.exportProjectArchive(application, actor, query.projectId), contentType: "application/zip" });
  });
  registerApplicationRoute(server, useCases.importProjectArchiveDescriptor, async (request) => {
    if (!request.isMultipart()) throw new DomainError("validation", "Archive upload must use multipart/form-data.");
    const upload = await request.file();
    if (!upload) throw new DomainError("validation", "No archive file was provided.");
    return useCases.importProjectArchive(application, requestHumanActor(), await upload.toBuffer());
  });
};
