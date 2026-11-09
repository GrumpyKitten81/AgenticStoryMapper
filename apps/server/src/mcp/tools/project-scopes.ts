import { agentAccessEnabled } from "@storymapper/core";
import { sourcePlanAcknowledgmentSchema, builtinProposalTemplateSchema, changeOperationSchema, DomainError, type StoredChangeSet, type McpToolName, type SubmitChangeSetInput } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db";
import { submissionOperations } from "@storymapper/server/application/changeset/submission-operations";

interface ScopeOperation {
  op: string; entity: string; entityId?: string | undefined; operationId?: string | undefined; before?: unknown; after?: unknown; context?: unknown;
  selector?: { kind: string; id?: string | undefined; localId?: string | undefined; scopeId?: string | undefined } | undefined;
}

const READABLE_OPERATION_PAIRS = new Set([...changeOperationSchema.options.map((member) => `${member.shape.op.value}:${member.shape.entity.value}`), "delete:sourceLink"]);

function readableScopeOperations(values: unknown[]): ScopeOperation[] | undefined {
  return values.every(isScopeOperation) ? values : undefined;
}

function isScopeOperation(value: unknown): value is ScopeOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  if (typeof operation.op !== "string" || typeof operation.entity !== "string" || !READABLE_OPERATION_PAIRS.has(`${operation.op}:${operation.entity}`)) return false;
  if (operation.entityId !== undefined && typeof operation.entityId !== "string") return false;
  if (!["create", "upsert", "import"].includes(operation.op) && !((operation.op === "set" && operation.entity === "remoteWorkItemLink") || operation.entity === "cardDependency" || operation.entity === "sourcePlan") && typeof operation.entityId !== "string" && operation.selector === undefined) return false;
  const selector = operation.selector;
  if (selector === undefined) return true;
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) return false;
  const fields = selector as Record<string, unknown>;
  if (fields.kind === "id") return typeof fields.id === "string";
  if (fields.kind === "local") return typeof fields.localId === "string";
  return fields.kind === "externalRef" && typeof fields.scopeId === "string";
}

type ScopeResolver = (id: string) => string | undefined;
const scopeAliases: Record<string, string> = { prerequisiteCardId: "cardId", cards: "cardId", affectedCards: "cardId", cardIds: "cardId", connectionIds: "connectionId", defaultConnectionId: "connectionId", sourceStoryMapId: "storyMapId", workflowStatusId: "statusId", storyTemplateId: "templateId", addPersonaId: "personaId", removePersonaId: "personaId", addAnnotationId: "annotationId", removeAnnotationId: "annotationId", sourceChunkIds: "chunkId", syncConflictId: "conflictId" };
const deletedScopeTypes: Record<string, string> = { storyMapId: "storyMap", cardId: "card", parentId: "card", releaseId: "release", personaId: "persona", annotationId: "annotation", statusId: "workflowStatus", templateId: "storyTemplate", attachmentId: "cardAttachment", linkId: "externalRef", sourceLinkId: "sourceLink", externalRefId: "externalRef", roadmapId: "roadmap", columnId: "roadmapColumn", swimlaneId: "roadmapSwimlane", roadmapCardId: "roadmapCard" };

function entityScopeKey(entity: string): string {
  const entityKeys: Record<string, string> = { githubExternalRef: "externalRefId", roadmapColumn: "columnId", roadmapSwimlane: "swimlaneId", storyMapCopy: "storyMapId", githubBoardImport: "storyMapId" };
  const key = entityKeys[entity] ?? `${entity}Id`;
  return scopeAliases[key] ?? key;
}

function requiredScope(projectId: string | undefined): string {
  if (!projectId) throw new DomainError("not_found", "Target entity not found.");
  return projectId;
}

function scopeResolvers(repository: StoryMapperRepository): Record<string, ScopeResolver> {
  let chunkProjects: Map<string, string> | undefined;
  const map = (id: string) => repository.listStoryMaps().find((item) => item.id === id)?.projectId;
  const card = (id: string) => { const item = repository.getCardDetails(id); return item ? map(item.storyMapId) : undefined; };
  const release = (id: string) => { const item = repository.getRelease(id); return item ? map(item.storyMapId) : undefined; };
  const roadmap = (id: string) => repository.getRoadmap(id)?.projectId;
  return {
    projectId: (id) => id,
    storyMapId: map, cardId: card, parentId: card, releaseId: release,
    personaId: (id) => repository.getPersona(id)?.projectId,
    annotationId: (id) => repository.getAnnotation(id)?.projectId,
    statusId: (id) => repository.getWorkflowStatus(id)?.projectId,
    templateId: (id) => repository.getStoryTemplate(id)?.projectId,
    connectionId: (id) => repository.getConnectorConnection(id)?.projectId,
    roadmapId: roadmap,
    columnId: (id) => roadmapChildProject(repository, "column", id),
    swimlaneId: (id) => roadmapChildProject(repository, "swimlane", id),
    attachmentId: (id) => attachmentProject(repository, id),
    roadmapCardId: (id) => { const item = repository.getRoadmapCard(id); return item ? roadmap(item.roadmapId) : undefined; },
    documentId: (id) => repository.getSourceDocumentDetails(id)?.document.projectId,
    sourceDocumentId: (id) => repository.getSourceDocumentDetails(id)?.document.projectId,
    chunkId: (id) => (chunkProjects ??= sourceChunkProjects(repository)).get(id),
    sourceLinkId: (id) => { const item = sourceLink(repository, id); return item ? card(item.cardId) : undefined; },
    linkId: (id) => { const item = repository.getGitHubLink(id); return item?.cardId ? card(item.cardId) : item?.releaseId ? release(item.releaseId) : undefined; },
    remoteWorkItemLinkId: (id) => repository.listStoryMaps().find((item) => repository.listRemoteWorkItemLinksForStoryMap(item.id).some((link) => link.id === id))?.projectId,
    syncRunId: (id) => repository.listStoryMaps().find((item) => repository.getWorkItemSyncHealthData(item.id)?.runs.some((run) => run.id === id))?.projectId,
    conflictId: (id) => { const item = repository.getSyncConflict(id); return item?.cardId ? card(item.cardId) : item ? repository.getConnectorConnection(item.connectionId)?.projectId : undefined; },
    externalRefId: (id) => {
      const ref = repository.listStoryMaps().flatMap((map) => repository.listExternalRefsForStoryMap(map.id)).concat(repository.listProjects().flatMap((project) => repository.listExternalRefsForPersonas(repository.listPersonas(project.id).map((persona) => persona.id)))).find((entry) => entry.id === id);
      return ref ? ref.entityType === "card" ? card(ref.entityId) : ref.entityType === "release" ? release(ref.entityId) : repository.getPersona(ref.entityId)?.projectId : undefined;
    },
    changeSetId: (id) => repository.getChangeSet(id)?.projectId
  };
}

export function resolveAuditProjectIds(repository: StoryMapperRepository, input: unknown): string[] {
  const scopes = new Set<string>();
  const resolvers = scopeResolvers(repository);
  const { projectId: _project, ...entityResolvers } = resolvers;
  collectScopes(input, entityResolvers, scopes, new Set(), "ListActivity", true);
  if (!scopes.size && input && typeof input === "object" && "projectId" in input && typeof input.projectId === "string" && repository.listProjects().some((project) => project.id === input.projectId)) scopes.add(input.projectId);
  return [...scopes];
}

function sourceLink(repository: StoryMapperRepository, id: string) {
  return repository.listStoryMaps().flatMap((map) => repository.listSourceLinksForStoryMap(map.id)).find((link) => link.id === id);
}

function roadmapChildProject(repository: StoryMapperRepository, kind: "column" | "swimlane", id: string): string | undefined {
  for (const project of repository.listProjects()) {
    const roadmaps = [...repository.listRoadmaps(project.id), ...repository.listStoryMaps(project.id).flatMap((map) => repository.listRoadmaps(project.id, map.id))];
    for (const roadmap of roadmaps) {
      const children = kind === "column" ? repository.listRoadmapColumns(roadmap.id) : repository.listRoadmapSwimlanes(roadmap.id);
      if (children.some((child) => child.id === id)) return project.id;
    }
  }
  return undefined;
}

function attachmentProject(repository: StoryMapperRepository, attachmentId: string): string | undefined {
  for (const map of repository.listStoryMaps()) {
    for (const card of repository.listCards(map.id)) {
      if (repository.listCardAttachments(card.id).some((attachment) => attachment.id === attachmentId)) return map.projectId;
    }
  }
  return undefined;
}

function sourceChunkProjects(repository: StoryMapperRepository): Map<string, string> {
  const owners = new Map<string, string>();
  for (const project of repository.listProjects()) {
    for (const summary of repository.listSourceDocumentSummaryData(project.id)) {
      for (const chunk of repository.getSourceDocumentDetails(summary.document.id)?.chunks ?? []) if (!owners.has(chunk.id)) owners.set(chunk.id, project.id);
    }
  }
  return owners;
}

function collectScopes(value: unknown, resolvers: Record<string, ScopeResolver>, scopes: Set<string>, createdIds: Set<string>, toolName: McpToolName, existingOnly = false): boolean {
  if (!value || typeof value !== "object") return true;
  if (Array.isArray(value)) return value.map((item) => collectScopes(item, resolvers, scopes, createdIds, toolName, existingOnly)).every(Boolean);
  const record = value as Record<string, unknown>;
  let resolved = true;
  for (const [key, target] of Object.entries(record)) {
    if (key === "entityId" && record.op === "bulk") continue;
    const inferredKey = key === "targetId" ? record.targetType === "release" ? "releaseId" : "cardId" : key === "entityId" && typeof (record.entity ?? record.entityType) === "string" ? entityScopeKey(String(record.entity ?? record.entityType)) : key;
    const resolverKey = scopeAliases[inferredKey] ?? inferredKey;
    const resolver = resolvers[resolverKey];
    if (resolver && !(key === "templateId" && builtinProposalTemplateSchema.safeParse(target).success)) {
      if (target && typeof target === "object" && !Array.isArray(target) && "kind" in target) {
        const selector = target as { kind: string; id?: string; localId?: string; scopeId?: string };
        if (selector.kind === "id" || selector.kind === "local") resolved = collectScopes({ [resolverKey]: selector.id ?? selector.localId }, resolvers, scopes, createdIds, toolName, existingOnly) && resolved;
        else if (selector.kind === "externalRef") {
          const projectId = selector.scopeId ? resolvers.storyMapId!(selector.scopeId) ?? (createdIds.has(selector.scopeId) ? undefined : resolvers.projectId?.(selector.scopeId)) : undefined;
          if (projectId) scopes.add(projectId); else if (selector.scopeId && createdIds.has(selector.scopeId)) continue; else if (existingOnly) resolved = false; else requiredScope(projectId);
        }
        continue;
      }
      for (const id of (Array.isArray(target) ? target : [target]).map((item) => (key === "cards" || key === "affectedCards") ? (item as { id?: unknown } | null)?.id : item)) {
        if (typeof id === "string") {
          const projectId = resolver(id);
          if (projectId) scopes.add(projectId);
          else if (key === "affectedCards") continue;
          else if (!(key === "entityId" || ["storyMapId", "cardId", "parentId", "releaseId", "personaId", "annotationId", "roadmapId", "columnId", "swimlaneId", "roadmapCardId", "statusId", "templateId", "attachmentId", "syncRunId", "conflictId", "remoteWorkItemLinkId", "externalRefId"].includes(resolverKey)) || !createdIds.has(id)) {
            if (existingOnly) resolved = false;
            else requiredScope(projectId);
          }
        }
      }
    } else if (existingOnly || ["patch", "before", "after", "context", "selector", "sources", "chunk", "entries", "current", "binding", "selection", "placement"].includes(key)) resolved = collectScopes(target, resolvers, scopes, createdIds, toolName, existingOnly) && resolved;
  }
  return resolved;
}

function acknowledgmentScopes(repository: StoryMapperRepository, value: unknown): unknown {
  const parsed = sourcePlanAcknowledgmentSchema.safeParse(value);
  if (!parsed.success) throw new DomainError("validation", "Invalid source acknowledgment scope evidence.");
  const acknowledgment = parsed.data;
  const baseline = repository.getSourcePlanBaseline(acknowledgment.storyMapId, acknowledgment.system);
  if (!baseline || baseline.id !== acknowledgment.baselineId) throw new DomainError("not_found", "Source baseline not found in the supplied Story Map.");
  const currentCards = [];
  for (const entry of acknowledgment.entries) {
    const card = repository.getCardDetails(entry.cardId);
    if (card && card.storyMapId !== acknowledgment.storyMapId) throw new DomainError("validation", "Acknowledgment references a foreign Story Map.");
    if (!card && !baseline.entries.some((prior) => prior.cardId === entry.cardId)) throw new DomainError("not_found", "Acknowledgment Card identity is unknown.");
    if (entry.current && (entry.current.id !== entry.cardId || entry.current.storyMapId !== acknowledgment.storyMapId) || entry.before && (entry.before.cardId !== entry.cardId || entry.before.identity.id !== entry.cardId || entry.before.card && entry.before.card.storyMapId !== acknowledgment.storyMapId)) throw new DomainError("validation", "Acknowledgment evidence references a foreign Card or Story Map.");
    const priorCard = entry.before?.card;
    const priorParent = priorCard?.parentId ? repository.getCardDetails(priorCard.parentId) : undefined;
    if (priorParent && priorParent.storyMapId !== acknowledgment.storyMapId) throw new DomainError("validation", "Acknowledgment prior parent is outside its Story Map.");
    const priorRelease = priorCard?.releaseId ? repository.getRelease(priorCard.releaseId) : undefined;
    if (priorRelease && priorRelease.storyMapId !== acknowledgment.storyMapId) throw new DomainError("validation", "Acknowledgment prior Release is outside its Story Map.");
    const priorBinding = entry.before?.binding;
    if (priorBinding && (priorBinding.entityType !== "card" || priorBinding.entityId !== entry.cardId || priorBinding.system !== acknowledgment.system || priorBinding.scopeId !== acknowledgment.storyMapId)) throw new DomainError("validation", "Acknowledgment prior binding is outside its Card scope.");
    if (entry.source?.releaseId && repository.getRelease(entry.source.releaseId)?.storyMapId !== acknowledgment.storyMapId && !baseline.releases.some((release) => release.id === entry.source!.releaseId)) throw new DomainError("validation", "Acknowledgment source references a foreign Release.");
    if (entry.current) currentCards.push({ cardId: entry.cardId, storyMapId: entry.current.storyMapId, parentId: entry.current.parentId, releaseId: entry.current.releaseId });
    if (entry.binding && (entry.binding.entityType !== "card" || entry.binding.entityId !== entry.cardId || entry.binding.system !== acknowledgment.system || entry.binding.scopeId !== acknowledgment.storyMapId)) throw new DomainError("validation", "Acknowledgment binding does not match its Card and system.");
  }
  return { storyMapId: acknowledgment.storyMapId, entries: currentCards };
}

export function canReadChangeSet(repository: StoryMapperRepository, changeSet: StoredChangeSet): boolean {
  const scopes = new Set([changeSet.projectId]);
  const operations = readableScopeOperations(changeSet.operations);
  if (!operations) return false;
  const createdIds = new Set<string>();
  const resolvers = scopeResolvers(repository);
  const historicalResolvers = changeSet.status === "applied" ? historicalScopeResolvers(repository, resolvers) : resolvers;
  let resolved = true;
  for (const operation of operations) {
    const operationResolvers = historicalResolvers;
    const ownIds = new Set(createdIds);
    if ((operation.op === "create" || operation.op === "upsert" || operation.op === "import" || operation.op === "link" || operation.op === "set" && operation.entity === "externalRef") && operation.entityId) ownIds.add(operation.entityId);
    const { selector, entityId, ...remainingScopeFields } = operation;
    const scopeFields = selector ? remainingScopeFields : { ...remainingScopeFields, entityId };
    let dependencies: unknown = scopeFields;
    if (operation.entity === "sourcePlan") {
      try { dependencies = { after: acknowledgmentScopes(repository, operation.after) }; }
      catch (error) { if (error instanceof DomainError) return false; throw error; }
    }
    if (selector) {
      const key = entityScopeKey(operation.entity);
      if (selector.kind === "id" || selector.kind === "local") resolved = collectScopes({ [key]: selector.id ?? selector.localId }, operationResolvers, scopes, createdIds, "ListChangeSets", true) && resolved;
      else if (selector.scopeId) {
        const scope = operationResolvers.storyMapId!(selector.scopeId) ?? repository.listProjects().find((project) => project.id === selector.scopeId)?.id;
        if (scope) scopes.add(scope); else if (!createdIds.has(selector.scopeId)) resolved = false;
      }
    }
    resolved = collectScopes(dependencies, operationResolvers, scopes, ownIds, "ListChangeSets", true) && resolved;
    const target = operation.entityId ? operation.entity === "githubExternalRef" ? repository.getGitHubLink(operation.entityId) : operation.entity === "sourceLink" ? sourceLink(repository, operation.entityId) : undefined : undefined;
    if (target) resolved = collectScopes(target, operationResolvers, scopes, ownIds, "ListChangeSets", true) && resolved;
    if ((operation.op === "create" || operation.op === "upsert" || operation.op === "import") && operation.entityId) createdIds.add(operation.entityId);
  }
  const projects = new Set(repository.listProjects().map((project) => project.id));
  return resolved && [...scopes].every((projectId) => projects.has(projectId) && agentAccessEnabled(repository.getSafetySettings(projectId)));
}

function historicalScopeResolvers(repository: StoryMapperRepository, resolvers: Record<string, ScopeResolver>): Record<string, ScopeResolver> {
  const owners = new Map<string, Set<string>>();
  for (const event of repository.listActivity()) {
    if (!event.projectId || event.undoneByRestore) continue;
    const action = event.affectedEntityType === "sourceLink" ? "cardSourceLink.deleted" : `${event.affectedEntityType}.deleted`;
    const deletions: Array<{ entity: string; id: string }> = (event.action === action || event.affectedEntityType === "externalRef" && event.action === "externalRef.detached") && event.affectedEntityType && event.affectedEntityId ? [{ entity: event.affectedEntityType, id: event.affectedEntityId }] : [];
    if (event.action === "changeSet.operation.applied" && event.after && typeof event.after === "object" && "changes" in event.after && Array.isArray(event.after.changes)) {
      for (const raw of event.after.changes) {
        if (!raw || typeof raw !== "object") continue;
        const change = raw as Record<string, unknown>;
        if (typeof change.entity !== "string" || typeof change.entityId !== "string" || !change.before || change.after) continue;
        if (!["card", "release", "persona", "storyMap", "annotation", "workflowStatus", "storyTemplate", "attachment", "sourceLink", "githubExternalRef", "externalRef", "roadmap", "roadmapColumn", "roadmapSwimlane", "roadmapCard"].includes(change.entity)) continue;
        deletions.push({ entity: change.entity === "attachment" ? "cardAttachment" : change.entity, id: change.entityId });
      }
    }
    for (const deletion of deletions) {
      const key = `${deletion.entity}:${deletion.id}`;
      const projectIds = owners.get(key) ?? new Set<string>();
      projectIds.add(event.projectId);
      owners.set(key, projectIds);
    }
  }
  return Object.fromEntries(Object.entries(resolvers).map(([key, resolve]) => [key, (id: string) => {
    const projectId = resolve(id);
    if (projectId) return projectId;
    const entityType = deletedScopeTypes[key];
    const projectIds = entityType ? owners.get(`${entityType}:${id}`) : undefined;
    return projectIds?.size === 1 ? [...projectIds][0] : undefined;
  }]));
}

export function resolveToolProjectIds(repository: StoryMapperRepository, name: McpToolName, input: unknown, changeSetOverride?: StoredChangeSet): string[] {
  const scopes = new Set<string>();
  const resolvers = scopeResolvers(repository);
  const createdIds = new Set<string>();
  const record = input as Record<string, unknown>;
  collectExternalRefScope(name, record, resolvers, scopes);
  const changeSet = changeSetOverride ?? (typeof record.changeSetId === "string" ? repository.getChangeSet(record.changeSetId) : undefined);
  let scopedOperations = name === "SubmitChangeSet" ? submissionOperations(input as SubmitChangeSetInput) : changeSet?.operations ?? [];
  if (changeSet && !changeSetOverride && (name === "ApproveChangeSet" || name === "ApplyChangeSet" && changeSet.approval)) {
    if (name === "ApplyChangeSet" && record.selectedOperationIds !== undefined && JSON.stringify(record.selectedOperationIds) !== JSON.stringify(changeSet.approval!.selectedOperationIds)) throw new DomainError("conflict", "ChangeSet selection requires fresh approval.");
    const selected = repository.selectChangeSetOperationIds(changeSet.id, name === "ApproveChangeSet" ? record.selectedOperationIds as string[] | undefined : changeSet.approval!.selectedOperationIds);
    scopedOperations = scopedOperations.filter((operation) => selected.includes((operation as { operationId: string }).operationId));
  }
  const operations = readableScopeOperations(scopedOperations);
  if (!operations) throw new DomainError("conflict", "Historical operations cannot be authorized for execution.");
  collectScopes(name === "SubmitChangeSet" ? { projectId: record.projectId } : input, resolvers, scopes, createdIds, name);
  if (changeSet || name === "SubmitChangeSet") for (const [index, operation] of operations.entries()) {
    try {
      if (name === "SubmitChangeSet" && operation.entityId && (!operation.selector || operation.op === "upsert")) {
        const owner = resolvers[entityScopeKey(operation.entity)]?.(operation.entityId);
        if (owner && owner !== record.projectId) throw new DomainError("validation", "Operation references a foreign Project.");
      }
      const key = entityScopeKey(operation.entity);
      if (!operation.selector && operation.op !== "create" && operation.op !== "upsert" && operation.op !== "import" && operation.op !== "bulk" && operation.entity !== "sourceLink" && operation.entity !== "externalRef" && resolvers[key]) collectScopes({ [key]: operation.entityId }, resolvers, scopes, createdIds, name);
      collectScopes(operation.entity === "sourcePlan" ? acknowledgmentScopes(repository, operation.after) : operation.after, resolvers, scopes, createdIds, name);
      collectScopes(operation.context, resolvers, scopes, createdIds, name);
      collectScopes((operation as ScopeOperation & { sources?: unknown }).sources, resolvers, scopes, createdIds, name);
      if (operation.selector) {
        if (operation.selector.kind === "id") collectScopes({ [key]: operation.selector.id }, resolvers, scopes, createdIds, name);
        else if (operation.selector.kind === "local") collectScopes({ [key]: operation.selector.localId }, resolvers, scopes, createdIds, name);
        else if (operation.selector.scopeId) {
          const scope = resolvers.storyMapId!(operation.selector.scopeId) ?? repository.listProjects().find((project) => project.id === operation.selector!.scopeId)?.id;
          if (scope) scopes.add(scope); else if (!createdIds.has(operation.selector.scopeId)) requiredScope(scope);
        }
      }
      if ((operation.op === "create" || operation.op === "upsert" || operation.op === "import") && operation.entityId) createdIds.add(operation.entityId);
      if (name === "SubmitChangeSet" && [...scopes].some((id) => id !== record.projectId)) throw new DomainError("validation", "Operation references a foreign Project.");
    } catch (error) {
      if (name === "SubmitChangeSet" && error instanceof DomainError) throw new DomainError(error.code, error.message, { ...error.details, index, operationId: operation.operationId });
      throw error;
    }
  }
  collectReadDependencies(repository, name, record, resolvers, scopes);
  collectOwnedDependencies(repository, name, record, resolvers, scopes);
  const availableProjects = new Set(repository.listProjects().map((project) => project.id));
  if ([...scopes].some((projectId) => !availableProjects.has(projectId))) throw new DomainError("disabled", "Project is not available for agent access.");
  return [...scopes];
}

function externalRefProjectId(resolvers: Record<string, ScopeResolver>, entityType: unknown, entityId: unknown): string | undefined {
  if (typeof entityId !== "string" || !["card", "release", "persona"].includes(entityType as string)) return undefined;
  return resolvers[`${entityType}Id`]!(entityId);
}

function collectReadDependencies(repository: StoryMapperRepository, name: McpToolName, input: Record<string, unknown>, resolvers: Record<string, ScopeResolver>, scopes: Set<string>): void {
  if (["GetSourceDocument"].includes(name) && typeof input.documentId === "string") {
    const details = repository.getSourceDocumentDetails(input.documentId);
    for (const link of details?.links ?? []) scopes.add(requiredScope(resolvers.cardId!(link.cardId)));
  }
  if (name === "GetRoadmapDetails" && typeof input.roadmapId === "string") {
    for (const reference of repository.listRoadmapReferences(input.roadmapId)) {
      collectScopes({ roadmapCardId: reference.roadmapCardId }, resolvers, scopes, new Set(), name);
      const projectId = resolvers[`${reference.targetType}Id`]!(reference.targetId);
      if (projectId) scopes.add(projectId);
    }
  }
  collectSyncDependencies(repository, name, input, resolvers, scopes);
  if (["GetStoryMapSnapshot", "GetStoryMapData", "CreateAiProposal", "ExportStoryMap"].includes(name) && typeof input.storyMapId === "string") {
    for (const chunk of repository.listSourceChunksForStoryMap(input.storyMapId)) scopes.add(requiredScope(resolvers.chunkId!(chunk.id)));
    collectScopes(repository.listGitHubLinksForStoryMap(input.storyMapId), resolvers, scopes, new Set(), name);
    collectScopes(repository.listRemoteWorkItemLinksForStoryMap(input.storyMapId), resolvers, scopes, new Set(), name);
  }
}

function collectSyncDependencies(repository: StoryMapperRepository, name: McpToolName, input: Record<string, unknown>, resolvers: Record<string, ScopeResolver>, scopes: Set<string>): void {
  if (typeof input.storyMapId !== "string") return;
  if (name === "PullStoryMapGitHubLinks") collectScopes(repository.listRemoteWorkItemLinksForStoryMap(input.storyMapId), resolvers, scopes, new Set(), name);
  if (name === "GetWorkItemSyncHealth") {
    const data = repository.getWorkItemSyncHealthData(input.storyMapId);
    collectScopes([...data.links, ...data.runs, ...data.openConflicts], resolvers, scopes, new Set(), name);
  }
}

function collectOwnedDependencies(repository: StoryMapperRepository, name: McpToolName, input: Record<string, unknown>, resolvers: Record<string, ScopeResolver>, scopes: Set<string>): void {
  const roadmapId = typeof input.roadmapId === "string" ? input.roadmapId : typeof input.roadmapCardId === "string" ? repository.getRoadmapCard(input.roadmapCardId)?.roadmapId : undefined;
  if (roadmapId) collectScopes(repository.getRoadmap(roadmapId), resolvers, scopes, new Set(), name);
  if (typeof input.linkId === "string") collectScopes(repository.getGitHubLink(input.linkId), resolvers, scopes, new Set(), name);
  if (typeof input.conflictId === "string") collectScopes(repository.getSyncConflict(input.conflictId), resolvers, scopes, new Set(), name);
}

export function assertMatchingScopes(repository: StoryMapperRepository, input: unknown): void {
  const record = input as Record<string, unknown>;
  if (typeof record.projectId === "string" && typeof record.storyMapId === "string") {
    const map = repository.listStoryMaps().find((item) => item.id === record.storyMapId);
    if (map?.projectId !== record.projectId) throw new DomainError("validation", "Story map does not belong to the supplied Project.");
  }
  if (typeof record.storyMapId === "string" && typeof record.releaseId === "string" && repository.getRelease(record.releaseId)?.storyMapId !== record.storyMapId) throw new DomainError("validation", "Release does not belong to the supplied Story Map.");
  if (typeof record.projectId === "string" && typeof record.personaId === "string" && repository.getPersona(record.personaId)?.projectId !== record.projectId) throw new DomainError("validation", "Persona does not belong to the supplied Project.");
  if (typeof record.roadmapId === "string" && typeof record.swimlaneId === "string" && !repository.listRoadmapSwimlanes(record.roadmapId).some((lane) => lane.id === record.swimlaneId)) throw new DomainError("validation", "Swimlane does not belong to the supplied Roadmap.");
}

function collectExternalRefScope(name: McpToolName, record: Record<string, unknown>, resolvers: Record<string, ScopeResolver>, scopes: Set<string>): void {
  if (name === "SetExternalRef") {
    const projectId = externalRefProjectId(resolvers, record.entityType, record.entityId);
    if (!projectId) throw new DomainError("not_found", "Target entity not found.");
    scopes.add(projectId);
  }
}
