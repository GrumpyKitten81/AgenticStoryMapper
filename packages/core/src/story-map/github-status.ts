import { githubStatusSourceKey, type Card, type GitHubStatusCatalog, type GitHubStatusEvidence, type GitHubStatusSource, type RemoteWorkItemLink, type WorkflowStatus } from "@storymapper/contracts";

const DONE_NAMES = new Set(["done", "closed", "completed", "resolved", "finished", "shipped", "released", "erledigt", "abgeschlossen"]);

export function isDoneStatus(name: string): boolean {
  return DONE_NAMES.has(name.normalize("NFKC").trim().toLowerCase());
}

export function isCardCompleted(card: Card, links: readonly RemoteWorkItemLink[] = [], definitions: readonly WorkflowStatus[] = []): boolean {
  const owned = links.filter((link) => link.cardId === card.id);
  if (owned.some((link) => link.statusEvidence?.issueState === "closed" || link.remoteState?.toLowerCase() === "closed")) return true;
  if (owned.length) return isDoneStatus(card.status);
  const definition = definitions.find((status) => status.name === card.status && status.storyMapId === card.storyMapId) ?? definitions.find((status) => status.name === card.status && status.storyMapId === null);
  return definition ? definition.group === "done" : isDoneStatus(card.status);
}

export function isCardArchived(card: Card): boolean {
  return card.archived ?? card.status === "archived";
}

export function statusIdentity(connectionId: string, evidence: GitHubStatusEvidence): string {
  return JSON.stringify([connectionId, githubStatusSourceKey(evidence.source), evidence.membership, evidence.optionId]);
}

export function resolveGitHubStatus(source: GitHubStatusSource, catalog: GitHubStatusCatalog, evidence: GitHubStatusEvidence): string {
  if (githubStatusSourceKey(source) !== githubStatusSourceKey(catalog.source) || githubStatusSourceKey(source) !== githubStatusSourceKey(evidence.source)) throw new Error("GitHub status source and evidence disagree.");
  if (source.kind === "repository") return evidence.issueState === "closed" ? "Closed" : "Open";
  if (evidence.membership === "missing" || evidence.optionId === null) return "No status";
  const option = catalog.options.find((option) => option.id === evidence.optionId && !option.retired);
  if (!option || option.name !== evidence.name) throw new Error("GitHub status option evidence is incomplete.");
  return option.name;
}

export function mergeStatusCatalog(catalogs: readonly GitHubStatusCatalog[], incoming: GitHubStatusCatalog): GitHubStatusCatalog[] {
  const key = githubStatusSourceKey(incoming.source);
  const previous = catalogs.find((catalog) => githubStatusSourceKey(catalog.source) === key);
  const options = [...incoming.options, ...(previous?.options ?? []).filter((option) => !incoming.options.some((next) => next.id === option.id)).map((option) => ({ ...option, retired: true }))];
  return [...catalogs.filter((catalog) => githubStatusSourceKey(catalog.source) !== key), { ...incoming, options }];
}
