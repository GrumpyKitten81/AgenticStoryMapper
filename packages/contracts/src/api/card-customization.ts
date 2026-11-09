import { z } from "zod";
import { customizationEvidenceSchemas } from "@storymapper/contracts/schemas/customization-evidence";
import { externalOperationSelectorSchema } from "@storymapper/contracts/schemas/operation-fields";
import { baseVersionSchema } from "@storymapper/contracts/schemas/conflicts";
import {
  annotationSchema,
  cardSchema,
  cardAttachmentSchema,
  cardAnnotationLinkSchema,
  cardPersonaLinkSchema,
  cardHistoryEntrySchema,
  personaSchema,
  releaseSchema,
  storyTemplateSchema,
  workflowStatusSchema,
  uuidSchema
} from "@storymapper/contracts/schemas/domain";

export const createCardRequestSchema = cardSchema
  .pick({
    storyMapId: true,
    parentId: true,
    releaseId: true,
    level: true,
    cardType: true,
    title: true,
    description: true,
    position: true,
    status: true,
    assignee: true,
    estimate: true
  })
  .extend({
    description: cardSchema.shape.description.removeDefault(),
    status: cardSchema.shape.status.removeDefault()
  })
  .partial({
    parentId: true,
    releaseId: true,
    description: true,
    position: true,
    status: true,
    assignee: true,
    estimate: true
  }).extend({ apply: z.boolean().optional() });

export const updateCardRequestSchema = cardSchema
  .pick({
    cardType: true,
    title: true,
    description: true,
    archived: true,
    status: true,
    priority: true,
    businessValue: true,
    effort: true,
    estimate: true,
    color: true,
    assignee: true,
    releaseId: true
  })
  .extend({
    description: cardSchema.shape.description.removeDefault(),
    status: cardSchema.shape.status.removeDefault()
  })
  .partial().extend({ apply: z.boolean().optional() });

const bulkUpdateCardsPatchSchema = z.object({
  storyMapId: uuidSchema,
  patch: cardSchema
    .pick({
      cardType: true,
      archived: true,
    status: true,
      releaseId: true,
      estimate: true,
      color: true
    })
    .extend({
      status: cardSchema.shape.status.removeDefault()
    })
    .partial()
    .extend({
      addPersonaId: uuidSchema.optional(),
      removePersonaId: uuidSchema.optional(),
      addAnnotationId: uuidSchema.optional(),
      removeAnnotationId: uuidSchema.optional()
    })
});
const requireBulkPatchField = [(value: { patch: object }) => Object.keys(value.patch).length > 0, { message: "At least one card field is required." }] as const;

export const bulkUpdateCardsRequestSchema = bulkUpdateCardsPatchSchema.extend({ cardIds: z.array(uuidSchema).min(1) }).refine(...requireBulkPatchField);

export const bulkUpdateCardsCommandSchema = bulkUpdateCardsPatchSchema.extend({
  cards: z.array(z.object({ id: uuidSchema, baseVersion: baseVersionSchema })).min(1)
}).extend({ apply: z.boolean().optional() }).refine(...requireBulkPatchField);

export const updateDeliveryStatusRequestSchema = z.object({
  storyMapId: uuidSchema,
  cards: z.array(z.object({
    system: externalOperationSelectorSchema.shape.system,
    externalId: externalOperationSelectorSchema.shape.externalId,
    status: workflowStatusSchema.shape.name
  }).strict()).min(1).max(100),
  apply: z.boolean().optional()
}).strict();
export type UpdateDeliveryStatusRequest = z.infer<typeof updateDeliveryStatusRequestSchema>;

export const bulkUpdateCardsResponseSchema = z.object({
  cards: z.array(cardSchema)
});

export const createCardAttachmentRequestSchema = cardAttachmentSchema
  .pick({
    label: true,
    filePath: true,
    mimeType: true
  })
  .partial({
    mimeType: true
  }).extend({ apply: z.boolean().optional() });

export const cardAttachmentResponseSchema = z.object({
  attachment: cardAttachmentSchema
});

export const cardAttachmentsResponseSchema = z.object({
  attachments: z.array(cardAttachmentSchema)
});

export const deleteCardAttachmentResponseSchema = z.object({
  ok: z.boolean()
});

export const cardHistoryCursorSchema = z.coerce.number().refine(Number.isInteger).positive().max(Number.MAX_SAFE_INTEGER);
export const cardHistoryQuerySchema = z.object({
  beforeVersion: cardHistoryCursorSchema.optional(),
  limit: z.coerce.number().refine(Number.isInteger).min(1).max(100).default(20)
}).strict();
export type CardHistoryQuery = z.infer<typeof cardHistoryQuerySchema>;

export const cardHistoryResponseSchema = z.object({
  versions: z.array(cardHistoryEntrySchema),
  nextCursor: z.number().refine(Number.isInteger).positive().nullable()
});
export type CardHistoryResponse = z.infer<typeof cardHistoryResponseSchema>;

export const moveCardRequestSchema = z.object({
  parentId: uuidSchema.nullable(),
  position: z.number().refine(Number.isInteger).nonnegative(),
  releaseId: uuidSchema.nullable().optional()
}).extend({ apply: z.boolean().optional() });

export const deleteCardRequestSchema = z.object({
  strategy: z.enum(["reassign-left", "reassign-right", "unassign"])
}).extend({ apply: z.boolean().optional() });

export const deleteCardsCommandSchema = z.object({
  storyMapId: uuidSchema,
  cards: z.array(z.object({ id: uuidSchema, baseVersion: baseVersionSchema }).strict()).min(1),
  affectedCards: z.array(z.object({ id: uuidSchema, baseVersion: baseVersionSchema }).strict()),
  strategy: deleteCardRequestSchema.shape.strategy,
  apply: z.boolean().optional()
}).strict();
export type DeleteCardsCommand = z.infer<typeof deleteCardsCommandSchema>;
export const deleteCardsResponseSchema = z.object({ ok: z.literal(true), cardIds: z.array(uuidSchema) });
export type DeleteCardsResponse = z.infer<typeof deleteCardsResponseSchema>;

export const parkCardRequestSchema = z.object({
  childStrategy: z.enum(["reassign-left", "reassign-right", "unassign"])
}).extend({ apply: z.boolean().optional() });

export const createReleaseRequestSchema = releaseSchema
  .pick({
    storyMapId: true,
    name: true,
    goal: true,
    position: true,
    startDate: true,
    releaseDate: true,
    released: true
  })
  .extend({
    goal: releaseSchema.shape.goal.removeDefault(),
    released: releaseSchema.shape.released.removeDefault()
  })
  .partial({
    goal: true,
    position: true,
    startDate: true,
    releaseDate: true,
    released: true
  }).extend({ apply: z.boolean().optional() });

export const updateReleaseRequestSchema = releaseSchema
  .pick({
    name: true,
    goal: true,
    position: true,
    startDate: true,
    releaseDate: true,
    released: true
  })
  .extend({
    goal: releaseSchema.shape.goal.removeDefault(),
    released: releaseSchema.shape.released.removeDefault()
  })
  .partial().extend({ apply: z.boolean().optional() });

export const customizationResponseSchema = z.object({
  usageCards: z.array(cardSchema),
  workflowStatuses: z.array(workflowStatusSchema),
  personas: z.array(personaSchema),
  cardPersonas: z.array(cardPersonaLinkSchema),
  annotations: z.array(annotationSchema),
  cardAnnotations: z.array(cardAnnotationLinkSchema),
  storyTemplates: z.array(storyTemplateSchema)
});

export const createWorkflowStatusRequestSchema = workflowStatusSchema
  .pick({
    projectId: true,
    storyMapId: true,
    name: true,
    group: true,
    position: true,
    color: true
  })
  .partial({
    storyMapId: true,
    position: true,
    color: true
  }).extend({ apply: z.boolean().optional() });

const customizationEvidence = customizationEvidenceSchemas({ card: cardSchema, workflowStatus: workflowStatusSchema, persona: personaSchema, annotation: annotationSchema });
export const affectedCustomizationCardsSchema = customizationEvidence.affectedCards;
export const workflowStatusEvidenceShape = customizationEvidence.statusEvidence;
export const deleteWorkflowStatusRequestSchema = customizationEvidence.statusDelete.extend({ apply: z.boolean().optional() });
export const deleteAnnotationRequestSchema = customizationEvidence.annotationDelete.extend({ apply: z.boolean().optional() });
export const deletePersonaCommandSchema = customizationEvidence.personaDelete.extend({ baseVersion: baseVersionSchema, apply: z.boolean().optional() });
export type DeleteWorkflowStatusRequest = z.infer<typeof deleteWorkflowStatusRequestSchema>;
export type DeleteAnnotationRequest = z.infer<typeof deleteAnnotationRequestSchema>;
export type DeletePersonaCommand = z.infer<typeof deletePersonaCommandSchema>;

export const updateWorkflowStatusRequestSchema = workflowStatusSchema
  .pick({
    name: true,
    group: true,
    position: true,
    color: true
  })
  .partial().extend({ ...workflowStatusEvidenceShape, apply: z.boolean().optional() });

export const createPersonaRequestSchema = personaSchema
  .pick({
    projectId: true,
    storyMapId: true,
    name: true,
    role: true,
    personaType: true,
    avatar: true,
    represents: true,
    age: true,
    country: true,
    fachexpertise: true,
    workLife: true,
    productExperience: true,
    expectations: true,
    description: true,
    centralNeed: true,
    successIndicators: true,
    scopeNote: true,
    goals: true,
    pains: true
  })
  .extend({
    personaType: personaSchema.shape.personaType.removeDefault(),
    avatar: personaSchema.shape.avatar.removeDefault(),
    represents: personaSchema.shape.represents.removeDefault(),
    age: personaSchema.shape.age.removeDefault(),
    country: personaSchema.shape.country.removeDefault(),
    fachexpertise: personaSchema.shape.fachexpertise.removeDefault(),
    workLife: personaSchema.shape.workLife.removeDefault(),
    productExperience: personaSchema.shape.productExperience.removeDefault(),
    expectations: personaSchema.shape.expectations.removeDefault(),
    description: personaSchema.shape.description.removeDefault(),
    centralNeed: personaSchema.shape.centralNeed.removeDefault(),
    successIndicators: personaSchema.shape.successIndicators.removeDefault(),
    scopeNote: personaSchema.shape.scopeNote.removeDefault(),
    goals: personaSchema.shape.goals.removeDefault(),
    pains: personaSchema.shape.pains.removeDefault()
  })
  .partial({
    storyMapId: true,
    role: true,
    personaType: true,
    avatar: true,
    represents: true,
    age: true,
    country: true,
    fachexpertise: true,
    workLife: true,
    productExperience: true,
    expectations: true,
    description: true,
    centralNeed: true,
    successIndicators: true,
    scopeNote: true,
    goals: true,
    pains: true
  }).extend({ apply: z.boolean().optional() });

export const updatePersonaRequestSchema = personaSchema
  .pick({
    name: true,
    role: true,
    personaType: true,
    avatar: true,
    represents: true,
    age: true,
    country: true,
    fachexpertise: true,
    workLife: true,
    productExperience: true,
    expectations: true,
    description: true,
    centralNeed: true,
    successIndicators: true,
    scopeNote: true,
    goals: true,
    pains: true
  })
  .extend({
    personaType: personaSchema.shape.personaType.removeDefault(),
    avatar: personaSchema.shape.avatar.removeDefault(),
    represents: personaSchema.shape.represents.removeDefault(),
    age: personaSchema.shape.age.removeDefault(),
    country: personaSchema.shape.country.removeDefault(),
    fachexpertise: personaSchema.shape.fachexpertise.removeDefault(),
    workLife: personaSchema.shape.workLife.removeDefault(),
    productExperience: personaSchema.shape.productExperience.removeDefault(),
    expectations: personaSchema.shape.expectations.removeDefault(),
    description: personaSchema.shape.description.removeDefault(),
    centralNeed: personaSchema.shape.centralNeed.removeDefault(),
    successIndicators: personaSchema.shape.successIndicators.removeDefault(),
    scopeNote: personaSchema.shape.scopeNote.removeDefault(),
    goals: personaSchema.shape.goals.removeDefault(),
    pains: personaSchema.shape.pains.removeDefault()
  })
  .partial().extend({ apply: z.boolean().optional() });

export const createAnnotationRequestSchema = annotationSchema
  .pick({
    projectId: true,
    storyMapId: true,
    name: true,
    icon: true,
    color: true,
    position: true
  })
  .extend({
    icon: annotationSchema.shape.icon.removeDefault(),
    color: annotationSchema.shape.color.removeDefault()
  })
  .partial({
    storyMapId: true,
    icon: true,
    color: true,
    position: true
  }).extend({ apply: z.boolean().optional() });

export const updateAnnotationRequestSchema = annotationSchema
  .pick({
    name: true,
    icon: true,
    color: true,
    position: true
  })
  .extend({
    icon: annotationSchema.shape.icon.removeDefault(),
    color: annotationSchema.shape.color.removeDefault()
  })
  .partial().extend({ apply: z.boolean().optional() });

export const createStoryTemplateRequestSchema = storyTemplateSchema
  .pick({
    projectId: true,
    storyMapId: true,
    name: true,
    descriptionTemplate: true,
    defaultStatus: true,
    defaultEstimate: true,
    position: true
  })
  .extend({
    descriptionTemplate: storyTemplateSchema.shape.descriptionTemplate.removeDefault(),
    defaultStatus: storyTemplateSchema.shape.defaultStatus.removeDefault()
  })
  .partial({
    storyMapId: true,
    descriptionTemplate: true,
    defaultStatus: true,
    defaultEstimate: true,
    position: true
  }).extend({ apply: z.boolean().optional() });

export const updateStoryTemplateRequestSchema = storyTemplateSchema
  .pick({
    name: true,
    descriptionTemplate: true,
    defaultStatus: true,
    defaultEstimate: true,
    position: true
  })
  .extend({
    descriptionTemplate: storyTemplateSchema.shape.descriptionTemplate.removeDefault(),
    defaultStatus: storyTemplateSchema.shape.defaultStatus.removeDefault()
  })
  .partial().extend({ apply: z.boolean().optional() });


export type CreateCardRequest = z.infer<typeof createCardRequestSchema>;
export type UpdateCardRequest = z.infer<typeof updateCardRequestSchema>;
export type CreateCardAttachmentRequest = z.infer<typeof createCardAttachmentRequestSchema>;
export type BulkUpdateCardsRequest = z.infer<typeof bulkUpdateCardsRequestSchema>;
export type MoveCardRequest = z.infer<typeof moveCardRequestSchema>;
export type DeleteCardRequest = z.infer<typeof deleteCardRequestSchema>;
export type ParkCardRequest = z.infer<typeof parkCardRequestSchema>;
export type CreateReleaseRequest = z.infer<typeof createReleaseRequestSchema>;
export type UpdateReleaseRequest = z.infer<typeof updateReleaseRequestSchema>;
export type CreateWorkflowStatusRequest = z.infer<typeof createWorkflowStatusRequestSchema>;
export type UpdateWorkflowStatusRequest = z.infer<typeof updateWorkflowStatusRequestSchema>;
export type CreatePersonaRequest = z.infer<typeof createPersonaRequestSchema>;
export type UpdatePersonaRequest = z.infer<typeof updatePersonaRequestSchema>;
export type CreateAnnotationRequest = z.infer<typeof createAnnotationRequestSchema>;
export type UpdateAnnotationRequest = z.infer<typeof updateAnnotationRequestSchema>;
export type CreateStoryTemplateRequest = z.infer<typeof createStoryTemplateRequestSchema>;
export type UpdateStoryTemplateRequest = z.infer<typeof updateStoryTemplateRequestSchema>;
