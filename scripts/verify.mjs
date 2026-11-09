import { constants, existsSync, realpathSync } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandMain, run } from './processes.mjs';
import { checkHealth, configuredUrl, repository, runtime } from './runtime.mjs';

async function gitHygiene(signal) {
  const git = (args) => run('git', args, { cwd: repository, capture: true, signal });
  await git(['check-ignore', '--', '.env']);
  if ((await git(['status', '--ignored', '--short', '--', '.env.example'])).split('\n').some((line) => line.startsWith('!!'))) throw new Error('.env.example must not be ignored.');
  const tracked = (await git(['ls-files', '-z'])).split('\0');
  const sensitive = tracked.filter((path) => /(^|\/)\.env($|\.)/.test(path) && !path.endsWith('.env.example') || path.startsWith('input/') || path.startsWith('local-projects/') && path !== 'local-projects/.gitkeep' || /\.sqlite/.test(path));
  if (sensitive.length) throw new Error(`Sensitive files are tracked by Git: ${sensitive.join(', ')}`);
  if (await git(['log', '--oneline', '--', '.env'])) throw new Error('.env appears in Git history. Rotate secrets and clean history before release.');
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    if (!existsSync(join(repository, file))) throw new Error(`${file} is required for release verification.`);
  }
}

async function projectFolder() {
  const folder = join(repository, 'local-projects', 'default.lsm');
  if (!existsSync(folder)) return;
  if (!(await stat(folder)).isDirectory()) throw new Error(`${folder} must be a directory.`);
  await access(folder, constants.W_OK | constants.X_OK);
}

export async function verifyChecks(signal, { flags = new Set(), checkProjectFolder = true } = {}) {
  for (const flag of flags) {
    if (!['--skip-typecheck', '--skip-build', '--check-health'].includes(flag)) throw new Error(`Unknown verification argument: ${flag}`);
  }
  await gitHygiene(signal);
  if (checkProjectFolder) await projectFolder();
  const { pnpm } = await runtime(signal);
  await pnpm(['check-hygiene']);
  await pnpm(['check-size']);
  await pnpm(['check-capabilities']);
  await pnpm(['--filter', '@storymapper/web', 'test:a11y']);
  if (!flags.has('--skip-typecheck')) await pnpm(['typecheck']);
  if (!flags.has('--skip-build')) await pnpm(['build']);
  if (flags.has('--check-health')) await checkHealth(await configuredUrl(), signal);
  console.log('Verification completed.');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await commandMain((signal) => verifyChecks(signal, { flags: new Set(process.argv.slice(2)) }));
