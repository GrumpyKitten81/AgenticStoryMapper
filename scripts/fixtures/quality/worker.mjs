import { fileURLToPath } from "node:url";
import { spawn } from 'node:child_process';

if (process.argv[2] === 'fail') process.exit(7);
if (process.argv[2] === 'descendant') {
  console.log(`descendant:${process.pid}`);
  setInterval(() => {}, 1000);
} else {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'descendant'], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.pipe(process.stdout);
  setInterval(() => {}, 1000);
}
