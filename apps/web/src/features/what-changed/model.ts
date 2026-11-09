import { activitySeenStateSchema, type ActivitySeenState } from "@storymapper/contracts";
import type { ActivityAffectedCard, ActivityChange, ActivityChangesResponse, ActivityProjectTarget } from "@storymapper/contracts";
import { whatChangedStrings as strings } from "@storymapper/ui-strings";

export const seenStateSchema = activitySeenStateSchema;
export type SeenState = ActivitySeenState;
export function reconcileSeen(state: SeenState | null, snapshot: ActivityChangesResponse): SeenState {
  return state?.epoch === snapshot.epoch ? state : { epoch: snapshot.epoch, throughSeq: snapshot.floor, acknowledgedSeqs: [], targetAcknowledgements: {} };
}
export function unseenEvents(state: SeenState, events: ActivityChange[]): ActivityChange[] {
  const acknowledged = new Set(state.acknowledgedSeqs);
  return events.filter((event) => event.seq > state.throughSeq && !acknowledged.has(event.seq));
}
export function acknowledge(state: SeenState, snapshot: ActivityChangesResponse, sequences: number[]): SeenState {
  if (state.epoch !== snapshot.epoch) throw new Error(strings.projectChanged);
  const acknowledged = new Set([...state.acknowledgedSeqs, ...sequences]);
  let throughSeq = state.throughSeq;
  for (const event of snapshot.events) {
    if (event.seq <= throughSeq) continue;
    if (!acknowledged.has(event.seq)) break;
    throughSeq = event.seq;
  }
  if (snapshot.events.every((event) => event.seq <= throughSeq)) throughSeq = Math.max(throughSeq, snapshot.highWater);
  return { ...state, epoch: state.epoch, throughSeq, acknowledgedSeqs: [...acknowledged].filter((seq) => seq > throughSeq).sort((a, b) => a - b) };
}
export function readSeen(storage: Pick<Storage, "getItem">, projectId: string): SeenState | null {
  const value = storage.getItem(`storymapper:what-changed:${projectId}`);
  return value === null ? null : seenStateSchema.parse(JSON.parse(value));
}
export function writeSeen(storage: Pick<Storage, "setItem">, projectId: string, state: SeenState): void {
  storage.setItem(`storymapper:what-changed:${projectId}`, JSON.stringify(seenStateSchema.parse(state)));
}

export function isSeenStorageError(error: unknown): boolean {
  return error instanceof DOMException || error instanceof SyntaxError || error instanceof Error && error.name === "ZodError";
}

export interface ChangeGroup {
  target: string;
  card?: ActivityAffectedCard;
  project?: ActivityProjectTarget;
  events: ActivityChange[];
}
export interface TargetReceipt { target: string; sequences: number[]; }

export function isSubstantive(event: ActivityChange): boolean {
  if (event.action === "tool_call") return Boolean(event.toolCall && event.toolCall.outcome !== "ok");
  if (event.action.startsWith("changeSet.")) return event.action === "changeSet.operation.applied" && Boolean(event.cards?.length || event.projectTargets?.length);
  return !["cardVersion", "sourcePlanBaseline", "syncRun", "syncConflict", "projectSettings"].includes(event.affectedEntityType ?? "") || event.action === "settings.safetyUpdated";
}

function targets(event: ActivityChange): string[] {
  const projected = [...(event.cards ?? []).map((card) => `card:${card.id}`), ...(event.projectTargets ?? []).map((target) => `project:${target.subject.type}:${target.subject.id}`)];
  return projected.length ? projected : [`project:${event.affectedEntityType ?? "project"}:${event.affectedEntityId ?? event.id}`];
}

export function targetIsUnread(state: SeenState, event: ActivityChange, target: string): boolean {
  return event.seq > state.throughSeq && !state.acknowledgedSeqs.includes(event.seq) && !(state.targetAcknowledgements[target] ?? []).includes(event.seq);
}

export function groupChanges(state: SeenState, events: ActivityChange[], storyMapId?: string): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  for (const event of events.filter(isSubstantive)) {
    for (const target of targets(event)) {
      if (!targetIsUnread(state, event, target)) continue;
      const card = event.cards?.find((item) => target === `card:${item.id}`);
      const project = event.projectTargets?.find((item) => target === `project:${item.subject.type}:${item.subject.id}`);
      if (storyMapId && (!card || (card.navigation?.storyMapId ?? card.storyMapId) !== storyMapId)) continue;
      const group = groups.get(target) ?? { target, ...(card ? { card } : {}), ...(project ? { project } : {}), events: [] };
      if (project && (!group.events.length || event.seq > group.events[0]!.seq)) group.project = project;
      if (card && (!group.events.length || event.seq > group.events[0]!.seq)) group.card = { ...card, title: card.title ?? group.card?.title, key: card.key ?? group.card?.key };
      else if (card && group.card) group.card = { ...group.card, title: group.card.title ?? card.title, key: group.card.key ?? card.key };
      group.events.push(event);
      group.events.sort((a, b) => b.seq - a.seq);
      groups.set(target, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.events[0]!.seq - a.events[0]!.seq);
}

export function captureGroups(groups: ChangeGroup[]): TargetReceipt[] {
  return groups.map((group) => ({ target: group.target, sequences: group.events.map((event) => event.seq) }));
}

export function acknowledgeTargets(state: SeenState, snapshot: ActivityChangesResponse, receipts: TargetReceipt[]): SeenState {
  if (state.epoch !== snapshot.epoch) throw new Error(strings.projectChanged);
  const targetAcknowledgements = { ...state.targetAcknowledgements };
  for (const { target, sequences } of receipts) targetAcknowledgements[target] = [...new Set([...(targetAcknowledgements[target] ?? []), ...sequences])].sort((a, b) => a - b);
  const next = { ...state, targetAcknowledgements };
  const completed = snapshot.events.filter((event) => !isSubstantive(event) || targets(event).every((target) => !targetIsUnread(next, event, target))).map((event) => event.seq);
  const compacted = acknowledge(next, snapshot, completed);
  compacted.targetAcknowledgements = Object.fromEntries(Object.entries(targetAcknowledgements).flatMap(([target, seqs]) => {
    const retained = seqs.filter((seq) => seq > compacted.throughSeq && !compacted.acknowledgedSeqs.includes(seq));
    return retained.length ? [[target, retained]] : [];
  }));
  return compacted;
}
