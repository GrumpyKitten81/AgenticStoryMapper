import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync, gzipSync, inflateSync } from 'node:zlib';
import { digest, inspectContent, parsePolicy, textCategories } from './check-publication-content.mjs';
import { runPublication } from './check-publication-audit.mjs';
import { decodeGitText, git as publicationGit } from './check-publication-git.mjs';
import { publicationFailure } from './check-publication-errors.mjs';

const policyValue = { employerTerms: ['Synthetic Organization'] };
const policy = parsePolicy(JSON.stringify(policyValue));
const helpers = ['check-publication.mjs', 'check-publication-audit.mjs', 'check-publication-git.mjs', 'check-publication-content.mjs', 'check-publication-errors.mjs'];

function fixture(t, format = 'sha1') {
  const base = mkdtempSync(join(tmpdir(), 'storymapper-publication-')), root = join(base, 'repository');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const write = (path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
  git('init', '--quiet', `--object-format=${format}`);
  git('config', 'user.name', 'Synthetic Author');
  git('config', 'user.email', 'author@example.test');
  for (const file of helpers) { mkdirSync(join(root, 'scripts'), { recursive: true }); copyFileSync(new URL(file, import.meta.url), join(root, 'scripts', file)); }
  for (const file of ['LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md']) write(file, 'Synthetic fixture declaration.');
  write('content.txt', 'Generic content.');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Create synthetic fixture');
  const policyPath = join(base, 'policy.json');
  writeFileSync(policyPath, JSON.stringify(policyValue));
  const run = (scan = true) => runPublication({ root, policyPath, scan });
  const cli = (...args) => spawnSync(process.execPath, ['scripts/check-publication.mjs', ...args], { cwd: root, encoding: 'utf8' });
  return { root, write, git, policyPath, run, cli };
}

test('complete clean disposable candidate passes scan and independent check', async (t) => {
  const f = fixture(t), result = await f.run();
  assert.equal(result.verdict, 'accepted');
  assert.equal(result.coverage.gitComplete, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(await f.run(false), result);
  assert.equal(f.cli('--policy', f.policyPath).status, 0);
});

test('policy is mandatory, strict and never echoed in sanitized failures', (t) => {
  const f = fixture(t);
  for (const value of [{ employerTerms: [] }, { employerTerms: [''] }, { employerTerms: ['value'], extra: true }, { employerTerms: ['x', 'X'] }]) assert.throws(() => parsePolicy(JSON.stringify(value)));
  for (const args of [[], ['--scan'], ['--policy', '/missing/private/input'], ['--unknown', '--policy', f.policyPath]]) {
    const result = f.cli(...args);
    assert.equal(result.status, 1);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('Synthetic Organization'));
    assert.ok(!result.stderr.includes('/missing/private/input'));
  }
});

test('matches complete employer terms across host and repository components', () => {
  const p = parsePolicy(JSON.stringify({ employerTerms: ['Acme', 'A+B', 'atev', 'ExampleBrand'] }));
  for (const text of ['https://ACME.example/repo', 'owner/acme', 'a+b.example', 'ACME_CONFIG', 'acme_identifier', 'useAcme', 'AcmeClient', 'ExampleBrandClient']) assert.ok(textCategories(text, p).includes('employer-reference'), text);
  for (const text of ['notacme', 'acmeology', 'a+beyond', 'updateVersion', 'updatedVersion']) assert.ok(!textCategories(text, p).includes('employer-reference'), text);
  for (const text of ['https://synthetic-organization.example/repo', 'https://synthetic_organization.example/repo', 'owner/synthetic-organization', 'owner/synthetic_organization', 'SyntheticOrganizationClient']) assert.ok(textCategories(text, policy).includes('employer-reference'), text);
  for (const text of ['https://nonsynthetic-organization.example', 'owner/synthetic_organizationology', 'synthetic.organization']) assert.ok(!textCategories(text, policy).includes('employer-reference'), text);
});

test('scans nested gzip and UTF16 while blocking unsupported and malformed archives', () => {
  const sensitive = ['ghp', '_', 'A'.repeat(36)].join('');
  for (const bytes of [gzipSync(gzipSync(sensitive)), Buffer.from(sensitive, 'utf16le'), Buffer.from(sensitive, 'utf16le').swap16()]) assert.ok(inspectContent(bytes, policy).includes('secret-signature'));
  assert.ok(inspectContent(Buffer.from([31, 139, 0]), policy).includes('unreadable-archive'));
  assert.ok(inspectContent(Buffer.from([80, 75, 3, 4, 0]), policy).includes('unsupported-archive'));
  assert.ok(inspectContent(Buffer.from([137, 80, 78, 71, 0]), policy).includes('redistribution-review'));
  assert.ok(!JSON.stringify(inspectContent(Buffer.from(sensitive), policy)).includes(sensitive));
  for (const kind of ['', 'RSA', 'DSA', 'EC', 'OPENSSH', 'ENCRYPTED']) {
    const header = ['-----BEGIN', kind, 'PRIVATE KEY-----'].filter(Boolean).join(' ');
    assert.ok(inspectContent(Buffer.from(header), policy).includes('secret-signature'), kind);
  }
});

test('classifies synthetic examples separately from private email and home paths', () => {
  for (const text of ['author@example.test', 'https://user:pass@github.com/repo', 'a@b.co', 'patches/@tanstack__history@1.162.0.patch']) assert.ok(!textCategories(text, policy).includes('email-review'));
  assert.ok(textCategories('actual@private-domain.company', policy).includes('email-review'));
  assert.ok(textCategories('/Users/private-person/project', policy).includes('personal-home-path'));
  for (const account of ['user', 'runner', 'username', 'public', 'default']) {
    for (const prefix of ['/Users/', '/home/', 'C:\\Users\\']) {
      assert.ok(!textCategories(`${prefix}${account}`, policy).includes('personal-home-path'));
      assert.ok(!textCategories(`${prefix}${account}/project`, policy).includes('personal-home-path'));
      for (const suffix of ['.name', '-person', '_person']) assert.ok(textCategories(`${prefix}${account}${suffix}/project`, policy).includes('personal-home-path'));
    }
  }
});

test('current findings and required private declarations remain blocking', async (t) => {
  const f = fixture(t);
  f.write('content.txt', 'Synthetic Organization\n');
  f.write('LICENSE', '[COPYRIGHT_HOLDER]');
  const result = await f.run();
  assert.equal(result.verdict, 'blocked');
  assert.ok(result.findings.some(({ category }) => category === 'private-declaration'));
  assert.ok(result.findings.some(({ category, scope }) => category === 'employer-reference' && scope === 'current'));
  assert.ok(!JSON.stringify(result).includes('Synthetic Organization'));
  assert.equal(f.cli('--policy', f.policyPath).status, 1);
});

test('old report refuses changed bytes, modes, paths, revision, refs and objects', async (t) => {
  const f = fixture(t);
  await f.run();
  f.write('content.txt', 'Changed.');
  await assert.rejects(f.run(false));
  await f.run();
  f.git('update-index', '--chmod=+x', 'content.txt');
  await assert.rejects(f.run(false));
  await f.run();
  renameSync(join(f.root, 'content.txt'), join(f.root, 'renamed.txt'));
  f.git('add', '-A');
  await assert.rejects(f.run(false));
  await f.run();
  f.git('commit', '--quiet', '-m', 'Change candidate');
  await assert.rejects(f.run(false));
  await f.run();
  f.git('branch', 'additional-ref');
  await assert.rejects(f.run(false));
});

test('extra, missing, malformed and flipped report fields cannot authorize publication', async (t) => {
  const f = fixture(t);
  const report = await f.run();
  for (const value of [{ ...report, extra: true }, { ...report, findings: [], verdict: 'blocked' }, { verdict: 'accepted' }]) {
    f.write('publication-audit.json', JSON.stringify(value));
    await assert.rejects(f.run(false));
  }
  f.write('publication-audit.json', '{');
  await assert.rejects(f.run(false));
  f.write('publication-audit.json', JSON.stringify(report));
  assert.equal((await f.run(false)).verdict, 'accepted');
});

test('all-ref scope includes preserved tree refs and historical commit metadata', async (t) => {
  const f = fixture(t);
  f.write('historic.txt', 'Synthetic Organization');
  f.git('add', 'historic.txt');
  const tree = f.git('write-tree');
  f.git('update-ref', 'refs/preserved/fixture-tree', tree);
  f.git('reset', '--quiet', 'HEAD');
  rmSync(join(f.root, 'historic.txt'));
  const result = await f.run();
  assert.ok(result.findings.some(({ category, scope }) => category === 'employer-reference' && scope === 'history'));
  f.git('commit', '--quiet', '--allow-empty', '-m', 'Synthetic Organization');
  assert.ok((await f.run()).findings.some(({ category, scope }) => category === 'employer-reference' && scope === 'history'));
});

test('shallow, promisor, replaced and missing objects refuse with safe diagnostics', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.git/shallow'), `${f.git('rev-parse', 'HEAD')}\n`);
  await assert.rejects(f.run());
  rmSync(join(f.root, '.git/shallow'));
  f.git('config', 'remote.origin.promisor', 'true');
  await assert.rejects(f.run());
  f.git('config', '--unset', 'remote.origin.promisor');
  const head = f.git('rev-parse', 'HEAD');
  f.git('update-ref', `refs/replace/${head}`, head);
  await assert.rejects(f.run());
  f.git('update-ref', '-d', `refs/replace/${head}`);
  const blob = f.git('rev-parse', 'HEAD:content.txt');
  rmSync(join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const result = f.cli('--scan', '--policy', f.policyPath);
  assert.equal(result.status, 1);
  assert.ok(!result.stderr.includes(blob));
  assert.ok(!result.stderr.includes(f.root));
});

test('deleted declarations and unreviewed binary/archive content block publication', async (t) => {
  const f = fixture(t);
  rmSync(join(f.root, 'LICENSE'));
  f.write('unreviewed.pdf', '%PDF-1.4\nUnreviewed asset');
  f.write('malformed.gz', 'not gzip');
  f.write('nested.gz', gzipSync(Buffer.from([80, 75, 3, 4, 0])));
  f.git('add', 'unreviewed.pdf', 'malformed.gz', 'nested.gz');
  const report = await f.run();
  for (const category of ['missing-declaration', 'binary-privacy-review', 'redistribution-review', 'unreadable-archive', 'unsupported-archive']) assert.ok(report.findings.some((row) => row.category === category));
  assert.equal(report.coverage.contentComplete, false);
  assert.equal(report.verdict, 'blocked');
});

test('grafts, unreadable Git inputs and symlink parents cannot narrow publication scope', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.git/info/grafts'), '');
  await assert.rejects(f.run());
  rmSync(join(f.root, '.git/info/grafts'));
  f.write('folder/tracked.txt', 'Synthetic content.');
  f.git('add', 'folder/tracked.txt');
  renameSync(join(f.root, 'folder'), join(f.root, 'untracked-folder'));
  symlinkSync('untracked-folder', join(f.root, 'folder'));
  await assert.rejects(f.run());
  const result = spawnSync(process.execPath, [join(f.root, 'scripts/check-publication.mjs'), '--scan', '--policy', f.policyPath], { cwd: f.root, encoding: 'utf8', env: { ...process.env, PATH: '' } });
  assert.equal(result.status, 1);
  assert.ok(!result.stderr.includes(f.root));
  assert.ok(!result.stderr.includes('ENOENT'));
});

test('new nonignored files invalidate prior reports and enter the next scan', async (t) => {
  const f = fixture(t);
  await f.run();
  f.write('new-content.txt', 'Added candidate content.');
  await assert.rejects(f.run(false), /stale-or-invalid-report/u);
  const report = await f.run();
  assert.equal(report.coverage.untrackedFiles, 1);
  assert.equal(report.verdict, 'accepted');
  assert.deepEqual(await f.run(false), report);
  f.write('new-content.txt', 'Synthetic Organization');
  await assert.rejects(f.run(false), /stale-or-invalid-report/u);
  assert.ok((await f.run()).findings.some((row) => row.category === 'employer-reference' && row.scope === 'current'));
});

test('ignored actual files are excluded without reading their contents or permissions', async (t) => {
  const f = fixture(t);
  f.write('.gitignore', 'ignored-private.txt\n');
  f.git('add', '.gitignore');
  f.git('commit', '--quiet', '-m', 'Add fixture exclusion');
  const report = await f.run();
  f.write('ignored-private.txt', 'Synthetic Organization');
  chmodSync(join(f.root, 'ignored-private.txt'), 0);
  assert.deepEqual(await f.run(false), report);
  assert.equal(report.coverage.untrackedFiles, 0);
  assert.equal(report.verdict, 'accepted');
});

test('report symlinks into ignored files and nonregular reports are refused before reading', async (t) => {
  const f = fixture(t);
  f.write('.gitignore', 'ignored-private.txt\n');
  f.git('add', '.gitignore');
  f.git('commit', '--quiet', '-m', 'Add fixture exclusion');
  await f.run();
  f.write('ignored-private.txt', 'private malformed bytes');
  rmSync(join(f.root, 'publication-audit.json'));
  symlinkSync('ignored-private.txt', join(f.root, 'publication-audit.json'));
  const result = f.cli('--policy', f.policyPath);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /report-unsafe/u);
  assert.ok(!result.stderr.includes('private malformed bytes'));
  rmSync(join(f.root, 'publication-audit.json'));
  mkdirSync(join(f.root, 'publication-audit.json'));
  await assert.rejects(f.run(false), /report-unsafe/u);
});

test('Git timeout and nonzero failures use bounded sanitized diagnostics', (t) => {
  const f = fixture(t), bin = join(f.root, 'fake-bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, process.platform === 'win32' ? 'git.exe' : 'git'));
  const originalPath = process.env.PATH, started = performance.now();
  try {
    process.env.PATH = bin;
    assert.throws(() => publicationGit(f.root, [fileURLToPath(new URL('./test-fixtures/publication-hanging-git.mjs', import.meta.url))], undefined, 50), /git-timeout/u);
  } finally { process.env.PATH = originalPath; }
  assert.ok(performance.now() - started < 2000);
  assert.throws(() => publicationGit(f.root, ['not-a-command']), /git-input-unavailable/u);
  assert.match(publicationFailure(new Error('git-timeout')), /^git-timeout;/u);
  assert.match(publicationFailure(new Error('untrusted private bytes')), /^scan-failed;/u);
  assert.match(publicationFailure(new Error('toString')), /^scan-failed;/u);
});

test('CLI reasons distinguish policy, missing report, malformed report, stale report and scope', async (t) => {
  const f = fixture(t);
  assert.match(f.cli('--policy', f.policyPath).stderr, /report-missing/u);
  writeFileSync(f.policyPath, '{');
  assert.match(f.cli('--scan', '--policy', f.policyPath).stderr, /policy-invalid/u);
  writeFileSync(f.policyPath, JSON.stringify(policyValue));
  await f.run();
  f.write('publication-audit.json', '{');
  assert.match(f.cli('--policy', f.policyPath).stderr, /report-invalid/u);
  await f.run();
  f.write('content.txt', 'Changed content.');
  assert.match(f.cli('--policy', f.policyPath).stderr, /report-stale/u);
  f.git('config', 'remote.origin.promisor', 'true');
  assert.match(f.cli('--scan', '--policy', f.policyPath).stderr, /scope-incomplete/u);
});

test('retired detector covers separator and identifier variants', () => {
  const words = ['Azure', 'Dev', 'Ops'];
  for (const text of [words.join(''), words.join('-'), words.join('_'), `${words[0]} ${words.slice(1).join('')}`]) assert.ok(textCategories(text, policy).includes('retired-provider-reference'));
});

function nativeByteFile(t, path, content) {
  try { writeFileSync(path, content); return true; }
  catch (error) {
    if (error.code === 'EPERM' && Buffer.isBuffer(path) && !Buffer.from(path.toString('utf8')).equals(path)) {
      t.skip('Sandbox cannot create invalid-byte input; native integration remains unverified.');
      return false;
    }
    if (!['EINVAL', 'EILSEQ'].includes(error.code)) throw error;
    t.skip('Native filesystem rejects invalid-byte filenames.');
    return false;
  }
}

test('raw malformed UTF-8 scope buffers refuse without native filenames', () => {
  for (const bytes of [Buffer.from([255]), Buffer.from([192, 175]), Buffer.from([237, 160, 128]), Buffer.from([226, 130])]) {
    assert.throws(() => decodeGitText(bytes), /invalid-path-encoding/u);
  }
  assert.equal(decodeGitText(Buffer.from('valid-\ufffd-路径')), 'valid-\ufffd-路径');
  assert.match(publicationFailure(new Error('invalid-path-encoding')), /^scope-path-encoding;/u);
});

test('invalid UTF-8 nonignored and indexed filenames refuse without treating bytes as deleted', { skip: process.platform === 'win32' }, async (t) => {
  const f = fixture(t);
  const path = Buffer.concat([Buffer.from(`${f.root}/invalid-`), Buffer.from([255]), Buffer.from('.txt')]);
  if (!nativeByteFile(t, path, 'Unread candidate content.')) return;
  await assert.rejects(f.run(), /invalid-path-encoding/u);
  f.git('add', '-A');
  await assert.rejects(f.run(), /invalid-path-encoding/u);
  const result = f.cli('--scan', '--policy', f.policyPath);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /scope-path-encoding/u);
  assert.ok(!result.stderr.includes('invalid-'));
});

test('invalid UTF-8 ref bytes refuse with a fixed scope error', { skip: process.platform === 'win32' }, async (t) => {
  const f = fixture(t);
  const path = Buffer.concat([Buffer.from(`${f.root}/.git/refs/heads/invalid-`), Buffer.from([255])]);
  if (!nativeByteFile(t, path, `${f.git('rev-parse', 'HEAD')}\n`)) return;
  await assert.rejects(f.run(), /invalid-path-encoding/u);
});

test('invalid UTF-8 historical tree names refuse independently of native filename semantics', async (t) => {
  const f = fixture(t), blob = f.git('rev-parse', 'HEAD:content.txt');
  const tree = Buffer.concat([Buffer.from('100644 invalid-'), Buffer.from([255, 0]), Buffer.from(blob, 'hex')]);
  const object = execFileSync('git', ['hash-object', '-t', 'tree', '-w', '--stdin'], { cwd: f.root, input: tree, encoding: 'utf8' }).trim();
  f.git('update-ref', 'refs/preserved/byte-tree', object);
  await assert.rejects(f.run(), /invalid-path-encoding/u);
});

test('annotated tag metadata enters all-ref findings with its exact object location', async (t) => {
  const f = fixture(t);
  f.git('tag', '-a', 'fixture-tag', '-m', 'Synthetic Organization');
  const tag = f.git('rev-parse', 'refs/tags/fixture-tag');
  const report = await f.run();
  assert.equal(report.coverage.reachableObjects.tag, 1);
  assert.ok(report.findings.some((row) => row.scope === 'history' && row.category === 'employer-reference' && row.location === tag));
  assert.ok(!JSON.stringify(report).includes('Synthetic Organization'));
});

test('indexed bytes stay in scope when clean working bytes replace them or disappear', async (t) => {
  const f = fixture(t);
  f.write('content.txt', 'Synthetic Organization');
  f.git('add', 'content.txt');
  f.write('content.txt', 'Generic content.');
  const report = await f.run();
  assert.equal(report.verdict, 'blocked');
  assert.ok(report.findings.some((row) => row.scope === 'index' && row.category === 'employer-reference' && row.location === digest('content.txt')));
  assert.ok(!report.findings.some((row) => row.category === 'employer-reference' && row.scope !== 'index'));
  rmSync(join(f.root, 'content.txt'));
  assert.ok((await f.run()).findings.some((row) => row.scope === 'index' && row.category === 'employer-reference'));
});

test('indexed declaration, archive paths and symlink modes retain their own validation', async (t) => {
  const f = fixture(t);
  f.write('LICENSE', '[COPYRIGHT_HOLDER]');
  f.write('malformed.gz', 'Not a gzip stream.');
  f.write('unsupported.zip', 'Generic content.');
  f.git('add', 'LICENSE', 'malformed.gz', 'unsupported.zip');
  f.write('LICENSE', 'Synthetic fixture declaration.');
  f.write('malformed.gz', gzipSync('Generic content.'));
  rmSync(join(f.root, 'unsupported.zip'));
  f.git('update-index', '--add', '--cacheinfo', '120000', f.git('rev-parse', 'HEAD:content.txt'), 'indexed-link');
  f.write('indexed-link', 'Generic content.');
  const report = await f.run();
  assert.equal(report.verdict, 'blocked');
  for (const [path, category] of [['LICENSE', 'private-declaration'], ['malformed.gz', 'unreadable-archive'], ['unsupported.zip', 'unsupported-archive'], ['indexed-link', 'unsupported-symlink']]) {
    assert.ok(report.findings.some((row) => row.scope === 'index' && row.category === category && row.location === digest(path)), category);
  }
});

test('nested repository roots refuse while canonical filesystem aliases remain valid', async (t) => {
  const f = fixture(t);
  for (const path of ['LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'content.txt']) f.write(`nested/${path}`, 'Generic content.');
  f.git('add', 'nested');
  f.git('commit', '--quiet', '-m', 'Add clean nested publication subset');
  await assert.rejects(runPublication({ root: join(f.root, 'nested'), policyPath: f.policyPath, scan: true }), /incomplete-git-scope/u);
  assert.equal((await runPublication({ root: realpathSync(f.root), policyPath: f.policyPath, scan: true })).verdict, 'accepted');
  assert.equal((await f.run(false)).verdict, 'accepted');
});

test('committed then deleted symlinks remain explicitly unsupported in history', async (t) => {
  const f = fixture(t);
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: f.root, input: 'content.txt', encoding: 'utf8' }).trim();
  f.git('update-index', '--add', '--cacheinfo', '120000', blob, 'historical-link');
  f.git('commit', '--quiet', '-m', 'Retain synthetic symlink');
  const tree = f.git('rev-parse', 'HEAD^{tree}');
  f.git('rm', '--cached', 'historical-link');
  f.git('commit', '--quiet', '-m', 'Remove synthetic symlink');
  const report = await f.run();
  assert.equal(report.verdict, 'blocked');
  assert.equal(report.coverage.contentComplete, false);
  assert.ok(report.findings.some((row) => row.scope === 'history' && row.category === 'unsupported-symlink' && row.location === tree));
});

test('canonical object hashes refuse corrupted loose bytes in SHA1 and SHA256 repositories', async (t) => {
  for (const format of ['sha1', 'sha256']) {
    const f = fixture(t, format);
    assert.equal((await f.run()).verdict, 'accepted');
    const blob = f.git('rev-parse', 'HEAD:content.txt');
    const path = join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2));
    const bytes = inflateSync(readFileSync(path));
    bytes[bytes.indexOf(0) + 1] ^= 1;
    chmodSync(path, 0o644);
    writeFileSync(path, deflateSync(bytes));
    await assert.rejects(f.run(), /invalid-object/u);
    const result = f.cli('--scan', '--policy', f.policyPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /object-invalid/u);
    assert.ok(!result.stderr.includes(blob));
  }
});

test('an exclusive temporary-report collision preserves the existing file bytes', async (t) => {
  const f = fixture(t), name = `publication-audit.json.tmp-${process.pid}`;
  f.write(name, 'Existing candidate content.');
  await assert.rejects(f.run(), /report-write-failed/u);
  assert.equal(readFileSync(join(f.root, name), 'utf8'), 'Existing candidate content.');
});

test('a single-word employer found only in a ref name blocks the refs scope', async (t) => {
  const f = fixture(t);
  writeFileSync(f.policyPath, JSON.stringify({ employerTerms: ['FixtureCompany'] }));
  assert.equal((await f.run()).verdict, 'accepted');
  f.git('branch', 'FixtureCompany');
  const report = await f.run();
  assert.equal(report.verdict, 'blocked');
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].scope, 'refs');
  assert.equal(report.findings[0].category, 'employer-reference');
});

test('committed then deleted gzip employer bytes identify the exact historical blob', async (t) => {
  const f = fixture(t);
  f.write('historical.gz', gzipSync('Synthetic Organization'));
  f.git('add', 'historical.gz');
  f.git('commit', '--quiet', '-m', 'Retain compressed synthetic content');
  const blob = f.git('rev-parse', 'HEAD:historical.gz');
  f.git('rm', 'historical.gz');
  f.git('commit', '--quiet', '-m', 'Remove compressed synthetic content');
  const report = await f.run();
  assert.equal(report.verdict, 'blocked');
  assert.ok(report.findings.some((row) => row.scope === 'history' && row.category === 'employer-reference' && row.location === blob));
  assert.ok(!report.findings.some((row) => row.category === 'employer-reference' && row.scope !== 'history'));
});

test('deleted copied skills retain full historical paths under both skill roots', async (t) => {
  for (const [format, directory] of [['sha1', '.agents'], ['sha1', '.claude'], ['sha256', '.agents'], ['sha256', '.claude']]) {
    const f = fixture(t, format), path = `${directory}/skills/bmad-build/SKILL.md`;
    f.write(path, 'Generic content.');
    f.git('add', path);
    f.git('commit', '--quiet', '-m', 'Retain copied fixture skill');
    const tree = f.git('rev-parse', `HEAD:${directory}/skills/bmad-build`);
    f.git('rm', path);
    f.git('commit', '--quiet', '-m', 'Remove copied fixture skill');
    const report = await f.run();
    assert.equal(report.verdict, 'blocked');
    assert.ok(report.findings.some((row) => row.category === 'copied-material-review' && row.scope === 'history' && row.location === tree));
    assert.ok(report.findings.every((row) => row.scope === 'history'));
  }
});

test('allowed historical placeholder clears while nested user data stays blocked', async (t) => {
  const f = fixture(t);
  f.write('local-projects/.gitkeep', '');
  f.git('add', 'local-projects/.gitkeep');
  f.git('commit', '--quiet', '-m', 'Retain allowed placeholder');
  const clean = await f.run();
  assert.equal(clean.verdict, 'accepted');
  assert.deepEqual(clean.findings, []);
  assert.deepEqual(await f.run(false), clean);
  for (const path of ['local-projects/nested/notes.txt', 'input/nested/source.txt', 'nested/project.lsm/document.txt']) {
    f.write(path, 'Generic content.');
    f.git('add', path);
  }
  f.git('commit', '--quiet', '-m', 'Retain nested fixture data');
  const trees = ['local-projects/nested', 'input/nested', 'nested/project.lsm'].map((path) => f.git('rev-parse', `HEAD:${path}`));
  f.git('rm', '-r', 'local-projects/nested', 'input', 'nested');
  f.git('commit', '--quiet', '-m', 'Remove nested fixture data');
  const report = await f.run();
  assert.equal(report.verdict, 'blocked');
  for (const tree of trees) assert.ok(report.findings.some((row) => row.category === 'tracked-user-data' && row.scope === 'history' && row.location === tree));
});

test('shared subtrees are classified only in actual root contexts including direct and tagged tree refs', async (t) => {
  for (const reference of ['direct', 'nested-tag']) {
    const f = fixture(t);
    f.write('docs/examples/input/example.txt', 'Generic content.');
    f.write('docs/examples/local-projects/.gitkeep', '');
    f.git('add', 'docs');
    f.git('commit', '--quiet', '-m', 'Retain harmless nested examples');
    assert.equal((await f.run()).verdict, 'accepted');
    const tree = f.git('rev-parse', 'HEAD:docs/examples'), child = f.git('rev-parse', 'HEAD:docs/examples/input');
    if (reference === 'direct') f.git('update-ref', 'refs/preserved/tree-root', tree);
    else {
      f.git('tag', '-a', 'inner-tree-tag', tree, '-m', 'Retain tree root');
      f.git('tag', '-a', 'outer-tree-tag', 'inner-tree-tag', '-m', 'Retain nested tree tag');
      f.git('tag', '-d', 'inner-tree-tag');
    }
    const report = await f.run();
    assert.equal(report.verdict, 'blocked');
    assert.equal(report.coverage.gitComplete, true);
    assert.ok(report.findings.some((row) => row.category === 'tracked-user-data' && row.scope === 'history' && row.location === child));
  }
});

test('JSON string privacy checks preserve raw checks, decoded escapes and allowed account boundaries', () => {
  const privatePath = 'C:\\Users\\private-person\\project';
  const escaped = JSON.stringify(privatePath), unicode = escaped.replaceAll('\\\\', '\\u005c').replace('Users', '\\u0055sers');
  for (const text of [privatePath, escaped, unicode, `{malformed, "path": ${escaped}}`, `${privatePath} "bad\\q"`, `"bad\\q" ${escaped}`, `"\\u00" ${escaped}`, `"bad\\q", "path": ${escaped}`, '"\\u002fUsers\\u002fprivate-person/project"']) {
    assert.ok(textCategories(text, policy).includes('personal-home-path'));
  }
  for (const account of ['user', 'runner', 'username', 'public', 'default']) {
    assert.ok(!textCategories(JSON.stringify(`C:\\Users\\${account}\\project`), policy).includes('personal-home-path'));
    assert.ok(textCategories(JSON.stringify(`C:\\Users\\${account}-person\\project`), policy).includes('personal-home-path'));
  }
  for (const bytes of [Buffer.from(escaped), Buffer.from(escaped, 'utf16le'), Buffer.from(escaped, 'utf16le').swap16(), gzipSync(escaped)]) {
    assert.ok(inspectContent(bytes, policy).includes('personal-home-path'));
  }
  const header = ['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' ');
  assert.ok(textCategories(JSON.stringify(header).replace('BEGIN', '\\u0042EGIN'), policy).includes('secret-signature'));
  assert.ok(textCategories('"\\u0053ynthetic Organization"', policy).includes('employer-reference'));
  assert.ok(!textCategories('"\\u0053ynthetic Organizationology"', policy).includes('employer-reference'));
  assert.deepEqual(textCategories('"bad\\q" "\\u00"', policy), []);
});

test('JSON-escaped Windows paths block current, index-only and deleted historical content without leaking values', async (t) => {
  for (const [scope, encoding] of [['current', 'utf8'], ['index', 'utf8'], ['history', 'utf8'], ['index', 'gzip'], ['history', 'utf16be']]) {
    const f = fixture(t), privatePath = 'C:\\Users\\private-person\\project';
    const json = JSON.stringify({ path: privatePath });
    f.write('encoded.json', encoding === 'gzip' ? gzipSync(json) : encoding === 'utf16be' ? Buffer.from(json, 'utf16le').swap16() : json);
    let location = digest('encoded.json');
    if (scope !== 'current') f.git('add', 'encoded.json');
    if (scope === 'index') f.write('encoded.json', '{}');
    if (scope === 'history') {
      f.git('commit', '--quiet', '-m', 'Retain encoded fixture path');
      location = f.git('rev-parse', 'HEAD:encoded.json');
      f.git('rm', 'encoded.json');
      f.git('commit', '--quiet', '-m', 'Remove encoded fixture path');
    }
    const report = await f.run();
    assert.equal(report.verdict, 'blocked');
    const findings = report.findings.filter((row) => row.category === 'personal-home-path');
    assert.deepEqual(findings.map((row) => [row.scope, row.location]), [[scope, location]]);
    assert.ok(!JSON.stringify(report).includes('private-person'));
    assert.ok(!JSON.stringify(report).includes(privatePath));
    assert.deepEqual(await f.run(false), report);
  }
});

test('unterminated escaped strings are consumed without retrying every quote', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('./test-fixtures/publication-malformed-strings.mjs', import.meta.url))], { timeout: 3000, stdio: 'pipe' });
});

test('compact shared-tree expansion refuses incomplete scope within a bounded CLI run', (t) => {
  const f = fixture(t), blob = f.git('rev-parse', 'HEAD:content.txt');
  const tree = (input) => execFileSync('git', ['mktree'], { cwd: f.root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  let child = tree(`100644 blob ${blob}\tcontent.txt\n`);
  for (let depth = 0; depth < 20; depth++) child = tree(`040000 tree ${child}\tleft\n040000 tree ${child}\tright\n`);
  f.git('update-ref', 'refs/preserved/compact-tree', child);
  const result = spawnSync(process.execPath, ['scripts/check-publication.mjs', '--scan', '--policy', f.policyPath], { cwd: f.root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /scope-incomplete/u);
  assert.ok(!result.stderr.includes(f.root));
  assert.ok(!result.stderr.includes(child));
});

test('deep historical paths refuse before expensive full-prefix classification', (t) => {
  const f = fixture(t), blob = f.git('rev-parse', 'HEAD:content.txt');
  const tree = (input) => execFileSync('git', ['mktree'], { cwd: f.root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  let child = tree(`100644 blob ${blob}\tcontent.txt\n`);
  for (let depth = 0; depth < 512; depth++) child = tree(`040000 tree ${child}\t${'nested'.repeat(64)}\n`);
  f.git('update-ref', 'refs/preserved/deep-tree', child);
  const result = spawnSync(process.execPath, ['scripts/check-publication.mjs', '--scan', '--policy', f.policyPath], { cwd: f.root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /scope-incomplete/u);
});

test('contextual history retains nested symlink and submodule refusals', async (t) => {
  const f = fixture(t), blob = f.git('rev-parse', 'HEAD:content.txt'), head = f.git('rev-parse', 'HEAD');
  f.git('update-index', '--add', '--cacheinfo', '120000', blob, 'nested/links/symlink');
  f.git('update-index', '--add', '--cacheinfo', '160000', head, 'nested/modules/submodule');
  f.git('commit', '--quiet', '-m', 'Retain nested unsupported modes');
  const links = f.git('rev-parse', 'HEAD:nested/links'), modules = f.git('rev-parse', 'HEAD:nested/modules');
  f.git('rm', '--cached', 'nested/links/symlink', 'nested/modules/submodule');
  f.git('commit', '--quiet', '-m', 'Remove nested unsupported modes');
  const report = await f.run();
  assert.equal(report.verdict, 'blocked');
  assert.equal(report.coverage.contentComplete, false);
  for (const [category, location] of [['unsupported-symlink', links], ['unsupported-submodule', modules]]) {
    assert.ok(report.findings.some((row) => row.category === category && row.scope === 'history' && row.location === location));
  }
});

test('empty directory trees contain no user payload while directory-name privacy remains checked', async (t) => {
  const f = fixture(t);
  const tree = (input) => execFileSync('git', ['mktree'], { cwd: f.root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const empty = tree(''), root = tree(`040000 tree ${empty}\tinput\n`);
  f.git('update-ref', 'refs/preserved/empty-directory', root);
  assert.equal((await f.run()).verdict, 'accepted');
  const privateRoot = tree(`040000 tree ${empty}\tSynthetic Organization\n`);
  f.git('update-ref', 'refs/preserved/private-directory', privateRoot);
  assert.ok((await f.run()).findings.some((row) => row.category === 'employer-reference' && row.scope === 'history' && row.location === privateRoot));
});
