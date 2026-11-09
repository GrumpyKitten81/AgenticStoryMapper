import { z } from "zod";
import { domainErrorCodes } from "@storymapper/contracts/schemas/errors";

export const syncFailurePhaseSchema = z.enum(["prepare", "remote_write", "persist", "finalize", "not_attempted"]);
export type SyncFailurePhase = z.infer<typeof syncFailurePhaseSchema>;
export const syncFailureDetailsSchema = z.object({ phase: syncFailurePhaseSchema }).catchall(z.unknown());

export const syncItemResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["proposed", "unchanged", "already_linked", "conflict", "not_attempted"]), cardId: z.string().optional(), remoteId: z.string().optional(), url: z.string().optional(), message: z.string().optional() }),
  z.object({ status: z.literal("succeeded"), cardId: z.string().optional(), remoteId: z.string(), url: z.string() }),
  z.object({ status: z.literal("failed"), cardId: z.string().optional(), remoteId: z.string().optional(), url: z.string().optional(), code: z.enum(domainErrorCodes), message: z.string(), details: syncFailureDetailsSchema })
]);
export type SyncItemResult = z.infer<typeof syncItemResultSchema>;
