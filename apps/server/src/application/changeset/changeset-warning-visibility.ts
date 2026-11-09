import type { ActorContext, StoredChangeSet } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db";
import { canReadChangeSet } from "@storymapper/server/mcp/tools/project-scopes";

export function visibleChangeSetWarnings<T extends StoredChangeSet>(repository: StoryMapperRepository, actor: ActorContext, changeSet: T): T {
  if (actor.actorType !== "agent" || !changeSet.warnings?.length) return changeSet;
  return { ...changeSet, warnings: changeSet.warnings.filter((warning) => {
    const previous = repository.getChangeSet(warning.priorChangeSetId);
    return previous && canReadChangeSet(repository, previous);
  }) };
}
