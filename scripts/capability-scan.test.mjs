import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { applicationDirectory, scanCapabilities, scanCapabilitySource, serializeCapabilities } from "./capability-scan.mjs";
import { checkCapabilities } from "./check-capabilities.mjs";
import { capabilityArtifactPaths, serializeToolDefinitions, serializeToolDocumentation } from "./capability-artifacts.mjs";

import { checkToolSurface } from "./capability-surface.mjs";
import { classifyCapabilityOperations } from "./capability-operation-coverage.mjs";

const file = `${applicationDirectory}/sample/sample.use-cases.ts`;
const source = `export function listSample(actor: ActorContext) { return []; }
export const listSampleDescriptor: CapabilityDescriptor = {
  name: "listSample", kind: "read", route: "GET /api/sample", tool: "ListSample"
};`;
const registry = `import type { CapabilityDescriptor } from "@storymapper/contracts";
import { listSampleDescriptor } from "@storymapper/server/application/sample/sample.use-cases";
export const applicationCapabilityDescriptors = [listSampleDescriptor];`;

function fixture(callback) {
  const root = mkdtempSync(join(tmpdir(), "storymapper-capabilities-"));
  try {
    mkdirSync(join(root, applicationDirectory, "sample"), { recursive: true });
    writeFileSync(join(root, file), source);
    writeFileSync(join(root, applicationDirectory, "descriptors.ts"), registry);
    mkdirSync(join(root, "packages/mcp/src/tool-definitions"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    const metadata = [{ name: "ListSample", description: "Lists sample records for a project.", permission: "read" }];
    writeFileSync(join(root, "scripts/mcp-tool-metadata.json"), JSON.stringify(metadata, null, 2));
    const surfaces = {"apps/server/src/mcp/tools/sample.ts":"registerTool(deps, \"ListSample\", {});","apps/server/src/http/routes/sample.ts":"server.get(\"/api/sample\", handler);","packages/contracts/src/mcp/tools.ts":"export const mcpToolNameSchema = z.enum([\"ListSample\"]);","packages/contracts/src/mcp/tool-inputs.ts":"export const mcpToolInputSchemas = { ListSample: z.object({}) };"};
    for (const [path, content] of Object.entries(surfaces)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    mkdirSync(join(root, "docs"));
    const manifest = scanCapabilities(root);
    writeFileSync(join(root, capabilityArtifactPaths.tools), serializeToolDefinitions(manifest, metadata));
    writeFileSync(join(root, capabilityArtifactPaths.documentation), serializeToolDocumentation(manifest, metadata));
    callback(root, join(root, applicationDirectory, "capability-manifest.json"), metadata);
  } finally {
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}`));
    rmSync(root, { recursive: true, force: true });
  }
}

test("scans TypeScript syntax without executing descriptor initializers", () => {
  const formatted = source.replace('name: "listSample"', '/* braces } { do not change syntax */ name: `listSample`');
  assert.deepEqual(scanCapabilitySource(formatted, file), [{ file, export: "listSampleDescriptor", name: "listSample", kind: "read", route: "GET /api/sample", tool: "ListSample" }]);
  globalThis.capabilityScanExecuted = false;
  const executable = source.replace('kind: "read"', 'kind: (() => { globalThis.capabilityScanExecuted = true; return "read"; })()');
  try {
    assert.throws(() => scanCapabilitySource(executable, file), /unique literal field/);
    assert.equal(globalThis.capabilityScanExecuted, false);
  } finally {
    delete globalThis.capabilityScanExecuted;
  }
});

test("rejects missing and wrongly named use-case mappings in both directions", () => {
  assert.throws(() => scanCapabilitySource('export function uncovered() {}', file), /uncovered has no descriptor/);
  assert.throws(() => scanCapabilitySource(source.replace('listSample(actor', 'other(actor'), file), /other has no descriptor/);
  assert.throws(() => scanCapabilitySource(source.slice(source.indexOf('export const')), file), /has no exported use case/);
  assert.throws(() => scanCapabilitySource(source.replace('kind: "read"', 'kind: "invalid"'), file), /name and kind/);
});

test("permits ordinary HTTP reads and requires effectful capabilities to have tools", () => {
  const httpRead = source.replace(', tool: "ListSample"', "");
  assert.equal(scanCapabilitySource(httpRead, file)[0].tool, undefined);
  assert.throws(() => scanCapabilitySource(httpRead.replace('route: "GET /api/sample"', 'route: "POST /api/sample"'), file), /requires an MCP tool/);
  for (const kind of ["write"]) {
    const unmapped = source.replace('kind: "read"', `kind: "${kind}"`).replace(', tool: "ListSample"', "");
    assert.throws(() => scanCapabilitySource(unmapped, file), /requires an MCP tool/);
  }
  assert.throws(() => scanCapabilitySource(source.replace('kind: "read"', 'kind: "human-only"'), file), /human-only capability.*cannot expose/);
  assert.equal(scanCapabilitySource(source.replace('kind: "read"', 'kind: "human-only"').replace(', tool: "ListSample"', ""), file)[0].tool, undefined);
});

test("manifest output is deterministic and checking never rewrites stale data", () => fixture((root, path) => {
  const first = serializeCapabilities(scanCapabilities(root));
  assert.equal(first, serializeCapabilities(scanCapabilities(root)));
  assert.ok(!first.includes("generatedAt"));
  writeFileSync(path, first);
  assert.equal(checkCapabilities(root), 1);
  assert.equal(readFileSync(path, "utf8"), first);
  const stale = first.replace('"kind": "read"', '"kind": "write"');
  writeFileSync(path, stale);
  assert.throws(() => checkCapabilities(root), /manifest is stale/);
  assert.equal(readFileSync(path, "utf8"), stale);
}));

test("generated tool metadata and documentation are deterministic and checked without rewriting", () => fixture((root, path, metadata) => {
  const manifest = scanCapabilities(root);
  writeFileSync(path, serializeCapabilities(manifest));
  for (const [artifact, serialize] of [[capabilityArtifactPaths.tools, serializeToolDefinitions], [capabilityArtifactPaths.documentation, serializeToolDocumentation]]) {
    const target = join(root, artifact);
    const expected = serialize(manifest, metadata);
    assert.equal(expected, serialize(scanCapabilities(root), metadata));
    assert.ok(expected.includes("ListSample"));
    writeFileSync(target, `${expected}stale\n`);
    assert.throws(() => checkCapabilities(root), /Generated capability artifact is stale/);
    assert.equal(readFileSync(target, "utf8"), `${expected}stale\n`);
    writeFileSync(target, expected);
  }
  assert.equal(checkCapabilities(root), 1);
}));

test("documentation names human-only capabilities and every classified write membership", () => {
  const manifest = { capabilities: [
    { name: "listSample", kind: "read", tool: "ListSample" },
    { name: "createSample", kind: "write", tool: "CreateSample" },
    { name: "approveSample", kind: "human-only", route: "POST /api/sample/approve" }
  ], operationCoverage: [{ name: "createSample", operations: ["create:sample"], exceptions: [] }, { name: "approveSample", operations: [], exceptions: ["changeset-lifecycle"] }] };
  const metadata = [{ name: "ListSample", description: "Lists sample records for a project.", permission: "read" }, { name: "CreateSample", description: "Creates a sample record.", permission: "write" }];
  const docs = serializeToolDocumentation(manifest, metadata);
  assert.match(docs, /\| `approveSample` \| `POST \/api\/sample\/approve` \|/);
  assert.match(docs, /\| `createSample` \| `create:sample` \| — \|/);
  assert.match(docs, /Story 4\.7/);
  assert.ok(!serializeToolDefinitions(manifest, metadata).includes("approveSample"));
});

test("registry parity rejects omitted, duplicate and incorrectly imported descriptors", () => fixture((root, path) => {
  writeFileSync(path, serializeCapabilities(scanCapabilities(root)));
  const registryPath = join(root, applicationDirectory, "descriptors.ts");
  for (const broken of [registry.replace('[listSampleDescriptor]', '[]'), registry.replace('[listSampleDescriptor]', '[listSampleDescriptor, listSampleDescriptor]'), registry.replace('/sample/sample.use-cases', '/wrong/wrong.use-cases')]) {
    writeFileSync(registryPath, broken);
    assert.throws(() => checkCapabilities(root), /registry and exported descriptors differ/);
  }
}));

test("rejects duplicate capability names, route mappings and tool mappings", () => fixture((root) => {
  for (const field of ["name", "route", "tool"]) {
    let other = source.replaceAll("listSample", "listOther");
    if (field === "name") other = source;
    else if (field === "route") other = other.replace('"ListSample"', '"ListOther"');
    else other = other.replace('"GET /api/sample"', '"GET /api/other"');
    writeFileSync(join(root, applicationDirectory, "sample", "other.use-cases.ts"), other);
    assert.throws(() => scanCapabilities(root), new RegExp(`Duplicate capability ${field}`));
  }
}));

test("rejects missing registrations, orphan tool metadata, schemas and routes", () => fixture((root) => {
  const capabilities = scanCapabilities(root).capabilities;
  checkToolSurface(root, capabilities);
  const files = [
    "apps/server/src/mcp/tools/sample.ts",
    "packages/mcp/src/tool-definitions/capabilities.ts",
    "packages/contracts/src/mcp/tools.ts",
    "packages/contracts/src/mcp/tool-inputs.ts",
    "apps/server/src/http/routes/sample.ts"
  ];
  for (const path of files) {
    const fullPath = join(root, path);
    const original = readFileSync(fullPath, "utf8");
    writeFileSync(fullPath, original.replaceAll("ListSample", "OrphanTool").replace("/api/sample", "/api/orphan"));
    assert.throws(() => checkToolSurface(root, capabilities), /descriptors differ/);
    writeFileSync(fullPath, original);
  }
}));

test("operation coverage rejects new unclassified writes and preserves mixed sync effects", () => {
  assert.throws(() => classifyCapabilityOperations([{ name: "newDomainWrite", kind: "write" }]), /Unclassified write capability: newDomainWrite/);
  assert.throws(() => classifyCapabilityOperations([{ name: "newHumanWrite", kind: "human-only" }]), /Unclassified write capability: newHumanWrite/);
  const coverage = classifyCapabilityOperations([{ name: "createGitHubLink", kind: "write" }, { name: "resolveSyncConflict", kind: "write" }, { name: "confirmRemotePushPlan", kind: "human-only" }, { name: "resumeRemotePushPlan", kind: "human-only" }]);
  assert.deepEqual(coverage[0], { name: "createGitHubLink", operations: ["create:githubExternalRef"], exceptions: [] });
  assert.deepEqual(coverage[1], { name: "resolveSyncConflict", operations: ["update:card", "create:release", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"], exceptions: ["sync-baseline-run-conflict-bookkeeping"] });
  for (const [index, name] of [[2, "confirmRemotePushPlan"], [3, "resumeRemotePushPlan"]]) assert.deepEqual(coverage[index], { name, operations: ["create:githubExternalRef", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"], exceptions: ["confirmed-remote-write", "sync-baseline-run-conflict-bookkeeping"] });
});


test("operation coverage includes indirect local effects of provider writes", () => {
  const remoteWrites = ["confirmRemotePushPlan", "resumeRemotePushPlan"];
  const proposalsAndIncoming = ["pushWorkItems", "pullStoryMapWorkItems", "syncWorkItems", "resolveSyncConflict"];
  const names = ["importWorkItems", ...proposalsAndIncoming, ...remoteWrites, "upsertProductContext"];
  const coverage = classifyCapabilityOperations(names.map((name) => ({ name, kind: remoteWrites.includes(name) ? "human-only" : "write" })));
  const operations = Object.fromEntries(coverage.map((entry) => [entry.name, entry.operations]));
  assert.deepEqual(operations, {
    importWorkItems: ["create:card", "create:release", "create:githubExternalRef", "set:remoteWorkItemLink", "create:syncRun", "create:annotation", "set:cardAnnotation"],
    pushWorkItems: ["create:syncRun"],
    pullStoryMapWorkItems: ["update:card", "create:release", "create:githubExternalRef", "set:remoteWorkItemLink", "create:syncRun", "create:syncConflict"],
    syncWorkItems: ["update:card", "create:release", "create:githubExternalRef", "set:remoteWorkItemLink", "create:syncRun", "create:syncConflict"],
    resolveSyncConflict: ["update:card", "create:release", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"],
    confirmRemotePushPlan: ["create:githubExternalRef", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"],
    resumeRemotePushPlan: ["create:githubExternalRef", "set:remoteWorkItemLink", "resolve:syncConflict", "create:syncRun"],
    upsertProductContext: ["set:productContext"]
  });
  for (const name of remoteWrites) {
    assert.ok(coverage.find((entry) => entry.name === name).exceptions.includes("confirmed-remote-write"));
  }
  for (const name of proposalsAndIncoming) assert.equal(coverage.find((entry) => entry.name === name).exceptions.includes("confirmed-remote-write"), false);
});

test("classifies effectful reads and refuses direct MCP handler domain persistence", () => fixture((root) => {
  const coverage = classifyCapabilityOperations([{ name: "exportAudit", kind: "read" }, { name: "getGettingStarted", kind: "read" }, { name: "listProjects", kind: "read" }]);
  assert.deepEqual(coverage.map(({ name }) => name), ["exportAudit", "getGettingStarted"]);
  const path = join(root, "apps/server/src/mcp/tools/sample.ts");
  writeFileSync(path, 'registerTool(deps, "ListSample", () => repository.createCard(input));');
  assert.throws(() => checkToolSurface(root, scanCapabilities(root).capabilities), /MCP handler repository write bypass: createCard/);
}));
