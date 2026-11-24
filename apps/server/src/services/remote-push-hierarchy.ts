import { randomUUID } from "node:crypto";
import { parseWorkItemLocator, remoteWorkItemIdentity, type RemotePushEffect, type RemotePushIssueReference } from "@storymapper/contracts";
import { requireRemoteItem, type RemoteWorkItem } from "@storymapper/github";
import { assertRemotePushTarget } from "@storymapper/server/services/remote-push-context";
import type { Planning } from "@storymapper/server/services/remote-push-plan";

type Reference = RemotePushIssueReference;
type Relationship = Extract<RemotePushEffect, { kind: "relationship" }>;

export async function prepareHierarchy(planning: Planning): Promise<void> {
  if (planning.conflict && planning.conflict.conflict.field !== "parent") return;
  const removals: Relationship[] = [];
  const additions: Relationship[] = [];
  for (const source of planning.source.items) {
    const card = planning.snapshot.cards.find((entry) => entry.id === source.cardId)!;
    const childRemote = planning.remoteIssues.get(card.id);
    const child = reference(planning, card.id, childRemote);
    if (!child) { planning.blockers.push(`Cannot resolve the Issue for ${card.key}.`); continue; }
    const openConflict = planning.context.repository.listOpenSyncConflicts(planning.input.storyMapId).some((conflict) => conflict.cardId === card.id && conflict.connectionId === planning.context.connection.id && conflict.field === "parent" && conflict.id !== planning.conflict?.conflict.id);
    if (openConflict) { planning.blockers.push(`Resolve the open parent conflict for ${card.key} before pushing.`); continue; }
    const desired = await desiredParent(planning, card.id);
    if (desired === undefined) continue;
    const current = observedParent(planning, childRemote, card.key);
    if (current === undefined) continue;
    if (planning.conflict?.conflict.field === "parent") {
      if (JSON.stringify(planning.input.reviewed?.localValue) !== JSON.stringify(number(desired)) || JSON.stringify(planning.input.reviewed?.remoteValue) !== JSON.stringify(number(current))) {
        planning.blockers.push(`Parent conflict values for ${card.key} changed; review them again.`);
        continue;
      }
    }
    const link = planning.snapshot.remoteWorkItemLinks.find((row) => row.cardId === card.id && row.connectionId === planning.context.connection.id);
    if (childRemote && link && !link.baseline) { planning.blockers.push(`Parent baseline for ${card.key} is incomplete; pull before reviewing hierarchy.`); continue; }
    if (same(current, desired)) {
      if (link && (!link.baseline?.parentKnown || link.remoteParentNumber !== number(current) || link.parentOverrideLocal || planning.conflict)) planning.items.push({ id: randomUUID(), kind: "relationship", action: "acknowledge", entityId: card.id, cardKey: card.key, cardTitle: card.title, marker: `relationship:${card.id}`, managedLabels: [], labelAdditions: [], labelRemovals: [], child, expectedParent: current, resultingParent: current, dependencies: child.kind === "create" ? [child.itemId] : [] });
      continue;
    }
    if (childRemote && link && !link.baseline?.parentKnown) { planning.blockers.push(`Parent baseline for ${card.key} is unknown; review the current relationship before changing it.`); continue; }
    if (childRemote && !planning.conflict && (!link || link.remoteParentNumber === undefined || link.remoteParentNumber !== number(current))) {
      planning.blockers.push(`Parent conflict for ${card.key}: the remote parent changed since its acknowledged baseline.`);
      continue;
    }
    if (same(child, desired)) { planning.blockers.push(`Card ${card.key} cannot be its own parent.`); continue; }
    const common = { entityId: card.id, cardKey: card.key, cardTitle: card.title, marker: `relationship:${card.id}`, managedLabels: [], labelAdditions: [], labelRemovals: [] };
    const childDeps = child.kind === "create" ? [child.itemId] : [];
    let removal: Relationship | undefined;
    if (current) {
      removal = { ...common, id: randomUUID(), kind: "relationship", action: "remove", child, expectedParent: current, resultingParent: null, dependencies: childDeps };
      removals.push(removal);
    }
    if (desired) additions.push({ ...common, id: randomUUID(), kind: "relationship", action: "add", child, expectedParent: null, resultingParent: desired, dependencies: [...childDeps, ...(desired.kind === "create" ? [desired.itemId] : []), ...(removal ? [removal.id] : [])] });
  }
  additions.sort((a, b) => depth(planning, a.entityId) - depth(planning, b.entityId));
  for (const addition of additions) {
    const card = planning.snapshot.cards.find((entry) => entry.id === addition.entityId)!;
    const parentAddition = additions.find((entry) => entry.entityId === card.parentId);
    if (parentAddition) addition.dependencies.push(parentAddition.id);
  }
  planning.items.push(...removals, ...additions);
}

function reference(planning: Planning, cardId: string, remote?: RemoteWorkItem): Reference | undefined {
  if (remote?.remoteNumber) return { kind: "existing", remoteNumber: remote.remoteNumber, url: remote.url };
  const create = planning.items.find((effect) => effect.kind === "issue" && effect.entityId === cardId && effect.action === "create");
  const card = planning.snapshot.cards.find((row) => row.id === cardId);
  return create && card ? { kind: "create", itemId: create.id, cardKey: card.key, cardTitle: card.title } : undefined;
}

async function desiredParent(planning: Planning, cardId: string): Promise<Reference | null | undefined> {
  const card = planning.snapshot.cards.find((entry) => entry.id === cardId)!;
  const override = planning.input.parentIssueNumber;
  if (override !== undefined) return lookupParent(planning, String(override));
  if (!card.parentId) return null;
  const parent = planning.snapshot.cards.find((entry) => entry.id === card.parentId);
  if (!parent || depth(planning, cardId) < 0) { planning.blockers.push(`Card ${card.key} has an invalid or cyclic parent.`); return undefined; }
  const selected = reference(planning, parent.id, planning.remoteIssues.get(parent.id));
  if (selected) return selected;
  const link = planning.snapshot.remoteWorkItemLinks.find((row) => row.cardId === parent.id && row.connectionId === planning.context.connection.id);
  if (!link) { planning.blockers.push(`Parent ${parent.key} of ${card.key} has no Issue binding or selected creation.`); return undefined; }
  return lookupParent(planning, link.remoteId, link.externalRefId);
}

async function lookupParent(planning: Planning, remoteId: string, externalRefId?: string): Promise<Reference> {
  const remote = requireRemoteItem(await planning.provider.getRemoteItem(planning.auth.connection, planning.auth.auth, remoteId));
  planning.check();
  assertRemotePushTarget(planning.context, "issue", remote, remoteId, externalRefId);
  if (!remote.remoteNumber) throw new Error("Parent Issue has no numeric identity.");
  return { kind: "existing", remoteNumber: remote.remoteNumber, url: remote.url };
}

function observedParent(planning: Planning, remote: RemoteWorkItem | undefined, key: string): Reference | null | undefined {
  if (!remote) return null;
  const parent = remote.parentEvidence;
  if (parent === undefined) { planning.blockers.push(`Parent observation for ${key} is incomplete.`); return undefined; }
  if (parent === null) return null;
  const repository = remoteWorkItemIdentity(planning.context.connection, remote).repo;
  const locator = parseWorkItemLocator(planning.context.connection.provider, parent.url);
  if (parent.repository.toLowerCase() !== repository.toLowerCase() || !locator || locator.resource !== "issues" || locator.repo !== repository || locator.number !== parent.number) { planning.blockers.push(`Parent of ${key} has an invalid or foreign identity.`); return undefined; }
  return { kind: "existing", remoteNumber: parent.number, url: parent.url };
}

function number(ref: Reference | null): number | null { return ref?.kind === "existing" ? ref.remoteNumber : null; }
function same(left: Reference | null, right: Reference | null): boolean {
  return left === null || right === null ? left === right : left.kind === "existing" && right.kind === "existing" ? left.remoteNumber === right.remoteNumber && left.url === right.url : left.kind === "create" && right.kind === "create" && left.itemId === right.itemId;
}
function depth(planning: Planning, cardId: string): number {
  const seen = new Set<string>();
  let id: string | null = cardId;
  while (id) {
    if (seen.has(id)) return -1;
    seen.add(id);
    id = planning.snapshot.cards.find((card) => card.id === id)?.parentId ?? null;
  }
  return seen.size;
}
