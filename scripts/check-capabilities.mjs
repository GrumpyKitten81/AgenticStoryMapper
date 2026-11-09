import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDirectory, checkDescriptorRegistry, scanCapabilities, serializeCapabilities } from "./capability-scan.mjs";
import { capabilityArtifactPaths, readToolMetadata, serializeToolDefinitions, serializeToolDocumentation } from "./capability-artifacts.mjs";

import { checkToolSurface } from "./capability-surface.mjs";

export function checkCapabilities(root = process.cwd()) {
  const manifest = scanCapabilities(root);
  const stored = readFileSync(join(root, applicationDirectory, "capability-manifest.json"), "utf8");
  if (stored !== serializeCapabilities(manifest)) throw new Error("Capability manifest is stale. Run corepack pnpm generate-capabilities and review the change.");
  checkDescriptorRegistry(root, manifest.capabilities);
  checkToolSurface(root, manifest.capabilities);
  const metadata = readToolMetadata(root);
  for (const [path, expected] of [[capabilityArtifactPaths.tools, serializeToolDefinitions(manifest, metadata)], [capabilityArtifactPaths.documentation, serializeToolDocumentation(manifest, metadata)]]) {
    if (readFileSync(join(root, path), "utf8") !== expected) throw new Error(`Generated capability artifact is stale: ${path}. Run corepack pnpm generate-capabilities and review the change.`);
  }
  return manifest.capabilities.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Capability manifest check passed (${checkCapabilities()} capabilities).`);
}
