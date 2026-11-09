import { isCardArchived } from "@storymapper/core/story-map/github-status";
import { sourcePlanBaselineSchema, type Card, type ExternalRef, type PlanDriftReport, type PlanStateProjection, type SourcePlanBaseline, type SourcePlanEntry, type ValidatedSourcePlanBaseline } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core/story-map/visibility";

export function validateSourcePlanBaseline(input: SourcePlanBaseline): ValidatedSourcePlanBaseline {
  const baseline = sourcePlanBaselineSchema.parse(input);
  const ids = new Set<string>();
  for (const entry of baseline.entries) {
    if (ids.has(entry.cardId) || entry.identity.id !== entry.cardId) throw new Error("Source plan baseline contains duplicate or inconsistent Card identity.");
    ids.add(entry.cardId);
    if (entry.card && (entry.card.id !== entry.cardId || entry.card.storyMapId !== baseline.storyMapId)) throw new Error("Source plan baseline contains a foreign Card.");
    if (!entry.card && entry.active) throw new Error("Deleted source plan Card cannot be active.");
    if (entry.binding && (entry.binding.entityType !== "card" || entry.binding.entityId !== entry.cardId || entry.binding.scopeId !== baseline.storyMapId || entry.binding.system !== baseline.system)) throw new Error("Source plan baseline contains a foreign binding.");
  }
  if (new Set(baseline.releases.map((release) => release.id)).size !== baseline.releases.length) throw new Error("Source plan baseline contains duplicate Releases.");
  return baseline as ValidatedSourcePlanBaseline;
}

export function sourcePlanEntry(card: Card, active: boolean, binding: ExternalRef | null, releaseName: string | null): SourcePlanEntry {
  return { cardId: card.id, identity: { id: card.id, key: card.key, title: card.title }, card: { ...card }, active, binding: binding ? { ...binding } : null, releaseName };
}

export function sourcePlanProjection(card: Card, active: boolean): { title: string; description: string; status: string; releaseId: string | null; active: boolean } {
  return { title: card.title, description: card.description, status: card.status, releaseId: card.releaseId, active };
}

export function buildPlanDriftReport(input: SourcePlanBaseline, current: PlanStateProjection, bindings: readonly ExternalRef[]): PlanDriftReport {
  return buildPlanDriftReportFromValidatedBaseline(validateSourcePlanBaseline(input), current, bindings);
}

export function buildPlanDriftReportFromValidatedBaseline(baseline: ValidatedSourcePlanBaseline, current: PlanStateProjection, bindings: readonly ExternalRef[]): PlanDriftReport {
  if (baseline.storyMapId !== current.storyMap.id || baseline.projectId !== current.storyMap.projectId) throw new Error("Source plan baseline belongs to another Story Map.");
  const cards = new Map(current.cards.map((card) => [card.id, card]));
  const currentBindings = new Map(bindings.filter((ref) => ref.entityType === "card" && ref.scopeId === baseline.storyMapId && ref.system === baseline.system).map((ref) => [ref.entityId, ref]));
  const releaseNames = new Map(current.releases.map((release) => [release.id, release.name]));
  const active = new Set(visibleCards(current.cards).map((card) => card.id));
  const previous = new Map(baseline.entries.map((entry) => [entry.cardId, entry]));
  const changes: PlanDriftReport["changes"] = [];
  for (const id of [...new Set([...previous.keys(), ...cards.keys()])].sort()) {
    const before = previous.get(id) ?? null, card = cards.get(id);
    const after = card ? { cardId: card.id, identity: { id: card.id, key: card.key, title: card.title }, card, active: active.has(id), binding: currentBindings.get(id) ?? null, releaseName: releaseNames.get(card.releaseId!) ?? null } : null;
    const kinds = driftKinds(before, after);
    if (!kinds.length) continue;
    changes.push({ cardId: id, kinds, reason: !card ? "deleted" : isCardArchived(card) ? "archived" : card.parked ? "parked" : active.has(id) ? "active" : "hidden", before: before ? copySourcePlanEntry(before) : null, after: after ? sourcePlanEntry(after.card, after.active, after.binding, after.releaseName) : null,
      beforeReleaseName: before?.releaseName ?? null,
      afterReleaseName: card?.releaseId ? releaseNames.get(card.releaseId!) ?? null : null });
  }
  return { storyMapId: baseline.storyMapId, system: baseline.system, baselineId: baseline.id, baselineVersion: baseline.version, changes };
}

function copySourcePlanEntry(entry: SourcePlanEntry): SourcePlanEntry {
  return { ...entry, identity: { ...entry.identity }, card: entry.card ? { ...entry.card } : null, binding: entry.binding ? { ...entry.binding } : null };
}

function driftKinds(before: SourcePlanEntry | null, after: SourcePlanEntry | null): PlanDriftReport["changes"][number]["kinds"] {
  const kinds: PlanDriftReport["changes"][number]["kinds"] = [];
  if ((!before || !before.card) && after?.card || before && !before.active && after?.active) kinds.push("added");
  if (before?.card && !after?.card || before?.active && !after?.active) kinds.push("removed");
  if (before?.card && after?.card) {
    if (["title", "description", "status"].some((field) => before.card![field as "title"] !== after.card![field as "title"])) kinds.push("changed");
    if (before.card.releaseId !== after.card.releaseId) kinds.push("moved");
  }
  return kinds;
}
