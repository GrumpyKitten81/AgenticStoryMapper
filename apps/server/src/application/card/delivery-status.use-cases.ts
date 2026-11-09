import { agentAccessEnabled } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { cardSchema, DomainError, updateDeliveryStatusRequestSchema, type ActorContext, type CapabilityDescriptor, type ChangeOperation, type ChangeSetCommandResponse, type UpdateDeliveryStatusRequest } from "@storymapper/contracts";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";

export const updateDeliveryStatusDescriptor: CapabilityDescriptor = { name: "updateDeliveryStatus", kind: "write", tool: "UpdateDeliveryStatus" };

export function updateDeliveryStatus(deps: ApplicationDeps, actor: ActorContext, input: UpdateDeliveryStatusRequest): ChangeSetCommandResponse {
  requireActor(actor);
  const request = updateDeliveryStatusRequestSchema.parse(input);
  const map = deps.repository.getStoryMapOrThrow(request.storyMapId);
  if (actor.actorType === "agent" && !agentAccessEnabled(deps.repository.getSafetySettings(map.projectId))) throw new DomainError("disabled", "Agent access is disabled for this Project.");
  const refs = deps.repository.listExternalRefsForStoryMap(map.id);
  const cards = new Map(deps.repository.listCards(map.id).map((card) => [card.id, card]));
  const statuses = new Set(deps.repository.listWorkflowStatuses(map.projectId, map.id).map((status) => status.name));
  const resolved = new Set<string>();
  const invalidTargets: Array<{ index: number; system: string; externalId: string; status: string; reasons: string[] }> = [];
  const operations: ChangeOperation[] = [];
  for (const [index, target] of request.cards.entries()) {
    const ref = refs.find((ref) => ref.entityType === "card" && ref.scopeId === map.id && ref.system === target.system && ref.externalId === target.externalId);
    const card = ref && cards.get(ref.entityId);
    const reasons = [];
    if (!card) reasons.push("External reference does not resolve to a Card in this Story Map.");
    if (!statuses.has(target.status)) reasons.push("Workflow Status name is not configured for this Story Map.");
    if (card && resolved.has(card.id)) reasons.push("Card is addressed more than once.");
    if (card) resolved.add(card.id);
    if (reasons.length) invalidTargets.push({ index, ...target, reasons });
    else operations.push({ operationId: randomUUID(), entity: "card", entityId: card!.id, op: "update", baseVersion: ref!.syncedVersion,
      selector: { kind: "externalRef", scopeId: map.id, system: target.system, externalId: target.externalId }, before: cardSchema.parse(Object.fromEntries(Object.entries(card!).filter(([key, value]) => value !== null || key === "parentId" || key === "releaseId"))), after: { status: target.status } });
  }
  if (invalidTargets.length) throw new DomainError("validation", "Delivery status targets are invalid.", { invalidTargets });
  return executeChangeSetCommand(deps, actor, { id: randomUUID(), projectId: map.projectId, title: "Update delivery status", source: "mcp", operations, createdAt: new Date().toISOString() }, { ...(request.apply !== undefined ? { apply: request.apply } : {}) });
}
