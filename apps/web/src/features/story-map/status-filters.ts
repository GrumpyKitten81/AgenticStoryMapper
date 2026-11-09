import { type Card, type RemoteWorkItemLink, type StoryMapSnapshot, type WorkflowStatus } from "@storymapper/contracts";
import { isCardCompleted, statusIdentity } from "@storymapper/core";

export function localStatusOptions(snapshot: Pick<StoryMapSnapshot, "cards" | "workflowStatuses">): string[] {
  return [...new Set([...snapshot.workflowStatuses.map((status) => status.name), ...snapshot.cards.map((card) => card.status)])];
}

export function cardStatusIdentity(card: Card, links: readonly RemoteWorkItemLink[], definitions: readonly WorkflowStatus[]): string {
  const link = links.find((link) => link.cardId === card.id && link.statusEvidence);
  if (link?.statusEvidence) return statusIdentity(link.connectionId, link.statusEvidence);
  const definition = definitions.find((status) => status.name === card.status && status.storyMapId === card.storyMapId) ?? definitions.find((status) => status.name === card.status && status.storyMapId === null);
  return JSON.stringify(["local", definition?.id ?? card.status]);
}

export function cardIsCompleted(card: Card, links: readonly RemoteWorkItemLink[], definitions: readonly WorkflowStatus[]): boolean {
  return isCardCompleted(card, links, definitions);
}

export function statusFilterOptions(snapshot: Pick<StoryMapSnapshot, "cards" | "remoteWorkItemLinks" | "workflowStatuses" | "githubStatusCatalogs">): Array<{ id: string; name: string }> {
  const choices = new Map<string, string>();
  const assigned = new Set(snapshot.cards.map((card) => cardStatusIdentity(card, snapshot.remoteWorkItemLinks, snapshot.workflowStatuses)));
  for (const { connectionId, connectionName, catalog } of snapshot.githubStatusCatalogs ?? []) {
    const sourceName = catalog.source.kind === "repository" ? "Repository" : catalog.source.projectName;
    const label = (name: string) => `${name} · ${connectionName} · ${sourceName}`;
    for (const option of catalog.options.filter((option) => !option.retired || assigned.has(statusIdentity(connectionId, { source: catalog.source, membership: "present", issueState: "open", optionId: option.id, name: option.name })))) choices.set(statusIdentity(connectionId, { source: catalog.source, membership: "present", issueState: "open", optionId: option.id, name: option.name }), label(option.name));
    if (catalog.source.kind === "project") for (const membership of ["present", "missing"] as const) {
      const id = statusIdentity(connectionId, { source: catalog.source, membership, issueState: "open", optionId: null, name: null });
      if (!catalog.options.length || catalog.options.some((option) => !option.retired) || assigned.has(id)) choices.set(id, label(membership === "missing" ? "No status (not in Project)" : "No status"));
    }
  }
  const names = new Set<string>();
  const definitions = snapshot.workflowStatuses.filter((status) => status.storyMapId !== null || !snapshot.workflowStatuses.some((other) => other.name === status.name && other.storyMapId !== null)).sort((a, b) => a.position - b.position);
  for (const status of definitions) if (!names.has(status.name)) { choices.set(JSON.stringify(["local", status.id]), status.name); names.add(status.name); }
  const byId = new Map(snapshot.remoteWorkItemLinks.flatMap((link) => link.cardId ? [[link.cardId, link] as const] : []));
  for (const card of snapshot.cards) {
    const link = byId.get(card.id);
    const id = cardStatusIdentity(card, snapshot.remoteWorkItemLinks, snapshot.workflowStatuses);
    if (!choices.has(id)) choices.set(id, link?.statusEvidence ? `${card.status} · ${link.provider} · ${link.statusEvidence.source.kind === "project" ? link.statusEvidence.source.projectName : "Repository"}${link.statusEvidence.membership === "missing" ? " (not in Project)" : ""}` : card.status);
  }
  return [...choices].map(([id, name]) => ({ id, name }));
}
