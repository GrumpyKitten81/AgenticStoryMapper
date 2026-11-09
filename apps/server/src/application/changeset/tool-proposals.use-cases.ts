import type { ActorContext, CapabilityDescriptor, ChangeSetResponse } from "@storymapper/contracts";
import { copyStoryMapProposalRequestSchema, githubBoardProposalRequestSchema } from "@storymapper/contracts";
import { requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";

export const proposeStoryMapCopyDescriptor: CapabilityDescriptor = {
  name: "proposeStoryMapCopy", kind: "human-only", route: "POST /api/tool-proposals/copy-story-map"
};

export function proposeStoryMapCopy(deps: ApplicationDeps, actor: ActorContext, input: unknown): ChangeSetResponse {
  requireHumanActor(actor);
  const parsed = copyStoryMapProposalRequestSchema.parse(input);
  return { changeSet: deps.unitOfWork.run(actor, ({ repository }) => repository.proposeStoryMapCopy(parsed)) };
}

export const proposeGitHubBoardDescriptor: CapabilityDescriptor = {
  name: "proposeGitHubBoard", kind: "human-only", route: "POST /api/tool-proposals/github-board"
};

export function proposeGitHubBoard(deps: ApplicationDeps, actor: ActorContext, input: unknown): ChangeSetResponse {
  requireHumanActor(actor);
  const parsed = githubBoardProposalRequestSchema.parse(input);
  return { changeSet: deps.unitOfWork.run(actor, ({ repository }) => repository.proposeGitHubBoard(parsed)) };
}
