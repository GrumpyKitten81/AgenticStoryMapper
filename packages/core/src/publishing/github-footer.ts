import { DomainError, type Card } from "@storymapper/contracts";

const FOOTER_START = "<!-- storymapper:footer:start -->";
const FOOTER_END = "<!-- storymapper:footer:end -->";

export interface GitHubIssueOrigin { origin: string; projectId: string }

export function stripGitHubIssueFooter(body: string): string {
  return body.replace(/(?:\r?\n){0,2}<!-- storymapper:footer:start -->\r?\n(?:(?!<!-- storymapper:footer:(?:start|end) -->)[\s\S])*?\r?\n<!-- storymapper:footer:end -->/gu, "");
}

export function gitHubIssueMarker(card: Pick<Card, "id" | "storyMapId">, projectId: string): string {
  return `storymapper:${projectId}:${card.storyMapId}:${card.id}`;
}

export function buildGitHubIssueBody(card: Card, storyMapName: string, source: GitHubIssueOrigin): string {
  if (!source.origin || !URL.canParse(source.origin)) throw new DomainError("validation", "Agentic Story Mapper Issue links require a served loopback origin.");
  const origin = new URL(source.origin);
  if (!["http:", "https:"].includes(origin.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new DomainError("validation", "Agentic Story Mapper Issue links require a served loopback origin.");
  }
  const path = `/projects/${encodeURIComponent(source.projectId)}/story-maps/${encodeURIComponent(card.storyMapId)}/discovery?card=${encodeURIComponent(card.id)}`;
  const name = storyMapName.replace(/[\r\n]/gu, " ");
  const footer = [FOOTER_START, `<!-- ${gitHubIssueMarker(card, source.projectId)} -->`, `Story Map: ${name}`, `Card: [${card.key}](${origin.origin}${path})`, FOOTER_END].join("\n");
  return [stripGitHubIssueFooter(card.description), footer].filter(Boolean).join("\n\n");
}
