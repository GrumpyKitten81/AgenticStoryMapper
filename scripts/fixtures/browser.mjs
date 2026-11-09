import { spawn } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(readFileSync(process.env.STORYMAPPER_TEST_CONFIG, 'utf8')).browser;
const url = process.argv[2];
const response = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(2000) });
if (response.status !== 200 || (await response.json()).ok !== true) throw new Error('Browser opened before owned server was healthy.');
const preparedUrlFile = `${config.urlFile}.${process.pid}.tmp`;
writeFileSync(preparedUrlFile, url);
renameSync(preparedUrlFile, config.urlFile);
if (config.pidFile) writeFileSync(config.pidFile, String(process.pid));
if (config.mode === 'fail') process.exit(19);
if (config.mode === 'hang') {
  if (config.descendantFile) spawn(process.execPath, [fileURLToPath(new URL('descendant.mjs', import.meta.url))], { stdio: 'inherit' });
  process.on('SIGTERM', () => {});
  process.on('SIGINT', () => {});
  setInterval(() => {}, 1000);
}
