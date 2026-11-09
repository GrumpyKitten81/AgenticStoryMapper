import { z } from "zod";
import { actorContextSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";

export const LIVE_CLIENT_ID_HEADER = "x-storymapper-client-id";
export const liveClientIdSchema = uuidSchema;
export const liveEntitySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  version: z.number().int().positive().nullable(),
  projectId: uuidSchema.nullable()
});
export type LiveEntity = z.infer<typeof liveEntitySchema>;
export const liveCursorSchema = z.object({ epoch: uuidSchema, seq: z.number().int().nonnegative() });
export const liveEventIdSchema = z.string().regex(/^[0-9a-f-]{36}:(?:0|[1-9][0-9]*)$/i).transform((value) => {
  const [epoch, sequence] = value.split(":");
  return { epoch: epoch!, seq: Number(sequence) };
}).pipe(liveCursorSchema.extend({ seq: z.number().int().nonnegative().refine(Number.isSafeInteger) }));
const liveEnvelopeSchema = liveCursorSchema.extend({ id: z.string().min(1) });
export const liveResetSchema = liveEnvelopeSchema.refine((value) => value.id === `${value.epoch}:${value.seq}`, "Event ID must match its epoch and sequence.");
export type LiveReset = z.infer<typeof liveResetSchema>;
export const liveTransactionSchema = liveEnvelopeSchema.extend({
  entities: z.array(liveEntitySchema),
  actor: actorContextSchema,
  originClientId: liveClientIdSchema.nullable()
}).refine((value) => value.id === `${value.epoch}:${value.seq}`, "Event ID must match its epoch and sequence.");
export type LiveTransaction = z.infer<typeof liveTransactionSchema>;
