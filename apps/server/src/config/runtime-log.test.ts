import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createRuntimeLog } from "@storymapper/server/config/runtime-log";

it("retains finite domain and SQLite identifiers and omits arbitrary error credentials and personal paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-log-identifiers-"));
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    const log = createRuntimeLog(directory);
    for (const err of [
      { type: "DomainError", name: "DomainError", code: "conflict", message: "private body", stack: "C:\\Users\\fixture\\private.txt" },
      { type: "SqliteError", name: "SqliteError", code: "SQLITE_CONSTRAINT_TRIGGER", message: "private body" },
      { type: "C:\\Users\\fixture\\private.txt", name: "ghp_fixtureCredential", code: "SQLITE_ghp_fixtureCredential", message: "private body" },
      { type: "ProjectArchiveError", code: "validation", cause: { code: "ghp_fixtureCredential" } }
    ]) log.write(JSON.stringify({ level: 50, err }));
    const content = readFileSync(join(directory, "storymapper.log"), "utf8");
    const records = content.trim().split("\n").map((line) => JSON.parse(line));
    expect(records.map((record) => record.error)).toEqual([
      { message: "Runtime operation failed", type: "DomainError", name: "DomainError", code: "conflict" },
      { message: "Runtime operation failed", type: "SqliteError", name: "SqliteError", code: "SQLITE_CONSTRAINT_TRIGGER" },
      { message: "Runtime operation failed" },
      { message: "Runtime operation failed", type: "ProjectArchiveError", code: "validation" }
    ]);
    expect(content).not.toMatch(/private body|Users|fixtureCredential|private\.txt/);
  } finally { stdout.mockRestore(); rmSync(directory, { recursive: true, force: true }); }
});
