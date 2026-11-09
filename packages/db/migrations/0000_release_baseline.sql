CREATE TABLE `activity_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` text,
	`origin_client_id` text,
	`live_entities_json` text DEFAULT '[]' NOT NULL,
	`live_entities_schema_version` integer DEFAULT 1 NOT NULL,
	`undone_by_restore` integer DEFAULT false NOT NULL,
	`id` text NOT NULL,
	`project_id` text,
	`actor` text NOT NULL,
	`actor_type` text NOT NULL,
	`mcp_session_id` text,
	`action` text NOT NULL,
	`affected_entity_type` text,
	`affected_entity_id` text,
	`before_json` text,
	`before_schema_version` integer,
	`after_json` text,
	`after_schema_version` integer,
	`external_call_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "live_entities_json_version_valid" CHECK(typeof("activity_events"."live_entities_schema_version") = 'integer' AND "activity_events"."live_entities_schema_version" > 0),
	CONSTRAINT "before_json_version_valid" CHECK(("activity_events"."before_json" IS NULL AND "activity_events"."before_schema_version" IS NULL) OR ("activity_events"."before_json" IS NOT NULL AND typeof("activity_events"."before_schema_version") = 'integer' AND "activity_events"."before_schema_version" > 0)),
	CONSTRAINT "after_json_version_valid" CHECK(("activity_events"."after_json" IS NULL AND "activity_events"."after_schema_version" IS NULL) OR ("activity_events"."after_json" IS NOT NULL AND typeof("activity_events"."after_schema_version") = 'integer' AND "activity_events"."after_schema_version" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_events_id_unique` ON `activity_events` (`id`);--> statement-breakpoint
CREATE INDEX `activity_scope_page_idx` ON `activity_events` (`project_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_actor_page_idx` ON `activity_events` (`project_id`,`actor_type`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_tool_page_idx` ON `activity_events` (`project_id`,`affected_entity_type`,`affected_entity_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_events_external_ref_deletion_idx` ON `activity_events` (`project_id`,`action`,`undone_by_restore`);--> statement-breakpoint
CREATE INDEX `activity_transaction_idx` ON `activity_events` (`transaction_id`,`seq`);--> statement-breakpoint
CREATE TABLE `ai_function_templates` (
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`instructions` text NOT NULL,
	`arguments_json` text DEFAULT '[]' NOT NULL,
	`arguments_schema_version` integer DEFAULT 1 NOT NULL,
	`output_schema_name` text,
	`examples_json` text DEFAULT '[]' NOT NULL,
	`examples_schema_version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`project_id`, `id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "arguments_json_version_valid" CHECK(typeof("ai_function_templates"."arguments_schema_version") = 'integer' AND "ai_function_templates"."arguments_schema_version" > 0),
	CONSTRAINT "examples_json_version_valid" CHECK(typeof("ai_function_templates"."examples_schema_version") = 'integer' AND "ai_function_templates"."examples_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text,
	`name` text NOT NULL,
	`icon` text DEFAULT 'tag' NOT NULL,
	`color` text DEFAULT '#eef2ff' NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`annotation_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`annotation_id`) REFERENCES `annotations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `card_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`label` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`prerequisite_card_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prerequisite_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_dependencies_pair_unique` ON `card_dependencies` (`card_id`,`prerequisite_card_id`);--> statement-breakpoint
CREATE INDEX `card_dependencies_prerequisite_idx` ON `card_dependencies` (`prerequisite_card_id`);--> statement-breakpoint
CREATE TABLE `card_github_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`external_ref_id` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`external_ref_id`) REFERENCES `external_refs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_github_evidence_card_identity_idx` ON `card_github_evidence` (`card_id`,`external_ref_id`);--> statement-breakpoint
CREATE TABLE `card_personas` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_source_links` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`kind` text NOT NULL,
	`chunk_id` text,
	`note` text,
	`confidence` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chunk_id`) REFERENCES `source_chunks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "card_source_links_kind_valid" CHECK("card_source_links"."kind" IN ('chunk', 'note')),
	CONSTRAINT "card_source_links_evidence_check" CHECK(("card_source_links"."kind" = 'chunk' AND "card_source_links"."chunk_id" IS NOT NULL AND "card_source_links"."note" IS NULL) OR ("card_source_links"."kind" = 'note' AND "card_source_links"."chunk_id" IS NULL AND "card_source_links"."confidence" IS NULL AND "card_source_links"."note" IS NOT NULL AND length(trim("card_source_links"."note")) > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_source_links_note_idx` ON `card_source_links` (`card_id`,`note`);--> statement-breakpoint
CREATE TABLE `card_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`actor` text NOT NULL,
	`actor_type` text NOT NULL,
	`mcp_session_id` text,
	`version` integer NOT NULL,
	`dependency_change` integer DEFAULT false NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_schema_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "snapshot_json_version_valid" CHECK(typeof("card_versions"."snapshot_schema_version") = 'integer' AND "card_versions"."snapshot_schema_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_versions_card_version_idx` ON `card_versions` (`card_id`,`version`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`story_map_id` text NOT NULL,
	`parent_id` text,
	`release_id` text,
	`key` text NOT NULL,
	`creation_origin` text DEFAULT 'unknown' NOT NULL,
	`provenance` text DEFAULT 'unknown' NOT NULL,
	`creation_source` text DEFAULT 'unknown' NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`parked` integer DEFAULT false NOT NULL,
	`priority` text,
	`business_value` integer,
	`effort` integer,
	`estimate` real,
	`color` text,
	`assignee` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cards_version_positive" CHECK(typeof("cards"."version") = 'integer' AND "cards"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_story_map_key_idx` ON `cards` (`story_map_id`,`key`);--> statement-breakpoint
CREATE INDEX `cards_story_map_id_idx` ON `cards` (`story_map_id`);--> statement-breakpoint
CREATE INDEX `cards_parent_id_idx` ON `cards` (`parent_id`);--> statement-breakpoint
CREATE TABLE `change_sets` (
	`undone_by_restore` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`operations_schema_version` integer NOT NULL,
	`operations_json` text NOT NULL,
	`proposed_by_json` text,
	`proposed_by_schema_version` integer,
	`approval_json` text,
	`approval_schema_version` integer,
	`execution_json` text,
	`execution_schema_version` integer,
	`warnings_json` text,
	`warnings_schema_version` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "proposed_by_json_version_valid" CHECK(("change_sets"."proposed_by_json" IS NULL AND "change_sets"."proposed_by_schema_version" IS NULL) OR ("change_sets"."proposed_by_json" IS NOT NULL AND typeof("change_sets"."proposed_by_schema_version") = 'integer' AND "change_sets"."proposed_by_schema_version" > 0)),
	CONSTRAINT "approval_json_version_valid" CHECK(("change_sets"."approval_json" IS NULL AND "change_sets"."approval_schema_version" IS NULL) OR ("change_sets"."approval_json" IS NOT NULL AND typeof("change_sets"."approval_schema_version") = 'integer' AND "change_sets"."approval_schema_version" > 0)),
	CONSTRAINT "execution_json_version_valid" CHECK(("change_sets"."execution_json" IS NULL AND "change_sets"."execution_schema_version" IS NULL) OR ("change_sets"."execution_json" IS NOT NULL AND typeof("change_sets"."execution_schema_version") = 'integer' AND "change_sets"."execution_schema_version" > 0)),
	CONSTRAINT "warnings_json_version_valid" CHECK(("change_sets"."warnings_json" IS NULL AND "change_sets"."warnings_schema_version" IS NULL) OR ("change_sets"."warnings_json" IS NOT NULL AND typeof("change_sets"."warnings_schema_version") = 'integer' AND "change_sets"."warnings_schema_version" > 0))
);
--> statement-breakpoint
CREATE TABLE `connector_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`auth_mode` text NOT NULL,
	`owner` text NOT NULL,
	`repository` text,
	`default_label` text DEFAULT 'local-story-map' NOT NULL,
	`read_only` integer DEFAULT true NOT NULL,
	`status_mapping_json` text DEFAULT '[]' NOT NULL,
	`status_mapping_schema_version` integer DEFAULT 1 NOT NULL,
	`issue_type_mapping_json` text DEFAULT '[]' NOT NULL,
	`issue_type_mapping_schema_version` integer DEFAULT 1 NOT NULL,
	`type_mapping_json` text DEFAULT '[{"match":"epic","level":"activity"},{"match":"feature","level":"step"}]' NOT NULL,
	`type_mapping_schema_version` integer DEFAULT 1 NOT NULL,
	`release_source` text DEFAULT 'milestone' NOT NULL,
	`iteration_field_name` text DEFAULT 'Iteration' NOT NULL,
	`labels_as_annotations` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "status_mapping_json_version_valid" CHECK(typeof("connector_connections"."status_mapping_schema_version") = 'integer' AND "connector_connections"."status_mapping_schema_version" > 0),
	CONSTRAINT "issue_type_mapping_json_version_valid" CHECK(typeof("connector_connections"."issue_type_mapping_schema_version") = 'integer' AND "connector_connections"."issue_type_mapping_schema_version" > 0),
	CONSTRAINT "type_mapping_json_version_valid" CHECK(typeof("connector_connections"."type_mapping_schema_version") = 'integer' AND "connector_connections"."type_mapping_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `database_metadata` (
	`id` integer PRIMARY KEY NOT NULL,
	`epoch` text NOT NULL,
	CONSTRAINT "database_metadata_singleton" CHECK("database_metadata"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `external_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`system` text NOT NULL,
	`external_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`synced_version` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "external_refs_entity_type_valid" CHECK("external_refs"."entity_type" IN ('card', 'release', 'persona')),
	CONSTRAINT "external_refs_system_valid" CHECK("external_refs"."system" <> '' AND "external_refs"."system" NOT GLOB '*[^a-z0-9-]*'),
	CONSTRAINT "external_refs_external_id_valid" CHECK(length("external_refs"."external_id") > 0 AND "external_refs"."external_id" = trim("external_refs"."external_id", char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))),
	CONSTRAINT "external_refs_synced_version_positive" CHECK(typeof("external_refs"."synced_version") = 'integer' AND "external_refs"."synced_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_refs_work_item_identity_idx` ON `external_refs` (`scope_id`,`system`,`external_id`) WHERE system IN ('github');--> statement-breakpoint
CREATE UNIQUE INDEX `external_refs_scoped_identity_idx` ON `external_refs` (`scope_id`,`entity_type`,`system`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_refs_entity_binding_idx` ON `external_refs` (`entity_type`,`entity_id`,`system`);--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`persona_type` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT '' NOT NULL,
	`represents` text DEFAULT '' NOT NULL,
	`age` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`fachexpertise` text DEFAULT '' NOT NULL,
	`work_life` text DEFAULT '' NOT NULL,
	`product_experience` text DEFAULT '' NOT NULL,
	`expectations` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`central_need` text DEFAULT '' NOT NULL,
	`success_indicators` text DEFAULT '' NOT NULL,
	`scope_note` text DEFAULT '' NOT NULL,
	`goals_json` text DEFAULT '[]' NOT NULL,
	`goals_schema_version` integer DEFAULT 1 NOT NULL,
	`pains_json` text DEFAULT '[]' NOT NULL,
	`pains_schema_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "goals_json_version_valid" CHECK(typeof("personas"."goals_schema_version") = 'integer' AND "personas"."goals_schema_version" > 0),
	CONSTRAINT "pains_json_version_valid" CHECK(typeof("personas"."pains_schema_version") = 'integer' AND "personas"."pains_schema_version" > 0),
	CONSTRAINT "personas_version_positive" CHECK(typeof("personas"."version") = 'integer' AND "personas"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE `plan_states` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text NOT NULL,
	`captured_at` text NOT NULL,
	`actor` text NOT NULL,
	`schema_version` integer NOT NULL,
	`payload_json` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_states_map_capture_idx` ON `plan_states` (`story_map_id`,`captured_at`,`id`);--> statement-breakpoint
CREATE TABLE `product_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text,
	`product_type` text DEFAULT '' NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`key_features_json` text DEFAULT '[]' NOT NULL,
	`key_features_schema_version` integer DEFAULT 1 NOT NULL,
	`target_users` text DEFAULT '' NOT NULL,
	`platform` text DEFAULT '' NOT NULL,
	`pricing` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`glossary` text DEFAULT '' NOT NULL,
	`non_goals` text DEFAULT '' NOT NULL,
	`compliance_constraints` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "key_features_json_version_valid" CHECK(typeof("product_contexts"."key_features_schema_version") = 'integer' AND "product_contexts"."key_features_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `project_settings` (
	`epoch` text NOT NULL,
	`project_id` text PRIMARY KEY NOT NULL,
	`getting_started_initialized` integer DEFAULT false NOT NULL,
	`getting_started_dismissed` integer DEFAULT false NOT NULL,
	`sample_story_map_id` text,
	`completed_story_map` integer DEFAULT false NOT NULL,
	`completed_cards` integer DEFAULT false NOT NULL,
	`completed_github` integer DEFAULT false NOT NULL,
	`completed_export` integer DEFAULT false NOT NULL,
	`agent_access_enabled` integer DEFAULT true NOT NULL,
	`github_enabled` integer DEFAULT false NOT NULL,
	`allow_agent_approval` integer DEFAULT false NOT NULL,
	`agent_protection_enabled` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`historical_stub` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`local_path` text NOT NULL,
	`description` text,
	`default_language` text DEFAULT 'en' NOT NULL,
	`default_estimation_unit` text DEFAULT 'points' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`story_map_id` text NOT NULL,
	`name` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`start_date` text,
	`release_date` text,
	`released` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "releases_version_positive" CHECK(typeof("releases"."version") = 'integer' AND "releases"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE `remote_push_executions` (
	`plan_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`execution_json` text NOT NULL,
	`execution_schema_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `remote_push_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "execution_json_version_valid" CHECK(typeof("remote_push_executions"."execution_schema_version") = 'integer' AND "remote_push_executions"."execution_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `remote_push_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`epoch` text NOT NULL,
	`plan_json` text NOT NULL,
	`plan_schema_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "plan_json_version_valid" CHECK(typeof("remote_push_plans"."plan_schema_version") = 'integer' AND "remote_push_plans"."plan_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `remote_work_item_links` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`external_ref_id` text NOT NULL,
	`title_hash` text,
	`body_hash` text,
	`remote_state` text,
	`issue_type` text,
	`managed_labels_json` text DEFAULT '[]' NOT NULL,
	`managed_labels_schema_version` integer DEFAULT 1 NOT NULL,
	`baseline_json` text,
	`baseline_schema_version` integer,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`labels_schema_version` integer DEFAULT 1 NOT NULL,
	`milestone` text,
	`remote_parent_number` integer,
	`parent_override_local` integer DEFAULT false NOT NULL,
	`sync_state` text DEFAULT 'unsynced' NOT NULL,
	`last_synced_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `connector_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`external_ref_id`) REFERENCES `external_refs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "managed_labels_json_version_valid" CHECK(typeof("remote_work_item_links"."managed_labels_schema_version") = 'integer' AND "remote_work_item_links"."managed_labels_schema_version" > 0),
	CONSTRAINT "labels_json_version_valid" CHECK(typeof("remote_work_item_links"."labels_schema_version") = 'integer' AND "remote_work_item_links"."labels_schema_version" > 0),
	CONSTRAINT "baseline_json_version_valid" CHECK(("remote_work_item_links"."baseline_json" IS NULL AND "remote_work_item_links"."baseline_schema_version" IS NULL) OR ("remote_work_item_links"."baseline_json" IS NOT NULL AND typeof("remote_work_item_links"."baseline_schema_version") = 'integer' AND "remote_work_item_links"."baseline_schema_version" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remote_work_item_links_external_ref_idx` ON `remote_work_item_links` (`external_ref_id`);--> statement-breakpoint
CREATE TABLE `roadmap_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_id` text NOT NULL,
	`column_id` text NOT NULL,
	`swimlane_id` text,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`labels_schema_version` integer DEFAULT 1 NOT NULL,
	`reach` real,
	`impact` real,
	`confidence` real,
	`effort` real,
	`position` integer NOT NULL,
	FOREIGN KEY (`roadmap_id`) REFERENCES `roadmaps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`column_id`) REFERENCES `roadmap_columns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`swimlane_id`) REFERENCES `roadmap_swimlanes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "labels_json_version_valid" CHECK(typeof("roadmap_cards"."labels_schema_version") = 'integer' AND "roadmap_cards"."labels_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `roadmap_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`roadmap_id`) REFERENCES `roadmaps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roadmap_references` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_card_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	FOREIGN KEY (`roadmap_card_id`) REFERENCES `roadmap_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `roadmap_swimlanes` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`roadmap_id`) REFERENCES `roadmaps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roadmaps` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'simple' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "roadmaps_version_positive" CHECK(typeof("roadmaps"."version") = 'integer' AND "roadmaps"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE `source_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`text` text NOT NULL,
	`locator` text NOT NULL,
	`heading` text,
	`page` integer,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`file_path` text NOT NULL,
	`file_hash` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_project_type_hash_idx` ON `source_documents` (`project_id`,`type`,`file_hash`);--> statement-breakpoint
CREATE TABLE `source_plan_baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text NOT NULL,
	`system` text NOT NULL,
	`version` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`entries_json` text NOT NULL,
	`releases_json` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_plan_baselines_version_positive" CHECK(typeof("source_plan_baselines"."version") = 'integer' AND "source_plan_baselines"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_plan_baselines_map_system_idx` ON `source_plan_baselines` (`story_map_id`,`system`);--> statement-breakpoint
CREATE TABLE `story_maps` (
	`next_card_number` integer DEFAULT 1 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`estimation_unit` text DEFAULT 'points' NOT NULL,
	`card_key_prefix` text DEFAULT 'LSM' NOT NULL,
	`default_connection_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_connection_id`) REFERENCES `connector_connections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "story_maps_version_positive" CHECK(typeof("story_maps"."version") = 'integer' AND "story_maps"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE `story_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text,
	`name` text NOT NULL,
	`description_template` text DEFAULT '' NOT NULL,
	`default_status` text DEFAULT 'todo' NOT NULL,
	`default_estimate` real,
	`position` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref_id` text NOT NULL,
	`sync_run_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`card_id` text,
	`remote_id` text,
	`field` text NOT NULL,
	`local_value_json` text NOT NULL,
	`local_value_schema_version` integer DEFAULT 1 NOT NULL,
	`remote_value_json` text NOT NULL,
	`remote_value_schema_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`sync_run_id`) REFERENCES `sync_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connector_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "local_value_json_version_valid" CHECK(typeof("sync_conflicts"."local_value_schema_version") = 'integer' AND "sync_conflicts"."local_value_schema_version" > 0),
	CONSTRAINT "remote_value_json_version_valid" CHECK(typeof("sync_conflicts"."remote_value_schema_version") = 'integer' AND "sync_conflicts"."remote_value_schema_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_conflicts_open_ref_field` ON `sync_conflicts` (`external_ref_id`,`field`) WHERE "sync_conflicts"."status" = 'open';--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `connector_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflow_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`story_map_id` text,
	`name` text NOT NULL,
	`group` text NOT NULL,
	`position` integer NOT NULL,
	`color` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_map_id`) REFERENCES `story_maps`(`id`) ON UPDATE no action ON DELETE no action
);
