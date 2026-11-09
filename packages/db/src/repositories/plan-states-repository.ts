import { randomUUID } from "node:crypto";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { DomainError, planStateSummarySchema, type PlanState, type PlanStateSummary, type PlanStateProjection } from "@storymapper/contracts";
import { buildPlanStateProjection, isCardCompleted, visibleCards } from "@storymapper/core";
import { parseStoredPlanState } from "@storymapper/db/plan-state-validation";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { cardDependencies, cards as cardRows, planStates } from "@storymapper/db/schema";

export function getPlanStateProjection(this: StoryMapperRepository, storyMapId: string): PlanStateProjection {
  const storyMap = this.getStoryMapOrThrow(storyMapId);
  const cards = this.listCards(storyMapId);
  const links = this.listRemoteWorkItemLinksForStoryMap(storyMapId);
  const workflowStatuses = this.listWorkflowStatuses(storyMap.projectId, storyMapId);
  const prerequisite = alias(cardRows, "projectionPrerequisite");
  return { completedCardIds: cards.filter((card) => isCardCompleted(card, links, workflowStatuses)).map((card) => card.id), storyMap, cards, releases: this.listReleases(storyMapId), workflowStatuses,
    cardDependencies: this.db.select(getTableColumns(cardDependencies)).from(cardDependencies)
      .innerJoin(cardRows, eq(cardRows.id, cardDependencies.cardId))
      .innerJoin(prerequisite, eq(prerequisite.id, cardDependencies.prerequisiteCardId))
      .where(and(eq(cardRows.storyMapId, storyMapId), eq(prerequisite.storyMapId, storyMapId))).all(),
    storyIds: visibleCards(cards).filter((card) => card.level === "story").map((card) => card.id)
  };
}

export function capturePlanState(this: StoryMapperRepository<"transaction">, storyMapId: string): PlanState {
  this.assertWritable();
  if (this.actor.actorType !== "human") throw new DomainError("protected", "Recording a Plan state is human-only.");
  const snapshot = this.getStoryMapSnapshot(storyMapId);
  if (!snapshot) throw new DomainError("not_found", "Story map not found.");
  const state: PlanState = {
    id: randomUUID(), projectId: snapshot.storyMap.projectId, storyMapId,
    capturedAt: new Date().toISOString(), schemaVersion: 1, actor: this.actor.actorId,
    payload: buildPlanStateProjection(snapshot)
  };
  const { payload, ...summary } = state;
  const row = { ...summary, payloadJson: JSON.stringify(payload) };
  const validated = parseStoredPlanState(row, state.projectId);
  this.db.insert(planStates).values(row).run();
  this.logActivity(state.projectId, "planState.recorded", "planState", state.id, undefined, summary);
  return validated;
}

export function listPlanStates(this: StoryMapperRepository, storyMapId: string): PlanStateSummary[] {
  const map = this.getStoryMapOrThrow(storyMapId);
  return this.db.select({ id: planStates.id, projectId: planStates.projectId, storyMapId: planStates.storyMapId,
    capturedAt: planStates.capturedAt, schemaVersion: planStates.schemaVersion, actor: planStates.actor
  }).from(planStates).where(eq(planStates.storyMapId, storyMapId))
    .orderBy(desc(planStates.capturedAt), desc(planStates.id)).all().map((row) => {
      const parsed = planStateSummarySchema.safeParse(row);
      if (!parsed.success) throw new DomainError("validation", "Plan state has an unsupported schema or invalid capture metadata.");
      if (parsed.data.projectId !== map.projectId) throw new DomainError("validation", "Plan state ownership does not match its Story Map.");
      return parsed.data;
    });
}

export function getPlanState(this: StoryMapperRepository, storyMapId: string, stateId: string): PlanState {
  const map = this.getStoryMapOrThrow(storyMapId);
  const row = this.db.select().from(planStates).where(and(eq(planStates.id, stateId), eq(planStates.storyMapId, storyMapId))).get();
  if (!row) throw new DomainError("not_found", "Plan state not found for this Story Map.");
  return parseStoredPlanState(row, map.projectId);
}
