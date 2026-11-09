import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateNotes, releaseRange } from './release-candidate.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'storymapper-release-range-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Release fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('./release-notes.md', import.meta.url), join(root, 'scripts/release-notes.md'));
  git('add', '.');
  const commit = (subject) => {
    git('commit', '--quiet', '--allow-empty', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  return { root, git, commit };
}

function assertNotes(root, candidate, previous, included) {
  assert.equal(releaseRange(root, candidate), `${previous}..${candidate.revision}`);
  const notes = readFileSync(generateNotes(root, candidate), 'utf8');
  const hashes = [...notes.matchAll(/^- `([a-f0-9]{40,64})`:/gm)].map((match) => match[1]);
  assert.deepEqual(hashes.sort(), [...included].sort());
}

test('nearest reachable prior tag wins over higher versions and unreachable tags', (t) => {
  const { root, git, commit } = fixture(t);
  const base = commit('Base');
  git('tag', 'v9.0.0');
  commit('Nearest prior release');
  git('tag', '-a', 'v1.0.0', '-m', 'Annotated prior release');
  const included = [commit('Included change'), commit('Current release')];
  git('tag', 'v10.0.0');
  git('checkout', '--quiet', '-b', 'unmerged', base);
  commit('Unmerged release');
  git('tag', 'v99.0.0');
  git('checkout', '--quiet', 'main');
  assertNotes(root, { tag: 'v10.0.0', version: '10.0.0', revision: included[1] }, 'v1.0.0', included);
});

test('equal distance tags use lexical order across annotated and lightweight tags', (t) => {
  const { root, git, commit } = fixture(t);
  commit('Prior release');
  git('tag', 'v1.9.0');
  git('tag', '-a', 'v1.10.0', '-m', 'Lexically first prior release');
  const head = commit('Current release');
  git('tag', '-a', 'v2.0.0', '-m', 'Current annotated release');
  git('tag', 'v0.0.1');
  assertNotes(root, { tag: 'v2.0.0', version: '2.0.0', revision: head }, 'v1.10.0', [head]);
});

test('merged branch tag excludes its ancestors and retains every other included commit', (t) => {
  const { root, git, commit } = fixture(t);
  const base = commit('Shared ancestor');
  git('tag', 'v1.0.0');
  const mainBefore = commit('Main change before branch release');
  git('checkout', '--quiet', '-b', 'feature', base);
  commit('Branch release boundary');
  git('tag', '-a', 'v1.1.0', '-m', 'Merged branch prior release');
  const branchAfter = commit('Branch change after release');
  git('checkout', '--quiet', 'main');
  const mainAfter = commit('Main change after branch release');
  git('merge', '--quiet', '--no-ff', 'feature', '-m', 'Merge feature');
  const merge = git('rev-parse', 'HEAD');
  const head = commit('Current release');
  git('tag', 'v2.0.0');
  assertNotes(root, { tag: 'v2.0.0', version: '2.0.0', revision: head }, 'v1.1.0', [mainBefore, branchAfter, mainAfter, merge, head]);
});
