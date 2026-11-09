import { splitTextIntoChunks } from "@storymapper/importers";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openStoryMapperDb } from "@storymapper/db/connection";
import { DatabaseHandle, UnitOfWork } from "@storymapper/db";
import { hashText } from "@storymapper/db/repositories/repository-values";

const directories: string[] = [];

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("source document migration", () => {
  it("refuses populated prototypes before enrollment, backfills or persistent pragma changes", () => {
    const directory = mkdtempSync(join(tmpdir(), "storymapper-source-migration-"));
    directories.push(directory);
    const path = join(directory, "storymapper.sqlite");
    const legacy = new Database(path);
    legacy.pragma("foreign_keys = ON");
    legacy.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      INSERT INTO projects VALUES ('project');
      CREATE TABLE cards (id TEXT PRIMARY KEY, story_map_id TEXT, parent_id TEXT);
      INSERT INTO cards (id) VALUES ('card');
      CREATE TABLE source_documents (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL, type TEXT NOT NULL, file_path TEXT NOT NULL, file_hash TEXT NOT NULL, imported_at TEXT NOT NULL
      );
      CREATE TABLE source_chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
        text TEXT NOT NULL, locator TEXT NOT NULL, heading TEXT, page INTEGER
      );
      CREATE TABLE card_source_links (
        id TEXT PRIMARY KEY, card_id TEXT NOT NULL, chunk_id TEXT NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
        confidence REAL, created_at TEXT NOT NULL
      );
      INSERT INTO source_documents VALUES ('new', 'project', 'New', 'txt', 'new.txt', '${"a".repeat(64)}', '2026-01-02T00:00:00.000Z');
      INSERT INTO source_documents VALUES ('old', 'project', 'Old', 'txt', 'old.txt', '${"a".repeat(64)}', '2026-01-01T00:00:00.000Z');
      INSERT INTO source_chunks VALUES ('old-chunk', 'old', 'Old', 'paragraph#1', NULL, NULL);
      INSERT INTO source_chunks VALUES ('new-chunk', 'new', 'New', 'paragraph#1', NULL, NULL);
      INSERT INTO card_source_links VALUES ('old-link', 'card', 'old-chunk', NULL, '2026-01-01T00:00:00.000Z');
      INSERT INTO card_source_links VALUES ('new-link', 'card', 'new-chunk', NULL, '2026-01-02T00:00:00.000Z');
    `);
    legacy.close();

    expect(() => openStoryMapperDb(path)).toThrow("unsupported prototype");
    const unchanged = new Database(path, { readonly: true });
    try {
      expect(unchanged.pragma("journal_mode", { simple: true })).toBe("delete");
      expect(unchanged.prepare("SELECT id FROM source_documents ORDER BY id").all()).toEqual([{ id: "new" }, { id: "old" }]);
      expect(unchanged.prepare("SELECT name FROM sqlite_schema WHERE name = '__drizzle_migrations'").get()).toBeUndefined();
    } finally { unchanged.close(); }
  });
});


it("refuses journaled schema drift instead of backfilling chunk evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-source-upgrade-archive-"));
  directories.push(directory);
  const path = join(directory, "storymapper.sqlite");
  const original = openStoryMapperDb(path);
  new UnitOfWork(new DatabaseHandle(original)).run({ actorType: "human", actorId: "migration-fixture" }, ({ repository }) => {
    const project = repository.createProject({ name: "Upgraded project" });
    const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
    const card = repository.createCard({ storyMapId: map.id, level: "story", title: "Retained card" });
    const document = repository.importSourceDocument({ parsedChunks: splitTextIntoChunks("Retained source"), projectId: project.id, title: "Source", type: "txt", content: "Retained source", fileHash: hashText("Retained source") });
    const chunk = repository.createCardSourceLink(card.id, { kind: "chunk", chunkId: document.chunks[0]!.id })!;
    return { project, map, card, chunk };
  });
  original.$client.exec(`ALTER TABLE card_source_links RENAME TO tagged_source_links;
    CREATE TABLE card_source_links (
      id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id),
      chunk_id TEXT NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
      confidence REAL, created_at TEXT NOT NULL
    );
    INSERT INTO card_source_links SELECT id, card_id, chunk_id, confidence, created_at FROM tagged_source_links WHERE kind = 'chunk';
    DROP TABLE tagged_source_links;`);
  original.$client.close();
  expect(() => openStoryMapperDb(path)).toThrow("inconsistent schema");
});
