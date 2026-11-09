import { randomUUID } from "node:crypto";
import {
  DomainError,
  OPERATIONS_SCHEMA_VERSION,
  changeSetSchema,
  type ActorContext,
  type CapabilityDescriptor,
  type ChangeSetResponse,
  type ChangeSetsResponse,
  proposeReleaseSliceRequestSchema,
  type ProposeReleaseSliceRequest,
  type ProposeMapFromSourceDocumentRequest
} from "@storymapper/contracts";
import { agentApprovalAllowed, buildBacklogGroomingChangeSet, buildMapProposalChangeSet, buildReleaseSliceOperations, createChangeSet, proposeHappyPathSlice } from "@storymapper/core";
import { requireActor, requireHumanActor, requireAgentToolAccess } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";
import { visibleChangeSetWarnings } from "@storymapper/server/application/changeset/changeset-warning-visibility";
import { executeStoredOrNewChangeSet } from "@storymapper/server/application/changeset/changeset-executor";
import { getBacklogHealthReport } from "@storymapper/server/application/report/report.use-cases";

export const listChangeSetsDescriptor: CapabilityDescriptor = {
  name: "listChangeSets",
  kind: "read",
  route: "GET /api/changesets", tool: "ListChangeSets" };

export function listChangeSets(deps: ApplicationDeps, actor: ActorContext, projectId?: string): ChangeSetsResponse {
  requireActor(actor);
  return { changeSets: deps.repository.listChangeSets(projectId).map((changeSet) => visibleChangeSetWarnings(deps.repository, actor, changeSet)) };
}

export const approveChangeSetDescriptor: CapabilityDescriptor = {
  name: "approveChangeSet",
  kind: "write", tool: "ApproveChangeSet",
  route: "POST /api/changesets/:changeSetId/approve"
};

export function approveChangeSet(deps: ApplicationDeps, actor: ActorContext, changeSetId: string, selectedOperationIds?: readonly string[]): ChangeSetResponse {
  requireActor(actor);
  const changeSet = deps.unitOfWork.run(actor, ({ repository }) => {
    const current = repository.getChangeSet(changeSetId);
    if (!current) throw new DomainError("not_found", "ChangeSet not found.");
    if (current.undoneByRestore || current.status === "applied") throw new DomainError("conflict", "Applied or restore-undone ChangeSet is permanently historical.");
    if (current.status === "stale" || current.operationsSchemaVersion !== OPERATIONS_SCHEMA_VERSION) throw new DomainError("conflict", "Stale ChangeSet requires current-schema resubmission and fresh approval.");
    if (repository.getReviewFixForChangeSet(current.projectId, changeSetId)) requireHumanActor(actor);
    const closedIds = repository.selectChangeSetOperationIds(changeSetId, selectedOperationIds);
    const selected = changeSetSchema.parse(current).operations.filter((operation) => closedIds.includes((operation as { operationId: string }).operationId));
    if (actor.actorType !== "human" && selected.some((operation) => operation.op === "acknowledge" && operation.entity === "sourcePlan")) throw new DomainError("protected", "Source reconciliation requires human approval.");
    const owners = resolveToolProjectIds(repository as unknown as ApplicationDeps["repository"], "ApproveChangeSet", { changeSetId }, { ...current, operations: selected });
    for (const projectId of owners) {
      if (projectId !== current.projectId) throw new DomainError("validation", "ChangeSet references a foreign Project.");
      const settings = repository.getSafetySettings(projectId);
      if (actor.actorType === "agent" && !agentApprovalAllowed(settings)) throw new DomainError("disabled", "Agent ChangeSet approval is disabled for this Project.");
    }
    const value = repository.updateChangeSetStatus(changeSetId, "approved", closedIds);
    if (!value) throw new DomainError("not_found", "ChangeSet not found.");
    return changeSetSchema.parse(value);
  });
  if (!changeSet) throw new DomainError("not_found", "ChangeSet not found.");
  return { changeSet: visibleChangeSetWarnings(deps.repository, actor, changeSetSchema.parse(changeSet)) };
}

export const rejectChangeSetDescriptor: CapabilityDescriptor = {
  name: "rejectChangeSet",
  kind: "human-only",
  route: "POST /api/changesets/:changeSetId/reject"
};

export function rejectChangeSet(deps: ApplicationDeps, actor: ActorContext, changeSetId: string): ChangeSetResponse {
  requireHumanActor(actor);
  const changeSet = deps.unitOfWork.run(actor, ({ repository }) => repository.updateChangeSetStatus(changeSetId, "rejected"));
  if (!changeSet) throw new DomainError("not_found", "ChangeSet not found.");
  return { changeSet: visibleChangeSetWarnings(deps.repository, actor, changeSetSchema.parse(changeSet)) };
}

export const applyChangeSetDescriptor: CapabilityDescriptor = {
  name: "applyChangeSet",
  kind: "write",
  tool: "ApplyChangeSet",
  route: "POST /api/changesets/:changeSetId/apply"
};

export function applyChangeSet(deps: ApplicationDeps, actor: ActorContext, changeSetId: string, selectedOperationIds?: readonly string[]): ChangeSetResponse {
  return executeStoredOrNewChangeSet(deps, actor, changeSetId, selectedOperationIds);
}

export const proposeMapFromSourceDocumentDescriptor: CapabilityDescriptor = {
  name: "proposeMapFromSourceDocument",
  kind: "write",
  tool: "ProposeMapFromSourceDocument"
};

export function proposeMapFromSourceDocument(deps: ApplicationDeps, actor: ActorContext, input: ProposeMapFromSourceDocumentRequest): ChangeSetResponse {
  const details = deps.repository.getSourceDocumentDetails(input.sourceDocumentId);
  if (!details) throw new DomainError("not_found", "Source document not found.");
  if (details.document.projectId !== input.projectId) throw new DomainError("not_found", "Source document not found in the supplied Project.");
  const storyMapId = input.storyMapId ?? deps.repository.listStoryMaps(input.projectId)[0]?.id;
  if (!storyMapId) throw new DomainError("validation", "Story map is required for proposal context.");

  const changeSet = deps.unitOfWork.run(actor, ({ repository }) => repository.createChangeSet(buildMapProposalChangeSet({
    id: randomUUID(), createdAt: new Date().toISOString(),
    projectId: input.projectId,
    storyMapId,
    documentTitle: details.document.title,
    productPurpose: repository.getProductContext(input.projectId, storyMapId).purpose,
    chunks: details.chunks
  })));

  return { changeSet: visibleChangeSetWarnings(deps.repository, actor, changeSetSchema.parse(changeSet)) };
}

export const proposeBacklogGroomingDescriptor: CapabilityDescriptor = {
  name: "proposeBacklogGrooming",
  kind: "write",
  tool: "ProposeBacklogGrooming"
};

export function proposeBacklogGrooming(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): ChangeSetResponse {
  const snapshot = deps.repository.getStoryMapSnapshot(storyMapId);
  const report = getBacklogHealthReport(deps, actor, storyMapId);
  if (!snapshot || !report) throw new DomainError("not_found", "Story map not found.");

  const changeSet = deps.unitOfWork.run(actor, ({ repository }) => repository.createChangeSet(buildBacklogGroomingChangeSet({
    id: randomUUID(), createdAt: new Date().toISOString(),
    projectId: snapshot.storyMap.projectId,
    issues: report.issues,
    versionsByCardId: new Map(snapshot.cards.map((card) => [card.id, card.version]))
  })));

  return { changeSet: visibleChangeSetWarnings(deps.repository, actor, changeSetSchema.parse(changeSet)) };
}

export const proposeReleaseSliceDescriptor: CapabilityDescriptor = {
  name: "proposeReleaseSlice",
  kind: "write",
  tool: "ProposeReleaseSlice"
};

export function proposeReleaseSlice(deps: ApplicationDeps, actor: ActorContext, request: ProposeReleaseSliceRequest): ChangeSetResponse {
  const input = proposeReleaseSliceRequestSchema.parse(request);
  const { storyMapId, releaseTarget } = input;
  requireAgentToolAccess(deps.repository, actor, "ProposeReleaseSlice", input);
  const snapshot = deps.repository.getStoryMapSnapshot(storyMapId);
  if (!snapshot) throw new DomainError("not_found", "Story map not found.");
  const candidate = proposeHappyPathSlice(snapshot.cards);
  const release = releaseTarget.kind === "existing" ? snapshot.releases.find((row) => row.id === releaseTarget.releaseId) : undefined;
  if (releaseTarget.kind === "existing" && !release) throw new DomainError("not_found", "Release not found in the supplied Story Map.");
  const versionsByCardId = new Map(snapshot.cards.map((card) => [card.id, card.version]));
  const operations = buildReleaseSliceOperations(storyMapId, candidate, release, versionsByCardId, input.rationale);
  const changeSet = deps.unitOfWork.run(actor, ({ repository }) => repository.createChangeSet(createChangeSet({
    id: randomUUID(), createdAt: new Date().toISOString(),
    projectId: snapshot.storyMap.projectId,
    title: "Proposed release slice",
    source: "mcp",
    operations
  })));
  return { changeSet: visibleChangeSetWarnings(deps.repository, actor, changeSetSchema.parse(changeSet)) };
}
