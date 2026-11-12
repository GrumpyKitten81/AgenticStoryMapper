import { parseStoredJson, parseStoredOperationsJson } from "@storymapper/db/versioned-json";
import { remoteWorkItemSyncStateSchema } from "@storymapper/contracts";
import { projectRemoteWorkItemLink } from "@storymapper/core";
import { storedChangeSetSchema } from "@storymapper/contracts";
import type { ActivityEvent, Annotation, Card, CardAttachment, CardAnnotationLink, CardPersonaLink, CardSourceLink, StoredChangeSet, ConnectorConnection, GitHubLink, Persona, ProductContext, SafetySettings, Project, Release, RemoteWorkItemLink, Roadmap, RoadmapCard, RoadmapColumn, RoadmapReference, RoadmapSwimlane, SourceChunk, SourceDocument, StoryMap, StoryTemplate, SyncConflict, SyncRun, WorkflowStatus } from "@storymapper/contracts";
import { activityEvents, annotations, cardAnnotations, cardAttachments, cardPersonas, cardSourceLinks, cards, changeSets, connectorConnections, externalRefs, personas, productContexts, projectSettings, projects, releases, remoteWorkItemLinks, roadmapCards, roadmapColumns, roadmapReferences, roadmaps, roadmapSwimlanes, sourceChunks, sourceDocuments, storyMaps, storyTemplates, syncConflicts, syncRuns, workflowStatuses } from "@storymapper/db/schema";
import { compact } from "@storymapper/db/repositories/repository-values";

export function toProject(row: typeof projects.$inferSelect): Project {
  const project: Project = {
    historicalStub: row.historicalStub,
    id: row.id,
    name: row.name,
    localPath: row.localPath,
    defaultLanguage: row.defaultLanguage,
    defaultEstimationUnit: row.defaultEstimationUnit,
    createdAt: row.createdAt
  };
  if (row.description !== null) project.description = row.description;
  return project;
}

export function toStoryMap(row: typeof storyMaps.$inferSelect): StoryMap {
  const storyMap: StoryMap = {
    id: row.id,
    version: row.version,
    projectId: row.projectId,
    name: row.name,
    estimationUnit: row.estimationUnit,
    cardKeyPrefix: row.cardKeyPrefix,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
  if (row.colorCategoryNamesJson !== null) storyMap.colorCategoryNames = parseStoredJson("story_maps", "color_category_names_json", row.colorCategoryNamesJson, row.colorCategoryNamesSchemaVersion);
  if (row.epicContextJson !== null) storyMap.epicContext = parseStoredJson("story_maps", "epic_context_json", row.epicContextJson, row.epicContextSchemaVersion);
  if (row.description !== null) storyMap.description = row.description;
  if (row.defaultConnectionId !== null) storyMap.defaultConnectionId = row.defaultConnectionId;
  return storyMap;
}

export function toCard(row: typeof cards.$inferSelect): Card {
  return compact({
    creationOrigin: row.creationOrigin,
    provenance: row.provenance,
    id: row.id,
    version: row.version,
    storyMapId: row.storyMapId,
    parentId: row.parentId,
    releaseId: row.releaseId,
    key: row.key,
    level: row.level,
    cardType: row.cardType,
    title: row.title,
    description: row.description,
    position: row.position,
    status: row.status,
    archived: row.archived,
    parked: row.parked,
    priority: row.priority ?? undefined,
    businessValue: row.businessValue ?? undefined,
    effort: row.effort ?? undefined,
    estimate: row.estimate ?? undefined,
    color: row.color ?? undefined,
    assignee: row.assignee ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }) as Card;
}

export function toRelease(row: typeof releases.$inferSelect): Release {
  return {
    id: row.id,
    version: row.version,
    storyMapId: row.storyMapId,
    name: row.name,
    goal: row.goal,
    position: row.position,
    startDate: row.startDate,
    releaseDate: row.releaseDate,
    released: row.released
  };
}

export function toWorkflowStatus(row: typeof workflowStatuses.$inferSelect): WorkflowStatus {
  return compact({
    id: row.id,
    projectId: row.projectId,
    storyMapId: row.storyMapId,
    name: row.name,
    group: row.group,
    position: row.position,
    color: row.color ?? undefined
  }) as WorkflowStatus;
}

export function toPersona(row: typeof personas.$inferSelect): Persona {
  return {
    id: row.id,
    version: row.version,
    projectId: row.projectId,
    storyMapId: row.storyMapId,
    name: row.name,
    role: row.role,
    personaType: row.personaType,
    avatar: row.avatar,
    represents: row.represents,
    age: row.age,
    country: row.country,
    fachexpertise: row.fachexpertise,
    workLife: row.workLife,
    productExperience: row.productExperience,
    expectations: row.expectations,
    description: row.description,
    centralNeed: row.centralNeed,
    successIndicators: row.successIndicators,
    scopeNote: row.scopeNote,
    goals: parseStoredJson("personas", "goals_json", row.goalsJson, row.goalsSchemaVersion) as string[],
    pains: parseStoredJson("personas", "pains_json", row.painsJson, row.painsSchemaVersion) as string[]
  };
}

export function toCardPersonaLink(row: typeof cardPersonas.$inferSelect): CardPersonaLink {
  return {
    id: row.id,
    cardId: row.cardId,
    personaId: row.personaId,
    createdAt: row.createdAt
  };
}

export function toAnnotation(row: typeof annotations.$inferSelect): Annotation {
  return {
    id: row.id,
    projectId: row.projectId,
    storyMapId: row.storyMapId,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position
  };
}

export function toCardAnnotationLink(row: typeof cardAnnotations.$inferSelect): CardAnnotationLink {
  return {
    id: row.id,
    cardId: row.cardId,
    annotationId: row.annotationId,
    createdAt: row.createdAt
  };
}

export function toStoryTemplate(row: typeof storyTemplates.$inferSelect): StoryTemplate {
  return {
    id: row.id,
    projectId: row.projectId,
    storyMapId: row.storyMapId,
    name: row.name,
    descriptionTemplate: row.descriptionTemplate,
    defaultStatus: row.defaultStatus,
    defaultEstimate: row.defaultEstimate,
    position: row.position
  };
}

export function toProductContext(row: typeof productContexts.$inferSelect): ProductContext {
  return {
    id: row.id,
    projectId: row.projectId,
    storyMapId: row.storyMapId,
    productType: row.productType,
    purpose: row.purpose,
    keyFeatures: parseStoredJson("product_contexts", "key_features_json", row.keyFeaturesJson, row.keyFeaturesSchemaVersion) as string[],
    targetUsers: row.targetUsers,
    platform: row.platform,
    pricing: row.pricing,
    notes: row.notes,
    glossary: row.glossary,
    nonGoals: row.nonGoals,
    complianceConstraints: row.complianceConstraints,
    updatedAt: row.updatedAt
  };
}

export function toRoadmap(row: typeof roadmaps.$inferSelect): Roadmap {
  return {
    id: row.id,
    version: row.version,
    projectId: row.projectId,
    storyMapId: row.storyMapId,
    name: row.name,
    type: row.type as Roadmap["type"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toRoadmapColumn(row: typeof roadmapColumns.$inferSelect): RoadmapColumn {
  return {
    id: row.id,
    roadmapId: row.roadmapId,
    name: row.name,
    position: row.position
  };
}

export function toRoadmapSwimlane(row: typeof roadmapSwimlanes.$inferSelect): RoadmapSwimlane {
  return {
    id: row.id,
    roadmapId: row.roadmapId,
    name: row.name,
    position: row.position
  };
}

export function toRoadmapCard(row: typeof roadmapCards.$inferSelect): RoadmapCard {
  return {
    id: row.id,
    roadmapId: row.roadmapId,
    columnId: row.columnId,
    swimlaneId: row.swimlaneId,
    title: row.title,
    details: row.details,
    labels: parseStoredJson("roadmap_cards", "labels_json", row.labelsJson, row.labelsSchemaVersion) as string[],
    reach: row.reach,
    impact: row.impact,
    confidence: row.confidence,
    effort: row.effort,
    position: row.position
  };
}

export function toRoadmapReference(row: typeof roadmapReferences.$inferSelect): RoadmapReference {
  return {
    id: row.id,
    roadmapCardId: row.roadmapCardId,
    targetType: row.targetType as RoadmapReference["targetType"],
    targetId: row.targetId
  };
}

export function toActivityEvent(row: typeof activityEvents.$inferSelect): ActivityEvent {
  parseStoredJson("activity_events", "live_entities_json", row.liveEntitiesJson, row.liveEntitiesSchemaVersion);
  return compact({
    seq: row.seq,
    originClientId: row.originClientId ?? undefined,
    undoneByRestore: row.undoneByRestore,
    id: row.id,
    projectId: row.projectId,
    actor: row.actor,
    actorType: row.actorType,
    mcpSessionId: row.mcpSessionId ?? undefined,
    action: row.action,
    affectedEntityType: row.affectedEntityType ?? undefined,
    affectedEntityId: row.affectedEntityId ?? undefined,
    before: parseStoredJson("activity_events", "before_json", row.beforeJson, row.beforeSchemaVersion),
    after: parseStoredJson("activity_events", "after_json", row.afterJson, row.afterSchemaVersion),
    externalCallId: row.externalCallId ?? undefined,
    createdAt: row.createdAt
  }) as ActivityEvent;
}

export function toSafetySettings(row: typeof projectSettings.$inferSelect): SafetySettings {
  return {
    epoch: row.epoch,
    projectId: row.projectId,
    agentMode: row.agentMode,
    github: row.githubEnabled,
    updatedAt: row.updatedAt
  };
}

export function toSourceDocument(row: typeof sourceDocuments.$inferSelect): SourceDocument {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    type: row.type as SourceDocument["type"],
    filePath: row.filePath,
    fileHash: row.fileHash,
    importedAt: row.importedAt
  };
}

export function toSourceChunk(row: typeof sourceChunks.$inferSelect): SourceChunk {
  return compact({
    id: row.id,
    documentId: row.documentId,
    text: row.text,
    locator: row.locator,
    heading: row.heading ?? undefined,
    page: row.page ?? undefined
  }) as SourceChunk;
}

export function toCardSourceLink(row: typeof cardSourceLinks.$inferSelect): Exclude<CardSourceLink, { kind: "github" }> {
  if (row.kind === "note") return { kind: "note", id: row.id, cardId: row.cardId, note: row.note!, createdAt: row.createdAt };
  return {
    kind: "chunk",
    id: row.id,
    cardId: row.cardId,
    chunkId: row.chunkId!,
    confidence: row.confidence,
    createdAt: row.createdAt
  };
}

export function toCardAttachment(row: typeof cardAttachments.$inferSelect): CardAttachment {
  return compact({
    id: row.id,
    cardId: row.cardId,
    label: row.label,
    filePath: row.filePath,
    mimeType: row.mimeType,
    createdAt: row.createdAt
  }) as CardAttachment;
}

export function toConnectorConnection(row: typeof connectorConnections.$inferSelect): ConnectorConnection {
  return {
    statusSource: parseStoredJson("connector_connections", "status_source_json", row.statusSourceJson, row.statusSourceSchemaVersion),
    statusCatalogs: parseStoredJson("connector_connections", "status_catalogs_json", row.statusCatalogsJson, row.statusCatalogsSchemaVersion),
    id: row.id,
    projectId: row.projectId,
    provider: row.provider as ConnectorConnection["provider"],
    name: row.name,
    authMode: row.authMode as ConnectorConnection["authMode"],
    owner: row.owner,
    repository: row.repository ?? undefined,
    defaultLabel: row.defaultLabel,
    readOnly: row.readOnly,
    statusMapping: parseStoredJson("connector_connections", "status_mapping_json", row.statusMappingJson, row.statusMappingSchemaVersion) as ConnectorConnection["statusMapping"],
    issueTypeMapping: parseStoredJson("connector_connections", "issue_type_mapping_json", row.issueTypeMappingJson, row.issueTypeMappingSchemaVersion) as ConnectorConnection["issueTypeMapping"],
    typeMapping: parseStoredJson("connector_connections", "type_mapping_json", row.typeMappingJson, row.typeMappingSchemaVersion) as ConnectorConnection["typeMapping"],
    releaseSource: row.releaseSource as ConnectorConnection["releaseSource"],
    iterationFieldName: row.iterationFieldName,
    labelsAsAnnotations: row.labelsAsAnnotations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toRemoteWorkItemLink(row: typeof remoteWorkItemLinks.$inferSelect, ref: typeof externalRefs.$inferSelect): RemoteWorkItemLink {
  return projectRemoteWorkItemLink(remoteWorkItemSyncStateSchema.parse({ ...row, titleHash: row.titleHash ?? undefined, bodyHash: row.bodyHash ?? undefined,
    statusEvidence: parseStoredJson("remote_work_item_links", "status_evidence_json", row.statusEvidenceJson, row.statusEvidenceSchemaVersion),
    remoteState: row.remoteState ?? undefined, issueType: row.issueType ?? undefined, baseline: parseStoredJson("remote_work_item_links", "baseline_json", row.baselineJson, row.baselineSchemaVersion), managedLabels: parseStoredJson("remote_work_item_links", "managed_labels_json", row.managedLabelsJson, row.managedLabelsSchemaVersion) as string[], labels: parseStoredJson("remote_work_item_links", "labels_json", row.labelsJson, row.labelsSchemaVersion) as string[],
    syncState: row.syncState as RemoteWorkItemLink["syncState"], lastSyncedAt: row.lastSyncedAt ?? undefined }), [ref]);
}

export function toSyncRun(row: typeof syncRuns.$inferSelect): SyncRun {
  return {
    id: row.id,
    projectId: row.projectId,
    storyMapId: row.storyMapId,
    connectionId: row.connectionId,
    provider: row.provider as SyncRun["provider"],
    mode: row.mode as SyncRun["mode"],
    status: row.status as SyncRun["status"],
    summary: row.summary,
    createdAt: row.createdAt
  };
}

export function toSyncConflict(row: typeof syncConflicts.$inferSelect): SyncConflict {
  return compact({
    id: row.id,
    externalRefId: row.externalRefId,
    syncRunId: row.syncRunId,
    connectionId: row.connectionId,
    cardId: row.cardId ?? undefined,
    remoteId: row.remoteId ?? undefined,
    field: row.field as SyncConflict["field"],
    localValue: parseStoredJson("sync_conflicts", "local_value_json", row.localValueJson, row.localValueSchemaVersion),
    remoteValue: parseStoredJson("sync_conflicts", "remote_value_json", row.remoteValueJson, row.remoteValueSchemaVersion),
    status: row.status as SyncConflict["status"],
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? undefined
  }) as SyncConflict;
}

export function toChangeSet(row: typeof changeSets.$inferSelect): StoredChangeSet {
  return storedChangeSetSchema.parse({
    undoneByRestore: row.undoneByRestore,
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    source: row.source,
    status: row.status,
    operationsSchemaVersion: row.operationsSchemaVersion,
    operations: parseStoredOperationsJson(row.operationsJson, row.operationsSchemaVersion, row.status, row.undoneByRestore),
    proposedBy: parseStoredJson("change_sets", "proposed_by_json", row.proposedByJson, row.proposedBySchemaVersion),
    approval: parseStoredJson("change_sets", "approval_json", row.approvalJson, row.approvalSchemaVersion),
    execution: parseStoredJson("change_sets", "execution_json", row.executionJson, row.executionSchemaVersion),
    warnings: parseStoredJson("change_sets", "warnings_json", row.warningsJson, row.warningsSchemaVersion),
    createdAt: row.createdAt
  });
}
