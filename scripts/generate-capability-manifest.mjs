import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applicationDirectory, scanCapabilities, serializeCapabilities } from "./capability-scan.mjs";
import { capabilityArtifactPaths, readToolMetadata, serializeToolDefinitions, serializeToolDocumentation } from "./capability-artifacts.mjs";

const root = process.cwd();
const manifest = scanCapabilities(root);
const metadata = readToolMetadata(root);
writeFileSync(join(root, applicationDirectory, "capability-manifest.json"), serializeCapabilities(manifest));
writeFileSync(join(root, capabilityArtifactPaths.tools), serializeToolDefinitions(manifest, metadata));
writeFileSync(join(root, capabilityArtifactPaths.documentation), serializeToolDocumentation(manifest, metadata));
console.log(`Wrote ${manifest.capabilities.length} capabilities.`);
