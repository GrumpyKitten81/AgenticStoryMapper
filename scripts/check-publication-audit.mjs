import { lstat, open, readFile, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { digest, finding, parsePolicy, textCategories } from './check-publication-content.mjs';
import { decodeGitText, git, gitScope, objectInventory, workingInventory } from './check-publication-git.mjs';

const incompleteCategories = new Set(['unsupported-archive', 'unreadable-archive', 'archive-depth-limit', 'unsupported-symlink', 'unsupported-submodule', 'binary-privacy-review']);

function uniqueFindings(findings) {
  const values = new Map(findings.map((value) => [JSON.stringify(value), value]));
  return [...values.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export async function auditPublication(root, policy) {
  const scope = gitScope(root);
  if (scope.incomplete) throw new Error('incomplete-git-scope');
  const working = await workingInventory(root, policy);
  const objects = objectInventory(root, scope, policy);
  const refBytes = git(root, ['for-each-ref', '--format=%(refname)']);
  const findings = uniqueFindings([...working.findings, ...objects.findings,
    ...textCategories(decodeGitText(refBytes), policy).map((category) => finding(category, 'refs', digest(refBytes)))]);
  const endScope = gitScope(root), endWorking = await workingInventory(root, policy);
  if (JSON.stringify(scope) !== JSON.stringify(endScope) || working.fingerprint !== endWorking.fingerprint) throw new Error('candidate-changed-during-scan');
  return {
    schemaVersion: 1,
    scanner: 'storymapper-publication-v1',
    policyDigest: policy.digest,
    tools: { node: process.versions.node, git: git(root, ['--version']).toString().trim() },
    candidate: { revision: scope.head, refs: scope.refs, refCount: scope.refCount, workingTree: working.fingerprint, objects: objects.fingerprint },
    coverage: { publicationFiles: working.files, trackedFiles: working.files - working.untrackedFiles, untrackedFiles: working.untrackedFiles, reachableObjects: objects.counts, objectBytes: objects.bytes, gitComplete: true,
      contentComplete: !findings.some(({ category }) => incompleteCategories.has(category)), privacyAndRightsCertified: false },
    findings,
    verdict: findings.length ? 'blocked' : 'accepted',
    limitations: ['Pattern checks do not certify privacy or ownership.', 'History disposition requires rescanning the actual resulting repository.', 'Later contributor material requires a new exact-candidate scan.']
  };
}

async function readReport(root, path) {
  let handle;
  try {
    if (!(await lstat(root)).isDirectory() || !(await lstat(path)).isFile()) throw new Error('report-unsafe');
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) throw new Error('report-unsafe');
    try { return JSON.parse(await handle.readFile('utf8')); }
    catch (error) { if (error instanceof SyntaxError) throw new Error('report-invalid'); throw error; }
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('report-missing');
    if (error.code === 'ELOOP') throw new Error('report-unsafe');
    if (['report-unsafe', 'report-invalid'].includes(error.message)) throw error;
    throw new Error('report-unreadable');
  } finally { await handle?.close(); }
}

async function readPolicy(path) {
  let source;
  try { source = await readFile(path, 'utf8'); }
  catch { throw new Error('policy-unreadable'); }
  return parsePolicy(source);
}

function verifyReport(saved, report) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || JSON.stringify(Object.keys(saved).sort()) !== JSON.stringify(Object.keys(report).sort())) throw new Error('report-invalid');
  if (JSON.stringify(saved) !== JSON.stringify(report)) throw new Error('stale-or-invalid-report');
}

export async function runPublication({ root, policyPath, scan }) {
  const policy = await readPolicy(policyPath);
  const path = join(root, 'publication-audit.json');
  const saved = scan ? null : await readReport(root, path);
  const report = await auditPublication(root, policy);
  if (scan) {
    const temporary = `${path}.tmp-${process.pid}`;
    let created = false;
    try {
      const handle = await open(temporary, 'wx');
      created = true;
      try { await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`); }
      finally { await handle.close(); }
      await rename(temporary, path);
    }
    catch { throw new Error('report-write-failed'); }
    finally { if (created) await rm(temporary, { force: true }); }
  } else {
    verifyReport(saved, report);
  }
  return report;
}
