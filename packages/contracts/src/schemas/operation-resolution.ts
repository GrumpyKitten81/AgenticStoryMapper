import type { SourcePlanBaseline } from "@storymapper/contracts/schemas/plan-drift";
import type { CardDependency, SyncRun, SyncConflict, Annotation, CardAnnotationLink, CardAttachment, CardPersonaLink, Roadmap, RoadmapColumn, RoadmapSwimlane, RoadmapCard, RoadmapReference, StoryTemplate, WorkflowStatus, RemoteWorkItemLink, Card, CardSourceLink, ConnectorConnection, ExternalRef, GitHubLink, Persona, ProductContext, Project, Release, SourceChunk, SourceDocument, StoryMap } from "@storymapper/contracts/schemas/domain";

export interface OperationSnapshot {
  retainedGithubRefProjects?: Readonly<Record<string, string>>;
  sourcePlanBaselines?: SourcePlanBaseline[];
  removedMapCustomizationReferences?: { personas: string[]; annotations: string[] };
  projectId: string;
  projects: Project[];
  storyMaps: StoryMap[];
  // DESIGN: Persisted insertion order breaks ties in SQLite position/createdAt ordering.
  cards: Card[];
  releases: Release[];
  personas: Persona[];
  productContexts: ProductContext[];
  roadmaps: Roadmap[];
  roadmapColumns: RoadmapColumn[];
  roadmapSwimlanes: RoadmapSwimlane[];
  roadmapCards: RoadmapCard[];
  roadmapReferences: RoadmapReference[];
  annotations: Annotation[];
  workflowStatuses: WorkflowStatus[];
  storyTemplates: StoryTemplate[];
  attachments: CardAttachment[];
  cardPersonas: CardPersonaLink[];
  cardAnnotations: CardAnnotationLink[];
  cardDependencies: CardDependency[];
  remoteWorkItemLinks: RemoteWorkItemLink[];
  mapFingerprints?: Readonly<Record<string, string>>;
  externalRefs: ExternalRef[];
  sourceDocuments: SourceDocument[];
  sourceChunks: SourceChunk[];
  sourceLinks: CardSourceLink[];
  githubLinks: GitHubLink[];
  connections: ConnectorConnection[];
  syncConflicts?: SyncConflict[];
  syncRuns?: SyncRun[];
}

export interface OperationSupply {
  syncTextHashes?: Readonly<Record<string, string>>;
  createdAt: string;
  ids: Readonly<Record<string, string>>;
  bulkRelationshipIds?: Readonly<Record<string, Readonly<Record<string, { persona?: string; annotation?: string }>>>>;
  externalRefIds: Readonly<Record<string, string>>;
  creationOrigin: Card["creationOrigin"];
  preparedSourceImports?: Readonly<Record<string, { document: SourceDocument; chunks: SourceChunk[] }>>;
  boardIds?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  boardHashes?: Readonly<Record<string, Readonly<Record<string, { titleHash: string; bodyHash: string }>>>>;
  copyIds?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  roadmapSeedIds?: Readonly<Record<string, { columns: readonly [string, string, string]; swimlane: string }>>;
}

type ChangeFor<E extends string, T> = { entity: E; entityId: string; before?: T; after?: T; implicit?: "unarchive" };
export type ResolvedEntityChange = (ChangeFor<"sourcePlanBaseline", SourcePlanBaseline> & { evidenceScope?: "addressedEntries" }) | ChangeFor<"cardDependency", CardDependency> | ChangeFor<"syncRun", SyncRun> | ChangeFor<"syncConflict", SyncConflict> | ChangeFor<"connection", ConnectorConnection> | ChangeFor<"roadmap", Roadmap> | ChangeFor<"roadmapColumn", RoadmapColumn> | ChangeFor<"roadmapSwimlane", RoadmapSwimlane> | ChangeFor<"roadmapCard", RoadmapCard> | ChangeFor<"roadmapReference", RoadmapReference> | ChangeFor<"annotation", Annotation> | ChangeFor<"workflowStatus", WorkflowStatus> | ChangeFor<"storyTemplate", StoryTemplate> | ChangeFor<"productContext", ProductContext> | ChangeFor<"attachment", CardAttachment> | ChangeFor<"cardPersona", CardPersonaLink> | ChangeFor<"cardAnnotation", CardAnnotationLink> | ChangeFor<"remoteWorkItemLink", RemoteWorkItemLink> | ChangeFor<"sourceDocument", SourceDocument> | ChangeFor<"sourceChunk", SourceChunk> | ChangeFor<"storyMap", StoryMap> | ChangeFor<"card", Card> | ChangeFor<"release", Release> | ChangeFor<"persona", Persona> | ChangeFor<"sourceLink", CardSourceLink> | ChangeFor<"externalRef", ExternalRef>;
export interface OperationOwner { entity: "project" | "productContext" | "roadmap" | "storyMap" | "card" | "release" | "persona"; entityId: string; projectId: string; }
export interface OperationDescription { operationId: string; index: number; kind: string; label: string; status: "changed" | "unchanged"; dependencies: string[]; owners: OperationOwner[]; changes: ResolvedEntityChange[]; }
export interface OperationResolution extends OperationDescription { state: OperationSnapshot; }
export interface ChangeSetResolution { operations: OperationResolution[]; selectedOperationIds: string[]; state: OperationSnapshot; }
