import type { McpToolName } from "@storymapper/contracts";
import type { StoryMap, Card, Persona, Roadmap, Annotation, CardAttachment, GitHubLink, ConnectorConnection } from "@storymapper/contracts";
import { expect } from "vitest";
import { changeSetCommandToolNames } from "@storymapper/contracts";
import type { SourceDocument, SourceChunk } from "@storymapper/contracts";
import type { CompleteSurfaceFixture } from "@storymapper/server/mcp/tools/complete-surface.test";
export async function exerciseExecutesTheRemainingLocalMCPAdaptersWithValidArguments(cases: [McpToolName, unknown, Record<string, unknown>][], f: CompleteSurfaceFixture, rows: { persona: Persona; annotation: Annotation; attachment: CardAttachment; source: { document: SourceDocument; chunks: SourceChunk[]; status: "imported" | "unchanged"; }; activity: Card; roadmap: Roadmap; removableMap: StoryMap; link: GitHubLink; connection: ConnectorConnection; }): Promise<void> {
  for (const [name, input, expected] of cases) {
    const pending = f.reviewedCall(name, typeof input === "function" ? input() : input);
    await expect(pending, name).resolves.toBeDefined();
    const response = await pending;
    if (changeSetCommandToolNames.has(name)) expect(response, name).toMatchObject({ outcome: "applied", changeSetId: response.changeSet?.id, previewRef: { changeSetId: response.changeSet?.id } });
    else expect(response.data, name).toMatchObject(expected);
    if (name === "SetCardPersona") expect(f.repository.listCardPersonasForStoryMap(f.map.id)).toMatchObject([{ cardId: f.card.id, personaId: rows.persona.id }]);
    if (name === "DeleteCardPersona") expect(f.repository.listCardPersonasForStoryMap(f.map.id)).toEqual([]);
    if (name === "ParkCard" || name === "UnparkCard") expect(f.repository.getCardDetails(rows.activity.id)?.parked).toBe(name === "ParkCard");
    if (name === "UpdateGitHubLink") expect(f.repository.getGitHubLink(rows.link.id)).toMatchObject({ id: rows.link.id, issueNumber: 3 });
    if (name === "DeleteGitHubLink") expect(f.repository.getGitHubLink(rows.link.id)).toBeUndefined();
  }
  expect(f.repository.listCardAttachments(f.card.id).map((item) => item.label)).toEqual(["Surface attachment"]);
  expect(f.repository.listCardPersonasForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listCardAnnotationsForStoryMap(f.map.id)).toEqual([]);
  expect(f.repository.listSourceLinksForStoryMap(f.map.id).filter((link) => link.kind === "chunk")).toEqual([]);
  expect(f.repository.getCardDetails(f.card.id)?.estimate).toBe(7);
  expect(f.repository.getGitHubLink(rows.link.id)).toBeUndefined();
  expect(f.repository.getRoadmap(rows.roadmap.id)?.name).toBe("Updated plan");
  expect(f.repository.getPersona(rows.persona.id)).toBeUndefined();
  expect(f.repository.listStoryMaps(f.project.id).some((map) => map.id === rows.removableMap.id)).toBe(false);
}
