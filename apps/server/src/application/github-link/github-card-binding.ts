import { randomUUID } from "node:crypto";
import { changeOperationSchema, DomainError, parseGitHubLocator, type ActorContext, type CreateGitHubLinkRequest, type IncomingGitHubCommandResponse } from "@storymapper/contracts";
import { createWorkItemProvider } from "@storymapper/github";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { beginGitHubPreparation, githubIncomingCommand, revalidateGitHubPreparation, syncRunOperation } from "@storymapper/server/application/sync/github-command";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { githubStatusCardsBefore, incomingGitHubStatus } from "@storymapper/server/services/github-status";
import { hashText } from "@storymapper/server/services/sync-values";
import { syncBaseline } from "@storymapper/server/services/sync-merge";

export async function bindGitHubCard(deps: ApplicationDeps, actor: ActorContext, input: CreateGitHubLinkRequest & { connectionId: string }): Promise<IncomingGitHubCommandResponse> {
  const card = input.cardId ? deps.repository.getCard(input.cardId) : undefined;
  const locator = parseGitHubLocator(input.url);
  if (!card || card.level === "note" || !locator || locator.resource !== "issues" || locator.repo !== input.repo.toLowerCase() || input.issueNumber !== undefined && input.issueNumber !== locator.number) throw new DomainError("validation", "Binding requires an existing Card and canonical GitHub Issue identity.");
  const context = beginGitHubPreparation(deps, actor, card.storyMapId, input.connectionId);
  const auth = await resolveProviderAuth(context.connection);
  revalidateGitHubPreparation(context);
  if (locator.repo !== `${context.connection.owner}/${context.connection.repository}`.toLowerCase()) throw new DomainError("validation", "Issue belongs to another connection repository.");
  const read = await createWorkItemProvider(context.connection.provider).getRemoteItem(auth.connection, auth.auth, String(locator.number));
  revalidateGitHubPreparation(context);
  if (read.status !== "found") throw new DomainError("not_found", "GitHub Issue is unavailable; existing data is retained.");
  const remote = read.item;
  if (parseGitHubLocator(remote.url)?.url !== locator.url || remote.remoteId !== String(locator.number)) throw new DomainError("conflict", "Provider returned a different Issue identity.");
  const status = incomingGitHubStatus(context.connection, remote);
  const existing = deps.repository.listRemoteWorkItemLinksForStoryMap(card.storyMapId).find((link) => link.cardId === card.id);
  if (existing) throw new DomainError("conflict", "Card already has a synchronization owner. Detach it before binding another Issue.");
  const ref = deps.repository.listExternalRefsForStoryMap(card.storyMapId).find((ref) => ref.entityType === "card" && ref.entityId === card.id && ref.system === "github");
  if (ref && ref.externalId !== locator.url) throw new DomainError("conflict", "Card already references a different GitHub Issue.");
  const externalRefId = ref?.id ?? randomUUID();
  const operations = ref ? [] : [changeOperationSchema.parse({ operationId: randomUUID(), entityId: externalRefId, baseVersion: card.version, op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: card.id, provider: "github", externalId: locator.url, scopeId: card.storyMapId } })];
  operations.push(changeOperationSchema.parse({ operationId: randomUUID(), op: "set", entity: "remoteWorkItemLink", before: null, connectionBefore: context.connection, statusCatalog: status.statusCatalog, statusCardsBefore: githubStatusCardsBefore(deps.repository, context.connection, status, context.preparedStatusCatalogs, card), baseVersion: card.version, after: { externalRefId, connectionId: input.connectionId, titleHash: hashText(remote.title), bodyHash: hashText(remote.body), remoteState: remote.state, statusEvidence: status.statusEvidence, labels: remote.labels, issueType: remote.issueType, baseline: syncBaseline(deps.repository, context.connection, { ...card, status: status.status }, remote), syncState: "synced", parentOverrideLocal: false } }));
  operations.push(syncRunOperation(context, "import"));
  return githubIncomingCommand(context, operations, "Bind an existing Card to GitHub and adopt its status.", input.apply, (outcome) => [{ status: outcome === "applied" ? "succeeded" : "proposed", cardId: card.id, remoteId: remote.remoteId, url: locator.url }]);
}
