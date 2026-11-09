import type { Card, RemoteWorkItemLink, StoryMapSnapshot, WorkflowStatus } from "@storymapper/contracts";
import { isDoneStatus } from "@storymapper/core";
import { cardStatusIdentity, statusFilterOptions } from "@storymapper/web/features/story-map";

export function kanbanStatusColumns(cards: Card[], workflowStatuses: WorkflowStatus[], remoteWorkItemLinks: RemoteWorkItemLink[], githubStatusCatalogs: StoryMapSnapshot["githubStatusCatalogs"] = []) {
  const options = statusFilterOptions({ cards, workflowStatuses, remoteWorkItemLinks, githubStatusCatalogs });
  return options.map((option) => {
    const card = cards.find((card) => cardStatusIdentity(card, remoteWorkItemLinks, workflowStatuses) === option.id);
    const definition = workflowStatuses.find((status) => JSON.stringify(["local", status.id]) === option.id);
    const remote = (githubStatusCatalogs ?? []).flatMap(({ connectionId, catalog }) => catalog.options.map((value) => ({ id: JSON.stringify([connectionId, catalog.source.kind === "repository" ? "repository" : `project:${catalog.source.projectId}:${catalog.source.fieldId}`, "present", value.id]), name: value.name }))).find((value) => value.id === option.id);
    const name = card?.status ?? definition?.name ?? remote?.name ?? "No status";
    return { id: option.id, name, label: option.name, group: definition?.group ?? (isDoneStatus(name) ? "done" : "active") };
  });
}
