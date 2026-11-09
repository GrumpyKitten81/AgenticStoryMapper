import { createHash } from "node:crypto";
import type { IncomingGitHubCommandResponse, ChangeSetCommandResponse, ActorContext, CapabilityDescriptor, PlanWorkItemSyncRequest, ApplyWorkItemSyncRequest, ApplyWorkItemSyncResponse, ImportWorkItemsRequest, ImportWorkItemsResponse, SyncWorkItemsRequest, PullStoryMapWorkItemsRequest, PullStoryMapWorkItemsResponse, SyncPlan, RemotePushPlan, WorkItemSyncHealthReport } from "@storymapper/contracts";
import { buildWorkItemSyncHealthReport } from "@storymapper/core";
import { requireActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import * as sync from "@storymapper/server/services/work-item-sync";
import type { LookupGitHubTicketRequest, LookupGitHubTicketResponse, ImportGitHubTicketRequest, ImportGitHubTicketResponse } from "@storymapper/contracts";
import { lookupGitHubTicketCommand, importGitHubTicketCommand } from "@storymapper/server/application/sync/github-ticket-command";

export const lookupGitHubTicketDescriptor: CapabilityDescriptor = { name: "lookupGitHubTicket", kind: "read", route: "POST /api/sync/work-items/lookup-ticket", tool: "LookupGitHubTicket" };
export function lookupGitHubTicket(deps: ApplicationDeps, actor: ActorContext, body: LookupGitHubTicketRequest): Promise<LookupGitHubTicketResponse> {
  requireActor(actor);
  return lookupGitHubTicketCommand(deps, actor, body);
}

export const importGitHubTicketDescriptor: CapabilityDescriptor = { name: "importGitHubTicket", kind: "write", route: "POST /api/sync/work-items/import-ticket", tool: "ImportGitHubTicket" };
export function importGitHubTicket(deps: ApplicationDeps, actor: ActorContext, body: ImportGitHubTicketRequest): Promise<ImportGitHubTicketResponse> {
  requireActor(actor);
  return importGitHubTicketCommand(deps, actor, body);
}

export const planWorkItemsDescriptor: CapabilityDescriptor = { name: "planWorkItems", kind: "write", route: "POST /api/sync/work-items/plan", tool: "PlanWorkItems" };
export function planWorkItems(deps: ApplicationDeps, actor: ActorContext, body: PlanWorkItemSyncRequest): Promise<SyncPlan | RemotePushPlan> {
  requireActor(actor);
  return sync.planWorkItems(deps.repository, deps.unitOfWork, actor, { ...body, localOrigin: deps.localOrigin?.() });
}

export const pushWorkItemsDescriptor: CapabilityDescriptor = { name: "pushWorkItems", kind: "write", tool: "PushCardsToGitHub", route: "POST /api/sync/work-items/push" };
export function pushWorkItems(deps: ApplicationDeps, actor: ActorContext, body: Omit<ApplyWorkItemSyncRequest, "confirm">): Promise<ApplyWorkItemSyncResponse | ChangeSetCommandResponse> {
  requireActor(actor);
  return sync.pushWorkItems(deps.repository, deps.unitOfWork, actor, { ...body, localOrigin: deps.localOrigin?.() });
}

export const importWorkItemsDescriptor: CapabilityDescriptor = { name: "importWorkItems", kind: "write", tool: "ImportGitHubIssues", route: "POST /api/sync/work-items/import" };
export function importWorkItems(deps: ApplicationDeps, actor: ActorContext, body: ImportWorkItemsRequest): Promise<IncomingGitHubCommandResponse> {
  requireActor(actor);
  return sync.importWorkItems(deps.repository, deps.unitOfWork, actor, body);
}

export const syncWorkItemsDescriptor: CapabilityDescriptor = { name: "syncWorkItems", kind: "write", tool: "SyncGitHubLinks", route: "POST /api/sync/work-items/sync" };
export function syncWorkItems(deps: ApplicationDeps, actor: ActorContext, body: Omit<SyncWorkItemsRequest, "confirm">): Promise<IncomingGitHubCommandResponse> {
  requireActor(actor);
  return sync.syncWorkItems(deps.repository, deps.unitOfWork, actor, { ...body, localOrigin: deps.localOrigin?.() });
}

export const pullStoryMapWorkItemsDescriptor: CapabilityDescriptor = { name: "pullStoryMapWorkItems", kind: "write", tool: "PullStoryMapGitHubLinks", route: "POST /api/sync/work-items/pull-story-map" };
export function pullStoryMapWorkItems(deps: ApplicationDeps, actor: ActorContext, body: Omit<PullStoryMapWorkItemsRequest, "confirm">): Promise<IncomingGitHubCommandResponse> {
  requireActor(actor);
  return sync.pullStoryMapWorkItems(deps.repository, deps.unitOfWork, actor, { ...body, localOrigin: deps.localOrigin?.() });
}

export const getWorkItemSyncHealthDescriptor: CapabilityDescriptor = { name: "getWorkItemSyncHealth", kind: "read", route: "GET /api/sync/work-items/health", tool: "GetWorkItemSyncHealth" };
export function getWorkItemSyncHealth(deps: ApplicationDeps, actor: ActorContext, storyMapId: string): WorkItemSyncHealthReport {
  requireActor(actor);
  return buildWorkItemSyncHealthReport(deps.repository.getWorkItemSyncHealthData(storyMapId), (text) => createHash("sha256").update(text).digest("hex"));
}
