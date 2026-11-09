import { changeOperationSchema, type ExternalRef, type ChangeOperation, type ChangeSet, type StoredChangeSet } from "@storymapper/contracts";

export function pendingExternalReferenceWarnings(operations: readonly ChangeOperation[], proposals: readonly StoredChangeSet[], bindings: readonly ExternalRef[]): NonNullable<ChangeSet["warnings"]> {
  const addressed = referenceOperations(operations, bindings);
  return proposals.filter((proposal) => !proposal.undoneByRestore && ["proposed", "approved", "conflict"].includes(proposal.status)).flatMap((proposal) => {
    const earlier = referenceOperations(proposal.operations.flatMap((operation) => {
      const parsed = changeOperationSchema.safeParse(operation);
      return parsed.success ? [parsed.data] : [];
    }), bindings);
    const overlapping = [...addressed.keys()].filter((key) => earlier.has(key));
    if (!overlapping.length) return [];
    return [{ code: "pending_external_reference_overlap" as const, priorChangeSetId: proposal.id, priorChangeSetTitle: proposal.title, operationIds: [...new Set(overlapping.flatMap((key) => addressed.get(key)!))], priorOperationIds: [...new Set(overlapping.flatMap((key) => earlier.get(key)!))] }];
  });
}

function referenceOperations(operations: readonly ChangeOperation[], bindings: readonly ExternalRef[]): Map<string, string[]> {
  const addresses = new Map<string, string[]>();
  for (const operation of operations) {
    const selector = operation.selector;
    const reference = selector?.kind === "externalRef" ? { ...selector, entityType: operation.entity } : operation.entity === "externalRef" && operation.op === "set" ? operation.after : operation.entity === "externalRef" && operation.op === "delete" ? bindings.find((binding) => binding.id === operation.entityId) : undefined;
    if (!reference) continue;
    const key = JSON.stringify([reference.entityType, reference.scopeId, reference.system, reference.externalId]);
    addresses.set(key, [...addresses.get(key) ?? [], operation.operationId]);
  }
  return addresses;
}
