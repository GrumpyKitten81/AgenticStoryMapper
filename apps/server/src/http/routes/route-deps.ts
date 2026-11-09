import type { StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import type { ApplicationDeps } from "@storymapper/server/application/deps";

export interface RouteDeps {
  repository: StoryMapperRepository;
  unitOfWork: UnitOfWork;
  databasePath: string;
  localOrigin?: () => string;
}

export function toApplicationDeps(deps: RouteDeps): ApplicationDeps {
  return { repository: deps.repository, unitOfWork: deps.unitOfWork, ...(deps.localOrigin ? { localOrigin: deps.localOrigin } : {}) };
}
