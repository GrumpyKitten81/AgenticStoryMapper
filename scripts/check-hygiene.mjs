import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const englishDirectories = ['apps/web/src/', 'packages/db/src/seed/', 'packages/core/templates/'];
const englishFiles = ['packages/db/src/repositories/storymapper-repository.ts', 'packages/core/src/default-ai-templates.ts', 'apps/server/src/http/routes/index.ts'];
const secretSignatures = [/(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/];

export function findViolations(source, stopWords) {
  const words = new Set(stopWords.map((word) => word.normalize('NFC').toLowerCase()));
  return source.normalize('NFC').split(/\r?\n/).flatMap((line, index) => {
    const matches = [...line.matchAll(/[\p{L}\p{N}_]+/gu)].map((match) => match[0]).filter((word) => /[äöüß]/iu.test(word) || words.has(word.toLowerCase()));
    return [...new Set(matches)].map((text) => ({ line: index + 1, text }));
  });
}

export function inspectTrackedFile(file, source, stopWords) {
  const diagnostics = [];
  const report = (line, category) => diagnostics.push({ file, line, category });
  if ((/(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example')) || /^input\//.test(file) || /^local-projects\//.test(file) && file !== 'local-projects/.gitkeep' || /(?:\.sqlite[^/]*|\.lsm)(?:\/|$)/i.test(file)) report(1, 'tracked-user-data');
  source.split(/\r?\n/).forEach((line, index) => { if (secretSignatures.some((pattern) => pattern.test(line))) report(index + 1, 'secret-signature'); });
  if (englishDirectories.some((directory) => file.startsWith(directory)) || englishFiles.includes(file)) {
    for (const { line } of findViolations(source, stopWords)) report(line, 'non-English-source');
  }
  return diagnostics;
}

export async function checkHygiene(root = repositoryRoot) {
  const stopWords = (await readFile(join(root, 'scripts/german-stop-words.txt'), 'utf8')).split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean).sort();
  if (!files.length) throw new Error('hygiene: no tracked publication inputs found.');
  const untracked = [...englishFiles.filter((file) => !files.includes(file)), ...englishDirectories.filter((directory) => !files.some((file) => file.startsWith(directory)))];
  if (untracked.length) throw new Error(`hygiene: English scan scope has no tracked files: ${untracked.join(', ')}.`);
  const violations = [];
  for (const file of files) {
    const path = join(root, file);
    if (!(await lstat(path)).isFile()) throw new Error(`${file}:1: hygiene: tracked input is not a regular file.`);
    const content = await readFile(path);
    violations.push(...inspectTrackedFile(file, content.toString('utf8'), stopWords));
    if (file.endsWith('.gz')) {
      let expanded;
      try { expanded = gunzipSync(content); }
      catch (error) {
        if (!['Z_DATA_ERROR', 'Z_BUF_ERROR', 'Z_MEM_ERROR'].includes(error.code)) throw error;
        violations.push({ file, line: 1, category: 'malformed-gzip' });
        continue;
      }
      violations.push(...inspectTrackedFile(file, expanded.toString('utf8'), []).filter(({ category }) => category === 'secret-signature'));
    }
  }
  return violations;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = await checkHygiene();
  for (const { file, line, category } of violations) process.stderr.write(`${file}:${line}: hygiene: ${category}\n`);
  process.exitCode = violations.length ? 1 : 0;
}
