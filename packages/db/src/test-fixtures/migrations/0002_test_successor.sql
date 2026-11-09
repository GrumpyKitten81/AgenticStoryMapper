PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`historical_stub` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`local_path` text NOT NULL,
	`description` text,
	`default_language` text DEFAULT 'en' NOT NULL,
	`default_estimation_unit` text DEFAULT 'points' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "test_projects_name_nonblank" CHECK(length(trim("__new_projects"."name")) > 0)
);
--> statement-breakpoint
INSERT INTO `__new_projects`("historical_stub", "id", "name", "local_path", "description", "default_language", "default_estimation_unit", "created_at") SELECT "historical_stub", "id", "name", "local_path", "description", "default_language", "default_estimation_unit", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `test_projects_name_idx` ON `projects` (`name`);