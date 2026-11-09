import type { FastifyPluginAsync } from "fastify";
import { importSourceDocumentRequestSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { replyWithError } from "@storymapper/server/application/errors";
import { parseInput } from "@storymapper/server/application/http/validate";
import {
  getSourceDocument,
  importSourceDocument,
  listSourceDocuments
} from "@storymapper/server/application/source-document/source-document.use-cases";
import { prepareSourceDocumentImport } from "@storymapper/server/services/prepare-source-document-import";
import type { RouteDeps } from "@storymapper/server/http/routes/route-deps";
import { toApplicationDeps } from "@storymapper/server/http/routes/route-deps";

export const sourceDocumentRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;

  server.post("/api/source-documents/import", async (request, reply) => {
    try {
      const body = parseInput(importSourceDocumentRequestSchema, request.body);
      let prepared;
      try {
        prepared = prepareSourceDocumentImport(body);
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string" || !error.code.startsWith("E")) throw error;
        request.log.error({ err: error }, "Source document import failed before unit of work");
        return reply.code(500).send({ code: "internal", message: error.message });
      }
      const document = importSourceDocument(application, actor, prepared);
      return reply.code(document.status === "imported" ? 201 : 200).send(document);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.get("/api/source-documents", async (request, reply) => {
    try {
      const projectId = (request.query as { projectId?: string }).projectId;
      return listSourceDocuments(application, actor, projectId);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });

  server.get("/api/source-documents/:documentId", async (request, reply) => {
    try {
      const { documentId } = request.params as { documentId: string };
      return getSourceDocument(application, actor, documentId);
    } catch (error) {
      return replyWithError(reply, error, request.log);
    }
  });
};
