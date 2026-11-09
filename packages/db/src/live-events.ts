import { parseStoredJson } from "@storymapper/db/versioned-json";
import { randomUUID } from "node:crypto";
import { liveTransactionSchema, type ActorContext, type LiveEntity, type LiveReset, type LiveTransaction } from "@storymapper/contracts";
import type { DatabaseHandle } from "@storymapper/db/database-handle";
import type { SqliteDatabase } from "@storymapper/db/connection";

export interface LiveTransactionState {
  transactionId: string;
  actor: ActorContext;
  liveEntities: Map<string, LiveEntity>;
  lastActivitySeq: number;
  hasBusinessActivity: boolean;
}

export function readLiveCursor(handle: DatabaseHandle): LiveReset {
  handle.assertAvailable();
  return databaseLiveCursor(handle.current);
}

export function databaseLiveCursor(database: SqliteDatabase): LiveReset {
  const epoch = database.$client.prepare("SELECT epoch FROM database_metadata WHERE id = 1").get() as { epoch: string };
  const { seq } = database.$client.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM activity_events").get() as { seq: number };
  return { epoch: epoch.epoch, seq, id: `${epoch.epoch}:${seq}` };
}

export function finalizeLiveTransaction(database: SqliteDatabase, state: LiveTransactionState): LiveTransaction | undefined {
  if (!state.lastActivitySeq && state.liveEntities.size) {
    const entity = state.liveEntities.values().next().value!;
    const inserted = database.$client.prepare("INSERT INTO activity_events (id, project_id, actor, actor_type, mcp_session_id, action, transaction_id, origin_client_id, live_entities_json, created_at) VALUES (?, ?, ?, ?, ?, 'transaction.committed', ?, ?, ?, ?)").run(randomUUID(), entity.projectId, state.actor.actorId, state.actor.actorType, state.actor.mcpSessionId ?? null, state.transactionId, state.actor.originClientId ?? null, JSON.stringify([...state.liveEntities.values()]), new Date().toISOString());
    state.lastActivitySeq = Number(inserted.lastInsertRowid);
    state.hasBusinessActivity = false;
  }
  if (!state.lastActivitySeq) return;
  const cursor = databaseLiveCursor(database);
  const entities = [...state.liveEntities.values()];
  if (state.hasBusinessActivity) {
    database.$client.prepare("UPDATE activity_events SET live_entities_schema_version = 1, live_entities_json = ? WHERE seq = ?").run(JSON.stringify(entities), state.lastActivitySeq);
  }
  return { ...cursor, seq: state.lastActivitySeq, id: `${cursor.epoch}:${state.lastActivitySeq}`, entities, actor: state.actor, originClientId: state.actor.originClientId ?? null };
}

interface LiveRow {
  seq: number;
  transaction_id: string;
  actor: string;
  actor_type: ActorContext["actorType"];
  mcp_session_id: string | null;
  origin_client_id: string | null;
  live_entities_json: string;
  live_entities_schema_version: number;
}

export function replayLiveTransactions(handle: DatabaseHandle, afterSeq: number, limit = 200): LiveTransaction[] {
  handle.assertAvailable();
  const database = handle.current;
  const { epoch } = databaseLiveCursor(database);
  const groups = database.$client.prepare("SELECT transaction_id, MAX(seq) AS seq FROM activity_events WHERE seq > ? AND transaction_id IS NOT NULL GROUP BY transaction_id ORDER BY MAX(seq) LIMIT ?").all(afterSeq, limit) as Array<{ transaction_id: string; seq: number }>;
  const read = database.$client.prepare("SELECT seq, transaction_id, actor, actor_type, mcp_session_id, origin_client_id, live_entities_json, live_entities_schema_version FROM activity_events WHERE transaction_id = ? ORDER BY seq");
  return groups.map((group) => {
    const rows = read.all(group.transaction_id) as LiveRow[];
    const last = rows.at(-1)!;
    const entities = new Map<string, LiveEntity>();
    for (const row of rows) for (const entity of parseStoredJson("activity_events", "live_entities_json", row.live_entities_json, row.live_entities_schema_version)) entities.set(`${entity.entityType}:${entity.entityId}`, entity);
    return liveTransactionSchema.parse({
      epoch, seq: group.seq, id: `${epoch}:${group.seq}`, entities: [...entities.values()],
      actor: { actorId: last.actor, actorType: last.actor_type, ...(last.mcp_session_id ? { mcpSessionId: last.mcp_session_id } : {}), ...(last.origin_client_id ? { originClientId: last.origin_client_id } : {}) },
      originClientId: last.origin_client_id
    });
  });
}
