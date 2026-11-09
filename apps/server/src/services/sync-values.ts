import { createHash } from "node:crypto";
import type { Card, ConnectorConnection } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db";
import { labelsForSyncStatus as labelsForStatus, stateForSyncStatus as stateForStatus, localStatusForRemote } from "@storymapper/core";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function issueLabelsForCard(connection: ConnectorConnection, card: Card): string[] {
  return unique([connection.defaultLabel, ...labelsForStatus(connection, card.status), `story-map:${card.key.replace(/-\d+$/u, "")}`]);
}

export { labelsForStatus, stateForStatus, localStatusForRemote };

export function releaseNameForCard(repository: StoryMapperRepository<"root" | "transaction">, storyMapId: string, releaseId?: string | null): string | undefined {
  if (!releaseId) return undefined;
  return repository.listReleases(storyMapId).find((release) => release.id === releaseId)?.name;
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
