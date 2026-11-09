import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { commandMain } from './processes.mjs';
import { runtime } from './runtime.mjs';
import { authoredFiles, parseSource, repositoryRoot } from './source-inventory.mjs';

export const logicWorkspaces = ['packages/contracts', 'packages/importers', 'packages/github', 'packages/core', 'packages/db', 'packages/mcp', 'apps/web', 'apps/server'];
const excluded = /(?:\.test\.|\.spec\.|\.d\.(?:ts|mts|cts)$|\/fixtures\/|\/test-fixtures\/|-test-fixture\.)/;

function executableSource(path) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, removeComments: true } }).outputText;
  return parseSource(path, output).statements.some((node) => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node) && !ts.isEmptyStatement(node));
}

function validLineEvidence(lines) {
  return lines && Number.isSafeInteger(lines.total) && lines.total >= 0 && Number.isSafeInteger(lines.covered) && lines.covered >= 0 && lines.covered <= lines.total && Number.isFinite(lines.pct) && lines.pct >= 0 && lines.pct <= 100;
}

export function inspectCoverage(root, workspace, startedAt) {
  const directory = join(root, workspace);
  const path = join(directory, 'coverage/coverage-summary.json');
  if (!existsSync(path) || statSync(path).mtimeMs < startedAt) throw new Error(`${workspace}: coverage: missing or stale report.`);
  const report = JSON.parse(readFileSync(path, 'utf8'));
  const lines = report.total?.lines;
  if (!validLineEvidence(lines) || lines.total === 0) throw new Error(`${workspace}: coverage: empty or invalid line evidence.`);
  const files = Object.entries(report).filter(([key]) => key !== 'total');
  if (files.some(([, value]) => !validLineEvidence(value?.lines))) throw new Error(`${workspace}: coverage: invalid instrumented file evidence.`);
  if (files.reduce((total, [, value]) => total + value.lines.total, 0) !== lines.total || files.reduce((covered, [, value]) => covered + value.lines.covered, 0) !== lines.covered) throw new Error(`${workspace}: coverage: inconsistent aggregate line evidence.`);
  const percent = 100 * lines.covered / lines.total;
  if (percent < 60 || Math.abs(percent - lines.pct) > 0.02) throw new Error(`${workspace}: coverage: ${percent.toFixed(2)}% lines; minimum 60%.`);
  const intended = authoredFiles(root).filter((file) => file.startsWith(join(directory, 'src') + sep) && /\.[cm]?[jt]sx?$/.test(file) && !excluded.test(`/${relative(root, file).replaceAll('\\', '/')}`));
  const reported = new Map(files.map(([key, value]) => [resolve(key), value.lines]));
  const foreign = [...reported.keys()].filter((file) => !intended.includes(file));
  if (foreign.length) throw new Error(`${workspace}: coverage: foreign instrumented source: ${foreign.map((file) => relative(root, file)).join(', ')}.`);
  const executable = intended.filter(executableSource);
  const missing = executable.filter((file) => !reported.has(file));
  if (missing.length) throw new Error(`${workspace}: coverage: absent instrumented source: ${missing.map((file) => relative(root, file)).join(', ')}.`);
  const empty = executable.filter((file) => reported.get(file).total === 0);
  if (empty.length) throw new Error(`${workspace}: coverage: zero instrumented lines for executable source: ${empty.map((file) => relative(root, file)).join(', ')}.`);
  return { workspace, lines: lines.total, covered: lines.covered, percent: percent.toFixed(2) };
}

export function unlistedWorkspaces(root) {
  return ['apps', 'packages'].flatMap((parent) => readdirSync(join(root, parent), { withFileTypes: true }).map((entry) => `${parent}/${entry.name}`)).filter((workspace) => existsSync(join(root, workspace, 'package.json')) && !logicWorkspaces.includes(workspace));
}

export async function checkCoverage(signal, root = repositoryRoot) {
  const unlisted = unlistedWorkspaces(root);
  if (unlisted.length) throw new Error(`coverage: workspace without a coverage floor: ${unlisted.join(', ')}.`);
  const { pnpm } = await runtime(signal);
  const results = [];
  for (const workspace of logicWorkspaces) {
    rmSync(join(root, workspace, 'coverage'), { recursive: true, force: true });
    const startedAt = Date.now();
    const name = JSON.parse(readFileSync(join(root, workspace, 'package.json'), 'utf8')).name;
    await pnpm(['--filter', name, 'test:coverage']);
    results.push(inspectCoverage(root, workspace, startedAt));
  }
  for (const result of results) console.log(`${result.workspace}: coverage: ${result.percent}% lines (${result.covered}/${result.lines}).`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.env.COREPACK_ENABLE_NETWORK = '0';
  await commandMain(checkCoverage, { interruptExitCode: 1 });
}
