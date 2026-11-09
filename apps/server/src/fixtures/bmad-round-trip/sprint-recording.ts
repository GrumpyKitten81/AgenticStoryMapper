import { readFileSync } from "node:fs";
import type { WorkflowStatus } from "@storymapper/contracts";

export function recordedDeliveryTargets(configured: WorkflowStatus[]) {
  const content = readFileSync(new URL("./development-status.txt", import.meta.url), "utf8");
  const mapping = JSON.parse(readFileSync(new URL("./status-mapping.json", import.meta.url), "utf8")) as Record<string, string>;
  const section = content.split("development_status:\n")[1];
  if (!section) throw new Error("Missing recorded development_status entries.");
  return section.trimEnd().split("\n").flatMap((line) => {
    const entry = line.match(/^  (\d+)-(\d+)-[a-z0-9-]+: ([a-z-]+)$/);
    if (!entry) {
      if (/^  epic-\d+(?:-retrospective)?: [a-z-]+$/.test(line)) return [];
      throw new Error(`Invalid recorded development status entry ${line}.`);
    }
    const status = mapping[entry[3]!];
    if (!status || !configured.some((configured) => configured.name === status)) throw new Error(`Recorded status ${entry[3]} has no configured mapping.`);
    return [{ system: "bmad", externalId: `story-${entry[1]}.${entry[2]}`, status }];
  });
}
