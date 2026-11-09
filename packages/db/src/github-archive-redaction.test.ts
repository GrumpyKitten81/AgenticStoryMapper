import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { cardHistorySnapshotSchema } from "@storymapper/contracts";
import { expect, it, vi } from "vitest";
import { containsGitHubDatabasePayloads, redactGitHubDatabasePayloads, redactGitHubPayload } from "@storymapper/db/github-archive-redaction";

it("removes canonical identity, sync state and evidence recursively while preserving other bindings and source plans", () => {
  const agentRef = { id: "agent-ref", entityType: "card", entityId: "card", system: "agent", externalId: "source-card" };
  const baseline = { system: "agent", entries: [{ cardId: "card", identity: { externalId: "source-card" }, card: { description: "Authored content" } }] };
  const retained = redactGitHubPayload({
    externalRefs: [agentRef, { id: "remote-ref", system: "github", externalId: "https://github.com/fixture/secret/issues/1" }],
    changes: [
      { entity: "remoteWorkItemLink", after: { externalRefId: "remote-ref", titleHash: "secret-baseline" } },
      { entity: "externalRef", before: { system: "github", externalId: "https://github.com/fixture/secret/issues/2" } },
      { entity: "card", after: { title: "Retained title" } }
    ],
    nested: { evidence: [{ kind: "github", externalRefId: "remote-ref" }, { kind: "note", note: "Keep" }], sync: { externalRefId: "remote-ref", bodyHash: "secret-hash" } },
    sourcePlanBaselines: [baseline],
    githubLinks: [{ url: "https://github.com/fixture/secret/issues/3" }],
    remoteWorkItemLinks: [{ externalRefId: "remote-ref" }],
    defaultConnectionId: "secret-connection"
  }, new Set(["remote-ref"]));
  expect(retained).toEqual({ externalRefs: [agentRef], changes: [{ entity: "card", after: { title: "Retained title" } }],
    nested: { evidence: [{ kind: "note", note: "Keep" }] }, sourcePlanBaselines: [baseline], githubLinks: [], remoteWorkItemLinks: [], defaultConnectionId: null });
  expect(JSON.stringify(retained)).not.toContain("secret");
});

it("reconciles copied Card provenance from retained chunk/note evidence and preserves creation origins", () => {
  const result = redactGitHubPayload({ cards: [{ id: "issue", creationOrigin: "inference", provenance: "linked" }, { id: "note", creationOrigin: "manual", provenance: "linked" }],
    sourceLinks: [{ kind: "github", cardId: "issue", externalRefId: "remote-ref" }, { kind: "note", cardId: "note", note: "Kept" }] });
  expect(result).toEqual({ cards: [{ id: "issue", creationOrigin: "inference", provenance: "inference" }, { id: "note", creationOrigin: "manual", provenance: "linked" }],
    sourceLinks: [{ kind: "note", cardId: "note", note: "Kept" }] });
});

it("redacts and validates sizeable serialized histories with bounded batches while retaining business payloads", () => {
  const database = new Database(":memory:");
  database.exec("CREATE TABLE activity_events (id TEXT PRIMARY KEY, before_json TEXT, before_schema_version INTEGER DEFAULT 1, after_json TEXT, after_schema_version INTEGER); CREATE TABLE change_sets (id TEXT PRIMARY KEY, status TEXT, operations_json TEXT, operations_schema_version INTEGER DEFAULT 1, undone_by_restore INTEGER DEFAULT 0, approval_json TEXT, approval_schema_version INTEGER, execution_json TEXT, execution_schema_version INTEGER, warnings_json TEXT, warnings_schema_version INTEGER); CREATE TABLE card_versions (id TEXT PRIMARY KEY, snapshot_json TEXT, snapshot_schema_version INTEGER DEFAULT 1)");
  const canary = randomUUID();
  const retained = "Business history ".repeat(512);
  const payload = JSON.stringify({ description: retained, refs: [{ system: "github", externalId: canary }, { system: "agent", externalId: "kept" }] });
  const activity = database.prepare("INSERT INTO activity_events (rowid, id, before_json) VALUES (?, ?, ?)");
  const changeSet = database.prepare("INSERT INTO change_sets (rowid, id, status, operations_json) VALUES (?, ?, 'applied', ?)");
  const snapshot = JSON.stringify({ ...cardHistorySnapshotSchema.parse({ creationOrigin: "manual", provenance: "manual", version: 1, id: randomUUID(), storyMapId: randomUUID(), parentId: null, releaseId: null, key: "LSM-1", level: "story", title: "Business history", description: retained, position: 0, status: "todo", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), refs: [{ system: "github", externalId: canary }, { system: "agent", externalId: "kept" }] });
  const history = database.prepare("INSERT INTO card_versions (rowid, id, snapshot_json) VALUES (?, ?, ?)");
  database.transaction(() => { for (let index = 0; index < 257; index++) { activity.run(index - 128, String(index), payload); changeSet.run(index - 128, String(index), JSON.stringify([{ entity: "githubExternalRef", after: { externalId: canary } }, { entity: "card", after: { description: retained } }])); history.run(index - 128, String(index), snapshot); } })();
  const observedBatchSizes: number[] = [];
  const prepare = database.prepare.bind(database);
  const spy = vi.spyOn(database, "prepare").mockImplementation((sql) => {
    const statement = prepare(sql);
    if (sql.startsWith("SELECT rowid AS payload_row_id")) {
      expect(sql).toContain("LIMIT ?");
      const all = statement.all.bind(statement);
      vi.spyOn(statement, "all").mockImplementation((...parameters: unknown[]) => {
        const rows = all(...parameters);
        observedBatchSizes.push(rows.length);
        return rows;
      });
    }
    return statement;
  });
  try {
    expect(containsGitHubDatabasePayloads(database)).toBe(true);
    redactGitHubDatabasePayloads(database, new Set());
    expect(containsGitHubDatabasePayloads(database)).toBe(false);
    expect(observedBatchSizes.length).toBeGreaterThan(6);
    expect(Math.max(...observedBatchSizes)).toBeLessThan(257);
    for (const [table, column] of [["activity_events", "before_json"], ["change_sets", "operations_json"], ["card_versions", "snapshot_json"]]) {
      expect(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 257 });
      expect(database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} LIKE ?`).get(`%${canary}%`)).toEqual({ count: 0 });
      const row = database.prepare(`SELECT ${column} AS payload FROM ${table} WHERE id = '256'`).get() as { payload: string };
      expect(row.payload).toContain(retained);
      expect(row.payload).not.toContain(canary);
    }
  } finally { spy.mockRestore(); database.close(); }
});
