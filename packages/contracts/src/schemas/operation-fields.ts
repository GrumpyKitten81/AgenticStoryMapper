import { isWorkItemProvider } from "@storymapper/contracts/schemas/work-item-identity";
import { z } from "zod";
import type { cardSchema, personaSchema, releaseSchema, storyMapSchema } from "@storymapper/contracts/schemas/domain";
import { builtinProposalTemplateSchema } from "@storymapper/contracts/schemas/proposal-templates";

const referenceSchema = z.string().trim().min(1);
const uuidSchema = z.guid();
const chunkIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceImportOperationPayloadSchema = z.object({ projectId: uuidSchema, title: z.string().min(1), type: z.enum(["markdown", "txt"]), fileHash: chunkIdSchema, filePath: z.string().optional(), inlineContent: z.string().optional() }).strict();
export const externalOperationSelectorSchema = z.object({
  kind: z.literal("externalRef"), scopeId: uuidSchema,
  system: z.string().trim().regex(/^[a-z0-9-]+$/).refine((value) => !isWorkItemProvider(value), "Work-item provider systems are reserved."),
  externalId: referenceSchema
}).strict();
export const persistedOrLocalOperationSelectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("id"), id: uuidSchema }).strict(),
  z.object({ kind: z.literal("local"), localId: referenceSchema }).strict()
]);
export const operationSelectorSchema = z.union([persistedOrLocalOperationSelectorSchema, externalOperationSelectorSchema]);
export type OperationSelector = z.infer<typeof operationSelectorSchema>;
export const sourceChunkSelectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chunk"), chunkId: chunkIdSchema }).strict(),
  z.object({ kind: z.literal("import"), operationId: referenceSchema, locator: referenceSchema }).strict()
]);
export const operationSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chunk"), chunkId: chunkIdSchema }).strict(),
  z.object({ kind: z.literal("github"), externalRefId: uuidSchema }).strict(),
  z.object({ kind: z.literal("note"), note: referenceSchema }).strict()
]);
export const changeOperationContextSchema = z.object({
  projectId: uuidSchema.optional(), storyMapId: uuidSchema.optional(), templateId: builtinProposalTemplateSchema.optional(),
  productContextId: uuidSchema.optional(), sourceChunkIds: z.array(chunkIdSchema).optional(),
  cardIds: z.array(uuidSchema).optional()
}).strict();
export type ChangeOperationContext = z.infer<typeof changeOperationContextSchema>;
export const sourceLinkOperationPayloadSchema = z.union([
  z.object({ kind: z.literal("chunk"), cardId: referenceSchema, chunkId: chunkIdSchema, confidence: z.number().min(0).max(1).nullable().optional() }).strict(),
  z.object({ kind: z.literal("chunk"), cardId: referenceSchema, chunk: sourceChunkSelectorSchema, confidence: z.number().min(0).max(1).nullable().optional() }).strict(),
  z.object({ kind: z.literal("github"), cardId: referenceSchema, externalRefId: uuidSchema }).strict(),
  z.object({ kind: z.literal("note"), cardId: referenceSchema, note: referenceSchema }).strict()
]);
export const sourceUnlinkOperationPayloadSchema = z.object({
  cardId: referenceSchema, kind: z.enum(["chunk", "note", "github"]), id: uuidSchema
}).strict();

export function operationPayloadSchemas(schemas: { card: typeof cardSchema; map: typeof storyMapSchema; release: typeof releaseSchema; persona: typeof personaSchema }) {
  const cardPatch = schemas.card.pick({ cardType: true, title: true, description: true, archived: true, status: true, priority: true, businessValue: true, effort: true, estimate: true, color: true, assignee: true })
    .extend({ description: schemas.card.shape.description.removeDefault(), status: schemas.card.shape.status.removeDefault(), releaseId: referenceSchema.nullable() }).partial().strict();
  const cardPublication = cardPatch.extend({ storyMapId: uuidSchema, level: schemas.card.shape.level, title: schemas.card.shape.title,
    parentId: referenceSchema.nullable().optional(), position: schemas.card.shape.position.optional() }).strict();
  const cardCreate = cardPublication.omit({ priority: true, businessValue: true, effort: true, color: true }).extend({ assignee: z.string().min(1).optional() }).strict();
  const mapPatch = schemas.map.pick({ epicContext: true, name: true, description: true, cardKeyPrefix: true, defaultConnectionId: true }).extend({ cardKeyPrefix: schemas.map.shape.cardKeyPrefix.removeDefault() }).partial().strict();
  const mapCreate = mapPatch.omit({ defaultConnectionId: true, cardKeyPrefix: true }).extend({ projectId: uuidSchema, name: schemas.map.shape.name }).strict();
  const releasePatch = schemas.release.pick({ name: true, position: true, startDate: true, releaseDate: true })
    .extend({ goal: schemas.release.shape.goal.removeDefault(), released: schemas.release.shape.released.removeDefault() }).partial().strict();
  const releasePublication = releasePatch.extend({ storyMapId: uuidSchema, name: schemas.release.shape.name }).strict();
  const releaseCreate = releasePublication;
  const personaFields = schemas.persona.omit({ id: true, version: true, projectId: true, storyMapId: true });
  const personaPatch = z.object(Object.fromEntries(Object.entries(personaFields.shape).map(([key, field]) => [key, field instanceof z.ZodDefault ? field.removeDefault() : field])) as { [K in keyof typeof personaFields.shape]: typeof personaFields.shape[K] extends z.ZodDefault<infer Inner> ? Inner : typeof personaFields.shape[K] }).partial().strict();
  const personaCreate = personaPatch.extend({ projectId: uuidSchema, storyMapId: uuidSchema.nullable().optional(), name: schemas.persona.shape.name }).strict();
  const move = z.object({ parentId: referenceSchema.nullable(), position: schemas.card.shape.position, releaseId: referenceSchema.nullable().optional() }).strict();
  return { cardPatch, cardCreate, cardPublication, mapPatch, mapCreate, releasePatch, releaseCreate, releasePublication, personaPatch, personaCreate, move };
}
export type CardOperationPatch = z.infer<ReturnType<typeof operationPayloadSchemas>["cardPatch"]>;
export type CardOperationPayload = z.infer<ReturnType<typeof operationPayloadSchemas>["cardCreate"]>;
export type ReleaseOperationPayload = z.infer<ReturnType<typeof operationPayloadSchemas>["releaseCreate"]>;
export type PersonaOperationPayload = z.infer<ReturnType<typeof operationPayloadSchemas>["personaCreate"]>;
