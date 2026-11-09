import { isCardArchived } from "@storymapper/core/story-map/github-status";
import { annotationSchema, releaseSchema, workflowStatusSchema, type ChangeOperation, type ConflictEntry, type OperationSnapshot, type OperationSupply, type SyncConflict } from "@storymapper/contracts";
import { projectRemoteWorkItemLink } from "@storymapper/core/changesets/github-identity";
import { managedAnnotationDefinitions } from "@storymapper/core/publishing/sync-fields";

export function touchesSyncField(before: OperationSnapshot, after: OperationSnapshot, operation: ChangeOperation, conflict: SyncConflict): boolean {
  const card = before.cards.find((row) => row.id === conflict.cardId);
  if (!card) return false;
  if (operation.entity === "card" || operation.entity === "cardAnnotation") {
    const next = after.cards.find((row) => row.id === card.id);
    if (!next) return true;
    if (conflict.field === "labels") return changed(managedLabels(before, conflict), managedLabels(after, conflict));
    const field = conflict.field === "milestone" ? "releaseId" : conflict.field;
    return changed(card[field], next[field]);
  }
  if (operation.entity !== "remoteWorkItemLink" || operation.after.externalRefId !== conflict.externalRefId) return false;
  const previous = before.remoteWorkItemLinks.find((row) => row.externalRefId === conflict.externalRefId);
  const next = after.remoteWorkItemLinks.find((row) => row.externalRefId === conflict.externalRefId);
  const keys = { title: ["titleHash"], description: ["bodyHash"], status: ["remoteState", "statusLabels"], labels: ["annotationLabels"], milestone: ["releaseId", "milestone", "iteration", "releaseMetadata"] } as const;
  if (previous?.baseline && !next?.baseline) return true;
  if (previous?.baseline && next?.baseline) return (["acknowledgedLocal", "observedRemote"] as const).some((side) => keys[conflict.field].some((key) => changed((previous.baseline![side] as unknown as Record<string, unknown>)[key], (next.baseline![side] as unknown as Record<string, unknown>)[key])));
  const stateKeys = { title: ["titleHash"], description: ["bodyHash"], status: ["remoteState", "labels"], labels: ["labels"], milestone: ["milestone"] } as const;
  return stateKeys[conflict.field].some((key) => changed(previous?.[key], next?.[key]));
}

function changed(before: unknown, after: unknown): boolean { return JSON.stringify(before) !== JSON.stringify(after); }

function managedLabels(snapshot: OperationSnapshot, conflict: SyncConflict): string[] {
  const connection = snapshot.connections.find((row) => row.id === conflict.connectionId);
  const card = snapshot.cards.find((row) => row.id === conflict.cardId);
  if (!connection || !card) return [];
  const assigned = new Set(snapshot.cardAnnotations.filter((row) => row.cardId === card.id).map((row) => row.annotationId));
  return managedAnnotationDefinitions(connection, snapshot.annotations.filter((row) => row.projectId === connection.projectId && (!row.storyMapId || row.storyMapId === card.storyMapId))).filter((row) => assigned.has(row.id)).map((row) => row.name).sort();
}

export function dependentSyncConflicts(snapshot: OperationSnapshot, after: OperationSnapshot, operation: ChangeOperation, index: number, resolvedIds: ReadonlySet<string>): ConflictEntry[] {
  return (snapshot.syncConflicts ?? []).filter((conflict) => conflict.status === "open" && !resolvedIds.has(conflict.id) && affectsDependentField(snapshot, after, operation, conflict)).flatMap((conflict) => {
    const card = snapshot.cards.find((row) => row.id === conflict.cardId);
    return card ? [{ entity: "card" as const, id: card.id, baseVersion: card.version, currentVersion: card.version, current: conflict, reason: "sync" as const, syncConflictId: conflict.id, operationId: operation.operationId, index }] : [];
  });
}

function affectsDependentField(snapshot: OperationSnapshot, after: OperationSnapshot, operation: ChangeOperation, conflict: SyncConflict): boolean {
  if (operation.entity === "release" && conflict.field === "milestone") {
    const card = snapshot.cards.find((row) => row.id === conflict.cardId);
    const baseline = snapshot.remoteWorkItemLinks.find((row) => row.externalRefId === conflict.externalRefId)?.baseline;
    const identities = [conflict.localValue, conflict.remoteValue].flatMap((value) => value && typeof value === "object" && "assignment" in value ? [value.assignment] : []);
    const disputedTarget = snapshot.externalRefs.some((ref) => ref.entityType === "release" && ref.entityId === operation.entityId && ref.system === snapshot.connections.find((row) => row.id === conflict.connectionId)?.provider && identities.includes(ref.externalId));
    if (card?.releaseId !== operation.entityId && baseline?.acknowledgedLocal.releaseId !== operation.entityId && !disputedTarget) return false;
    if (operation.op === "delete") return true;
    const release = snapshot.releases.find((row) => row.id === operation.entityId);
    const connection = snapshot.connections.find((row) => row.id === conflict.connectionId);
    const keys = connection?.releaseSource === "iteration" ? ["name", "startDate", "releaseDate"] as const : ["name", "goal", "releaseDate", "released"] as const;
    return keys.some((key) => key in operation.after && JSON.stringify(operation.after[key as keyof typeof operation.after]) !== JSON.stringify(release?.[key]));
  }
  if (operation.entity === "annotation" && conflict.field === "labels") return changed(managedLabels(snapshot, conflict), managedLabels(after, conflict));
  return operation.entity === "workflowStatus" && conflict.field === "status" && changed(snapshot.cards.find((row) => row.id === conflict.cardId)?.status, after.cards.find((row) => row.id === conflict.cardId)?.status);
}

type Reference = (entity: string, id: string) => { id: string };

export function projectSyncFieldState(snapshot: OperationSnapshot, operation: ChangeOperation, targetId: string, reference: Reference, supply: OperationSupply): OperationSnapshot {
  const next = { ...snapshot };
  if (operation.entity === "annotation") {
    if (operation.op === "create") next.annotations = [...snapshot.annotations, { id: targetId, ...annotationSchema.omit({ id: true }).parse({ ...operation.after, storyMapId: operation.after.storyMapId ? reference("storyMap", operation.after.storyMapId).id : null, position: operation.after.position ?? 0 }) }];
    else next.annotations = snapshot.annotations.flatMap((row) => row.id !== targetId ? [row] : operation.op === "delete" ? [] : [Object.assign({}, row, operation.after)]);
    if (operation.op === "delete") next.cardAnnotations = snapshot.cardAnnotations.filter((row) => row.annotationId !== targetId);
  }
  if (operation.entity === "cardAnnotation") projectAssignment(next, targetId, reference("annotation", operation.after.annotationId).id, operation.op === "set", operation.operationId, supply.createdAt);
  if (operation.entity === "card") projectCard(next, operation, targetId, reference, supply.createdAt);
  if (operation.entity === "release") projectRelease(next, operation, targetId, reference);
  if (operation.entity === "workflowStatus") projectWorkflow(next, operation, targetId, reference);
  if (operation.entity === "githubExternalRef") {
    next.externalRefs = snapshot.externalRefs.filter((row) => row.id !== targetId);
    if (operation.op !== "delete") next.externalRefs.push({ ...operation.after, id: targetId, entityId: reference(operation.after.entityType, operation.after.entityId).id, scopeId: reference("storyMap", operation.after.scopeId).id, system: operation.after.provider ?? "github", syncedVersion: 1, createdAt: supply.createdAt });
  }
  if (operation.entity === "remoteWorkItemLink") {
    const externalRefId = reference("githubExternalRef", operation.after.externalRefId).id;
    const previous = snapshot.remoteWorkItemLinks.find((row) => row.externalRefId === externalRefId);
    next.remoteWorkItemLinks = [...snapshot.remoteWorkItemLinks.filter((row) => row.externalRefId !== externalRefId), projectRemoteWorkItemLink({ ...operation.after, id: previous?.id ?? targetId, externalRefId }, snapshot.externalRefs)];
  }
  return next;
}

function projectAssignment(snapshot: OperationSnapshot, cardId: string, annotationId: string, present: boolean, operationId: string, createdAt: string): void {
  const assigned = snapshot.cardAnnotations.some((row) => row.cardId === cardId && row.annotationId === annotationId);
  if (assigned === present) return;
  snapshot.cardAnnotations = present ? [...snapshot.cardAnnotations, { id: operationId, cardId, annotationId, createdAt }] : snapshot.cardAnnotations.filter((row) => row.cardId !== cardId || row.annotationId !== annotationId);
}

function projectCard(snapshot: OperationSnapshot, operation: Extract<ChangeOperation, { entity: "card" }>, targetId: string, reference: Reference, createdAt: string): void {
  if (operation.op === "delete") { snapshot.cards = snapshot.cards.filter((row) => row.id !== targetId); return; }
  const targets = operation.op === "bulk" ? operation.after.cards.map((row) => reference("card", row.id).id) : [targetId];
  const patch = operation.op === "bulk" ? operation.after.patch : operation.after;
  snapshot.cards = snapshot.cards.map((card) => {
    if (!targets.includes(card.id)) return card;
    const next = Object.assign({}, card, patch);
    if ("releaseId" in patch && patch.releaseId) next.releaseId = reference("release", patch.releaseId).id;
    if (operation.op === "archive") next.archived = true;
    if (operation.op === "unarchive") next.archived = false;
    if (operation.op === "upsert" && operation.selector.system !== "github" && isCardArchived(card)) { next.archived = false; if (next.status === "archived" && !snapshot.remoteWorkItemLinks.some((link) => link.cardId === card.id)) next.status = "todo"; }
    return next;
  });
  if (operation.op !== "bulk") return;
  for (const cardId of targets) for (const [field, present] of [["addAnnotationId", true], ["removeAnnotationId", false]] as const) {
    const id = operation.after.patch[field];
    if (id) projectAssignment(snapshot, cardId, reference("annotation", id).id, present, operation.operationId, createdAt);
  }
}

function projectRelease(snapshot: OperationSnapshot, operation: Extract<ChangeOperation, { entity: "release" }>, targetId: string, reference: Reference): void {
  const previous = snapshot.releases.find((row) => row.id === targetId);
  if (operation.op === "delete") {
    snapshot.releases = snapshot.releases.filter((row) => row.id !== targetId);
    snapshot.cards = snapshot.cards.map((row) => row.releaseId === targetId ? { ...row, releaseId: null } : row);
  } else if (previous) snapshot.releases = snapshot.releases.map((row) => row.id === targetId ? Object.assign({}, row, operation.after) : row);
  else if (operation.op === "create" || operation.op === "upsert") snapshot.releases = [...snapshot.releases, { id: targetId, ...releaseSchema.omit({ id: true }).parse({ ...operation.after, storyMapId: reference("storyMap", operation.after.storyMapId).id, version: 1, position: operation.after.position ?? 0 }) }];
}

function projectWorkflow(snapshot: OperationSnapshot, operation: Extract<ChangeOperation, { entity: "workflowStatus" }>, targetId: string, reference: Reference): void {
  if (operation.op === "create") {
    snapshot.workflowStatuses = [...snapshot.workflowStatuses, { id: targetId, ...workflowStatusSchema.omit({ id: true }).parse({ ...operation.after, storyMapId: operation.after.storyMapId ? reference("storyMap", operation.after.storyMapId).id : null, position: operation.after.position ?? 0 }) }];
    return;
  }
  const definition = snapshot.workflowStatuses.find((row) => row.id === targetId);
  if (!definition) return;
  const name = operation.op === "update" ? operation.after.name : snapshot.workflowStatuses.find((row) => row.id === operation.after.replacementBefore?.id)?.name;
  if (name !== undefined && name !== definition.name) snapshot.cards = snapshot.cards.map((card) => card.status === definition.name && !snapshot.remoteWorkItemLinks.some((link) => link.cardId === card.id) && snapshot.storyMaps.some((map) => map.id === card.storyMapId && map.projectId === definition.projectId && (!definition.storyMapId || definition.storyMapId === map.id)) ? { ...card, status: name } : card);
  snapshot.workflowStatuses = snapshot.workflowStatuses.flatMap((row) => row.id !== targetId ? [row] : operation.op === "delete" ? [] : [Object.assign({}, row, operation.after)]);
}
