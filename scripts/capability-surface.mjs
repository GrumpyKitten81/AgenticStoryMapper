import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { capabilityOperationMembers } from "./capability-operation-coverage.mjs";

const infrastructureRoutes = new Set(["GET /health", "GET /api/health", "GET /api/credentials/status", "GET /api/mcp/tools", "GET /api/mcp/host-configs", "POST /api/mcp/call"]);

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

function collect(file, select) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const values = [];
  function visit(node) {
    const value = select(node);
    if (value !== undefined) values.push(value);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return values;
}

function assertParity(actual, expected, label) {
  if (new Set(actual).size !== actual.length || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} and capability descriptors differ (missing, extra or duplicate entry): missing ${expected.filter((value) => !actual.includes(value)).join(", ")}; extra ${actual.filter((value) => !expected.includes(value)).join(", ")}.`);
}

export function checkToolSurface(root, capabilities) {
  const expectedTools = capabilities.flatMap(({ tool }) => tool ? [tool] : []);
  const registrations = sources(join(root, "apps/server/src/mcp/tools")).flatMap((file) => collect(file, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["registerTool", "registerApplicationTool"].includes(node.expression.text) && ts.isStringLiteral(node.arguments[1])) {
      rejectHandlerRepositoryWrites(node.arguments[2], file);
      return node.arguments[1].text;
    }
  }));
  assertParity(registrations, expectedTools, "Registered MCP tools");
  const definitions = collect(join(root, "packages/mcp/src/tool-definitions/capabilities.ts"), (node) => {
    if (ts.isPropertyAssignment(node) && node.name.text === "name" && ts.isStringLiteral(node.initializer)) return node.initializer.text;
  });
  assertParity(definitions, expectedTools, "MCP tool definitions");
  const names = collect(join(root, "packages/contracts/src/mcp/tools.ts"), (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === "mcpToolNameSchema") return node.initializer.arguments[0].elements.map((element) => element.text);
  }).flat();
  assertParity(names, expectedTools, "MCP tool name contract");
  const commandTools = collect(join(root, "packages/contracts/src/mcp/tools.ts"), (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === "changeSetCommandToolNames") return node.initializer.arguments[0].elements.map((element) => element.text);
  }).flat();
  const expectedCommands = capabilities.filter(({ name, tool }) => tool && (name === "submitChangeSet" || capabilityOperationMembers[name] && !name.startsWith("propose"))).map(({ tool }) => tool);
  assertParity(commandTools, expectedCommands, "ChangeSet command tool routing");
  const schemas = collect(join(root, "packages/contracts/src/mcp/tool-inputs.ts"), (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === "mcpToolInputSchemas") {
      let initializer = node.initializer;
      while (ts.isSatisfiesExpression(initializer)) initializer = initializer.expression;
      return initializer.properties.map((property) => property.name.getText());
    }
  }).flat();
  assertParity(schemas, expectedTools, "MCP input schemas");
  const routes = sources(join(root, "apps/server/src/http/routes")).flatMap((file) => routeMappings(file, capabilities)).filter((route) => !infrastructureRoutes.has(route));
  assertParity(routes, capabilities.flatMap(({ route }) => route ? [route] : []), "Domain HTTP routes");
}

function routeMappings(file, capabilities) {
  const imports = new Map();
  return collect(file, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { module: node.moduleSpecifier.text });
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) imports.set(binding.name.text, { module: node.moduleSpecifier.text, export: (binding.propertyName ?? binding.name).text });
    }
    if (!ts.isCallExpression(node)) return;
    if (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText() === "server" && ["get", "post", "patch", "delete", "put"].includes(node.expression.name.text) && ts.isStringLiteral(node.arguments[0])) return `${node.expression.name.text.toUpperCase()} ${node.arguments[0].text}`;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "registerApplicationRoute") return;
    const descriptor = node.arguments[1];
    const binding = ts.isPropertyAccessExpression(descriptor) ? imports.get(descriptor.expression.getText()) : ts.isIdentifier(descriptor) ? imports.get(descriptor.text) : undefined;
    const exportName = ts.isPropertyAccessExpression(descriptor) ? descriptor.name.text : binding?.export;
    const source = binding?.module.replace("@storymapper/server/", "apps/server/src/") + ".ts";
    const capability = capabilities.find((candidate) => candidate.file === source && candidate.export === exportName);
    if (!capability?.route) throw new Error("Route has no capability descriptor.");
    return capability.route;
  });
}

function rejectHandlerRepositoryWrites(handler, file) {
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const owner = node.expression.expression.getText();
      const method = node.expression.name.text;
      if ((owner === "repository" || owner.endsWith(".repository")) && /^(create|update|delete|set|unset|apply|import|archive|unarchive|park|unpark|move|upsert|bulk)/.test(method)) throw new Error(`${file}: MCP handler repository write bypass: ${method}.`);
    }
    ts.forEachChild(node, visit);
  }
  visit(handler);
}
