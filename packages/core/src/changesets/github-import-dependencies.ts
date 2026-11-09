import type { ChangeOperation } from "@storymapper/contracts";

export function githubImportDependencies(operations: readonly ChangeOperation[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const cards = new Map<string, Extract<ChangeOperation, { entity: "card"; op: "create" }>>();
  const baselines = new Map<string, Extract<ChangeOperation, { entity: "remoteWorkItemLink" }>>();
  const annotations = new Map<string, ChangeOperation[]>();
  const refs: Array<Extract<ChangeOperation, { entity: "githubExternalRef"; op: "create" }>> = [];
  for (const operation of operations) {
    if (operation.entity === "card" && operation.op === "create" && operation.entityId && !cards.has(operation.entityId)) cards.set(operation.entityId, operation);
    if (operation.entity === "remoteWorkItemLink" && operation.before === null && !baselines.has(operation.after.externalRefId)) baselines.set(operation.after.externalRefId, operation);
    if (operation.entity === "cardAnnotation" && operation.op === "set") {
      const assigned = annotations.get(operation.after.cardId) ?? [];
      assigned.push(operation); annotations.set(operation.after.cardId, assigned);
    }
    if (operation.entity === "githubExternalRef" && operation.op === "create" && operation.after.entityType === "card" && operation.entityId) refs.push(operation);
  }
  for (const ref of refs) {
    const card = cards.get(ref.after.entityId);
    const baseline = baselines.get(ref.entityId!);
    if (!card || !baseline) continue;
    const members = [card, ref, baseline, ...annotations.get(card.entityId!) ?? []];
    for (const member of members) groups.set(member.operationId, members.filter((candidate) => candidate !== member).map((candidate) => candidate.operationId));
  }
  return groups;
}
