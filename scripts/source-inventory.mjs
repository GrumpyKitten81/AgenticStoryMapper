import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const sourceRoots = ['apps', 'packages', 'scripts'];
const generatedDirectory = /^(?:apps|packages)\/[^/]+\/(?:dist|coverage|\.vite)$/;
export const generatedFiles = new Set(['apps/server/src/application/capability-manifest.json', 'packages/db/migrations/meta/0000_snapshot.json', 'packages/db/migrations/meta/0001_snapshot.json', 'packages/db/src/test-fixtures/migrations/meta/0002_snapshot.json']);
const authoredExtensions = /\.(?:[cm]?[jt]sx?|css|s[ac]ss|html|py|json|sql|sh|ps1|svg|xml|yaml|yml|md|txt|fixture)$/;

export function authoredFiles(root = repositoryRoot) {
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === 'node_modules' || generatedDirectory.test(relative(root, path).replaceAll('\\', '/'))) return [];
    if (entry.isSymbolicLink()) throw new Error(`${relative(root, path)}: source symlink is not supported.`);
    if (entry.isDirectory()) return walk(path);
    return authoredExtensions.test(entry.name) && !generatedFiles.has(relative(root, path).replaceAll('\\', '/')) ? [path] : [];
  });
  return sourceRoots.flatMap((directory) => walk(join(root, directory))).sort();
}

export function parseSource(file, source = readFileSync(file, 'utf8')) {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  if (parsed.parseDiagnostics.length) throw new Error(`${file}:${parsed.getLineAndCharacterOfPosition(parsed.parseDiagnostics[0].start).line + 1}: source parse failure.`);
  return parsed;
}

export function sourceDiagnostic(root, file, line, rule, message, workspace) {
  const path = relative(root, file).replaceAll('\\', '/');
  const owner = path.match(/^(?:apps|packages)\/([^/]+)\//)?.[1];
  return { file: path, line, package: workspace ?? (owner ? `@storymapper/${owner}` : 'repository'), rule, message };
}

export function printDiagnostics(diagnostics) {
  for (const item of diagnostics) console.error(`${item.file}:${item.line}: [${item.package}] ${item.rule}: ${item.message}`);
  process.exitCode = diagnostics.length ? 1 : 0;
}
