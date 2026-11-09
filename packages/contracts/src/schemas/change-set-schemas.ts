import { z } from "zod";

export const OPERATIONS_SCHEMA_VERSION = 12;
export const changeSetStatusSchema = z.enum(["proposed", "approved", "applied", "rejected", "conflict", "stale"]);

export const changeSetActorSchema = z.object({ actorType: z.enum(["human", "agent", "github", "system"]), actorId: z.string().min(1), mcpSessionId: z.string().min(1).optional() }).strict();
export const changeSetApprovalSchema = z.object({ actor: changeSetActorSchema, approvedAt: z.iso.datetime(), operationsHash: z.string().regex(/^[a-f0-9]{64}$/), selectedOperationIds: z.array(z.string().min(1)) }).strict();
export const changeSetExecutionSchema = z.object({ actor: changeSetActorSchema, initiatedBy: changeSetActorSchema.optional(), appliedAt: z.iso.datetime(), selectedOperationIds: z.array(z.string().min(1)), operationResults: z.array(z.object({ operationId: z.string(), index: z.number().int().nonnegative(), entityIds: z.array(z.string()) }).strict()), restorePoint: z.string().optional(), retainedPreparedEffects: z.array(z.string()).default([]) }).strict();
export const changeSetWarningSchema = z.object({ code: z.literal("pending_external_reference_overlap"), priorChangeSetId: z.guid(), priorChangeSetTitle: z.string(), operationIds: z.array(z.string()).min(1), priorOperationIds: z.array(z.string()).min(1) }).strict();
export const changeSetSelectionRequestSchema = z.object({ selectedOperationIds: z.array(z.string().trim().min(1)).refine((ids) => new Set(ids).size === ids.length, "Duplicate selected operation ID.").optional() }).strict();

interface OperationIdentity { operationId: string; op: string; entityId?: string | undefined; }

export function makeChangeSetSchemas<S extends z.ZodType<OperationIdentity>>(operationSchema: S) {
  const changeSetSchema = z.object({
    operationsSchemaVersion: z.literal(OPERATIONS_SCHEMA_VERSION).default(OPERATIONS_SCHEMA_VERSION),
    proposedBy: changeSetActorSchema.optional(),
    approval: changeSetApprovalSchema.optional(),
    execution: changeSetExecutionSchema.optional(),
    warnings: z.array(changeSetWarningSchema).optional(),
    undoneByRestore: z.boolean().optional(),
    id: z.guid(),
    projectId: z.guid(),
    title: z.string().min(1),
    source: z.enum(["human", "ai", "mcp", "github", "import"]),
    status: changeSetStatusSchema.default("proposed"),
    operations: z.array(operationSchema).superRefine((operations, context) => {
      const operationIds = new Set<string>();
      const localIds = new Set<string>();
      operations.forEach((operation, index) => {
        if (operationIds.has(operation.operationId)) context.addIssue({ code: "custom", path: [index, "operationId"], message: "Duplicate operation ID." });
        operationIds.add(operation.operationId);
        if ((operation.op === "create" || operation.op === "upsert" || operation.op === "import") && operation.entityId) {
          if (localIds.has(operation.entityId)) context.addIssue({ code: "custom", path: [index, "entityId"], message: "Duplicate local creation ID." });
          localIds.add(operation.entityId);
        }
      });
    }),
    createdAt: z.iso.datetime({ precision: -1 }).or(z.iso.datetime())
  }).strict();
  const storedChangeSetSchema = changeSetSchema.extend({
    operationsSchemaVersion: z.number().int().positive(),
    status: changeSetStatusSchema,
    operations: z.array(z.unknown())
  }).strict();
  return { changeSetSchema, storedChangeSetSchema };
}
