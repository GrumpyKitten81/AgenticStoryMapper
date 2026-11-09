import type { GettingStartedChecklist } from "@storymapper/contracts";
import { sampleStoryMapTemplate } from "@storymapper/core";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function initializeSampleFixture(repository: StoryMapperRepository<"transaction">, projectId: string): GettingStartedChecklist {
  const state = repository.getGettingStartedChecklist(projectId);
  if (state.sampleStoryMapId) return state;
  const sample = repository.createStoryMapFromTemplate(projectId, sampleStoryMapTemplate, true);
  repository.gettingStarted.initialize(projectId, sample.id);
  return repository.getGettingStartedChecklist(projectId);
}
