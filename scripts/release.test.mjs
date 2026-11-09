import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { auditOutcome } from './ci-audit.mjs';
import { generateNotes, releaseRange, requireChecks, validateCandidate, validVersion } from './release-candidate.mjs';
import { publicationEvidence, privatePolicy, publishRelease, requireAudit, verifyRemoteTag } from './release.mjs';
import { runPublication } from './check-publication-audit.mjs';
import { releaseFailure } from './release-diagnostics.mjs';
import { digest } from './check-publication-content.mjs';

const policy = JSON.stringify({ employerTerms: ['fixture-private-employer-identifier'] });
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'storymapper-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Release fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'storymapper', version: '1.0.0' }));
  for (const path of ['LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md']) writeFileSync(join(root, path), 'Resolved fixture declaration.\n');
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('./release-notes.md', import.meta.url), join(root, 'scripts/release-notes.md'));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'Initial fixture');
  git(root, 'tag', 'v1.0.0');
  const revision = git(root, 'rev-parse', 'HEAD');
  const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF: 'refs/tags/v1.0.0', GITHUB_SHA: revision,
    RELEASE_CHECKS: JSON.stringify({ quality: 'success', audit: 'success' }), PUBLICATION_POLICY: policy,
    GH_TOKEN: 'fixture-token', GITHUB_REPOSITORY: 'fixture/release', PATH: process.env.PATH, HOME: process.env.HOME };
  return { root, env, revision };
}

test('strict SemVer accepts valid prerelease/build metadata and rejects malformed tags', () => {
  for (const value of ['0.0.0', '1.2.3', '1.2.3-rc.0+build.2', '1.2.3-0a']) assert.equal(validVersion(value), true, value);
  for (const value of ['v1.2.3', '01.2.3', '1.2', '1.2.3-01', '1.2.3+', '1.2.3\n', `1.2.3+${'a'.repeat(60)}`, null]) assert.equal(validVersion(value), false, String(value));
});

test('candidate requires exact matching event, root metadata, immutable tag and full history', (t) => {
  const { root, env, revision } = fixture(t);
  assert.equal(validateCandidate(root, env).revision, revision);
  for (const patch of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF_TYPE: 'branch' }, { GITHUB_REF: 'refs/tags/v01.0.0' },
    { GITHUB_REF: 'refs/tags/v2.0.0' }, { GITHUB_SHA: 'f'.repeat(40) }, { GITHUB_SHA: 'bad' }]) assert.throws(() => validateCandidate(root, { ...env, ...patch }));
  for (const metadata of ['{', JSON.stringify({ name: 'other', version: '1.0.0' }), JSON.stringify({ name: 'storymapper', version: 'bad' })]) {
    writeFileSync(join(root, 'package.json'), metadata);
    assert.throws(() => validateCandidate(root, env));
  }
  rmSync(join(root, 'package.json'));
  assert.throws(() => validateCandidate(root, env));
});

test('notes select nearest reachable valid tag with hashes and escaped subjects only', (t) => {
  const { root, env, revision } = fixture(t);
  assert.equal(releaseRange(root, validateCandidate(root, env)), revision);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'storymapper', version: '1.1.0' }));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'Fix [link](<script>) & code', '-m', 'Private body must not appear');
  git(root, 'tag', 'invalid-tag');
  git(root, 'tag', 'v1.1.0');
  const head = git(root, 'rev-parse', 'HEAD');
  const candidate = validateCandidate(root, { ...env, GITHUB_REF: 'refs/tags/v1.1.0', GITHUB_SHA: head });
  assert.equal(releaseRange(root, candidate), `v1.0.0..${head}`);
  const notes = readFileSync(generateNotes(root, candidate), 'utf8');
  assert.ok(notes.includes(head));
  assert.ok(!notes.includes(`- \`${revision}\``));
  assert.ok(notes.includes('Fix \\[link\\]\\(&lt;script&gt;\\) &amp; code'));
  assert.ok(!notes.includes('Private body'));
  assert.throws(() => generateNotes(root, candidate));
});

test('notes preserve literal replacement-pattern subjects without reinserting template markers', (t) => {
  const { root, env } = fixture(t);
  git(root, 'commit', '--allow-empty', '--quiet', '-m', "Literal $& $$ $` $' subjects");
  git(root, 'tag', '--delete', 'v1.0.0');
  git(root, 'tag', 'v1.0.0');
  const revision = git(root, 'rev-parse', 'HEAD');
  const notes = readFileSync(generateNotes(root, validateCandidate(root, { ...env, GITHUB_SHA: revision })), 'utf8');
  assert.ok(notes.includes("Literal $&amp; $$ $\\` $' subjects"));
  assert.equal(notes.includes('{{COMMITS}}'), false);
  assert.equal(notes.match(/Initial fixture/g).length, 1);
});

test('tag root version cannot be supplied by uncommitted metadata', async (t) => {
  const { root, env } = fixture(t);
  git(root, 'tag', 'v2.0.0');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'storymapper', version: '2.0.0' }));
  env.GITHUB_REF = 'refs/tags/v2.0.0';
  assert.throws(() => validateCandidate(root, env), /root-metadata-revision-mismatch/);
  let calls = 0;
  await assert.rejects(publishRelease(root, env, { command: () => { calls++; return { status: 0 }; } }), /root-metadata-revision-mismatch/);
  assert.equal(calls, 0);
});

test('blocking advisory policy reuses safe parser and rejects unavailable/malformed/high/critical outcomes', () => {
  for (const counts of [{ info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, { info: 1, low: 2, moderate: 3, high: 0, critical: 0 }]) {
    requireAudit(auditOutcome({ status: Object.values(counts).some(Boolean) ? 1 : 0, stdout: JSON.stringify({ metadata: { vulnerabilities: counts } }) }));
  }
  for (const result of [{ status: 2 }, { status: 1, stdout: '{}' }, { status: 0, stdout: 'not json' },
    ...['high', 'critical'].map((severity) => ({ status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, [severity]: 1 } } }) }))]) {
    assert.throws(() => requireAudit(auditOutcome(result)), /dependency-audit-blocked/);
  }
});

test('all quality and audit results must be successful', () => {
  for (const status of ['failure', 'skipped', 'cancelled', 'neutral', undefined]) {
    for (const key of ['quality', 'audit']) assert.throws(() => requireChecks(JSON.stringify({ quality: 'success', audit: 'success', [key]: status })));
  }
  for (const value of ['', '{}', 'null', '{']) assert.throws(() => requireChecks(value));
});

test('real scan and recomputation admit exactly one stubbed publication with scanned notes and removed policy', async (t) => {
  const { root, env } = fixture(t);
  let calls = 0, policyPath, output = '', accepted;
  await publishRelease(root, env, {
    remote: () => {},
    output: (value) => { output += value; },
    publication: async (options) => { policyPath = options.policyPath; assert.ok(!policyPath.startsWith(`${root}/`)); accepted = await runPublication(options); return accepted; },
    command: (command, args, options) => {
      calls++;
      assert.equal(command, 'gh');
      assert.deepEqual(args.slice(0, 3), ['release', 'create', 'v1.0.0']);
      assert.ok(args.includes('--verify-tag'));
      assert.equal(options.env.PUBLICATION_POLICY, undefined);
      assert.equal(options.env.HOME, env.HOME);
      assert.ok(readFileSync(join(root, 'release-notes.md'), 'utf8').includes(env.GITHUB_SHA));
      return { status: 0 };
    }
  });
  assert.equal(calls, 1);
  assert.equal(existsSync(policyPath), false);
  const evidence = JSON.parse(output);
  assert.equal(evidence.event, 'accepted-candidate-before-publication');
  assert.deepEqual(evidence.publication, accepted);
  assert.equal(evidence.publication.policyDigest.length, 64);
  assert.equal(evidence.notesSha256, digest(readFileSync(join(root, 'release-notes.md'))));
  assert.equal(output.includes('fixture-private-employer-identifier'), false);
  assert.equal(output.includes(env.GH_TOKEN), false);
});

test('no publishing command is reached on unsuccessful jobs, invalid metadata, policy or content', async (t) => {
  for (const scenario of ['quality', 'audit', 'tag', 'policy-missing', 'policy-invalid', 'private-marker', 'private-content', 'unsupported']) {
    const { root, env } = fixture(t);
    if (['quality', 'audit'].includes(scenario)) env.RELEASE_CHECKS = JSON.stringify({ quality: 'success', audit: 'success', [scenario]: 'skipped' });
    if (scenario === 'tag') env.GITHUB_SHA = 'f'.repeat(40);
    if (scenario === 'policy-missing') delete env.PUBLICATION_POLICY;
    if (scenario === 'policy-invalid') env.PUBLICATION_POLICY = '{}';
    if (scenario === 'private-marker') writeFileSync(join(root, 'LICENSE'), '[COPYRIGHT_HOLDER]');
    if (scenario === 'private-content') writeFileSync(join(root, 'private.txt'), 'fixture-private-employer-identifier');
    if (scenario === 'unsupported') writeFileSync(join(root, 'archive.zip'), 'unreadable archive');
    let calls = 0;
    await assert.rejects(publishRelease(root, env, { command: () => { calls++; return { status: 0 }; } }));
    assert.equal(calls, 0, scenario);
  }
});

test('fresh verification rejects changed notes, changed refs and scanner failures before publishing', async (t) => {
  for (const scenario of ['notes', 'refs', 'scanner']) {
    const { root, env } = fixture(t);
    let calls = 0;
    await assert.rejects(publishRelease(root, env, {
      remote: () => {},
      publication: async (options) => {
        if (!options.scan && scenario === 'scanner') throw new Error('fixture-scanner-unavailable');
        if (!options.scan && scenario === 'notes') writeFileSync(join(root, 'release-notes.md'), 'Changed notes.');
        if (!options.scan && scenario === 'refs') git(root, 'tag', 'changed-ref');
        return runPublication(options);
      },
      command: () => { calls++; return { status: 0 }; }
    }));
    assert.equal(calls, 0, scenario);
  }
});

test('remote lightweight and annotated tags must retain their raw object and peeled revision', () => {
  const candidate = { tag: 'v1.0.0', revision: 'a'.repeat(40), tagObject: 'a'.repeat(40) };
  const env = { GITHUB_REPOSITORY: 'fixture/release', HOME: process.env.HOME, PUBLICATION_POLICY: policy };
  const response = (type, sha) => ({ status: 0, stdout: JSON.stringify({ object: { type, sha } }) });
  verifyRemoteTag(candidate, env, (_command, _args, options) => {
    assert.equal(options.env.HOME, env.HOME);
    assert.equal(options.env.PUBLICATION_POLICY, undefined);
    return response('commit', candidate.revision);
  });
  let count = 0;
  verifyRemoteTag({ ...candidate, tagObject: 'b'.repeat(40) }, env, () => ++count === 1 ? response('tag', 'b'.repeat(40)) : response('commit', candidate.revision));
  assert.equal(count, 2);
  for (const result of [{ status: 1 }, { status: 0, stdout: '{}' }, { status: 0, stdout: 'bad json' }, response('commit', 'c'.repeat(40)), response('tree', candidate.revision)]) {
    assert.throws(() => verifyRemoteTag(candidate, env, () => result));
  }
});

test('different annotated tag object on the same commit is never admitted for publication', async (t) => {
  const { root, env } = fixture(t);
  git(root, 'tag', '--delete', 'v1.0.0');
  git(root, 'tag', '-a', 'v1.0.0', '-m', 'Scanned annotation');
  const candidate = validateCandidate(root, env);
  assert.notEqual(candidate.tagObject, candidate.revision);
  let acceptedReads = 0;
  verifyRemoteTag(candidate, env, () => ({ status: 0, stdout: JSON.stringify({ object: ++acceptedReads === 1
    ? { type: 'tag', sha: candidate.tagObject } : { type: 'commit', sha: candidate.revision } }) }));
  assert.equal(acceptedReads, 2);
  git(root, 'tag', '-a', 'replacement', '-m', 'Unscanned annotation');
  const replacement = git(root, 'rev-parse', 'refs/tags/replacement');
  git(root, 'tag', '--delete', 'replacement');
  assert.notEqual(candidate.tagObject, replacement);
  let reads = 0, writes = 0;
  await assert.rejects(publishRelease(root, env, {
    remote: (value, values) => verifyRemoteTag(value, values, () => {
      reads++;
      return { status: 0, stdout: JSON.stringify({ object: { type: 'tag', sha: replacement } }) };
    }),
    command: () => { writes++; return { status: 0 }; }
  }), /remote-tag-moved/);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test('partial private policy writes remove the owned file and directory without exposing input', (t) => {
  const { root, env } = fixture(t);
  let path;
  assert.throws(() => privatePolicy(root, env, (target, bytes, options) => {
    path = target;
    assert.equal(options.mode, 0o600);
    writeFileSync(target, bytes.slice(0, 12), options);
    throw Object.assign(new Error(bytes), { code: 'ENOSPC' });
  }), /^Error: publication-policy-write-failed$/);
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(dirname(path)), false);
});

test('unexpected policy construction faults retain their identity while removing private input', (t) => {
  const { root, env } = fixture(t);
  const unexpected = new TypeError('Fixture programming fault');
  let path;
  assert.throws(() => privatePolicy(root, env, (target, bytes, options) => {
    path = target;
    writeFileSync(target, bytes, options);
    throw unexpected;
  }), (error) => error === unexpected);
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(dirname(path)), false);
});

test('retained publication evidence excludes unknown fields and private policy values', () => {
  const report = { schemaVersion: 1, verdict: 'accepted', policyDigest: 'a'.repeat(64), PUBLICATION_POLICY: policy };
  const output = publicationEvidence({ tag: 'v1.0.0' }, report, 'b'.repeat(64));
  assert.equal(output.includes(policy), false);
  assert.equal(output.includes('PUBLICATION_POLICY'), false);
  assert.equal(JSON.parse(output).publication.policyDigest, report.policyDigest);
});

test('publication timeout reports an unconfirmed write and action without raw diagnostics', async (t) => {
  const { root, env } = fixture(t);
  let failure;
  await assert.rejects(publishRelease(root, env, {
    remote: () => {}, output: () => {},
    command: () => ({ error: new Error(policy), signal: 'SIGTERM', status: null })
  }), (error) => { failure = error; return error.message === 'release-publication-unconfirmed'; });
  const output = releaseFailure(failure);
  assert.match(output, /publication-not-confirmed/);
  assert.match(output, /Inspect the remote release before retrying/);
  assert.equal(output.includes('no release admitted'), false);
  assert.equal(output.includes(policy), false);
});

test('CLI failure diagnostics use fixed actionable categories without echoing unknown messages', () => {
  for (const [code, category] of [['tag-version-mismatch', 'candidate'], ['dependency-audit-blocked', 'dependency-audit'],
    ['policy', 'private-policy'], ['publication-blocked', 'content-gate'], ['stale-or-invalid-report', 'publication-evidence'],
    ['remote-tag-moved', 'remote-tag'], ['git-timeout', 'git-scope']]) {
    const output = releaseFailure(new Error(code));
    assert.ok(output.includes(`release: ${category}.`));
    assert.ok(output.includes('Next action:'));
  }
  assert.equal(releaseFailure(new Error(policy)), 'release: unexpected failure. Next action: Stop and inspect the workflow and remote release before retrying; raw diagnostics are withheld.\n');
});

test('remote tag movement prevents the release write after successful exact content verification', async (t) => {
  const { root, env } = fixture(t);
  let calls = 0;
  await assert.rejects(publishRelease(root, env, {
    remote: (candidate, values) => verifyRemoteTag(candidate, values, () => ({ status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: 'b'.repeat(40) } }) })),
    command: () => { calls++; return { status: 0 }; }
  }), /remote-tag-moved/);
  assert.equal(calls, 0);
});

test('exact content is recomputed after remote tag inspection and before the release write', async (t) => {
  const { root, env } = fixture(t);
  let calls = 0;
  await assert.rejects(publishRelease(root, env, {
    remote: () => writeFileSync(join(root, 'release-notes.md'), 'Changed during remote inspection.'),
    command: () => { calls++; return { status: 0 }; }
  }));
  assert.equal(calls, 0);
});

test('workflow binds all jobs to exact full-history revision and scopes publication permission and secret', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/runs-on: ubuntu-latest/g) ?? []).length, 3);
  assert.ok(!workflow.includes('matrix'));
  assert.equal((workflow.match(/ref: \$\{\{ github.sha \}\}/g) ?? []).length, 3);
  assert.equal((workflow.match(/fetch-depth: 0/g) ?? []).length, 3);
  assert.equal((workflow.match(/contents: write/g) ?? []).length, 1);
  assert.match(workflow, /needs: \[quality, audit\]/);
  assert.match(workflow, /needs.quality.result == 'success' && needs.audit.result == 'success'/);
  assert.equal((workflow.match(/GH_TOKEN:/g) ?? []).length, 1);
  assert.equal((workflow.match(/PUBLICATION_POLICY:/g) ?? []).length, 1);
  assert.ok(!workflow.includes('continue-on-error'));
  for (const action of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(action[1], /@[a-f0-9]{40}$/);
  const job = (name) => workflow.split(/^  (?=[a-z]+:$)/m).find((block) => block.startsWith(`${name}:`));
  assert.match(job('quality'), /timeout-minutes: 10/);
  assert.match(job('audit'), /timeout-minutes: 5/);
  assert.match(job('publish'), /timeout-minutes: 10/);
  assert.ok(!job('audit').includes('pnpm install'));
  assert.ok(job('quality').includes('run: corepack pnpm check:ci\n'));
  assert.ok(job('quality').includes('run: node scripts/release.mjs validate'));
  assert.ok(job('audit').includes('run: node scripts/release.mjs audit'));
  assert.ok(job('publish').includes('run: node scripts/release.mjs publish'));
  const checks = workflow.match(/RELEASE_CHECKS: '([^\n]+)'/)[1].replace(/\$\{\{ needs\.(\w+)\.result \}\}/g, (_, name) => `ok-${name}`);
  assert.deepEqual(JSON.parse(checks), { quality: 'ok-quality', audit: 'ok-audit' });
});

test('release creation targets the scanned revision and notes and marks only prereleases', async (t) => {
  for (const [version, prerelease] of [['1.0.0', false], ['1.1.0-rc.1+build.5', true]]) {
    const { root, env } = fixture(t);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'storymapper', version }));
    git(root, 'add', '.');
    git(root, 'commit', '--allow-empty', '--quiet', '-m', 'Bump @types/node');
    git(root, 'tag', '-f', `v${version}`);
    const revision = git(root, 'rev-parse', 'HEAD');
    let args;
    await publishRelease(root, { ...env, GITHUB_REF: `refs/tags/v${version}`, GITHUB_SHA: revision }, {
      remote: () => {}, output: () => {}, command: (_, received) => { args = received; return { status: 0 }; }
    });
    assert.deepEqual(args, ['release', 'create', `v${version}`, '--repo', 'fixture/release', '--verify-tag', '--target', revision,
      '--title', `v${version}`, '--notes-file', join(root, 'release-notes.md'), ...(prerelease ? ['--prerelease'] : [])]);
    assert.ok(readFileSync(join(root, 'release-notes.md'), 'utf8').includes('Bump @\u200btypes/node'));
  }
});
