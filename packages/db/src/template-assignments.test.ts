import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { changeOperationSchema } from "@storymapper/contracts";
import { resolveOperations } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { loadMigrationAssets } from "@storymapper/db/migration-assets";
import { runMigrations } from "@storymapper/db/migration-runner";
import { copyStoryMap } from "@storymapper/db/repositories/map-copy-repository";
import { reviewInput } from "@storymapper/db/repositories/card-review-read";

const actor = { actorType: "human", actorId: "template-assignments-test" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-template-assignments-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle), repository = new StoryMapperRepository(handle);
  const data = uow.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Assignment fixture" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    repository.upsertProductContext({ projectId: project.id, storyMapId: map.id, purpose: "Assignment fixture" });
    const template = repository.createStoryTemplate({ projectId: project.id, storyMapId: map.id, name: "Story template", descriptionTemplate: "## Outcome\n\n## Acceptance Criteria", requiredLanguage: "en" });
    return { project, map, template };
  });
  cleanup.push(() => { handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  return { ...data, path, handle, uow, repository };
}

it("persists assignments through update, reopen and map copy and clears them with an empty list", () => {
  const f = fixture();
  const assignments = [{ cardType: "story" as const, storyTemplateId: f.template.id }];
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { templateAssignments: assignments }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toEqual(assignments);
  f.handle.current.$client.close();
  f.handle.current = openStoryMapperDb(f.path);
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toEqual(assignments);
  const copiedId = randomUUID();
  f.uow.run(actor, ({ repository }) => copyStoryMap.call(repository, f.map.id, "Copy", copiedId));
  const copied = f.repository.getStoryMapSnapshot(copiedId)!;
  const copiedTemplate = copied.storyTemplates.find((row) => row.name === "Story template")!;
  expect(copiedTemplate.id).not.toBe(f.template.id);
  expect(copied.storyMap.templateAssignments).toEqual([{ cardType: "story", storyTemplateId: copiedTemplate.id }]);
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { templateAssignments: [] }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toBeUndefined();
});

it("exposes the assigned template with its required language to the Card review input", () => {
  const f = fixture();
  const card = f.uow.run(actor, ({ repository }) => repository.createCard({ storyMapId: f.map.id, level: "story", cardType: "story", title: "Outcome", parentId: null, releaseId: null }, "human"));
  const unassigned = reviewInput(f.repository, card.id);
  expect(unassigned.assignedTemplate).toBeNull();
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { templateAssignments: [{ cardType: "story", storyTemplateId: f.template.id }] }));
  const assigned = reviewInput(f.repository, card.id);
  expect(assigned.assignedTemplate).toEqual({ id: f.template.id, name: "Story template", descriptionTemplate: "## Outcome\n\n## Acceptance Criteria", requiredLanguage: "en" });
});

it("upgrades existing maps additively with absent assignments and templates without a required language", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-pre-assignments-"));
  const path = join(directory, "storymapper.sqlite");
  const raw = new Database(path);
  const projectId = randomUUID(), mapId = randomUUID(), templateId = randomUUID(), now = "2026-11-25T00:00:00Z";
  runMigrations(raw, path, loadMigrationAssets().slice(0, -1));
  raw.prepare("INSERT INTO projects (id, name, local_path, created_at) VALUES (?, 'Existing project', '', ?)").run(projectId, now);
  raw.prepare("INSERT INTO story_maps (id, project_id, name, created_at, updated_at) VALUES (?, ?, 'Existing map', ?, ?)").run(mapId, projectId, now, now);
  raw.prepare("INSERT INTO story_templates (id, project_id, story_map_id, name, position) VALUES (?, ?, ?, 'Existing template', 0)").run(templateId, projectId, mapId);
  raw.close();
  const database = openStoryMapperDb(path);
  try {
    const repository = new StoryMapperRepository(new DatabaseHandle(database));
    const snapshot = repository.getStoryMapSnapshot(mapId)!;
    expect(snapshot.storyMap.templateAssignments).toBeUndefined();
    expect(snapshot.storyTemplates).toEqual([expect.objectContaining({ id: templateId, name: "Existing template" })]);
    expect(snapshot.storyTemplates[0]!.requiredLanguage).toBeUndefined();
  } finally { database.$client.close(); rmSync(directory, { recursive: true, force: true }); }
});

it("rejects assignments to unknown, foreign-project or other-map templates and accepts project-wide ones", () => {
  const f = fixture();
  expect(() => f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { templateAssignments: [{ cardType: "story", storyTemplateId: randomUUID() }] }))).toThrow("project-wide or this map's own Story Template");
  const otherMap = f.uow.run(actor, ({ repository }) => repository.createStoryMap({ projectId: f.project.id, name: "Other map" }));
  const otherTemplate = f.uow.run(actor, ({ repository }) => repository.createStoryTemplate({ projectId: f.project.id, storyMapId: otherMap.id, name: "Other map template", descriptionTemplate: "## Other" }));
  expect(() => f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { templateAssignments: [{ cardType: "story", storyTemplateId: otherTemplate.id }] }))).toThrow("project-wide or this map's own Story Template");
  expect(() => f.uow.run(actor, ({ repository }) => repository.createStoryMap({ projectId: f.project.id, name: "Bad map", templateAssignments: [{ cardType: "story", storyTemplateId: otherTemplate.id }] }))).toThrow("project-wide or this map's own Story Template");
  const shared = f.uow.run(actor, ({ repository }) => repository.createStoryTemplate({ projectId: f.project.id, storyMapId: null, name: "Project-wide template", descriptionTemplate: "## Shared" }));
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { templateAssignments: [{ cardType: "story", storyTemplateId: shared.id }] }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toEqual([{ cardType: "story", storyTemplateId: shared.id }]);
});

it("writes and clears assignments through the ChangeSet operation path and refuses dangling template references", () => {
  const f = fixture();
  const assignments = [{ cardType: "story" as const, storyTemplateId: f.template.id }];
  const mapOperation = (after: Record<string, unknown>) => [{ operationId: "assign-templates", op: "update", entity: "storyMap", entityId: f.map.id, after }];
  const apply = (after: Record<string, unknown>) => f.uow.run(actor, ({ repository }) => {
    const operations = mapOperation(after).map((operation) => changeOperationSchema.parse(operation));
    const snapshot = repository.getOperationSnapshot(f.project.id);
    const resolution = resolveOperations(snapshot, operations, repository.prepareOperationSupply(operations, snapshot));
    repository.persistOperationResolution(resolution, f.project.id);
  });
  expect(() => apply({ templateAssignments: [{ cardType: "story", storyTemplateId: randomUUID() }] })).toThrow("project-wide or this map's own Story Template");
  apply({ templateAssignments: assignments });
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toEqual(assignments);
  apply({ templateAssignments: [] });
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toBeUndefined();
});

it("clears map assignments when the referenced Story Template is deleted", () => {
  const f = fixture();
  const second = f.uow.run(actor, ({ repository }) => repository.createStoryTemplate({ projectId: f.project.id, storyMapId: f.map.id, name: "Second template", descriptionTemplate: "## Second" }));
  f.uow.run(actor, ({ repository }) => repository.updateStoryMap(f.map.id, { templateAssignments: [{ cardType: "story", storyTemplateId: f.template.id }, { cardType: "bug", storyTemplateId: second.id }] }));
  f.uow.run(actor, ({ repository }) => { if (!repository.deleteStoryTemplate(f.template.id)) throw new Error("template missing"); });
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toEqual([{ cardType: "bug", storyTemplateId: second.id }]);
  f.uow.run(actor, ({ repository }) => { if (!repository.deleteStoryTemplate(second.id)) throw new Error("template missing"); });
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyMap.templateAssignments).toBeUndefined();
});

it("sets and clears a Story Template's required language through the repository", () => {
  const f = fixture();
  f.uow.run(actor, ({ repository }) => repository.updateStoryTemplate(f.template.id, { requiredLanguage: "de" }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyTemplates.find((row) => row.id === f.template.id)!.requiredLanguage).toBe("de");
  f.uow.run(actor, ({ repository }) => repository.updateStoryTemplate(f.template.id, { requiredLanguage: null }));
  expect(f.repository.getStoryMapSnapshot(f.map.id)!.storyTemplates.find((row) => row.id === f.template.id)!.requiredLanguage).toBeUndefined();
});
