import { randomUUID } from "node:crypto";
import { changeOperationSchema, DomainError, type ActorContext, type ChangeOperation, type ChangeSetCommandResponse } from "@storymapper/contracts";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { executeChangeSetCommand } from "@storymapper/server/application/changeset/changeset-command";

export type DomainCommandResponse<A extends ActorContext, Response> = A["actorType"] extends "human" ? Response : Response | ChangeSetCommandResponse;

export function domainOperation(entity: ChangeOperation["entity"], op: ChangeOperation["op"], entityId: string | undefined, after: unknown, baseVersion?: number): ChangeOperation {
  return changeOperationSchema.parse({ operationId: randomUUID(), entity, op, ...(entityId ? { entityId } : {}), after, ...(baseVersion !== undefined ? { baseVersion } : {}) });
}

export function nonHumanCommand(deps: ApplicationDeps, actor: ActorContext, projectId: string, title: string, operations: ChangeOperation[], apply?: boolean): ChangeSetCommandResponse {
  return executeChangeSetCommand(deps, actor, { id: randomUUID(), projectId, title, source: actor.actorType === "github" ? "github" : "mcp", operations, createdAt: new Date().toISOString() }, { ...(apply !== undefined ? { apply } : {}) });
}

export function proposeDomainCommand(deps: ApplicationDeps, actor: ActorContext, projectId: string, title: string, operations: ChangeOperation[], apply?: boolean): ChangeSetCommandResponse {
  if (apply === true) throw new DomainError("validation", "Customization changes require a proposal followed by separate approval and Apply.");
  return nonHumanCommand(deps, actor, projectId, title, operations, false);
}

export function domainRoot(deps: ApplicationDeps, entity: "card" | "release" | "persona" | "roadmap" | "storyMap", id: string): { projectId: string; version: number } {
  const repository = deps.repository;
  if (entity === "storyMap") return repository.getStoryMapOrThrow(id);
  const value = entity === "card" ? repository.getCard(id) : entity === "release" ? repository.getRelease(id) : entity === "persona" ? repository.getPersona(id) : repository.getRoadmap(id);
  if (!value) throw new DomainError("not_found", `${entity} not found.`);
  return { version: value.version, projectId: "projectId" in value ? value.projectId : repository.getStoryMapOrThrow(value.storyMapId).projectId };
}
