import Database from 'better-sqlite3';
import { resolveSqlitePath } from '../sqlite-path.ts';

export function readToolCallCount(databasePath) {
  const database = new Database(resolveSqlitePath(databasePath), { readonly: true });
  try { return database.prepare("SELECT count(*) AS count FROM activity_events WHERE action = 'tool_call'").get().count; }
  finally { database.close(); }
}
