import type { StoryMapperRepository, UnitOfWork } from "@storymapper/db";

export interface ApplicationDeps {
  localOrigin?: () => string;
  repository: StoryMapperRepository;
  unitOfWork: UnitOfWork;
}
