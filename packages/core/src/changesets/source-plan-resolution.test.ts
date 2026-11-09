import { expect, it } from "vitest";
import { cardSchema, changeOperationSchema, planDriftReportSchema, projectSchema, releaseSchema, storyMapSchema, type ChangeOperation, type OperationSnapshot, type PlanStateProjection } from "@storymapper/contracts";
import { buildPlanDriftReport, buildPlanDriftReportFromValidatedBaseline, validateSourcePlanBaseline, collectOperationConflicts, resolveOperations, sourcePlanProjection } from "@storymapper/core";

const id = (value: number): string => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = "2026-10-11T12:00:00Z";
const supply = { createdAt: now, ids: { bind: id(20) }, externalRefIds: {}, creationOrigin: "manual" as const };
const parse = (operation: object): ChangeOperation => changeOperationSchema.parse(operation);

function fixture(): OperationSnapshot {
  const initial: OperationSnapshot = {
    projectId: id(1), projects: [projectSchema.parse({ id: id(1), name: "Project", localPath: "fixture.lsm", createdAt: now })],
    storyMaps: [storyMapSchema.parse({ id: id(2), projectId: id(1), name: "Map", version: 1, createdAt: now, updatedAt: now })],
    cards: [cardSchema.parse({ id: id(5), storyMapId: id(2), parentId: null, releaseId: id(6), key: "LSM-5", level: "story", title: "Published Story", description: "Published description", version: 1, position: 0, creationOrigin: "manual", provenance: "manual", createdAt: now, updatedAt: now })],
    releases: [releaseSchema.parse({ id: id(6), storyMapId: id(2), name: "First", position: 0, version: 1, startDate: null, releaseDate: null }), releaseSchema.parse({ id: id(7), storyMapId: id(2), name: "Second", position: 1, version: 1, startDate: null, releaseDate: null })],
    personas: [], productContexts: [], roadmaps: [], roadmapColumns: [], roadmapSwimlanes: [], roadmapCards: [], roadmapReferences: [], annotations: [], workflowStatuses: [], storyTemplates: [], attachments: [], cardPersonas: [], cardAnnotations: [], cardDependencies: [], remoteWorkItemLinks: [], externalRefs: [], sourceDocuments: [], sourceChunks: [], sourceLinks: [], githubLinks: [], connections: []
  };
  const bind = parse({ operationId: "bind", entityId: "binding", op: "set", entity: "externalRef", after: { entityType: "card", entityId: id(5), system: "source", externalId: "story", scopeId: id(2) } });
  return resolveOperations(initial, [bind], supply).state;
}

function projection(state: OperationSnapshot): PlanStateProjection {
  return { storyMap: state.storyMaps[0]!, cards: state.cards, releases: state.releases, workflowStatuses: state.workflowStatuses, cardDependencies: [], storyIds: state.cards.map((card) => card.id) };
}

function ack(state: OperationSnapshot): ChangeOperation {
  const baseline = state.sourcePlanBaselines![0]!;
  return parse({ operationId: "ack", op: "acknowledge", entity: "sourcePlan", after: {
    storyMapId: id(2), system: "source", baselineId: baseline.id, baselineVersion: baseline.version,
    entries: [{ cardId: id(5), before: baseline.entries[0] ?? null, current: state.cards[0] ?? null, binding: state.externalRefs[0] ?? null, source: state.cards[0] ? sourcePlanProjection(state.cards[0], state.cards[0].status !== "archived" && !state.cards[0].parked) : null }]
  } });
}

it("reports exact durable fields and Slice names, simultaneous changed/moved, additions and archived/deleted reasons without writes", () => {
  const state = fixture(), baseline = state.sourcePlanBaselines![0]!;
  Object.assign(state.cards[0]!, { title: "Human Story", description: "Human description", status: "active", releaseId: id(7), version: 2 });
  state.releases[0]!.name = "Renamed after publication";
  state.cards.push({ ...state.cards[0]!, id: id(8), key: "LSM-8", title: "Local addition" });
  const beforeRead = structuredClone(state);
  const report = planDriftReportSchema.parse(buildPlanDriftReport(baseline, projection(state), state.externalRefs));
  expect(report.changes[0]).toMatchObject({ cardId: id(5), kinds: ["changed", "moved"], beforeReleaseName: "First", afterReleaseName: "Second", before: { card: { title: "Published Story", description: "Published description", status: "todo" } }, after: { card: { title: "Human Story", description: "Human description", status: "active" } } });
  expect(report.baselineId).toBe(baseline.id);
  expect(report.changes[0]!.after!.binding).toEqual(state.externalRefs[0]);
  expect(buildPlanDriftReport(baseline, projection(state), []).changes[0]!.after!.binding).toBeNull();
  expect(report.changes[1]).toMatchObject({ cardId: id(8), kinds: ["added"] });
  expect(state).toEqual(beforeRead);
  state.cards[0]!.status = "archived";
  expect(buildPlanDriftReport(baseline, projection(state), state.externalRefs).changes[0]).toMatchObject({ kinds: ["removed", "changed", "moved"], reason: "archived" });
  state.cards.splice(0, 1); state.externalRefs = [];
  expect(buildPlanDriftReport(baseline, projection(state), state.externalRefs).changes[0]).toMatchObject({ kinds: ["removed"], reason: "deleted", before: { identity: { key: "LSM-5" } }, after: null });
});

it("acknowledges a matching human move, preserves Card fields and versions, and keeps ordinary publication conflicts", () => {
  const state = fixture();
  Object.assign(state.cards[0]!, { releaseId: id(7), version: 2 });
  const cards = structuredClone(state.cards);
  const publish = parse({ operationId: "publish", op: "upsert", entity: "card", baseVersion: 2, selector: { kind: "externalRef", scopeId: id(2), system: "source", externalId: "story" }, after: { storyMapId: id(2), level: "story", title: "Published Story" } });
  expect(() => resolveOperations(state, [publish], supply)).toThrow("human changes");
  const resolved = resolveOperations(state, [ack(state)], supply);
  expect(resolved.state.cards).toEqual(cards);
  expect(resolved.state.externalRefs[0]!.syncedVersion).toBe(2);
  expect(buildPlanDriftReport(resolved.state.sourcePlanBaselines![0]!, projection(resolved.state), resolved.state.externalRefs).changes).toEqual([]);
  expect(resolved.operations[0]!.changes.map((change) => change.entity).sort()).toEqual(["externalRef", "sourcePlanBaseline"]);
});

it.each(["baseline", "binding", "full-card", "source", "duplicate", "foreign"])("refuses %s evidence atomically", (kind) => {
  const state = fixture();
  const operation = ack(state);
  if (operation.entity !== "sourcePlan") throw new Error("Expected acknowledgment");
  if (kind === "baseline") state.sourcePlanBaselines![0]!.version += 1;
  if (kind === "binding") state.externalRefs = [];
  if (kind === "full-card") state.cards[0]!.estimate = 8;
  if (kind === "source") operation.after.entries[0]!.source!.title = "Divergent";
  if (kind === "duplicate") operation.after.entries.push(structuredClone(operation.after.entries[0]!));
  if (kind === "foreign") operation.after.entries[0]!.current!.storyMapId = id(99);
  const before = structuredClone(state);
  expect(collectOperationConflicts(state, [operation], supply)).not.toEqual([]);
  expect(() => resolveOperations(state, [operation], supply)).toThrow();
  expect(state).toEqual(before);
});

it("retains proven deletion identity, refuses unknown deletion, and acknowledges unreferenced additions without creating bindings", () => {
  const state = fixture(); state.cards = []; state.externalRefs = [];
  const removed = resolveOperations(state, [ack(state)], supply).state;
  expect(removed.sourcePlanBaselines![0]!.entries[0]).toMatchObject({ cardId: id(5), card: null, active: false });
  expect(buildPlanDriftReport(removed.sourcePlanBaselines![0]!, projection(removed), removed.externalRefs).changes).toEqual([]);
  const operation = ack(state);
  if (operation.entity !== "sourcePlan") throw new Error("Expected acknowledgment");
  operation.after.entries[0]!.cardId = id(99); operation.after.entries[0]!.before = null;
  expect(() => resolveOperations(state, [operation], supply)).toThrow("retained source identity");
  const addition = fixture(); addition.externalRefs = []; addition.sourcePlanBaselines![0]!.entries = [];
  const added = resolveOperations(addition, [ack({ ...addition, sourcePlanBaselines: [{ ...addition.sourcePlanBaselines![0]!, entries: [] }] })], supply).state;
  expect(added.externalRefs).toEqual([]);
  expect(buildPlanDriftReport(added.sourcePlanBaselines![0]!, projection(added), added.externalRefs).changes).toEqual([]);
});

it("rechecks later selected mutations and respects deselection", () => {
  const state = fixture(), acknowledgment = ack(state);
  const update = parse({ operationId: "later", op: "update", entity: "card", entityId: id(5), after: { title: "Later divergence" } });
  expect(() => resolveOperations(state, [acknowledgment, update], supply)).toThrow("diverge");
  expect(resolveOperations(state, [acknowledgment, update], supply, [acknowledgment.operationId]).state.cards).toEqual(state.cards);
  expect(resolveOperations(state, [acknowledgment, update], supply, []).state).toEqual(state);
});

it("refuses ordinary publication through legacy bindings without inventing synchronization history", () => {
  const state = fixture(); delete state.sourcePlanBaselines;
  const publication = parse({ operationId: "publish", op: "upsert", entity: "card", selector: { kind: "externalRef", scopeId: id(2), system: "source", externalId: "story" }, after: { storyMapId: id(2), level: "story", title: "Published Story" } });
  expect(() => resolveOperations(state, [publication], supply)).toThrow("no durable synchronization evidence");
  expect(state.sourcePlanBaselines).toBeUndefined();
});

it("captures final full Card evidence for unbound acknowledged additions after source-only same-cut writes", () => {
  const state = fixture(); state.externalRefs = []; state.sourcePlanBaselines![0]!.entries = [];
  const acknowledgment = ack(state);
  const link = parse({ operationId: "note", entityId: "note-local", op: "link", entity: "sourceLink", after: { cardId: id(5), kind: "note", note: "Reviewed source" } });
  const resolved = resolveOperations(state, [acknowledgment, link], { ...supply, ids: { note: id(30) } });
  expect(resolved.state.sourcePlanBaselines![0]!.entries[0]!.card).toEqual(resolved.state.cards[0]);
  expect(resolved.state.cards[0]).toMatchObject({ version: 2, provenance: "linked" });
  expect(resolved.state.externalRefs).toEqual([]);
  expect(resolved.operations[1]!.changes.some((change) => change.entity === "sourcePlanBaseline")).toBe(true);
});

it("distinguishes parked and hidden descendants and retains tombstones for final selected publication deletion", () => {
  const state = fixture(), baseline = state.sourcePlanBaselines![0]!;
  state.cards[0]!.parked = true;
  expect(buildPlanDriftReport(baseline, projection(state), state.externalRefs).changes[0]).toMatchObject({ kinds: ["removed"], reason: "parked" });
  state.cards[0]!.parked = false;
  state.cards.push({ ...state.cards[0]!, id: id(9), key: "LSM-9", level: "activity", status: "archived" });
  state.cards[0]!.parentId = id(9);
  expect(buildPlanDriftReport(baseline, projection(state), state.externalRefs).changes[0]).toMatchObject({ kinds: ["removed"], reason: "hidden" });
  const published = fixture();
  const publication = parse({ operationId: "publish", op: "upsert", entity: "card", selector: { kind: "externalRef", scopeId: id(2), system: "source", externalId: "story" }, after: { storyMapId: id(2), level: "story", title: "Published Story" } });
  const deletion = parse({ operationId: "delete", op: "delete", entity: "card", entityId: id(5), after: { strategy: "unassign" } });
  const final = resolveOperations(published, [publication, deletion], supply).state;
  expect(final.sourcePlanBaselines![0]!.entries[0]).toMatchObject({ cardId: id(5), card: null, active: false, binding: null });
  expect(buildPlanDriftReport(final.sourcePlanBaselines![0]!, projection(final), final.externalRefs).changes).toEqual([]);
});


it("keeps strict public baseline checks and independent evidence when calculating from validated persistence", () => {
  const state = fixture(), baseline = state.sourcePlanBaselines![0]!;
  state.cards[0]!.title = "Human edit";
  const validated = validateSourcePlanBaseline(baseline), current = projection(state);
  const before = structuredClone({ baseline, validated, current, bindings: state.externalRefs });
  const report = buildPlanDriftReportFromValidatedBaseline(validated, current, state.externalRefs);
  expect(report).toEqual(buildPlanDriftReport(baseline, current, state.externalRefs));
  const entry = report.changes[0]!;
  entry.before!.card!.title = "Mutated report old Card";
  entry.before!.identity.title = "Mutated report old identity";
  entry.before!.binding!.externalId = "mutated-old-binding";
  entry.after!.card!.title = "Mutated report current Card";
  entry.after!.binding!.externalId = "mutated-current-binding";
  expect({ baseline, validated, current, bindings: state.externalRefs }).toEqual(before);
  const unsupported = { ...baseline, schemaVersion: 2 };
  expect(() => buildPlanDriftReport(unsupported as typeof baseline, current, state.externalRefs)).toThrow();
  const foreign = structuredClone(baseline); foreign.entries[0]!.card!.storyMapId = id(99);
  expect(() => buildPlanDriftReport(foreign, current, state.externalRefs)).toThrow("foreign Card");
  const duplicate = { ...baseline, entries: [...baseline.entries, ...baseline.entries] };
  expect(() => buildPlanDriftReport(duplicate, current, state.externalRefs)).toThrow("duplicate");
});
