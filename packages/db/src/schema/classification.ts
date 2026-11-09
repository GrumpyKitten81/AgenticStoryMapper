export const aggregateTables = {
  Project: ["projects", "project_settings", "database_metadata", "plan_states"],
  StoryMap: ["story_maps", "product_contexts"],
  Card: ["card_review_records", "cards", "card_personas", "card_annotations", "card_dependencies", "card_attachments", "card_source_links", "card_versions"],
  Release: ["releases"],
  Persona: ["personas"],
  Roadmap: ["roadmaps", "roadmap_columns", "roadmap_swimlanes", "roadmap_cards", "roadmap_references"],
  Customization: ["annotations", "workflow_statuses", "story_templates", "ai_function_templates"],
  Source: ["source_documents", "source_chunks"],
  Sync: ["remote_push_executions", "remote_push_plans", "card_github_evidence", "connector_connections", "remote_work_item_links", "sync_runs", "sync_conflicts"],
  ChangeSet: ["change_sets"],
  ExternalRef: ["external_refs", "source_plan_baselines"],
  Activity: ["activity_events"]
} as const;

export const infrastructureTables = ["__drizzle_migrations"] as const;

export const redactedTables = [...aggregateTables.Sync, "card_review_records"] as const;
export const redactedActivityEntityTypes = ["cardReview", "connectorConnection", "remoteWorkItemLink", "githubLink", "syncRun", "syncConflict", "githubDryRun", "remotePushPlan", "remotePushExecution"] as const;

export function assertClassifiedTables(tables: string[], universe: "physical" | "declared" = "physical"): void {
  const assignments = Object.entries(aggregateTables).flatMap(([owner, names]) => names.map((table) => ({ owner, table })));
  const classified: readonly string[] = [...assignments.map(({ table }) => table), ...(universe === "physical" ? infrastructureTables : [])];
  const duplicates = assignments.filter(({ table }, index) => assignments.findIndex((entry) => entry.table === table) !== index).map(({ table }) => table);
  const repeated = tables.filter((table, index) => tables.indexOf(table) !== index);
  const unknown = tables.filter((table) => !classified.includes(table));
  const stale = classified.filter((table) => !tables.includes(table));
  const overlap = assignments.filter(({ table }) => (infrastructureTables as readonly string[]).includes(table)).map(({ table }) => table);
  const violations = [...new Set([...duplicates, ...repeated, ...unknown, ...stale, ...overlap])];
  if (violations.length) throw new Error(`Invalid database table classification: ${violations.join(", ")}.`);
}
