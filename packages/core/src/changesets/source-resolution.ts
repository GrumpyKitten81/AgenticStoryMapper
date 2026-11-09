import { retireGitHubSync } from "@storymapper/core/changesets/github-identity";
import { sourceDocumentSchema, sourceChunkSchema, type CardSourceLink, type ChangeOperation, type GitHubLink } from "@storymapper/contracts";
import { projectSourceLinks } from "@storymapper/core/changesets/github-evidence";
import { ownValue } from "@storymapper/core/changesets/supply-values";
import type { ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { allocatedId, assertBaseline, bumpVersion, cardOwner, mapOwner, projectOwner, readDependency, referenceId, refuse } from "@storymapper/core/changesets/resolution-context";

export function validateChunk(context: ResolutionContext, chunkId: string, preparedImport = false): void {
  if (!preparedImport && !context.persistedChunkIds.has(chunkId)) refuse(context, "Literal source chunk requires persisted ownership; use an earlier import locator.");
  const chunk = context.state.sourceChunks.find((entry) => entry.id === chunkId);
  const document = chunk && context.state.sourceDocuments.find((entry) => entry.id === chunk.documentId);
  if (!document || document.projectId !== context.state.projectId) refuse(context, "Source chunk is unknown or belongs to another Project.");
}

export function importSource(context: ResolutionContext): void {
  const { after } = context.operation as Extract<ChangeOperation, { entity: "sourceDocument" }>;
  projectOwner(context, after.projectId);
  const prepared = ownValue(context.supply.preparedSourceImports, context.operation.operationId);
  if (!prepared) refuse(context, "Application must supply prepared source document and chunks.");
  const parsedDocument = sourceDocumentSchema.safeParse(prepared.document);
  const parsedChunks = sourceChunkSchema.array().safeParse(prepared.chunks);
  if (!parsedDocument.success || !parsedChunks.success) refuse(context, "Prepared source document or chunks violate domain schemas.");
  const document = parsedDocument.data;
  const chunks = parsedChunks.data;
  for (const field of ["projectId", "title", "type", "fileHash"] as const) if (document[field] !== after[field]) refuse(context, "Prepared source differs from the approved import.");
  if (after.filePath !== undefined && document.filePath !== after.filePath) refuse(context, "Prepared source path differs from the approved import.");
  const existing = context.state.sourceDocuments.find((entry) => entry.projectId === after.projectId && entry.type === after.type && entry.fileHash === after.fileHash);
  if (existing) { context.importedDocuments.set(context.operation.operationId, existing.id); readDependency(context, "sourceDocument", existing.id); return; }
  if (document.id !== allocatedId(context)) refuse(context, "Prepared source document does not use its allocated identity.");
  const locators = new Set<string>();
  const ids = new Set(context.state.sourceChunks.map((chunk) => chunk.id));
  for (const chunk of chunks) {
    if (chunk.documentId !== document.id || !chunk.locator || locators.has(chunk.locator) || ids.has(chunk.id)) refuse(context, "Prepared source chunk identity or locator is invalid.");
    locators.add(chunk.locator); ids.add(chunk.id);
  }
  context.state.sourceDocuments.push(structuredClone(document));
  context.state.sourceChunks.push(...structuredClone(chunks));
  context.importedDocuments.set(context.operation.operationId, document.id);
}

function importedChunk(context: ResolutionContext, operationId: string, locator: string): string {
  const documentId = context.importedDocuments.get(operationId);
  if (!documentId) refuse(context, "Unknown or forward source-import reference.");
  const chunk = context.state.sourceChunks.find((entry) => entry.documentId === documentId && entry.locator === locator);
  if (!chunk) refuse(context, "Unknown source-import locator.");
  context.dependencies.add(operationId);
  return chunk.id;
}

export function validateGithub(context: ResolutionContext, id: string): GitHubLink {
  const identity = context.state.githubLinks.find((entry) => entry.id === id);
  if (!identity || identity.issueNumber === undefined) refuse(context, "GitHub Issue evidence is unknown.");
  const retained = context.state.retainedGithubRefProjects?.[identity.id];
  if (retained && retained !== context.state.projectId) refuse(context, "GitHub Issue belongs to another Project.");
  if (retained && !context.state.cards.some((card) => card.id === identity.cardId) && !context.state.releases.some((release) => release.id === identity.releaseId)) { projectOwner(context, retained); readDependency(context, "githubExternalRef", identity.id); return identity; }
  if (identity.cardId) cardOwner(context, identity.cardId);
  else if (identity.releaseId) {
    const release = context.state.releases.find((entry) => entry.id === identity.releaseId);
    if (!release) refuse(context, "GitHub Release owner is unknown.");
    mapOwner(context, release.storyMapId);
  } else refuse(context, "GitHub identity has no owning root.");
  return identity;
}

function githubSources(context: ResolutionContext, identity: GitHubLink): CardSourceLink[] {
  return projectSourceLinks(context.state).filter((entry) => entry.kind === "github" && entry.externalRefId === identity.id);
}

export function linkSource(context: ResolutionContext): void {
  const { after } = context.operation as Extract<ChangeOperation, { entity: "sourceLink", op: "link" }>;
  const cardId = referenceId(context, "card", after.cardId);
  cardOwner(context, cardId);
  const card = context.state.cards.find((entry) => entry.id === cardId)!;
  assertBaseline(context, card.version, card.id);
  let link: CardSourceLink;
  if (after.kind === "chunk") {
    const chunkId = "chunkId" in after ? after.chunkId : after.chunk.kind === "chunk" ? after.chunk.chunkId : importedChunk(context, after.chunk.operationId, after.chunk.locator);
    validateChunk(context, chunkId, "chunk" in after && after.chunk.kind === "import");
    if (context.state.sourceLinks.some((entry) => entry.kind === "chunk" && entry.cardId === cardId && entry.chunkId === chunkId)) return;
    link = { kind: "chunk", id: allocatedId(context), cardId, chunkId, confidence: after.confidence ?? null, createdAt: context.supply.createdAt };
  } else if (after.kind === "github") {
    const identity = validateGithub(context, after.externalRefId);
    if (githubSources(context, identity).some((entry) => entry.cardId === cardId)) return;
    link = { kind: "github", id: allocatedId(context), cardId, externalRefId: identity.id, repoFullName: identity.repo, issueNumber: identity.issueNumber!, url: identity.url };
  } else {
    if (context.state.sourceLinks.some((entry) => entry.kind === "note" && entry.cardId === cardId && entry.note === after.note)) return;
    link = { kind: "note", id: allocatedId(context), cardId, note: after.note, createdAt: context.supply.createdAt };
  }
  context.state.sourceLinks.push(link);
  reconcileEvidence(context, cardId);
}

export function unlinkSource(context: ResolutionContext): void {
  const { after } = context.operation as Extract<ChangeOperation, { entity: "sourceLink", op: "unlink" }>;
  const cardId = referenceId(context, "card", after.cardId);
  cardOwner(context, cardId);
  assertBaseline(context, context.state.cards.find((entry) => entry.id === cardId)!.version, cardId);
  const identity = after.kind === "github" ? context.state.githubLinks.find((entry) => entry.id === after.id && entry.cardId === cardId) : undefined;
  const link = context.state.sourceLinks.find((entry) => entry.id === after.id);
  if (link && (link.cardId !== cardId || link.kind !== after.kind)) refuse(context, "Source evidence does not match the target Card and kind.");
  if (!link && !identity) refuse(context, "Source evidence is unknown.");
  if (identity) {
    const affected = githubSources(context, identity).map((entry) => entry.cardId);
    context.state.githubLinks = context.state.githubLinks.filter((entry) => entry.id !== identity.id);
    context.state.externalRefs = context.state.externalRefs.filter((entry) => entry.id !== identity.id);
    retireGitHubSync(context.state, identity.id);
    context.state.sourceLinks = context.state.sourceLinks.filter((entry) => entry.kind !== "github" || entry.externalRefId !== identity.id);
    for (const id of new Set(affected)) { cardOwner(context, id); reconcileEvidence(context, id); }
  } else {
    context.state.sourceLinks = context.state.sourceLinks.filter((entry) => entry.id !== after.id);
    reconcileEvidence(context, cardId);
  }
}

function reconcileEvidence(context: ResolutionContext, cardId: string): void {
  const card = context.state.cards.find((entry) => entry.id === cardId)!;
  const linked = context.state.sourceLinks.some((entry) => entry.cardId === cardId) || context.state.githubLinks.some((entry) => entry.cardId === cardId && entry.issueNumber !== undefined);
  card.provenance = linked ? "linked" : card.creationOrigin;
  bumpVersion(context, card);
}
