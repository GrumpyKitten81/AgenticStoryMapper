import type { ActivityEvent, Card, SafetySettings, Project, Release, StoryMapSnapshot } from "@storymapper/contracts";
import { summarizeActivity } from "@storymapper/core";

export { buildGitHubIssueBody, gitHubIssueMarker, stripGitHubIssueFooter } from "@storymapper/core/publishing/github-footer";
export type { GitHubIssueOrigin } from "@storymapper/core/publishing/github-footer";

export function buildStoryMapMarkdown(snapshot: StoryMapSnapshot, exportedAt: string): string {
  const releaseById = new Map(snapshot.releases.map((release) => [release.id, release]));
  const childrenByParent = groupCardsByParent(snapshot.cards);
  const lines = [
    `# ${snapshot.storyMap.name}`,
    "",
    snapshot.storyMap.description?.trim() ?? "",
    "",
    `Exported: ${exportedAt}`,
    `Cards: ${snapshot.cards.length}`,
    `Releases: ${snapshot.releases.length}`,
    ""
  ].filter((line, index) => index < 3 || line !== "");

  const context = snapshot.storyMap.epicContext;
  if (context) {
    lines.push("", `## Epic context: ${context.title}`, "", context.goal, "");
    if (context.githubIssueUrl) lines.push(`Reference: ${context.githubIssueUrl}`, "");
  }

  for (const activity of childrenByParent.get(null) ?? []) {
    lines.push(`## ${activity.key} ${activity.title}`, "");
    appendCardMeta(lines, activity, releaseById);

    for (const step of childrenByParent.get(activity.id) ?? []) {
      lines.push(`### ${step.key} ${step.title}`, "");
      appendCardMeta(lines, step, releaseById);

      for (const story of childrenByParent.get(step.id) ?? []) {
        lines.push(`#### ${story.key} ${story.title}`, "");
        appendCardMeta(lines, story, releaseById);
      }
    }
  }

  if (snapshot.releases.length > 0) {
    lines.push("## Releases", "");
    for (const release of snapshot.releases) {
      lines.push(`- ${release.name}${release.releaseDate ? ` (${release.releaseDate})` : ""}: ${release.goal}`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function appendCardMeta(lines: string[], card: Card, releaseById: Map<string, Release>): void {
  const meta = [
    `Status: ${card.status}`,
    card.cardType ? `Type: ${card.cardType}` : undefined,
    card.releaseId ? `Release: ${releaseById.get(card.releaseId)?.name ?? card.releaseId}` : undefined,
    card.estimate !== undefined ? `Estimate: ${card.estimate}` : undefined,
    card.priority ? `Priority: ${card.priority}` : undefined
  ].filter((value): value is string => Boolean(value));
  lines.push(meta.join(" | "));
  if (card.description.trim()) {
    lines.push("", card.description.trim());
  }
  lines.push("");
}

export function buildStoryMapCsv(snapshot: StoryMapSnapshot): string {
  const releaseById = new Map(snapshot.releases.map((release) => [release.id, release]));
  const sourceLinkCounts = countBy(snapshot.sourceLinks.map((link) => link.cardId));
  const githubLinkCounts = countBy(snapshot.githubLinks.map((link) => link.cardId).filter((cardId): cardId is string => Boolean(cardId)));
  const rows = [
    ["key", "level", "cardType", "title", "status", "release", "estimate", "parentId", "sourceLinks", "githubLinks", "description"],
    ...snapshot.cards.map((card) => [
      card.key,
      card.level,
      card.cardType ?? "",
      card.title,
      card.status,
      card.releaseId ? releaseById.get(card.releaseId)?.name ?? "" : "",
      card.estimate?.toString() ?? "",
      card.parentId ?? "",
      String(sourceLinkCounts.get(card.id) ?? 0),
      String(githubLinkCounts.get(card.id) ?? 0),
      card.description
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildAuditMarkdown(project: Project, settings: SafetySettings, events: ActivityEvent[], exportedAt: string): string {
  const lines = [
    `# Audit Export: ${project.name}`,
    "",
    `Exported: ${exportedAt}`,
    `Agent mode: ${settings.agentMode}`,
    `GitHub: ${settings.github ? "on" : "off"}`,
    "",
    "## Events",
    ""
  ];

  for (const rawEvent of events) {
    const event = summarizeActivity(rawEvent);
    const tool = event.toolCall;
    lines.push(`- ${event.createdAt} | ${event.actorType}:${event.actor}${event.mcpSessionId ? ` | MCP session: ${event.mcpSessionId}` : ""} | ${event.action} | ${event.scope} | ${event.affectedEntityType ?? "n/a"}:${event.affectedEntityId ?? "n/a"}${tool ? ` | ${tool.toolName} | ${tool.outcome} | objects: ${tool.affectedEntityIds.join(", ")} | input: ${tool.inputHash} | output: ${tool.outputHash}${tool.rejectionReason ? ` | reason: ${tool.rejectionReason}` : ""}${tool.errorId ? ` | error: ${tool.errorId}` : ""}` : ""}${event.undoneByRestore ? " | undone by restore" : ""}`);
  }

  return `${lines.join("\n")}\n`;
}

export function groupCardsByParent(cardsForMap: Card[]): Map<string | null, Card[]> {
  const groups = new Map<string | null, Card[]>();
  for (const card of cardsForMap) {
    const group = groups.get(card.parentId) ?? [];
    group.push(card);
    groups.set(card.parentId, group);
  }
  for (const group of groups.values()) {
    group.sort((first, second) => first.position - second.position || first.createdAt.localeCompare(second.createdAt));
  }
  return groups;
}

export function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function csvCell(value: string): string {
  return `"${value.replace(/"/g, "\"\"").replace(/\r?\n/g, "\\n")}"`;
}
