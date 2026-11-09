import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPublication } from './check-publication-audit.mjs';
import { scanAudit } from './ci-audit.mjs';
import { generateNotes, requireChecks, validateCandidate } from './release-candidate.mjs';
import { digest } from './check-publication-content.mjs';
import { releaseFailure } from './release-diagnostics.mjs';

export function requireAudit(outcome) {
  if (!['Clean', 'Advisories found'].includes(outcome.status) || !outcome.counts || outcome.counts.high !== 0 || outcome.counts.critical !== 0) throw new Error('dependency-audit-blocked');
}

export function verifyRemoteTag(candidate, env, command = spawnSync) {
  let endpoint = `repos/${env.GITHUB_REPOSITORY}/git/ref/tags/${encodeURIComponent(candidate.tag)}`;
  for (let depth = 0; depth < 8; depth++) {
    const result = command('gh', ['api', endpoint], { env: { PATH: env.PATH, HOME: env.HOME, GH_TOKEN: env.GH_TOKEN, GH_HOST: 'github.com' },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000, maxBuffer: 1024 * 1024 });
    if (result.error || result.signal || result.status !== 0) throw new Error('remote-tag-unavailable');
    let data;
    try { data = JSON.parse(result.stdout); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new Error('remote-tag-invalid'); }
    const object = data?.object;
    if (!object || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(object.sha ?? '')) throw new Error('remote-tag-invalid');
    if (depth === 0 && object.sha !== candidate.tagObject) throw new Error('remote-tag-moved');
    if (object.type === 'commit') {
      if (object.sha !== candidate.revision) throw new Error('remote-tag-moved');
      return;
    }
    if (object.type !== 'tag') throw new Error('remote-tag-invalid');
    endpoint = `repos/${env.GITHUB_REPOSITORY}/git/tags/${object.sha}`;
  }
  throw new Error('remote-tag-depth-exceeded');
}

export function privatePolicy(root, env, writePolicy = writeFileSync) {
  if (!env.PUBLICATION_POLICY) throw new Error('publication-policy-required');
  const directory = mkdtempSync(join(tmpdir(), 'storymapper-release-'));
  let constructed = false;
  try {
    const child = relative(realpathSync(root), realpathSync(directory));
    if (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('publication-policy-must-be-external');
    const path = join(directory, 'policy.json');
    try { writePolicy(path, env.PUBLICATION_POLICY, { mode: 0o600 }); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOSPC') throw new Error('publication-policy-write-failed');
      throw error;
    }
    constructed = true;
    return { directory, path };
  } finally { if (!constructed) rmSync(directory, { recursive: true, force: true }); }
}

export function publicationEvidence(candidate, report, notesDigest) {
  const keys = ['schemaVersion', 'scanner', 'policyDigest', 'tools', 'candidate', 'coverage', 'findings', 'verdict', 'limitations'];
  return `${JSON.stringify({ event: 'accepted-candidate-before-publication', candidate, notesSha256: notesDigest,
    publication: Object.fromEntries(keys.map((key) => [key, report[key]])) })}\n`;
}

export async function publishRelease(root, env, dependencies = {}) {
  requireChecks(env.RELEASE_CHECKS);
  const candidate = validateCandidate(root, env);
  if (!env.GH_TOKEN || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) throw new Error('release-credentials-required');
  const policy = privatePolicy(root, env);
  const publication = dependencies.publication ?? runPublication;
  const command = dependencies.command ?? spawnSync;
  try {
    const notes = generateNotes(root, candidate);
    const notesDigest = digest(readFileSync(notes));
    const scan = await publication({ root, policyPath: policy.path, scan: true });
    if (scan.verdict !== 'accepted') throw new Error('publication-blocked');
    if (validateCandidate(root, env).tagObject !== candidate.tagObject) throw new Error('tag-revision-mismatch');
    (dependencies.remote ?? verifyRemoteTag)(candidate, env);
    const verified = await publication({ root, policyPath: policy.path, scan: false });
    if (verified.verdict !== 'accepted') throw new Error('publication-blocked');
    (dependencies.output ?? ((value) => process.stdout.write(value)))(publicationEvidence(candidate, verified, notesDigest));
    const result = command('gh', ['release', 'create', candidate.tag, '--repo', env.GITHUB_REPOSITORY, '--verify-tag', '--target', candidate.revision,
      '--title', candidate.tag, '--notes-file', notes, ...(candidate.version.split('+')[0].includes('-') ? ['--prerelease'] : [])],
    { cwd: root, env: { PATH: env.PATH, HOME: env.HOME, GH_TOKEN: env.GH_TOKEN, GH_HOST: 'github.com', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'ignore', 'ignore'], timeout: 60_000 });
    if (result.error || result.signal || result.status !== 0) throw new Error('release-publication-unconfirmed');
  } finally { rmSync(policy.directory, { recursive: true, force: true }); }
}

export async function releaseMain(args = process.argv.slice(2), root = process.cwd(), env = process.env) {
  if (args.length !== 1 || !['validate', 'notes', 'audit', 'publish'].includes(args[0])) throw new Error('release-command-required');
  const candidate = validateCandidate(root, env);
  if (args[0] === 'notes') generateNotes(root, candidate);
  if (args[0] === 'audit') requireAudit(scanAudit());
  if (args[0] === 'publish') await publishRelease(root, env);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await releaseMain(); process.stdout.write('release: checks completed.\n'); }
  catch (error) { process.stderr.write(releaseFailure(error)); process.exitCode = 1; }
}
