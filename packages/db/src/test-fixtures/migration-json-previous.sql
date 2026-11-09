ALTER TABLE product_contexts RENAME COLUMN key_features_json TO legacy_features_json;
--> statement-breakpoint
ALTER TABLE product_contexts RENAME COLUMN key_features_schema_version TO legacy_features_schema_version;
