import type { Release } from "@storymapper/contracts";

export interface ManagedLabelDiff { labels: string[]; additions: string[]; removals: string[] }

export function managedLabelDiff(current: string[], desired: string[], managed: string[]): ManagedLabelDiff {
  const owned = new Set(managed);
  const next = new Set(desired);
  const previous = new Set(current);
  const labels = [...new Set([...current.filter((label) => !owned.has(label)), ...desired])].sort();
  return { labels, additions: labels.filter((label) => !previous.has(label)), removals: current.filter((label) => owned.has(label) && !next.has(label)).sort() };
}

export function gitHubMilestoneMarker(release: Pick<Release, "id" | "storyMapId">, projectId: string): string {
  return `storymapper:${projectId}:${release.storyMapId}:release:${release.id}`;
}

export function stripGitHubMilestoneMarker(description: string): string {
  return description.replace(/(?:\r?\n){0,2}<!-- storymapper:[^\r\n>]+:release:[^\r\n>]+ -->/gu, "");
}

export function buildGitHubMilestoneDescription(description: string, marker: string): string {
  return [stripGitHubMilestoneMarker(description), `<!-- ${marker} -->`].filter(Boolean).join("\n\n");
}
