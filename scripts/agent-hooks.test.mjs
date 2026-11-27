import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('local hook setup fails before writing config when OpenWolf hooks are absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hooks-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, '.claude'));
    copyFileSync(join(import.meta.dirname, 'agent-hooks.mjs'), join(root, 'scripts', 'agent-hooks.mjs'));
    copyFileSync(join(import.meta.dirname, '..', '.claude', 'hook-settings.template.json'), join(root, '.claude', 'hook-settings.template.json'));
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'agent-hooks.mjs'), 'install'], {
      encoding: 'utf8', env: { ...process.env, PATH: '' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Skipped: OpenWolf/);
    assert.match(result.stderr, /No agent hooks available/);
    assert.equal(existsSync(join(root, '.claude', 'settings.local.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('setup includes only available integrations and keeps absolute runner paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hooks-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, '.claude'));
    mkdirSync(join(root, 'bin'));
    copyFileSync(join(import.meta.dirname, 'agent-hooks.mjs'), join(root, 'scripts', 'agent-hooks.mjs'));
    copyFileSync(join(import.meta.dirname, '..', '.claude', 'hook-settings.template.json'), join(root, '.claude', 'hook-settings.template.json'));
    copyFileSync(process.execPath, join(root, 'bin', process.platform === 'win32' ? 'bmad-loop.exe' : 'bmad-loop'));
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'agent-hooks.mjs'), 'install'], {
      encoding: 'utf8', env: { ...process.env, PATH: join(root, 'bin') },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Ready: bmad-loop/);
    assert.match(result.stdout, /Skipped: OpenWolf/);
    const local = readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8');
    assert.match(local, /agent-hooks\.mjs/);
    assert.doesNotMatch(local, /CLAUDE_PROJECT_DIR|\.wolf\/hooks|rtk hook claude/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hook runner resolves its own repository even from another working directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hooks-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, '.claude'));
    mkdirSync(join(root, '.wolf', 'hooks'), { recursive: true });
    copyFileSync(join(import.meta.dirname, 'agent-hooks.mjs'), join(root, 'scripts', 'agent-hooks.mjs'));
    copyFileSync(join(import.meta.dirname, '..', '.claude', 'hook-settings.template.json'), join(root, '.claude', 'hook-settings.template.json'));
    writeFileSync(join(root, '.wolf', 'hooks', 'pre-read.js'), 'process.stdout.write(process.cwd() + "\\n" + require("fs").readFileSync(0, "utf8"))');
    const template = JSON.parse(readFileSync(join(root, '.claude', 'hook-settings.template.json'), 'utf8'));
    const index = Object.values(template.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks))
      .findIndex((hook) => hook.command.includes('pre-read.js'));
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'agent-hooks.mjs'), 'run', String(index)], {
      cwd: tmpdir(), input: '{"tool_name":"Read"}', encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${root}\n{"tool_name":"Read"}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
