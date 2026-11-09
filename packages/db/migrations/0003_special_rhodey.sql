CREATE TABLE `card_review_records` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`card_id` text,
	`payload_json` text NOT NULL,
	`payload_schema_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payload_json_version_valid" CHECK(typeof("card_review_records"."payload_schema_version") = 'integer' AND "card_review_records"."payload_schema_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `card_review_project_card_idx` ON `card_review_records` (`project_id`,`card_id`);--> statement-breakpoint
ALTER TABLE `cards` ADD `card_type` text;
--> statement-breakpoint
UPDATE connector_connections SET issue_type_mapping_json = '[]', issue_type_mapping_schema_version = 1;
--> statement-breakpoint
UPDATE change_sets SET status = 'stale', approval_json = NULL, approval_schema_version = NULL WHERE status IN ('proposed', 'approved', 'conflict') AND operations_json LIKE '%issueTypeMapping%';
