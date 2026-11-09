ALTER TABLE `project_settings` ADD `agent_mode` text DEFAULT 'apply' NOT NULL;--> statement-breakpoint
UPDATE `project_settings` SET `agent_mode` = CASE WHEN `agent_access_enabled` = 0 THEN 'off' WHEN `agent_protection_enabled` = 1 THEN 'propose' WHEN `allow_agent_approval` = 1 THEN 'autonomous' ELSE 'apply' END;--> statement-breakpoint
ALTER TABLE `project_settings` DROP COLUMN `agent_access_enabled`;--> statement-breakpoint
ALTER TABLE `project_settings` DROP COLUMN `allow_agent_approval`;--> statement-breakpoint
ALTER TABLE `project_settings` DROP COLUMN `agent_protection_enabled`;
