import { z } from "zod";

export const githubStatusSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repository") }).strict(),
  z.object({ kind: z.literal("project"), projectId: z.string().min(1), projectName: z.string().min(1), fieldId: z.string().min(1) }).strict()
]);
export const githubStatusOptionSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), position: z.number().int().nonnegative(), color: z.string().optional(), retired: z.boolean().optional()
}).strict();
export const githubStatusCatalogSchema = z.object({ source: githubStatusSourceSchema, options: z.array(githubStatusOptionSchema).refine((options) => new Set(options.map((option) => option.id)).size === options.length, "Duplicate GitHub status option identity.") }).strict();
export const githubStatusEvidenceSchema = z.object({
  source: githubStatusSourceSchema, issueState: z.enum(["open", "closed"]), membership: z.enum(["present", "missing"]),
  optionId: z.string().min(1).nullable(), name: z.string().min(1).nullable()
}).strict().refine((evidence) => (evidence.optionId === null) === (evidence.name === null) && (evidence.membership !== "missing" || evidence.optionId === null), "Incomplete GitHub status assignment evidence.");
export type GitHubStatusSource = z.infer<typeof githubStatusSourceSchema>;
export type GitHubStatusCatalog = z.infer<typeof githubStatusCatalogSchema>;
export type GitHubStatusEvidence = z.infer<typeof githubStatusEvidenceSchema>;

export function githubStatusSourceKey(source: GitHubStatusSource): string {
  return source.kind === "repository" ? "repository" : `project:${source.projectId}:${source.fieldId}`;
}
