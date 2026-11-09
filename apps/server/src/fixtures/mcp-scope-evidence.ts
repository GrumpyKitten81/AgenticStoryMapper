import { randomUUID } from "node:crypto";
import type { ChangeSetInput } from "@storymapper/contracts";
import type { DatabaseHandle } from "@storymapper/db";

export function seedLegacySourceLink(handle: DatabaseHandle, cardId: string, chunkId: string): void {
  handle.current.$client.prepare("INSERT INTO card_source_links (id, card_id, kind, chunk_id, created_at) VALUES (?, ?, 'chunk', ?, ?)").run(randomUUID(), cardId, chunkId, new Date().toISOString());
}

export function seedHistoricalChangeSet(handle: DatabaseHandle, input: ChangeSetInput, operationsSchemaVersion = 1): ChangeSetInput {
  handle.current.$client.prepare("INSERT INTO change_sets (id, project_id, title, source, status, operations_schema_version, operations_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(input.id, input.projectId, input.title, input.source, input.status ?? "proposed", operationsSchemaVersion, JSON.stringify(input.operations), input.createdAt);
  return input;
}
