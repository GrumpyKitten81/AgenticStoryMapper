import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { DomainError } from "@storymapper/contracts";
import type { CustomizationResponse, DeleteWorkflowStatusRequest, DeleteAnnotationRequest, DeletePersonaCommand, Annotation, CardAnnotationLink, CardPersonaLink, CreateAnnotationRequest, CreatePersonaRequest, CreateStoryTemplateRequest, CreateWorkflowStatusRequest, Persona, StoryTemplate, UpdateAnnotationRequest, UpdatePersonaRequest, UpdateStoryTemplateRequest, UpdateWorkflowStatusRequest, WorkflowStatus } from "@storymapper/contracts";
import { annotations, cardAnnotations, cardPersonas, cards, personas, storyMaps, storyTemplates, workflowStatuses } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { toCard, toWorkflowStatus, toPersona, toCardPersonaLink, toAnnotation, toCardAnnotationLink, toStoryTemplate } from "@storymapper/db/repositories/row-mappers";
import { assertCustomizationReview, workflowStatusImpact } from "@storymapper/core";
import { compact } from "@storymapper/db/repositories/repository-values";

export function getCustomization(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): CustomizationResponse {
  if (!this.listProjects().some((project) => project.id === projectId)) throw new DomainError("not_found", "Project not found.");
  const maps = this.listStoryMaps(projectId);
  if (storyMapId && !this.db.select().from(storyMaps).where(and(eq(storyMaps.id, storyMapId), eq(storyMaps.projectId, projectId))).get()) throw new DomainError("validation", "Story Map does not belong to this Project.");
  return { workflowStatuses: this.listWorkflowStatuses(projectId, storyMapId), personas: this.listPersonas(projectId, storyMapId), annotations: this.listAnnotations(projectId, storyMapId), storyTemplates: this.listStoryTemplates(projectId, storyMapId), usageCards: maps.flatMap((map) => this.listCards(map.id)), cardPersonas: maps.flatMap((map) => this.listCardPersonasForStoryMap(map.id)), cardAnnotations: maps.flatMap((map) => this.listCardAnnotationsForStoryMap(map.id)) };
}

function statusState(repository: StoryMapperRepository<"transaction">, projectId: string) {
  const storyMaps = repository.listStoryMaps(projectId);
  return { remoteWorkItemLinks: storyMaps.flatMap((map) => repository.listRemoteWorkItemLinksForStoryMap(map.id)), storyMaps, cards: storyMaps.flatMap((map) => repository.listCards(map.id)), workflowStatuses: repository.db.select().from(workflowStatuses).where(eq(workflowStatuses.projectId, projectId)).all().map(toWorkflowStatus) };
}

function reviewCardVersions(repository: StoryMapperRepository<"transaction">, affected: ReturnType<typeof repository.listCards>) {
  return affected.map((card) => ({ ...card, version: card.version - (repository.context.transaction?.bumpedRoots.has(`cards:${card.id}`) ? 1 : 0) }));
}

function assertScope(repository: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string | null): void {
  if (!repository.listProjects().some((project) => project.id === projectId)) throw new DomainError("not_found", "Project not found.");
  if (storyMapId && repository.getStoryMapOrThrow(storyMapId).projectId !== projectId) throw new DomainError("validation", "Story Map does not belong to this Project.");
}

export function listWorkflowStatuses(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): WorkflowStatus[] {
    this.context.database;
    return this.db
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.projectId, projectId))
      .orderBy(asc(workflowStatuses.position))
      .all()
      .map(toWorkflowStatus)
      .filter((status) => status.storyMapId === null || status.storyMapId === (storyMapId ?? null));
  }

export function createWorkflowStatus(this: StoryMapperRepository<"transaction">, input: CreateWorkflowStatusRequest): WorkflowStatus {
    this.assertWritable();
    assertScope(this, input.projectId, input.storyMapId);
    const status: WorkflowStatus = {
      id: randomUUID(),
      projectId: input.projectId,
      storyMapId: input.storyMapId ?? null,
      name: input.name,
      group: input.group,
      position: input.position ?? this.nextWorkflowStatusPosition(input.projectId, input.storyMapId ?? null)
    };
    if (input.color !== undefined) status.color = input.color;

    const state = statusState(this, input.projectId);
    workflowStatusImpact({ ...state, workflowStatuses: [...state.workflowStatuses, status] }, status);
    this.db.insert(workflowStatuses).values(status).run();
    this.logActivity(input.projectId, "workflowStatus.created", "workflowStatus", status.id, undefined, status);
    return status;
  }

export function updateWorkflowStatus(this: StoryMapperRepository<"transaction">, statusId: string, input: UpdateWorkflowStatusRequest): WorkflowStatus | undefined {
    this.assertWritable();
    const before = this.getWorkflowStatus(statusId);
    if (!before) return undefined;
    const { definitionBefore, affectedCards, apply, ...patch } = input;
    const renamed = input.name !== undefined && input.name !== before.name;
    if (renamed || definitionBefore !== undefined || affectedCards !== undefined) {
      const affected = workflowStatusImpact(statusState(this, before.projectId), before, input.name);
      assertCustomizationReview(before, reviewCardVersions(this, affected), { definitionBefore, affectedCards });
      if (renamed) for (const card of affected) this.updateCard(card.id, { status: input.name! });
    }
    this.db.update(workflowStatuses).set(compact(patch)).where(eq(workflowStatuses.id, statusId)).run();
    const after = this.getWorkflowStatus(statusId);
    if (!after) return undefined;
    this.logActivity(after.projectId, "workflowStatus.updated", "workflowStatus", statusId, before, after);
    return after;
  }

export function deleteWorkflowStatus(this: StoryMapperRepository<"transaction">, statusId: string, input: DeleteWorkflowStatusRequest = {}): boolean {
    this.assertWritable();
    const before = this.getWorkflowStatus(statusId);
    if (!before) return false;
    const state = statusState(this, before.projectId);
    const replacement = input.replacementBefore ? this.getWorkflowStatus(input.replacementBefore.id) : undefined;
    if (input.replacementBefore && !replacement) throw new DomainError("conflict", "Replacement status changed or was removed.");
    const affected = workflowStatusImpact(state, before, undefined, replacement);
    if (affected.length && !replacement) throw new DomainError("conflict", "Workflow status is still used; choose a replacement.");
    assertCustomizationReview(before, reviewCardVersions(this, affected), input);
    if (replacement) assertCustomizationReview(replacement, [], { definitionBefore: input.replacementBefore, affectedCards: [] });
    for (const card of affected) this.updateCard(card.id, { status: replacement!.name });
    this.db.delete(workflowStatuses).where(eq(workflowStatuses.id, statusId)).run();
    this.logActivity(before.projectId, "workflowStatus.deleted", "workflowStatus", statusId, before, undefined);
    return true;
  }

export function listPersonas(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): Persona[] {
    this.context.database;
    return this.db
      .select()
      .from(personas)
      .where(eq(personas.projectId, projectId))
      .orderBy(asc(personas.name))
      .all()
      .map(toPersona)
      .filter((persona) => persona.storyMapId === null || persona.storyMapId === (storyMapId ?? null));
  }

export function listPersonasForProject(this: StoryMapperRepository<"transaction">, projectId: string): Persona[] {
    this.context.database;
    return this.db
      .select()
      .from(personas)
      .where(eq(personas.projectId, projectId))
      .orderBy(asc(personas.name))
      .all()
      .map(toPersona);
  }

export function createPersona(this: StoryMapperRepository<"transaction">, input: CreatePersonaRequest): Persona {
    this.assertWritable();
    assertScope(this, input.projectId, input.storyMapId);
    const persona: Persona = {
      version: 1,
      id: randomUUID(),
      projectId: input.projectId,
      storyMapId: input.storyMapId ?? null,
      name: input.name,
      role: input.role ?? "User",
      personaType: input.personaType ?? "",
      avatar: input.avatar ?? "",
      represents: input.represents ?? "",
      age: input.age ?? "",
      country: input.country ?? "",
      fachexpertise: input.fachexpertise ?? "",
      workLife: input.workLife ?? "",
      productExperience: input.productExperience ?? "",
      expectations: input.expectations ?? "",
      description: input.description ?? "",
      centralNeed: input.centralNeed ?? "",
      successIndicators: input.successIndicators ?? "",
      scopeNote: input.scopeNote ?? "",
      goals: input.goals ?? [],
      pains: input.pains ?? []
    };
    insertPersona(this, persona);
    this.createRootVersion("personas", persona.id);
    this.logActivity(persona.projectId, "persona.created", "persona", persona.id, undefined, persona);
    return persona;
  }

export function updatePersona(this: StoryMapperRepository<"transaction">, personaId: string, input: UpdatePersonaRequest): Persona | undefined {
    this.assertWritable();
    const before = this.getPersona(personaId);
    if (!before) return undefined;
    this.db.update(personas).set(compact({
      name: input.name,
      role: input.role,
      personaType: input.personaType,
      avatar: input.avatar,
      represents: input.represents,
      age: input.age,
      country: input.country,
      fachexpertise: input.fachexpertise,
      workLife: input.workLife,
      productExperience: input.productExperience,
      expectations: input.expectations,
      description: input.description,
      centralNeed: input.centralNeed,
      successIndicators: input.successIndicators,
      scopeNote: input.scopeNote,
      goalsSchemaVersion: 1, goalsJson: input.goals === undefined ? undefined : JSON.stringify(input.goals),
      painsSchemaVersion: 1, painsJson: input.pains === undefined ? undefined : JSON.stringify(input.pains)
    })).where(eq(personas.id, personaId)).run();
    this.bumpRootVersion("personas", personaId);
    const after = this.getPersona(personaId);
    if (!after) return undefined;
    this.logActivity(after.projectId, "persona.updated", "persona", personaId, before, after);
    return after;
  }

export function deletePersona(this: StoryMapperRepository<"transaction">, personaId: string, input: Omit<DeletePersonaCommand, "baseVersion"> & { baseVersion?: number } = {}): boolean {
    this.assertWritable();
    const before = this.getPersona(personaId);
    if (!before) return false;
    if (input.baseVersion !== undefined && input.baseVersion !== before.version - (this.context.transaction!.bumpedRoots.has(`personas:${personaId}`) ? 1 : 0)) throw new DomainError("conflict", "Persona version changed; review its current usage again.");
    const links = this.db.select().from(cardPersonas).where(eq(cardPersonas.personaId, personaId)).all();
    if (links.some((link) => !this.getCard(link.cardId))) throw new DomainError("conflict", "Customization is linked to Cards in a removed Story Map; restore the map before unlinking.");
    const affected = links.map((link) => this.getCard(link.cardId)).filter((card) => card !== undefined);
    assertCustomizationReview(before, reviewCardVersions(this, affected), input, true);
    this.db.delete(cardPersonas).where(eq(cardPersonas.personaId, personaId)).run();
    for (const cardId of new Set(links.map((link) => link.cardId))) {
      const card = toCard(this.db.select().from(cards).where(eq(cards.id, cardId)).get()!);
      this.writeCardVersion(card);
      this.logActivity(before.projectId, "card.updated", "card", card.id, undefined, card);
    }
    this.bumpRootVersion("personas", personaId);
    this.deleteExternalRefsForEntity("persona", personaId);
    this.db.delete(personas).where(eq(personas.id, personaId)).run();
    this.logActivity(before.projectId, "persona.deleted", "persona", personaId, before, undefined);
    return true;
  }

export function listCardPersonasForStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): CardPersonaLink[] {
    this.context.database;
    const cardIds = new Set(this.listCards(storyMapId).map((card) => card.id));
    return this.db.select().from(cardPersonas).all().map(toCardPersonaLink).filter((link) => cardIds.has(link.cardId));
  }

export function setCardPersona(this: StoryMapperRepository<"transaction">, cardId: string, personaId: string): CardPersonaLink {
    this.assertWritable();
    const card = this.getCard(cardId);
    const persona = this.getPersona(personaId);
    if (!card || !persona) throw new DomainError("not_found", "Card or persona not found.");
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    if (persona.projectId !== storyMap.projectId || (persona.storyMapId !== null && persona.storyMapId !== card.storyMapId)) {
      throw new DomainError("validation", "Persona belongs to another project or story map.");
    }
    const existing = this.db
      .select()
      .from(cardPersonas)
      .where(and(eq(cardPersonas.cardId, cardId), eq(cardPersonas.personaId, personaId)))
      .get();
    if (existing) return toCardPersonaLink(existing);
    const link: CardPersonaLink = { id: randomUUID(), cardId, personaId, createdAt: new Date().toISOString() };
    this.db.insert(cardPersonas).values(link).run();
    this.writeCardVersion(card);
    this.logActivity(storyMap.projectId, "cardPersona.created", "cardPersona", link.id, undefined, link);
    return link;
  }

export function deleteCardPersona(this: StoryMapperRepository<"transaction">, cardId: string, personaId: string): boolean {
    this.assertWritable();
    const card = this.getCard(cardId);
    const existing = this.db.select().from(cardPersonas).where(and(eq(cardPersonas.cardId, cardId), eq(cardPersonas.personaId, personaId))).get();
    if (!card || !existing) return false;
    this.db.delete(cardPersonas).where(eq(cardPersonas.id, existing.id)).run();
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    this.writeCardVersion(card);
    this.logActivity(storyMap.projectId, "cardPersona.deleted", "cardPersona", existing.id, toCardPersonaLink(existing), undefined);
    return true;
  }

export function listAnnotations(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): Annotation[] {
    this.context.database;
    return this.db
      .select()
      .from(annotations)
      .where(eq(annotations.projectId, projectId))
      .orderBy(asc(annotations.position))
      .all()
      .map(toAnnotation)
      .filter((annotation) => annotation.storyMapId === null || annotation.storyMapId === (storyMapId ?? null));
  }

export function createAnnotation(this: StoryMapperRepository<"transaction">, input: CreateAnnotationRequest): Annotation {
    this.assertWritable();
    assertScope(this, input.projectId, input.storyMapId);
    const annotation: Annotation = {
      id: randomUUID(),
      projectId: input.projectId,
      storyMapId: input.storyMapId ?? null,
      name: input.name,
      icon: input.icon ?? "tag",
      color: input.color ?? "#eef2ff",
      position: input.position ?? this.nextAnnotationPosition(input.projectId, input.storyMapId ?? null)
    };
    this.db.insert(annotations).values(annotation).run();
    this.logActivity(annotation.projectId, "annotation.created", "annotation", annotation.id, undefined, annotation);
    return annotation;
  }

export function updateAnnotation(this: StoryMapperRepository<"transaction">, annotationId: string, input: UpdateAnnotationRequest): Annotation | undefined {
    this.assertWritable();
    const before = this.getAnnotation(annotationId);
    if (!before) return undefined;
    this.db.update(annotations).set(compact(input)).where(eq(annotations.id, annotationId)).run();
    const after = this.getAnnotation(annotationId);
    if (!after) return undefined;
    this.logActivity(after.projectId, "annotation.updated", "annotation", annotationId, before, after);
    return after;
  }

export function deleteAnnotation(this: StoryMapperRepository<"transaction">, annotationId: string, input: DeleteAnnotationRequest = {}): boolean {
    this.assertWritable();
    const before = this.getAnnotation(annotationId);
    if (!before) return false;
    const links = this.db.select().from(cardAnnotations).where(eq(cardAnnotations.annotationId, annotationId)).all();
    if (links.some((link) => !this.getCard(link.cardId))) throw new DomainError("conflict", "Customization is linked to Cards in a removed Story Map; restore the map before unlinking.");
    const affected = links.map((link) => this.getCard(link.cardId)).filter((card) => card !== undefined);
    assertCustomizationReview(before, reviewCardVersions(this, affected), input, true);
    this.db.delete(cardAnnotations).where(eq(cardAnnotations.annotationId, annotationId)).run();
    for (const cardId of new Set(links.map((link) => link.cardId))) {
      const card = toCard(this.db.select().from(cards).where(eq(cards.id, cardId)).get()!);
      this.writeCardVersion(card);
      this.logActivity(before.projectId, "card.updated", "card", card.id, undefined, card);
    }
    this.db.delete(annotations).where(eq(annotations.id, annotationId)).run();
    this.logActivity(before.projectId, "annotation.deleted", "annotation", annotationId, before, undefined);
    return true;
  }

export function listCardAnnotationsForStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): CardAnnotationLink[] {
    this.context.database;
    const cardIds = new Set(this.listCards(storyMapId).map((card) => card.id));
    return this.db.select().from(cardAnnotations).all().map(toCardAnnotationLink).filter((link) => cardIds.has(link.cardId));
  }

export function setCardAnnotation(this: StoryMapperRepository<"transaction">, cardId: string, annotationId: string): CardAnnotationLink {
    this.assertWritable();
    const card = this.getCard(cardId);
    const annotation = this.getAnnotation(annotationId);
    if (!card || !annotation) throw new DomainError("not_found", "Card or annotation not found.");
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    if (annotation.projectId !== storyMap.projectId || (annotation.storyMapId !== null && annotation.storyMapId !== card.storyMapId)) {
      throw new DomainError("validation", "Annotation belongs to another project or story map.");
    }
    const existing = this.db
      .select()
      .from(cardAnnotations)
      .where(and(eq(cardAnnotations.cardId, cardId), eq(cardAnnotations.annotationId, annotationId)))
      .get();
    if (existing) return toCardAnnotationLink(existing);
    const link: CardAnnotationLink = { id: randomUUID(), cardId, annotationId, createdAt: new Date().toISOString() };
    this.db.insert(cardAnnotations).values(link).run();
    this.writeCardVersion(card);
    this.logActivity(storyMap.projectId, "cardAnnotation.created", "cardAnnotation", link.id, undefined, link);
    return link;
  }

export function deleteCardAnnotation(this: StoryMapperRepository<"transaction">, cardId: string, annotationId: string): boolean {
    this.assertWritable();
    const card = this.getCard(cardId);
    const existing = this.db.select().from(cardAnnotations).where(and(eq(cardAnnotations.cardId, cardId), eq(cardAnnotations.annotationId, annotationId))).get();
    if (!card || !existing) return false;
    this.db.delete(cardAnnotations).where(eq(cardAnnotations.id, existing.id)).run();
    const storyMap = this.getStoryMapOrThrow(card.storyMapId);
    this.writeCardVersion(card);
    this.logActivity(storyMap.projectId, "cardAnnotation.deleted", "cardAnnotation", existing.id, toCardAnnotationLink(existing), undefined);
    return true;
  }

export function listStoryTemplates(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): StoryTemplate[] {
    this.context.database;
    return this.db
      .select()
      .from(storyTemplates)
      .where(eq(storyTemplates.projectId, projectId))
      .orderBy(asc(storyTemplates.position))
      .all()
      .map(toStoryTemplate)
      .filter((template) => template.storyMapId === null || template.storyMapId === (storyMapId ?? null));
  }

export function createStoryTemplate(this: StoryMapperRepository<"transaction">, input: CreateStoryTemplateRequest): StoryTemplate {
    this.assertWritable();
    assertScope(this, input.projectId, input.storyMapId);
    const template: StoryTemplate = {
      id: randomUUID(),
      projectId: input.projectId,
      storyMapId: input.storyMapId ?? null,
      name: input.name,
      descriptionTemplate: input.descriptionTemplate ?? "",
      defaultStatus: input.defaultStatus ?? "todo",
      defaultEstimate: input.defaultEstimate ?? null,
      position: input.position ?? this.nextStoryTemplatePosition(input.projectId, input.storyMapId ?? null)
    };
    this.db.insert(storyTemplates).values(template).run();
    this.logActivity(template.projectId, "storyTemplate.created", "storyTemplate", template.id, undefined, template);
    return template;
  }

export function updateStoryTemplate(this: StoryMapperRepository<"transaction">, templateId: string, input: UpdateStoryTemplateRequest): StoryTemplate | undefined {
    this.assertWritable();
    const before = this.getStoryTemplate(templateId);
    if (!before) return undefined;
    this.db.update(storyTemplates).set(compact(input)).where(eq(storyTemplates.id, templateId)).run();
    const after = this.getStoryTemplate(templateId);
    if (!after) return undefined;
    this.logActivity(after.projectId, "storyTemplate.updated", "storyTemplate", templateId, before, after);
    return after;
  }

export function deleteStoryTemplate(this: StoryMapperRepository<"transaction">, templateId: string): boolean {
    this.assertWritable();
    const before = this.getStoryTemplate(templateId);
    if (!before) return false;
    this.db.delete(storyTemplates).where(eq(storyTemplates.id, templateId)).run();
    this.logActivity(before.projectId, "storyTemplate.deleted", "storyTemplate", templateId, before, undefined);
    return true;
  }

export function ensureDefaultWorkflowStatuses(this: StoryMapperRepository<"transaction">, projectId: string): void {
    this.assertWritable();
    const existing = this.db.select().from(workflowStatuses).where(eq(workflowStatuses.projectId, projectId)).all();
    if (existing.length > 0) return;
    const defaults: WorkflowStatus[] = [
      { id: randomUUID(), projectId, storyMapId: null, name: "todo", group: "todo", position: 0, color: "#eef2ff" },
      { id: randomUUID(), projectId, storyMapId: null, name: "active", group: "active", position: 1, color: "#fff7ed" },
      { id: randomUUID(), projectId, storyMapId: null, name: "done", group: "done", position: 2, color: "#ecfdf5" },
      { id: randomUUID(), projectId, storyMapId: null, name: "archived", group: "done", position: 3, color: "#f8fafc" }
    ];
    this.db.insert(workflowStatuses).values(defaults).run();
    this.context.transaction!.hasBusinessActivity = true;
    for (const status of defaults) this.context.transaction!.liveEntities.set(`workflowStatus:${status.id}`, { entityType: "workflowStatus", entityId: status.id, projectId, version: null });
  }

export function getWorkflowStatus(this: StoryMapperRepository<"transaction">, statusId: string): WorkflowStatus | undefined {
    this.context.database;
    const row = this.db.select().from(workflowStatuses).where(eq(workflowStatuses.id, statusId)).get();
    return row ? toWorkflowStatus(row) : undefined;
  }

export function getPersona(this: StoryMapperRepository<"transaction">, personaId: string): Persona | undefined {
    this.context.database;
    const row = this.db.select().from(personas).where(eq(personas.id, personaId)).get();
    return row ? toPersona(row) : undefined;
  }

export function getAnnotation(this: StoryMapperRepository<"transaction">, annotationId: string): Annotation | undefined {
    this.context.database;
    const row = this.db.select().from(annotations).where(eq(annotations.id, annotationId)).get();
    return row && (!row.storyMapId || this.isStoryMapVisible(row.storyMapId)) ? toAnnotation(row) : undefined;
  }

export function getStoryTemplate(this: StoryMapperRepository<"transaction">, templateId: string): StoryTemplate | undefined {
    this.context.database;
    const row = this.db.select().from(storyTemplates).where(eq(storyTemplates.id, templateId)).get();
    return row && (!row.storyMapId || this.isStoryMapVisible(row.storyMapId)) ? toStoryTemplate(row) : undefined;
  }

export function nextWorkflowStatusPosition(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId: string | null): number {
    this.context.database;
    return this.listWorkflowStatuses(projectId, storyMapId ?? undefined).length;
  }

export function nextAnnotationPosition(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId: string | null): number {
    this.context.database;
    return this.listAnnotations(projectId, storyMapId ?? undefined).length;
  }

export function nextStoryTemplatePosition(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId: string | null): number {
    this.context.database;
    return this.listStoryTemplates(projectId, storyMapId ?? undefined).length;
  }

function insertPersona(repository: StoryMapperRepository<"transaction">, persona: Persona): void {
    repository.db.insert(personas).values({
      id: persona.id,
      projectId: persona.projectId,
      storyMapId: persona.storyMapId,
      name: persona.name,
      role: persona.role,
      personaType: persona.personaType,
      avatar: persona.avatar,
      represents: persona.represents,
      age: persona.age,
      country: persona.country,
      fachexpertise: persona.fachexpertise,
      workLife: persona.workLife,
      productExperience: persona.productExperience,
      expectations: persona.expectations,
      description: persona.description,
      centralNeed: persona.centralNeed,
      successIndicators: persona.successIndicators,
      scopeNote: persona.scopeNote,
      goalsSchemaVersion: 1, goalsJson: JSON.stringify(persona.goals),
      painsSchemaVersion: 1, painsJson: JSON.stringify(persona.pains)
    }).run();
}
