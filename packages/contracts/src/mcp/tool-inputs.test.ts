import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createRoadmapRequestSchema, importSourceDocumentRequestSchema, updateWorkflowStatusRequestSchema } from "@storymapper/contracts/api/http";
import { mcpToolInputSchemas } from "@storymapper/contracts/mcp/tool-inputs";
import { changeSetCommandToolNames, mcpToolNameSchema } from "@storymapper/contracts/mcp/tools";

const projectId = "00000000-0000-4000-8000-000000000001";
const statusId = "00000000-0000-4000-8000-000000000002";

describe("MCP tool input contracts", () => {
  it("keeps review summary, Card detail and exact-plan selectors strict", () => {
    expect(mcpToolInputSchemas.GetCardReviews.parse({ projectId, storyMapId: statusId, summaryOnly: true })).toEqual({ projectId, storyMapId: statusId, summaryOnly: true });
    expect(mcpToolInputSchemas.GetCardReviews.parse({ projectId, cardId: statusId, planId: projectId })).toMatchObject({ cardId: statusId, planId: projectId });
    for (const extra of [{ cardId: "invalid" }, { summaryOnly: "true" }, { unknown: true }]) expect(mcpToolInputSchemas.GetCardReviews.safeParse({ projectId, ...extra }).success).toBe(false);
  });
  registerProvidesDiscoverableObjectSchemasForEveryToolAndExcludes();

  it("retains optional apply for every routed command without defaulting human patches", () => {
    for (const name of changeSetCommandToolNames) {
      const json = z.toJSONSchema(mcpToolInputSchemas[name], { io: "input" });
      const objects = json.oneOf ?? [json];
      for (const object of objects) {
        expect(object.properties?.apply, name).toMatchObject({ type: "boolean" });
        expect(object.required ?? [], name).not.toContain("apply");
      }
    }
    expect(mcpToolInputSchemas.UpdateStoryMapCard.parse({ cardId: statusId, baseVersion: 1, patch: { title: "Reviewed" }, apply: false })).toMatchObject({ apply: false });
    expect(mcpToolInputSchemas.CreateStoryMap.parse({ projectId, name: "Map" })).not.toHaveProperty("apply");
  });

  it("exposes strict approval selection without caller-supplied actor claims", () => {
    expect(mcpToolInputSchemas.ApproveChangeSet.parse({ changeSetId: projectId, selectedOperationIds: ["operation-1"] })).toEqual({ changeSetId: projectId, selectedOperationIds: ["operation-1"] });
    expect(mcpToolInputSchemas.ApproveChangeSet.safeParse({ changeSetId: projectId, actorId: "claimed-host" }).success).toBe(false);
  });

  it("shares the strict submission catalog and preserves explicit application intent", () => {
    const operation = { operationId: "create", op: "create", entity: "card", entityId: "local", after: { storyMapId: statusId, level: "story", title: "Story" }, reason: "Reason", rationale: "Rationale", sources: [{ kind: "note", note: "Evidence" }] };
    const input = { projectId, title: "Planning cut", operations: [operation], context: { projectId }, sources: [{ kind: "note", note: "Shared" }], rationale: "Shared rationale" };
    expect(mcpToolInputSchemas.SubmitChangeSet.parse(input)).toEqual(input);
    expect(mcpToolInputSchemas.SubmitChangeSet.parse({ ...input, apply: true }).apply).toBe(true);
    expect(mcpToolInputSchemas.SubmitChangeSet.parse({ ...input, apply: false }).apply).toBe(false);
    for (const field of ["actor", "proposedBy", "approval", "execution", "status", "id", "source", "operationsSchemaVersion"]) expect(mcpToolInputSchemas.SubmitChangeSet.safeParse({ ...input, [field]: "forged" }).success).toBe(false);
    const duplicate = mcpToolInputSchemas.SubmitChangeSet.safeParse({ ...input, operations: [operation, operation] });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) expect(duplicate.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ["operations", 1, "operationId"] }), expect.objectContaining({ path: ["operations", 1, "entityId"] })]));
  });

  it("shares request validation while retaining sparse nested patches", () => {
    expect(mcpToolInputSchemas.CreateRoadmap).toBe(createRoadmapRequestSchema);
    expect(mcpToolInputSchemas.UpdateWorkflowStatus.shape.patch.shape.name).toBe(updateWorkflowStatusRequestSchema.shape.name);
    expect(mcpToolInputSchemas.UpdateWorkflowStatus.shape.patch.shape).not.toHaveProperty("apply");
    expect(mcpToolInputSchemas.UpdateWorkflowStatus.parse({ statusId, patch: { name: "Ready" } })).toEqual({ statusId, patch: { name: "Ready" } });
    expect(mcpToolInputSchemas.GetCardHistory.parse({ cardId: statusId })).toEqual({ cardId: statusId, limit: 20 });
    expect(mcpToolInputSchemas.DeleteCard.safeParse({ cardId: statusId }).success).toBe(false);
    expect(mcpToolInputSchemas.BulkUpdateCards.safeParse({ storyMapId: statusId, cardIds: [statusId], patch: {} }).success).toBe(false);
  });

  it("requires inline Source content for agents while preserving human file import and export formats", testRequiresInlineSourceContentForAgentsWhilePreservingHumanFileImport);
});

function registerProvidesDiscoverableObjectSchemasForEveryToolAndExcludes() {
  it("provides discoverable object schemas for every tool and excludes human-only actions", () => {
    expect(Object.keys(mcpToolInputSchemas).sort()).toEqual([...mcpToolNameSchema.options].sort());
    for (const [name, schema] of Object.entries(mcpToolInputSchemas)) {
      const json = z.toJSONSchema(schema, { io: "input" });
      if (json.oneOf) expect(json.oneOf.every((option) => option.type === "object"), name).toBe(true);
      else expect(json.type, name).toBe("object");
    }
    for (const name of ["CreateProject", "RejectChangeSet", "UpdateSafetySettings", "RestoreProject", "ExportProjectArchive", "CreateConnectorConnection"]) {
      expect(mcpToolNameSchema.safeParse(name).success, name).toBe(false);
    }
  });
}

function testRequiresInlineSourceContentForAgentsWhilePreservingHumanFileImport() {
  const input = { projectId, title: "Source", type: "txt" };
  for (const fields of [{}, { content: "" }, { content: " \n " }, { content: "\u00a0\ufeff" }, { filePath: "requirements.txt" }, { content: "Source text", filePath: "requirements.txt" }]) {
    expect(mcpToolInputSchemas.ImportSourceDocument.safeParse({ ...input, ...fields }).success).toBe(false);
  }
  expect(mcpToolInputSchemas.ImportSourceDocument.parse({ ...input, content: "Source text" })).toMatchObject({ content: "Source text" });
  expect(mcpToolInputSchemas.ImportSourceDocument.parse({ ...input, content: " \nSource text\n " }).content).toBe(" \nSource text\n ");
  expect(importSourceDocumentRequestSchema.parse({ ...input, filePath: "requirements.txt" })).toMatchObject({ filePath: "requirements.txt" });
  expect(importSourceDocumentRequestSchema.safeParse({ ...input, type: "docx", content: "Document" }).success).toBe(false);
  expect(mcpToolInputSchemas.ImportSourceDocument.safeParse({ ...input, content: "Source text", fileHash: "a".repeat(64) }).success).toBe(false);
  expect(mcpToolInputSchemas.ExportAudit.parse({ projectId })).toEqual({ projectId, format: "json" });
  expect(mcpToolInputSchemas.ExportAudit.safeParse({ projectId, format: "pdf" }).success).toBe(false);
}
