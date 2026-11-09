import { createRequire } from 'node:module';

export function probeNativeSqlite() {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  database.close();
}
