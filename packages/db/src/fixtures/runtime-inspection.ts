import Database from "better-sqlite3";

function inspect(database: Database.Database): { projectIds: string[]; archiveImportCount: number } {
  return {
    projectIds: (database.prepare("SELECT id FROM projects ORDER BY id").all() as Array<{ id: string }>).map(({ id }) => id),
    archiveImportCount: (database.prepare("SELECT count(*) AS count FROM activity_events WHERE action = 'project.archiveImported'").get() as { count: number }).count
  };
}

export function inspectRuntimeDatabase(databasePath: string): ReturnType<typeof inspect> {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return inspect(database); }
  finally { database.close(); }
}

export function openWalPinnedReader(databasePath: string): { inspect: () => ReturnType<typeof inspect>; close: () => void } {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    database.exec("BEGIN");
    inspect(database);
    return { inspect: () => inspect(database), close: () => database.close() };
  } catch (error) { database.close(); throw error; }
}
