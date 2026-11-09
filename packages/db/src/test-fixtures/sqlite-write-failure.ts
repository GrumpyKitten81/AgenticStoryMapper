import Database from "better-sqlite3";
import { expect, vi } from "vitest";

export function rejectSqliteWrite(database: Database.Database | string, predicate: (sql: string, bindings: unknown[]) => boolean, message: string): () => void {
  const target = typeof database === "string" ? Database.prototype : database;
  const prepare = target.prepare;
  const faults: boolean[] = [];
  const statements: Array<() => void> = [];
  const spy = vi.spyOn(target, "prepare").mockImplementation(function (this: Database.Database, sql: string) {
    const statement = prepare.call(this, sql);
    if (typeof database === "string" && this.name !== database) return statement;
    const owner = this;
    const run = statement.run.bind(statement);
    const fault = vi.spyOn(statement, "run").mockImplementation((...bindings: unknown[]) => {
      if (predicate(sql, bindings)) {
        faults.push(owner.inTransaction);
        expect(owner.inTransaction).toBe(true);
        throw new Database.SqliteError(message, "SQLITE_CONSTRAINT_TRIGGER");
      }
      return Reflect.apply(run, statement, bindings) as Database.RunResult;
    });
    statements.push(() => fault.mockRestore());
    return statement;
  });
  return () => {
    spy.mockRestore();
    for (const restore of statements.reverse()) restore();
    expect(faults.length).toBeGreaterThan(0);
    expect(faults.every(Boolean)).toBe(true);
  };
}
