import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { classifyCapabilityOperations, excludedOperationFamilies } from "./capability-operation-coverage.mjs";

export const applicationDirectory = "apps/server/src/application";
const descriptorFields = new Set(["name", "kind", "route", "tool"]);
const capabilityKinds = new Set(["read", "write", "human-only"]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  }).sort();
}

function parseSource(source, file) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(parsed.parseDiagnostics[0].messageText, " ")}`);
  return parsed;
}

function isExported(statement) {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function unwrap(expression) {
  while (expression && (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression))) expression = expression.expression;
  return expression;
}

function readDescriptor(declaration, file) {
  const initializer = unwrap(declaration.initializer);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new Error(`${file}: ${declaration.name.text} must be a static descriptor object.`);
  const descriptor = { file, export: declaration.name.text };
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) throw new Error(`${file}: descriptor spreads, shorthand and computed properties are not allowed.`);
    const key = property.name.text;
    const value = unwrap(property.initializer);
    if (!descriptorFields.has(key) || Object.hasOwn(descriptor, key) || !(ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) throw new Error(`${file}: descriptor ${key} must be a unique literal field.`);
    descriptor[key] = value.text;
  }
  if (!descriptor.name || !capabilityKinds.has(descriptor.kind)) throw new Error(`${file}: descriptor name and kind are required.`);
  if ((descriptor.kind === "write" || descriptor.kind === "read" && !descriptor.route?.startsWith("GET ")) && !descriptor.tool) throw new Error(`${file}: ${descriptor.name} requires an MCP tool.`);
  if (descriptor.kind === "human-only" && descriptor.tool) throw new Error(`${file}: human-only capability ${descriptor.name} cannot expose an MCP tool.`);
  return descriptor;
}

export function scanCapabilitySource(source, file) {
  const capabilities = [];
  const functions = new Set();
  for (const statement of parseSource(source, file).statements) {
    if (!isExported(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) functions.add(statement.name.text);
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (declaration.name.text.endsWith("Descriptor")) capabilities.push(readDescriptor(declaration, file));
      const value = unwrap(declaration.initializer);
      if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) functions.add(declaration.name.text);
    }
  }
  if (file.endsWith(".use-cases.ts")) {
    for (const name of functions) if (!capabilities.some((capability) => capability.name === name)) throw new Error(`${file}: exported use case ${name} has no descriptor.`);
    for (const capability of capabilities) if (!functions.has(capability.name)) throw new Error(`${file}: descriptor ${capability.export} has no exported use case ${capability.name}.`);
  }
  return capabilities;
}

function rejectDuplicates(capabilities, field) {
  const seen = new Set();
  for (const capability of capabilities) {
    const value = capability[field];
    if (value === undefined) continue;
    if (seen.has(value)) throw new Error(`Duplicate capability ${field}: ${value}`);
    seen.add(value);
  }
}

export function scanCapabilities(root) {
  const capabilities = sourceFiles(join(root, applicationDirectory)).flatMap((file) => scanCapabilitySource(readFileSync(file, "utf8"), relative(root, file).replaceAll("\\", "/")));
  for (const field of ["name", "route", "tool"]) rejectDuplicates(capabilities, field);
  capabilities.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  return { capabilities, operationCoverage: classifyCapabilityOperations(capabilities), excludedOperationFamilies };
}

function importedDescriptors(source) {
  const imports = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const module = statement.moduleSpecifier.text;
    for (const binding of bindings.elements) {
      if (binding.isTypeOnly) continue;
      const original = (binding.propertyName ?? binding.name).text;
      if (!original.endsWith("Descriptor")) continue;
      if (!module.startsWith("@storymapper/server/application/")) throw new Error(`Registry descriptor must import an application use case: ${module}`);
      imports.set(binding.name.text, `apps/server/src/${module.slice("@storymapper/server/".length)}.ts\0${original}`);
    }
  }
  return imports;
}

export function checkDescriptorRegistry(root, capabilities) {
  const file = join(root, applicationDirectory, "descriptors.ts");
  const source = parseSource(readFileSync(file, "utf8"), file);
  const imports = importedDescriptors(source);
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap((statement) => [...statement.declarationList.declarations]);
  const registry = declarations.find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "applicationCapabilityDescriptors");
  const initializer = unwrap(registry?.initializer);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error("Capability registry must be an explicit array of imported descriptors.");
  const actual = initializer.elements.map((element) => {
    if (!ts.isIdentifier(element) || !imports.has(element.text)) throw new Error("Capability registry contains an unknown descriptor.");
    return imports.get(element.text);
  });
  const expected = capabilities.map((capability) => `${capability.file}\0${capability.export}`).sort();
  if (new Set(actual).size !== actual.length || JSON.stringify(actual.sort()) !== JSON.stringify(expected)) throw new Error("Capability registry and exported descriptors differ (missing, extra or duplicate entry).");
}

export function serializeCapabilities(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
