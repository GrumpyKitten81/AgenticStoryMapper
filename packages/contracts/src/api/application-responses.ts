import type { Buffer } from "node:buffer";
import type { z } from "zod";
import type { ActivityEvent, Annotation, BacklogHealthReport, Card, CardAnnotationLink, CardAttachment, CardPersonaLink, CardSourceLink, CardVersionSummary, ChangeSet, StoredChangeSet, ConnectorConnection, ExternalRef, GettingStartedChecklist, GitHubLink, Persona, ProductContext, Release, ReleaseSummaryReport, ReleaseTimelineReport, RemoteWorkItemLink, SourceCoverageReport, StoryMap, StoryMapSnapshot, SyncConflict, SyncRun } from "@storymapper/contracts/schemas/domain";
import type { customizationResponseSchema } from "@storymapper/contracts/api/card-customization";
import type { aiFunctionTemplatesResponseSchema, createAiProposalResponseSchema, deleteStoryMapParamsSchema, importSourceDocumentResponseSchema, listProjectsResponseSchema, listRoadmapsResponseSchema, listSourceDocumentsResponseSchema, listStoryMapsResponseSchema, restorePointCapabilitiesResponseSchema, safetySettingsResponseSchema } from "@storymapper/contracts/api/http";
import type { projectArchiveCapabilities } from "@storymapper/contracts/schemas/project-archive";

export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;
export type ListStoryMapsResponse = z.infer<typeof listStoryMapsResponseSchema>;
export type ListRoadmapsResponse = z.infer<typeof listRoadmapsResponseSchema>;
export type ListSourceDocumentsResponse = z.infer<typeof listSourceDocumentsResponseSchema>;
export type ImportSourceDocumentResponse = z.infer<typeof importSourceDocumentResponseSchema>;
export type CustomizationResponse = z.infer<typeof customizationResponseSchema>;
export type SafetySettingsResponse = z.infer<typeof safetySettingsResponseSchema>;
export type DeleteStoryMapParams = z.infer<typeof deleteStoryMapParamsSchema>;
export type OkResponse = { ok: boolean };
export type DeletedRootResponse = { ok: true; version: number };
export type DeleteStoryMapResponse = { deleted: true; version: number };
export type CardResponse = { card: Card };
export type CardsResponse = { cards: Card[] };
export type CardDetailsResponse = { card: Card; attachments: CardAttachment[]; history: CardVersionSummary[] };
export type CardAttachmentResponse = { attachment: CardAttachment };
export type CardAttachmentsResponse = { attachments: CardAttachment[] };
export type CardPersonaLinkResponse = { link: CardPersonaLink };
export type CardAnnotationLinkResponse = { link: CardAnnotationLink };
export type CreateCardSourceLinkResponse = { link: CardSourceLink };
export type PersonasResponse = { personas: Persona[]; externalRefs: ExternalRef[] };
export type PersonaResponse = { persona: Persona };
export type ReleaseResponse = { release: Release };
export type ReleaseDetailsResponse = { releases: Release[]; summary: ReleaseSummaryReport | undefined; timeline: ReleaseTimelineReport };
export type StoryMapResponse = { storyMap: StoryMap };
export type StoryMapDataResponse = StoryMapSnapshot & { backlogHealth: BacklogHealthReport; sourceCoverage: SourceCoverageReport };
export type ChangeSetResponse = { changeSet: ChangeSet };
export type ChangeSetsResponse = { changeSets: StoredChangeSet[] };
export type GettingStartedResponse = { checklist: GettingStartedChecklist };
export type RecordedVisualExportResponse = { checklist: GettingStartedChecklist | undefined };
export type ProductContextResponse = { context: ProductContext };
export type ActivityResponse = z.infer<typeof import("@storymapper/contracts/schemas/audit").activityResponseSchema>;
export type ProposeMapFromSourceDocumentRequest = { projectId: string; sourceDocumentId: string; storyMapId?: string | undefined };
export interface BacklogHealthReportInput { storyMapId: string; cards: Card[]; sourceLinkedCardIds: string[]; githubLinkedCardIds: string[] }
export interface ReleaseSummaryReportInput extends BacklogHealthReportInput { releases: Release[]; releaseId?: string | null; includeReleased?: boolean }
export interface TextExportFile { fileName: string; contentType: string; content: string }
export type StoryMapReportData = BacklogHealthReportInput & { releases: Release[] };
export type AiTemplatesResponse = z.infer<typeof aiFunctionTemplatesResponseSchema>;
export type AiProposalResponse = z.infer<typeof createAiProposalResponseSchema>;
export type RestorePointCapabilitiesResponse = z.infer<typeof restorePointCapabilitiesResponseSchema>;
export type ProjectArchiveCapabilitiesResponse = { capabilities: typeof projectArchiveCapabilities };
export interface ProjectArchiveExport { fileName: string; content: Buffer }
export interface GitHubSyncHealthData { storyMapId: string; cards: Card[]; links: GitHubLink[] }
export interface WorkItemSyncHealthData { annotations: Annotation[]; cardAnnotations: CardAnnotationLink[]; storyMap: StoryMap; cards: Card[]; releases: Release[]; connections: ConnectorConnection[]; links: RemoteWorkItemLink[]; runs: SyncRun[]; openConflicts: SyncConflict[]; deletedRefs: import("@storymapper/contracts/schemas/external-refs").ExternalRefDeletedEvidence[] }
export type TextHasher = (text: string) => string;

export interface SourceDocumentSummaryData { document: import("@storymapper/contracts/schemas/domain").SourceDocument; chunkIds: string[]; linkedChunkIds: string[] }
export type RoadmapDetailsData = Omit<import("@storymapper/contracts/schemas/domain").RoadmapDetails, "reports"> & { storyCards: Card[]; remoteWorkItemLinks?: RemoteWorkItemLink[]; workflowStatuses?: import("@storymapper/contracts/schemas/domain").WorkflowStatus[] };

export type McpToolStates = z.infer<typeof import("@storymapper/contracts/api/http").mcpToolsResponseSchema>["tools"];
