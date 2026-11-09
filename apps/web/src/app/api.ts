import { cardReviewsResponseSchema, type CardReviewCommand, type CardReviewQuery, type CardReviewsResponse } from "@storymapper/contracts";
import { throwGitHubFailure } from "@storymapper/web/app/incoming-github-error";
import type { LookupGitHubTicketRequest, LookupGitHubTicketResponse, ImportGitHubTicketRequest, ImportGitHubTicketResponse, IncomingGitHubCommandResponse } from "@storymapper/contracts";
import type { RemotePushPlan, RemotePushPlanResponse, ResolveSyncConflictResponse } from "@storymapper/contracts";
import type { VerifyGitHubConnectionRequest, VerifyGitHubConnectionResponse, ConnectGitHubConnectionRequest, ConnectGitHubConnectionResponse } from "@storymapper/contracts";
import { cardDependencyRequest } from "@storymapper/web/app/card-dependency-api";
import { appStrings as strings } from "@storymapper/ui-strings";
import { customizationResponseSchema, activityQuerySchema, activityResponseSchema, importProjectArchiveResponseSchema, cardHistoryQuerySchema, cardHistoryResponseSchema, createRestorePointResponseSchema, listRestorePointsResponseSchema, restoreActivityResponseSchema, restoreProjectResultSchema, safetySettingsResponseSchema, type ActivityResponse, type ActorType, type CardHistoryResponse, type CreateRestorePointResponse, type ListRestorePointsResponse, type RestoreProjectResult } from "@storymapper/contracts";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient, type InfiniteData, type UseQueryResult } from "@tanstack/react-query";
import { useEffect } from "react";
import { LIVE_CLIENT_ID_HEADER } from "@storymapper/contracts";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";
import { RequestError, throwRequestFailure } from "@storymapper/web/app/conflicts";
import type {
  DeleteWorkflowStatusRequest,
  DeleteAnnotationRequest,
  DeletePersonaCommand,
  AiFunctionTemplate,
  Annotation,
  BacklogHealthReport,
  BulkUpdateCardsCommand,
  Card,
  CardAttachment,
  CardAnnotationLink,
  CardPersonaLink,
  CardSourceLink,
  StoredChangeSet,
  ChangeSetPreviewResponse,
  ConnectorConnection,
  CredentialStatus,
  CreateConnectorConnectionRequest,
  CreateAnnotationRequest,
  CreateAiProposalRequest,
  CreateAiTemplateRequest,
  UpdateAiTemplateRequest,
  CreateCardAttachmentRequest,
  CreateCardRequest,
  CreateCardSourceLinkRequest,
  CreateGitHubIssueDryRunRequest,
  CreateGitHubLinkRequest,
  CreatePersonaRequest,
  CreateReleaseRequest,
  CreateRoadmapCardRequest,
  CreateRoadmapColumnRequest,
  CreateRoadmapReferenceRequest,
  CreateRoadmapRequest,
  CreateStoryTemplateRequest,
  CreateStoryMapRequest,
  CreateWorkflowStatusRequest,
  DeleteCardRequest,
  DeleteCardsCommand,
  DeleteCardsResponse,
  DeletedRootResponse,
  DeleteStoryMapResponse,
  GitHubIssueDryRun,
  GitHubLink,
  GettingStartedChecklist,
  GitHubSyncHealthReport,
  ImportProjectArchiveResponse,
  ImportSourceDocumentRequest,
  ImportSourceDocumentResponse,
  ImportWorkItemsRequest,
  McpCallRequest,
  MoveCardRequest,
  ParkCardRequest,
  Persona,
  PersonasResponse,
  PlanWorkItemSyncRequest,
  PullStoryMapWorkItemsRequest,
  ProductContext,
  Project,
  Release,
  ReleaseSummaryReport,
  ReleaseNotesResponse,
  ReleaseTimelineReport,
  Roadmap,
  RoadmapCard,
  RoadmapColumn,
  RoadmapDetails,
  RoadmapReference,
  SourceCoverageReport,
  SourceDocumentDetails,
  SourceDocumentSummary,
  StoryTemplate,
  StoryMap,
  StoryMapSnapshot,
  UpdateAnnotationRequest,
  UpdateCardRequest,
  UpdateConnectorConnectionRequest,
  UpdateGitHubLinkRequest,
  UpdatePersonaRequest,
  UpdateSafetySettingsRequest,
  UpdateReleaseRequest,
  UpdateRoadmapRequest,
  UpdateStoryMapRequest,
  UpdateStoryTemplateRequest,
  UpsertProductContextRequest,
  ValidateConnectorConnectionRequest,
  UpdateWorkflowStatusRequest,
  WorkflowStatus,
  ApplyWorkItemSyncRequest,
  SyncWorkItemsRequest,
  SyncConflict,
  SyncPlan,
  SyncRun,
  RemoteWorkItemLink,
  ResolveSyncConflictRequest,
  WorkItemSyncHealthReport
} from "@storymapper/contracts";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

const apiBaseUrl = "";
export class RestoreRejectedError extends Error {}
export class ProjectArchiveRejectedError extends Error {}

async function restorePointJson(path: string, input?: unknown, restoring = false, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, input ? {
    method: "POST", headers: { "content-type": "application/json", [LIVE_CLIENT_ID_HEADER]: getLiveClientId() }, body: JSON.stringify(input)
  } : signal ? { signal } : undefined);
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); }
    catch (error) { if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error; }
    const cause = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : strings.requestFailed(response.status);
    throw restoring && response.status >= 400 && response.status < 500 ? new RestoreRejectedError(cause) : new Error(cause);
  }
  return response.json();
}

export function useRestorePoints(projectId: string): UseQueryResult<ListRestorePointsResponse, Error> {
  return useQuery<ListRestorePointsResponse>({
    queryKey: ["restore-points", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    queryFn: async ({ signal }) => listRestorePointsResponseSchema.parse(await restorePointJson(`/api/human/projects/${projectId}/restore-points`, undefined, false, signal))
  });
}

interface ApiHealthResponse {
  ok: boolean;
  mode: "local";
  databasePath: string;
  outboundNetwork: string;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error(strings.requestFailed(response.status));
  }
  return response.json() as Promise<T>;
}

async function throwCardCreationFailure(response: Response): Promise<never> {
  let body: unknown;
  try { body = await response.json(); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new RequestError(strings.requestFailed(response.status), response.status);
  }
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    throw new RequestError(body.message, response.status);
  }
  throw new RequestError(strings.requestFailed(response.status), response.status);
}

async function throwMoveFailure(response: Response): Promise<never> {
  if (response.status === 409) return throwRequestFailure(response);
  return throwCardCreationFailure(response);
}

export async function sendJson<T>(path: string, method: "POST" | "PATCH" | "PUT", body: unknown, onFailure = throwRequestFailure, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      [LIVE_CLIENT_ID_HEADER]: getLiveClientId()
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {})
  });

  if (!response.ok) await onFailure(response);

  return response.json() as Promise<T>;
}

async function deleteJson<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { method: "DELETE", headers: { "content-type": "application/json", [LIVE_CLIENT_ID_HEADER]: getLiveClientId() }, body: JSON.stringify(body) });
  if (!response.ok) await throwRequestFailure(response);
  return response.json() as Promise<T>;
}

async function downloadArtifact(path: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    const body = response.headers.get("content-type")?.includes("application/json") ? await response.json() as { message?: string } : undefined;
    throw new Error(body?.message ?? strings.requestFailed(response.status));
  }
  const fileName = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1];
  if (!fileName) throw new Error(strings.exportFilenameMissing);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

export function useGettingStartedChecklist(projectId?: string) {
  return useQuery({
    queryKey: ["getting-started", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    retry: false,
    queryFn: ({ signal }) => getJson<{ checklist: GettingStartedChecklist }>(`/api/projects/${projectId}/getting-started`, signal)
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => getJson<{ projects: Project[] }>("/api/projects", signal)
  });
}

export function useApiHealth() {
  return useQuery({
    queryKey: ["api-health"],
    queryFn: () => getJson<ApiHealthResponse>("/health"),
    retry: false
  });
}

export function useCredentialStatus() {
  return useQuery({
    queryKey: ["credential-status"],
    queryFn: () => getJson<{ credentials: CredentialStatus[] }>("/api/credentials/status")
  });
}

export function useActivity(projectId?: string, filters: { actorType?: ActorType; toolName?: string; view?: "changes" | "all" } = {}) {
  const queryClient = useQueryClient();
  const { actorType, toolName, view } = filters;
  const activity = useInfiniteQuery({
    queryKey: ["activity", projectId, actorType, toolName, view],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    initialPageParam: undefined as ActivityResponse["nextCursor"] | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const { limit } = activityQuerySchema.parse({});
      const query = new URLSearchParams({ projectId: projectId!, limit: String(limit) });
      if (view) query.set("view", view);
      if (actorType) query.set("actorType", actorType);
      if (toolName) query.set("toolName", toolName);
      if (pageParam) query.set("cursor", JSON.stringify(pageParam));
      return activityResponseSchema.parse(await getJson<unknown>(`/api/activity?${query}`, signal));
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined
  });
  useEffect(() => () => {
    const queryKey = ["activity", projectId, actorType, toolName, view];
    void queryClient.cancelQueries({ queryKey, exact: true }).then(() => {
      queryClient.setQueryData<InfiniteData<ActivityResponse>>(queryKey, (data) =>
        data && data.pages.length > 1 ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data);
    });
  }, [projectId, actorType, toolName, view, queryClient]);
  return activity;
}

export function useSourceDocuments(projectId?: string) {
  return useQuery({
    queryKey: ["source-documents", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getJson<{ documents: SourceDocumentSummary[] }>(`/api/source-documents?projectId=${projectId}`, signal)
  });
}

export function useSourceDocumentDetails(documentId?: string) {
  return useQuery({
    queryKey: ["source-document", documentId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(documentId),
    queryFn: ({ signal }) => getJson<SourceDocumentDetails>(`/api/source-documents/${documentId}`, signal)
  });
}

export function useSourceCoverage(projectId?: string) {
  return useQuery({
    queryKey: ["source-coverage", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getJson<SourceCoverageReport>(`/api/reports/source-coverage?projectId=${projectId}`, signal)
  });
}

export function useBacklogHealth(storyMapId?: string) {
  return useQuery({
    queryKey: ["backlog-health", storyMapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(storyMapId),
    queryFn: ({ signal }) => getJson<BacklogHealthReport>(`/api/reports/backlog-health?storyMapId=${storyMapId}`, signal)
  });
}

export function useGitHubSyncHealth(storyMapId?: string) {
  return useQuery({
    queryKey: ["github-sync-health", storyMapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(storyMapId),
    queryFn: ({ signal }) => getJson<GitHubSyncHealthReport>(`/api/github/sync-health?storyMapId=${storyMapId}`, signal)
  });
}

export function useConnectorConnections(projectId?: string) {
  return useQuery({
    queryKey: ["connector-connections", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getJson<{ connections: ConnectorConnection[] }>(`/api/connectors/connections?projectId=${projectId}`, signal)
  });
}

export function useWorkItemSyncHealth(storyMapId?: string) {
  return useQuery({
    queryKey: ["work-item-sync-health", storyMapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(storyMapId),
    queryFn: ({ signal }) => getJson<WorkItemSyncHealthReport>(`/api/sync/work-items/health?storyMapId=${storyMapId}`, signal)
  });
}

export function useReleaseSummary(storyMapId?: string, releaseId?: string, includeReleased = true) {
  return useQuery({
    queryKey: ["release-summary", storyMapId, releaseId ?? "all", includeReleased],
    structuralSharing: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(storyMapId),
    queryFn: ({ signal }) => getJson<ReleaseSummaryReport>(
      `/api/reports/release-summary?storyMapId=${storyMapId}${releaseId ? `&releaseId=${releaseId}` : ""}&includeReleased=${includeReleased}`, signal
    )
  });
}

export function useReleaseTimeline(storyMapId?: string) {
  return useQuery({
    queryKey: ["release-timeline", storyMapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(storyMapId),
    queryFn: ({ signal }) => getJson<ReleaseTimelineReport>(`/api/reports/release-timeline?storyMapId=${storyMapId}`, signal)
  });
}

export function useRoadmaps(projectId?: string, storyMapId?: string) {
  return useQuery({
    queryKey: ["roadmaps", projectId, storyMapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getJson<{ roadmaps: Roadmap[] }>(`/api/roadmaps?projectId=${projectId}${storyMapId ? `&storyMapId=${storyMapId}` : ""}`, signal)
  });
}

export function useRoadmapDetails(roadmapId?: string) {
  return useQuery({
    queryKey: ["roadmap", roadmapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(roadmapId),
    queryFn: ({ signal }) => getJson<RoadmapDetails>(`/api/roadmaps/${roadmapId}`, signal)
  });
}

export function useMcpTools(projectId?: string) {
  return useQuery({
    queryKey: ["mcp-tools", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => getJson<{
      tools: Array<{
        name: McpCallRequest["name"];
        description: string;
        permission: "read" | "proposal" | "write" | "github" | "admin";
        enabled: boolean;
      }>;
    }>(`/api/mcp/tools${projectId ? `?projectId=${projectId}` : ""}`, signal)
  });
}

export function useMcpHostConfigs() {
  return useQuery({
    queryKey: ["mcp-host-configs"],
    queryFn: () => getJson<import("@storymapper/contracts").McpHostConfigsResponse>("/api/mcp/host-configs")
  });
}

async function changeSetJson<T>(path: string, signal?: AbortSignal, selectedOperationIds?: string[]): Promise<T> {
  const response = await fetch(path, selectedOperationIds === undefined ? signal ? { signal } : undefined : {
    method: "POST", headers: { "content-type": "application/json", [LIVE_CLIENT_ID_HEADER]: getLiveClientId() }, body: JSON.stringify({ selectedOperationIds })
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const cause = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : strings.requestFailed(response.status);
    throw new RequestError(cause, response.status);
  }
  return body as T;
}

export function useChangeSetPreview(id?: string, selectedOperationIds?: string[], revision = 0) {
  return useQuery<ChangeSetPreviewResponse>({
    queryKey: ["changeset-preview", id, selectedOperationIds, revision],
    placeholderData: (previous, query) => query && query.queryKey[1] === id && query.queryKey[3] === revision ? previous : undefined,
    enabled: Boolean(id), retry: false, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => changeSetJson<ChangeSetPreviewResponse>(`/api/changesets/${id}/preview${selectedOperationIds === undefined ? "" : `?selectedOperationIds=${encodeURIComponent(JSON.stringify(selectedOperationIds))}`}`, signal)
  });
}

export function useChangeSets(projectId?: string) {
  return useQuery({
    queryKey: ["changesets", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getJson<{ changeSets: StoredChangeSet[] }>(`/api/changesets?projectId=${projectId}`, signal)
  });
}

export function useCardHistory(cardId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const history = useInfiniteQuery({
    queryKey: ["card-history", cardId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled,
    initialPageParam: undefined as number | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const { limit } = cardHistoryQuerySchema.parse({});
      const query = new URLSearchParams({ limit: String(limit) });
      if (pageParam !== undefined) query.set("beforeVersion", String(pageParam));
      return cardHistoryResponseSchema.parse(await getJson<unknown>(`/api/cards/${cardId}/history?${query}`, signal));
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined
  });
  const retainFirstPage = () => queryClient.setQueryData<InfiniteData<CardHistoryResponse>>(["card-history", cardId], (data) =>
    data && data.pages.length > 1 ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data);
  useEffect(() => {
    if (!enabled) retainFirstPage();
  }, [enabled, history.data, cardId, queryClient]);
  useEffect(() => () => { retainFirstPage(); }, [cardId, queryClient]);
  return history;
}

export function useCardAttachments(cardId?: string) {
  return useQuery({
    queryKey: ["card-attachments", cardId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(cardId),
    queryFn: ({ signal }) => getJson<{ attachments: CardAttachment[] }>(`/api/cards/${cardId}/attachments`, signal)
  });
}

export function useProductContext(projectId?: string, storyMapId?: string) {
  return useQuery({
    queryKey: ["product-context", projectId, storyMapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getJson<{ context: ProductContext }>(`/api/product-context?projectId=${projectId}${storyMapId ? `&storyMapId=${storyMapId}` : ""}`, signal)
  });
}

export function useAiFunctionTemplates(projectId?: string) {
  return useQuery({
    queryKey: ["ai-function-templates", projectId],
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getJson<{ templates: AiFunctionTemplate[] }>(`/api/ai/templates?projectId=${projectId}`, signal)
  });
}

export function useSafetySettings(projectId?: string) {
  return useQuery({
    queryKey: ["safety-settings", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) => safetySettingsResponseSchema.parse(await getJson<unknown>(`/api/settings/safety?projectId=${projectId}`, signal))
  });
}

function getCustomization(projectId: string, storyMapId?: string, signal?: AbortSignal) {
  return getJson<ReturnType<typeof customizationResponseSchema.parse>>(`/api/customization?projectId=${projectId}${storyMapId ? `&storyMapId=${storyMapId}` : ""}`, signal);
}

export function useCustomization(projectId?: string, storyMapId?: string) {
  return useQuery({
    queryKey: ["customization", projectId, storyMapId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId),
    queryFn: ({ signal }) => getCustomization(projectId!, storyMapId, signal)
  });
}

export function usePersonas(projectId?: string, storyMapId?: string) {
  return useQuery({
    queryKey: ["personas", projectId, storyMapId ?? null],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: isPersonasEnabled && Boolean(projectId),
    queryFn: ({ signal }) => getJson<PersonasResponse>(
      `/api/personas?projectId=${projectId}${storyMapId ? `&storyMapId=${storyMapId}` : ""}`, signal
    )
  });
}

export const api = {
  getCardReviews: async (projectId: string, storyMapId: string, signal?: AbortSignal, query: Omit<CardReviewQuery, "storyMapId"> = {}): Promise<CardReviewsResponse> => {
    const parameters = new URLSearchParams({ storyMapId, ...Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])) });
    return cardReviewsResponseSchema.parse(await getJson(`/api/projects/${projectId}/card-reviews?${parameters}`, signal));
  },
  commandCardReview: async (projectId: string, command: CardReviewCommand): Promise<CardReviewsResponse> => cardReviewsResponseSchema.parse(await sendJson(`/api/projects/${projectId}/card-reviews`, "POST", command)),
  getCustomization,
  captureDeleteAffectedCards: async (snapshot: StoryMapSnapshot, targetIds: string[]): Promise<Card[]> => {
    const selected = new Set(targetIds);
    const identities = new Set(snapshot.githubLinks.filter((link) => link.cardId && selected.has(link.cardId)).map((link) => link.id));
    if (!identities.size) return [];
    const { storyMaps } = await getJson<{ storyMaps: StoryMap[] }>(`/api/story-maps?projectId=${snapshot.storyMap.projectId}`);
    const maps = await Promise.all(storyMaps.filter((map) => map.id !== snapshot.storyMap.id).map((map) => getJson<StoryMapSnapshot>(`/api/story-maps/${map.id}`)));
    return maps.flatMap((map) => {
      const owners = new Set(map.sourceLinks.filter((link) => link.kind === "github" && identities.has(link.externalRefId)).map((link) => link.cardId));
      return map.cards.filter((card) => owners.has(card.id));
    });
  },
  createRestorePoint: async (projectId: string): Promise<CreateRestorePointResponse> =>
    createRestorePointResponseSchema.parse(await restorePointJson(`/api/human/projects/${projectId}/restore-points`, { class: "manual" })),
  restoreProject: async (projectId: string, fileName: string): Promise<RestoreProjectResult> =>
    restoreProjectResultSchema.parse(await restorePointJson(`/api/human/projects/${projectId}/restore`, { fileName, confirm: true }, true)),
  readRestoreActivity: async (projectId: string) => restoreActivityResponseSchema.parse(await getJson<unknown>(`/api/human/projects/${projectId}/restore-activity`)),
  readProjects: () => getJson<{ projects: Project[] }>("/api/projects"),
  readSafetySettings: async (projectId: string) => safetySettingsResponseSchema.parse(await getJson<unknown>(`/api/settings/safety?projectId=${projectId}`)),
  createCard: (input: CreateCardRequest) => sendJson<Card>("/api/cards", "POST", input, throwCardCreationFailure),
  setCardDependency: (cardId: string, input: import("@storymapper/contracts").SetCardDependencyRequest) => cardDependencyRequest(`/api/cards/${cardId}/dependencies`, "POST", input),
  unsetCardDependency: (cardId: string, prerequisiteCardId: string, baseVersion: number) => cardDependencyRequest(`/api/cards/${cardId}/dependencies/${prerequisiteCardId}?baseVersion=${baseVersion}`, "DELETE"),
  updateCard: (cardId: string, input: UpdateCardRequest, baseVersion: number) => sendJson<Card>(`/api/cards/${cardId}`, "PATCH", { ...input, baseVersion }),
  moveCard: (cardId: string, input: MoveCardRequest, baseVersion: number) => sendJson<Card>(`/api/cards/${cardId}/move`, "POST", { ...input, baseVersion }, throwMoveFailure),
  bulkUpdateCards: (input: BulkUpdateCardsCommand) => sendJson<{ cards: Card[] }>("/api/cards/bulk", "PATCH", input),
  archiveCard: (cardId: string, baseVersion: number) => sendJson<Card>(`/api/cards/${cardId}/archive`, "POST", { baseVersion }),
  deleteCards: (input: DeleteCardsCommand) => sendJson<DeleteCardsResponse>("/api/cards/delete-set", "POST", input),
  deleteCard: (cardId: string, input: DeleteCardRequest, baseVersion: number) => sendJson<DeletedRootResponse>(`/api/cards/${cardId}/delete`, "POST", { ...input, baseVersion }),
  parkCard: (cardId: string, input: ParkCardRequest, baseVersion: number) => sendJson<Card>(`/api/cards/${cardId}/park`, "POST", { ...input, baseVersion }),
  unparkCard: (cardId: string, baseVersion: number) => sendJson<Card>(`/api/cards/${cardId}/unpark`, "POST", { baseVersion }),
  getReleaseNotes: (storyMapId: string, releaseId: string, signal?: AbortSignal) => getJson<ReleaseNotesResponse>(`/api/story-maps/${storyMapId}/releases/${releaseId}/notes`, signal),
  createRelease: (input: CreateReleaseRequest) => sendJson<Release>("/api/releases", "POST", input),
  createStoryMap: (input: CreateStoryMapRequest) => sendJson<StoryMap>("/api/story-maps", "POST", input),
  deleteStoryMap: (storyMapId: string, baseVersion: number) => deleteJson<DeleteStoryMapResponse>(`/api/story-maps/${storyMapId}?baseVersion=${baseVersion}`),
  dismissGettingStartedChecklist: (projectId: string) =>
    sendJson<{ checklist: GettingStartedChecklist }>(`/api/projects/${projectId}/getting-started/dismiss`, "POST", {}),
  recordGettingStartedExport: (projectId: string, format: "html" | "png" | "pdf") =>
    sendJson<{ checklist: GettingStartedChecklist }>(`/api/projects/${projectId}/getting-started/export-success`, "POST", { format }),
  updateStoryMap: (storyMapId: string, input: UpdateStoryMapRequest, baseVersion: number) =>
    sendJson<{ storyMap: StoryMap }>(`/api/story-maps/${storyMapId}`, "PATCH", { ...input, baseVersion }),
  updateRelease: (releaseId: string, input: UpdateReleaseRequest, baseVersion: number) =>
    sendJson<Release>(`/api/releases/${releaseId}`, "PATCH", { ...input, baseVersion }),
  deleteRelease: (releaseId: string, baseVersion: number) => sendJson<DeletedRootResponse>(`/api/releases/${releaseId}/delete`, "POST", { baseVersion }),
  createRoadmap: (input: CreateRoadmapRequest) => sendJson<Roadmap>("/api/roadmaps", "POST", input),
  updateRoadmap: (roadmapId: string, input: UpdateRoadmapRequest, baseVersion: number) => sendJson<Roadmap>(`/api/roadmaps/${roadmapId}`, "PATCH", { ...input, baseVersion }),
  createRoadmapColumn: (input: CreateRoadmapColumnRequest) => sendJson<RoadmapColumn>("/api/roadmap-columns", "POST", input),
  createRoadmapCard: (input: CreateRoadmapCardRequest) => sendJson<RoadmapCard>("/api/roadmap-cards", "POST", input),
  createRoadmapReference: (input: CreateRoadmapReferenceRequest) => sendJson<RoadmapReference>("/api/roadmap-references", "POST", input),
  createWorkflowStatus: (input: CreateWorkflowStatusRequest) => sendJson<WorkflowStatus>("/api/workflow-statuses", "POST", input),
  updateWorkflowStatus: (statusId: string, input: UpdateWorkflowStatusRequest) =>
    sendJson<WorkflowStatus>(`/api/workflow-statuses/${statusId}`, "PATCH", input),
  deleteWorkflowStatus: (statusId: string, input: DeleteWorkflowStatusRequest) => deleteJson<{ ok: boolean }>(`/api/workflow-statuses/${statusId}`, input),
  createPersona: (input: CreatePersonaRequest) => sendJson<Persona>("/api/personas", "POST", input),
  updatePersona: (personaId: string, input: UpdatePersonaRequest, baseVersion: number) => sendJson<Persona>(`/api/personas/${personaId}`, "PATCH", { ...input, baseVersion }),
  deletePersona: (personaId: string, baseVersion: number, input?: Omit<DeletePersonaCommand, "baseVersion">) => deleteJson<DeletedRootResponse>(`/api/personas/${personaId}?baseVersion=${baseVersion}`, input),
  setCardPersona: (cardId: string, personaId: string) =>
    sendJson<{ link: CardPersonaLink }>(`/api/cards/${cardId}/personas/${personaId}`, "POST", {}),
  deleteCardPersona: (cardId: string, personaId: string) =>
    deleteJson<{ ok: boolean }>(`/api/cards/${cardId}/personas/${personaId}`),
  createAnnotation: (input: CreateAnnotationRequest) => sendJson<Annotation>("/api/annotations", "POST", input),
  updateAnnotation: (annotationId: string, input: UpdateAnnotationRequest) =>
    sendJson<Annotation>(`/api/annotations/${annotationId}`, "PATCH", input),
  deleteAnnotation: (annotationId: string, input: DeleteAnnotationRequest) => deleteJson<{ ok: boolean }>(`/api/annotations/${annotationId}`, input),
  setCardAnnotation: (cardId: string, annotationId: string) =>
    sendJson<{ link: CardAnnotationLink }>(`/api/cards/${cardId}/annotations/${annotationId}`, "POST", {}),
  deleteCardAnnotation: (cardId: string, annotationId: string) =>
    deleteJson<{ ok: boolean }>(`/api/cards/${cardId}/annotations/${annotationId}`),
  createStoryTemplate: (input: CreateStoryTemplateRequest) => sendJson<StoryTemplate>("/api/story-templates", "POST", input),
  updateStoryTemplate: (templateId: string, input: UpdateStoryTemplateRequest) =>
    sendJson<StoryTemplate>(`/api/story-templates/${templateId}`, "PATCH", input),
  deleteStoryTemplate: (templateId: string) => deleteJson<{ ok: boolean }>(`/api/story-templates/${templateId}`),
  upsertProductContext: (input: UpsertProductContextRequest) =>
    sendJson<{ context: ProductContext }>("/api/product-context", "PATCH", input),
  createCardAttachment: (cardId: string, input: CreateCardAttachmentRequest) =>
    sendJson<{ attachment: CardAttachment }>(`/api/cards/${cardId}/attachments`, "POST", input),
  deleteCardAttachment: (cardId: string, attachmentId: string) =>
    deleteJson<{ ok: boolean }>(`/api/cards/${cardId}/attachments/${attachmentId}`),
  createAiProposal: (input: CreateAiProposalRequest) =>
    sendJson<{ changeSet: StoredChangeSet }>("/api/ai/proposals", "POST", input),
  createAiTemplate: (input: CreateAiTemplateRequest) => sendJson<{ template: AiFunctionTemplate }>("/api/ai/templates", "POST", input),
  updateAiTemplate: (projectId: string, templateId: string, input: UpdateAiTemplateRequest) =>
    sendJson<{ template: AiFunctionTemplate }>(`/api/projects/${projectId}/ai/templates/${encodeURIComponent(templateId)}`, "PATCH", input),
  deleteAiTemplate: (projectId: string, templateId: string) =>
    deleteJson<{ deleted: boolean }>(`/api/projects/${projectId}/ai/templates/${encodeURIComponent(templateId)}`),
  callMcpTool: (input: McpCallRequest) =>
    sendJson<{ changeSet?: StoredChangeSet; data?: unknown; auditEventId?: string }>("/api/mcp/call", "POST", input),
  approveSelectedChangeSet: (changeSetId: string, selectedOperationIds: string[]) =>
    changeSetJson<{ changeSet: StoredChangeSet }>(`/api/changesets/${changeSetId}/approve`, undefined, selectedOperationIds),
  applySelectedChangeSet: (changeSetId: string, selectedOperationIds: string[]) =>
    changeSetJson<{ changeSet: StoredChangeSet }>(`/api/changesets/${changeSetId}/apply`, undefined, selectedOperationIds),
  approveChangeSet: (changeSetId: string) =>
    sendJson<{ changeSet: StoredChangeSet }>(`/api/changesets/${changeSetId}/approve`, "POST", {}),
  rejectChangeSet: (changeSetId: string) =>
    sendJson<{ changeSet: StoredChangeSet }>(`/api/changesets/${changeSetId}/reject`, "POST", {}),
  applyChangeSet: (changeSetId: string) =>
    sendJson<{ changeSet: StoredChangeSet }>(`/api/changesets/${changeSetId}/apply`, "POST", {}),
  importSourceDocument: (input: ImportSourceDocumentRequest) =>
    sendJson<ImportSourceDocumentResponse>("/api/source-documents/import", "POST", input),
  createCardSourceLink: (cardId: string, input: CreateCardSourceLinkRequest) =>
    sendJson<{ link: CardSourceLink }>(`/api/cards/${cardId}/source-links`, "POST", input),
  bindGitHubCard: (input: CreateGitHubLinkRequest & { connectionId: string }) => sendJson<IncomingGitHubCommandResponse>("/api/github/links", "POST", input, throwGitHubFailure),
  createGitHubLink: (input: CreateGitHubLinkRequest) =>
    sendJson<{ link: GitHubLink }>("/api/github/links", "POST", input),
  updateGitHubLink: (linkId: string, input: UpdateGitHubLinkRequest) =>
    sendJson<{ link: GitHubLink }>(`/api/github/links/${linkId}`, "PATCH", input),
  updateSafetySettings: async (projectId: string, input: UpdateSafetySettingsRequest) =>
    safetySettingsResponseSchema.parse(await sendJson<unknown>(`/api/settings/safety?projectId=${projectId}`, "PATCH", input)),
  downloadStoryMapExport: (storyMapId: string, format: "json" | "markdown" | "csv") =>
    downloadArtifact(`/api/exports/story-map?storyMapId=${storyMapId}&format=${format}`),
  downloadAuditExport: (projectId: string, format: "json" | "markdown") =>
    downloadArtifact(`/api/exports/audit?projectId=${projectId}&format=${format}`),
  downloadProjectArchive: (projectId: string) => downloadArtifact(`/api/projects/export?projectId=${projectId}`),
  importProjectArchive: async (file: File): Promise<ImportProjectArchiveResponse> => {
    const body = new FormData();
    body.append("archive", file);
    const response = await fetch(`${apiBaseUrl}/api/projects/import`, { method: "POST", headers: { [LIVE_CLIENT_ID_HEADER]: getLiveClientId() }, body });
    if (!response.ok) {
      let body: unknown;
      try { body = await response.json(); }
      catch (error) { if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error; }
      const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : strings.requestFailed(response.status);
      throw response.status >= 400 && response.status < 500 ? new ProjectArchiveRejectedError(message) : new Error(message);
    }
    return importProjectArchiveResponseSchema.parse(await response.json());
  },
  createGitHubIssueDryRun: (input: CreateGitHubIssueDryRunRequest) =>
    sendJson<{ dryRuns: GitHubIssueDryRun[] }>("/api/github/issue-dry-run", "POST", input),
  verifyGitHubConnection: (input: VerifyGitHubConnectionRequest) =>
    sendJson<VerifyGitHubConnectionResponse>("/api/connectors/github/verify", "POST", input),
  connectGitHubConnection: (input: ConnectGitHubConnectionRequest) =>
    sendJson<ConnectGitHubConnectionResponse>("/api/connectors/github/connect", "POST", input),
  readConnectorConnections: (projectId: string) => getJson<{ connections: ConnectorConnection[] }>(`/api/connectors/connections?projectId=${projectId}`),
  readCredentialStatus: () => getJson<{ credentials: CredentialStatus[] }>("/api/credentials/status"),
  createConnectorConnection: (input: CreateConnectorConnectionRequest) =>
    sendJson<{ connection: ConnectorConnection }>("/api/connectors/connections", "POST", input),
  updateConnectorConnection: (connectionId: string, input: UpdateConnectorConnectionRequest) =>
    sendJson<{ connection: ConnectorConnection }>(`/api/connectors/connections/${connectionId}`, "PATCH", input),
  deleteConnectorConnection: (connectionId: string) =>
    deleteJson<{ ok: boolean }>(`/api/connectors/connections/${connectionId}`),
  listGitHubStatusProjects: (input: ValidateConnectorConnectionRequest) => sendJson<{ projects: Array<{ id: string; name: string; fieldId: string }> }>("/api/connectors/status-projects", "POST", input),
  validateConnectorConnection: (input: ValidateConnectorConnectionRequest) =>
    sendJson<{ ok: boolean; message: string; provider: string; credentials: CredentialStatus[]; details?: Record<string, unknown> }>("/api/connectors/connections/validate", "POST", input),
  planWorkItemSync: (input: PlanWorkItemSyncRequest) =>
    sendJson<{ plan: SyncPlan | RemotePushPlan }>("/api/sync/work-items/plan", "POST", input, throwGitHubFailure),
  readRemotePushPlan: (planId: string) => getJson<RemotePushPlanResponse>(`/api/sync/work-items/plans/${planId}`),
  confirmRemotePushPlan: (planId: string, reviewOverride?: { confirmed: true; reason: string }) => sendJson<RemotePushPlanResponse>("/api/sync/work-items/confirm", "POST", { planId, reviewOverride }),
  resumeRemotePushPlan: (planId: string, reviewOverride?: { confirmed: true; reason: string }) => sendJson<RemotePushPlanResponse>("/api/sync/work-items/resume", "POST", { planId, reviewOverride }),
  pushWorkItems: (input: ApplyWorkItemSyncRequest) =>
    sendJson<{ run: SyncRun; links: RemoteWorkItemLink[] }>("/api/sync/work-items/push", "POST", input),
  lookupGitHubTicket: (input: LookupGitHubTicketRequest, signal?: AbortSignal) =>
    sendJson<LookupGitHubTicketResponse>("/api/sync/work-items/lookup-ticket", "POST", input, throwGitHubFailure, signal),
  importGitHubTicket: (input: ImportGitHubTicketRequest) =>
    sendJson<ImportGitHubTicketResponse>("/api/sync/work-items/import-ticket", "POST", input, throwGitHubFailure),
  importWorkItems: (input: ImportWorkItemsRequest) =>
    sendJson<IncomingGitHubCommandResponse>("/api/sync/work-items/import", "POST", input, throwGitHubFailure),
  syncWorkItems: (input: SyncWorkItemsRequest) =>
    sendJson<IncomingGitHubCommandResponse>("/api/sync/work-items/sync", "POST", input, throwGitHubFailure),
  pullStoryMapWorkItems: (input: PullStoryMapWorkItemsRequest) =>
    sendJson<IncomingGitHubCommandResponse>("/api/sync/work-items/pull-story-map", "POST", input, throwGitHubFailure),
  resolveSyncConflict: (conflictId: string, input: ResolveSyncConflictRequest) =>
    sendJson<ResolveSyncConflictResponse | RemotePushPlanResponse | import("@storymapper/contracts").ChangeSetCommandResponse>(`/api/sync/conflicts/${conflictId}/resolve`, "POST", input),
  deleteGitHubLink: async (linkId: string) => {
    return deleteJson<{ ok: boolean }>(`/api/github/links/${linkId}`);
  },
  deleteCardSourceLink: async (cardId: string, evidence: Pick<CardSourceLink, "kind" | "id">) => {
    return deleteJson<{ ok: boolean }>(`/api/cards/${cardId}/source-links`, evidence);
  }
};

export function useStoryMaps(projectId?: string, enabled = true) {
  return useQuery({
    queryKey: ["story-maps", projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: Boolean(projectId) && enabled,
    queryFn: ({ signal }) => getJson<{ storyMaps: StoryMap[] }>(`/api/story-maps?projectId=${projectId}`, signal)
  });
}

export function useProjectGitHubIssues(projectId?: string): { links: GitHubLink[]; error: Error | null | undefined } {
  const maps = useStoryMaps(projectId);
  const listings = useQueries({ queries: (maps.data?.storyMaps ?? []).map((map) => ({
    queryKey: ["github-links", map.id, projectId],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }: { signal: AbortSignal }) => getJson<{ links: GitHubLink[] }>(`/api/github/links?storyMapId=${map.id}`, signal)
  })) });
  return {
    links: [...new Map(listings.flatMap((listing) => listing.data?.links ?? []).map((link) => [link.id, link])).values()].filter((link) => Boolean(link.issueNumber)),
    error: maps.error ?? listings.find((listing) => listing.error)?.error
  };
}

export function useStoryMap(storyMapId?: string) {
  return useQuery({
    queryKey: ["story-map", storyMapId],
    enabled: Boolean(storyMapId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => getJson<StoryMapSnapshot>(`/api/story-maps/${storyMapId}`, signal)
  });
}
