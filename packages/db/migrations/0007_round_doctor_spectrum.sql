ALTER TABLE `story_maps` ADD `template_assignments_json` text;--> statement-breakpoint
ALTER TABLE `story_maps` ADD `template_assignments_schema_version` integer;--> statement-breakpoint
ALTER TABLE `story_templates` ADD `required_language` text;