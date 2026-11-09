import { normalizeDeletionSelection, selectedDeletionEffects } from "@storymapper/core/changesets/selected-deletion";
import { acknowledgmentError } from "@storymapper/core/changesets/source-plan-resolution";
import { cardSchema, syncConflictSchema } from "@storymapper/contracts";
import type { ChangeOperation, ConflictEntry, OperationSnapshot, OperationSupply, VersionConflictEntry } from "@storymapper/contracts";
import { operationDependencies } from "@storymapper/core/changesets/operation-dependencies";
import { touchesSyncField, dependentSyncConflicts, projectSyncFieldState } from "@storymapper/core/changesets/sync-field-locks";
import { OperationResolutionError } from "@storymapper/core/changesets/resolution-context";

export function collectOperationConflicts(snapshot: OperationSnapshot, operations: readonly ChangeOperation[], supply: OperationSupply, selectedOperationIds?: readonly string[]): ConflictEntry[] {
  const selected = selectedOperations(snapshot, operations, supply, selectedOperationIds);
  const resolvedIds = new Set(operations.filter((entry) => selected.has(entry.operationId) && entry.entity === "syncConflict" && entry.op === "resolve" && snapshot.syncConflicts?.some((row) => row.id === entry.entityId && JSON.stringify(syncConflictSchema.parse(row)) === JSON.stringify(entry.before))).map((entry) => entry.entityId!));
  for (const operation of operations) if (selected.has(operation.operationId) && operation.entity === "remoteWorkItemLink" && operation.statusCatalog && operation.after.statusEvidence) {
    for (const conflict of snapshot.syncConflicts ?? []) if (conflict.field === "status" && conflict.externalRefId === operation.after.externalRefId) resolvedIds.add(conflict.id); }
  const conflicts: ConflictEntry[] = divergentPullConflicts(snapshot, operations.filter((operation) => selected.has(operation.operationId)), operations);
  const roots = { card: snapshot.cards, release: snapshot.releases, persona: snapshot.personas, storyMap: snapshot.storyMaps, roadmap: snapshot.roadmaps };
  let effective = snapshot;
  operationDependencies(snapshot, operations.filter((operation) => selected.has(operation.operationId)), supply, (operation, target, owner, reference) => {
    const index = operations.indexOf(operation);
    const before = effective;
    if (snapshot.syncConflicts?.some((conflict) => conflict.status === "open")) effective = projectSyncFieldState(before, operation, target.id, reference, supply);
    const addressedOperation = { ...operation, entityId: target.id };
    conflicts.push(...compositeConflicts(snapshot, operation, index), ...dependentSyncConflicts(before, effective, addressedOperation, index, resolvedIds));
    if ((operation.entity === "workflowStatus" && (operation.op === "update" || operation.op === "delete") || (operation.entity === "annotation" || operation.entity === "persona") && operation.op === "delete") && "affectedCards" in operation.after) for (const baseline of operation.after.affectedCards ?? []) {
      const row = snapshot.cards.find((card) => card.id === baseline.id);
      if (row && row.version !== baseline.baseVersion) conflicts.push({ entity: "card", id: row.id, baseVersion: baseline.baseVersion, currentVersion: row.version, current: row, operationId: operation.operationId, index });
    }
    if (operation.op === "import" || operation.op === "create" && operation.entity in roots) return;
    if (operation.entity === "card" && operation.op === "delete" && operation.after.selection) {
      const selection = normalizeDeletionSelection(operation.after.selection, (entity, id) => reference(entity, id).id);
      const { requiredIds } = selectedDeletionEffects(snapshot, selection.storyMapId, selection.cards.map((card) => card.id), operation.after.strategy);
      const baselines = [...selection.cards, ...selection.affectedCards].filter((card) => requiredIds.has(card.id));
      const seen = new Set<string>();
      for (const { id, baseVersion } of baselines) {
        const key = `${id}:${baseVersion}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const row = snapshot.cards.find((card) => card.id === id);
        for (const sync of snapshot.syncConflicts ?? []) if (row && sync.cardId === id && sync.status === "open" && !resolvedIds.has(sync.id)) conflicts.push({ entity: "card", id, baseVersion, currentVersion: row.version, current: sync, operationId: operation.operationId, index, reason: "sync", syncConflictId: sync.id });
        if (row && row.version !== baseVersion) conflicts.push({ entity: "card", id, baseVersion, currentVersion: row.version, current: row, operationId: operation.operationId, index });
      }
      return;
    }
    const addresses = operation.entity === "card" && operation.op === "bulk" ? operation.after.cards.map((card) => reference("card", card.id)) : [target.entity in roots ? target : owner];
    for (const address of addresses) {
      if (!address || !(address.entity in roots)) continue;
      const entity = address.entity as VersionConflictEntry["entity"];
      const row = roots[entity].find((row) => row.id === address.id);
      if (!row) continue;
      const selector = operation.selector;
      const external = selector?.kind === "externalRef" ? snapshot.externalRefs.find((ref) => ref.entityId === row.id && ref.entityType === entity && ref.scopeId === reference("storyMap", selector.scopeId).id && ref.system === selector.system && ref.externalId === selector.externalId) : undefined;
      const targetBaseline = operation.entity === "card" && operation.op === "bulk" ? operation.after.cards.find((card) => reference("card", card.id).id === row.id)?.baseVersion : operation.baseVersion;
      const baselines = new Set([targetBaseline, operation.op === "upsert" || operation.entity === "card" && operation.op === "archive" || operation.entity === "card" && operation.op === "update" && operation.after.status !== undefined ? external?.syncedVersion : undefined]);
      for (const sync of snapshot.syncConflicts ?? []) if (entity === "card" && sync.cardId === row.id && sync.status === "open" && touchesSyncField(before, effective, operation, sync) && !resolvedIds.has(sync.id)) conflicts.push({ entity, id: row.id, baseVersion: targetBaseline ?? row.version, currentVersion: row.version, current: sync, operationId: operation.operationId, index, reason: "sync", syncConflictId: sync.id });
      for (const baseVersion of baselines) if (baseVersion !== undefined && baseVersion !== row.version) conflicts.push({ entity, id: row.id, baseVersion, currentVersion: row.version, current: row, operationId: operation.operationId, index });
    }
  });
  return conflicts;
}

function compositeConflicts(snapshot: OperationSnapshot, operation: ChangeOperation, index: number): ConflictEntry[] {
  if (operation.entity === "remoteWorkItemLink" && operation.statusCardsBefore) return operation.statusCardsBefore.flatMap((before) => {
    const card = snapshot.cards.find((card) => card.id === before.id);
    return !card || JSON.stringify(cardSchema.parse(card)) !== JSON.stringify(before) ? [{ entity: "card" as const, id: before.id, reason: "fingerprint" as const, operationId: operation.operationId, index, current: card ?? null, message: "GitHub status Card evidence changed after preparation." }] : [];
  });
  if (operation.entity === "sourcePlan") {
    const message = acknowledgmentError(snapshot, operation.after);
    return message ? [{ entity: "storyMap", id: operation.after.storyMapId, reason: "fingerprint", operationId: operation.operationId, index, current: snapshot.storyMaps.find((row) => row.id === operation.after.storyMapId) ?? null, message }] : [];
  }
  if (operation.entity === "syncConflict" && operation.op === "resolve") {
    const current = snapshot.syncConflicts?.find((row) => row.id === operation.entityId);
    if (!current || JSON.stringify(syncConflictSchema.parse(current)) !== JSON.stringify(operation.before)) return [{ entity: operation.before.cardId ? "card" : "connection", id: operation.before.cardId ?? operation.before.connectionId, reason: "fingerprint", operationId: operation.operationId, index, current: current ?? null, message: "Reviewed sync conflict changed after preparation." }];
  }
  if (operation.entity !== "storyMapCopy" && operation.entity !== "githubBoardImport") return [];
  const conflicts: ConflictEntry[] = [];
  for (const [id, fingerprint] of Object.entries(operation.after.expected)) {
    if (snapshot.mapFingerprints?.[id] !== fingerprint || !snapshot.storyMaps.some((map) => map.id === id)) conflicts.push({ entity: "storyMap", id, reason: "fingerprint", operationId: operation.operationId, index, current: snapshot.storyMaps.find((map) => map.id === id) ?? null, message: "Story Map changed after the proposal; create a new proposal." });
  }
  if (operation.entity !== "githubBoardImport") return conflicts;
  const { input, preview, expected } = operation.after;
  if (input.cleanup && JSON.stringify(snapshot.storyMaps.map((map) => map.id).sort()) !== JSON.stringify(Object.keys(expected).sort())) conflicts.push({ entity: "project", id: input.projectId, reason: "fingerprint", operationId: operation.operationId, index, current: snapshot.projects.find((project) => project.id === input.projectId), message: "Project Story Maps changed after the cleanup proposal." });
  for (const connector of preview.connectors) {
    const matches = snapshot.connections.filter((row) => row.projectId === input.projectId && row.provider === "github" && `${row.owner}/${row.repository}`.toLowerCase() === connector.repository);
    const row = matches[0];
    const before = row ? { projectId: row.projectId, provider: row.provider, owner: row.owner, repository: row.repository, readOnly: row.readOnly } : null;
    if (matches.length > 1 || connector.existingId !== (row?.id ?? null) || JSON.stringify(connector.before) !== JSON.stringify(before)) conflicts.push({ entity: row ? "connection" : "project", id: row?.id ?? input.projectId, reason: "fingerprint", operationId: operation.operationId, index, current: row ?? null, message: "GitHub connectors changed after the proposal; create a new proposal." });
  }
  for (const id of input.removeCardIds) if (!snapshot.cards.some((card) => card.id === id && card.storyMapId === input.storyMapId)) conflicts.push({ entity: "card", id, reason: "fingerprint", operationId: operation.operationId, index, current: snapshot.cards.find((card) => card.id === id) ?? null, message: "Removal Card changed after proposal." });
  return conflicts;
}

function divergentPullConflicts(snapshot: OperationSnapshot, selected: readonly ChangeOperation[], operations: readonly ChangeOperation[]): ConflictEntry[] {
  if (new Set(operations.filter((operation) => operation.entity === "syncRun").map((operation) => operation.after.connectionId)).size < 2) return [];
  const writes = new Map<string, { value: unknown; operation: ChangeOperation }>();
  const conflicts: ConflictEntry[] = [];
  for (const operation of selected) {
    if (operation.entity !== "card" && operation.entity !== "release" || operation.op !== "update") continue;
    for (const [field, value] of Object.entries(operation.after)) {
      const key = `${operation.entity}:${operation.entityId}:${field}`;
      const prior = writes.get(key);
      if (prior && JSON.stringify(prior.value) !== JSON.stringify(value)) for (const entry of [prior.operation, operation]) {
        const release = operation.entity === "release" ? snapshot.releases.find((row) => row.id === operation.entityId) : undefined;
        const owner = release ? { entity: "storyMap" as const, id: release.storyMapId, current: snapshot.storyMaps.find((row) => row.id === release.storyMapId) ?? null } : { entity: "card" as const, id: operation.entityId, current: snapshot.cards.find((row) => row.id === operation.entityId) ?? null };
        if (!conflicts.some((conflict) => conflict.operationId === entry.operationId)) conflicts.push({ ...owner, reason: "fingerprint", operationId: entry.operationId, index: operations.indexOf(entry), message: `Connections proposed divergent values for ${operation.entity} ${field}.` });
      }
      writes.set(key, { value, operation });
    }
  }
  return conflicts;
}

function selectedOperations(snapshot: OperationSnapshot, operations: readonly ChangeOperation[], supply: OperationSupply, selectedOperationIds?: readonly string[]): Set<string> {
  const selected = new Set(selectedOperationIds ?? operations.map((operation) => operation.operationId));
  if ([...selected].some((id) => !operations.some((operation) => operation.operationId === id))) throw new OperationResolutionError("selection", -1, "validation", "Selection contains an unknown operation id.");
  const dependencies = operationDependencies(snapshot, operations, supply);
  for (const operation of operations) if (dependencies.get(operation.operationId)!.some((id) => !selected.has(id))) selected.delete(operation.operationId);
  return selected;
}
