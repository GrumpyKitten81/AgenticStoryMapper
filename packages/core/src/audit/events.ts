import type { ActivityEvent, ActorType } from "@storymapper/contracts";

export function createActivityEvent(input: {
  id: string;
  projectId: string | null;
  actor: string;
  actorType: ActorType;
  mcpSessionId?: string | undefined;
  action: string;
  affectedEntityType?: string;
  affectedEntityId?: string;
  before?: unknown;
  after?: unknown;
  externalCallId?: string;
  createdAt: string;
}): ActivityEvent {
  return {
    id: input.id,
    projectId: input.projectId,
    actor: input.actor,
    actorType: input.actorType,
    mcpSessionId: input.mcpSessionId,
    action: input.action,
    affectedEntityType: input.affectedEntityType,
    affectedEntityId: input.affectedEntityId,
    before: input.before,
    after: input.after,
    externalCallId: input.externalCallId,
    createdAt: input.createdAt
  };
}
