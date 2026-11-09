import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { DomainError, sourcePlanBaselineSchema, type ExternalRef, type SourcePlanBaseline, type ValidatedSourcePlanBaseline } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";
import { parseStoredSourcePlanBaseline } from "@storymapper/db/source-plan-baseline-validation";
import { sourcePlanBaselines } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function listSourcePlanBaselines(this: StoryMapperRepository, storyMapId: string): ValidatedSourcePlanBaseline[] {
  const map = this.getStoryMapOrThrow(storyMapId);
  return this.db.select().from(sourcePlanBaselines).where(eq(sourcePlanBaselines.storyMapId, storyMapId)).orderBy(asc(sourcePlanBaselines.system)).all()
    .map((row) => parseStoredSourcePlanBaseline(row, map.projectId));
}

export function listSourcePlanSystems(this: StoryMapperRepository, storyMapId: string): string[] {
  const map = this.getStoryMapOrThrow(storyMapId);
  return this.db.select({ system: sourcePlanBaselines.system, projectId: sourcePlanBaselines.projectId })
    .from(sourcePlanBaselines).where(eq(sourcePlanBaselines.storyMapId, storyMapId)).orderBy(asc(sourcePlanBaselines.system)).all().map((row) => {
      if (row.projectId !== map.projectId) throw new DomainError("validation", "Source Plan baseline ownership does not match its Story Map.");
      const parsed = sourcePlanBaselineSchema.shape.system.safeParse(row.system);
      if (!parsed.success) throw new DomainError("validation", "Source Plan baseline has an invalid system identity.");
      return parsed.data;
    });
}

export function getSourcePlanBaseline(this: StoryMapperRepository, storyMapId: string, system: string): ValidatedSourcePlanBaseline | undefined {
  const map = this.getStoryMapOrThrow(storyMapId);
  const row = this.db.select().from(sourcePlanBaselines).where(and(eq(sourcePlanBaselines.storyMapId, storyMapId), eq(sourcePlanBaselines.system, system))).get();
  return row && parseStoredSourcePlanBaseline(row, map.projectId);
}

export function captureInitialSourcePlanBinding(repository: StoryMapperRepository<"transaction">, ref: ExternalRef): void {
  if (ref.entityType !== "card") return;
  const snapshot = repository.getStoryMapSnapshot(ref.scopeId);
  const card = snapshot?.cards.find((candidate) => candidate.id === ref.entityId);
  if (!snapshot || !card) throw new DomainError("internal", "Source Plan binding has no owning Card.");
  const baseline = repository.getSourcePlanBaseline(ref.scopeId, ref.system);
  const entry = { cardId: card.id, identity: { id: card.id, key: card.key, title: card.title }, card,
    releaseName: snapshot.releases.find((release) => release.id === card.releaseId)?.name ?? null,
    active: visibleCards(snapshot.cards).some((candidate) => candidate.id === card.id), binding: ref };
  const next: SourcePlanBaseline = {
    id: baseline?.id ?? randomUUID(), projectId: snapshot.storyMap.projectId, storyMapId: ref.scopeId, system: ref.system,
    version: (baseline?.version ?? 0) + 1, schemaVersion: 1,
    entries: [...(baseline?.entries.filter((candidate) => candidate.cardId !== card.id) ?? []), entry],
    releases: [...new Map([...(baseline?.releases ?? []), ...snapshot.releases.filter((release) => release.id === card.releaseId).map(({ id, name }) => ({ id, name }))].map((release) => [release.id, release])).values()]
  };
  const { entries, releases, ...metadata } = next;
  const row = { ...metadata, entriesJson: JSON.stringify(entries), releasesJson: JSON.stringify(releases) };
  parseStoredSourcePlanBaseline(row, snapshot.storyMap.projectId);
  if (baseline) repository.db.update(sourcePlanBaselines).set(row).where(eq(sourcePlanBaselines.id, baseline.id)).run();
  else repository.db.insert(sourcePlanBaselines).values(row).run();
}
