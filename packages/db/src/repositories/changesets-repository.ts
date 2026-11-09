import { reviewFingerprint, reviewInput } from "@storymapper/db/repositories/card-review-read";
import { createHash } from "node:crypto";
import { agentAccessEnabled, agentApprovalAllowed, collectOperationConflicts, operationDependencies, resolveOperations } from "@storymapper/core";
import { asc, eq } from "drizzle-orm";
import { changeSetStatusSchema, changeSetSchema, DomainError, OPERATIONS_SCHEMA_VERSION } from "@storymapper/contracts";
import type { ChangeSet, ChangeSetInput, StoredChangeSet, ActorContext, OperationSupply } from "@storymapper/contracts";
import { ChangeSetConflictError } from "@storymapper/db/repositories/repository-errors";
import { OPERATION_ROOTS } from "@storymapper/db/repositories/operation-persistence-repository";
import { pendingExternalReferenceWarnings } from "@storymapper/db/repositories/changeset-warnings";
import { toChangeSet } from "@storymapper/db/repositories/row-mappers";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { assertAgentWriteSafety } from "@storymapper/db/repositories/projects-repository";
import { changeSets, externalRefs } from "@storymapper/db/schema";

const newCommandReceipts = new WeakMap<object, { id: string; hash: string }>();
export type CommandChangeSetReceipt = object;

export function createCommandChangeSet(this: StoryMapperRepository<"transaction">, input: ChangeSetInput, trustedGithubStatus = false): { changeSet: ChangeSet; receipt: CommandChangeSetReceipt } {
  const changeSet = this.createChangeSet(input, trustedGithubStatus);
  const receipt = Object.freeze({});
  newCommandReceipts.set(receipt, { id: changeSet.id, hash: operationsHash(changeSet.operations) });
  return { changeSet, receipt };
}

export function listChangeSets(this: StoryMapperRepository<"transaction">, projectId?: string): StoredChangeSet[] {
    this.context.database;
    const query = this.db.select().from(changeSets).orderBy(asc(changeSets.createdAt));
    const rows = projectId ? query.where(eq(changeSets.projectId, projectId)).all() : query.all();
    return rows.map(toChangeSet);
  }

export function getChangeSet(this: StoryMapperRepository<"transaction">, changeSetId: string): StoredChangeSet | undefined {
    this.context.database;
    const row = this.db.select().from(changeSets).where(eq(changeSets.id, changeSetId)).get();
    return row ? toChangeSet(row) : undefined;
  }

export function createChangeSet(this: StoryMapperRepository<"transaction">, input: ChangeSetInput, trustedGithubStatus = false): ChangeSet {
    this.assertWritable();
    if (this.actor.actorType === "agent" && !agentAccessEnabled(this.getSafetySettings(input.projectId))) throw new DomainError("disabled", "Agent access is disabled for this Project.");
    const changeSet = changeSetSchema.parse({ ...input, status: "proposed", proposedBy: recordedActor(this.actor), approval: undefined, execution: undefined });
    if (!trustedGithubStatus && changeSet.operations.some((operation) => operation.entity === "remoteWorkItemLink" && (operation.statusCatalog || operation.after.statusEvidence || operation.after.remoteState !== undefined))) throw new DomainError("protected", "GitHub status adoption requires trusted remote preparation.");
    const owned = new Set(this.listStoryMaps(input.projectId).flatMap((map) => this.listRemoteWorkItemLinksForStoryMap(map.id)).flatMap((link) => link.cardId ? [link.cardId] : []));
    const refs = this.listStoryMaps(input.projectId).flatMap((map) => this.listExternalRefsForStoryMap(map.id));
    for (const operation of changeSet.operations) if (operation.entity === "card" && (operation.op === "update" || operation.op === "upsert" || operation.op === "bulk")) {
      const patch = operation.op === "bulk" ? operation.after.patch : operation.after;
      if (patch.status === undefined) continue;
      const selector = operation.selector;
      const id = selector?.kind === "id" ? selector.id : selector?.kind === "local" ? selector.localId : selector?.kind === "externalRef" ? refs.find((ref) => ref.entityType === "card" && ref.scopeId === selector.scopeId && ref.system === selector.system && ref.externalId === selector.externalId)?.entityId : operation.entityId;
      const targets = operation.op === "bulk" ? operation.after.cards.map((card) => card.id) : [id];
      if (targets.some((id) => id && owned.has(id))) throw new DomainError("protected", "GitHub owns the Card status. Detach its sync link before editing status.");
    }
    changeSet.warnings = pendingExternalReferenceWarnings(changeSet.operations, this.listChangeSets(changeSet.projectId), this.db.select().from(externalRefs).all());
    if (changeSet.undoneByRestore || changeSet.status === "stale") throw new DomainError("validation", "New ChangeSets must use executable current operations.");
    this.db.insert(changeSets).values({
      trustedGithubStatus,
      id: changeSet.id,
      projectId: changeSet.projectId,
      title: changeSet.title,
      source: changeSet.source,
      status: changeSet.status,
      operationsSchemaVersion: changeSet.operationsSchemaVersion,
      operationsJson: JSON.stringify(changeSet.operations),
      proposedByJson: changeSet.proposedBy === undefined ? null : JSON.stringify(changeSet.proposedBy), proposedBySchemaVersion: changeSet.proposedBy === undefined ? null : 1,
      warningsJson: changeSet.warnings === undefined ? null : JSON.stringify(changeSet.warnings), warningsSchemaVersion: changeSet.warnings === undefined ? null : 1,
      createdAt: changeSet.createdAt
    }).run();
    this.logActivity(changeSet.projectId, "changeSet.proposed", "changeSet", changeSet.id, undefined, changeSet);
    return changeSet;
  }

export function selectChangeSetOperationIds(this: StoryMapperRepository<"transaction">, changeSetId: string, requested?: readonly string[]): string[] {
  const stored = this.getChangeSet(changeSetId);
  if (!stored) throw new DomainError("not_found", "ChangeSet not found.");
  assertExecutable(stored);
  const current = changeSetSchema.parse(stored);
  const snapshot = this.getOperationSnapshot(current.projectId);
  return closedSelection(snapshot, current.operations, this.prepareOperationSupply(current.operations, snapshot), requested);
}

export function updateChangeSetStatus(this: StoryMapperRepository<"transaction">, changeSetId: string, status: ChangeSet["status"], selectedOperationIds?: readonly string[]): StoredChangeSet | undefined {
    this.assertWritable();
    const before = this.getChangeSet(changeSetId);
    if (!before) {
      return undefined;
    }
    if (before.undoneByRestore) throw new DomainError("conflict", "ChangeSet was undone by restore and is permanently historical.");
    if (before.status === "stale" || before.operationsSchemaVersion !== OPERATIONS_SCHEMA_VERSION) throw new DomainError("conflict", "Stale ChangeSet requires current-schema resubmission and fresh approval.");
    if (before.status === "applied") throw new DomainError("conflict", "Applied ChangeSet status cannot be changed.");
    changeSetSchema.parse(before);

    changeSetStatusSchema.parse(status);
    if (status !== "approved" && status !== "rejected" && status !== "conflict") throw new DomainError("validation", "ChangeSet lifecycle transition is executor-owned.");
    if (status === "rejected" && this.actor.actorType !== "human") throw new DomainError("protected", "Only a human can reject ChangeSets.");
    let approvalJson: string | null = null;
    if (status === "approved") {
      if (this.actor.actorType !== "human" && this.actor.actorType !== "agent") throw new DomainError("protected", "ChangeSet approval requires a Human or admitted Agent.");
      const settings = this.getSafetySettings(before.projectId);
      if (this.actor.actorType === "agent" && !agentApprovalAllowed(settings)) throw new DomainError("disabled", "Agent ChangeSet approval is disabled for this Project.");
      const current = changeSetSchema.parse(before);
      const snapshot = this.getOperationSnapshot(before.projectId);
      const selected = closedSelection(snapshot, current.operations, this.prepareOperationSupply(current.operations, snapshot), selectedOperationIds);
      if (this.actor.actorType !== "human" && current.operations.some((operation) => selected.includes(operation.operationId) && operation.op === "acknowledge" && operation.entity === "sourcePlan")) throw new DomainError("protected", "Source reconciliation requires human approval.");
      approvalJson = JSON.stringify({ actor: recordedActor(this.actor), approvedAt: new Date().toISOString(), operationsHash: operationsHash(current.operations), selectedOperationIds: selected });
    }
    this.db.update(changeSets).set({ status, approvalJson, approvalSchemaVersion: approvalJson === null ? null : 1 }).where(eq(changeSets.id, changeSetId)).run();
    const after = this.getChangeSet(changeSetId);
    if (!after) {
      return undefined;
    }

    this.logActivity(after.projectId, `changeSet.${status}`, "changeSet", changeSetId, before, after);
    return after;
  }

export function applyChangeSet(this: StoryMapperRepository<"transaction">, changeSetId: string, options: { selectedOperationIds?: readonly string[]; supply?: OperationSupply; restorePoint?: string; commandReceipt?: CommandChangeSetReceipt; initiatingActor?: ActorContext } = {}): StoredChangeSet | undefined {
  this.assertWritable();
  const stored = this.getChangeSet(changeSetId);
  if (!stored) return undefined;
  assertAgentWriteSafety(this, stored.projectId);
  assertExecutable(stored);
  const changeSet = changeSetSchema.parse(stored);
  if (changeSet.operations.some((operation) => operation.entity === "remoteWorkItemLink" && (operation.statusCatalog || operation.after.statusEvidence || operation.after.remoteState !== undefined)) && !this.db.select({ trusted: changeSets.trustedGithubStatus }).from(changeSets).where(eq(changeSets.id, changeSetId)).get()?.trusted) throw new DomainError("protected", "GitHub status adoption requires trusted remote preparation.");
  const command = options.commandReceipt && newCommandReceipts.get(options.commandReceipt);
  const newlyCreated = command?.id === changeSet.id && command.hash === operationsHash(changeSet.operations) && changeSet.status === "proposed";
  if (!newlyCreated && (changeSet.status !== "approved" || !changeSet.approval)) throw new DomainError("conflict", "Stored ChangeSet requires recorded approval before applying.");
  if (!newlyCreated && changeSet.approval!.operationsHash !== operationsHash(changeSet.operations)) throw new DomainError("conflict", "ChangeSet operations require fresh approval.");
  const snapshot = this.getOperationSnapshot(changeSet.projectId);
  const supply = options.supply ?? this.prepareOperationSupply(changeSet.operations, snapshot);
  const selected = options.selectedOperationIds ?? changeSet.approval?.selectedOperationIds ?? changeSet.operations.map((operation) => operation.operationId);
  if (!newlyCreated && JSON.stringify(selected) !== JSON.stringify(changeSet.approval!.selectedOperationIds)) throw new DomainError("conflict", "ChangeSet selection requires fresh approval.");
  if (changeSet.operations.some((operation) => selected.includes(operation.operationId) && operation.op === "acknowledge" && operation.entity === "sourcePlan") && (newlyCreated || changeSet.approval?.actor.actorType !== "human")) throw new DomainError("protected", "Source reconciliation requires recorded human approval.");
  const conflicts = collectOperationConflicts(snapshot, changeSet.operations, supply, selected);
  if (conflicts.length) throw new ChangeSetConflictError(changeSet.id, conflicts);
  const resolution = resolveOperations(snapshot, changeSet.operations, supply, selected, { retainOperationStates: false });
  if (JSON.stringify(resolution.selectedOperationIds) !== JSON.stringify(selected)) throw new DomainError("conflict", "ChangeSet dependencies changed; fresh approval is required.");
  if (options.commandReceipt) newCommandReceipts.delete(options.commandReceipt);
  const transaction = this.context.transaction!;
  for (const change of resolution.operations.flatMap((operation) => operation.changes)) {
    if (!(change.entity in OPERATION_ROOTS)) continue;
    const root = `${OPERATION_ROOTS[change.entity as keyof typeof OPERATION_ROOTS]}:${change.entityId}`;
    if (transaction.createdRoots.has(root) || transaction.bumpedRoots.has(root)) throw new DomainError("conflict", "ChangeSet application cannot change a root already mutated in this UnitOfWork.");
  }
  const reviewInputs = captureAppliedReviewInputs(this, changeSet);
  this.persistOperationResolution(resolution, changeSet.projectId, changeSet.id);
  enqueueAppliedReviews(this, changeSet, resolution, reviewInputs);
  const execution = { actor: recordedActor(this.actor), ...(changeSet.source === "github" && options.initiatingActor ? { initiatedBy: recordedActor(options.initiatingActor) } : {}), appliedAt: new Date().toISOString(), selectedOperationIds: resolution.selectedOperationIds, operationResults: resolution.operations.map((operation) => ({ operationId: operation.operationId, index: operation.index, entityIds: operation.changes.map((change) => change.entityId) })), ...(options.restorePoint ? { restorePoint: options.restorePoint } : {}), retainedPreparedEffects: [] };
  this.db.update(changeSets).set({ status: "applied", executionJson: JSON.stringify(execution), executionSchemaVersion: 1 }).where(eq(changeSets.id, changeSetId)).run();
  const after = this.getChangeSet(changeSetId)!;
  this.logActivity(after.projectId, "changeSet.applied", "changeSet", changeSetId, stored, after);
  return after;
}

function assertExecutable(stored: StoredChangeSet): void {
  if (stored.undoneByRestore || stored.status === "applied") throw new DomainError("conflict", "Applied or restore-undone ChangeSet is permanently historical.");
  if (stored.status === "stale" || stored.operationsSchemaVersion !== OPERATIONS_SCHEMA_VERSION) throw new DomainError("conflict", "Stale ChangeSet requires current-schema resubmission and fresh approval.");
}

function recordedActor(actor: ActorContext) { return { actorType: actor.actorType, actorId: actor.actorId, ...(actor.mcpSessionId ? { mcpSessionId: actor.mcpSessionId } : {}) }; }
function operationsHash(operations: unknown): string { return createHash("sha256").update(JSON.stringify(operations)).digest("hex"); }

function closedSelection(snapshot: Parameters<typeof operationDependencies>[0], operations: Parameters<typeof operationDependencies>[1], supply: OperationSupply, requested?: readonly string[]): string[] {
  const selected = new Set(requested ?? operations.map((operation) => operation.operationId));
  if (requested && selected.size !== requested.length || [...selected].some((id) => !operations.some((operation) => operation.operationId === id))) throw new DomainError("validation", "Selection contains duplicate or unknown operation ids.");
  const dependencies = operationDependencies(snapshot, operations, supply);
  for (const operation of operations) {
    if (dependencies.get(operation.operationId)!.some((id) => !operations.some((candidate) => candidate.operationId === id))) throw new DomainError("validation", "Operation references an unknown dependency.");
    if (dependencies.get(operation.operationId)!.some((id) => !selected.has(id))) selected.delete(operation.operationId);
  }
  return operations.filter((operation) => selected.has(operation.operationId)).map((operation) => operation.operationId);
}

function captureAppliedReviewInputs(repository: StoryMapperRepository<"transaction">, changeSet: ChangeSet): Map<string, string> {
  if (changeSet.proposedBy?.actorType !== "agent" || !repository.getCardReviewSettings(changeSet.projectId).reviewAfterAgentContentChange) return new Map();
  return projectReviewFingerprints(repository, changeSet.projectId);
}

function projectReviewFingerprints(repository: StoryMapperRepository<"transaction">, projectId: string): Map<string, string> {
  return new Map(repository.listStoryMaps(projectId).flatMap((map) => {
    const snapshot = repository.getStoryMapSnapshot(map.id)!;
    return snapshot.cards.filter((card) => card.level !== "note").map((card) => [card.id, reviewFingerprint(reviewInput(repository, card.id, undefined, snapshot))] as const);
  }));
}

function enqueueAppliedReviews(repository: StoryMapperRepository<"transaction">, changeSet: ChangeSet, resolution: ReturnType<typeof resolveOperations>, before: Map<string, string>): void {
  if (changeSet.proposedBy?.actorType !== "agent") return;
  const settings = repository.getCardReviewSettings(changeSet.projectId);
  if (!settings.reviewAfterAgentCreate && !settings.reviewAfterAgentContentChange) return;
  const ids = new Set<string>();
  if (settings.reviewAfterAgentCreate) for (const change of resolution.operations.flatMap((operation) => operation.changes)) {
    if (change.entity === "card" && change.after && !change.before && change.after.level !== "note") ids.add(change.entityId);
  }
  if (settings.reviewAfterAgentContentChange) for (const [cardId, fingerprint] of projectReviewFingerprints(repository, changeSet.projectId)) {
    if (before.has(cardId) && before.get(cardId) !== fingerprint) ids.add(cardId);
  }
  if (ids.size) repository.requestCardReviews(changeSet.projectId, [...ids], "save", undefined, { changeSetId: changeSet.id, actor: changeSet.proposedBy! });
}
