import type { Card, ChangeOperation, OperationSnapshot, SourcePlanAcknowledgment, SourcePlanBaseline } from "@storymapper/contracts";
import { sourcePlanEntry, sourcePlanProjection, validateSourcePlanBaseline } from "@storymapper/core/reports/plan-drift";
import { visibleCards } from "@storymapper/core/story-map/visibility";
import { OperationResolutionError, mapOwner, readDependency, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";

export function acknowledgmentError(state: OperationSnapshot, after: SourcePlanAcknowledgment): string | undefined {
  const baseline = state.sourcePlanBaselines?.find((row) => row.id === after.baselineId);
  if (!baseline || baseline.projectId !== state.projectId || baseline.storyMapId !== after.storyMapId || baseline.system !== after.system || baseline.version !== after.baselineVersion) return "Reviewed source baseline is missing, foreign or stale.";
  validateSourcePlanBaseline(baseline);
  if (new Set(after.entries.map((entry) => entry.cardId)).size !== after.entries.length) return "Duplicate source acknowledgment Card identity.";
  const active = new Set(visibleCards(state.cards.filter((card) => card.storyMapId === after.storyMapId)).map((card) => card.id));
  for (const entry of after.entries) {
    const previous = baseline.entries.find((row) => row.cardId === entry.cardId) ?? null;
    const card = state.cards.find((row) => row.id === entry.cardId) ?? null;
    const bindings = state.externalRefs.filter((ref) => ref.entityType === "card" && ref.entityId === entry.cardId && ref.system === after.system);
    if (!equal(previous, entry.before)) return "Reviewed source baseline entry changed.";
    if (!equal(card, entry.current) || card && card.storyMapId !== after.storyMapId) return "Reviewed current Card changed or belongs to another Story Map.";
    if (bindings.length > 1 || !equal(bindings[0] ?? null, entry.binding) || entry.binding && entry.binding.scopeId !== after.storyMapId) return "Reviewed source binding changed or is foreign.";
    if (!card && !previous) return "Deletion acknowledgment requires retained source identity.";
    if (!equal(card ? sourcePlanProjection(card, active.has(card.id)) : null, entry.source)) return "Source projection does not match the current local Card.";
  }
  return undefined;
}

export function acknowledgeSourcePlan(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "sourcePlan" }>;
  mapOwner(context, operation.after.storyMapId);
  const error = acknowledgmentError(context.state, operation.after);
  if (error) refuse(context, error, "conflict");
  const baseline = context.state.sourcePlanBaselines!.find((row) => row.id === operation.after.baselineId)!;
  readDependency(context, "sourcePlanBaseline", baseline.id);
  for (const reviewed of operation.after.entries) {
    readDependency(context, "card", reviewed.cardId);
    if (reviewed.binding) readDependency(context, "externalRef", reviewed.binding.id);
    const binding = context.state.externalRefs.find((ref) => ref.id === reviewed.binding?.id) ?? null;
    if (binding && reviewed.current) { binding.syncedVersion = reviewed.current.version; context.publishedRefIds.add(binding.id); }
    const previous = baseline.entries.find((entry) => entry.cardId === reviewed.cardId);
    const next = reviewed.current ? sourcePlanEntry(reviewed.current, reviewed.source!.active, binding, context.state.releases.find((row) => row.id === reviewed.current!.releaseId)?.name ?? null) : { ...previous!, card: null, active: false, binding: null };
    if (previous) Object.assign(previous, next); else baseline.entries.push(next);
    captureRelease(context.state, baseline, reviewed.current);
  }
  const addressed = context.acknowledgedSourceEntries.get(baseline.id) ?? new Set<string>();
  for (const entry of operation.after.entries) addressed.add(entry.cardId);
  context.acknowledgedSourceEntries.set(baseline.id, addressed);
  baseline.version += 1;
}

export function validateFinalAcknowledgments(state: OperationSnapshot, operations: readonly ChangeOperation[]): void {
  for (const operation of operations) {
    if (operation.entity !== "sourcePlan") continue;
    const active = new Set(visibleCards(state.cards.filter((card) => card.storyMapId === operation.after.storyMapId)).map((card) => card.id));
    for (const entry of operation.after.entries) {
      const card = state.cards.find((row) => row.id === entry.cardId);
      if (!equal(card ? sourcePlanProjection(card, active.has(card.id)) : null, entry.source)) throw new OperationResolutionError(operation.operationId, operations.indexOf(operation), "conflict", "Selected operations diverge from the acknowledged source projection.");
    }
  }
}

export function capturePublishedSourcePlans(context: ResolutionContext): void {
  captureAcknowledgedEntries(context);
  for (const baseline of context.state.sourcePlanBaselines ?? []) for (const entry of baseline.entries) {
    if (!entry.card || !entry.binding || !context.publishedRefIds.has(entry.binding.id) || context.state.cards.some((card) => card.id === entry.cardId)) continue;
    entry.card = null; entry.active = false; entry.binding = null; baseline.version += 1;
  }
  const refs = context.state.externalRefs.filter((ref) => ref.entityType === "card" && context.publishedRefIds.has(ref.id));
  if (!refs.length) return;
  const active = new Set(visibleCards(context.state.cards).map((card) => card.id));
  for (const ref of refs) {
    const card = context.state.cards.find((row) => row.id === ref.entityId);
    if (!card) continue;
    const baselines = context.state.sourcePlanBaselines ??= [];
    let baseline = baselines.find((row) => row.storyMapId === card.storyMapId && row.system === ref.system);
    if (context.initialExternalVersions.has(ref.id) && !baseline?.entries.some((entry) => entry.cardId === card.id)) refuse(context, "Existing source binding has no durable synchronization evidence.", "conflict");
    const existed = Boolean(baseline);
    if (!baseline) { baseline = { id: ref.id, projectId: context.state.projectId, storyMapId: card.storyMapId, system: ref.system, version: 1, schemaVersion: 1, entries: [], releases: [] }; baselines.push(baseline); }
    const next = sourcePlanEntry(card, active.has(card.id), ref, context.state.releases.find((row) => row.id === card.releaseId)?.name ?? null);
    const previous = baseline.entries.find((entry) => entry.cardId === card.id);
    if (equal(previous, next)) continue;
    if (previous) Object.assign(previous, next); else baseline.entries.push(next);
    if (existed) baseline.version += 1;
    captureRelease(context.state, baseline, card);
  }
}

function captureAcknowledgedEntries(context: ResolutionContext): void {
  const active = new Set(visibleCards(context.state.cards).map((card) => card.id));
  for (const baseline of context.state.sourcePlanBaselines ?? []) for (const id of context.acknowledgedSourceEntries.get(baseline.id) ?? []) {
    const previous = baseline.entries.find((entry) => entry.cardId === id)!;
    const card = context.state.cards.find((row) => row.id === id);
    const binding = context.state.externalRefs.find((ref) => ref.entityType === "card" && ref.entityId === id && ref.system === baseline.system) ?? null;
    if (binding && card) binding.syncedVersion = card.version;
    const next = card ? sourcePlanEntry(card, active.has(id), binding, context.state.releases.find((release) => release.id === card.releaseId)?.name ?? null) : { ...previous, card: null, active: false, binding: null };
    if (equal(previous, next)) continue;
    Object.assign(previous, next); baseline.version += 1;
    captureRelease(context.state, baseline, card);
  }
}

function captureRelease(state: OperationSnapshot, baseline: SourcePlanBaseline, card: Card | null | undefined): void {
  const release = state.releases.find((row) => row.id === card?.releaseId);
  if (!release) return;
  const previous = baseline.releases.find((row) => row.id === release.id);
  if (previous) previous.name = release.name; else baseline.releases.push({ id: release.id, name: release.name });
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
