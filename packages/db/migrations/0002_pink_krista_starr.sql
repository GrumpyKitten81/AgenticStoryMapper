ALTER TABLE cards ADD archived integer NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE cards SET archived = true WHERE status = 'archived';
--> statement-breakpoint
ALTER TABLE connector_connections ADD status_source_json text NOT NULL DEFAULT '{"kind":"repository"}';
--> statement-breakpoint
ALTER TABLE connector_connections ADD status_source_schema_version integer NOT NULL DEFAULT 1 CHECK (typeof(status_source_schema_version) = 'integer' AND status_source_schema_version > 0);
--> statement-breakpoint
ALTER TABLE connector_connections ADD status_catalogs_json text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE connector_connections ADD status_catalogs_schema_version integer NOT NULL DEFAULT 1 CHECK (typeof(status_catalogs_schema_version) = 'integer' AND status_catalogs_schema_version > 0);
--> statement-breakpoint
ALTER TABLE remote_work_item_links ADD status_evidence_json text;
--> statement-breakpoint
ALTER TABLE remote_work_item_links ADD status_evidence_schema_version integer CHECK ((status_evidence_json IS NULL AND status_evidence_schema_version IS NULL) OR (status_evidence_json IS NOT NULL AND typeof(status_evidence_schema_version) = 'integer' AND status_evidence_schema_version > 0));

--> statement-breakpoint
ALTER TABLE change_sets ADD trusted_github_status integer NOT NULL DEFAULT false;
