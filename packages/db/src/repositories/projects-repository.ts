import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { DomainError, githubStatusSourceKey } from "@storymapper/contracts";
import type { ActorContext, CardAttachment, CreateProjectRequest, CreateStoryMapRequest, GettingStartedChecklist, StoryMapTemplate, ProductContext, SafetySettings, Project, StoryMap, StoryMapSnapshot, UpsertProductContextRequest, UpdateSafetySettingsRequest, UpdateStoryMapRequest } from "@storymapper/contracts";
import { agentAccessEnabled, agentProtected, createStoryMapFromTemplate as planStoryMapTemplate } from "@storymapper/core";
import { cardAttachments, databaseMetadata, productContexts, projectSettings, projects, storyMaps } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { toProject, toStoryMap, toProductContext, toSafetySettings, toCardAttachment } from "@storymapper/db/repositories/row-mappers";

export function assertAgentWriteSafety(repository: StoryMapperRepository<"transaction">, projectId: string): void {
  const actor: ActorContext = repository.actor;
  if (actor.actorType !== "agent") return;
  const settings = getSafetySettings.call(repository, projectId);
  if (!agentAccessEnabled(settings)) throw new DomainError("disabled", "Agent access is disabled for this project.");
  if (agentProtected(settings)) throw new DomainError("protected", "Agent protection is enabled for this project.");
}
import { compact, slugify } from "@storymapper/db/repositories/repository-values";

export function ensureSeedData(this: StoryMapperRepository<"transaction">): void {
    this.assertWritable();
      if (!this.listProjects().length) this.createProject({
        name: "Demo Local Project", localPath: "local-projects/demo-local-project.lsm",
        description: "Seed project for local development."
      });
      for (const project of this.listProjects()) this.initializeGettingStarted(project.id);
    }

export function createProjectWithGettingStarted(this: StoryMapperRepository<"transaction">, input: CreateProjectRequest): Project {
    this.assertWritable();
      const project = this.createProject(input);
      this.initializeGettingStarted(project.id);
      return project;
    }

export function initializeGettingStarted(this: StoryMapperRepository<"transaction">, projectId: string): void {
    this.assertWritable();
      this.ensureSafetySettings(projectId);
      const state = this.gettingStarted.read(projectId);
      if (state.initialized) { this.gettingStarted.recognize(projectId); return; }
      this.ensureDefaultWorkflowStatuses(projectId);
      this.gettingStarted.initialize(projectId, null);
      this.gettingStarted.recognize(projectId);
    }

export function getGettingStartedChecklist(this: StoryMapperRepository<"transaction">, projectId: string): GettingStartedChecklist {
    this.context.database;
    return this.gettingStarted.read(projectId);
}

export function dismissGettingStartedChecklist(this: StoryMapperRepository<"transaction">, projectId: string): GettingStartedChecklist {
    this.assertWritable();
      this.ensureSafetySettings(projectId);
      this.gettingStarted.dismiss(projectId);
      this.initializeGettingStarted(projectId);
      return this.getGettingStartedChecklist(projectId);
    }

export function markExportCompleted(this: StoryMapperRepository<"transaction">, projectIds: string[]): GettingStartedChecklist[] {
    this.assertWritable();
      for (const projectId of new Set(projectIds)) {
        this.ensureSafetySettings(projectId);
        this.gettingStarted.complete(projectId, "export");
        this.initializeGettingStarted(projectId);
      }
      return [...new Set(projectIds)].map((projectId) => this.getGettingStartedChecklist(projectId));
    }

export function createStoryMapFromTemplate(this: StoryMapperRepository<"transaction">, projectId: string, template: StoryMapTemplate, isSample = false): StoryMap {
    this.assertWritable();
    const plan = planStoryMapTemplate(template);
    const storyMap = this.createStoryMap(compact({ projectId, name: plan.name, description: plan.description }) as CreateStoryMapRequest, isSample);
      const releaseIds = new Map(plan.releases.map((release) => [release.ref, this.createRelease({ storyMapId: storyMap.id, name: release.name, goal: release.goal }).id]));
      const cardIds = new Map<string, string>();
      for (const card of plan.cards) {
        const created = this.createCard({
          storyMapId: storyMap.id, level: card.level, title: card.title, description: card.description,
          parentId: card.parentRef ? cardIds.get(card.parentRef)! : null,
          releaseId: card.releaseRef ? releaseIds.get(card.releaseRef)! : null
        }, isSample ? "template" : "human");
        cardIds.set(card.ref, created.id);
      }
      return storyMap;
  }

export function deleteStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): boolean {
    this.assertWritable();
      const row = this.db.select().from(storyMaps).where(and(eq(storyMaps.id, storyMapId), eq(storyMaps.deleted, false))).get();
      if (!row) return false;
      const before = toStoryMap(row);
      this.bumpRootVersion("storyMaps", storyMapId);
      this.db.update(storyMaps).set({ deleted: true }).where(eq(storyMaps.id, storyMapId)).run();
      this.logActivity(before.projectId, "storyMap.deleted", "storyMap", storyMapId, before, undefined);
      return true;
    }

export function listProjects(this: StoryMapperRepository<"transaction">): Project[] {
    this.context.database;
    return this.db.select().from(projects).where(eq(projects.historicalStub, false)).orderBy(asc(projects.createdAt)).all().map(toProject);
  }

export function createProject(this: StoryMapperRepository<"transaction">, input: CreateProjectRequest): Project {
    this.assertWritable();
      const project: Project = {
        historicalStub: false,
        id: randomUUID(),
        name: input.name,
        localPath: input.localPath ?? `local-projects/${slugify(input.name)}.lsm`,
        defaultLanguage: "en",
        defaultEstimationUnit: "points",
        createdAt: new Date().toISOString()
      };

      if (input.description !== undefined) {
        project.description = input.description;
      }

      this.db.insert(projects).values(project).run();
      this.ensureSafetySettings(project.id);
      this.ensureDefaultWorkflowStatuses(project.id);
      this.seedAiTemplates(project.id);
      this.logActivity(project.id, "project.created", "project", project.id, undefined, project);
      return project;
    }

export function getSafetySettings(this: StoryMapperRepository<"transaction">, projectId: string): SafetySettings {
    this.context.database;
    const row = this.db.select().from(projectSettings).where(eq(projectSettings.projectId, projectId)).get();
    if (!row) throw new DomainError("internal", `Project ${projectId} not initialized.`);
    return toSafetySettings(row);
  }

export function updateSafetySettings(this: StoryMapperRepository<"transaction">, projectId: string, input: UpdateSafetySettingsRequest): SafetySettings {
    this.assertWritable();
    if (this.actor.actorType === "agent") throw new DomainError("disabled", "Safety settings are human-controlled.");
    const before = this.ensureSafetySettings(projectId);
    const after: SafetySettings = {
      epoch: before.epoch,
      projectId,
      agentMode: input.agentMode ?? before.agentMode,
      github: input.github ?? before.github,
      updatedAt: new Date().toISOString()
    };

    this.db
      .update(projectSettings)
      .set({
        agentMode: after.agentMode,
        githubEnabled: after.github,
        updatedAt: after.updatedAt
      })
      .where(eq(projectSettings.projectId, projectId))
      .run();

    this.logActivity(projectId, "settings.safetyUpdated", "projectSettings", projectId, before, after);
    return after;
  }

export function listStoryMaps(this: StoryMapperRepository<"transaction">, projectId?: string): StoryMap[] {
    this.context.database;
    const query = this.db.select().from(storyMaps).orderBy(asc(storyMaps.createdAt));
    const rows = projectId ? query.where(eq(storyMaps.projectId, projectId)).all() : query.all();
    return rows.filter((row) => !row.deleted).map(toStoryMap);
  }

export function createStoryMap(this: StoryMapperRepository<"transaction">, input: CreateStoryMapRequest, isSample = false): StoryMap {
    this.assertWritable();
      this.ensureSafetySettings(input.projectId);
      const now = new Date().toISOString();
      const storyMap: StoryMap = {
        version: 1,
        id: randomUUID(),
        projectId: input.projectId,
        name: input.name,
        estimationUnit: "points",
        cardKeyPrefix: "LSM",
        createdAt: now,
        updatedAt: now
      };

      if (input.description !== undefined) {
        storyMap.description = input.description;
      }

      if (input.colorCategoryNames && Object.keys(input.colorCategoryNames).length) storyMap.colorCategoryNames = input.colorCategoryNames;
      if (input.epicContext !== undefined) storyMap.epicContext = input.epicContext;
      this.db.insert(storyMaps).values({ ...storyMap, colorCategoryNamesJson: storyMap.colorCategoryNames ? JSON.stringify(storyMap.colorCategoryNames) : null, colorCategoryNamesSchemaVersion: storyMap.colorCategoryNames ? 1 : null, epicContextJson: storyMap.epicContext ? JSON.stringify(storyMap.epicContext) : null, epicContextSchemaVersion: storyMap.epicContext ? 1 : null }).run();
      this.createRootVersion("storyMaps", storyMap.id);
      if (!isSample) this.gettingStarted.complete(storyMap.projectId, "createStoryMap");
      this.logActivity(storyMap.projectId, "storyMap.created", "storyMap", storyMap.id, undefined, storyMap);
      return storyMap;
    }

export function updateStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string, input: UpdateStoryMapRequest): StoryMap | undefined {
    this.assertWritable();
    const existing = this.db.select().from(storyMaps).where(and(eq(storyMaps.id, storyMapId), eq(storyMaps.deleted, false))).get();
    if (!existing) {
      return undefined;
    }
    const before = toStoryMap(existing);
    const patch: Partial<typeof storyMaps.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.colorCategoryNames !== undefined) {
      const names = Object.keys(input.colorCategoryNames).length ? input.colorCategoryNames : undefined;
      patch.colorCategoryNamesJson = names ? JSON.stringify(names) : null;
      patch.colorCategoryNamesSchemaVersion = names ? 1 : null;
    }
    if (input.epicContext !== undefined) {
      patch.epicContextJson = input.epicContext ? JSON.stringify(input.epicContext) : null;
      patch.epicContextSchemaVersion = input.epicContext ? 1 : null;
    }
    if (input.name !== undefined) patch.name = input.name;
    if (input.cardKeyPrefix !== undefined) patch.cardKeyPrefix = input.cardKeyPrefix;
    if (input.description !== undefined) patch.description = input.description;
    if (input.defaultConnectionId !== undefined) patch.defaultConnectionId = input.defaultConnectionId;
    this.db.update(storyMaps).set(patch).where(eq(storyMaps.id, storyMapId)).run();
    this.bumpRootVersion("storyMaps", storyMapId);
    const updated = this.db.select().from(storyMaps).where(and(eq(storyMaps.id, storyMapId), eq(storyMaps.deleted, false))).get();
    const after = toStoryMap(updated ?? existing);
    this.logActivity(existing.projectId, "storyMap.updated", "storyMap", storyMapId, before, after);
    return after;
  }

export function getStoryMapSnapshot(this: StoryMapperRepository<"transaction">, storyMapId: string): StoryMapSnapshot | undefined {
    this.context.database;
    const storyMap = this.db.select().from(storyMaps).where(and(eq(storyMaps.id, storyMapId), eq(storyMaps.deleted, false))).get();
    if (!storyMap) {
      return undefined;
    }

    return {
      storyMap: toStoryMap(storyMap),
      githubStatusCatalogs: this.listConnectorConnections(storyMap.projectId).flatMap((connection) => (connection.statusCatalogs ?? []).flatMap((catalog) => {
        const current = githubStatusSourceKey(catalog.source) === githubStatusSourceKey(connection.statusSource ?? { kind: "repository" });
        return current || catalog.options.length ? [{ connectionId: connection.id, connectionName: connection.name, catalog: current ? catalog : { ...catalog, options: catalog.options.map((option) => ({ ...option, retired: true })) } }] : [];
      })),
      cards: this.listCards(storyMapId),
      releases: this.listReleases(storyMapId),
      externalRefs: this.listExternalRefsForStoryMap(storyMapId),
      personas: this.listPersonas(storyMap.projectId, storyMapId),
      workflowStatuses: this.listWorkflowStatuses(storyMap.projectId, storyMapId),
      cardPersonas: this.listCardPersonasForStoryMap(storyMapId),
      annotations: this.listAnnotations(storyMap.projectId, storyMapId),
      cardAnnotations: this.listCardAnnotationsForStoryMap(storyMapId),
      cardDependencies: this.listCardDependenciesForStoryMap(storyMapId),
      storyTemplates: this.listStoryTemplates(storyMap.projectId, storyMapId),
      roadmaps: this.listRoadmaps(storyMap.projectId, storyMapId),
      productContext: this.getProductContext(storyMap.projectId, storyMapId),
      sourceChunks: this.listSourceChunksForStoryMap(storyMapId),
      sourceLinks: this.listSourceLinksForStoryMap(storyMapId),
      cardAttachments: this.listCardAttachmentsForStoryMap(storyMapId),
      githubLinks: this.listGitHubLinksForStoryMap(storyMapId),
      remoteWorkItemLinks: this.listRemoteWorkItemLinksForStoryMap(storyMapId)
    };
  }

export function getProductContext(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): ProductContext {
    this.context.database;
    if (storyMapId) this.getStoryMapOrThrow(storyMapId);
    const row = storyMapId
      ? this.db
          .select()
          .from(productContexts)
          .where(and(eq(productContexts.projectId, projectId), eq(productContexts.storyMapId, storyMapId)))
          .get()
      : this.db
          .select()
          .from(productContexts)
          .where(and(eq(productContexts.projectId, projectId), isNull(productContexts.storyMapId)))
          .get();
    if (row) {
      return toProductContext(row);
    }

    return {
      id: randomUUID(),
      projectId,
      storyMapId: storyMapId ?? null,
      productType: "",
      purpose: "",
      keyFeatures: [],
      targetUsers: "",
      platform: "",
      pricing: "",
      notes: "",
      glossary: "",
      nonGoals: "",
      complianceConstraints: "",
      updatedAt: new Date().toISOString()
    };
  }

export function upsertProductContext(this: StoryMapperRepository<"transaction">, input: UpsertProductContextRequest): ProductContext {
    this.assertWritable();
    if (input.storyMapId) this.getStoryMapOrThrow(input.storyMapId);
    const before = this.getProductContext(input.projectId, input.storyMapId ?? undefined);
    const existing = this.db.select().from(productContexts).where(eq(productContexts.id, before.id)).get();
    const after: ProductContext = {
      ...before,
      storyMapId: input.storyMapId === undefined ? before.storyMapId : input.storyMapId,
      productType: input.productType ?? before.productType,
      purpose: input.purpose ?? before.purpose,
      keyFeatures: input.keyFeatures ?? before.keyFeatures,
      targetUsers: input.targetUsers ?? before.targetUsers,
      platform: input.platform ?? before.platform,
      pricing: input.pricing ?? before.pricing,
      notes: input.notes ?? before.notes,
      glossary: input.glossary ?? before.glossary,
      nonGoals: input.nonGoals ?? before.nonGoals,
      complianceConstraints: input.complianceConstraints ?? before.complianceConstraints,
      updatedAt: new Date().toISOString()
    };
    const values = {
      id: after.id,
      projectId: after.projectId,
      storyMapId: after.storyMapId,
      productType: after.productType,
      purpose: after.purpose,
      keyFeaturesSchemaVersion: 1, keyFeaturesJson: JSON.stringify(after.keyFeatures),
      targetUsers: after.targetUsers,
      platform: after.platform,
      pricing: after.pricing,
      notes: after.notes,
      glossary: after.glossary,
      nonGoals: after.nonGoals,
      complianceConstraints: after.complianceConstraints,
      updatedAt: after.updatedAt
    };

    if (existing) {
      this.db.update(productContexts).set(values).where(eq(productContexts.id, after.id)).run();
    } else {
      this.db.insert(productContexts).values(values).run();
    }
    if (after.storyMapId) this.bumpRootVersion("storyMaps", after.storyMapId);
    this.logActivity(input.projectId, "productContext.updated", "productContext", after.id, before, after);
    return after;
  }

export function listCardAttachments(this: StoryMapperRepository<"transaction">, cardId: string): CardAttachment[] {
    this.context.database;
    if (!this.getCard(cardId)) return [];
    return this.db
      .select()
      .from(cardAttachments)
      .where(eq(cardAttachments.cardId, cardId))
      .orderBy(asc(cardAttachments.createdAt))
      .all()
      .map(toCardAttachment);
  }

export function listCardAttachmentsForStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): CardAttachment[] {
    this.context.database;
    const cardIds = new Set(this.listCards(storyMapId).map((card) => card.id));
    return this.db
      .select()
      .from(cardAttachments)
      .all()
      .map(toCardAttachment)
      .filter((attachment) => cardIds.has(attachment.cardId));
  }

export function ensureSafetySettings(this: StoryMapperRepository<"transaction">, projectId: string): SafetySettings {
    this.assertWritable();
    const existing = this.db.select().from(projectSettings).where(eq(projectSettings.projectId, projectId)).get();
    if (existing) {
      return toSafetySettings(existing);
    }

    const project = this.db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project || project.historicalStub) {
      throw new DomainError("not_found", `Project ${projectId} not found.`);
    }

    const settings: SafetySettings = {
      epoch: this.db.select({ epoch: databaseMetadata.epoch }).from(databaseMetadata).get()!.epoch,
      projectId,
      agentMode: "apply",
      github: false,
      updatedAt: new Date().toISOString()
    };
    this.db.insert(projectSettings).values({
      epoch: settings.epoch!,
      projectId,
      agentMode: settings.agentMode,
      githubEnabled: settings.github,
      updatedAt: settings.updatedAt
    }).run();
    return settings;
  }

export function getStoryMapOrThrow(this: StoryMapperRepository<"transaction">, storyMapId: string): StoryMap {
    this.context.database;
    const storyMap = this.db.select().from(storyMaps).where(and(eq(storyMaps.id, storyMapId), eq(storyMaps.deleted, false))).get();
    if (!storyMap) {
      throw new DomainError("not_found", `Story map ${storyMapId} not found.`);
    }
    return toStoryMap(storyMap);
  }

export function isStoryMapVisible(this: StoryMapperRepository<"transaction">, storyMapId: string): boolean {
    this.context.database;
    return Boolean(this.db.select({ id: storyMaps.id }).from(storyMaps).where(and(eq(storyMaps.id, storyMapId), eq(storyMaps.deleted, false))).get());
  }
