import { z } from "zod";

export const operationalHealthSchema = z.strictObject({
  version: z.string().min(1).max(64),
  schemaVersion: z.string().min(1).max(128).nullable(),
  epoch: z.string().uuid().nullable(),
  writeGate: z.enum(["available", "writing", "restoring", "unavailable", "stopping"]),
  pendingMigration: z.string().min(1).max(128).nullable()
});
export type OperationalHealth = z.infer<typeof operationalHealthSchema>;
