import { z } from "zod";
import { cardSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";
import { incomingGitHubCommandResponseSchema } from "@storymapper/contracts/mcp/tools";

export const githubTicketPlacementSchema = z.object({ level: z.enum(["activity", "step", "story"]), parentId: uuidSchema.nullable(), releaseId: uuidSchema.nullable(), position: cardSchema.shape.position }).strict();
export const lookupGitHubTicketRequestSchema = z.object({ storyMapId: uuidSchema, connectionId: uuidSchema, selector: z.string().trim().min(1), placement: githubTicketPlacementSchema }).strict();
export const githubTicketReviewEvidenceSchema = z.object({ epoch: z.string().min(1), scopeHash: z.string().regex(/^[a-f0-9]{64}$/), remoteHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const lookupGitHubTicketResponseSchema = z.object({ ticket: z.object({ locator: z.string().url(), number: z.number().int().positive(), title: z.string(), description: z.string(), issueType: z.string().optional() }).strict(), reviewEvidence: githubTicketReviewEvidenceSchema, existingCardId: uuidSchema.optional() }).strict();
export const importGitHubTicketRequestSchema = lookupGitHubTicketRequestSchema.extend({ reviewEvidence: githubTicketReviewEvidenceSchema, title: cardSchema.shape.title, description: cardSchema.shape.description.removeDefault(), status: cardSchema.shape.status.removeDefault().optional(), estimate: cardSchema.shape.estimate.optional(), apply: z.boolean().optional() }).strict();
export const importGitHubTicketResponseSchema = z.union([incomingGitHubCommandResponseSchema, z.object({ outcome: z.literal("already_linked"), cardId: uuidSchema, url: z.string().url() }).strict()]);
export type GitHubTicketPlacement = z.infer<typeof githubTicketPlacementSchema>;
export type LookupGitHubTicketRequest = z.infer<typeof lookupGitHubTicketRequestSchema>;
export type LookupGitHubTicketResponse = z.infer<typeof lookupGitHubTicketResponseSchema>;
export type ImportGitHubTicketRequest = z.infer<typeof importGitHubTicketRequestSchema>;
export type ImportGitHubTicketResponse = z.infer<typeof importGitHubTicketResponseSchema>;
