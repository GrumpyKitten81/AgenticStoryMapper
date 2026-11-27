import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, '.claude', 'hook-settings.template.json');
const localPath = join(root, '.claude', 'settings.local.json');
const settings = JSON.parse(readFileSync(templatePath, 'utf8'));
const hooks = Object.values(settings.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks));
hooks.push(settings.statusLine);

function target(command) {
  const wolf = command.match(/\.wolf\/hooks\/([\w-]+\.js)/);
  if (wolf) return ['node', [join(root, '.wolf', 'hooks', wolf[1])]];
  const relay = command.match(/bmad-loop.* relay (\w+)/);
  if (relay) return ['bmad-loop', ['relay', relay[1]]];
  if (command === 'rtk hook claude') return ['rtk', ['hook', 'claude']];
  const graph = command.match(/code-review-graph (status|update)/);
  if (graph) return ['code-review-graph', [graph[1], ...(graph[1] === 'update' ? ['--skip-flows'] : []), '--repo', root]];
  throw new Error(`Unknown hook command: ${command}`);
}

function run(index) {
  const hook = hooks[index];
  if (!hook) throw new Error(`Unknown hook index: ${index}`);
  const [executable, args] = target(hook.command);
  const result = spawnSync(executable, args, { cwd: root, input: readFileSync(0), encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}

function install() {
  if (existsSync(localPath)) throw new Error(`${localPath} already exists; preserve and inspect it manually`);
  const wolfFiles = hooks.map((hook) => target(hook.command)).filter(([executable]) => executable === 'node');
  const available = new Map([['node', wolfFiles.every(([, args]) => existsSync(args[0]))]]);
  for (const executable of ['bmad-loop', 'rtk', 'code-review-graph']) {
    const check = spawnSync(executable, ['--version'], { cwd: root, encoding: 'utf8' });
    available.set(executable, !check.error && check.status === 0);
  }
  for (const [executable, ready] of available) {
    process.stdout.write(`${ready ? 'Ready' : 'Skipped'}: ${executable === 'node' ? 'OpenWolf' : executable}\n`);
  }
  if (![...available.values()].some(Boolean)) throw new Error('No agent hooks available; install the optional tools first');
  const scriptPath = fileURLToPath(import.meta.url).replaceAll('\\', '/');
  const quotedPath = process.platform === 'win32' ? `"${scriptPath}"` : `'${scriptPath.replaceAll("'", "'\\''")}'`;
  let index = 0;
  for (const groups of Object.values(settings.hooks)) {
    for (const group of groups) {
      group.hooks = group.hooks.filter((hook) => {
        const ready = available.get(target(hook.command)[0]);
        if (ready) hook.command = `node ${quotedPath} run ${index}`;
        index++;
        return ready;
      });
    }
  }
  for (const [event, groups] of Object.entries(settings.hooks)) settings.hooks[event] = groups.filter((group) => group.hooks.length);
  if (available.get('node')) settings.statusLine.command = `node ${quotedPath} run ${index}`;
  else delete settings.statusLine;
  writeFileSync(localPath, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Installed local agent hooks in ${localPath}\n`);
}

if (process.argv[2] === 'install') install();
else if (process.argv[2] === 'run' && /^\d+$/.test(process.argv[3] ?? '')) run(Number(process.argv[3]));
else throw new Error('Usage: node scripts/agent-hooks.mjs install | run INDEX');
