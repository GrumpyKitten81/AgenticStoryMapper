import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const targets = { db: 'packages/db/dist/packages/db/migrations', server: 'apps/server/dist/packages/db/migrations' };
const target = targets[process.argv[2]];
if (!target) throw new Error('Expected migration asset target: db or server.');
const root = new URL('../', import.meta.url);
const destination = fileURLToPath(new URL(target, root));
mkdirSync(destination, { recursive: true });
cpSync(fileURLToPath(new URL('packages/db/migrations', root)), destination, { recursive: true });
