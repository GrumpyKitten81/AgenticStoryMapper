import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAiTemplateRequestSchema, updateAiTemplateRequestSchema } from "@storymapper/contracts";
import { defaultAiFunctionTemplates } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const actor = { actorType: "human", actorId: "template-user" } as const;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-templates-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "storymapper.sqlite");
  const db = openStoryMapperDb(path);
  cleanup.push(() => { if (db.$client.open) db.$client.close(); });
  const repository = new StoryMapperRepository(new DatabaseHandle(db));
  const uow = new UnitOfWork(repository.handle);
  const project = uow.run(actor, ({ repository }) => repository.createProject({ name: "Template persistence" }));
  return { db, path, repository, uow, project };
}

it("seeds Project-owned defaults once and preserves edits, arguments and deletions after reopen", () => {
  const f = fixture();
  expect(f.repository.listAiTemplates(f.project.id).map(({ projectId, ...template }) => template).sort((a, b) => a.id.localeCompare(b.id)))
    .toEqual(defaultAiFunctionTemplates.map((template) => createAiTemplateRequestSchema.parse({ ...template, projectId: f.project.id })).map(({ projectId, ...template }) => template).sort((a, b) => a.id.localeCompare(b.id)));
  const created = f.uow.run(actor, ({ repository }) => repository.createAiTemplate(createAiTemplateRequestSchema.parse({
    projectId: f.project.id, id: "my-template", name: "My template", instructions: "Investigate selected source evidence.",
    arguments: [{ name: "evidence", description: "Evidence to examine", required: true }], examples: ["Source excerpt"], outputSchemaName: "ChangeSet"
  })));
  f.uow.run(actor, ({ repository }) => repository.updateAiTemplate(f.project.id, created.id, updateAiTemplateRequestSchema.parse({ name: "Edited template" })));
  const deleted = defaultAiFunctionTemplates[0]!.id;
  f.uow.run(actor, ({ repository }) => repository.deleteAiTemplate(f.project.id, deleted));
  f.uow.run(actor, ({ repository }) => repository.initializeGettingStarted(f.project.id));
  f.db.$client.close();
  const reopenedDb = openStoryMapperDb(f.path);
  cleanup.push(() => { if (reopenedDb.$client.open) reopenedDb.$client.close(); });
  const reopened = new StoryMapperRepository(new DatabaseHandle(reopenedDb));
  expect(reopened.getAiTemplate(f.project.id, created.id)).toEqual({ ...created, name: "Edited template" });
  expect(reopened.getAiTemplate(f.project.id, deleted)).toBeUndefined();
  expect(reopened.listAiTemplates(f.project.id)).toHaveLength(defaultAiFunctionTemplates.length);
  const edits = reopened.listActivity(f.project.id).filter((event) => event.action.startsWith("aiTemplate."));
  expect(edits.map((event) => event.action).sort()).toEqual(["aiTemplate.created", "aiTemplate.deleted", "aiTemplate.updated"]);
  for (const event of edits) {
    expect(event).toMatchObject({ actor: actor.actorId, actorType: "human", affectedEntityType: "aiTemplate" });
    for (const payload of [event.before, event.after].filter(Boolean)) expect(Object.keys(payload!).sort()).toEqual(["id", "name", "projectId"]);
    expect(JSON.stringify(event)).not.toContain(created.instructions);
    expect(JSON.stringify(event)).not.toContain(created.examples[0]);
    expect(JSON.stringify(event)).not.toContain(created.arguments[0]!.description);
    expect(JSON.stringify(event)).not.toContain(created.outputSchemaName);
  }
});

it("isolates identical IDs by Project and atomically rolls back seeds when Project creation fails", () => {
  const f = fixture();
  const other = f.uow.run(actor, ({ repository }) => repository.createProject({ name: "Other Project" }));
  const templateId = defaultAiFunctionTemplates[0]!.id;
  f.uow.run(actor, ({ repository }) => repository.updateAiTemplate(other.id, templateId, { instructions: "Other Project instructions" }));
  expect(f.repository.getAiTemplate(f.project.id, templateId)?.instructions).toBe(defaultAiFunctionTemplates[0]!.instructions);
  expect(() => f.uow.run(actor, ({ repository }) => repository.updateAiTemplate(other.id, "unknown", { name: "Rejected" }))).toThrow("not found in this Project");
  expect(() => f.uow.run(actor, ({ repository }) => repository.createAiTemplate(createAiTemplateRequestSchema.parse({ ...defaultAiFunctionTemplates[0], projectId: f.project.id })))).toThrow("already used");
  const beforeProjects = f.repository.listProjects();
  const beforeTemplates = f.db.$client.prepare("SELECT count(*) AS count FROM ai_function_templates").get();
  f.db.$client.exec("CREATE TRIGGER reject_template_seed BEFORE INSERT ON ai_function_templates BEGIN SELECT RAISE(ABORT, 'rejected seed'); END");
  expect(() => f.uow.run(actor, ({ repository }) => repository.createProject({ name: "Rejected Project" }))).toThrow("rejected seed");
  expect(f.repository.listProjects()).toEqual(beforeProjects);
  expect(f.db.$client.prepare("SELECT count(*) AS count FROM ai_function_templates").get()).toEqual(beforeTemplates);
});

it("rejects ambiguous or reserved prompt arguments while preserving omitted sparse fields", () => {
  const input = { projectId: "11111111-1111-1111-1111-111111111111", id: "prompt", name: "Prompt", instructions: "Propose a ChangeSet." };
  expect(createAiTemplateRequestSchema.safeParse({ ...input, arguments: [{ name: "storyMapId" }] }).success).toBe(false);
  expect(createAiTemplateRequestSchema.safeParse({ ...input, arguments: [{ name: "evidence" }, { name: "evidence" }] }).success).toBe(false);
  expect(updateAiTemplateRequestSchema.parse({ name: "New name" })).toEqual({ name: "New name" });
});

it("attributes instruction, argument, example and guidance-only updates without private Activity payloads", () => {
  const f = fixture();
  const template = f.uow.run(actor, ({ repository }) => repository.createAiTemplate(createAiTemplateRequestSchema.parse({
    projectId: f.project.id, id: "metadata-only", name: "Unchanged name", instructions: "Initial private instructions",
    arguments: [], examples: [], outputSchemaName: "Initial private guidance"
  })));
  const metadata = { projectId: template.projectId, id: template.id, name: template.name };
  const patches = [
    { instructions: "Updated private instructions" },
    { arguments: [{ name: "private_evidence", description: "Private argument description", required: true }] },
    { examples: ["Updated private example"] },
    { outputSchemaName: "Updated private guidance" },
    { outputSchemaName: null }
  ];
  for (const patch of patches) {
    const beforeIds = new Set(f.repository.listActivity(f.project.id).map((event) => event.id));
    const updated = f.uow.run(actor, ({ repository }) => repository.updateAiTemplate(f.project.id, template.id, updateAiTemplateRequestSchema.parse(patch)));
    expect(updated).toMatchObject(metadata);
    if (patch.outputSchemaName === null) {
      expect(updated.outputSchemaName).toBeUndefined();
      expect(f.repository.getAiTemplate(f.project.id, template.id)).not.toHaveProperty("outputSchemaName");
    }
    else expect(updated).toMatchObject(patch);
    const events = f.repository.listActivity(f.project.id).filter((event) => !beforeIds.has(event.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "aiTemplate.updated", actor: actor.actorId, actorType: actor.actorType,
      affectedEntityType: "aiTemplate", affectedEntityId: `${template.projectId}:${template.id}`
    });
    expect(events[0]!.before).toEqual(metadata);
    expect(events[0]!.after).toEqual(metadata);
    for (const privateValue of [updated.instructions, ...updated.examples, updated.arguments[0]?.name, updated.arguments[0]?.description, updated.outputSchemaName].filter((value) => value !== undefined)) {
      expect(JSON.stringify(events[0])).not.toContain(privateValue);
    }
  }
  expect(f.repository.listActivity(f.project.id).filter((event) => event.action === "aiTemplate.updated")).toHaveLength(patches.length);
});
