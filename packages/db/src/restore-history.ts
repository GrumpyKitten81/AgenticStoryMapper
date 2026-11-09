import { parseWorkItemLocator, workItemProviderSchema } from "@storymapper/contracts";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { transitionStoredOperations } from "@storymapper/db/operation-schema-transition";
import type { ActorContext, RestoreProjectResult } from "@storymapper/contracts";

type HistoryRow = Record<string, string | number | null> & { id: string; project_id: string | null };

function changedRows(source: Database.Database, target: Database.Database, table: "activity_events" | "change_sets"): HistoryRow[] {
  const rows = source.prepare(`SELECT * FROM ${table}`).all() as HistoryRow[];
  const existing = target.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const comparable = (row: HistoryRow | undefined) => row && Object.fromEntries(Object.entries(row).filter(([column]) => table !== "activity_events" || column !== "seq"));
  return rows.filter((row) => JSON.stringify(comparable(existing.get(row.id) as HistoryRow | undefined)) !== JSON.stringify(comparable(row)));
}

function ensureHistoricalProject(target: Database.Database, projectId: string): void {
  target.prepare("INSERT INTO projects (id, name, local_path, historical_stub, created_at) VALUES (?, 'Historical Project', ?, 1, ?) ON CONFLICT(id) DO NOTHING").run(projectId, `historical:${projectId}`, new Date().toISOString());
}

function preserveRows(target: Database.Database, table: "activity_events" | "change_sets", rows: HistoryRow[]): void {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]!).filter((column) => table !== "activity_events" || column !== "seq");
  const assignments = columns.filter((column) => column !== "id").map((column) => `${column}=excluded.${column}`).join(",");
  const insert = target.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${assignments}`);
  for (const row of rows) {
    if (row.project_id) ensureHistoricalProject(target, row.project_id);
    insert.run(...columns.map((column) => column === "undone_by_restore" ? 1 : row[column]!));
  }
}

function preserveRemotePushEvidence(source: Database.Database, target: Database.Database): void {
  const plans = source.prepare("SELECT id, project_id, story_map_id, connection_id, epoch, plan_json, plan_schema_version FROM remote_push_plans").all() as Array<{ id: string; project_id: string; story_map_id: string; connection_id: string; epoch: string; plan_json: string; plan_schema_version: number }>;
  const existing = target.prepare("SELECT plan_json, plan_schema_version FROM remote_push_plans WHERE id = ?");
  const insertPlan = target.prepare("INSERT INTO remote_push_plans (id, project_id, story_map_id, connection_id, epoch, plan_json, plan_schema_version) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING");
  const insertExecution = target.prepare("INSERT INTO remote_push_executions (plan_id, status, execution_json, execution_schema_version) VALUES (?, ?, ?, ?) ON CONFLICT(plan_id) DO UPDATE SET status = excluded.status, execution_json = excluded.execution_json, execution_schema_version = excluded.execution_schema_version");
  const executionFor = source.prepare("SELECT status, execution_json, execution_schema_version FROM remote_push_executions WHERE plan_id = ?");
  for (const plan of plans) {
    const prior = existing.get(plan.id) as { plan_json: string; plan_schema_version: number } | undefined;
    if (prior && (prior.plan_json !== plan.plan_json || prior.plan_schema_version !== plan.plan_schema_version)) throw new Error("An immutable remote plan changed between the current database and Restore point.");
    const execution = executionFor.get(plan.id) as { status: string; execution_json: string; execution_schema_version: number } | undefined;
    if (!execution) throw new Error("Current remote plan execution evidence is missing.");
    ensureHistoricalProject(target, plan.project_id);
    insertPlan.run(plan.id, plan.project_id, plan.story_map_id, plan.connection_id, plan.epoch, plan.plan_json, plan.plan_schema_version);
    insertExecution.run(plan.id, execution.status, execution.execution_json, execution.execution_schema_version);
  }
}

export function laterGitHubLinks(source: Database.Database, target: Database.Database): RestoreProjectResult["githubLinks"] {
  type Reference = { id: string; entity_type: string; entity_id: string; scope_id: string; external_id: string; system: string };
  const query = `SELECT id, entity_type, entity_id, scope_id, external_id, system FROM external_refs WHERE system IN (${workItemProviderSchema.options.map(() => "?").join(",")}) ORDER BY id`;
  const existing = new Map((target.prepare(query).all(...workItemProviderSchema.options) as Reference[]).map((row) => [row.id, row]));
  return (source.prepare(query).all(...workItemProviderSchema.options) as Reference[]).filter((row) => JSON.stringify(existing.get(row.id)) !== JSON.stringify(row))
    .map((row) => ({ url: parseWorkItemLocator(row.system, row.external_id)!.url, provider: workItemProviderSchema.parse(row.system), kind: "canonical" }));
}

export function prepareRestoredHistory(source: Database.Database, target: Database.Database, projectId: string, actor: ActorContext, result: RestoreProjectResult): void {
  const activity = changedRows(source, target, "activity_events");
  const changeSets = changedRows(source, target, "change_sets");
  result.undoneActivityEvents = activity.length;
  result.undoneChangeSets = changeSets.length;
  target.transaction(() => {
    preserveRows(target, "activity_events", activity);
    preserveRows(target, "change_sets", changeSets);
    preserveRemotePushEvidence(source, target);
    transitionStoredOperations(target);
    ensureHistoricalProject(target, projectId);
    target.prepare("UPDATE project_settings SET epoch = ?").run(result.epoch);
    target.prepare("UPDATE database_metadata SET epoch = ? WHERE id = 1").run(result.epoch);
    target.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, mcp_session_id, action, affected_entity_type, affected_entity_id, after_json, created_at, transaction_id, origin_client_id, live_entities_json, live_entities_schema_version, after_schema_version) VALUES (?, ?, ?, ?, ?, 'project.restored', 'project', ?, ?, ?, ?, ?, ?, 1, 1)").run(randomUUID(), projectId, actor.actorId, actor.actorType, actor.mcpSessionId ?? null, projectId, JSON.stringify(result), new Date().toISOString(), randomUUID(), actor.originClientId ?? null, JSON.stringify([{ entityType: "project", entityId: projectId, projectId, version: null }]));
  })();
}
