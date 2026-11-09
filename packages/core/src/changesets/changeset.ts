import { OPERATIONS_SCHEMA_VERSION, type ChangeOperation, type ChangeSet } from "@storymapper/contracts";

export function createChangeSet(input: {
  id: string;
  projectId: string;
  title: string;
  source: ChangeSet["source"];
  operations: ChangeOperation[];
  createdAt: string;
}): ChangeSet {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    source: input.source,
    status: "proposed",
    operationsSchemaVersion: OPERATIONS_SCHEMA_VERSION,
    operations: input.operations,
    createdAt: input.createdAt
  };
}

export function summarizeChangeSet(changeSet: ChangeSet): string {
  const counts = changeSet.operations.reduce<Record<string, number>>((accumulator, operation) => {
    const key = `${operation.op}:${operation.entity}`;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}

export function assertChangeSetCanApply(changeSet: ChangeSet): void {
  if (changeSet.status !== "approved") {
    throw new Error(`ChangeSet ${changeSet.id} must be approved before applying.`);
  }
}
