import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './check-publication-git.mjs';

const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const semver = new RegExp(`^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

export function validVersion(value) {
  return typeof value === 'string' && value.length <= 64 && semver.test(value);
}

export function validateCandidate(root, env) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF_TYPE !== 'tag' || !env.GITHUB_REF?.startsWith('refs/tags/')) throw new Error('tag-event-required');
  const tag = env.GITHUB_REF.slice('refs/tags/'.length);
  if (!tag.startsWith('v') || !validVersion(tag.slice(1))) throw new Error('invalid-release-tag');
  let metadata, metadataBytes;
  try { metadataBytes = readFileSync(join(root, 'package.json')); metadata = JSON.parse(metadataBytes.toString('utf8')); }
  catch (error) { if (!(error instanceof SyntaxError) && error.code !== 'ENOENT') throw error; throw new Error('invalid-root-metadata'); }
  if (metadata?.name !== 'storymapper' || !validVersion(metadata.version) || tag !== `v${metadata.version}`) throw new Error('tag-version-mismatch');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(env.GITHUB_SHA ?? '')) throw new Error('invalid-release-revision');
  if (git(root, ['rev-parse', '--is-shallow-repository']).toString().trim() !== 'false') throw new Error('full-history-required');
  const revision = git(root, ['rev-parse', 'HEAD']).toString().trim();
  const tagObject = git(root, ['rev-parse', '--verify', env.GITHUB_REF]).toString().trim();
  const tagged = git(root, ['rev-parse', '--verify', `${env.GITHUB_REF}^{commit}`]).toString().trim();
  if (revision !== env.GITHUB_SHA || tagged !== revision) throw new Error('tag-revision-mismatch');
  if (!git(root, ['show', `${revision}:package.json`]).equals(metadataBytes)) throw new Error('root-metadata-revision-mismatch');
  return { tag, version: metadata.version, revision, tagObject };
}

export function releaseRange(root, candidate) {
  const reachable = git(root, ['tag', '--merged', candidate.revision]).toString().trim().split('\n');
  const previous = reachable.filter((tag) => tag !== candidate.tag && tag.startsWith('v') && validVersion(tag.slice(1)))
    .map((tag) => ({ tag, distance: Number(git(root, ['rev-list', '--count', `${tag}..${candidate.revision}`]).toString().trim()) }))
    .filter(({ distance }) => distance > 0)
    .sort((a, b) => a.distance - b.distance || a.tag.localeCompare(b.tag))[0]?.tag;
  return previous ? `${previous}..${candidate.revision}` : candidate.revision;
}

export function generateNotes(root, candidate) {
  const range = releaseRange(root, candidate);
  const commits = git(root, ['rev-list', '--reverse', range]).toString().trim().split('\n');
  if (commits.some((commit) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))) throw new Error('invalid-release-history');
  const template = readFileSync(join(root, 'scripts/release-notes.md'), 'utf8');
  const entries = commits.map((commit) => {
    const subject = git(root, ['show', '-s', '--format=%s', commit]).toString().trim()
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&').replaceAll('@', '@\u200b');
    return `- \`${commit}\`: ${subject}`;
  });
  const notes = template.replaceAll('{{VERSION}}', candidate.version).replaceAll('{{RANGE}}', range).replaceAll('{{COMMITS}}', () => entries.join('\n'));
  const path = join(root, 'release-notes.md');
  writeFileSync(path, notes, { flag: 'wx' });
  return path;
}

export function requireChecks(value) {
  let checks;
  try { checks = JSON.parse(value); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new Error('release-checks-required'); }
  if (!checks || Object.keys(checks).sort().join() !== 'audit,quality' || checks.quality !== 'success' || checks.audit !== 'success') throw new Error('release-checks-failed');
}
