import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { textCategories } from './check-publication-content.mjs';
import { checkHygiene, findViolations, inspectTrackedFile } from './check-hygiene.mjs';

test('normalizes German tokens and preserves precise CRLF diagnostics', () => {
  assert.deepEqual(findViolations(`English\r\n${'Übersicht'.normalize('NFD')} und under_score`, ['und']), [{ line: 2, text: 'Übersicht' }, { line: 2, text: 'und' }]);
  assert.deepEqual(findViolations('understanding fachexpertise centralNeed und_score', ['und', 'fach']), []);
  assert.equal(findViolations('ä ö ü Ä Ö Ü ß ẞ', []).length, 8);
});

test('reports secret categories and locations without returning matched content', () => {
  const value = ['ghp', '_', 'A'.repeat(36)].join('');
  const violations = inspectTrackedFile('config.txt', `English\n${value}`, []);
  assert.deepEqual(violations, [{ file: 'config.txt', line: 2, category: 'secret-signature' }]);
  assert.ok(!JSON.stringify(violations).includes(value));
  assert.deepEqual(inspectTrackedFile('config.ts', 'process.env.GITHUB_TOKEN', []), []);
});

test('detects all supported private PEM headers without exposing content', () => {
  for (const kind of ['', 'RSA', 'DSA', 'EC', 'OPENSSH', 'ENCRYPTED']) {
    const header = ['-----BEGIN', kind, 'PRIVATE KEY-----'].filter(Boolean).join(' ');
    assert.ok(textCategories(header, { terms: [] }).includes('secret-signature'), kind);
    assert.deepEqual(inspectTrackedFile('config.txt', `English\n${header}`, []), [{ file: 'config.txt', line: 2, category: 'secret-signature' }], kind);
  }
  for (const kind of ['PUBLIC KEY', 'RSA PUBLIC KEY', 'CERTIFICATE', 'UNKNOWN PRIVATE KEY']) {
    const header = `-----BEGIN ${kind}-----`;
    assert.ok(!textCategories(header, { terms: [] }).includes('secret-signature'), kind);
    assert.deepEqual(inspectTrackedFile('config.txt', header, []), [], kind);
  }
});

test('rejects forced tracked Claude local settings independently of their content', () => {
  for (const file of ['.claude/settings.local.json', 'nested/.claude/settings.local.json']) {
    assert.deepEqual(inspectTrackedFile(file, '{}', []), [{ file, line: 1, category: 'tracked-user-data' }]);
  }
  for (const file of ['.claude/settings.json', '.claude/settings.local.json.example', 'other/settings.local.json']) assert.deepEqual(inspectTrackedFile(file, '{}', []), []);
});

test('repository ignore rules protect root and nested Claude settings and forced additions fail hygiene', async () => {
  const { root, write } = trackedFixture();
  try {
    write('.gitignore', readFileSync(new URL('../.gitignore', import.meta.url)));
    const paths = ['.claude/settings.local.json', 'nested/.claude/settings.local.json'];
    for (const path of paths) write(path, '{}');
    assert.deepEqual(execFileSync('git', ['check-ignore', '--no-index', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim().split('\n'), paths);
    execFileSync('git', ['add', '--force', ...paths], { cwd: root });
    assert.deepEqual((await checkHygiene(root)).filter(({ category }) => category === 'tracked-user-data'), paths.map((file) => ({ file, line: 1, category: 'tracked-user-data' })));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('scans every supported private PEM header inside tracked gzip with safe CLI output', async () => {
  const { root, write } = trackedFixture();
  try {
    const headers = ['', 'RSA', 'DSA', 'EC', 'OPENSSH', 'ENCRYPTED'].map((kind) => ['-----BEGIN', kind, 'PRIVATE KEY-----'].filter(Boolean).join(' '));
    write('evidence/keys.txt.gz', gzipSync(`English\n${headers.join('\n')}\n`));
    execFileSync('git', ['add', 'evidence'], { cwd: root });
    const expected = headers.map((_, index) => ({ file: 'evidence/keys.txt.gz', line: index + 2, category: 'secret-signature' }));
    assert.deepEqual((await checkHygiene(root)).filter(({ file }) => file === 'evidence/keys.txt.gz'), expected);
    const cli = spawnSync(process.execPath, ['scripts/check-hygiene.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 1);
    for (const { file, line, category } of expected) assert.ok(cli.stderr.includes(`${file}:${line}: hygiene: ${category}\n`));
    for (const header of headers) assert.ok(!`${cli.stdout}${cli.stderr}`.includes(header));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects tracked user data paths and keeps the explicit safe examples', () => {
  for (const file of ['.env', '.env.production', 'input/document.txt', 'local-projects/user.lsm/manifest.json', 'exports/project.lsm/documents/test.txt', 'db.sqlite-wal']) assert.equal(inspectTrackedFile(file, '', [])[0]?.category, 'tracked-user-data');
  for (const file of ['.env.example', 'local-projects/.gitkeep']) assert.deepEqual(inspectTrackedFile(file, '', []), []);
});

const englishScopeFiles = ['packages/db/src/repositories/storymapper-repository.ts', 'packages/core/src/default-ai-templates.ts', 'apps/server/src/http/routes/index.ts'];

function trackedFixture() {
  const root = mkdtempSync(join(tmpdir(), 'storymapper-hygiene-'));
  const write = (file, content) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), content); };
  execFileSync('git', ['init', '--quiet', root]);
  write('scripts/german-stop-words.txt', 'und\noder\n');
  write('scripts/check-hygiene.mjs', readFileSync(new URL('./check-hygiene.mjs', import.meta.url)));
  write('apps/web/src/panel.tsx', 'English\nund');
  write('packages/core/templates/sample.json', '{"name":"Übersicht"}');
  write('packages/db/src/seed/seed.ts', 'English');
  for (const file of englishScopeFiles) write(file, 'English');
  write('docs/authoring.md', 'und Übersicht');
  execFileSync('git', ['add', '.'], { cwd: root });
  write('ignored.lsm/document.txt', ['ghp', '_', 'A'.repeat(36)].join(''));
  return { root, write };
}

test('scans tracked inputs only, fails unreadable tracked paths and propagates safe CLI failure', async () => {
  const { root, write } = trackedFixture();
  try {
    const results = await checkHygiene(root);
    assert.equal(results.length, 2);
    assert.ok(results.every(({ category }) => category === 'non-English-source'));
    const cli = spawnSync(process.execPath, ['scripts/check-hygiene.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /apps\/web\/src\/panel\.tsx:2: hygiene: non-English-source/);
    assert.ok(!cli.stderr.includes('Übersicht'));
    write('apps/web/src/panel.tsx', 'English');
    write('packages/core/templates/sample.json', '{"name":"English"}');
    assert.deepEqual(await checkHygiene(root), []);
    unlinkSync(join(root, 'apps/web/src/panel.tsx'));
    await assert.rejects(checkHygiene(root), { code: 'ENOENT' });
    execFileSync('git', ['rm', '--quiet', '--cached', englishScopeFiles[0]], { cwd: root });
    await assert.rejects(checkHygiene(root), new RegExp(`English scan scope has no tracked files: ${englishScopeFiles[0]}`));
    rmSync(join(root, '.git'), { recursive: true });
    await assert.rejects(checkHygiene(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('detects supported ASCII secrets in NUL-containing tracked binary bytes without echoing them', async () => {
  const { root, write } = trackedFixture();
  try {
    const value = ['ghp', '_', 'A'.repeat(36)].join('');
    write('binary.dat', Buffer.from(`prefix\0\n${value}\0suffix`));
    execFileSync('git', ['add', 'binary.dat'], { cwd: root });
    const violations = (await checkHygiene(root)).filter(({ file }) => file === 'binary.dat');
    assert.deepEqual(violations, [{ file: 'binary.dat', line: 2, category: 'secret-signature' }]);
    const cli = spawnSync(process.execPath, ['scripts/check-hygiene.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.ok(!cli.stderr.includes(value));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('scans tracked gzip content and rejects malformed archives with safe CLI diagnostics', async () => {
  const { root, write } = trackedFixture();
  try {
    const value = ['ghp', '_', 'A'.repeat(36)].join('');
    write('evidence/publication.log.gz', gzipSync(`English\n${value}\n`));
    write('evidence/malformed.log.gz', 'invalid gzip');
    write('ignored.log.gz', gzipSync(value));
    execFileSync('git', ['add', 'evidence'], { cwd: root });
    const violations = (await checkHygiene(root)).filter(({ file }) => file.startsWith('evidence/'));
    assert.deepEqual(violations, [
      { file: 'evidence/malformed.log.gz', line: 1, category: 'malformed-gzip' },
      { file: 'evidence/publication.log.gz', line: 2, category: 'secret-signature' }
    ]);
    const cli = spawnSync(process.execPath, ['scripts/check-hygiene.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /evidence\/publication\.log\.gz:2: hygiene: secret-signature/);
    assert.match(cli.stderr, /evidence\/malformed\.log\.gz:1: hygiene: malformed-gzip/);
    assert.ok(!cli.stderr.includes(value));
    assert.ok(!cli.stderr.includes('ignored.log.gz'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
