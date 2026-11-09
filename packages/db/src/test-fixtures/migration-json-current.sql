ALTER TABLE product_contexts RENAME COLUMN legacy_features_json TO key_features_json;
--> statement-breakpoint
ALTER TABLE product_contexts RENAME COLUMN legacy_features_schema_version TO key_features_schema_version;
