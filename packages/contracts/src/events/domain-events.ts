import { z } from "zod";
import { activityEventSchema, cardSchema, changeSetSchema, githubLinkSchema, uuidSchema } from "@storymapper/contracts/schemas/domain";

export const domainEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("card.updated"),
    payload: cardSchema
  }),
  z.object({
    type: z.literal("changeset.created"),
    payload: changeSetSchema
  }),
  z.object({
    type: z.literal("activity.logged"),
    payload: activityEventSchema
  }),
  z.object({
    type: z.literal("github.sync.updated"),
    payload: githubLinkSchema
  }),
  z.object({
    type: z.literal("source.coverage.updated"),
    payload: z.object({
      storyMapId: uuidSchema,
      coveredChunks: z.number().refine(Number.isInteger).nonnegative(),
      totalChunks: z.number().refine(Number.isInteger).nonnegative()
    })
  })
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
