import { commandMain } from './processes.mjs';
import { commandOptions } from './diagnostics.mjs';
import { startup } from './startup.mjs';

await commandMain(async (signal) => {
  const { debug } = commandOptions('start');
  await startup(signal, debug);
});
