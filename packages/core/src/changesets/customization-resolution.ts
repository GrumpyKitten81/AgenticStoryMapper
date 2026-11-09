import { DomainError, annotationSchema, workflowStatusSchema, storyTemplateSchema, productContextSchema, type ChangeOperation } from "@storymapper/contracts";
import { allocatedId, bumpVersion, assertBaseline, mapOwner, referenceId, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { ownedCard, changedCard, finalizeCard, remainingReference, remainingTarget, scopedOwner } from "@storymapper/core/changesets/remaining-context";

import { assertCustomizationReview, workflowStatusImpact } from "@storymapper/core/changesets/customization-impact";

export function reviewCardVersions(context: ResolutionContext, cards: typeof context.state.cards): typeof cards {
  return cards.map((card) => ({ ...card, version: context.initialVersions.get(card.id) ?? card.version }));
}

type CustomOperation = Extract<ChangeOperation, { entity: "annotation" | "workflowStatus" | "storyTemplate" }>;

export function customizationGuard(context: ResolutionContext, action: () => void): void {
  try { action(); } catch (error) {
    if (error instanceof DomainError) refuse(context, error.message, "conflict");
    throw error;
  }
}

export function resolveCustomization(context: ResolutionContext): void {
  customizationGuard(context, () => resolveCustomizationRows(context));
}

function resolveCustomizationRows(context: ResolutionContext): void {
  const op = context.operation as CustomOperation;
  if (op.op === "create") return createCustomization(context, op);
  const id = remainingTarget(context, op.entity);
  const rows = op.entity === "annotation" ? context.state.annotations : op.entity === "workflowStatus" ? context.state.workflowStatuses : context.state.storyTemplates;
  const row = rows.find((entry) => entry.id === id)!;
  scopedOwner(context, row);
  if (op.entity === "workflowStatus") {
    const status = context.state.workflowStatuses.find((entry) => entry.id === id)!;
    const replacement = op.op === "delete" && op.after.replacementBefore ? context.state.workflowStatuses.find((entry) => entry.id === op.after.replacementBefore!.id) : undefined;
    if (op.op === "delete" && op.after.replacementBefore && !replacement) refuse(context, "Replacement status changed or was removed.", "conflict");
    const nextName = op.op === "update" ? op.after.name : replacement?.name;
    if (op.op === "delete" || nextName !== undefined && nextName !== status.name || op.after.definitionBefore !== undefined || op.after.affectedCards !== undefined) {
      const affected = workflowStatusImpact(context.state, status, op.op === "update" ? nextName : undefined, replacement);
      if (op.op === "delete" && affected.length && !replacement) refuse(context, "Workflow status is still used by Cards.", "conflict");
      assertCustomizationReview(status, reviewCardVersions(context, affected), op.after);
      if (replacement && op.op === "delete") assertCustomizationReview(replacement, [], { definitionBefore: op.after.replacementBefore, affectedCards: [] });
      if (nextName !== undefined && nextName !== status.name) for (const card of affected) { card.status = nextName; card.updatedAt = context.supply.createdAt; bumpVersion(context, card); }
    }
    if (op.op === "update") { const { definitionBefore, affectedCards, ...patch } = op.after; Object.assign(status, patch); return; }
  }
  if (op.op === "update") { Object.assign(row, op.after); return; }
  if (op.entity === "annotation") {
    if (context.state.removedMapCustomizationReferences?.annotations.includes(id)) refuse(context, "Customization is linked to Cards in a removed Story Map; restore the map before unlinking.", "conflict");
    const affected = context.state.cardAnnotations.filter((link) => link.annotationId === id).map((link) => link.cardId);
    assertCustomizationReview(row, reviewCardVersions(context, context.state.cards.filter((card) => affected.includes(card.id))), op.after, true);
    affected.forEach((cardId) => bumpVersion(context, ownedCard(context, cardId)));
    context.state.cardAnnotations = context.state.cardAnnotations.filter((link) => link.annotationId !== id);
  }
  if (op.entity === "annotation") context.state.annotations = context.state.annotations.filter((entry) => entry.id !== id);
  if (op.entity === "workflowStatus") context.state.workflowStatuses = context.state.workflowStatuses.filter((entry) => entry.id !== id);
  if (op.entity === "storyTemplate") context.state.storyTemplates = context.state.storyTemplates.filter((entry) => entry.id !== id);
}

function createCustomization(context: ResolutionContext, op: Extract<CustomOperation, { op: "create" }>): void {
  const after = op.after;
  const storyMapId = after.storyMapId ? referenceId(context, "storyMap", after.storyMapId) : null;
  scopedOwner(context, { projectId: after.projectId, storyMapId });
  const rows = op.entity === "annotation" ? context.state.annotations : op.entity === "workflowStatus" ? context.state.workflowStatuses : context.state.storyTemplates;
  const position = after.position ?? rows.filter((row) => row.projectId === after.projectId && (row.storyMapId === null || row.storyMapId === storyMapId)).length;
  const value = { ...after, id: allocatedId(context), storyMapId, position };
  if (op.entity === "annotation") context.state.annotations.push(annotationSchema.parse(value));
  if (op.entity === "workflowStatus") { const status = workflowStatusSchema.parse(value); workflowStatusImpact({ ...context.state, workflowStatuses: [...context.state.workflowStatuses, status] }, status); context.state.workflowStatuses.push(status); }
  if (op.entity === "storyTemplate") context.state.storyTemplates.push(storyTemplateSchema.parse({ ...value, defaultEstimate: op.after.defaultEstimate ?? null }));
}

export function setProductContext(context: ResolutionContext): void {
  const op = context.operation as Extract<ChangeOperation, { entity: "productContext" }>;
  const after = op.after;
  const storyMapId = after.storyMapId ? referenceId(context, "storyMap", after.storyMapId) : null;
  scopedOwner(context, { projectId: after.projectId, storyMapId });
  const previous = context.state.productContexts.find((row) => row.projectId === after.projectId && row.storyMapId === storyMapId);
  if (storyMapId) { mapOwner(context, storyMapId); const map = context.state.storyMaps.find((row) => row.id === storyMapId)!; assertBaseline(context, map.version, map.id); bumpVersion(context, map); }
  if (previous) { Object.assign(previous, after, { storyMapId, updatedAt: context.supply.createdAt }); return; }
  context.state.productContexts.push(productContextSchema.parse({ ...after, id: allocatedId(context), storyMapId, updatedAt: context.supply.createdAt }));
}

export function resolveRelationship(context: ResolutionContext): void {
  const op = context.operation as Extract<ChangeOperation, { entity: "cardPersona" | "cardAnnotation" }>;
  const card = changedCard(context, op.after.cardId);
  if (op.entity === "cardPersona") {
    const personaId = remainingReference(context, "persona", op.after.personaId);
    const persona = context.state.personas.find((row) => row.id === personaId)!;
    scopedOwner(context, persona);
    if (persona.storyMapId && persona.storyMapId !== card.storyMapId) refuse(context, "Persona belongs to another Story Map.");
    const existing = context.state.cardPersonas.find((row) => row.cardId === card.id && row.personaId === personaId);
    if (op.op === "set" && !existing) context.state.cardPersonas.push({ id: allocatedId(context), cardId: card.id, personaId, createdAt: context.supply.createdAt });
    else if (op.op === "unset" && existing) context.state.cardPersonas = context.state.cardPersonas.filter((row) => row.id !== existing.id);
    else return;
  } else {
    const annotationId = remainingReference(context, "annotation", op.after.annotationId);
    const annotation = context.state.annotations.find((row) => row.id === annotationId)!;
    scopedOwner(context, annotation);
    if (annotation.storyMapId && annotation.storyMapId !== card.storyMapId) refuse(context, "Annotation belongs to another Story Map.");
    const existing = context.state.cardAnnotations.find((row) => row.cardId === card.id && row.annotationId === annotationId);
    if (op.op === "set" && !existing) context.state.cardAnnotations.push({ id: allocatedId(context), cardId: card.id, annotationId, createdAt: context.supply.createdAt });
    else if (op.op === "unset" && existing) context.state.cardAnnotations = context.state.cardAnnotations.filter((row) => row.id !== existing.id);
    else return;
  }
  bumpVersion(context, card);
}
