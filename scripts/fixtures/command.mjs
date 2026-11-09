import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const command = JSON.parse(readFileSync(process.env.STORYMAPPER_TEST_CONFIG, 'utf8')).command;
const config = command?.phase === 'all' || command?.phase === process.argv[2] ? command : { mode: 'success' };
if (config.pidFile) writeFileSync(config.pidFile, String(process.pid));
if (config.mode === 'fail' || config.failurePhase === process.argv[2]) {
  for (const stream of ['stdout', 'stderr']) {
    for (const chunk of config[`${stream}Chunks`] ?? []) {
      await new Promise((resolve) => process[stream].write(Buffer.from(chunk), resolve));
      await setTimeout(40);
    }
  }
  if (config.details) console.error(config.details);
  process.exit(17);
}
if (config.mode === 'success') {
  if (process.argv[2] === 'preflight') console.log(config.version ?? '9.15.4');
  process.exit(0);
}
if (config.descendantFile) {
  spawn(process.execPath, [fileURLToPath(new URL('descendant.mjs', import.meta.url))], { stdio: 'inherit' });
}
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
setInterval(() => {}, 1000);
