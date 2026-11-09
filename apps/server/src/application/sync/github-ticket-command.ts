import { createHash } from "node:crypto";
import { DomainError, parseGitHubLocator, parseGitHubTicketSelector, lookupGitHubTicketRequestSchema, importGitHubTicketRequestSchema, type ActorContext, type GitHubTicketPlacement, type ImportGitHubTicketRequest, type ImportGitHubTicketResponse, type LookupGitHubTicketRequest, type LookupGitHubTicketResponse } from "@storymapper/contracts";
import { agentProtected, cardParentError, normalizeRemoteWorkItemTitle, stripGitHubIssueFooter, syncReleaseMetadata, visibleCards } from "@storymapper/core";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { beginGitHubPreparation, githubIncomingCommand, revalidateGitHubPreparation, syncRunOperation, type GitHubPreparation } from "@storymapper/server/application/sync/github-command";
import { singleIssueOperations } from "@storymapper/server/application/sync/github-import-command";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { localStatusForRemote } from "@storymapper/server/services/sync-values";
import { managedAnnotationMappings } from "@storymapper/server/services/sync-merge";

export async function lookupGitHubTicketCommand(deps: ApplicationDeps, actor: ActorContext, body: LookupGitHubTicketRequest): Promise<LookupGitHubTicketResponse> {
  const input = lookupGitHubTicketRequestSchema.parse(body);
  const context = beginGitHubPreparation(deps, actor, input.storyMapId, input.connectionId);
  const locator = ticketLocator(context, input);
  const scope = scopeEvidence(context, input.placement);
  const item = await readTicket(context, locator);
  return { ticket: { locator: locator.url, number: locator.number, title: normalizeRemoteWorkItemTitle(item.title), description: stripGitHubIssueFooter(item.body), ...(item.issueType ? { issueType: item.issueType } : {}) }, reviewEvidence: { ...scope, remoteHash: remoteEvidence(item) }, ...existingCard(context, locator.url) };
}

export async function importGitHubTicketCommand(deps: ApplicationDeps, actor: ActorContext, body: ImportGitHubTicketRequest): Promise<ImportGitHubTicketResponse> {
  const input = importGitHubTicketRequestSchema.parse(body);
  const context = beginGitHubPreparation(deps, actor, input.storyMapId, input.connectionId);
  const locator = ticketLocator(context, input);
  const duplicate = existingCard(context, locator.url).existingCardId;
  if (duplicate) return { outcome: "already_linked", cardId: duplicate, url: locator.url };
  const scope = scopeEvidence(context, input.placement);
  if (scope.epoch !== input.reviewEvidence.epoch || scope.scopeHash !== input.reviewEvidence.scopeHash) throw new DomainError("conflict", "Ticket placement or connection changed. Look up the Issue again to review it.");
  const item = await readTicket(context, locator);
  if (remoteEvidence(item) !== input.reviewEvidence.remoteHash) throw new DomainError("conflict", "The Issue changed after lookup. Look it up again to review it.");
  const currentDuplicate = existingCard(context, locator.url).existingCardId;
  if (currentDuplicate) return { outcome: "already_linked", cardId: currentDuplicate, url: locator.url };
  const imported = singleIssueOperations(context, item, { storyMapId: context.storyMapId, ...input.placement, title: input.title, description: input.description, status: input.status ?? localStatusForRemote(context.connection, item.state, item.labels, "todo"), ...(input.estimate !== undefined ? { estimate: input.estimate } : {}), ...(item.assignee ? { assignee: item.assignee } : {}) }, managedAnnotationMappings(deps.repository, context.connection, context.storyMapId));
  const baselineOperation = imported.operations.find((operation) => operation.entity === "remoteWorkItemLink");
  if (baselineOperation?.entity === "remoteWorkItemLink") baselineOperation.ticketPlacementBefore = { storyMap: deps.repository.getStoryMapOrThrow(context.storyMapId), parent: input.placement.parentId ? deps.repository.getCardDetails(input.placement.parentId)! : null, release: input.placement.releaseId ? deps.repository.getRelease(input.placement.releaseId)! : null };
  acknowledgeSelectedRelease(context, imported.operations, input.placement);
  const apply = agentProtected(deps.repository.getSafetySettings(context.connection.projectId)) ? false : input.apply;
  return githubIncomingCommand(context, [...imported.operations, syncRunOperation(context, "import")], "Import a GitHub Issue at the reviewed Card placement.", apply, (outcome) => [{ status: outcome === "applied" ? "succeeded" : "proposed", remoteId: item.remoteId, url: locator.url, ...(outcome === "applied" ? { cardId: existingCard(context, locator.url).existingCardId! } : {}) }]);
}

function ticketLocator(context: GitHubPreparation, input: LookupGitHubTicketRequest): NonNullable<ReturnType<typeof parseGitHubTicketSelector>> {
  validatePlacement(context, input.placement);
  if (!context.connection.repository) throw new DomainError("validation", "The selected connection has no repository; choose a connection with a repository to look up an Issue.");
  const locator = parseGitHubTicketSelector(input.selector, context.connection);
  if (!locator) throw new DomainError("validation", "Enter an Issue URL, owner/repository#number, or positive Issue number in the selected repository.");
  return locator;
}

function validatePlacement(context: GitHubPreparation, placement: GitHubTicketPlacement): void {
  const snapshot = context.deps.repository.getStoryMapSnapshot(context.storyMapId)!;
  const parent = placement.parentId ? visibleCards(snapshot.cards).find((card) => card.id === placement.parentId) : undefined;
  if (placement.parentId && !parent) throw new DomainError("conflict", "Selected parent Card is unavailable.");
  const parentError = cardParentError(context.storyMapId, placement.level, parent);
  if (parentError) throw new DomainError("validation", parentError);
  if (placement.releaseId && !snapshot.releases.some((release) => release.id === placement.releaseId)) throw new DomainError("conflict", "Selected Release is unavailable.");
}

function scopeEvidence(context: GitHubPreparation, placement: GitHubTicketPlacement): Pick<LookupGitHubTicketResponse["reviewEvidence"], "epoch" | "scopeHash"> {
  if (!context.epoch) throw new DomainError("conflict", "Database epoch is unavailable.");
  return { epoch: context.epoch, scopeHash: digest([context.epoch, context.connection, context.reviewedMap, placement]) };
}

async function readTicket(context: GitHubPreparation, locator: NonNullable<ReturnType<typeof parseGitHubTicketSelector>>): Promise<RemoteWorkItem> {
  const auth = await resolveProviderAuth(context.connection);
  revalidateGitHubPreparation(context);
  const read = await createWorkItemProvider(context.connection.provider).getRemoteItem(auth.connection, auth.auth, String(locator.number));
  revalidateGitHubPreparation(context);
  if (read.status === "unavailable") throw new DomainError("not_found", "Issue is missing or inaccessible. Check its number and repository access; GitHub may hide inaccessible Issues.");
  const item = read.item;
  if (/\/pull\/\d+$/.test(item.url)) throw new DomainError("validation", `#${locator.number} is a pull request, not an Issue.`);
  if (parseGitHubLocator(item.url)?.url !== locator.url || item.remoteId !== String(locator.number) || item.remoteNumber !== undefined && item.remoteNumber !== locator.number) throw new DomainError("conflict", "Provider returned a different Issue identity.");
  return item;
}

function existingCard(context: GitHubPreparation, url: string): { existingCardId?: string } {
  const ref = context.deps.repository.listExternalRefsForStoryMap(context.storyMapId).find((entry) => entry.system === "github" && entry.entityType === "card" && entry.scopeId === context.storyMapId && entry.externalId === url);
  return ref ? { existingCardId: ref.entityId } : {};
}

function remoteEvidence(item: RemoteWorkItem): string {
  return digest([item.remoteId, item.remoteNumber, parseGitHubLocator(item.url)?.url, item.title, item.body, item.state, [...item.labels].sort(), item.milestone, item.milestoneNumber, item.milestoneDueOn, item.milestoneDescription, item.milestoneState, item.assignee, item.issueType, item.parentNumber, item.iteration?.title, item.iteration?.startDate, item.iteration?.duration, item.statusEvidence, item.statusCatalog]);
}

function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function acknowledgeSelectedRelease(context: GitHubPreparation, operations: ReturnType<typeof singleIssueOperations>["operations"], placement: GitHubTicketPlacement): void {
  const link = operations.find((operation) => operation.entity === "remoteWorkItemLink");
  if (link?.entity !== "remoteWorkItemLink" || !link.after.baseline) return;
  link.after.baseline.pendingReleaseAssignment = false;
  const baseline = link.after.baseline.acknowledgedLocal;
  baseline.releaseMetadata = syncReleaseMetadata(context.connection, placement.releaseId ? context.deps.repository.getRelease(placement.releaseId) : undefined);
  baseline.milestone = placement.releaseId ? context.deps.repository.listExternalRefsForStoryMap(context.storyMapId).find((ref) => ref.system === "github" && ref.entityType === "release" && ref.entityId === placement.releaseId && parseGitHubLocator(ref.externalId)?.repo === `${context.connection.owner}/${context.connection.repository}`.toLowerCase())?.externalId ?? null : null;
}
