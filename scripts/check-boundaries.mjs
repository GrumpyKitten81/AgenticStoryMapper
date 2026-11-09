import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { authoredFiles, parseSource, printDiagnostics, repositoryRoot, sourceDiagnostic } from './source-inventory.mjs';

const layers = { web: ['contracts', 'core'], server: ['contracts', 'core', 'db', 'github', 'importers', 'mcp'], core: ['contracts'], db: ['contracts', 'core'], github: ['contracts'], importers: ['contracts'], mcp: ['contracts'], contracts: [] };
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const packageName = (specifier) => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
const isTest = (file, root) => /(?:\.test\.|\.spec\.|\/test-fixtures\/|\/fixtures\/)/.test(`/${relative(root, file).replaceAll('\\', '/')}`);
const testTools = new Set(['vitest', '@vitest/coverage-v8']);

function isImportMetaResolve(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== 'resolve') return false;
  const specifier = node.arguments[0];
  if (!specifier || !ts.isStringLiteral(specifier) && !ts.isNoSubstitutionTemplateLiteral(specifier)) return false;
  const receiver = expression.expression;
  return ts.isMetaProperty(receiver) && receiver.keywordToken === ts.SyntaxKind.ImportKeyword && receiver.name.text === 'meta';
}

function importConditions(node) {
  const typeOnly = Boolean(ts.isImportTypeNode(node) || node.importClause?.isTypeOnly || node.isTypeOnly);
  const mode = typeOnly ? node.attributes?.elements.find((entry) => entry.name.text === 'resolution-mode')?.value.text : undefined;
  const requireMode = mode === 'require' || mode !== 'import' && (ts.isImportEqualsDeclaration(node) || ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' || typeOnly && node.getSourceFile().fileName.endsWith('.cts'));
  return { condition: requireMode ? 'require' : 'import', ...(typeOnly ? { typeOnly: true } : {}) };
}

export function sourceImports(parsed) {
  const imports = [];
  const add = (node, value) => { imports.push({ ...importConditions(node), specifier: value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : undefined, line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1 }); };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) add(node, node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node, node.moduleReference.expression);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require' || isImportMetaResolve(node))) add(node, node.arguments[0]);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node, node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return imports;
}

function workspaces(root) {
  for (const parent of ['apps', 'packages']) for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(root, parent, entry.name, 'package.json'))) continue;
    if (!Object.hasOwn(layers, entry.name) || parent !== (['web', 'server'].includes(entry.name) ? 'apps' : 'packages')) throw new Error(`${parent}/${entry.name}/package.json: boundaries: unclassified workspace.`);
  }
  return Object.keys(layers).map((name) => {
    const directory = join(root, ['web', 'server'].includes(name) ? 'apps' : 'packages', name);
    const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (metadata.name !== `@storymapper/${name}`) throw new Error(`${relative(root, directory)}/package.json: boundaries: invalid workspace identity.`);
    return { name, directory, metadata, used: new Set(), productionUsed: new Set() };
  });
}

function workspaceFor(file, spaces) {
  return spaces.find(({ directory }) => file.startsWith(`${directory}${sep}`));
}

function aliasTarget(specifier, root) {
  if (specifier === '@storymapper/ui-strings') return join(root, 'apps/web/src/ui-strings/index.ts');
  const match = specifier.match(/^@storymapper\/([^/]+)(?:\/(.*))?$/);
  if (!match || !Object.hasOwn(layers, match[1])) return undefined;
  return join(root, ['web', 'server'].includes(match[1]) ? 'apps' : 'packages', match[1], 'src', match[2] ?? 'index.ts');
}

function exportedValue(value, item) {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) {
    let result = value.length ? undefined : false;
    for (const entry of value) {
      const selected = exportedValue(entry, item);
      if (selected === true) return true;
      if (selected === false) result = false;
    }
    return result;
  }
  if (value === null || typeof value !== 'object') return false;
  for (const key of Object.keys(value)) {
    if (!['node', 'default', item.condition, ...(item.typeOnly ? ['types'] : [])].includes(key)) continue;
    const result = exportedValue(value[key], item);
    if (result !== undefined) return result;
  }
  return undefined;
}

function publicSubpath(specifier, target, item) {
  const subpath = specifier.slice(target.metadata.name.length);
  const exports = target.metadata.exports;
  if (exports === undefined) return !subpath && Boolean(target.metadata.main || target.metadata.module || target.metadata.types);
  if (typeof exports === 'string' || exports === null || Array.isArray(exports)) return !subpath && exportedValue(exports, item);
  if (!Object.keys(exports).some((key) => key.startsWith('.'))) return !subpath && exportedValue(exports, item);
  const selected = `.${subpath}`;
  if (Object.hasOwn(exports, selected)) return exportedValue(exports[selected], item);
  const key = Object.keys(exports).filter((key) => key.includes('*') && selected.startsWith(key.split('*')[0]) && selected.endsWith(key.split('*')[1])).sort((a, b) => b.length - a.length)[0];
  return key !== undefined && exportedValue(exports[key], item);
}

function checkFeature(file, target, report) {
  const sourceFeature = file.replaceAll('\\', '/').match(/\/apps\/web\/src\/features\/([^/]+)\//)?.[1];
  const destination = target?.replaceAll('\\', '/').match(/\/apps\/web\/src\/features\/([^/]+)\/(.*)$/);
  if (sourceFeature && destination && sourceFeature !== destination[1] && !/^index(?:\.[cm]?[jt]sx?)?$/.test(destination[2])) report('feature-entrypoint', 'Cross-feature imports require the feature index.');
}

function globalAccess(node) {
  if (ts.isParenthesizedExpression(node)) return globalAccess(node.expression);
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    const base = globalAccess(node.expression);
    return base.length ? [...base, node.name.text] : [];
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression && (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))) {
    const base = globalAccess(node.expression);
    return base.length ? [...base, node.argumentExpression.text] : [];
  }
  return [];
}

function checkPurity(parsed, report) {
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const access = globalAccess(node.expression);
      if (['globalThis', 'global', 'window', 'self'].includes(access[0])) access.shift();
      if (['Date', 'crypto', 'fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'WebTransport'].includes(access[0]) || access[0] === 'Math' && access[1] === 'random' || access[0] === 'navigator' && access[1] === 'sendBeacon') report('core-purity', 'Inject time, random and network sources.', parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}

function inspectImport(item, file, owner, spaces, root, options, report) {
  const { specifier } = item;
  if (specifier === undefined) { report('unresolved-dependency', 'Dependency specifier must be a literal.'); return; }
  const targetPath = specifier.startsWith('file:') ? fileURLToPath(specifier) : isAbsolute(specifier) ? resolve(specifier) : specifier.startsWith('.') ? resolve(dirname(file), specifier) : aliasTarget(specifier, root) ?? ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule?.resolvedFileName;
  const target = targetPath && workspaceFor(targetPath, spaces);
  checkFeature(file, targetPath, report);
  if (owner.name !== 'repository' && target && target !== owner && !specifier.startsWith('@storymapper/')) report('workspace-source-escape', 'Use the declared workspace public entry.');
  const dependency = packageName(specifier);
  if (!specifier.startsWith('.') && !specifier.startsWith('/') && !builtins.has(specifier) && !(target === owner)) {
    owner.used.add(dependency);
    if (!isTest(file, root) && (owner.name === 'repository' || file.startsWith(join(owner.directory, 'src') + sep))) owner.productionUsed.add(dependency);
    if (!Object.hasOwn({ ...owner.metadata.dependencies, ...owner.metadata.devDependencies }, dependency)) report('undeclared-dependency', `Declare ${dependency}.`);
  }
  if (builtins.has(specifier)) owner.used.add('node');
  if (!isTest(file, root) && owner.name !== 'db' && ['better-sqlite3', 'drizzle-orm', 'node:sqlite', 'sqlite'].includes(dependency)) report('db-only', `${dependency} belongs in packages/db.`);
  if (owner.name === 'repository' || isTest(file, root) || !file.startsWith(join(owner.directory, 'src') + sep)) return;
  if (target && target !== owner && !layers[owner.name].includes(target.name)) report('layer-direction', `${owner.name} cannot import ${target.name}.`);
  if (target && target !== owner && !specifier.startsWith('.') && !publicSubpath(specifier, target, item)) report('workspace-entrypoint', `${specifier} is not an exported public subpath.`);
  if (owner.name === 'core' && builtins.has(specifier)) report('core-purity', 'Core cannot import Node builtins.');
}

function checkUnused(owner, root, diagnostics) {
  const declared = { ...owner.metadata.dependencies, ...owner.metadata.devDependencies };
  const scripts = Object.values(owner.metadata.scripts ?? {}).join(' ');
  const requiredPeers = { '@tiptap/core': '@tiptap/react', '@tiptap/pm': '@tiptap/react' };
  const peerUsed = (name) => requiredPeers[name] && owner.used.has(requiredPeers[name]) && Object.hasOwn(JSON.parse(readFileSync(join(owner.directory, 'node_modules', requiredPeers[name], 'package.json'), 'utf8')).peerDependencies ?? {}, name);
  const environmentUsed = (name) => name === 'jsdom' && authoredFiles(root).filter((file) => file.startsWith(owner.directory) && /\.[cm]?[jt]sx?$/.test(file)).some((file) => /@vitest-environment jsdom/.test(readFileSync(file, 'utf8')));
  const toolUsed = (name) => peerUsed(name) || environmentUsed(name) || testTools.has(name) && (/\bvitest\b/.test(scripts) || name === '@vitest/coverage-v8' && owner.name === 'repository' && owner.metadata.scripts?.['test:coverage'] === 'node scripts/check-coverage.mjs') || name === 'typescript' && /\btsc\b/.test(scripts) || name === 'drizzle-kit' && /\bdrizzle-kit\b/.test(scripts) || name === 'tsx' && /\btsx\b/.test(scripts) || name === 'vite' && /\bvite\b/.test(scripts) || name.startsWith('@types/') && owner.used.has(name.slice(7)) || name === '@types/node' && owner.used.has('node');
  const productionToolUsed = (name) => peerUsed(name) && owner.productionUsed.has(requiredPeers[name]) || name === 'tsx' && /\btsx\b/.test(owner.metadata.scripts?.start ?? '');
  for (const name of Object.keys(declared)) {
    const report = (rule, message) => diagnostics.push(sourceDiagnostic(root, join(owner.directory, 'package.json'), 1, rule, message, owner.metadata.name));
    if (!owner.used.has(name) && !toolUsed(name)) report('unused-dependency', `${name} has no source or tool use.`);
    else if (Object.hasOwn(owner.metadata.dependencies ?? {}, name) && !owner.productionUsed.has(name) && !productionToolUsed(name)) report('test-only-dependency', `${name} has only test/tool use and belongs in devDependencies.`);
  }
}

export function checkBoundaries(root = repositoryRoot) {
  const diagnostics = [];
  const spaces = workspaces(root);
  const repository = { name: 'repository', directory: root, metadata: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), used: new Set(), productionUsed: new Set() };
  const config = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile);
  if (config.error) throw new Error('boundaries: missing or invalid TypeScript alias configuration.');
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  for (const file of authoredFiles(root).filter((path) => /\.[cm]?[jt]sx?$/.test(path) && !path.endsWith('.d.ts'))) {
    const owner = workspaceFor(file, spaces) ?? repository;
    const parsed = parseSource(file);
    for (const item of sourceImports(parsed)) inspectImport(item, file, owner, spaces, root, options, (rule, message) => diagnostics.push(sourceDiagnostic(root, file, item.line, rule, message, owner?.metadata.name)));
    if (owner?.name === 'core' && !isTest(file, root)) checkPurity(parsed, (rule, message, line) => diagnostics.push(sourceDiagnostic(root, file, line, rule, message, owner.metadata.name)));
  }
  for (const owner of [...spaces, repository]) checkUnused(owner, root, diagnostics);
  return diagnostics;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) printDiagnostics(checkBoundaries());
