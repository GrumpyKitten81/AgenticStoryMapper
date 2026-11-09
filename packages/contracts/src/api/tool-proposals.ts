import { z } from "zod";

const repositorySchema = z.string().regex(/^[^/\s]+\/[^/\s]+$/);

export const copyStoryMapProposalRequestSchema = z.object({
  sourceStoryMapId: z.guid(),
  targetName: z.string().trim().min(1)
}).strict();
export type CopyStoryMapProposalRequest = z.infer<typeof copyStoryMapProposalRequestSchema>;

export const githubBoardIssueSchema = z.object({
  repository: repositorySchema,
  number: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string(),
  state: z.enum(["open", "closed"]),
  url: z.url(),
  labels: z.array(z.string()),
  assignee: z.string().nullable(),
  milestone: z.string().nullable(),
  issueType: z.string().nullable(),
  parentRepository: repositorySchema.nullable(),
  parentNumber: z.number().int().positive().nullable()
}).strict().refine((issue) => (issue.parentRepository === null) === (issue.parentNumber === null), {
  message: "Parent repository and issue number must both be absent or both be present."
});
export type GitHubBoardIssue = z.infer<typeof githubBoardIssueSchema>;

export const githubBoardProposalRequestSchema = z.object({
  projectId: z.guid(),
  storyMapName: z.string().trim().min(1),
  boardUrl: z.url(),
  storyMapId: z.guid().optional(),
  cleanup: z.boolean().default(false),
  removeCardIds: z.array(z.guid()).default([]),
  issues: z.array(githubBoardIssueSchema)
}).strict().superRefine((input, context) => {
  if (input.cleanup && input.storyMapId) context.addIssue({ code: "custom", message: "Sync cannot clean up Story Maps." });
  if (!input.storyMapId && input.removeCardIds.length) context.addIssue({ code: "custom", message: "Removal requires a sync Story Map." });
  if (new Set(input.removeCardIds).size !== input.removeCardIds.length) context.addIssue({ code: "custom", message: "Duplicate removal Card ID." });
  const keys = input.issues.map((issue) => `${issue.repository.toLowerCase()}#${issue.number}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Duplicate GitHub issue." });
});
export type GitHubBoardProposalRequest = z.infer<typeof githubBoardProposalRequestSchema>;

const countInventorySchema = z.record(z.string(), z.number().int().nonnegative());
const expectedMapFingerprintsSchema = z.record(z.guid(), z.string().regex(/^[a-f0-9]{64}$/));
const previewValueSchema = z.union([z.string(), z.null(), z.object({ value: z.string(), truncated: z.literal(true), length: z.number().int().nonnegative() }).strict()]);
const previewCardIdentitySchema = z.object({ id: z.guid(), key: z.string().min(1), title: previewValueSchema }).strict();
export const storyMapCopyOperationPayloadSchema = z.object({
  input: copyStoryMapProposalRequestSchema, expected: expectedMapFingerprintsSchema,
  preview: z.object({ source: z.object({ id: z.guid(), name: z.string().min(1) }).strict(),
    target: z.object({ id: z.guid(), name: z.string().min(1) }).strict(), inventory: countInventorySchema }).strict()
}).strict();
export const githubBoardImportOperationPayloadSchema = z.object({
  input: githubBoardProposalRequestSchema, expected: expectedMapFingerprintsSchema,
  preview: z.object({
    connectors: z.array(z.object({ repository: repositorySchema, existingId: z.guid().nullable(),
      before: z.object({ projectId: z.guid(), provider: z.string().min(1), owner: z.string().min(1), repository: z.string().optional(), readOnly: z.boolean() }).strict().nullable(),
      after: z.object({ readOnly: z.literal(true) }).strict() }).strict()),
    sync: z.object({ removals: z.array(previewCardIdentitySchema), overwrites: z.array(previewCardIdentitySchema.extend({
      fields: z.partialRecord(z.enum(["title", "description", "status", "assignee"]), z.object({ before: previewValueSchema, after: previewValueSchema }).strict())
    }).strict()) }).strict(),
    cleanup: z.array(z.object({ id: z.guid(), name: z.string().min(1), inventory: countInventorySchema }).strict())
  }).strict()
}).strict();
