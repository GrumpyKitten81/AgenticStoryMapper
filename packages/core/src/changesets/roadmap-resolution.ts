import type { ChangeOperation } from "@storymapper/contracts";
import { ownValue } from "@storymapper/core/changesets/supply-values";
import { allocatedId, bumpVersion, referenceId, type ResolutionContext, refuse } from "@storymapper/core/changesets/resolution-context";
import { allocatedChildId, remainingReference, remainingTarget, roadmapRoot, scopedOwner } from "@storymapper/core/changesets/remaining-context";

type RoadmapOperation = Extract<ChangeOperation, { entity: "roadmap" | "roadmapColumn" | "roadmapSwimlane" | "roadmapCard" | "roadmapReference" }>;

export function resolveRoadmap(context: ResolutionContext): void {
  const operation = context.operation as RoadmapOperation;
  if (operation.entity === "roadmap") return resolveRoadmapRoot(context, operation);
  if (operation.entity === "roadmapReference") return createReference(context, operation);
  const after = operation.after;
  const roadmap = roadmapRoot(context, after.roadmapId);
  const id = allocatedId(context);
  if (operation.entity === "roadmapColumn" || operation.entity === "roadmapSwimlane") {
    const rows = operation.entity === "roadmapColumn" ? context.state.roadmapColumns : context.state.roadmapSwimlanes;
    rows.push({ id, roadmapId: roadmap.id, name: operation.after.name, position: operation.after.position ?? rows.filter((row) => row.roadmapId === roadmap.id).length });
  } else {
    const payload = operation.after;
    const columnId = remainingReference(context, "roadmapColumn", payload.columnId);
    if (context.state.roadmapColumns.find((row) => row.id === columnId)!.roadmapId !== roadmap.id) refuse(context, "Roadmap column belongs to another Roadmap.");
    const swimlaneId = payload.swimlaneId ? remainingReference(context, "roadmapSwimlane", payload.swimlaneId) : null;
    if (swimlaneId && context.state.roadmapSwimlanes.find((row) => row.id === swimlaneId)!.roadmapId !== roadmap.id) refuse(context, "Roadmap swimlane belongs to another Roadmap.");
    context.state.roadmapCards.push({ ...payload, id, roadmapId: roadmap.id, columnId, swimlaneId, details: payload.details ?? "", labels: payload.labels ?? [], reach: payload.reach ?? null, impact: payload.impact ?? null, confidence: payload.confidence ?? null, effort: payload.effort ?? null, position: payload.position ?? context.state.roadmapCards.filter((row) => row.roadmapId === roadmap.id && row.columnId === columnId).length });
  }
  bumpVersion(context, roadmap);
}

function resolveRoadmapRoot(context: ResolutionContext, operation: Extract<RoadmapOperation, { entity: "roadmap" }>): void {
  if (operation.op === "update") {
    const roadmap = roadmapRoot(context, remainingTarget(context, "roadmap"));
    Object.assign(roadmap, operation.after, { updatedAt: context.supply.createdAt });
    bumpVersion(context, roadmap);
    return;
  }
  const after = operation.after;
  const storyMapId = after.storyMapId ? referenceId(context, "storyMap", after.storyMapId) : null;
  scopedOwner(context, { projectId: after.projectId, storyMapId });
  const id = allocatedId(context);
  const seed = ownValue(context.supply.roadmapSeedIds, operation.operationId);
  if (!seed || !Array.isArray(seed.columns) || seed.columns.length !== 3) refuse(context, "Application must supply all Roadmap seed identities.");
  const ids = [...seed.columns, seed.swimlane];
  if (new Set(ids).size !== 4 || ids.includes(id)) refuse(context, "Roadmap seed identities must be distinct.");
  ids.forEach((childId) => allocatedChildId(context, childId));
  context.state.roadmaps.push({ ...after, id, storyMapId, type: after.type ?? "simple", version: 1, createdAt: context.supply.createdAt, updatedAt: context.supply.createdAt });
  seed.columns.forEach((columnId, position) => context.state.roadmapColumns.push({ id: columnId, roadmapId: id, name: ["Now", "Next", "Later"][position]!, position }));
  context.state.roadmapSwimlanes.push({ id: seed.swimlane, roadmapId: id, name: "Default", position: 0 });
}

function createReference(context: ResolutionContext, operation: Extract<RoadmapOperation, { entity: "roadmapReference" }>): void {
  const after = operation.after;
  const roadmapCardId = remainingReference(context, "roadmapCard", after.roadmapCardId);
  const card = context.state.roadmapCards.find((row) => row.id === roadmapCardId)!;
  const roadmap = roadmapRoot(context, card.roadmapId);
  const targetId = remainingReference(context, after.targetType, after.targetId);
  const target = after.targetType === "card" ? context.state.cards.find((row) => row.id === targetId)! : context.state.releases.find((row) => row.id === targetId)!;
  scopedOwner(context, { projectId: context.state.storyMaps.find((row) => row.id === target.storyMapId)?.projectId ?? "", storyMapId: target.storyMapId });
  if (context.state.roadmapReferences.some((row) => row.roadmapCardId === roadmapCardId && row.targetType === after.targetType && row.targetId === targetId)) return;
  context.state.roadmapReferences.push({ ...after, id: allocatedId(context), roadmapCardId, targetId });
  bumpVersion(context, roadmap);
}
