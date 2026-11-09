import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bulkUpdateCardsRequestSchema, createCardRequestSchema, createPersonaRequestSchema,
  createReleaseRequestSchema, createRoadmapCardRequestSchema, createRoadmapRequestSchema,
  createAnnotationRequestSchema, createStoryTemplateRequestSchema, createConnectorConnectionRequestSchema,
  preparedSourceDocumentImportSchema, updateAnnotationRequestSchema, updateCardRequestSchema,
  updateConnectorConnectionRequestSchema, updatePersonaRequestSchema, updateSafetySettingsRequestSchema,
  updateReleaseRequestSchema, updateRoadmapRequestSchema, updateStoryTemplateRequestSchema,
  updateWorkflowStatusRequestSchema, upsertProductContextRequestSchema, workItemSyncHealthResponseSchema
} from "@storymapper/contracts/api/http";
import {
  createStoryMapCardToolInputSchema, createStoryMapPersonaToolInputSchema, createStoryMapReleaseToolInputSchema,
  updateStoryMapCardToolInputSchema, updateStoryMapPersonaToolInputSchema, updateStoryMapReleaseToolInputSchema
} from "@storymapper/contracts/mcp/tools";
import {
  backlogHealthReportSchema, changeOperationSchema, githubSyncHealthReportSchema,
  sourceDocumentDetailsSchema, syncConflictSchema, uuidSchema, sha256HexSchema, workItemSyncHealthReportSchema,
  projectArchiveManifestSchema, cardSchema, githubLinkSchema, remoteWorkItemLinkSchema,
  projectSchema, changeSetSchema, activityEventSchema, safetySettingsSchema, releaseSummaryReportSchema
} from "@storymapper/contracts/schemas/domain";
import { cardHistoryCursorSchema, cardHistoryQuerySchema } from "@storymapper/contracts/api/card-customization";
import { restorePointSchema, restoreProjectResultSchema } from "@storymapper/contracts/schemas/restore-points";
import { projectArchiveExportQuerySchema } from "@storymapper/contracts/schemas/project-archive";

const id = randomUUID();
it("validates Release status counts without dropping prototype-named statuses", () => {
  const schema = releaseSummaryReportSchema.shape.statusCounts;
  const counts = Object.fromEntries([["__proto__", 1], ["constructor", 2], ["toString", 3]]);
  expect(schema.parse(counts)).toEqual(counts);
  expect(Object.keys(schema.parse(counts))).toEqual(["__proto__", "constructor", "toString"]);
  for (const invalid of [null, [], new Date(), new Map(), 1, "counts", { todo: -1 }, { todo: 0.5 }, { todo: "1" }, { todo: NaN }, { todo: Infinity }]) {
    expect(schema.safeParse(invalid).success).toBe(false);
  }
});
const patches = [
  updateCardRequestSchema, updateReleaseRequestSchema, updatePersonaRequestSchema,
  updateAnnotationRequestSchema, updateStoryTemplateRequestSchema, updateWorkflowStatusRequestSchema,
  updateRoadmapRequestSchema, updateSafetySettingsRequestSchema, updateConnectorConnectionRequestSchema
] as const;

describe("Zod migration contract behavior", () => {
  it("retains restore history markers, safety epochs and supplied restore primitives", testRetainsRestoreHistoryMarkersSafetyEpochsAndSuppliedRestorePrimitives);

  registerRetainsEveryPortableArchiveManifestConstraintAndServiceOwned();

  registerRetainsArchiveAndRestorePointUTCTimestampsAtMinute();

  it("retains large integer acceptance while preserving integer predicates and explicit bounds", testRetainsLargeIntegerAcceptanceWhilePreservingIntegerPredicatesAndExplicitBounds);

  it("validates public link URLs and requires normalized canonical remote locators", () => {
    for (const schema of [githubLinkSchema.shape.url, remoteWorkItemLinkSchema.shape.url]) {
      const value = "https://github.com/owner/repo/issues/1";
      expect(schema.parse(value)).toBe(value);
      for (const value of ["invalid", "/relative", "https://", ""]) expect(schema.safeParse(value).success).toBe(false);
    }
    expect(remoteWorkItemLinkSchema.shape.url.safeParse("  https://github.com/owner/repo/issues/1  ").success).toBe(false);
  });

  it.each(patches.map((schema, index) => ({ schema, index })))("keeps omitted fields absent in patch $index", ({ schema }) => {
    expect(schema.parse({})).toEqual({});
  });

  it("keeps nested MCP patches and Product Context sparse", () => {
    expect(updateCardRequestSchema.parse({ title: "Renamed" })).toEqual({ title: "Renamed" });
    expect(upsertProductContextRequestSchema.parse({ projectId: id })).toEqual({ projectId: id });
    expect(updateStoryMapCardToolInputSchema.parse({ cardId: id, baseVersion: 1, patch: {} })).toEqual({ cardId: id, baseVersion: 1, patch: {} });
    expect(updateStoryMapReleaseToolInputSchema.parse({ storyMapId: id, releaseId: id, baseVersion: 1, patch: {} }).patch).toEqual({});
    expect(updateStoryMapPersonaToolInputSchema.parse({ projectId: id, personaId: id, baseVersion: 1, patch: {} }).patch).toEqual({});
  });

  it("keeps omitted creation values absent on both public surfaces", testKeepsOmittedCreationValuesAbsentOnBothPublicSurfaces);

  it("preserves supplied strings, booleans, lists and nulls while rejecting invalid values", testPreservesSuppliedStringsBooleansListsAndNullsWhileRejectingInvalidValues);

  it("accepts sparse enum dictionaries and rejects unknown keys or invalid counts", testAcceptsSparseEnumDictionariesAndRejectsUnknownKeysOrInvalidCounts);

  it("retains UUID-like IDs, optional unknown fields, stripping and strict-key validation", () => {
    expect(uuidSchema.parse("00000000-0000-0000-0000-000000000001")).toBe("00000000-0000-0000-0000-000000000001");
    expect(uuidSchema.safeParse("invalid").success).toBe(false);
    expect(updateCardRequestSchema.parse({ title: "Card", unexpected: true })).toEqual({ title: "Card" });
    expect(changeOperationSchema.safeParse({ op: "update", entity: "card", entityId: id, unexpected: true }).success).toBe(false);
    const conflict = { id, externalRefId: id, syncRunId: id, connectionId: id, field: "title", createdAt: new Date().toISOString() };
    expect(syncConflictSchema.parse(conflict)).toEqual({ ...conflict, status: "open" });
    const fileHash = "a".repeat(64);
    expect(preparedSourceDocumentImportSchema.parse({ projectId: id, title: "Source", type: "txt", content: "", parsedChunks: [], fileHash }).fileHash).toBe(fileHash);
    expect(sha256HexSchema.safeParse(id).success).toBe(false);
  });
});

function registerRetainsArchiveAndRestorePointUTCTimestampsAtMinute() {
  it("retains archive and restore-point UTC timestamps at minute, second and fractional precision", () => {
    for (const schema of [projectArchiveManifestSchema.shape.exportedAt, restorePointSchema.shape.createdAt]) {
      for (const value of ["2026-10-04T12:34Z", "2026-10-04T12:34:56Z", "2026-10-04T12:34:56.123456Z"]) {
        expect(schema.parse(value)).toBe(value);
      }
      for (const value of ["2026-02-30T12:34Z", "2026-10-04T25:34Z", "2026-10-04T12:34+00:00", "2026-10-04T12:34:56-01:00", "2026-10-04T12:34"]) {
        expect(schema.safeParse(value).success).toBe(false);
      }
    }
  });
}

function registerRetainsEveryPortableArchiveManifestConstraintAndServiceOwned() {
  it("retains every portable archive manifest constraint and service-owned version diagnostics", () => {
    const manifest = { formatVersion: 1, schemaVersion: "dev-schema", exportedAt: "2026-10-04T12:34Z", appVersion: "0.1.0", databaseFileName: "storymapper.sqlite", databaseSha256: "a".repeat(64), dataClassification: "business-data", redactedTables: [], redactedRowCount: 0, counts: { projects: 1, storyMaps: 0, cards: 0 }, includedFolders: ["documents", "attachments", "exports"] };
    expect(projectArchiveManifestSchema.parse(manifest)).toEqual(manifest);
    expect(projectArchiveManifestSchema.parse({ ...manifest, formatVersion: 99 }).formatVersion).toBe(99);
    expect(projectArchiveManifestSchema.parse({ ...manifest, includedFolders: [] }).includedFolders).toEqual([]);
    const { schemaVersion, ...missingVersion } = manifest;
    expect(projectArchiveManifestSchema.safeParse(missingVersion).success).toBe(false);
    for (const invalid of [{ schemaVersion: "" }, { formatVersion: 1.5 }, { databaseFileName: "other.sqlite" }, { databaseSha256: "A".repeat(64) }, { databaseSha256: "a".repeat(63) }, { counts: { ...manifest.counts, projects: 2 } }, { includedFolders: ["logs"] }, { unexpected: true }]) expect(projectArchiveManifestSchema.safeParse({ ...manifest, ...invalid }).success).toBe(false);
  });
}

function testRetainsRestoreHistoryMarkersSafetyEpochsAndSuppliedRestorePrimitives() {
  const guid = "00000000-0000-0000-0000-000000000001";
  for (const schema of [projectSchema.pick({ historicalStub: true }), changeSetSchema.pick({ undoneByRestore: true }), activityEventSchema.pick({ undoneByRestore: true })]) {
    const key = Object.keys(schema.shape)[0]!;
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ [key]: true })).toEqual({ [key]: true });
    expect(schema.parse({ [key]: false })).toEqual({ [key]: false });
    expect(schema.safeParse({ [key]: "true" }).success).toBe(false);
  }
  expect(safetySettingsSchema.pick({ epoch: true }).parse({ epoch: guid })).toEqual({ epoch: guid });
  expect(safetySettingsSchema.pick({ epoch: true }).parse({})).toEqual({});
  expect(safetySettingsSchema.shape.epoch.unwrap().safeParse("invalid").success).toBe(false);
  expect(projectArchiveExportQuerySchema.parse({ projectId: guid })).toEqual({ projectId: guid });
  const result = { epoch: guid, githubLinks: [{ url: "  https://github.com/owner/repo/issues/1  ", provider: "github", kind: "canonical" }], undoneActivityEvents: 9_007_199_254_740_992, undoneChangeSets: 9_007_199_254_740_992 };
  const schema = restoreProjectResultSchema.pick({ epoch: true, githubLinks: true, undoneActivityEvents: true, undoneChangeSets: true });
  expect(schema.parse(result)).toEqual(result);
  for (const invalid of [{ epoch: "invalid" }, { githubLinks: [{ ...result.githubLinks[0], url: "invalid" }] }, { undoneActivityEvents: -1 }, { undoneChangeSets: 1.5 }]) expect(schema.safeParse({ ...result, ...invalid }).success).toBe(false);
}

function testRetainsLargeIntegerAcceptanceWhilePreservingIntegerPredicatesAndExplicitBounds() {
  const large = 9_007_199_254_740_992;
  for (const schema of [cardSchema.shape.businessValue, cardSchema.shape.effort, cardSchema.shape.version, restorePointSchema.shape.sizeBytes, backlogHealthReportSchema.shape.totalStories]) {
    expect(schema.parse(large)).toBe(large);
    for (const value of [1.5, NaN, Infinity, -Infinity, "1"]) expect(schema.safeParse(value).success).toBe(false);
  }
  expect(cardSchema.shape.businessValue.parse(-large)).toBe(-large);
  expect(cardSchema.shape.version.safeParse(0).success).toBe(false);
  expect(restorePointSchema.shape.sizeBytes.safeParse(-1).success).toBe(false);
  expect(updateCardRequestSchema.parse({ businessValue: large })).toEqual({ businessValue: large });
  expect(updateStoryMapCardToolInputSchema.parse({ cardId: id, baseVersion: 1, patch: { businessValue: large } }).patch).toEqual({ businessValue: large });
  expect(cardHistoryCursorSchema.parse(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  expect(cardHistoryCursorSchema.safeParse(String(large)).success).toBe(false);
  expect(cardHistoryCursorSchema.safeParse("1.5").success).toBe(false);
  expect(cardHistoryQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
}

function testKeepsOmittedCreationValuesAbsentOnBothPublicSurfaces() {
  for (const schema of [createCardRequestSchema, createStoryMapCardToolInputSchema]) {
    const input = { storyMapId: id, level: "activity", title: "Activity" };
    expect(schema.parse(input)).toEqual(input);
  }
  for (const schema of [createReleaseRequestSchema, createStoryMapReleaseToolInputSchema]) {
    const input = { storyMapId: id, name: "Release" };
    expect(schema.parse(input)).toEqual(input);
    expect(schema.parse({ ...input, released: true })).toEqual({ ...input, released: true });
    expect(schema.parse({ ...input, released: false })).toEqual({ ...input, released: false });
    expect(schema.safeParse({ ...input, released: "false" }).success).toBe(false);
  }
  for (const schema of [createPersonaRequestSchema, createStoryMapPersonaToolInputSchema]) {
    const input = { projectId: id, name: "Persona" };
    expect(schema.parse(input)).toEqual(input);
  }
  for (const schema of [createAnnotationRequestSchema, createStoryTemplateRequestSchema]) {
    const input = { projectId: id, name: "Customization" };
    expect(schema.parse(input)).toEqual(input);
  }
  expect(createRoadmapRequestSchema.parse({ projectId: id, name: "Roadmap" })).toEqual({ projectId: id, name: "Roadmap" });
  const card = { roadmapId: id, columnId: id, title: "Roadmap Card" };
  expect(createRoadmapCardRequestSchema.parse(card)).toEqual(card);
  const connection = { projectId: id, provider: "github", name: "Connection", authMode: "token", owner: "owner" };
  expect(createConnectorConnectionRequestSchema.parse(connection)).toEqual(connection);
}

function testPreservesSuppliedStringsBooleansListsAndNullsWhileRejectingInvalidValues() {
  const card = { description: "", status: "active", releaseId: null, estimate: 0 };
  expect(updateCardRequestSchema.parse(card)).toEqual(card);
  const release = { goal: "", released: false, startDate: null, releaseDate: null };
  expect(updateReleaseRequestSchema.parse(release)).toEqual(release);
  const persona = { description: "", goals: [], pains: ["Pain"] };
  expect(updatePersonaRequestSchema.parse(persona)).toEqual(persona);
  expect(upsertProductContextRequestSchema.parse({ projectId: id, keyFeatures: [], purpose: "" })).toEqual({ projectId: id, keyFeatures: [], purpose: "" });
  expect(updateReleaseRequestSchema.safeParse({ released: "false" }).success).toBe(false);
  expect(updateCardRequestSchema.safeParse({ title: "" }).success).toBe(false);
  expect(updatePersonaRequestSchema.safeParse({ goals: [1] }).success).toBe(false);
  expect(bulkUpdateCardsRequestSchema.safeParse({ storyMapId: id, cardIds: [id], patch: {} }).success).toBe(false);
}

function testAcceptsSparseEnumDictionariesAndRejectsUnknownKeysOrInvalidCounts() {
  const schemas = [backlogHealthReportSchema.shape.issueCounts, githubSyncHealthReportSchema.shape.stateCounts,
    workItemSyncHealthReportSchema.shape.stateCounts, workItemSyncHealthResponseSchema.shape.stateCounts];
  for (const schema of schemas) {
    const key = schema === schemas[0] ? "missing-description" : "synced";
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ [key]: 2 })).toEqual({ [key]: 2 });
    expect(schema.safeParse({ unknown: 2 }).success).toBe(false);
    expect(schema.safeParse({ [key]: -1 }).success).toBe(false);
  }
  const linked = sourceDocumentDetailsSchema.shape.linkedCardsByChunkId;
  expect(linked.parse({ chunk: [] })).toEqual({ chunk: [] });
  expect(linked.safeParse({ chunk: 2 }).success).toBe(false);
}
