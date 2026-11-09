import { z } from "zod";

export const connectionVerificationFailureSchema = z.object({
  kind: z.enum(["credentials", "repository", "rate-limit", "network", "provider", "stale", "storage", "database"]),
  message: z.string(),
  nextAction: z.string()
}).strict();
export type ConnectionVerificationFailure = z.infer<typeof connectionVerificationFailureSchema>;

export const repositoryCapabilitiesSchema = z.object({
  read: z.literal(true),
  write: z.enum(["available", "unavailable", "unknown"]),
  limitation: z.string()
}).strict();
export type RepositoryCapabilities = z.infer<typeof repositoryCapabilitiesSchema>;
