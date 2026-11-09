import { agentAccessEnabled } from "@storymapper/core";
import { actorContextSchema, DomainError, type ActorContext, type McpToolName } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db";
import { resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";

export const localHumanActor = { actorType: "human", actorId: "local-user" } as const satisfies ActorContext;

export function requireActor(actor: ActorContext): void {
  actorContextSchema.parse(actor);
}

export function requireHumanActor(actor: ActorContext): void {
  requireActor(actor);
  if (actor.actorType !== "human") throw new DomainError("protected", "This capability is human-only.");
}

export function cardCreationOrigin(actor: ActorContext): "human" | "mcp" {
  return actor.actorType === "agent" ? "mcp" : "human";
}

export function requireAgentToolAccess(repository: StoryMapperRepository, actor: ActorContext, tool: McpToolName, input: unknown): void {
  requireActor(actor);
  if (actor.actorType !== "agent") return;
  for (const projectId of resolveToolProjectIds(repository, tool, input)) {
    if (!agentAccessEnabled(repository.getSafetySettings(projectId))) throw new DomainError("disabled", "Agent access is disabled for this Project.");
  }
}
