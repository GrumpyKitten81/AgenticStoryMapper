import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { ChangeOperation, ChangeSetPreviewResponse } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createRoutes } from "@storymapper/server/http/routes";

export const previewHuman = { actorType: "human", actorId: "local-ui" } as const;

export async function previewFixture(cardCount = 3) {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-preview-"));
  const handle = new DatabaseHandle(openStoryMapperDb(join(directory, "storymapper.sqlite")));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const rows = unitOfWork.run(previewHuman, ({ repository: tx }) => {
    const project = tx.createProject({ name: "Preview acceptance" });
    const map = tx.createStoryMap({ projectId: project.id, name: "Preview board" });
    const release = tx.createRelease({ storyMapId: map.id, name: "Preview release" });
    const cards = Array.from({ length: cardCount }, (_, index) => tx.createCard({ storyMapId: map.id, level: "activity", title: `Card ${index}`, releaseId: release.id }));
    tx.upsertProductContext({ projectId: project.id, storyMapId: map.id, purpose: "Preview acceptance" });
    tx.updateSafetySettings(project.id, { agentMode: "apply" });
    return { project, map, release, cards };
  });
  const server = Fastify();
  await server.register(createRoutes, { repository, unitOfWork, databasePath: join(directory, "storymapper.sqlite") });
  const proposal = (operations: ChangeOperation[]) => unitOfWork.run(previewHuman, ({ repository: tx }) => tx.createChangeSet({
    id: randomUUID(), projectId: rows.project.id, title: "Review these effects", source: "human", createdAt: new Date().toISOString(), operations
  }));
  const preview = async (id: string, selection?: string[]) => {
    const query = selection === undefined ? "" : `?selectedOperationIds=${encodeURIComponent(JSON.stringify(selection))}`;
    return server.inject({ method: "GET", url: `/api/changesets/${id}/preview${query}` });
  };
  const readPreview = async (id: string, selection?: string[]): Promise<ChangeSetPreviewResponse> => {
    const response = await preview(id, selection);
    if (response.statusCode !== 200) throw new Error(`Preview returned ${response.statusCode}: ${response.body}`);
    return response.json();
  };
  const close = async () => { await server.close(); handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); };
  return { ...rows, directory, handle, repository, unitOfWork, server, proposal, preview, readPreview, close };
}
