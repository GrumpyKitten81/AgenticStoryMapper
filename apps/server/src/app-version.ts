import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { operationalHealthSchema } from "@storymapper/contracts";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const REPAIR_METADATA = "Restore the Agentic Story Mapper root package.json with name storymapper and a valid SemVer version, then restart.";

function workspaceRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(directory, "pnpm-workspace.yaml"))) {
    const parent = dirname(directory);
    if (directory === parent) throw new Error("Agentic Story Mapper workspace anchor is missing. Restore pnpm-workspace.yaml in the checkout root, then restart.");
    directory = parent;
  }
  return directory;
}

function applicationVersion(): string {
  const root = workspaceRoot();
  let metadata: unknown;
  try { metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Agentic Story Mapper root package.json contains invalid JSON. ${REPAIR_METADATA}`, { cause: error });
    if (error instanceof Error && "code" in error && ["ENOENT", "EACCES", "EPERM", "EISDIR"].includes(String(error.code))) throw new Error(`Agentic Story Mapper root package.json cannot be read. ${REPAIR_METADATA}`, { cause: error });
    throw error;
  }
  if (!metadata || typeof metadata !== "object" || !("name" in metadata) || metadata.name !== "storymapper") throw new Error(`Agentic Story Mapper root package identity is invalid. ${REPAIR_METADATA}`);
  if (!("version" in metadata) || typeof metadata.version !== "string" || !operationalHealthSchema.shape.version.safeParse(metadata.version).success || !SEMVER.test(metadata.version)) throw new Error(`Agentic Story Mapper root application version is invalid. ${REPAIR_METADATA}`);
  return metadata.version;
}

export const APP_VERSION: string = applicationVersion();
