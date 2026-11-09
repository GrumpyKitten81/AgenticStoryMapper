#!/usr/bin/env node
/**
 * Fail-fast checks before unattended bmad-loop resume/resolve.
 * Prevents review parks on Claude IdlePrompt when the CLI is not logged in.
 *
 * Usage: node scripts/bmad-loop-preflight.mjs
 * Exit 0 = ok to resume; non-zero = print fixes and abort.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: root, ...opts });
}

// Node 24 for verify/tests (same pin as policy [verify].commands).
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 24) {
  failures.push(
    `Node ${process.versions.node} is active; Agentic Story Mapper verify expects Node 24 (nvm use 24 / PATH pin in .bmad-loop/policy.toml).`,
  );
}

// Claude Code must be logged in — review adapter parks on IdlePrompt otherwise
// ("Not logged in · Run /login"), which escalates the whole unattended run.
const claude = run('claude', ['auth', 'status'], { env: process.env });
if (claude.error?.code === 'ENOENT') {
  failures.push('`claude` CLI not found on PATH (required for [adapter.review]).');
} else {
  let auth = null;
  try {
    auth = JSON.parse((claude.stdout || '').trim() || '{}');
  } catch {
    failures.push(
      `\`claude auth status\` failed (exit ${claude.status}): ${(claude.stderr || claude.stdout || '').trim()}`,
    );
  }
  if (auth && !auth.loggedIn) {
    failures.push(
      'Claude Code is not logged in (`claude auth status` → loggedIn: false). Review sessions park on IdlePrompt and escalate. Run `claude auth login` (or `claude auth login --console` for API billing), then re-check with this script.',
    );
  } else if (auth && claude.status !== 0) {
    failures.push(`\`claude auth status\` exited ${claude.status} despite loggedIn=true — investigate CLI health.`);
  }
}

const settings = resolve(root, '.bmad-loop/claude-unattended.settings.json');
if (!existsSync(settings)) {
  failures.push('Missing .bmad-loop/claude-unattended.settings.json (skipDangerousModePermissionPrompt for unattended review).');
}

if (failures.length) {
  console.error('bmad-loop preflight FAILED:\n');
  for (const f of failures) console.error(`- ${f}`);
  console.error('\nDo not resume/resolve until these are fixed.');
  process.exit(1);
}

console.log('bmad-loop preflight OK (Node 24, Claude logged in, unattended settings present).');
