import { isCardCompleted } from "@storymapper/core/story-map/github-status";
import type { Card, Release, RemoteWorkItemLink, WorkflowStatus } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";

interface ReleaseNotesInput {
  remoteWorkItemLinks?: readonly RemoteWorkItemLink[];
  release: Release;
  cards: readonly Card[];
  workflowStatuses: readonly WorkflowStatus[];
}

function comparePositionId(left: Card, right: Card): number {
  return left.position - right.position || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function markdownText(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").replace(/([\\`*_[\]<>])/gu, "\\$1");
}

function ancestorActivity(card: Card, byId: Map<string, Card>): Card | undefined {
  const visited = new Set([card.id]);
  let parentId = card.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent || parent.storyMapId !== card.storyMapId) return undefined;
    if (parent.level === "activity") return parent;
    parentId = parent.parentId;
  }
  return undefined;
}

export function buildReleaseNotes({ release, cards, workflowStatuses, remoteWorkItemLinks = [] }: ReleaseNotesInput): string {
  const visible = visibleCards(cards.filter((card) => card.storyMapId === release.storyMapId));
  const byId = new Map(visible.map((card) => [card.id, card]));
  const stories = visible.filter((card) => card.level === "story" && card.releaseId === release.id && isCardCompleted(card, remoteWorkItemLinks, workflowStatuses)).sort(comparePositionId);
  const heading = `# Release notes: ${markdownText(release.name)}`;
  if (!stories.length) return `${heading}\n\nNo completed Stories in this Release.\n`;
  const groups = new Map<string | null, { activity: Card | undefined; cards: Card[] }>();
  for (const story of stories) {
    const activity = ancestorActivity(story, byId);
    const key = activity?.id ?? null;
    const group = groups.get(key) ?? { activity, cards: [] };
    group.cards.push(story);
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((left, right) => left.activity && right.activity ? comparePositionId(left.activity, right.activity) : left.activity ? -1 : right.activity ? 1 : 0);
  return [heading, ...ordered.map(({ activity, cards: grouped }) => [
    `## ${activity ? markdownText(activity.title) : "Unassigned"}`,
    grouped.map((card) => `- ${markdownText(card.key)}: ${markdownText(card.title)}`).join("\n")
  ].join("\n\n"))].join("\n\n") + "\n";
}
