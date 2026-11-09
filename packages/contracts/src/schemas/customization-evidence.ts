import { z } from "zod";
import type { annotationSchema, cardSchema, personaSchema, workflowStatusSchema } from "@storymapper/contracts/schemas/domain";

export function customizationEvidenceSchemas(schemas: { card: typeof cardSchema; workflowStatus: typeof workflowStatusSchema; persona: typeof personaSchema; annotation: typeof annotationSchema }) {
  const affectedCards = z.array(z.object({ id: schemas.card.shape.id, baseVersion: z.number().int().positive() }).strict());
  const statusEvidence = { definitionBefore: schemas.workflowStatus.optional(), affectedCards: affectedCards.optional() };
  const statusDelete = z.object({ ...statusEvidence, replacementBefore: schemas.workflowStatus.optional() }).strict();
  const annotationDelete = z.object({ definitionBefore: schemas.annotation.optional(), affectedCards: affectedCards.optional(), confirmUnlink: z.boolean().optional() }).strict();
  const personaDelete = z.object({ definitionBefore: schemas.persona.optional(), affectedCards: affectedCards.optional(), confirmUnlink: z.boolean().optional() }).strict();
  return { affectedCards, statusEvidence, statusDelete, annotationDelete, personaDelete };
}
