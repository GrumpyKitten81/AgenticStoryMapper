import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(process.env.STORYMAPPER_TEST_CONFIG, 'utf8'));
writeFileSync((config.command ?? config.browser).descendantFile, String(process.pid));
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
setInterval(() => {}, 1000);
