import { describe, expect, it } from "vitest";
import { changeOperationSchema, changeSetSchema } from "@storymapper/contracts/schemas/domain";
import { builtinProposalTemplateSchema, createAiProposalRequestSchema } from "@storymapper/contracts";

const projectId = "11111111-1111-4111-8111-111111111111";
const mapId = "22222222-2222-4222-8222-222222222222";
const chunkId = "a".repeat(64);
const externalSelector = { kind: "externalRef", scopeId: mapId, system: "bmad", externalId: "story-1" };
const card = { storyMapId: mapId, level: "activity", title: "Journey" };
const release = { storyMapId: mapId, name: "MVP" };
const persona = { projectId, name: "Reader" };
const envelope = { operationId: "op-1", entityId: "local-1" };
const validOperations = [
  { op: "create", entity: "storyMap", after: { projectId, name: "Plan" } },
  { op: "update", entity: "storyMap", after: { name: "Next plan" } },
  { op: "create", entity: "card", after: card },
  { op: "update", entity: "card", after: { description: "Reviewed" } },
  { op: "move", entity: "card", after: { parentId: null, position: 0 } },
  { op: "create", entity: "release", after: release },
  { op: "update", entity: "release", after: { position: 1 } },
  { op: "create", entity: "persona", after: persona },
  { op: "update", entity: "persona", after: { role: "Reader" } },
  { op: "link", entity: "sourceLink", after: { kind: "chunk", cardId: "local-card", chunkId } },
  { op: "unlink", entity: "sourceLink", after: { kind: "note", cardId: "local-card", id: projectId } },
  { op: "upsert", entity: "card", selector: externalSelector, after: card },
  { op: "upsert", entity: "release", selector: externalSelector, after: release },
  { op: "upsert", entity: "persona", selector: externalSelector, after: persona },
  { op: "create", entity: "storyMapCopy", after: { input: { sourceStoryMapId: mapId, targetName: "Copy" }, expected: { [mapId]: chunkId },
    preview: { source: { id: mapId, name: "Plan" }, target: { id: projectId, name: "Copy" }, inventory: { cards: 2 } } } },
  { op: "create", entity: "githubBoardImport", after: { input: { projectId, storyMapName: "Board", boardUrl: "https://github.com/orgs/org/projects/1", issues: [] },
    expected: {}, preview: { connectors: [], sync: { removals: [], overwrites: [] }, cleanup: [] } } }
];

describe("strict ChangeOperation catalog", () => {
  it("accepts zero template estimates atomically at Card creation", () => {
    expect(changeOperationSchema.parse({ ...envelope, op: "create", entity: "card", after: { ...card, estimate: 0 } }).after).toMatchObject({ estimate: 0 });
  });
  registerRejectsDiscardedCardCreationFieldSButRetainsPublication();

  registerRejectsUnsupportedCreationFieldsAndEmptyAssigneesWhilePreserving();

  registerNormalizesUndefinedSPatchFieldsAndRejectsIneffectivePatches();

  registerRestrictsMapSelectorsAndSharesTheBuiltinTemplateCatalog();
  it.each(validOperations)("accepts $op $entity with typed fields", (operation) => {
    expect(changeOperationSchema.safeParse({ ...envelope, ...operation }).success).toBe(true);
  });

  registerRefusesUnsupportedOrMalformedOpEntity();

  it("requires distinct stable operation identity and rejects envelope fields", () => {
    expect(changeOperationSchema.safeParse({ entityId: "local-1", ...validOperations[2] }).success).toBe(false);
    expect(changeOperationSchema.safeParse({ ...envelope, operationId: "local-1", ...validOperations[2] }).success).toBe(false);
    expect(changeOperationSchema.safeParse({ ...envelope, ...validOperations[2], arbitrary: {} }).success).toBe(false);
  });

  it("distinguishes literal chunks from earlier-import selectors", () => {
    const operation = { ...envelope, op: "link", entity: "sourceLink", after: { kind: "chunk", cardId: "local-card", chunk: { kind: "import", operationId: "source-op", locator: "L1" } } };
    expect(changeOperationSchema.safeParse(operation).success).toBe(true);
    expect(changeOperationSchema.safeParse({ ...operation, after: { ...operation.after, chunkId } }).success).toBe(false);
  });

  it("allows creation without a local alias", () => {
    expect(changeOperationSchema.safeParse({ operationId: "create-card", ...validOperations[2] }).success).toBe(true);
    expect(changeOperationSchema.safeParse({ operationId: "upsert-card", ...validOperations[11] }).success).toBe(true);
  });

  it("rejects duplicate operation and creation IDs with indexed paths", () => {
    const operation = { ...envelope, ...validOperations[2] };
    const result = changeSetSchema.safeParse({ id: projectId, projectId, title: "Plan", source: "mcp", createdAt: "2026-10-11T12:00:00Z", operations: [operation, operation] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toEqual([["operations", 1, "operationId"], ["operations", 1, "entityId"]]);
  });

  it("does not insert defaulted optional update fields", () => {
    const input = { ...envelope, op: "update", entity: "persona", after: { name: "Changed" } };
    expect(changeOperationSchema.parse(input)).toEqual(input);
  });
});


describe("selectors are only accepted when addressed by the operation", () => {
  it.each(validOperations.filter((entry) => ["create", "link", "unlink"].includes(entry.op)))("rejects ignored selectors on $op $entity", (entry) => {
    for (const selector of [{ kind: "id", id: mapId }, { kind: "local", localId: "local" }, externalSelector]) {
      expect(changeOperationSchema.safeParse({ ...envelope, ...entry, selector }).success).toBe(false);
    }
  });
});

it("rejects duplicate source-import aliases during current-schema submission", () => {
  const operation = { operationId: "import-first", entityId: "source-local", op: "import", entity: "sourceDocument", after: { projectId, title: "Source", type: "txt", fileHash: chunkId } };
  const result = changeSetSchema.safeParse({ id: projectId, projectId, title: "Sources", source: "mcp", createdAt: "2026-10-12T12:00:00Z", operations: [operation, { ...operation, operationId: "import-second" }] });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toEqual([["operations", 1, "entityId"]]);
});

it.each(["roadmap", "annotation", "workflowStatus", "storyTemplate", "attachment", "githubExternalRef", "externalRef"])("rejects unsupported external selectors on remaining %s targets", (entity) => {
  expect(changeOperationSchema.safeParse({ ...envelope, op: "delete", entity, selector: externalSelector, after: {} }).success).toBe(false);
});

it("normalizes explicit undefined bulk and Product Context patch fields", () => {
  const bulk = { ...envelope, op: "bulk", entity: "card", after: { storyMapId: mapId, cards: [{ id: mapId, baseVersion: 1 }], patch: { status: undefined } } };
  expect(changeOperationSchema.safeParse(bulk).success).toBe(false);
  expect(changeOperationSchema.parse({ ...bulk, after: { ...bulk.after, patch: { status: "done", color: undefined } } }).after).toEqual({ ...bulk.after, patch: { status: "done" } });
  expect(changeOperationSchema.parse({ ...envelope, op: "set", entity: "productContext", after: { projectId, purpose: undefined } }).after).toEqual({ projectId });
  expect(changeOperationSchema.parse({ ...envelope, op: "set", entity: "productContext", after: { projectId, purpose: "Keep", notes: undefined } }).after).toEqual({ projectId, purpose: "Keep" });
});

it("accepts adapter refs and sync-state references while refusing removed or duplicate identity fields", () => {
  const binding = { ...envelope, op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: "local-card", scopeId: mapId, externalId: "https://github.com/Owner/Repo/issues/7" } };
  expect(changeOperationSchema.parse(binding).after).toMatchObject({ externalId: "https://github.com/owner/repo/issues/7" });
  expect(changeOperationSchema.safeParse({ ...binding, entity: "githubLink" }).success).toBe(false);
  expect(changeOperationSchema.safeParse({ ...binding, after: { ...binding.after, connectionId: projectId } }).success).toBe(false);
  const state = { ...envelope, op: "set", entity: "remoteWorkItemLink", after: { externalRefId: "local-ref", connectionId: projectId, syncState: "synced" } };
  expect(changeOperationSchema.safeParse(state).success).toBe(true);
  for (const field of ["cardId", "releaseId", "remoteId", "remoteNumber", "url", "provider"]) expect(changeOperationSchema.safeParse({ ...state, after: { ...state.after, [field]: field === "remoteNumber" ? 7 : projectId } }).success).toBe(false);
  expect(changeOperationSchema.safeParse({ ...envelope, op: "set", entity: "externalRef", after: { entityType: "card", entityId: projectId, scopeId: mapId, system: "github", externalId: binding.after.externalId } }).success).toBe(false);
});

function registerRefusesUnsupportedOrMalformedOpEntity() {
  it.each([
    { op: "delete", entity: "card", after: {} },
    { op: "create", entity: "githubLink", after: {} },
    { op: "move", entity: "release", after: { position: 1 } },
    { op: "update", entity: "card", after: {} },
    { op: "update", entity: "card", after: { title: "Next", parked: true } },
    { op: "create", entity: "card", after: { ...card, storyMapId: "alias" } },
    { op: "link", entity: "sourceLink", after: { kind: "chunk", cardId: "c", chunkId: "alias" } },
    { op: "link", entity: "sourceLink", after: { kind: "note", cardId: "c", note: " " } },
    { op: "upsert", entity: "card", selector: { ...externalSelector, system: "github" }, after: card },
    { op: "upsert", entity: "card", selector: { kind: "local", localId: "c" }, after: card },
    { op: "create", entity: "card", after: card, context: { extra: true } },
    { op: "create", entity: "card", after: card, sources: [{ kind: "chunk", chunkId, extra: true }] }
  ])("refuses unsupported or malformed $op $entity", (operation) => {
    expect(changeOperationSchema.safeParse({ ...envelope, ...operation }).success).toBe(false);
  });
}

function registerRestrictsMapSelectorsAndSharesTheBuiltinTemplateCatalog() {
  it("restricts Map selectors and shares the builtin template catalog with request metadata", () => {
    expect(changeOperationSchema.safeParse({ ...envelope, op: "update", entity: "storyMap", selector: externalSelector, after: { name: "Next" } }).success).toBe(false);
    for (const templateId of builtinProposalTemplateSchema.options) {
      expect(createAiProposalRequestSchema.safeParse({ projectId, storyMapId: mapId, templateId, ...(templateId === "release-slice" ? { releaseTarget: { kind: "new" } } : {}) }).success).toBe(true);
      expect(changeOperationSchema.safeParse({ ...envelope, op: "create", entity: "card", after: card, context: { templateId } }).success).toBe(true);
    }
    expect(changeOperationSchema.safeParse({ ...envelope, op: "create", entity: "card", after: card, context: { templateId: "unknown" } }).success).toBe(false);
  });
}

function registerNormalizesUndefinedSPatchFieldsAndRejectsIneffectivePatches() {
  it.each(["storyMap", "card", "release", "persona"])("normalizes undefined %s patch fields and rejects ineffective patches", (entity) => {
    const required = entity === "card" ? "title" : "name";
    const optional = entity === "card" ? "description" : entity === "persona" ? "role" : entity === "release" ? "goal" : "description";
    expect(changeOperationSchema.safeParse({ ...envelope, op: "update", entity, after: { [required]: undefined } }).success).toBe(false);
    expect(changeOperationSchema.parse({ ...envelope, op: "update", entity, after: { [required]: undefined, [optional]: "Changed" } }).after).toEqual({ [optional]: "Changed" });
  });
}

function registerRejectsUnsupportedCreationFieldsAndEmptyAssigneesWhilePreserving() {
  it("rejects unsupported creation fields and empty assignees while preserving supported inputs", () => {
    expect(changeOperationSchema.safeParse({ ...envelope, op: "create", entity: "storyMap", after: { projectId, name: "Map", defaultConnectionId: mapId } }).success).toBe(false);
    expect(changeOperationSchema.parse({ ...envelope, op: "create", entity: "release", after: { ...release, released: true } }).after).toMatchObject({ released: true });
    expect(changeOperationSchema.safeParse({ ...envelope, op: "create", entity: "release", after: { ...release, released: "true" } }).success).toBe(false);
    expect(changeOperationSchema.safeParse({ ...envelope, op: "upsert", entity: "release", selector: externalSelector, after: { ...release, released: true } }).success).toBe(true);
    expect(changeOperationSchema.safeParse({ ...envelope, op: "create", entity: "card", after: { ...card, assignee: "" } }).success).toBe(false);
    expect(changeOperationSchema.parse({ ...envelope, op: "create", entity: "card", after: { ...card, assignee: "owner" } }).after).toMatchObject({ assignee: "owner" });
  });
}

function registerRejectsDiscardedCardCreationFieldSButRetainsPublication() {
  it.each(["priority", "businessValue", "effort", "color"])("rejects discarded Card creation field %s but retains publication fields", (field) => {
    const after = { ...card, [field]: ["priority", "color"].includes(field) ? "value" : 3 };
    const result = changeOperationSchema.safeParse({ ...envelope, op: "create", entity: "card", after });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(result.error.issues)).toContain(field);
    expect(changeOperationSchema.safeParse({ ...envelope, op: "upsert", entity: "card", selector: externalSelector, after }).success).toBe(true);
  });
}
