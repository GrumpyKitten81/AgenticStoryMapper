import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import { buildSourceDocumentSummaries } from "@storymapper/core";
import { slugify } from "@storymapper/db";
import {
  DomainError,
  type ActorContext,
  type CapabilityDescriptor,
  type ImportSourceDocumentResponse,
  type ListSourceDocumentsResponse,
  type PreparedSourceDocumentImport,
  type SourceDocumentDetails
} from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";

export const importSourceDocumentDescriptor: CapabilityDescriptor = {
  name: "importSourceDocument",
  kind: "write",
  route: "POST /api/source-documents/import", tool: "ImportSourceDocument" };

export function importSourceDocument<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: PreparedSourceDocumentImport): DomainCommandResponse<A, ImportSourceDocumentResponse>;
export function importSourceDocument(deps: ApplicationDeps, actor: ActorContext, body: PreparedSourceDocumentImport): ImportSourceDocumentResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, input.projectId, "importSourceDocument", [domainOperation("sourceDocument", "import", undefined, { projectId: input.projectId, title: input.title, type: input.type, fileHash: input.fileHash, filePath: input.filePath ?? `inline://${slugify(input.title)}`, inlineContent: input.content })], apply);
  return deps.unitOfWork.run(actor, ({ repository }) => repository.importSourceDocument(input));
}

export const listSourceDocumentsDescriptor: CapabilityDescriptor = {
  name: "listSourceDocuments",
  kind: "read",
  route: "GET /api/source-documents", tool: "ListSourceDocuments" };

export function listSourceDocuments(deps: ApplicationDeps, actor: ActorContext, projectId?: string): ListSourceDocumentsResponse {
  requireActor(actor);
  return {
    documents: projectId ? buildSourceDocumentSummaries(deps.repository.listSourceDocumentSummaryData(projectId)) : []
  };
}

export const getSourceDocumentDescriptor: CapabilityDescriptor = {
  name: "getSourceDocument",
  kind: "read",
  route: "GET /api/source-documents/:documentId", tool: "GetSourceDocument" };

export function getSourceDocument(deps: ApplicationDeps, actor: ActorContext, documentId: string): SourceDocumentDetails {
  requireActor(actor);
  const document = deps.repository.getSourceDocumentDetails(documentId);
  if (!document) throw new DomainError("not_found", "Source document not found.");
  return document;
}
