import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { authoredFiles, parseSource, printDiagnostics, repositoryRoot, sourceDiagnostic } from './source-inventory.mjs';

export function physicalLines(source) {
  return source.length ? source.split(/\r\n|\n|\r/).length - Number(/[\r\n]$/.test(source)) : 0;
}

export function inspectSize(source, file, root = repositoryRoot) {
  const diagnostics = [];
  const report = (line, rule, message) => diagnostics.push(sourceDiagnostic(root, file, line, rule, message));
  const lines = physicalLines(source);
  const bytes = Buffer.byteLength(source, 'utf8');
  if (lines > 750) report(1, 'file-lines', `${lines} physical lines exceeds 750.`);
  if (bytes > 100000) report(1, 'file-bytes', `${bytes} UTF-8 bytes exceeds 100000.`);
  if (!/\.[cm]?[jt]sx?$/.test(file) || file.endsWith('.d.ts')) return diagnostics;
  const parsed = parseSource(file, source);
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      const start = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
      const end = parsed.getLineAndCharacterOfPosition(node.end - 1).line + 1;
      if (end - start + 1 > 50) report(start, 'function-lines', `${end - start + 1} physical lines exceeds 50.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return diagnostics;
}

export function checkSize(root = repositoryRoot) {
  return authoredFiles(root).flatMap((file) => inspectSize(readFileSync(file, 'utf8'), file, root));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) printDiagnostics(checkSize());
