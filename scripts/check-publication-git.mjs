import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { declarationCategories, digest, finding, inspectContent, textCategories } from './check-publication-content.mjs';

const maxHistoricalTreeContexts = 100_000;
const maxHistoricalPathBytes = 32 * 1024 * 1024;
const maxHistoricalPathLength = 4096;

export function git(root, args, input, timeout = 30_000) {
  try { return execFileSync('git', args, { cwd: root, input, timeout, killSignal: 'SIGKILL', env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (error) { throw new Error(error.code === 'ETIMEDOUT' ? 'git-timeout' : 'git-input-unavailable'); }
}

export function decodeGitText(bytes) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('invalid-path-encoding');
  return text;
}

function sensitivePath(path) {
  return /(?:^|\/)\.claude\/settings\.local\.json$/u.test(path)
    || /(?:^|\/)\.env(?:$|\.)/u.test(path) && !path.endsWith('.env.example')
    || /^(?:input|local-projects)(?:\/|$)/u.test(path) && path !== 'local-projects/.gitkeep'
    || /(?:\.sqlite[^/]*|\.lsm)(?:\/|$)/iu.test(path);
}

export function pathFindings(path, policy, scope, location) {
  const categories = textCategories(path, policy);
  if (sensitivePath(path)) categories.push('tracked-user-data');
  if (/^(?:\.agents|\.claude)\/skills\/bmad-/u.test(path)) categories.push('copied-material-review');
  return categories.map((category) => finding(category, scope, location));
}

function archiveKind(path) {
  if (/\.(?:gz|tgz)$/iu.test(path)) return 'gzip';
  return /\.(?:zip|tar|bz2|xz|7z|zst|br|rar)$/iu.test(path) ? 'unsupported' : null;
}

function contentCategories(path, bytes, mode, policy) {
  const categories = [...inspectContent(bytes, policy), ...declarationCategories(path, bytes)];
  if (archiveKind(path) === 'gzip' && !(bytes[0] === 31 && bytes[1] === 139)) categories.push('unreadable-archive');
  if (archiveKind(path) === 'unsupported') categories.push('unsupported-archive');
  if (['LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md'].includes(path) && !bytes.toString('utf8').trim()) categories.push('missing-declaration');
  if (mode === '120000') categories.push('unsupported-symlink');
  return categories;
}

function indexEntry(entry) {
  const match = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/u.exec(entry);
  if (!match || match[3] !== '0') throw new Error('invalid-index');
  return { mode: match[1], indexObject: match[2], path: match[4] };
}

async function workingEntry(root, entry, policy, untracked = false) {
  const { mode, indexObject, path } = indexEntry(entry);
  const location = digest(path);
  const record = { location, mode: untracked ? null : mode, indexObject: untracked ? null : indexObject, state: 'present', bytes: null };
  const findings = pathFindings(path, policy, 'current', location);
  if (mode === '160000') return { record, findings: [...findings, finding('unsupported-submodule', 'current', location)] };
  let stat;
  try { await validateParents(root, path); stat = await lstat(join(root, path)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (['LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md'].includes(path)) findings.push(finding('missing-declaration', 'current', location));
    return { record: { ...record, state: 'deleted' }, findings };
  }
  const bytes = stat.isSymbolicLink() ? Buffer.from(await readlink(join(root, path))) : stat.isFile() ? await readFile(join(root, path)) : null;
  if (!bytes) throw new Error('unreadable-tracked-input');
  record.bytes = digest(bytes);
  record.workingMode = stat.isSymbolicLink() ? '120000' : (stat.mode & 0o111) ? '100755' : '100644';
  const categories = contentCategories(path, bytes, record.workingMode, policy);
  return { record, findings: [...findings, ...categories.map((category) => finding(category, 'current', location))] };
}

function indexedFindings(root, entries, policy) {
  const findings = [], paths = new Map();
  for (const entry of entries.map(indexEntry)) {
    if (entry.path === 'publication-audit.json') continue;
    findings.push(...pathFindings(entry.path, policy, 'index', digest(entry.path)));
    if (entry.mode === '160000') findings.push(finding('unsupported-submodule', 'index', digest(entry.path)));
    else {
      if (!paths.has(entry.indexObject)) paths.set(entry.indexObject, []);
      paths.get(entry.indexObject).push(entry);
    }
  }
  for (const object of readObjects(root, [...paths.keys()], objectFormat(root))) {
    if (object.type !== 'blob') throw new Error('invalid-object');
    for (const { path, mode } of paths.get(object.id)) {
      findings.push(...contentCategories(path, object.bytes, mode, policy).map((category) => finding(category, 'index', digest(path))));
    }
  }
  return findings;
}

async function validateParents(root, path) {
  const parts = path.split('/');
  for (let depth = 1; depth < parts.length; depth++) {
    if (!(await lstat(join(root, ...parts.slice(0, depth)))).isDirectory()) throw new Error('unsupported-parent');
  }
}

export async function workingInventory(root, policy) {
  requireRepositoryRoot(root);
  const entries = decodeGitText(git(root, ['ls-files', '--stage', '-z'])).split('\0').filter(Boolean);
  const untracked = decodeGitText(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter((path) => path && path !== 'publication-audit.json');
  const records = [], findings = indexedFindings(root, entries, policy);
  for (const path of ['LICENSE', 'SECURITY.md', 'CODE_OF_CONDUCT.md']) {
    if (!entries.some((entry) => entry.endsWith(`\t${path}`)) && !untracked.includes(path)) findings.push(finding('missing-declaration', 'current', digest(path)));
  }
  for (const entry of entries) {
    if (entry.slice(entry.indexOf('\t') + 1) === 'publication-audit.json') continue;
    const result = await workingEntry(root, entry, policy);
    records.push(result.record);
    findings.push(...result.findings);
  }
  for (const path of untracked) {
    const result = await workingEntry(root, `100644 0 0\t${path}`, policy, true);
    records.push(result.record);
    findings.push(...result.findings);
  }
  if (!records.length) throw new Error('empty-publication-scope');
  records.sort((a, b) => a.location.localeCompare(b.location));
  return { fingerprint: digest(JSON.stringify(records)), files: records.length, untrackedFiles: untracked.length, findings };
}

function requireRepositoryRoot(root) {
  const top = decodeGitText(git(root, ['rev-parse', '--show-toplevel'])).replace(/\r?\n$/u, '');
  if (realpathSync(root) !== realpathSync(top)) throw new Error('incomplete-git-scope');
}

function objectFormat(root) {
  const format = git(root, ['rev-parse', '--show-object-format']).toString().trim();
  if (!['sha1', 'sha256'].includes(format)) throw new Error('invalid-object');
  return format;
}

export function gitScope(root) {
  requireRepositoryRoot(root);
  const shallow = git(root, ['rev-parse', '--is-shallow-repository']).toString().trim() === 'true';
  const config = git(root, ['config', '--local', '--list']).toString();
  const refs = decodeGitText(git(root, ['for-each-ref', '--format=%(refname)%00%(objectname)']));
  const head = git(root, ['rev-parse', '--verify', 'HEAD']).toString().trim();
  const grafts = existsSync(resolve(root, git(root, ['rev-parse', '--git-path', 'info/grafts']).toString().trim()));
  if (shallow || grafts || /(?:partialclone|promisor|sparsecheckout)/iu.test(config) || refs.includes('refs/replace/')) throw new Error('incomplete-git-scope');
  const ids = git(root, ['rev-list', '--objects', '--all', 'HEAD', '--no-object-names', '--missing=print']).toString().trim().split('\n');
  const incomplete = ids.some((id) => !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(id));
  const roots = [...new Set([head, ...refs.trim().split('\n').filter(Boolean).map((ref) => ref.split('\0')[1])])];
  return { head, refs: digest(refs), roots, refCount: refs.trim().split('\n').length, ids: [...new Set(ids)].sort(), incomplete, objectFormat: objectFormat(root) };
}

function* readObjects(root, ids, format) {
  for (let offset = 0; offset < ids.length; offset += 128) yield* readBatch(root, ids.slice(offset, offset + 128), format);
}

function readBatch(root, ids, format) {
  const bytes = git(root, ['cat-file', '--batch'], `${ids.join('\n')}\n`);
  const objects = [];
  let offset = 0;
  for (const expected of ids) {
    const end = bytes.indexOf(10, offset);
    const header = bytes.subarray(offset, end).toString('ascii').split(' ');
    if (end < 0 || header[0] !== expected || !['blob', 'tree', 'commit', 'tag'].includes(header[1]) || !/^\d+$/u.test(header[2])) throw new Error('invalid-object');
    const size = Number(header[2]), start = end + 1;
    if (!Number.isSafeInteger(size) || start + size >= bytes.length || bytes[start + size] !== 10) throw new Error('invalid-object');
    const content = bytes.subarray(start, start + size);
    const actual = createHash(format).update(`${header[1]} ${size}\0`).update(content).digest('hex');
    if (actual !== expected) throw new Error('invalid-object');
    objects.push({ id: expected, type: header[1], bytes: content });
    offset = start + size + 1;
  }
  if (offset !== bytes.length) throw new Error('invalid-object');
  return objects;
}

function treeEntries(bytes, id) {
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset), end = bytes.indexOf(0, space);
    if (space < 0 || end < 0 || end + 1 + id.length / 2 > bytes.length) throw new Error('invalid-tree');
    const path = decodeGitText(bytes.subarray(space + 1, end));
    const child = bytes.subarray(end + 1, end + 1 + id.length / 2).toString('hex');
    entries.push({ path, child, mode: Number.parseInt(bytes.subarray(offset, space).toString(), 8) });
    offset = end + 1 + id.length / 2;
  }
  return entries;
}

function treeFindings(trees, roots, policy, archives) {
  const findings = [], visited = new Set();
  let pathBytes = 0;
  const pending = [...roots].filter((id) => trees.has(id)).map((id) => ({ id, prefix: '' }));
  while (pending.length) {
    const { id, prefix } = pending.pop(), key = `${id}\0${prefix}`;
    if (visited.has(key)) continue;
    pathBytes += Buffer.byteLength(key);
    if (visited.size >= maxHistoricalTreeContexts || pathBytes > maxHistoricalPathBytes) throw new Error('incomplete-git-scope');
    visited.add(key);
    const entries = trees.get(id);
    if (!entries) throw new Error('invalid-tree');
    for (const { path: name, child, mode } of entries) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (Buffer.byteLength(path) > maxHistoricalPathLength) throw new Error('incomplete-git-scope');
      if (mode === 0o40000) {
        findings.push(...textCategories(path, policy).map((category) => finding(category, 'history', id)));
        pending.push({ id: child, prefix: path });
        continue;
      }
      const kind = archiveKind(path);
      if (kind) archives.set(`${child}:${kind}`, { id: child, kind });
      findings.push(...pathFindings(path, policy, 'history', id));
      if (mode === 0o160000) findings.push(finding('unsupported-submodule', 'history', id));
      if (mode === 0o120000) findings.push(finding('unsupported-symlink', 'history', id));
    }
  }
  return findings;
}

export function objectInventory(root, scope, policy) {
  const counts = { blob: 0, tree: 0, commit: 0, tag: 0 }, records = [], findings = [];
  const archives = new Map(), gzipSignatures = new Set(), trees = new Map(), roots = new Set(scope.roots);
  let bytes = 0;
  for (const object of readObjects(root, scope.ids, scope.objectFormat)) {
    counts[object.type]++;
    bytes += object.bytes.length;
    records.push([object.id, object.type, digest(object.bytes)]);
    if (object.bytes[0] === 31 && object.bytes[1] === 139) gzipSignatures.add(object.id);
    const categories = object.type === 'tree' ? [] : inspectContent(object.bytes, policy);
    findings.push(...categories.map((category) => finding(category, 'history', object.id)));
    if (object.type === 'tree') trees.set(object.id, treeEntries(object.bytes, object.id));
    if (object.type === 'commit') roots.add(/^tree ([a-f0-9]+)\n/u.exec(object.bytes.toString('utf8'))?.[1]);
    if (object.type === 'tag') roots.add(/^object ([a-f0-9]+)\ntype tree\n/u.exec(object.bytes.toString('utf8'))?.[1]);
  }
  findings.push(...treeFindings(trees, roots, policy, archives));
  for (const { id, kind } of archives.values()) {
    if (kind === 'unsupported' || !gzipSignatures.has(id)) findings.push(finding(kind === 'unsupported' ? 'unsupported-archive' : 'unreadable-archive', 'history', id));
  }
  return { counts, bytes, fingerprint: digest(JSON.stringify(records)), findings };
}
