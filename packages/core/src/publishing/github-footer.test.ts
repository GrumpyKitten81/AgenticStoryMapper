import { describe, expect, it } from "vitest";
import type { Card } from "@storymapper/contracts";
import { buildGitHubIssueBody, gitHubIssueMarker, stripGitHubIssueFooter } from "@storymapper/core";

const card = { id: "card-id", storyMapId: "map-id", key: "MAP-7", description: "Authored prose\n\n## Referenzen\n- Story Map: Authored reference\nStatus: keep this text", status: "active" } as Card;
const source = { origin: "http://127.0.0.1:48513", projectId: "project-id" };

describe("machine-owned Issue footer", () => {
  it("preserves authored Markdown and generates one stable marker with the actual local deep link", () => {
    const body = buildGitHubIssueBody(card, "Original Map", source);
    expect(stripGitHubIssueFooter(body)).toBe(card.description);
    expect(body).toContain("[MAP-7](http://127.0.0.1:48513/projects/project-id/story-maps/map-id/discovery?card=card-id)");
    const renamed = buildGitHubIssueBody({ ...card, key: "NEW-7", description: body }, "Renamed Map", source);
    expect(renamed.match(/<!-- storymapper:footer:start -->/gu)).toHaveLength(1);
    expect(renamed).toContain(gitHubIssueMarker(card, source.projectId));
    expect(renamed).toContain("Story Map: Renamed Map");
    expect(stripGitHubIssueFooter(renamed)).toBe(card.description);
    expect(body).not.toContain("Status: active");
  });

  it("preserves authored whitespace and line endings byte-for-byte", () => {
    const description = "  Leading prose\r\n\r\n## Authored section\r\nTrailing spaces  \r\n";
    const body = buildGitHubIssueBody({ ...card, description }, "Map", source);
    expect(body.startsWith(`${description}\n\n`)).toBe(true);
    expect(stripGitHubIssueFooter(description)).toBe(description);
    expect(stripGitHubIssueFooter(body)).toBe(description);
    expect(buildGitHubIssueBody({ ...card, description: body }, "Map", source)).toBe(body);
  });

  it("retains incomplete or unmarked authored footer-like text", () => {
    const prose = "Keep this\n\n<!-- storymapper:footer:start -->\nAuthored unfinished block";
    expect(stripGitHubIssueFooter(prose)).toBe(prose);
    expect(stripGitHubIssueFooter("## Referenzen\n- Agentic Story Mapper card: user prose")).toBe("## Referenzen\n- Agentic Story Mapper card: user prose");
  });

  it.each(["", "\n", "\r\n"])("strips complete sections after a short separator %j", (separator) => {
    const footer = buildGitHubIssueBody({ ...card, description: "" }, "Map", source);
    expect(stripGitHubIssueFooter(`  Authored prose${separator}${footer}\r\nTrailing prose  `)).toBe("  Authored prose\r\nTrailing prose  ");
  });

  it("retains an unmatched earlier start and its authored content when appending a complete footer", () => {
    const description = "Leading prose\r\n<!-- storymapper:footer:start -->\r\nAuthored unfinished section  \r\n";
    const body = buildGitHubIssueBody({ ...card, description }, "Map", source);
    expect(stripGitHubIssueFooter(body)).toBe(description);
    expect(buildGitHubIssueBody({ ...card, description: body }, "Map", source)).toBe(body);
  });

  it.each(["https://example.com", "http://127.0.0.1:4317/path", "http://user@localhost:4317", "http://localhost:4317?token=x", "javascript:alert(1)"])("refuses unsafe source origin %s", (origin) => {
    expect(() => buildGitHubIssueBody(card, "Map", { ...source, origin })).toThrow("served loopback origin");
  });
});
