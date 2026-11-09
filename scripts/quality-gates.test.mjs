import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectSize, physicalLines } from './check-size.mjs';
import { checkBoundaries, sourceImports } from './check-boundaries.mjs';
import { inspectCoverage, logicWorkspaces, unlistedWorkspaces } from './check-coverage.mjs';
import { inspectLicenses } from './check-licenses.mjs';
import { licenseCompatible } from './license-policy.mjs';
import { corepackEntry } from './runtime.mjs';
import { authoredFiles, parseSource } from './source-inventory.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/quality/${name}.fixture`, import.meta.url), 'utf8');
const command = fileURLToPath(new URL('./fixtures/quality/command.mjs', import.meta.url));
function temporary(nested = '') {
  const base = mkdtempSync(join(tmpdir(), 'storymapper-gates-'));
  const root = join(base, nested);
  const write = (file, content) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content)); };
  return { root, write, close: () => rmSync(base, { recursive: true, force: true }) };
}

test('checks physical line and UTF-8 byte limits at the exact boundary', () => {
  const file = resolve('scripts/fixture.css');
  assert.equal(physicalLines('a\r\nb\r\n'), 2);
  assert.equal(inspectSize('x\n'.repeat(750), file).length, 0);
  assert.equal(inspectSize('x\r\n'.repeat(751), file)[0].rule, 'file-lines');
  assert.equal(inspectSize('ä'.repeat(50000), file).length, 0);
  assert.equal(inspectSize('ä'.repeat(50000) + 'x', file)[0].rule, 'file-bytes');
});

test('parses nested arrows, methods and component functions with exact starting locations', () => {
  const source = fixture('function-shapes');
  const legal = source.replace('    return 1;', '\n'.repeat(45) + '    return 1;');
  const violations = inspectSize(legal, resolve('scripts/fixture.tsx'));
  assert.ok(violations.some(({ line, rule }) => line === 1 && rule === 'function-lines'));
  assert.ok(!violations.some(({ line }) => line === 2));
  const illegal = source.replace('    return 1;', '\r\n'.repeat(48) + '    return 1;');
  assert.ok(inspectSize(illegal, resolve('scripts/fixture.tsx')).some(({ line }) => line === 2));
  assert.ok(inspectSize(source.replace('    return outer();', '\n'.repeat(48) + '    return outer();'), resolve('scripts/fixture.tsx')).some(({ line }) => line === 8));
  assert.ok(inspectSize(source.replace('  <div>', '\n'.repeat(46) + '  <div>'), resolve('scripts/fixture.tsx')).some(({ line }) => line === 12));
  assert.throws(() => inspectSize('function {', resolve('scripts/fixture.ts')), /parse failure/);
});

test('finds static, re-export, import-equals, require, dynamic and type imports', () => {
  const parsed = parseSource('fixture.ts', fixture('import-syntax'));
  assert.deepEqual(sourceImports(parsed), ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'].map((specifier, index) => ({ condition: [3, 4].includes(index) ? 'require' : 'import', ...(index === 6 ? { typeOnly: true } : {}), specifier, line: index + 1 })));
});

test('preserves loading mode independently of explicit type-only syntax', () => {
  const imports = sourceImports(parseSource('fixture.ts', fixture('conditional-imports')));
  assert.deepEqual(imports, Array.from({ length: 17 }, (_, index) => ({ condition: [8, 9, 13, 14, 15].includes(index) ? 'require' : 'import', ...(index >= 10 ? { typeOnly: true } : {}), specifier: '@storymapper/contracts/public', line: index + 1 })));
  const common = sourceImports(parseSource('fixture.cts', fixture('conditional-imports')));
  assert.equal(common[12].condition, 'require');
  assert.equal(common[16].condition, 'import');
});

test('finds literal ESM resolution dependencies without treating path resolution as an import', () => {
  const parsed = parseSource('fixture.ts', fixture('import-meta-resolve'));
  assert.deepEqual(sourceImports(parsed), [
    { condition: 'import', specifier: 'resolved-package', line: 1 },
    { condition: 'import', specifier: 'template-package', line: 2 }
  ]);
});

function boundaryFixture(nested) {
  const env = temporary(nested);
  for (const workspace of logicWorkspaces) {
    env.write(`${workspace}/package.json`, { name: `@storymapper/${workspace.split('/')[1]}`, dependencies: {}, main: './dist/index.js' });
    env.write(`${workspace}/src/index.ts`, 'export {};');
  }
  env.write('package.json', { name: 'quality-fixture', packageManager: 'pnpm@9.15.4', type: 'module' });
  env.write('scripts/fixture.json', '{}');
  env.write('tsconfig.base.json', { compilerOptions: { moduleResolution: 'Bundler', baseUrl: '.', paths: { '@escape/*': ['packages/db/src/*'] } } });
  return env;
}

test('checks runtime and type-only imports against ordered conditional exports', () => {
  const env = boundaryFixture();
  const runtimeEsm = [1, 2, 3, 4, 5, 6, 7, 8], runtimeCjs = [9, 10], typesEsm = [11, 12, 13, 17], typesCjs = [14, 15, 16];
  const cases = [
    [{ import: './public.js' }, [...runtimeEsm, ...typesEsm]],
    [{ require: './public.cjs' }, [...runtimeCjs, ...typesCjs]],
    [{ types: './public.d.ts' }, [...typesEsm, ...typesCjs]],
    [{ import: { types: './public.d.ts' } }, typesEsm],
    [{ require: { types: './public.d.cts' } }, typesCjs],
    [{ types: { require: './public.d.cts' }, import: './public.js' }, [...runtimeEsm, ...typesEsm, ...typesCjs]],
    [{ node: { require: './public.cjs' }, default: './public.js' }, Array.from({ length: 17 }, (_, index) => index + 1)],
    [{ node: [{ require: './public.cjs' }], default: './public.js' }, Array.from({ length: 17 }, (_, index) => index + 1)],
    [{ node: [{ require: './public.cjs' }, null], default: './public.js' }, [...runtimeCjs, ...typesCjs]],
    [{ node: [null, { require: './public.cjs' }], default: './public.js' }, [...runtimeCjs, ...typesCjs]],
    [{ node: [], default: './public.js' }, []],
    [{ node: { require: null }, default: './public.js' }, [...runtimeEsm, ...typesEsm]],
    [{ types: null, default: './public.js' }, [...runtimeEsm, ...runtimeCjs]],
    [{ import: null, default: './public.js' }, [...runtimeCjs, ...typesCjs]],
    [{ default: null, types: './public.d.ts', import: './public.js', require: './public.cjs' }, []],
    [null, []]
  ];
  try {
    env.write('apps/web/package.json', { name: '@storymapper/web', dependencies: { '@storymapper/contracts': 'workspace:*' } });
    env.write('apps/web/src/index.ts', fixture('conditional-imports'));
    for (const [entry, allowed] of cases) {
      env.write('packages/contracts/package.json', { name: '@storymapper/contracts', exports: { './public': entry } });
      const expected = Array.from({ length: 17 }, (_, index) => index + 1).filter((line) => !allowed.includes(line));
      assert.deepEqual(checkBoundaries(env.root).map(({ file, line, rule }) => ({ file, line, rule })), expected.map((line) => ({ file: 'apps/web/src/index.ts', line, rule: 'workspace-entrypoint' })), JSON.stringify(entry));
    }
  } finally { env.close(); }
});

test('classifies tests relative to the checked root, not its parent directories', () => {
  const env = boundaryFixture('fixtures/checkout');
  try {
    env.write('packages/core/src/index.ts', fixture('forbidden'));
    assert.ok(checkBoundaries(env.root).some(({ rule }) => rule === 'core-purity'));
  } finally { env.close(); }
});

test('rejects dependency, layer, core, DB-only, alias escape and cross-feature violations', () => {
  const env = boundaryFixture();
  try {
    env.write('packages/core/src/index.ts', fixture('import-syntax'));
    env.write('packages/core/src/forbidden.ts', readFileSync(new URL('./fixtures/quality/forbidden.fixture', import.meta.url), 'utf8'));
    env.write('apps/web/src/features/a/source.ts', "export * from '@storymapper/web/features/b/private';");
    const rules = new Set(checkBoundaries(env.root).map(({ rule }) => rule));
    for (const rule of ['undeclared-dependency', 'layer-direction', 'core-purity', 'db-only', 'workspace-source-escape', 'feature-entrypoint']) assert.ok(rules.has(rule), rule);
    env.write('packages/core/src/index.ts', 'export {};');
    env.write('packages/core/src/forbidden.ts', 'export {};');
    env.write('apps/web/src/features/a/source.ts', "export * from '@storymapper/web/features/b/index';");
    assert.deepEqual(checkBoundaries(env.root), []);
    env.write('packages/core/package.json', { name: '@storymapper/core', dependencies: { '@storymapper/contracts': 'workspace:*' } });
    assert.ok(checkBoundaries(env.root).some(({ rule }) => rule === 'unused-dependency'));
  } finally { env.close(); }
});

function coverageFixture() {
  const env = boundaryFixture();
  env.write('packages/core/src/uncovered.js', readFileSync(new URL('./fixtures/quality/executable.fixture', import.meta.url), 'utf8'));
  const file = join(env.root, 'packages/core/coverage/coverage-summary.json');
  const report = { total: { lines: { total: 10, covered: 6, pct: 60 } }, [join(env.root, 'packages/core/src/uncovered.js')]: { lines: { total: 10, covered: 6, pct: 60 } } };
  return { ...env, file, report, save: (value) => env.write('packages/core/coverage/coverage-summary.json', value) };
}

test('fails missing, stale, malformed, empty, below-floor and absent JS source reports per workspace', () => {
  const env = coverageFixture();
  const inspect = () => inspectCoverage(env.root, 'packages/core', 1);
  try {
    assert.throws(inspect, /missing or stale/);
    env.save(env.report);
    assert.equal(inspect().percent, '60.00');
    utimesSync(env.file, 0, 0);
    assert.throws(inspect, /stale/);
    for (const report of ['{', {}, { total: { lines: { total: 0, covered: 0, pct: 100 } } }, { total: { lines: { total: 10, covered: 5, pct: 50 } } }]) {
      env.save(report);
      assert.throws(inspect);
    }
    env.save({ total: env.report.total, [join(env.root, 'packages/core/src/uncovered.js')]: {} });
    assert.throws(inspect, /invalid instrumented file/);
    env.save({ total: env.report.total, [join(env.root, 'packages/core/src/index.ts')]: env.report[join(env.root, 'packages/core/src/uncovered.js')] });
    assert.throws(inspect, /absent instrumented source.*uncovered.js/);
    env.save({ ...env.report, total: { lines: { total: 11, covered: 7, pct: 63.63 } } });
    assert.throws(inspect, /inconsistent aggregate/);
    assert.throws(() => inspectCoverage(env.root, 'packages/mcp', 1), /missing/);
  } finally { env.close(); }
});

test('evaluates explicit compatible compound license options without accepting unknown standalone terms', () => {
  for (const expression of ['MIT', '(MIT OR GPL-3.0-or-later)', 'MIT OR SEE LICENSE IN FEEL-FREE.md', '((Apache-2.0 AND MIT) OR GPL-3.0-only)', 'MIT AND Zlib', 'MPL-2.0']) assert.equal(licenseCompatible(expression), true, expression);
  for (const expression of [undefined, '', 'Unknown', 'GPL-3.0-only', 'MIT AND Unknown', '(MIT', 'MIT OR', 'MIT OR GPL-3.0-only)', 'MIT AND (GPL-3.0-only OR Unknown)', 'SEE LICENSE IN LICENSE', 'MIT OR )', 'MIT OR AND', 'MIT OR OR', 'MIT OR ()', 'MIT OR (AND Apache-2.0)', 'MIT OR Unknown!']) assert.equal(licenseCompatible(expression), false, expression);
});

test('checks installed resolved license metadata and refuses missing or mismatched evidence', () => {
  const env = temporary();
  try {
    const entry = { name: 'fixture', versions: ['1.0.0'], paths: [env.root] };
    assert.throws(() => inspectLicenses({ MIT: [entry] }), /ENOENT/);
    env.write('package.json', { name: 'fixture', version: '1.0.0' });
    assert.match(inspectLicenses({ Unknown: [entry] })[0], /fixture@1.0.0/);
    env.write('package.json', { name: 'fixture', version: '1.0.0', license: 'MIT' });
    assert.deepEqual(inspectLicenses({ MIT: [entry] }), []);
    env.write('package.json', { name: 'fixture', version: '2.0.0', license: 'MIT' });
    assert.throws(() => inspectLicenses({ MIT: [entry] }), /identity mismatch/);
    for (const invalid of [{}, [], { MIT: [] }, { MIT: [{ name: 'fixture' }] }]) assert.throws(() => inspectLicenses(invalid));
  } finally { env.close(); }
});

test('CLI fails on missing tools and child errors before a later success can mask them', () => {
  for (const mode of ['fail', 'missing']) {
    const child = spawnSync(process.execPath, [command, mode], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.ok(!child.stdout.includes('later-success'));
    assert.match(child.stderr, mode === 'fail' ? /exit code 7/ : /ENOENT/);
  }
});

async function interruptedCommand(signal) {
  const child = spawn(process.execPath, [command, 'wait'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  const ready = new Promise((resolveReady, reject) => {
    child.stdout.on('data', () => { if (/descendant:\d+/.test(output)) resolveReady(); });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Command exited before readiness.')));
  });
  const closed = new Promise((resolveClosed) => child.once('close', (code) => resolveClosed(code)));
  try {
    await ready;
    if (process.platform === 'win32') child.send({ signal }); else child.kill(signal);
    assert.equal(await closed, 1);
    assert.ok(!output.includes('later-success'));
    const pid = Number(output.match(/descendant:(\d+)/)[1]);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
}

test('SIGINT fails the CLI and drains owned descendants', { timeout: 15000 }, () => interruptedCommand('SIGINT'));
test('SIGTERM fails the CLI and drains owned descendants', { timeout: 15000 }, () => interruptedCommand('SIGTERM'));


test('the actual aggregate CLI propagates a boundary failure before coverage and build', { timeout: 10000 }, () => {
  const env = boundaryFixture();
  try {
    for (const file of ['scripts/check.mjs', 'scripts/verify.mjs', 'scripts/processes.mjs', 'scripts/runtime.mjs', 'scripts/source-inventory.mjs', 'scripts/check-boundaries.mjs', 'apps/server/src/config/failures.mjs', 'apps/server/src/config/runtime-port.ts']) env.write(file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    env.write('package.json', { name: 'quality-fixture', packageManager: 'pnpm@9.15.4' });
    env.write('packages/core/src/index.ts', fixture('forbidden'));
    symlinkSync(resolve('node_modules'), join(env.root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const child = spawnSync(process.execPath, ['scripts/check.mjs'], { cwd: env.root, encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /core-purity/);
    assert.ok(!child.stdout.includes('All local quality gates completed'));
  } finally { env.close(); }
});


function aggregateFixture(script = 'check.mjs') {
  const env = temporary();
  const gates = ['check-boundaries.mjs', 'check-size.mjs', 'check-hygiene.mjs', 'check-licenses.mjs', 'check-coverage.mjs', 'stub.test.mjs'];
  for (const file of [`scripts/${script}`, 'scripts/verify.mjs', 'scripts/processes.mjs', 'scripts/runtime.mjs', 'scripts/source-inventory.mjs', 'apps/server/src/config/failures.mjs', 'apps/server/src/config/runtime-port.ts']) env.write(file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  for (const gate of gates) env.write(`scripts/${gate}`, fixture('gate-stub'));
  env.write('bin/corepack', fixture('gate-corepack'));
  env.write('package.json', { name: 'quality-fixture', packageManager: 'pnpm@9.15.4', type: 'module' });
  env.write('.gitignore', '.env\n');
  for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.env.example']) env.write(file, '');
  symlinkSync(resolve('node_modules'), join(env.root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const git = (...args) => spawnSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: env.root, encoding: 'utf8' });
  assert.equal(git('init', '--quiet').status, 0);
  git('add', '--', '.', ':(exclude)node_modules');
  assert.equal(git('commit', '--quiet', '-m', 'fixture').status, 0);
  const log = join(env.root, 'gate.log');
  const { NODE_TEST_CONTEXT, ...inherited } = process.env;
  const run = (fail = '') => spawnSync(process.execPath, [`scripts/${script}`], { cwd: env.root, encoding: 'utf8', env: { ...inherited, PATH: `${join(env.root, 'bin')}${delimiter}${process.env.PATH}`, GATE_LOG: log, GATE_FAIL: fail } });
  return { ...env, log, run, calls: () => readFileSync(log, 'utf8').trim().split('\n') };
}

const aggregateOrder = ['check-boundaries.mjs', 'check-size.mjs', 'check-hygiene.mjs', 'check-licenses.mjs', 'pnpm check-capabilities', 'pnpm build', 'stub.test.mjs', 'check-coverage.mjs', 'pnpm --filter @storymapper/server test:audit-performance', 'pnpm check-hygiene', 'pnpm check-size', 'pnpm check-capabilities', 'pnpm --filter @storymapper/web test:a11y', 'pnpm typecheck'];

test('product test discovery excludes the explicitly invoked BMAD wrapper', () => {
  assert.ok(!readdirSync(new URL('.', import.meta.url)).some((file) => file.startsWith('bmad-') && file.endsWith('.test.mjs')));
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.match(scripts.test, /scripts\/\*\.test\.mjs/);
  assert.equal(scripts['test:bmad'], 'node --test --test-concurrency=1 scripts/bmad-tests/*.test.mjs');
});

test('PR workflow has one cancellable Linux gate, store-only cache and conditional safe audit', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/^  \w+:$/gm) ?? []).filter((job) => job !== '  pull_request:').length, 1);
  assert.match(workflow, /name: CI\n    env:/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /group: ci-\$\{\{ github.event.pull_request.number \}\}/);
  assert.match(workflow, /fetch-depth: 2/);
  assert.match(workflow, /actions\/cache@caa296126883cff596d87d8935842f9db880ef25/);
  assert.match(workflow, /path: \$\{\{ github.workspace \}\}\/\.\.\/pnpm-store/);
  assert.match(workflow, /key: \$\{\{ runner.os \}\}-node24-pnpm-\$\{\{ hashFiles\('pnpm-lock.yaml'\) \}\}/);
  assert.ok(!/matrix|bmad|uv |node_modules|contents: write/.test(workflow));
  assert.match(workflow, /run: corepack pnpm check:ci/);
  assert.match(workflow, /git diff --name-only HEAD\^1 HEAD -- pnpm-lock.yaml > "\$RUNNER_TEMP\/lockfile-diff"\n/);
  assert.match(workflow, /if: steps.lockfile.outputs.changed == 'true'\n        run: node scripts\/ci-audit.mjs/);
  assert.ok(workflow.indexOf('name: Detect lockfile changes') < workflow.indexOf('name: Report dependency audit safely'));
  assert.ok(workflow.indexOf('name: Report dependency audit safely') < workflow.indexOf('name: Run bounded product checks'));
  assert.ok(!workflow.includes('always()'));
});

test('CI CLI runs the bounded product gates and stops on early and final failures', { timeout: 30000 }, () => {
  const env = aggregateFixture('check-ci.mjs');
  const order = [...aggregateOrder.slice(0, 6), 'pnpm --filter @storymapper/contracts exec vitest run --exclude **/dist/** --maxWorkers=1', 'pnpm --filter @storymapper/core exec vitest run --exclude **/dist/** --maxWorkers=1', 'pnpm --filter @storymapper/server exec vitest run src/http/routes/changeset-preview.test.ts --maxWorkers=1', 'pnpm --filter @storymapper/web exec vitest run src/features/onboarding/first-map-creation.test.tsx src/features/releases/filtered-reports.test.tsx --maxWorkers=1'];
  try {
    const passed = env.run();
    assert.equal(passed.status, 0, passed.stderr);
    assert.deepEqual(env.calls(), order);
    assert.match(passed.stdout, /All CI quality gates completed/);
    for (const fail of [order[0], order.at(-1)]) {
      rmSync(env.log);
      const failed = env.run(fail);
      assert.equal(failed.status, 1, failed.stderr);
      assert.deepEqual(env.calls(), order.slice(0, order.indexOf(fail) + 1));
      assert.ok(!failed.stdout.includes('All CI quality gates completed'));
    }
  } finally { env.close(); }
});

test('the actual aggregate CLI runs every gate in order and a failing final step cannot be masked', { timeout: 60000 }, () => {
  const env = aggregateFixture();
  try {
    const passed = env.run();
    assert.equal(passed.status, 0, passed.stderr);
    assert.deepEqual(env.calls(), aggregateOrder);
    assert.match(passed.stdout, /All local quality gates completed/);
    rmSync(env.log);
    const failed = env.run('pnpm typecheck');
    assert.equal(failed.status, 1);
    assert.deepEqual(env.calls(), aggregateOrder);
    assert.ok(!failed.stdout.includes('All local quality gates completed'));
  } finally { env.close(); }
});

test('validates declared exported workspace subpaths and exact pure-core operations', () => {
  const env = boundaryFixture();
  try {
    env.write('apps/web/package.json', { name: '@storymapper/web', dependencies: { '@storymapper/contracts': 'workspace:*' } });
    env.write('packages/contracts/package.json', { name: '@storymapper/contracts', exports: { './public': './dist/public.js' } });
    env.write('apps/web/src/index.ts', fixture('public-entry'));
    assert.deepEqual(checkBoundaries(env.root), []);
    env.write('packages/contracts/package.json', { name: '@storymapper/contracts', exports: { '.': './dist/index.js' } });
    assert.ok(checkBoundaries(env.root).some(({ rule }) => rule === 'workspace-entrypoint'));
    env.write('packages/core/src/index.ts', fixture('core-effects'));
    const purity = checkBoundaries(env.root).filter(({ rule }) => rule === 'core-purity');
    assert.deepEqual(purity.map(({ line }) => line), [1, 2, 3, 4]);
  } finally { env.close(); }
});


test('enforces DB-only imports in root scripts and resolves absolute workspace source escapes', () => {
  const env = boundaryFixture();
  try {
    env.write('scripts/native.mjs', fixture('script-db-only'));
    env.write('packages/core/src/absolute.ts', fixture('absolute-import').replace('WORKSPACE_PATH', join(env.root, 'packages/db/src/index.ts').replaceAll('\\', '/')));
    const diagnostics = checkBoundaries(env.root);
    assert.equal(diagnostics.filter(({ file, rule }) => file === 'scripts/native.mjs' && rule === 'db-only').length, 3);
    assert.ok(diagnostics.some(({ file, rule }) => file === 'packages/core/src/absolute.ts' && rule === 'workspace-source-escape'));
    assert.ok(diagnostics.some(({ file, rule }) => file === 'packages/core/src/absolute.ts' && rule === 'layer-direction'));
  } finally { env.close(); }
});


test('walks authored CSS, HTML and scripts while skipping build output and refusing symlinks', () => {
  const env = temporary();
  try {
    for (const file of ['apps/web/src/a.css', 'apps/web/index.html', 'scripts/b.mjs', 'packages/db/src/c.fixture', 'apps/web/dist/d.css', 'packages/db/coverage/e.json', 'packages/db/node_modules/f.js', 'apps/server/src/application/capability-manifest.json']) env.write(file, 'x');
    assert.deepEqual(authoredFiles(env.root).map((file) => file.slice(env.root.length + 1).replaceAll('\\', '/')), ['apps/web/index.html', 'apps/web/src/a.css', 'packages/db/src/c.fixture', 'scripts/b.mjs']);
    symlinkSync(env.root, join(env.root, 'scripts/link'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => authoredFiles(env.root), /source symlink/);
  } finally { env.close(); }
});

test('refuses a package that has no coverage floor', () => {
  const env = temporary();
  try {
    for (const workspace of logicWorkspaces) env.write(`${workspace}/package.json`, {});
    assert.deepEqual(unlistedWorkspaces(env.root), []);
    env.write('packages/ninth/package.json', {});
    assert.deepEqual(unlistedWorkspaces(env.root), ['packages/ninth']);
  } finally { env.close(); }
});

test('refuses a workspace missing an explicit architecture and coverage classification', () => {
  const env = boundaryFixture();
  try {
    env.write('packages/unclassified/package.json', { name: '@storymapper/unclassified' });
    assert.throws(() => checkBoundaries(env.root), /unclassified workspace/);
    env.write('apps/core/package.json', { name: '@storymapper/core' });
    assert.throws(() => checkBoundaries(env.root), /apps\/core\/package.json/);
  } finally { env.close(); }
});

test('normalizes global effects and refuses every nonliteral dependency with a source location', () => {
  const env = boundaryFixture();
  try {
    env.write('packages/core/src/effects.ts', fixture('global-effects'));
    env.write('apps/server/src/unresolved.ts', fixture('unresolved-imports'));
    const diagnostics = checkBoundaries(env.root);
    assert.deepEqual(diagnostics.filter(({ rule }) => rule === 'core-purity').map(({ line }) => line), Array.from({ length: 12 }, (_, index) => index + 1));
    assert.deepEqual(diagnostics.filter(({ rule }) => rule === 'unresolved-dependency').map(({ file, line }) => [file, line]), [1, 2, 3, 4].map((line) => ['apps/server/src/unresolved.ts', line]));
  } finally { env.close(); }
});

test('checks root declarations, test-only dependencies and denied workspace export values', () => {
  const env = boundaryFixture();
  try {
    env.write('scripts/import.mjs', fixture('public-entry'));
    assert.ok(checkBoundaries(env.root).some(({ rule, file }) => rule === 'undeclared-dependency' && file === 'scripts/import.mjs'));
    env.write('scripts/import.mjs', 'export {};');
    env.write('apps/server/package.json', { name: '@storymapper/server', dependencies: { '@storymapper/db': 'workspace:*' } });
    env.write('apps/server/src/only.test.ts', fixture('test-import'));
    assert.ok(checkBoundaries(env.root).some(({ rule }) => rule === 'test-only-dependency'));
    env.write('apps/server/package.json', { name: '@storymapper/server', dependencies: { vitest: '4.1.12' }, scripts: { test: 'vitest run' }, devDependencies: { '@storymapper/db': 'workspace:*' } });
    assert.ok(checkBoundaries(env.root).some(({ rule }) => rule === 'test-only-dependency'));
    env.write('apps/server/package.json', { name: '@storymapper/server', devDependencies: { '@storymapper/db': 'workspace:*' } });
    assert.deepEqual(checkBoundaries(env.root), []);
    env.write('apps/server/src/index.ts', fixture('test-import'));
    for (const exports of [{ './public': './dist/public.js' }, { '.': null }, { '.': { import: null } }, { '.': { types: './dist/index.d.ts', import: null } }]) {
      env.write('packages/db/package.json', { name: '@storymapper/db', exports });
      assert.ok(checkBoundaries(env.root).some(({ rule }) => rule === 'workspace-entrypoint'));
    }
    env.write('apps/server/src/index.ts', fixture('public-entry'));
    env.write('apps/server/package.json', { name: '@storymapper/server', dependencies: { '@storymapper/contracts': 'workspace:*' }, devDependencies: { '@storymapper/db': 'workspace:*' } });
    env.write('packages/contracts/package.json', { name: '@storymapper/contracts', exports: { './public': null, './*': './dist/*.js' } });
    assert.ok(checkBoundaries(env.root).some(({ rule }) => rule === 'workspace-entrypoint'));
  } finally { env.close(); }
});

test('refuses zero-line executable source and foreign percentage inflation while accepting empty and forwarding modules', () => {
  const env = coverageFixture();
  try {
    const source = join(env.root, 'packages/core/src/uncovered.js');
    const zero = { lines: { total: 0, covered: 0, pct: 100 } };
    env.save({ ...env.report, [source]: zero, [join(env.root, 'packages/core/src/index.ts')]: env.report[source] });
    assert.throws(() => inspectCoverage(env.root, 'packages/core', 1), /zero instrumented lines.*uncovered.js/);
    env.save({ total: { lines: { total: 20, covered: 16, pct: 80 } }, [source]: env.report[source], [join(env.root, 'packages/db/src/index.ts')]: { lines: { total: 10, covered: 10, pct: 100 } } });
    assert.throws(() => inspectCoverage(env.root, 'packages/core', 1), /foreign instrumented source/);
    env.write('packages/core/src/types.ts', 'export interface Input { value: string }');
    env.write('packages/core/src/forward.ts', "export * from './uncovered.js';");
    env.save({ ...env.report, [join(env.root, 'packages/core/src/index.ts')]: zero, [join(env.root, 'packages/core/src/types.ts')]: zero, [join(env.root, 'packages/core/src/forward.ts')]: zero });
    assert.equal(inspectCoverage(env.root, 'packages/core', 1).percent, '60.00');
  } finally { env.close(); }
});

function copyGate(env, script) {
  for (const file of [script, 'scripts/runtime.mjs', 'scripts/processes.mjs', 'scripts/source-inventory.mjs', 'apps/server/src/config/failures.mjs', 'apps/server/src/config/runtime-port.ts']) env.write(file, readFileSync(new URL(`../${file}`, import.meta.url)));
}

function linkTypescript(env) {
  mkdirSync(join(env.root, 'node_modules'), { recursive: true });
  symlinkSync(resolve('node_modules/typescript'), join(env.root, 'node_modules/typescript'), process.platform === 'win32' ? 'junction' : 'dir');
}

test('actual coverage CLI reaches the last workspace and fails its floor after earlier passes', { timeout: 15000 }, () => {
  const env = boundaryFixture();
  try {
    copyGate(env, 'scripts/check-coverage.mjs');
    linkTypescript(env);
    const bin = join(env.root, 'bin');
    const entry = process.platform === 'win32' ? 'bin/node_modules/corepack/dist/corepack.js' : 'bin/corepack';
    env.write(entry, fixture('coverage-corepack'));
    if (process.platform === 'win32') env.write('bin/corepack.cmd', '');
    const child = spawnSync(process.execPath, ['scripts/check-coverage.mjs'], { cwd: env.root, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` }, encoding: 'utf8' });
    assert.equal(child.status, 1, child.stderr);
    assert.deepEqual(readFileSync(join(env.root, 'executed-workspaces.txt'), 'utf8').trim().split('\n'), logicWorkspaces);
    assert.match(child.stderr, /apps\/server: coverage: 50\.00% lines; minimum 60%/);
  } finally { env.close(); }
});

test('actual license CLI rejects an incompatible local installed package with its identity', { timeout: 30000 }, () => {
  const env = boundaryFixture();
  try {
    env.write('local-package/package.json', { name: 'quality-incompatible-local', version: '1.0.0', license: 'GPL-3.0-only' });
    const packed = spawnSync(process.execPath, [corepackEntry(), 'pnpm', '--dir', 'local-package', 'pack', '--pack-destination', env.root], { cwd: env.root, encoding: 'utf8', env: { ...process.env, COREPACK_ENABLE_NETWORK: '0' } });
    assert.equal(packed.status, 0, packed.stderr + packed.stdout);
    env.write('package.json', { name: 'quality-fixture', type: 'module', packageManager: 'pnpm@9.15.4', dependencies: { 'quality-incompatible-local': 'file:./quality-incompatible-local-1.0.0.tgz' } });
    const install = spawnSync(process.execPath, [corepackEntry(), 'pnpm', 'install', '--offline', '--ignore-scripts'], { cwd: env.root, encoding: 'utf8', env: { ...process.env, COREPACK_ENABLE_NETWORK: '0' } });
    assert.equal(install.status, 0, install.stderr + install.stdout);
    copyGate(env, 'scripts/check-licenses.mjs');
    env.write('scripts/license-policy.mjs', readFileSync(new URL('./license-policy.mjs', import.meta.url)));
    linkTypescript(env);
    const child = spawnSync(process.execPath, ['scripts/check-licenses.mjs'], { cwd: env.root, encoding: 'utf8', env: { ...process.env, COREPACK_ENABLE_NETWORK: '0' } });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /quality-incompatible-local@1\.0\.0: licenses: missing, unknown or incompatible installed license/);
  } finally { env.close(); }
});
