import { DomainError, githubStatusSourceKey, type Card, type ConnectorConnection, type GitHubStatusCatalog, type GitHubStatusEvidence } from "@storymapper/contracts";
import { resolveGitHubStatus } from "@storymapper/core";
import type { RemoteWorkItem } from "@storymapper/github";

export function incomingGitHubStatus(connection: ConnectorConnection, remote: RemoteWorkItem): { statusCatalog: GitHubStatusCatalog; statusEvidence: GitHubStatusEvidence; status: string } {
  const source = connection.statusSource ?? { kind: "repository" as const };
  const state = remote.state.toLowerCase();
  if (state !== "open" && state !== "closed") throw new DomainError("validation", "GitHub returned incomplete Issue state evidence.");
  const statusCatalog = source.kind === "repository" ? { source, options: [{ id: "open", name: "Open", position: 0 }, { id: "closed", name: "Closed", position: 1 }] } : remote.statusCatalog;
  const statusEvidence: GitHubStatusEvidence | undefined = source.kind === "repository" ? { source, issueState: state, membership: "present", optionId: state, name: state === "closed" ? "Closed" : "Open" } : remote.statusEvidence;
  if (!statusCatalog || !statusEvidence || githubStatusSourceKey(source) !== githubStatusSourceKey(statusEvidence.source)) throw new DomainError("validation", "GitHub returned incomplete selected Project status evidence.");
  return { statusCatalog, statusEvidence, status: resolveGitHubStatus(source, statusCatalog, statusEvidence) };
}

export function githubStatusCardsBefore(repository: import("@storymapper/db").StoryMapperRepository, connection: ConnectorConnection, incoming: ReturnType<typeof incomingGitHubStatus>, preparedCatalogs: Map<string, string>, owner?: Card): Card[] {
  const cards = new Map(owner && owner.status !== incoming.status ? [[owner.id, owner]] : []);
  const source = githubStatusSourceKey(incoming.statusCatalog.source);
  const signature = JSON.stringify(incoming.statusCatalog);
  const prepared = preparedCatalogs.get(source);
  if (prepared && prepared !== signature) throw new DomainError("conflict", "GitHub status catalog changed during batch preparation.");
  const previous = prepared ? incoming.statusCatalog : connection.statusCatalogs?.find((catalog) => githubStatusSourceKey(catalog.source) === source);
  preparedCatalogs.set(source, signature);
  const renamed = new Map(incoming.statusCatalog.options.filter((option) => previous?.options.find((before) => before.id === option.id)?.name !== option.name).map((option) => [option.id, option.name]));
  if (!renamed.size) return [...cards.values()];
  for (const map of repository.listStoryMaps(connection.projectId)) {
    const owned = new Map(repository.listRemoteWorkItemLinksForStoryMap(map.id).filter((link) => link.connectionId === connection.id && link.cardId && link.statusEvidence && githubStatusSourceKey(link.statusEvidence.source) === source && link.statusEvidence.optionId && renamed.has(link.statusEvidence.optionId)).map((link) => [link.cardId!, renamed.get(link.statusEvidence!.optionId!)]));
    for (const card of repository.listCards(map.id)) if (owned.has(card.id) && card.status !== owned.get(card.id)) cards.set(card.id, card);
  }
  return [...cards.values()];
}
