import {
  colorCategoryNamesSchema, epicContextSchema, cardReviewRecordPayloadSchema, aiFunctionTemplateSchema, cardHistorySnapshotSchema, changeSetSchema, connectorConnectionSchema, DomainError,
  liveTransactionSchema, OPERATIONS_SCHEMA_VERSION, personaSchema, planStateProjectionSchema, productContextSchema,
  remotePushExecutionSchema, remotePushPlanSchema, remoteWorkItemSyncStateSchema, roadmapCardSchema,
  sourcePlanBaselineSchema, storedChangeSetSchema, syncConflictSchema
} from "@storymapper/contracts";

export const JSON_PAYLOADS = {
  story_maps: { color_category_names_json: colorCategoryNamesSchema, epic_context_json: epicContextSchema },
  card_review_records: { payload_json: cardReviewRecordPayloadSchema },
  ai_function_templates: { arguments_json: aiFunctionTemplateSchema.shape.arguments, examples_json: aiFunctionTemplateSchema.shape.examples },
  product_contexts: { key_features_json: productContextSchema.shape.keyFeatures },
  personas: { goals_json: personaSchema.shape.goals, pains_json: personaSchema.shape.pains },
  roadmap_cards: { labels_json: roadmapCardSchema.shape.labels },
  connector_connections: { status_source_json: connectorConnectionSchema.shape.statusSource, status_catalogs_json: connectorConnectionSchema.shape.statusCatalogs, status_mapping_json: connectorConnectionSchema.shape.statusMapping, issue_type_mapping_json: connectorConnectionSchema.shape.issueTypeMapping, type_mapping_json: connectorConnectionSchema.shape.typeMapping },
  remote_work_item_links: { status_evidence_json: remoteWorkItemSyncStateSchema.shape.statusEvidence, managed_labels_json: remoteWorkItemSyncStateSchema.shape.managedLabels, baseline_json: remoteWorkItemSyncStateSchema.shape.baseline, labels_json: remoteWorkItemSyncStateSchema.shape.labels },
  sync_conflicts: { local_value_json: syncConflictSchema.shape.localValue, remote_value_json: syncConflictSchema.shape.remoteValue },
  change_sets: { proposed_by_json: storedChangeSetSchema.shape.proposedBy, approval_json: storedChangeSetSchema.shape.approval, execution_json: storedChangeSetSchema.shape.execution, warnings_json: storedChangeSetSchema.shape.warnings },
  activity_events: { live_entities_json: liveTransactionSchema.shape.entities, before_json: syncConflictSchema.shape.localValue, after_json: syncConflictSchema.shape.remoteValue },
  card_versions: { snapshot_json: cardHistorySnapshotSchema },
  remote_push_plans: { plan_json: remotePushPlanSchema },
  remote_push_executions: { execution_json: remotePushExecutionSchema },
  source_plan_baselines: { entries_json: sourcePlanBaselineSchema.shape.entries, releases_json: sourcePlanBaselineSchema.shape.releases },
  plan_states: { payload_json: planStateProjectionSchema }
} as const;

export const NULLABLE_JSON_PAYLOADS = new Set([
  "story_maps.color_category_names_json",
  "story_maps.epic_context_json",
  "remote_work_item_links.status_evidence_json",
  "remote_work_item_links.baseline_json", "change_sets.proposed_by_json", "change_sets.approval_json",
  "change_sets.execution_json", "change_sets.warnings_json", "activity_events.before_json", "activity_events.after_json"
]);

export function jsonVersionColumn(table: string, column: string): string {
  return table === "source_plan_baselines" || table === "plan_states" ? "schema_version" : column.replace(/_json$/u, "_schema_version");
}

type PayloadTable = keyof typeof JSON_PAYLOADS;
type ParsedPayload<T extends PayloadTable, C extends keyof typeof JSON_PAYLOADS[T]> = typeof JSON_PAYLOADS[T][C] extends { parse: (...args: never[]) => infer Output } ? Output : never;

export function parseStoredJson<T extends PayloadTable, C extends keyof typeof JSON_PAYLOADS[T]>(table: T, column: C, payload: string | null, version: unknown): ParsedPayload<T, C> {
  const label = `${table}.${String(column)}`;
  if (payload === null) {
    if (version !== null || !NULLABLE_JSON_PAYLOADS.has(label)) throw new DomainError("validation", `Invalid stored JSON null/version pair: ${label}.`);
    return undefined as ParsedPayload<T, C>;
  }
  if (version !== 1) throw new DomainError("validation", `Unsupported stored JSON payload version: ${label}.`);
  let value: unknown;
  try { value = JSON.parse(payload); }
  catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("validation", `Invalid stored JSON: ${label}.`);
    throw error;
  }
  const schemas = JSON_PAYLOADS[table] as Record<string, { safeParse: (input: unknown) => { success: boolean; data?: unknown } }>;
  const parsed = schemas[String(column)]!.safeParse(value);
  if (!parsed.success) throw new DomainError("validation", `Invalid stored JSON payload: ${label}.`);
  return parsed.data as ParsedPayload<T, C>;
}

export function parseStoredOperationsJson(payload: string, version: number, status: string, undoneByRestore: boolean): unknown[] {
  if (!Number.isInteger(version) || version < 1) throw new DomainError("validation", "Invalid stored ChangeSet operation version.");
  if (version > OPERATIONS_SCHEMA_VERSION && !undoneByRestore && ["proposed", "approved", "rejected", "conflict"].includes(status)) throw new DomainError("validation", "Future active ChangeSet operation version is unsupported.");
  let operations: unknown;
  try { operations = JSON.parse(payload); }
  catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("validation", "Invalid stored ChangeSet operation JSON.");
    throw error;
  }
  if (!Array.isArray(operations)) throw new DomainError("validation", "Invalid stored ChangeSet operation array.");
  if (version === OPERATIONS_SCHEMA_VERSION && !undoneByRestore && ["proposed", "approved", "rejected", "conflict"].includes(status) && !changeSetSchema.shape.operations.safeParse(operations).success) throw new DomainError("validation", "Invalid current-schema ChangeSet operations.");
  return operations;
}
