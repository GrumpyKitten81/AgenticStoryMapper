import { z } from "zod";
import { githubBoardImportOperationPayloadSchema, storyMapCopyOperationPayloadSchema } from "@storymapper/contracts/api/tool-proposals";
import { changeOperationContextSchema, externalOperationSelectorSchema, operationPayloadSchemas, operationSelectorSchema, persistedOrLocalOperationSelectorSchema, operationSourceSchema, sourceImportOperationPayloadSchema, sourceLinkOperationPayloadSchema, sourceUnlinkOperationPayloadSchema } from "@storymapper/contracts/schemas/operation-fields";
import type { cardSchema, personaSchema, releaseSchema, storyMapSchema } from "@storymapper/contracts/schemas/domain";

import { remainingOperationMembers, type RemainingSchemas } from "@storymapper/contracts/schemas/remaining-operations";

import { connectorConnectionSchema, remoteWorkItemLinkSchema, remoteWorkItemSyncStateSchema, syncRunSchema, syncConflictSchema, syncConflictReviewSchema, syncPlanSchema } from "@storymapper/contracts/schemas/domain";

import { sourcePlanAcknowledgmentSchema } from "@storymapper/contracts/schemas/plan-drift";
import { githubStatusCatalogSchema } from "@storymapper/contracts/schemas/github-status";

const optionalEntityIdSchema = z.string().trim().min(1).optional();

const operationBase = z.object({
  operationId: z.string().trim().min(1), entityId: z.string().trim().min(1),
  selector: operationSelectorSchema.optional(), reason: z.string().optional(), rationale: z.string().optional(),
  sources: z.array(operationSourceSchema).optional(), context: changeOperationContextSchema.optional(),
  baseVersion: z.number().int().positive().optional()
});

export function makeChangeOperationSchema(schemas: { card: typeof cardSchema; map: typeof storyMapSchema; release: typeof releaseSchema; persona: typeof personaSchema } & RemainingSchemas) {
  const fields = operationPayloadSchemas(schemas);
  return z.union([
    ...remainingOperationMembers(schemas, operationBase),
    operationBase.extend({ op: z.literal("acknowledge"), entity: z.literal("sourcePlan"), entityId: optionalEntityIdSchema, selector: z.never().optional(), after: sourcePlanAcknowledgmentSchema }).strict(),
    operationBase.extend({ op: z.literal("set"), entity: z.literal("remoteWorkItemLink"), selector: z.never().optional(), entityId: optionalEntityIdSchema, before: remoteWorkItemLinkSchema.nullable().optional(), connectionBefore: connectorConnectionSchema.optional(), statusCatalog: githubStatusCatalogSchema.optional(), statusCardsBefore: z.array(schemas.card.strict()).optional(), ticketPlacementBefore: z.object({ storyMap: schemas.map.strict(), parent: schemas.card.strict().nullable(), release: schemas.release.strict().nullable() }).strict().optional(), after: remoteWorkItemSyncStateSchema.omit({ id: true }).extend({ externalRefId: z.string().min(1) }).strict() }).strict(),
    operationBase.extend({ op: z.literal("create"), entity: z.literal("syncRun"), selector: z.never().optional(), connectionBefore: connectorConnectionSchema.optional(), after: syncRunSchema.omit({ id: true, createdAt: true }).extend({ dryRunPlan: syncPlanSchema.optional() }).strict() }).strict(),
    operationBase.extend({ op: z.literal("create"), entity: z.literal("syncConflict"), selector: z.never().optional(), after: syncConflictSchema.omit({ id: true, createdAt: true, resolvedAt: true }).extend({ syncRunId: z.string().min(1) }).strict() }).strict(),
    operationBase.extend({ op: z.literal("resolve"), entity: z.literal("syncConflict"), selector: z.never().optional(), before: syncConflictSchema.strict(), after: z.object({ resolution: z.enum(["local", "remote"]), reviewed: syncConflictReviewSchema }).strict() }).strict(),
    operationBase.extend({ op: z.literal("import"), selector: z.never().optional(), entity: z.literal("sourceDocument"), entityId: optionalEntityIdSchema, after: sourceImportOperationPayloadSchema }).strict(),
    operationBase.extend({ op: z.literal("create"), selector: z.never().optional(), entity: z.literal("storyMap"), entityId: optionalEntityIdSchema, after: fields.mapCreate }).strict(),
    operationBase.extend({ op: z.literal("update"), entity: z.literal("storyMap"), selector: persistedOrLocalOperationSelectorSchema.optional(), after: fields.mapPatch.transform(definedFields).refine(nonempty), before: schemas.map.strict().optional() }).strict(),
    operationBase.extend({ op: z.literal("create"), selector: z.never().optional(), entity: z.literal("card"), entityId: optionalEntityIdSchema, after: fields.cardCreate }).strict(),
    operationBase.extend({ op: z.literal("update"), entity: z.literal("card"), after: fields.cardPatch.transform(definedFields).refine(nonempty), before: schemas.card.strict().optional() }).strict(),
    operationBase.extend({ op: z.literal("move"), entity: z.literal("card"), after: fields.move, before: schemas.card.strict().optional() }).strict(),
    operationBase.extend({ op: z.literal("create"), selector: z.never().optional(), entity: z.literal("release"), entityId: optionalEntityIdSchema, after: fields.releaseCreate }).strict(),
    operationBase.extend({ op: z.literal("update"), entity: z.literal("release"), after: fields.releasePatch.transform(definedFields).refine(nonempty), before: schemas.release.strict().optional() }).strict(),
    operationBase.extend({ op: z.literal("create"), selector: z.never().optional(), entity: z.literal("persona"), entityId: optionalEntityIdSchema, after: fields.personaCreate }).strict(),
    operationBase.extend({ op: z.literal("update"), entity: z.literal("persona"), after: fields.personaPatch.transform(definedFields).refine(nonempty), before: schemas.persona.strict().optional() }).strict(),
    operationBase.extend({ op: z.literal("link"), selector: z.never().optional(), entity: z.literal("sourceLink"), after: sourceLinkOperationPayloadSchema }).strict(),
    operationBase.extend({ op: z.literal("unlink"), selector: z.never().optional(), entity: z.literal("sourceLink"), after: sourceUnlinkOperationPayloadSchema }).strict(),
    operationBase.extend({ op: z.literal("upsert"), entity: z.literal("card"), entityId: optionalEntityIdSchema, selector: externalOperationSelectorSchema, after: fields.cardPublication }).strict(),
    operationBase.extend({ op: z.literal("upsert"), entity: z.literal("release"), entityId: optionalEntityIdSchema, selector: externalOperationSelectorSchema, after: fields.releasePublication }).strict(),
    operationBase.extend({ op: z.literal("upsert"), entity: z.literal("persona"), entityId: optionalEntityIdSchema, selector: externalOperationSelectorSchema, after: fields.personaCreate }).strict(),
    operationBase.extend({ op: z.literal("create"), selector: z.never().optional(), entity: z.literal("storyMapCopy"), after: storyMapCopyOperationPayloadSchema }).strict(),
    operationBase.extend({ op: z.literal("create"), selector: z.never().optional(), entity: z.literal("githubBoardImport"), after: githubBoardImportOperationPayloadSchema }).strict()
  ]).superRefine((operation, context) => {
    if (operation.entityId !== undefined && operation.operationId === operation.entityId) context.addIssue({ code: "custom", path: ["entityId"], message: "Operation ID and entity/local ID must be distinct." });
  });
}

function nonempty(value: object): boolean { return Object.keys(value).length > 0; }

function definedFields<T extends object>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T; }
