import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { ActivityChange, ActivityChangesResponse } from "@storymapper/contracts";
import { acknowledge, acknowledgeTargets, captureGroups, groupChanges, reconcileSeen, unseenEvents, readSeen, writeSeen } from "@storymapper/web/features/what-changed/model";

const epoch = randomUUID();
function event(seq: number, actor: string): ActivityChange { return { id: randomUUID(), projectId: randomUUID(), seq, actorType: "agent", actor, action: "card.updated", createdAt: "2026-10-15T10:00:00Z" }; }
const snapshot: ActivityChangesResponse = { epoch, floor: 0, highWater: 22, nextAfterSeq: null, events: [event(20, "A"), event(21, "B"), event(22, "A")] };
it("persists sparse actor acknowledgement without jumping over another actor, then compacts observed gaps", () => {
  const state = reconcileSeen(null, snapshot);
  const marked = acknowledge(state, snapshot, [20, 22]);
  expect(marked).toEqual({ epoch, throughSeq: 20, acknowledgedSeqs: [22], targetAcknowledgements: {} });
  expect(unseenEvents(marked, snapshot.events).map((event) => event.actor)).toEqual(["B"]);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  writeSeen(storage, "project-a", marked);
  expect(readSeen(storage, "project-a")).toEqual(marked);
  expect(readSeen(storage, "project-b")).toBeNull();
  expect(acknowledge(marked, snapshot, [21])).toEqual({ epoch, throughSeq: 22, acknowledgedSeqs: [], targetAcknowledgements: {} });
});
it("all seen pins the observed cut and epoch changes clear obsolete acks at the Restore floor", () => {
  const state = acknowledge(reconcileSeen(null, snapshot), snapshot, snapshot.events.map((event) => event.seq));
  expect(unseenEvents(state, [...snapshot.events, event(23, "B")])).toHaveLength(1);
  const restored = { ...snapshot, epoch: randomUUID(), floor: 10, highWater: 12, events: [event(12, "B")] };
  expect(reconcileSeen(state, restored)).toEqual({ epoch: restored.epoch, throughSeq: 10, acknowledgedSeqs: [], targetAcknowledgements: {} });
  expect(() => acknowledge(state, restored, [12])).toThrow("Project changed");
});

it("groups by Card, filters Map scope and noise, and keeps multi-Card receipts target-specific across concurrent arrivals", () => {
  const map = randomUUID(), otherMap = randomUUID(), first = randomUUID(), second = randomUUID();
  const bulk = { ...event(20, "A"), action: "changeSet.operation.applied", cards: [{ id: first, title: "Same title", key: "ONE-1", storyMapId: map }, { id: second, title: "Same title", key: "TWO-1", storyMapId: otherMap }] };
  const updated = { ...event(22, "B"), cards: [bulk.cards[0]!] };
  const wrapper = { ...event(21, "A"), action: "changeSet.applied" };
  const read = { ...event(23, "A"), action: "tool_call" };
  const cut = { ...snapshot, highWater: 23, events: [bulk, wrapper, updated, read] };
  const state = reconcileSeen(null, cut);
  expect(groupChanges(state, cut.events, map).map((group) => group.events.map((entry) => entry.seq))).toEqual([[22, 20]]);
  const captured = captureGroups(groupChanges(state, cut.events, map));
  const later = { ...updated, id: randomUUID(), seq: 24 };
  const current = { ...cut, highWater: 24, events: [...cut.events, later] };
  const marked = acknowledgeTargets(state, current, captured);
  expect(marked.throughSeq).toBe(0);
  expect(marked.targetAcknowledgements[`card:${first}`]).toEqual([20]);
  expect(groupChanges(marked, current.events).map((group) => [group.card!.id, group.events.map((entry) => entry.seq)])).toEqual([[first, [24]], [second, [20]]]);
  const complete = acknowledgeTargets(marked, current, captureGroups(groupChanges(marked, current.events)));
  expect(complete).toEqual({ epoch, throughSeq: 24, acknowledgedSeqs: [], targetAcknowledgements: {} });
});

it("loads previous sparse receipts without target data and resets target receipts at the Restore epoch", () => {
  const storage = { getItem: () => JSON.stringify({ epoch, throughSeq: 20, acknowledgedSeqs: [22] }) };
  expect(readSeen(storage, "project")).toEqual({ epoch, throughSeq: 20, acknowledgedSeqs: [22], targetAcknowledgements: {} });
  const state = { epoch, throughSeq: 0, acknowledgedSeqs: [], targetAcknowledgements: { "card:target": [20] } };
  expect(reconcileSeen(state, { ...snapshot, epoch: randomUUID(), floor: 22 }).targetAcknowledgements).toEqual({});
});

it("independently acknowledges Card and historical Release targets of one mixed operation", () => {
  const cardId = randomUUID(), releaseId = randomUUID();
  const operation: ActivityChange = { ...event(20, "A"), action: "changeSet.operation.applied", cards: [{ id: cardId, changes: [{ field: "releaseId" }] }], projectTargets: [{ subject: { type: "release", id: releaseId, name: "Historical Release" }, action: "release.deleted", changes: [] }] };
  const cut = { ...snapshot, highWater: 20, events: [operation] }, initial = reconcileSeen(null, cut);
  const groups = groupChanges(initial, cut.events);
  expect(groups.map((group) => group.target)).toEqual([`card:${cardId}`, `project:release:${releaseId}`]);
  const marked = acknowledgeTargets(initial, cut, captureGroups([groups[0]!]));
  expect(marked.throughSeq).toBe(0);
  expect(groupChanges(marked, cut.events).map((group) => group.project?.subject.name)).toEqual(["Historical Release"]);
  expect(acknowledgeTargets(marked, cut, captureGroups(groupChanges(marked, cut.events))).throughSeq).toBe(20);
});

it("compacts observed no-op and internal operations while retaining sparse substantive targets", () => {
  const noop = { ...event(20, "A"), action: "changeSet.operation.applied", projectTargets: [] };
  const internal = { ...noop, seq: 22, id: randomUUID(), affectedEntityType: "syncRun" };
  const card = { ...event(21, "A"), cards: [{ id: randomUUID() }] };
  const cut = { ...snapshot, events: [noop, card, internal] };
  const compacted = acknowledgeTargets(reconcileSeen(null, cut), cut, []);
  expect(compacted).toEqual({ epoch, throughSeq: 20, acknowledgedSeqs: [22], targetAcknowledgements: {} });
  expect(groupChanges(compacted, cut.events)).toHaveLength(1);
  const noise = { ...cut, events: [noop, internal] };
  expect(acknowledgeTargets(reconcileSeen(null, noise), noise, []).throughSeq).toBe(22);
});
it("reports invalid, inaccessible and failed-write storage without replacing prior stored bytes", () => {
  const corrupt = { getItem: () => '{"epoch":"invalid"}' } as unknown as Storage;
  expect(() => readSeen(corrupt, "a")).toThrow();
  const unavailable = { getItem: () => { throw new DOMException("blocked", "SecurityError"); } } as unknown as Storage;
  expect(() => readSeen(unavailable, "a")).toThrow("blocked");
  const full = { setItem: () => { throw new DOMException("full", "QuotaExceededError"); } } as unknown as Storage;
  expect(() => writeSeen(full, "a", reconcileSeen(null, snapshot))).toThrow("full");
});
