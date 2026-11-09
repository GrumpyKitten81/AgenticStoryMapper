import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { DomainError } from "@storymapper/contracts";
import type { CreateRoadmapCardRequest, CreateRoadmapColumnRequest, CreateRoadmapReferenceRequest, CreateRoadmapRequest, CreateRoadmapSwimlaneRequest, Roadmap, RoadmapCard, RoadmapColumn, RoadmapDetailsData, RoadmapReference, RoadmapSwimlane, UpdateRoadmapRequest } from "@storymapper/contracts";
import { roadmapCards, roadmapColumns, roadmapReferences, roadmaps, roadmapSwimlanes } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { toRoadmap, toRoadmapColumn, toRoadmapSwimlane, toRoadmapCard, toRoadmapReference } from "@storymapper/db/repositories/row-mappers";
import { compact } from "@storymapper/db/repositories/repository-values";

export function listRoadmaps(this: StoryMapperRepository<"transaction">, projectId: string, storyMapId?: string): Roadmap[] {
    this.context.database;
    if (storyMapId) this.getStoryMapOrThrow(storyMapId);
    return this.db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.projectId, projectId))
      .orderBy(asc(roadmaps.createdAt))
      .all()
      .map(toRoadmap)
      .filter((roadmap) => roadmap.storyMapId === null || roadmap.storyMapId === (storyMapId ?? null));
  }

export function createRoadmap(this: StoryMapperRepository<"transaction">, input: CreateRoadmapRequest): Roadmap {
    this.assertWritable();
    if (input.storyMapId) this.getStoryMapOrThrow(input.storyMapId);
    const now = new Date().toISOString();
    const roadmap: Roadmap = {
      version: 1,
      id: randomUUID(),
      projectId: input.projectId,
      storyMapId: input.storyMapId ?? null,
      name: input.name,
      type: input.type ?? "simple",
      createdAt: now,
      updatedAt: now
    };
    this.db.insert(roadmaps).values(roadmap).run();
    this.createRootVersion("roadmaps", roadmap.id);
    const firstColumn = this.createRoadmapColumn({ roadmapId: roadmap.id, name: "Now", position: 0 });
    this.createRoadmapColumn({ roadmapId: roadmap.id, name: "Next", position: 1 });
    this.createRoadmapColumn({ roadmapId: roadmap.id, name: "Later", position: 2 });
    this.createRoadmapSwimlane({ roadmapId: roadmap.id, name: "Default", position: 0 });
    this.logActivity(roadmap.projectId, "roadmap.created", "roadmap", roadmap.id, undefined, { roadmap, firstColumnId: firstColumn.id });
    return roadmap;
  }

export function updateRoadmap(this: StoryMapperRepository<"transaction">, roadmapId: string, input: UpdateRoadmapRequest): Roadmap | undefined {
    this.assertWritable();
    const before = this.getRoadmap(roadmapId);
    if (!before) return undefined;
    this.db.update(roadmaps).set({ ...compact(input), updatedAt: new Date().toISOString() }).where(eq(roadmaps.id, roadmapId)).run();
    this.bumpRootVersion("roadmaps", roadmapId);
    const after = this.getRoadmap(roadmapId);
    if (!after) return undefined;
    this.logActivity(after.projectId, "roadmap.updated", "roadmap", roadmapId, before, after);
    return after;
  }

export function getRoadmapDetailsData(this: StoryMapperRepository<"transaction">, roadmapId: string): RoadmapDetailsData | undefined {
    this.context.database;
    const roadmap = this.getRoadmap(roadmapId);
    if (!roadmap) return undefined;
    const columns = this.listRoadmapColumns(roadmapId);
    const swimlanes = this.listRoadmapSwimlanes(roadmapId);
    const cardsForRoadmap = this.listRoadmapCards(roadmapId);
    const references = this.listRoadmapReferences(roadmapId);
    return {
      roadmap,
      columns,
      swimlanes,
      cards: cardsForRoadmap,
      references,
      remoteWorkItemLinks: roadmap.storyMapId ? this.listRemoteWorkItemLinksForStoryMap(roadmap.storyMapId) : [],
      workflowStatuses: this.listWorkflowStatuses(roadmap.projectId, roadmap.storyMapId ?? undefined),
      storyCards: roadmap.storyMapId ? this.listCards(roadmap.storyMapId) : []
    };
  }

export function createRoadmapColumn(this: StoryMapperRepository<"transaction">, input: CreateRoadmapColumnRequest): RoadmapColumn {
    this.assertWritable();
    const roadmap = this.getRoadmap(input.roadmapId);
    if (!roadmap) throw new DomainError("not_found", `Roadmap ${input.roadmapId} not found.`);
    const column: RoadmapColumn = {
      id: randomUUID(),
      roadmapId: input.roadmapId,
      name: input.name,
      position: input.position ?? this.listRoadmapColumns(input.roadmapId).length
    };
    this.db.insert(roadmapColumns).values(column).run();
    this.bumpRootVersion("roadmaps", roadmap.id);
    this.logActivity(roadmap.projectId, "roadmapColumn.created", "roadmapColumn", column.id, undefined, column);
    return column;
  }

export function createRoadmapSwimlane(this: StoryMapperRepository<"transaction">, input: CreateRoadmapSwimlaneRequest): RoadmapSwimlane {
    this.assertWritable();
    const roadmap = this.getRoadmap(input.roadmapId);
    if (!roadmap) throw new DomainError("not_found", `Roadmap ${input.roadmapId} not found.`);
    const swimlane: RoadmapSwimlane = {
      id: randomUUID(),
      roadmapId: input.roadmapId,
      name: input.name,
      position: input.position ?? this.listRoadmapSwimlanes(input.roadmapId).length
    };
    this.db.insert(roadmapSwimlanes).values(swimlane).run();
    this.bumpRootVersion("roadmaps", roadmap.id);
    this.logActivity(roadmap.projectId, "roadmapSwimlane.created", "roadmapSwimlane", swimlane.id, undefined, swimlane);
    return swimlane;
  }

export function createRoadmapCard(this: StoryMapperRepository<"transaction">, input: CreateRoadmapCardRequest): RoadmapCard {
    this.assertWritable();
    const roadmap = this.getRoadmap(input.roadmapId);
    if (!roadmap) throw new DomainError("not_found", `Roadmap ${input.roadmapId} not found.`);
    const column = this.db.select().from(roadmapColumns).where(eq(roadmapColumns.id, input.columnId)).get();
    if (!column || column.roadmapId !== input.roadmapId) throw new DomainError("not_found", "Roadmap column not found.");
    const card: RoadmapCard = {
      id: randomUUID(),
      roadmapId: input.roadmapId,
      columnId: input.columnId,
      swimlaneId: input.swimlaneId ?? null,
      title: input.title,
      details: input.details ?? "",
      labels: input.labels ?? [],
      reach: input.reach ?? null,
      impact: input.impact ?? null,
      confidence: input.confidence ?? null,
      effort: input.effort ?? null,
      position: input.position ?? this.listRoadmapCards(input.roadmapId).filter((item) => item.columnId === input.columnId).length
    };
    this.db.insert(roadmapCards).values({
      ...card,
      labelsSchemaVersion: 1, labelsJson: JSON.stringify(card.labels)
    }).run();
    this.bumpRootVersion("roadmaps", roadmap.id);
    this.logActivity(roadmap.projectId, "roadmapCard.created", "roadmapCard", card.id, undefined, card);
    return card;
  }

export function createRoadmapReference(this: StoryMapperRepository<"transaction">, input: CreateRoadmapReferenceRequest): RoadmapReference {
    this.assertWritable();
    const roadmapCard = this.getRoadmapCard(input.roadmapCardId);
    if (!roadmapCard) throw new DomainError("not_found", `Roadmap card ${input.roadmapCardId} not found.`);
    if (input.targetType === "release" && !this.getRelease(input.targetId)) throw new DomainError("not_found", "Referenced release not found.");
    if (input.targetType === "card" && !this.getCard(input.targetId)) throw new DomainError("not_found", "Referenced card not found.");
    const existing = this.db
      .select()
      .from(roadmapReferences)
      .where(and(
        eq(roadmapReferences.roadmapCardId, input.roadmapCardId),
        eq(roadmapReferences.targetType, input.targetType),
        eq(roadmapReferences.targetId, input.targetId)
      ))
      .get();
    if (existing) return toRoadmapReference(existing);
    const reference: RoadmapReference = {
      id: randomUUID(),
      roadmapCardId: input.roadmapCardId,
      targetType: input.targetType,
      targetId: input.targetId
    };
    this.db.insert(roadmapReferences).values(reference).run();
    this.bumpRootVersion("roadmaps", roadmapCard.roadmapId);
    const roadmap = this.getRoadmap(roadmapCard.roadmapId);
    if (roadmap) this.logActivity(roadmap.projectId, "roadmapReference.created", "roadmapReference", reference.id, undefined, reference);
    return reference;
  }

export function getRoadmap(this: StoryMapperRepository<"transaction">, roadmapId: string): Roadmap | undefined {
    this.context.database;
    const row = this.db.select().from(roadmaps).where(eq(roadmaps.id, roadmapId)).get();
    return row && (!row.storyMapId || this.isStoryMapVisible(row.storyMapId)) ? toRoadmap(row) : undefined;
  }

export function getRoadmapCard(this: StoryMapperRepository<"transaction">, roadmapCardId: string): RoadmapCard | undefined {
    this.context.database;
    const row = this.db.select().from(roadmapCards).where(eq(roadmapCards.id, roadmapCardId)).get();
    return row && this.getRoadmap(row.roadmapId) ? toRoadmapCard(row) : undefined;
  }

export function listRoadmapColumns(this: StoryMapperRepository<"transaction">, roadmapId: string): RoadmapColumn[] {
    this.context.database;
    return this.db.select().from(roadmapColumns).where(eq(roadmapColumns.roadmapId, roadmapId)).orderBy(asc(roadmapColumns.position)).all().map(toRoadmapColumn);
  }

export function listRoadmapSwimlanes(this: StoryMapperRepository<"transaction">, roadmapId: string): RoadmapSwimlane[] {
    this.context.database;
    return this.db.select().from(roadmapSwimlanes).where(eq(roadmapSwimlanes.roadmapId, roadmapId)).orderBy(asc(roadmapSwimlanes.position)).all().map(toRoadmapSwimlane);
  }

export function listRoadmapCards(this: StoryMapperRepository<"transaction">, roadmapId: string): RoadmapCard[] {
    this.context.database;
    return this.db.select().from(roadmapCards).where(eq(roadmapCards.roadmapId, roadmapId)).orderBy(asc(roadmapCards.position)).all().map(toRoadmapCard);
  }

export function listRoadmapReferences(this: StoryMapperRepository<"transaction">, roadmapId: string): RoadmapReference[] {
    this.context.database;
    const cardIds = new Set(this.listRoadmapCards(roadmapId).map((card) => card.id));
    return this.db.select().from(roadmapReferences).all().map(toRoadmapReference).filter((reference) => cardIds.has(reference.roadmapCardId));
  }
