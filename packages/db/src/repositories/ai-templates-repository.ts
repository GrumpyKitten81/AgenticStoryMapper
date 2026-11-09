import { parseStoredJson } from "@storymapper/db/versioned-json";
import { and, asc, eq } from "drizzle-orm";
import { aiFunctionTemplateSchema, DomainError, type AiFunctionTemplate, type CreateAiTemplateRequest, type UpdateAiTemplateRequest } from "@storymapper/contracts";
import { defaultAiFunctionTemplates } from "@storymapper/core";
import { aiFunctionTemplates, projects } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

type Repository = StoryMapperRepository<"transaction">;

function requireProject(repository: Repository, projectId: string): void {
  const project = repository.db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.historicalStub, false))).get();
  if (!project) throw new DomainError("not_found", "Project not found.");
}

function templateValues(template: AiFunctionTemplate): typeof aiFunctionTemplates.$inferInsert {
  const { arguments: arguments_, examples, outputSchemaName, ...values } = template;
  return { ...values, argumentsSchemaVersion: 1, argumentsJson: JSON.stringify(arguments_), examplesSchemaVersion: 1, examplesJson: JSON.stringify(examples), outputSchemaName: outputSchemaName ?? null };
}

function fromRow(row: typeof aiFunctionTemplates.$inferSelect): AiFunctionTemplate {
  return aiFunctionTemplateSchema.parse({ projectId: row.projectId, id: row.id, name: row.name, instructions: row.instructions,
    arguments: parseStoredJson("ai_function_templates", "arguments_json", row.argumentsJson, row.argumentsSchemaVersion), examples: parseStoredJson("ai_function_templates", "examples_json", row.examplesJson, row.examplesSchemaVersion), ...(row.outputSchemaName === null ? {} : { outputSchemaName: row.outputSchemaName }) });
}

export function seedAiTemplates(this: Repository, projectId: string): void {
  this.assertWritable();
  this.db.insert(aiFunctionTemplates).values(defaultAiFunctionTemplates.map((template) => templateValues(aiFunctionTemplateSchema.parse({ ...template, projectId })))).run();
}

export function listAiTemplates(this: Repository, projectId: string): AiFunctionTemplate[] {
  requireProject(this, projectId);
  return this.db.select().from(aiFunctionTemplates).where(eq(aiFunctionTemplates.projectId, projectId)).orderBy(asc(aiFunctionTemplates.name), asc(aiFunctionTemplates.id)).all().map(fromRow);
}

export function getAiTemplate(this: Repository, projectId: string, templateId: string): AiFunctionTemplate | undefined {
  requireProject(this, projectId);
  const row = this.db.select().from(aiFunctionTemplates).where(and(eq(aiFunctionTemplates.projectId, projectId), eq(aiFunctionTemplates.id, templateId))).get();
  return row ? fromRow(row) : undefined;
}

export function createAiTemplate(this: Repository, input: CreateAiTemplateRequest): AiFunctionTemplate {
  this.assertWritable();
  requireProject(this, input.projectId);
  const template = aiFunctionTemplateSchema.parse(input);
  if (this.getAiTemplate(template.projectId, template.id)) throw new DomainError("conflict", "Template ID is already used in this Project.");
  this.db.insert(aiFunctionTemplates).values(templateValues(template)).run();
  this.logActivity(template.projectId, "aiTemplate.created", "aiTemplate", `${template.projectId}:${template.id}`, undefined, { projectId: template.projectId, id: template.id, name: template.name });
  return template;
}

export function updateAiTemplate(this: Repository, projectId: string, templateId: string, input: UpdateAiTemplateRequest): AiFunctionTemplate {
  this.assertWritable();
  const before = this.getAiTemplate(projectId, templateId);
  if (!before) throw new DomainError("not_found", "AI template not found in this Project.");
  const after = aiFunctionTemplateSchema.parse({ ...before, ...input, ...(input.outputSchemaName === null ? { outputSchemaName: undefined } : {}) });
  this.db.update(aiFunctionTemplates).set(templateValues(after)).where(and(eq(aiFunctionTemplates.projectId, projectId), eq(aiFunctionTemplates.id, templateId))).run();
  this.logActivity(projectId, "aiTemplate.updated", "aiTemplate", `${projectId}:${templateId}`, { projectId, id: before.id, name: before.name }, { projectId, id: after.id, name: after.name });
  return after;
}

export function deleteAiTemplate(this: Repository, projectId: string, templateId: string): boolean {
  this.assertWritable();
  const before = this.getAiTemplate(projectId, templateId);
  if (!before) throw new DomainError("not_found", "AI template not found in this Project.");
  this.db.delete(aiFunctionTemplates).where(and(eq(aiFunctionTemplates.projectId, projectId), eq(aiFunctionTemplates.id, templateId))).run();
  this.logActivity(projectId, "aiTemplate.deleted", "aiTemplate", `${projectId}:${templateId}`, { projectId, id: before.id, name: before.name }, undefined);
  return true;
}
