import { fileURLToPath } from "node:url";
import { commandMain, run } from '../../processes.mjs';

process.on('message', (message) => { if (message?.signal) process.emit(message.signal); });
await commandMain(async (signal) => {
  if (process.argv[2] === 'missing') await run('storymapper-deliberately-missing-tool', [], { signal });
  else await run(process.execPath, [fileURLToPath(new URL('./worker.mjs', import.meta.url)), process.argv[2]], { signal });
  console.log('later-success');
}, { interruptExitCode: 1 });
if (process.connected) process.disconnect();
