import { DomainError, sourcePlanBaselineSchema, type ValidatedSourcePlanBaseline } from "@storymapper/contracts";
import type { sourcePlanBaselines } from "@storymapper/db/schema";

export function parseStoredSourcePlanBaseline(row: typeof sourcePlanBaselines.$inferSelect, projectId: string): ValidatedSourcePlanBaseline {
  const { entriesJson, releasesJson, ...metadata } = row;
  let entries: unknown;
  let releases: unknown;
  try { entries = JSON.parse(entriesJson); releases = JSON.parse(releasesJson); }
  catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("validation", "Source Plan baseline contains invalid JSON.");
    throw error;
  }
  const parsed = sourcePlanBaselineSchema.safeParse({ ...metadata, entries, releases });
  if (!parsed.success) throw new DomainError("validation", "Source Plan baseline has an unsupported schema or invalid captured data.");
  const baseline = parsed.data;
  if (baseline.projectId !== projectId || new Set(baseline.entries.map((entry) => entry.cardId)).size !== baseline.entries.length ||
    new Set(baseline.releases.map((release) => release.id)).size !== baseline.releases.length ||
    baseline.entries.some((entry) => entry.identity.id !== entry.cardId || !entry.card && entry.active || entry.card && (entry.card.id !== entry.cardId || entry.card.storyMapId !== baseline.storyMapId) ||
      entry.binding && (entry.binding.entityType !== "card" || entry.binding.entityId !== entry.cardId || entry.binding.scopeId !== baseline.storyMapId || entry.binding.system !== baseline.system))) {
    throw new DomainError("validation", "Source Plan baseline contains inconsistent captured ownership or identity.");
  }
  return baseline as ValidatedSourcePlanBaseline;
}
