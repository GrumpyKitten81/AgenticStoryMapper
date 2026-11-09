import { DomainError, type ChangeOperation, type ConflictEntry, type VersionConflictEntry } from "@storymapper/contracts";
import { collectOperationConflicts } from "@storymapper/core";
import type { StoryMapperRepository } from "@storymapper/db";

export interface BaseVersionTarget {
  entity: VersionConflictEntry["entity"];
  id: string;
  baseVersion: number;
}

const ENTITY_NAMES: Record<VersionConflictEntry["entity"], string> = { card: "Card", release: "Release", persona: "Persona", roadmap: "Roadmap", storyMap: "Story map" };

function readCurrent(repository: StoryMapperRepository<"transaction">, entity: VersionConflictEntry["entity"], id: string): { version: number } | undefined {
  if (entity === "card") return repository.getCard(id);
  if (entity === "release") return repository.getRelease(id);
  if (entity === "persona") return repository.getPersona(id);
  if (entity === "roadmap") return repository.getRoadmap(id);
  return repository.getStoryMapOrThrow(id);
}

export function assertBaseVersions(repository: StoryMapperRepository<"transaction">, targets: BaseVersionTarget[], operations: ChangeOperation[] = []): void {
  const conflicts: ConflictEntry[] = [];
  for (const { entity, id, baseVersion } of targets) {
    const current = readCurrent(repository, entity, id);
    if (!current) throw new DomainError("not_found", `${ENTITY_NAMES[entity]} not found.`);
    if (current.version !== baseVersion) conflicts.push({ entity, id, baseVersion, currentVersion: current.version, current });
  }
  if (operations.length) {
    const projectId = projectForTarget(repository, targets[0]!);
    if (repository.hasRelevantOpenSyncConflicts(projectId, operations)) {
      const snapshot = repository.getOperationSnapshot(projectId);
      const supply = repository.prepareOperationSupply(operations, snapshot);
      conflicts.push(...collectOperationConflicts(snapshot, operations, supply).filter((entry) => entry.reason === "sync"));
    }
  }
  if (conflicts.length) throw new DomainError("conflict", `${conflicts.length} object(s) changed since they were read.`, undefined, conflicts);
}

function projectForTarget(repository: StoryMapperRepository<"transaction">, target: BaseVersionTarget): string {
  if (target.entity === "storyMap") return repository.getStoryMapOrThrow(target.id).projectId;
  if (target.entity === "card") return repository.getStoryMapOrThrow(repository.getCard(target.id)!.storyMapId).projectId;
  if (target.entity === "release") return repository.getStoryMapOrThrow(repository.getRelease(target.id)!.storyMapId).projectId;
  const root = target.entity === "persona" ? repository.getPersona(target.id)! : repository.getRoadmap(target.id)!;
  return root.projectId;
}

export function assertOperationConflicts(repository: StoryMapperRepository<"transaction">, projectId: string, operations: ChangeOperation[]): void {
  if (!repository.hasRelevantOpenSyncConflicts(projectId, operations)) return;
  const snapshot = repository.getOperationSnapshot(projectId);
  const conflicts = collectOperationConflicts(snapshot, operations, repository.prepareOperationSupply(operations, snapshot));
  if (conflicts.length) throw new DomainError("conflict", `${conflicts.length} object(s) changed since they were read.`, undefined, conflicts);
}
