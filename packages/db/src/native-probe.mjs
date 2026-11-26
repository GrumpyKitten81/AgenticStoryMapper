import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function probeNativeSqlite() {
  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  database.close();
}

export function sqlitePrebuild() {
  const target = `${process.platform}-${process.arch}`;
  const { exports } = JSON.parse(readFileSync(require.resolve('better-sqlite3/package.json'), 'utf8'));
  return { target, available: `./${target}` in exports };
}
