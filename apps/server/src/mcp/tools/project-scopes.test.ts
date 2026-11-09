import { splitTextIntoChunks } from "@storymapper/importers";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";
import { createMcpRegistry } from "@storymapper/server/mcp/tools/register-tools";

it("reuses chunk ownership within one authorization and refreshes linked Project scopes on the next call", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-scope-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  try {
    const repository = new StoryMapperRepository(handle), unitOfWork = new UnitOfWork(handle);
    const human = { actorType: "human", actorId: "fixture" } as const;
    const data = unitOfWork.run(human, ({ repository: tx }) => {
      const project = tx.createProject({ name: "Accessible" }), disabled = tx.createProject({ name: "Disabled" });
      const map = tx.createStoryMap({ projectId: project.id, name: "Accessible Map" });
      const card = tx.createCard({ storyMapId: map.id, level: "story", title: "Accessible Story" });
      const sources = [project, disabled].map((owner) => {
        const content = `${owner.name} source evidence`;
        return tx.importSourceDocument({ parsedChunks: splitTextIntoChunks(content), projectId: owner.id, title: owner.name, type: "txt", content, fileHash: createHash("sha256").update(content).digest("hex") });
      });
      tx.createCardSourceLink(card.id, { kind: "chunk", chunkId: sources[0]!.chunks[0]!.id });
      tx.updateSafetySettings(disabled.id, { agentMode: "off" });
      return { project, disabled, map, card, sources };
    });
    const summaries = vi.spyOn(repository, "listSourceDocumentSummaryData");
    expect(resolveToolProjectIds(repository, "GetStoryMapSnapshot", { storyMapId: data.map.id })).toEqual([data.project.id]);
    expect(summaries).toHaveBeenCalledTimes(2);
    summaries.mockClear();
    handle.current.$client.prepare("INSERT INTO card_source_links (id, card_id, kind, chunk_id, created_at) VALUES (?, ?, 'chunk', ?, ?)")
      .run(randomUUID(), data.card.id, data.sources[1]!.chunks[0]!.id, new Date().toISOString());
    expect(resolveToolProjectIds(repository, "GetStoryMapSnapshot", { storyMapId: data.map.id }).sort()).toEqual([data.project.id, data.disabled.id].sort());
    expect(summaries).toHaveBeenCalledTimes(2);
    const registry = createMcpRegistry(repository, unitOfWork, { localOrigin: () => "http://127.0.0.1:4317", hostName: "scope-fixture", mcpSessionId: "scope-session" });
    await expect(registry.call("GetStoryMapSnapshot", { storyMapId: data.map.id })).rejects.toMatchObject({ code: "disabled" });
  } finally {
    vi.restoreAllMocks(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true });
  }
});
