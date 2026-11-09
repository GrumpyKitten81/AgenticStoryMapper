import { validateCardReviewRows } from "@storymapper/db/card-review-validation";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { cardDependencySchema, remotePushExecutionSchema, remotePushPlanSchema, DomainError, uuidSchema } from "@storymapper/contracts";
import { dependencyCycle } from "@storymapper/core";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { currentReleaseSchemaVersion, loadMigrationAssets } from "@storymapper/db/migration-assets";
import { authenticateMigrationPrefix } from "@storymapper/db/migration-runner";
import { validatePersistedJson } from "@storymapper/db/versioned-json-validation";
import { parseStoredPlanState } from "@storymapper/db/plan-state-validation";
import { parseStoredSourcePlanBaseline } from "@storymapper/db/source-plan-baseline-validation";
import { planStates, remotePushPlans, remotePushExecutions, sourcePlanBaselines } from "@storymapper/db/schema";

export class RestoreValidationError extends DomainError {
  constructor(message: string, options?: ErrorOptions) {
    super("validation", message);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function databaseSchemaVersion(database: Database.Database, assets: MigrationMeta[] = loadMigrationAssets()): string {
  return authenticateMigrationPrefix(database, assets).schemaVersion;
}

export function validateRestoreSource(database: Database.Database, expectedSchema: string, assets: MigrationMeta[] = loadMigrationAssets()): void {
  const integrity = database.pragma("integrity_check") as Array<{ integrity_check: string }>;
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") throw new RestoreValidationError("Restore point failed SQLite integrity validation.");
  if ((database.pragma("foreign_key_check") as unknown[]).length) throw new RestoreValidationError("Restore point contains invalid foreign keys.");
  const admission = authenticateMigrationPrefix(database, assets);
  if (!admission.appliedCount) throw new RestoreValidationError("Restore/archive source is empty and has no authenticated release journal. Preserve the input and select a supported release snapshot or archive.");
  if (admission.schemaVersion !== expectedSchema) throw new RestoreValidationError("Restore point schema does not match its declared release schema. Preserve the original and reopen it with the matching release.");
}

export function validateRestoreDatabase(database: Database.Database, expectedSchema: string, assets: MigrationMeta[] = loadMigrationAssets()): void {
  validateRestoreSource(database, expectedSchema, assets);
  if (expectedSchema !== currentReleaseSchemaVersion(assets)) throw new RestoreValidationError("Restore point must be migrated to the current release schema before business validation.");
  validateDatabaseEpoch(database);
  validatePersistedJson(database);
  validateDependencyRows(database);
  validatePlanStateRows(database);
  validateSourcePlanBaselineRows(database);
  validateRemotePushRows(database);
  validateCardReviewRows(database);
}

export function validateDatabaseEpoch(database: Database.Database): void {
  const metadata = database.prepare("SELECT id, epoch FROM database_metadata").all() as Array<{ id: number; epoch: unknown }>;
  if (metadata.length !== 1 || metadata[0]?.id !== 1 || !uuidSchema.safeParse(metadata[0].epoch).success) throw new RestoreValidationError("Database is missing its valid database epoch. Preserve the original and restore a supported snapshot; metadata is never repaired automatically.");
}

function validatePlanStateRows(database: Database.Database): void {
  const maps = new Map((database.prepare("SELECT id, project_id FROM story_maps").all() as Array<{ id: string; project_id: string }>).map((map) => [map.id, map.project_id]));
  for (const row of drizzle(database).select().from(planStates).all()) {
    const projectId = maps.get(row.storyMapId);
    if (!projectId) throw new RestoreValidationError("Snapshot Plan state has no owning Story Map.");
    parseStoredPlanState(row, projectId);
  }
}

function validateDependencyRows(database: Database.Database): void {
  const cards = new Map((database.prepare("SELECT id, story_map_id FROM cards").all() as Array<{ id: string; story_map_id: string }>).map((card) => [card.id, card.story_map_id]));
  const edges = database.prepare("SELECT id, card_id AS cardId, prerequisite_card_id AS prerequisiteCardId, created_at AS createdAt FROM card_dependencies").all();
  const graph: Array<{ cardId: string; prerequisiteCardId: string }> = [];
  for (const row of edges) {
    const parsed = cardDependencySchema.safeParse(row);
    if (!parsed.success) throw new RestoreValidationError("Snapshot contains an invalid Card dependency.");
    const edge = parsed.data;
    if (!cards.has(edge.cardId) || cards.get(edge.cardId) !== cards.get(edge.prerequisiteCardId)) throw new RestoreValidationError("Snapshot dependency endpoints belong to different Story Maps.");
    if (dependencyCycle(graph, edge.cardId, edge.prerequisiteCardId)) throw new RestoreValidationError("Snapshot contains a Card dependency cycle.");
    graph.push(edge);
  }
}

function validateSourcePlanBaselineRows(database: Database.Database): void {
  const maps = new Map((database.prepare("SELECT id, project_id FROM story_maps").all() as Array<{ id: string; project_id: string }>).map((map) => [map.id, map.project_id]));
  for (const row of drizzle(database).select().from(sourcePlanBaselines).all()) {
    const projectId = maps.get(row.storyMapId);
    if (!projectId) throw new RestoreValidationError("Snapshot Source Plan baseline has no owning Story Map.");
    parseStoredSourcePlanBaseline(row, projectId);
  }
}

function validateRemotePushRows(database: Database.Database): void {
  const db = drizzle(database);
  const executions = new Map(db.select().from(remotePushExecutions).all().map((row) => [row.planId, row]));
  for (const row of db.select().from(remotePushPlans).all()) {
    try {
      const plan = remotePushPlanSchema.parse(JSON.parse(row.planJson));
      const stored = executions.get(row.id);
      const execution = remotePushExecutionSchema.parse(stored && JSON.parse(stored.executionJson));
      if (plan.id !== row.id || plan.projectId !== row.projectId || plan.storyMapId !== row.storyMapId || plan.connectionId !== row.connectionId || plan.epoch !== row.epoch || execution.planId !== row.id || execution.status !== stored?.status) throw new RestoreValidationError("Snapshot remote push ownership is inconsistent.");
      if (plan.items.length !== execution.items.length || plan.items.some((item, index) => execution.items[index]?.itemId !== item.id)) throw new RestoreValidationError("Snapshot remote push item evidence is inconsistent.");
    } catch (error) {
      if (error instanceof RestoreValidationError) throw error;
      if (error instanceof SyntaxError || error instanceof Error && error.name === "ZodError") throw new RestoreValidationError("Snapshot contains invalid remote push evidence.", { cause: error });
      throw error;
    }
  }
}
