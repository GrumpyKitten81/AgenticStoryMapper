import { bindGitHubCard } from "@storymapper/server/application/github-link/github-card-binding";
import { domainOperation, domainRoot, nonHumanCommand, type DomainCommandResponse } from "@storymapper/server/application/changeset/domain-command";
import { parseGitHubLocator, DomainError } from "@storymapper/contracts";
import type { ChangeSetCommandResponse } from "@storymapper/contracts";
import type { ActorContext, CapabilityDescriptor, CreateGitHubLinkRequest, UpdateGitHubLinkRequest, CreateGitHubIssueDryRunRequest, GitHubIssueDryRunResponse, GitHubLinkResponse, GitHubLinksWithHealthResponse, GitHubSyncHealthReport, OkResponse } from "@storymapper/contracts";
import { buildGitHubSyncHealthReport } from "@storymapper/core";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity, requirePatch } from "@storymapper/server/application/validation";

export const listGitHubLinksDescriptor: CapabilityDescriptor = { name: "listGitHubLinks", kind: "read", tool: "ListGitHubLinks", route: "GET /api/github/links" };
export function listGitHubLinks(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): GitHubLinksWithHealthResponse {
  requireActor(actor);
  const data = deps.repository.getGitHubSyncHealthData(storyMapId);
  return { links: deps.repository.listGitHubLinksForStoryMap(storyMapId), syncHealth: data ? buildGitHubSyncHealthReport(data) : undefined };
}

export const createGitHubLinkDescriptor: CapabilityDescriptor = { name: "createGitHubLink", kind: "write", route: "POST /api/github/links", tool: "CreateGitHubLink" };
export function createGitHubLink<A extends ActorContext>(deps: ApplicationDeps, actor: A, body: CreateGitHubLinkRequest): DomainCommandResponse<A, GitHubLinkResponse> | Promise<import("@storymapper/contracts").IncomingGitHubCommandResponse>;
export function createGitHubLink(deps: ApplicationDeps, actor: ActorContext, body: CreateGitHubLinkRequest): GitHubLinkResponse | ChangeSetCommandResponse | Promise<import("@storymapper/contracts").IncomingGitHubCommandResponse> {
  if (body.connectionId) return bindGitHubCard(deps, actor, { ...body, connectionId: body.connectionId });
  const { apply, connectionId: _connectionId, ...input } = body;
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, deps.repository.resolveGitHubLinkProjectId(input.cardId, input.releaseId), "createGitHubLink", [domainOperation("githubExternalRef", "create", undefined, canonicalInput(deps, input), linkVersion(deps, input))], apply);
  return { link: deps.unitOfWork.run(actor, ({ repository }) => repository.createGitHubLink(input)) };
}

export const updateGitHubLinkDescriptor: CapabilityDescriptor = { name: "updateGitHubLink", kind: "write", route: "PATCH /api/github/links/:linkId", tool: "UpdateGitHubLink" };
export function updateGitHubLink<A extends ActorContext>(deps: ApplicationDeps, actor: A, linkId: string, body: UpdateGitHubLinkRequest): DomainCommandResponse<A, GitHubLinkResponse>;
export function updateGitHubLink(deps: ApplicationDeps, actor: ActorContext, linkId: string, body: UpdateGitHubLinkRequest): GitHubLinkResponse | ChangeSetCommandResponse {
  const { apply, ...input } = body;
  requirePatch(input);
  const projectId = linkProjectId(deps, linkId);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, projectId, "updateGitHubLink", [domainOperation("githubExternalRef", "update", linkId, canonicalInput(deps, updatedIdentity(deps, linkId, input)), linkVersion(deps, requireEntity(deps.repository.getGitHubLink(linkId), "GitHub link")))], apply);
  return { link: requireEntity(deps.unitOfWork.run(actor, ({ repository }) => repository.updateGitHubLink(linkId, input)), "GitHub link") };
}

export const deleteGitHubLinkDescriptor: CapabilityDescriptor = { name: "deleteGitHubLink", kind: "write", route: "DELETE /api/github/links/:linkId", tool: "DeleteGitHubLink" };
export function deleteGitHubLink<A extends ActorContext>(deps: ApplicationDeps, actor: A, linkId: string, apply?: boolean): DomainCommandResponse<A, OkResponse>;
export function deleteGitHubLink(deps: ApplicationDeps, actor: ActorContext, linkId: string, apply?: boolean): OkResponse | ChangeSetCommandResponse {
  const projectId = linkProjectId(deps, linkId);
  if (actor.actorType !== "human") return nonHumanCommand(deps, actor, projectId, "deleteGitHubLink", [domainOperation("githubExternalRef", "delete", linkId, {}, linkVersion(deps, requireEntity(deps.repository.getGitHubLink(linkId), "GitHub link")))], apply);
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => repository.deleteGitHubLink(linkId)) };
}

function linkProjectId(deps: ApplicationDeps, linkId: string): string {
  const link = requireEntity(deps.repository.getGitHubLink(linkId), "GitHub link");
  return deps.repository.resolveGitHubLinkProjectId(link.cardId, link.releaseId);
}

function linkVersion(deps: ApplicationDeps, link: { cardId?: string | undefined; releaseId?: string | undefined }): number {
  return link.cardId ? domainRoot(deps, "card", link.cardId).version : domainRoot(deps, "release", requireEntity(link.releaseId, "Release")).version;
}

export const getGitHubSyncHealthDescriptor: CapabilityDescriptor = { name: "getGitHubSyncHealth", kind: "read", route: "GET /api/github/sync-health", tool: "GetGitHubSyncHealth" };
export function getGitHubSyncHealth(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): GitHubSyncHealthReport {
  requireActor(actor);
  return buildGitHubSyncHealthReport(requireEntity(deps.repository.getGitHubSyncHealthData(storyMapId), "Story map"));
}

export const createGitHubIssueDryRunDescriptor: CapabilityDescriptor = { name: "createGitHubIssueDryRun", kind: "write", route: "POST /api/github/issue-dry-run", tool: "CreateGitHubIssueDryRun" };
export function createGitHubIssueDryRun(deps: ApplicationDeps, actor: ActorContext, body: CreateGitHubIssueDryRunRequest): GitHubIssueDryRunResponse {
  return { dryRuns: deps.unitOfWork.run(actor, ({ repository }) => repository.createGitHubIssueDryRun({ ...body, localOrigin: deps.localOrigin?.() })) };
}

function canonicalInput(deps: ApplicationDeps, input: CreateGitHubLinkRequest): { entityType: "card" | "release"; entityId: string; externalId: string; scopeId: string } {
  const locator = parseGitHubLocator(input.url);
  if (!locator || Boolean(input.cardId) === Boolean(input.releaseId) || locator.repo !== input.repo.toLowerCase() || input.issueNumber !== undefined && (locator.resource !== "issues" || locator.number !== input.issueNumber)) throw new DomainError("validation", "GitHub identity, owner and locator must agree.");
  const entityType = input.cardId ? "card" : "release";
  const entityId = (input.cardId ?? input.releaseId)!;
  const owner = requireEntity(entityType === "card" ? deps.repository.getCard(entityId) : deps.repository.getRelease(entityId), "GitHub owner");
  return { entityType, entityId, externalId: locator.url, scopeId: owner.storyMapId };
}

function updatedIdentity(deps: ApplicationDeps, id: string, input: UpdateGitHubLinkRequest): CreateGitHubLinkRequest {
  const merged = { ...requireEntity(deps.repository.getGitHubLink(id), "GitHub link"), ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
  if (input.cardId) merged.releaseId = undefined;
  if (input.releaseId) merged.cardId = undefined;
  if (input.url) {
    const locator = parseGitHubLocator(input.url);
    if (!locator) throw new DomainError("validation", "GitHub reference requires a canonical locator.");
    merged.repo = input.repo ?? locator.repo;
    merged.issueNumber = input.issueNumber ?? (locator.resource === "issues" ? locator.number : undefined);
  }
  return merged;
}
