import { workItemProviderSchema } from "@storymapper/contracts";
import { sql } from "drizzle-orm";
import { check, index, integer, real, primaryKey, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

function jsonVersionChecks(table: Record<string, AnySQLiteColumn>, required: string[], nullable: string[] = []) {
  return [...required, ...nullable].map((field) => check(`${table[field + "Json"]!.name}_version_valid`, nullable.includes(field)
    ? sql`(${table[field + "Json"]!} IS NULL AND ${table[field + "SchemaVersion"]!} IS NULL) OR (${table[field + "Json"]!} IS NOT NULL AND typeof(${table[field + "SchemaVersion"]!}) = 'integer' AND ${table[field + "SchemaVersion"]!} > 0)`
    : sql`typeof(${table[field + "SchemaVersion"]!}) = 'integer' AND ${table[field + "SchemaVersion"]!} > 0`));
}

export const projects = sqliteTable("projects", {
  historicalStub: integer("historical_stub", { mode: "boolean" }).notNull().default(false),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  localPath: text("local_path").notNull(),
  description: text("description"),
  defaultLanguage: text("default_language").notNull().default("en"),
  defaultEstimationUnit: text("default_estimation_unit").notNull().default("points"),
  createdAt: text("created_at").notNull()
});

export const projectSettings = sqliteTable("project_settings", {
  epoch: text("epoch").notNull(),
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  gettingStartedInitialized: integer("getting_started_initialized", { mode: "boolean" }).notNull().default(false),
  gettingStartedDismissed: integer("getting_started_dismissed", { mode: "boolean" }).notNull().default(false),
  sampleStoryMapId: text("sample_story_map_id"),
  completedStoryMap: integer("completed_story_map", { mode: "boolean" }).notNull().default(false),
  completedCards: integer("completed_cards", { mode: "boolean" }).notNull().default(false),
  completedGitHub: integer("completed_github", { mode: "boolean" }).notNull().default(false),
  completedExport: integer("completed_export", { mode: "boolean" }).notNull().default(false),
  agentMode: text("agent_mode", { enum: ["off", "propose", "apply", "autonomous"] }).notNull().default("apply"),
  githubEnabled: integer("github_enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull()
});

export const storyMaps = sqliteTable("story_maps", {
  epicContextJson: text("epic_context_json"),
  epicContextSchemaVersion: integer("epic_context_schema_version"),
  nextCardNumber: integer("next_card_number").notNull().default(1),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  projectId: text("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  description: text("description"),
  estimationUnit: text("estimation_unit").notNull().default("points"),
  cardKeyPrefix: text("card_key_prefix").notNull().default("LSM"),
  defaultConnectionId: text("default_connection_id").references(() => connectorConnections.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({ versionPositive: check("story_maps_version_positive", sql`typeof(${table.version}) = 'integer' AND ${table.version} > 0`) }));

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  storyMapId: text("story_map_id").notNull().references(() => storyMaps.id),
  name: text("name").notNull(),
  goal: text("goal").notNull().default(""),
  position: integer("position").notNull(),
  startDate: text("start_date"),
  releaseDate: text("release_date"),
  released: integer("released", { mode: "boolean" }).notNull().default(false)
}, (table) => ({ versionPositive: check("releases_version_positive", sql`typeof(${table.version}) = 'integer' AND ${table.version} > 0`) }));

export const sourcePlanBaselines = sqliteTable("source_plan_baselines", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  storyMapId: text("story_map_id").notNull().references(() => storyMaps.id),
  system: text("system").notNull(),
  version: integer("version").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  entriesJson: text("entries_json").notNull(),
  releasesJson: text("releases_json").notNull()
}, (table) => ({
  mapSystem: uniqueIndex("source_plan_baselines_map_system_idx").on(table.storyMapId, table.system),
  versionPositive: check("source_plan_baselines_version_positive", sql`typeof(${table.version}) = 'integer' AND ${table.version} > 0`)
}));

export const planStates = sqliteTable("plan_states", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  storyMapId: text("story_map_id").notNull().references(() => storyMaps.id),
  capturedAt: text("captured_at").notNull(),
  actor: text("actor").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  payloadJson: text("payload_json").notNull()
}, (table) => ({ mapCapture: index("plan_states_map_capture_idx").on(table.storyMapId, table.capturedAt, table.id) }));

export const aiFunctionTemplates = sqliteTable("ai_function_templates", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  name: text("name").notNull(),
  instructions: text("instructions").notNull(),
  argumentsJson: text("arguments_json").notNull().default("[]"),
  argumentsSchemaVersion: integer("arguments_schema_version").notNull().default(1),
  outputSchemaName: text("output_schema_name"),
  examplesJson: text("examples_json").notNull().default("[]"),
  examplesSchemaVersion: integer("examples_schema_version").notNull().default(1)
}, (table) => ({ ...Object.fromEntries(jsonVersionChecks(table, ["arguments", "examples"], []).map((value, index) => ["jsonVersion" + index, value])), key: primaryKey({ columns: [table.projectId, table.id] }) }));

export const productContexts = sqliteTable("product_contexts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyMapId: text("story_map_id").references(() => storyMaps.id),
  productType: text("product_type").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  keyFeaturesJson: text("key_features_json").notNull().default("[]"),
  keyFeaturesSchemaVersion: integer("key_features_schema_version").notNull().default(1),
  targetUsers: text("target_users").notNull().default(""),
  platform: text("platform").notNull().default(""),
  pricing: text("pricing").notNull().default(""),
  notes: text("notes").notNull().default(""),
  glossary: text("glossary").notNull().default(""),
  nonGoals: text("non_goals").notNull().default(""),
  complianceConstraints: text("compliance_constraints").notNull().default(""),
  updatedAt: text("updated_at").notNull()
}, (table) => jsonVersionChecks(table, ["keyFeatures"], []));

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    storyMapId: text("story_map_id").notNull().references(() => storyMaps.id),
    parentId: text("parent_id"),
    releaseId: text("release_id").references(() => releases.id),
    key: text("key").notNull(),
    creationOrigin: text("creation_origin", { enum: ["manual", "inference", "unknown"] }).notNull().default("unknown"),
    provenance: text("provenance", { enum: ["linked", "manual", "inference", "unknown"] }).notNull().default("unknown"),
    creationSource: text("creation_source").notNull().default("unknown"),
    cardType: text("card_type", { enum: ["story", "task", "bug", "spike", "feature", "epic", "theme"] }),
    level: text("level", { enum: ["activity", "step", "story", "note"] }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    position: integer("position").notNull(),
    status: text("status").notNull().default("todo"),
    parked: integer("parked", { mode: "boolean" }).notNull().default(false),
    priority: text("priority"),
    businessValue: integer("business_value"),
    effort: integer("effort"),
    estimate: real("estimate"),
    color: text("color"),
    assignee: text("assignee"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    versionPositive: check("cards_version_positive", sql`typeof(${table.version}) = 'integer' AND ${table.version} > 0`),
    keyByMap: uniqueIndex("cards_story_map_key_idx").on(table.storyMapId, table.key),
    byMap: index("cards_story_map_id_idx").on(table.storyMapId),
    byParent: index("cards_parent_id_idx").on(table.parentId)
  })
);

export const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  projectId: text("project_id").notNull().references(() => projects.id),
  storyMapId: text("story_map_id").references(() => storyMaps.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  personaType: text("persona_type").notNull().default(""),
  avatar: text("avatar").notNull().default(""),
  represents: text("represents").notNull().default(""),
  age: text("age").notNull().default(""),
  country: text("country").notNull().default(""),
  fachexpertise: text("fachexpertise").notNull().default(""),
  workLife: text("work_life").notNull().default(""),
  productExperience: text("product_experience").notNull().default(""),
  expectations: text("expectations").notNull().default(""),
  description: text("description").notNull().default(""),
  centralNeed: text("central_need").notNull().default(""),
  successIndicators: text("success_indicators").notNull().default(""),
  scopeNote: text("scope_note").notNull().default(""),
  goalsJson: text("goals_json").notNull().default("[]"),
  goalsSchemaVersion: integer("goals_schema_version").notNull().default(1),
  painsJson: text("pains_json").notNull().default("[]"),
  painsSchemaVersion: integer("pains_schema_version").notNull().default(1)
}, (table) => ({ ...Object.fromEntries(jsonVersionChecks(table, ["goals", "pains"], []).map((value, index) => ["jsonVersion" + index, value])), versionPositive: check("personas_version_positive", sql`typeof(${table.version}) = 'integer' AND ${table.version} > 0`) }));

export const externalRefs = sqliteTable("external_refs", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["card", "release", "persona"] }).notNull(),
  entityId: text("entity_id").notNull(),
  system: text("system").notNull(),
  externalId: text("external_id").notNull(),
  scopeId: text("scope_id").notNull(),
  syncedVersion: integer("synced_version").notNull(),
  createdAt: text("created_at").notNull()
}, (table) => ({
  entityTypeValid: check("external_refs_entity_type_valid", sql`${table.entityType} IN ('card', 'release', 'persona')`),
  systemValid: check("external_refs_system_valid", sql`${table.system} <> '' AND ${table.system} NOT GLOB '*[^a-z0-9-]*'`),
  externalIdValid: check("external_refs_external_id_valid", sql`length(${table.externalId}) > 0 AND ${table.externalId} = trim(${table.externalId}, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))`),
  syncedVersionPositive: check("external_refs_synced_version_positive", sql`typeof(${table.syncedVersion}) = 'integer' AND ${table.syncedVersion} > 0`),
  workItemIdentity: uniqueIndex("external_refs_work_item_identity_idx").on(table.scopeId, table.system, table.externalId).where(sql.raw(`system IN (${workItemProviderSchema.options.map((provider) => `'${provider}'`).join(",")})`)),
  scopedIdentity: uniqueIndex("external_refs_scoped_identity_idx").on(table.scopeId, table.entityType, table.system, table.externalId),
  entityBinding: uniqueIndex("external_refs_entity_binding_idx").on(table.entityType, table.entityId, table.system)
}));

export const workflowStatuses = sqliteTable("workflow_statuses", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyMapId: text("story_map_id").references(() => storyMaps.id),
  name: text("name").notNull(),
  group: text("group").notNull(),
  position: integer("position").notNull(),
  color: text("color")
});

export const cardPersonas = sqliteTable("card_personas", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  personaId: text("persona_id").notNull().references(() => personas.id),
  createdAt: text("created_at").notNull()
});

export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyMapId: text("story_map_id").references(() => storyMaps.id),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("tag"),
  color: text("color").notNull().default("#eef2ff"),
  position: integer("position").notNull()
});

export const cardDependencies = sqliteTable("card_dependencies", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  prerequisiteCardId: text("prerequisite_card_id").notNull().references(() => cards.id),
  createdAt: text("created_at").notNull()
}, (table) => [
  uniqueIndex("card_dependencies_pair_unique").on(table.cardId, table.prerequisiteCardId),
  index("card_dependencies_prerequisite_idx").on(table.prerequisiteCardId)
]);

export const cardAnnotations = sqliteTable("card_annotations", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  annotationId: text("annotation_id").notNull().references(() => annotations.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull()
});

export const storyTemplates = sqliteTable("story_templates", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyMapId: text("story_map_id").references(() => storyMaps.id),
  name: text("name").notNull(),
  descriptionTemplate: text("description_template").notNull().default(""),
  defaultStatus: text("default_status").notNull().default("todo"),
  defaultEstimate: real("default_estimate"),
  position: integer("position").notNull()
});

export const roadmaps = sqliteTable("roadmaps", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  projectId: text("project_id").notNull().references(() => projects.id),
  storyMapId: text("story_map_id").references(() => storyMaps.id),
  name: text("name").notNull(),
  type: text("type").notNull().default("simple"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({ versionPositive: check("roadmaps_version_positive", sql`typeof(${table.version}) = 'integer' AND ${table.version} > 0`) }));

export const roadmapColumns = sqliteTable("roadmap_columns", {
  id: text("id").primaryKey(),
  roadmapId: text("roadmap_id").notNull().references(() => roadmaps.id),
  name: text("name").notNull(),
  position: integer("position").notNull()
});

export const roadmapSwimlanes = sqliteTable("roadmap_swimlanes", {
  id: text("id").primaryKey(),
  roadmapId: text("roadmap_id").notNull().references(() => roadmaps.id),
  name: text("name").notNull(),
  position: integer("position").notNull()
});

export const roadmapCards = sqliteTable("roadmap_cards", {
  id: text("id").primaryKey(),
  roadmapId: text("roadmap_id").notNull().references(() => roadmaps.id),
  columnId: text("column_id").notNull().references(() => roadmapColumns.id, { onDelete: "cascade" }),
  swimlaneId: text("swimlane_id").references(() => roadmapSwimlanes.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  labelsJson: text("labels_json").notNull().default("[]"),
  labelsSchemaVersion: integer("labels_schema_version").notNull().default(1),
  reach: real("reach"),
  impact: real("impact"),
  confidence: real("confidence"),
  effort: real("effort"),
  position: integer("position").notNull()
}, (table) => jsonVersionChecks(table, ["labels"], []));

export const roadmapReferences = sqliteTable("roadmap_references", {
  id: text("id").primaryKey(),
  roadmapCardId: text("roadmap_card_id").notNull().references(() => roadmapCards.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull()
});

export const sourceDocuments = sqliteTable("source_documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type").notNull(),
  filePath: text("file_path").notNull(),
  fileHash: text("file_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [uniqueIndex("source_documents_project_type_hash_idx").on(table.projectId, table.type, table.fileHash)]);

export const sourceChunks = sqliteTable("source_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => sourceDocuments.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  locator: text("locator").notNull(),
  heading: text("heading"),
  page: integer("page")
});

export const cardSourceLinks = sqliteTable("card_source_links", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  kind: text("kind", { enum: ["chunk", "note"] }).notNull(),
  chunkId: text("chunk_id").references(() => sourceChunks.id, { onDelete: "cascade" }),
  note: text("note"),
  confidence: real("confidence"),
  createdAt: text("created_at").notNull()
}, (table) => [
  check("card_source_links_kind_valid", sql`${table.kind} IN ('chunk', 'note')`),
  check("card_source_links_evidence_check", sql`(${table.kind} = 'chunk' AND ${table.chunkId} IS NOT NULL AND ${table.note} IS NULL) OR (${table.kind} = 'note' AND ${table.chunkId} IS NULL AND ${table.confidence} IS NULL AND ${table.note} IS NOT NULL AND length(trim(${table.note})) > 0)`),
  uniqueIndex("card_source_links_note_idx").on(table.cardId, table.note)
]);

export const cardGithubEvidence = sqliteTable("card_github_evidence", {
  id: text("id").primaryKey(), cardId: text("card_id").notNull().references(() => cards.id),
  externalRefId: text("external_ref_id").notNull().references(() => externalRefs.id, { onDelete: "cascade" })
}, (table) => [uniqueIndex("card_github_evidence_card_identity_idx").on(table.cardId, table.externalRefId)]);

export const cardAttachments = sqliteTable("card_attachments", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  label: text("label").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  createdAt: text("created_at").notNull()
});

export const connectorConnections = sqliteTable("connector_connections", {
  id: text("id").primaryKey(),
  statusSourceJson: text("status_source_json").notNull().default('{"kind":"repository"}'),
  statusSourceSchemaVersion: integer("status_source_schema_version").notNull().default(1),
  statusCatalogsJson: text("status_catalogs_json").notNull().default("[]"),
  statusCatalogsSchemaVersion: integer("status_catalogs_schema_version").notNull().default(1),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  authMode: text("auth_mode").notNull(),
  owner: text("owner").notNull(),
  repository: text("repository"),
  defaultLabel: text("default_label").notNull().default("local-story-map"),
  readOnly: integer("read_only", { mode: "boolean" }).notNull().default(true),
  statusMappingJson: text("status_mapping_json").notNull().default("[]"),
  statusMappingSchemaVersion: integer("status_mapping_schema_version").notNull().default(1),
  issueTypeMappingJson: text("issue_type_mapping_json").notNull().default("[]"),
  issueTypeMappingSchemaVersion: integer("issue_type_mapping_schema_version").notNull().default(1),
  typeMappingJson: text("type_mapping_json").notNull().default('[{"match":"epic","level":"activity"},{"match":"feature","level":"step"}]'),
  typeMappingSchemaVersion: integer("type_mapping_schema_version").notNull().default(1),
  releaseSource: text("release_source").notNull().default("milestone"),
  iterationFieldName: text("iteration_field_name").notNull().default("Iteration"),
  labelsAsAnnotations: integer("labels_as_annotations", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => jsonVersionChecks(table, ["statusSource", "statusCatalogs", "statusMapping", "issueTypeMapping", "typeMapping"], []));

export const remoteWorkItemLinks = sqliteTable("remote_work_item_links", {
  id: text("id").primaryKey(),
  statusEvidenceJson: text("status_evidence_json"),
  statusEvidenceSchemaVersion: integer("status_evidence_schema_version"),
  connectionId: text("connection_id").notNull().references(() => connectorConnections.id, { onDelete: "cascade" }),
  externalRefId: text("external_ref_id").notNull().references(() => externalRefs.id, { onDelete: "cascade" }),
  titleHash: text("title_hash"),
  bodyHash: text("body_hash"),
  remoteState: text("remote_state"),
  issueType: text("issue_type"),
  managedLabelsJson: text("managed_labels_json").notNull().default("[]"),
  managedLabelsSchemaVersion: integer("managed_labels_schema_version").notNull().default(1),
  baselineJson: text("baseline_json"),
  baselineSchemaVersion: integer("baseline_schema_version"),
  labelsJson: text("labels_json").notNull().default("[]"),
  labelsSchemaVersion: integer("labels_schema_version").notNull().default(1),
  milestone: text("milestone"),
  remoteParentNumber: integer("remote_parent_number"),
  parentOverrideLocal: integer("parent_override_local", { mode: "boolean" }).notNull().default(false),
  syncState: text("sync_state").notNull().default("unsynced"),
  lastSyncedAt: text("last_synced_at")
}, (table) => [...jsonVersionChecks(table, ["managedLabels", "labels"], ["baseline", "statusEvidence"]),uniqueIndex("remote_work_item_links_external_ref_idx").on(table.externalRefId)]);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyMapId: text("story_map_id").notNull().references(() => storyMaps.id),
  connectionId: text("connection_id").notNull().references(() => connectorConnections.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull().default(""),
  createdAt: text("created_at").notNull()
});

export const syncConflicts = sqliteTable("sync_conflicts", {
  id: text("id").primaryKey(),
  externalRefId: text("external_ref_id").notNull(),
  syncRunId: text("sync_run_id").notNull().references(() => syncRuns.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => connectorConnections.id, { onDelete: "cascade" }),
  cardId: text("card_id").references(() => cards.id),
  remoteId: text("remote_id"),
  field: text("field").notNull(),
  localValueJson: text("local_value_json").notNull(),
  localValueSchemaVersion: integer("local_value_schema_version").notNull().default(1),
  remoteValueJson: text("remote_value_json").notNull(),
  remoteValueSchemaVersion: integer("remote_value_schema_version").notNull().default(1),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
}, (table) => [...jsonVersionChecks(table, ["localValue", "remoteValue"], []),uniqueIndex("sync_conflicts_open_ref_field").on(table.externalRefId, table.field).where(sql`${table.status} = 'open'`)]);

export const changeSets = sqliteTable("change_sets", {
  trustedGithubStatus: integer("trusted_github_status", { mode: "boolean" }).notNull().default(false),
  undoneByRestore: integer("undone_by_restore", { mode: "boolean" }).notNull().default(false),
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull().default("proposed"),
  operationsSchemaVersion: integer("operations_schema_version").notNull(),
  operationsJson: text("operations_json").notNull(),
  proposedByJson: text("proposed_by_json"),
  proposedBySchemaVersion: integer("proposed_by_schema_version"),
  approvalJson: text("approval_json"),
  approvalSchemaVersion: integer("approval_schema_version"),
  executionJson: text("execution_json"),
  executionSchemaVersion: integer("execution_schema_version"),
  warningsJson: text("warnings_json"),
  warningsSchemaVersion: integer("warnings_schema_version"),
  createdAt: text("created_at").notNull()
}, (table) => jsonVersionChecks(table, [], ["proposedBy", "approval", "execution", "warnings"]));

export const databaseMetadata = sqliteTable("database_metadata", {
  id: integer("id").primaryKey(),
  epoch: text("epoch").notNull()
}, (table) => [check("database_metadata_singleton", sql`${table.id} = 1`)]);

export const activityEvents = sqliteTable("activity_events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  transactionId: text("transaction_id"),
  originClientId: text("origin_client_id"),
  liveEntitiesJson: text("live_entities_json").notNull().default("[]"),
  liveEntitiesSchemaVersion: integer("live_entities_schema_version").notNull().default(1),
  undoneByRestore: integer("undone_by_restore", { mode: "boolean" }).notNull().default(false),
  id: text("id").notNull().unique(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  actorType: text("actor_type").notNull(),
  mcpSessionId: text("mcp_session_id"),
  action: text("action").notNull(),
  affectedEntityType: text("affected_entity_type"),
  affectedEntityId: text("affected_entity_id"),
  beforeJson: text("before_json"),
  beforeSchemaVersion: integer("before_schema_version"),
  afterJson: text("after_json"),
  afterSchemaVersion: integer("after_schema_version"),
  externalCallId: text("external_call_id"),
  createdAt: text("created_at").notNull()
}, (table) => [...jsonVersionChecks(table, ["liveEntities"], ["before", "after"]),
  index("activity_scope_page_idx").on(table.projectId, table.createdAt, table.id),
  index("activity_actor_page_idx").on(table.projectId, table.actorType, table.createdAt, table.id),
  index("activity_tool_page_idx").on(table.projectId, table.affectedEntityType, table.affectedEntityId, table.createdAt, table.id),
  index("activity_events_external_ref_deletion_idx").on(table.projectId, table.action, table.undoneByRestore),
  index("activity_transaction_idx").on(table.transactionId, table.seq)
]);

export const cardVersions = sqliteTable("card_versions", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  actor: text("actor").notNull(),
  actorType: text("actor_type").notNull(),
  mcpSessionId: text("mcp_session_id"),
  version: integer("version").notNull(),
  dependencyChange: integer("dependency_change", { mode: "boolean" }).notNull().default(false),
  snapshotJson: text("snapshot_json").notNull(),
  snapshotSchemaVersion: integer("snapshot_schema_version").notNull().default(1),
  createdAt: text("created_at").notNull()
}, (table) => ({ ...Object.fromEntries(jsonVersionChecks(table, ["snapshot"], []).map((value, index) => ["jsonVersion" + index, value])), cardVersion: uniqueIndex("card_versions_card_version_idx").on(table.cardId, table.version) }));

export const remotePushPlans = sqliteTable("remote_push_plans", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyMapId: text("story_map_id").notNull(),
  connectionId: text("connection_id").notNull(),
  epoch: text("epoch").notNull(),
  planJson: text("plan_json").notNull(),
  planSchemaVersion: integer("plan_schema_version").notNull().default(1)
}, (table) => jsonVersionChecks(table, ["plan"], []));

export const remotePushExecutions = sqliteTable("remote_push_executions", {
  planId: text("plan_id").primaryKey().references(() => remotePushPlans.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  executionJson: text("execution_json").notNull(),
  executionSchemaVersion: integer("execution_schema_version").notNull().default(1)
}, (table) => jsonVersionChecks(table, ["execution"], []));

export const cardReviewRecords = sqliteTable("card_review_records", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  cardId: text("card_id").references(() => cards.id),
  payloadJson: text("payload_json").notNull(), payloadSchemaVersion: integer("payload_schema_version").notNull().default(1),
  createdAt: text("created_at").notNull()
}, (table) => ({ byProjectCard: index("card_review_project_card_idx").on(table.projectId, table.cardId), ...jsonVersionChecks(table, ["payload"], []) }));
