import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const config = JSON.parse(readFileSync(process.env.STORYMAPPER_TEST_CONFIG, 'utf8')).server;
if (config.pidFile) writeFileSync(config.pidFile, String(process.pid));
if (config.mode === 'exit') process.exit(23);
const server = createServer((request, response) => {
  response.writeHead(config.status ?? 200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(config.health ?? { ok: true, mode: 'local', databasePath: 'fixture.sqlite' }));
});
server.listen(Number(process.env.PORT), process.env.HOST, () => {
  if (config.mode !== 'silent') process.send({ type: 'listening', url: `http://${process.env.HOST}:${server.address().port}` });
  for (const [index, chunk] of (config.stderrChunks ?? []).entries()) setTimeout(() => process.stderr.write(chunk, () => {
    if (index === config.stderrChunks.length - 1 && config.stderrWrittenFile) writeFileSync(config.stderrWrittenFile, 'complete');
  }), index * 40);
  for (const [index, chunk] of (config.stdoutChunks ?? []).entries()) setTimeout(() => process.stdout.write(chunk, () => {
    if (index === config.stdoutChunks.length - 1 && config.stdoutWrittenFile) writeFileSync(config.stdoutWrittenFile, 'complete');
  }), index * 40);
});
if (config.mode === 'delayed') {
  process.on('SIGTERM', () => {});
} else {
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
process.on('disconnect', () => server.close(() => process.exit(0)));
process.on('message', (message) => {
  if (message?.type === 'shutdown') setTimeout(() => server.close(() => process.exit(0)), config.mode === 'delayed' ? 2600 : 0);
});
