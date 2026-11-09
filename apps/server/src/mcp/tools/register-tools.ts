import { agentAccessEnabled, agentApprovalAllowed, agentProtected } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  actorContextSchema,
  changeSetCommandResponseSchema,
  changeSetCommandToolNames,
  importGitHubTicketResponseSchema,
  mcpToolInputSchemas,
  DomainError,
  type ActorContext,
  type McpToolStates,
  applyChangeSetInputSchema,
  cardDetailsToolInputSchema,
  createStoryMapCardToolInputSchema,
  createStoryMapPersonaToolInputSchema,
  createStoryMapReleaseToolInputSchema,
  deleteOrArchiveStoryMapCardToolInputSchema,
  importGitHubIssuesToolInputSchema,
  listStoryMapsToolInputSchema,
  moveStoryMapCardToolInputSchema,
  personaDetailsToolInputSchema,
  pullStoryMapGitHubLinksToolInputSchema,
  pushCardsToGitHubToolInputSchema,
  proposeMapFromSourceDocumentInputSchema,
  releaseDetailsToolInputSchema,
  storyMapToolInputSchema,
  syncGitHubLinksToolInputSchema,
  updateStoryMapCardToolInputSchema,
  updateStoryMapPersonaToolInputSchema,
  updateStoryMapReleaseToolInputSchema
} from "@storymapper/contracts";
import type { McpToolName, McpToolResult } from "@storymapper/contracts";
import { type StoryMapperRepository, type UnitOfWork } from "@storymapper/db";
import { submitChangeSet } from "@storymapper/server/application/changeset/submit-changeset.use-cases";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { asDomainError } from "@storymapper/server/application/errors";
import { listProjects } from "@storymapper/server/application/project/project.use-cases";
import { listGitHubLinks } from "@storymapper/server/application/github-link/github-link.use-cases";
import {
  applyChangeSet,
  approveChangeSet,
  proposeBacklogGrooming,
  proposeMapFromSourceDocument,
  proposeReleaseSlice
} from "@storymapper/server/application/changeset/changeset.use-cases";
import {
  archiveCard,
  createCard,
  getCardDetails,
  listCards,
  moveCard,
  updateCard
} from "@storymapper/server/application/card/card.use-cases";
import { createPersona, listPersonas, updatePersona } from "@storymapper/server/application/persona/persona.use-cases";
import { createRelease, getReleaseDetails, updateRelease } from "@storymapper/server/application/release/release.use-cases";
import { getStoryMapData, listStoryMaps } from "@storymapper/server/application/story-map/story-map.use-cases";
import {
  canUseTool,
  type McpPermissionSettings,
  McpToolRegistry,
  storyMapperMcpTools
} from "@storymapper/mcp";
import { lookupGitHubTicket, importGitHubTicket, importWorkItems, pullStoryMapWorkItems, pushWorkItems, syncWorkItems } from "@storymapper/server/application/sync/sync.use-cases";
import { registerStructureTools } from "@storymapper/server/mcp/tools/register-structure-tools";
import { registerCustomizationTools } from "@storymapper/server/mcp/tools/register-customization-tools";
import { registerAdditionalCardTools } from "@storymapper/server/mcp/tools/register-card-tools";
import { registerContentTools } from "@storymapper/server/mcp/tools/register-content-tools";
import { assertMatchingScopes, resolveToolProjectIds } from "@storymapper/server/mcp/tools/project-scopes";
import { auditToolCall } from "@storymapper/server/mcp/tools/audit-tool-call";
import { createToolCallRecorder } from "@storymapper/server/mcp/tools/tool-call-recorder";

interface McpRegistryOptions {
  hostName: string;
  localOrigin?: () => string;
  mcpSessionId?: string | undefined;
  permissions?: McpPermissionSettings | undefined;
}

type ProjectResolver = (input: unknown) => string | undefined;
export interface RegistrationContext {
  repository: StoryMapperRepository;
  unitOfWork: UnitOfWork;
  registry: McpToolRegistry;
  options: McpRegistryOptions;
  application: ApplicationDeps;
  actor: ActorContext;
  recordToolCall: ReturnType<typeof createToolCallRecorder>;
}

export function createMcpRegistry(repository: StoryMapperRepository, unitOfWork: UnitOfWork, options: McpRegistryOptions): McpToolRegistry {
  const actor = actorContextSchema.parse({ actorType: "agent", actorId: options.hostName, mcpSessionId: options.mcpSessionId ?? randomUUID() });
  const context: RegistrationContext = { repository, unitOfWork, options, actor, recordToolCall: createToolCallRecorder(unitOfWork, actor), application: { repository, unitOfWork, ...(options.localOrigin ? { localOrigin: options.localOrigin } : {}) }, registry: new McpToolRegistry((name, input, invoke, atomic) => auditToolCall(context, name, input, invoke, atomic)) };
  registerReadTools(context);
  registerCardTools(context);
  registerReleasePersonaTools(context);
  registerGitHubTools(context);
  registerProposalTools(context);
  registerStructureTools(context);
  registerCustomizationTools(context);
  registerAdditionalCardTools(context);
  registerContentTools(context);
  return context.registry;
}

function registerReadTools(context: RegistrationContext): void {
  const { repository, application, actor } = context;
  registerTool(context, "ListProjects", async () => ({
    data: { projects: listProjects(application, actor).projects.filter((project) => agentAccessEnabled(repository.getSafetySettings(project.id))) }
  }));

  registerTool(context, "ListStoryMaps", async (input) => {
    const parsed = listStoryMapsToolInputSchema.parse(input ?? {});
    const data = listStoryMaps(application, actor, parsed.projectId);
    return { data: { storyMaps: data.storyMaps.filter((map) => agentAccessEnabled(repository.getSafetySettings(map.projectId))) } };
  }, (input) => listStoryMapsToolInputSchema.safeParse(input ?? {}).data?.projectId);

  registerTool(context, "GetStoryMapData", async (input) => {
    const { storyMapId } = storyMapToolInputSchema.parse(input);
    return { data: getStoryMapData(application, actor, storyMapId) };
  }, (input) => resolveStoryMapProjectId(repository, storyMapToolInputSchema.parse(input).storyMapId));

  registerTool(context, "GetStoryMapCards", async (input) => {
    const { storyMapId } = storyMapToolInputSchema.parse(input);
    return { data: listCards(application, actor, storyMapId) };
  }, (input) => resolveStoryMapProjectId(repository, storyMapToolInputSchema.parse(input).storyMapId));

  registerTool(context, "GetStoryMapCardDetails", async (input) => {
    const { cardId } = cardDetailsToolInputSchema.parse(input);
    return { data: getCardDetails(application, actor, cardId) };
  }, (input) => resolveCardProjectId(repository, cardDetailsToolInputSchema.parse(input).cardId));

  registerTool(context, "GetStoryMapReleaseDetails", async (input) => {
    const { storyMapId, releaseId } = releaseDetailsToolInputSchema.parse(input);
    return { data: getReleaseDetails(application, actor, storyMapId, releaseId) };
  }, (input) => resolveStoryMapProjectId(repository, releaseDetailsToolInputSchema.parse(input).storyMapId));

  registerTool(context, "GetStoryMapPersonaDetails", async (input) => {
    const { projectId, storyMapId, personaId } = personaDetailsToolInputSchema.parse(input);
    return { data: listPersonas(application, actor, projectId, storyMapId, personaId) };
  }, (input) => personaDetailsToolInputSchema.parse(input).projectId);
}

function registerCardTools(context: RegistrationContext): void {
  const { repository, application, actor } = context;
  registerTool(context, "CreateStoryMapCard", (input) => {
    const parsed = createStoryMapCardToolInputSchema.parse(input);
    return { data: createCard(application, actor, parsed) };
  }, (input) => resolveStoryMapProjectId(repository, createStoryMapCardToolInputSchema.parse(input).storyMapId), true);

  registerTool(context, "UpdateStoryMapCard", (input) => {
    const { cardId, baseVersion, patch, apply } = updateStoryMapCardToolInputSchema.parse(input);
    return { data: updateCard(application, actor, cardId, { ...patch, baseVersion, apply }) };
  }, (input) => resolveCardProjectId(repository, updateStoryMapCardToolInputSchema.parse(input).cardId), true);

  registerTool(context, "MoveStoryMapCard", (input) => {
    const parsed = moveStoryMapCardToolInputSchema.parse(input);
    return { data: moveCard(application, actor, parsed.cardId, {
      parentId: parsed.parentId,
      position: parsed.position,
      releaseId: parsed.releaseId,
      baseVersion: parsed.baseVersion,
      apply: parsed.apply
    }) };
  }, (input) => resolveCardProjectId(repository, moveStoryMapCardToolInputSchema.parse(input).cardId), true);

  registerTool(context, "DeleteOrArchiveStoryMapCard", (input) => {
    const { cardId, baseVersion, apply } = deleteOrArchiveStoryMapCardToolInputSchema.parse(input);
    return { data: archiveCard(application, actor, cardId, baseVersion, apply) };
  }, (input) => resolveCardProjectId(repository, deleteOrArchiveStoryMapCardToolInputSchema.parse(input).cardId), true);
}

function registerReleasePersonaTools(context: RegistrationContext): void {
  const { repository, application, actor } = context;
  registerTool(context, "CreateStoryMapRelease", (input) => {
    const parsed = createStoryMapReleaseToolInputSchema.parse(input);
    return { data: createRelease(application, actor, parsed) };
  }, (input) => resolveStoryMapProjectId(repository, createStoryMapReleaseToolInputSchema.parse(input).storyMapId), true);

  registerTool(context, "UpdateStoryMapRelease", (input) => {
    const { releaseId, baseVersion, patch, apply } = updateStoryMapReleaseToolInputSchema.parse(input);
    return { data: updateRelease(application, actor, releaseId, { ...patch, baseVersion, apply }) };
  }, (input) => resolveStoryMapProjectId(repository, updateStoryMapReleaseToolInputSchema.parse(input).storyMapId), true);

  registerTool(context, "CreateStoryMapPersona", (input) => {
    const parsed = createStoryMapPersonaToolInputSchema.parse(input);
    return { data: createPersona(application, actor, parsed) };
  }, (input) => createStoryMapPersonaToolInputSchema.parse(input).projectId, true);

  registerTool(context, "UpdateStoryMapPersona", (input) => {
    const { projectId, personaId, baseVersion, patch, apply } = updateStoryMapPersonaToolInputSchema.parse(input);
    return { data: updatePersona(application, actor, personaId, { ...patch, baseVersion, apply }) };
  }, (input) => updateStoryMapPersonaToolInputSchema.parse(input).projectId, true);
}

function registerGitHubTools(context: RegistrationContext): void {
  const { repository, application, actor } = context;
  registerTool(context, "ListGitHubLinks", async (input) => {
    const { storyMapId } = storyMapToolInputSchema.parse(input);
    return {
      data: listGitHubLinks(application, actor, storyMapId)
    };
  }, (input) => resolveStoryMapProjectId(repository, storyMapToolInputSchema.parse(input).storyMapId));

  registerTool(context, "LookupGitHubTicket", async (input) => ({ data: await lookupGitHubTicket(application, actor, mcpToolInputSchemas.LookupGitHubTicket.parse(input)) }));
  registerTool(context, "ImportGitHubTicket", async (input) => ({ data: await importGitHubTicket(application, actor, mcpToolInputSchemas.ImportGitHubTicket.parse(input)) }));

  registerTool(context, "ImportGitHubIssues", async (input) => {
    const parsed = importGitHubIssuesToolInputSchema.parse(input);
    const result = await importWorkItems(application, actor, parsed);
    return { data: result };
  }, (input) => resolveStoryMapProjectId(repository, importGitHubIssuesToolInputSchema.parse(input).storyMapId));

  registerTool(context, "PushCardsToGitHub", async (input) => {
    const parsed = pushCardsToGitHubToolInputSchema.parse(input);
    const result = await pushWorkItems(application, actor, parsed);
    return { data: result };
  }, (input) => resolveStoryMapProjectId(repository, pushCardsToGitHubToolInputSchema.parse(input).storyMapId));

  registerTool(context, "SyncGitHubLinks", async (input) => {
    const parsed = syncGitHubLinksToolInputSchema.parse(input);
    const result = await syncWorkItems(application, actor, parsed);
    return { data: result };
  }, (input) => resolveStoryMapProjectId(repository, syncGitHubLinksToolInputSchema.parse(input).storyMapId));

  registerTool(context, "PullStoryMapGitHubLinks", async (input) => {
    const parsed = pullStoryMapGitHubLinksToolInputSchema.parse(input);
    const result = await pullStoryMapWorkItems(application, actor, parsed);
    return { data: result };
  }, (input) => resolveStoryMapProjectId(repository, pullStoryMapGitHubLinksToolInputSchema.parse(input).storyMapId));
}

function registerProposalTools(context: RegistrationContext): void {
  const { repository, application, actor } = context;
  registerTool(context, "SubmitChangeSet", (input) => ({ data: submitChangeSet(application, actor, mcpToolInputSchemas.SubmitChangeSet.parse(input)) }), undefined, true);
  registerTool(context, "ProposeMapFromSourceDocument", (input) => {
    const parsed = proposeMapFromSourceDocumentInputSchema.parse(input);
    return proposeMapFromSourceDocument(application, actor, parsed);
  }, (input) => proposeMapFromSourceDocumentInputSchema.parse(input).projectId, true);

  registerTool(context, "ProposeBacklogGrooming", (input) => {
    const { storyMapId } = storyMapToolInputSchema.parse(input);
    return proposeBacklogGrooming(application, actor, storyMapId);
  }, (input) => resolveStoryMapProjectId(repository, storyMapToolInputSchema.parse(input).storyMapId), true);

  registerTool(context, "ProposeReleaseSlice", (input) => {
    return proposeReleaseSlice(application, actor, mcpToolInputSchemas.ProposeReleaseSlice.parse(input));
  }, (input) => resolveStoryMapProjectId(repository, storyMapToolInputSchema.parse(input).storyMapId), true);

  registerTool(context, "ApproveChangeSet", (input) => {
    const { changeSetId, selectedOperationIds } = mcpToolInputSchemas.ApproveChangeSet.parse(input);
    return approveChangeSet(application, actor, changeSetId, selectedOperationIds);
  }, undefined, true);

  registerTool(context, "ApplyChangeSet", (input) => {
    const { changeSetId, selectedOperationIds } = applyChangeSetInputSchema.parse(input);
    return applyChangeSet(application, actor, changeSetId, selectedOperationIds);
  }, (input) => {
    const { changeSetId } = applyChangeSetInputSchema.parse(input);
    return repository.getChangeSet(changeSetId)?.projectId;
  }, true);
}

export function listMcpToolStates(repository?: StoryMapperRepository, projectId?: string): McpToolStates {
  const permissions = repository && projectId ? permissionsForProject(repository, projectId) : permissionsForUnknownProject();
  return storyMapperMcpTools.map((tool) => ({
    ...tool,
    enabled: canUseTool(tool, permissions) && !(repository && projectId && agentProtected(repository.getSafetySettings(projectId)) && isBlockedByAgentProtection(tool))
  }));
}

export function registerTool(context: RegistrationContext, name: McpToolName, handler: (input: unknown) => McpToolResult | Promise<McpToolResult>, resolveProjectId?: ProjectResolver, atomic = false): void {
  context.registry.register(name, (input, recordProjectIds) => {
    try {
      const parsed = mcpToolInputSchemas[name].parse(input === undefined ? {} : input);
      const projectIds = resolveToolProjectIds(context.repository, name, parsed);
      recordProjectIds?.(projectIds, parsed);
      const projectId = projectIds[0] ?? resolveProjectId?.(parsed);
      const audit = { projectId, name };
      if (projectIds.length) for (const touchedProjectId of projectIds) authorizeTool(context, { ...audit, projectId: touchedProjectId });
      else authorizeTool(context, audit);
      assertMatchingScopes(context.repository, parsed);
      const result = handler(parsed);
      if (name === "ImportGitHubTicket") return Promise.resolve(result).then((value) => ({ data: importGitHubTicketResponseSchema.parse(value.data) }));
      if (changeSetCommandToolNames.has(name)) return projectCommandResult(result);
      return result && typeof result === "object" && "then" in result ? result.catch((error) => { throw asDomainError(error); }) : result;
    } catch (error) {
      if (name === "SubmitChangeSet" && error instanceof ZodError) {
        const index = error.issues.find((issue) => issue.path[0] === "operations" && typeof issue.path[1] === "number")?.path[1];
        const operations = input && typeof input === "object" && "operations" in input && Array.isArray(input.operations) ? input.operations : [];
        const operationId = typeof index === "number" ? operations[index]?.operationId : undefined;
        throw new DomainError("validation", "Request validation failed.", { issues: error.issues, ...(index !== undefined ? { index, operationId } : {}) });
      }
      throw asDomainError(error);
    }
  }, { atomic: atomic && !changeSetCommandToolNames.has(name) });
}

interface ToolAuditContext { projectId: string | undefined; name: McpToolName }

function authorizeTool(context: RegistrationContext, audit: ToolAuditContext): void {
  const tool = storyMapperMcpTools.find((candidate) => candidate.name === audit.name)!;
  if (audit.projectId) {
    const safety = context.repository.getSafetySettings(audit.projectId);
    if (!agentAccessEnabled(safety)) {
      const error = new DomainError("disabled", "Agent access is disabled for this project.");
      throw error;
    }
    if (tool.permission === "approval" && !agentApprovalAllowed(safety)) {
      throw new DomainError("disabled", "Agent ChangeSet approval is disabled for this project.");
    }
    if (agentProtected(safety) && isBlockedByAgentProtection(tool)) {
      const error = new DomainError("protected", `${audit.name} is blocked while agent protection is enabled.`);
      throw error;
    }
    if (!safety.github && tool.permission === "github") {
      const error = new DomainError("disabled", "GitHub is disabled by the safety switch.");
      throw error;
    }
  }
  const permissions = context.options.permissions ?? (audit.projectId ? permissionsForProject(context.repository, audit.projectId) : permissionsForUnknownProject());
  if (canUseTool(tool, permissions)) return;
  const error = new DomainError("disabled", audit.name+" is disabled by MCP permissions.");
  throw error;
}

function isBlockedByAgentProtection(tool: { name: McpToolName; permission: string }): boolean {
  return tool.name === "ApplyChangeSet" || tool.name === "PushCardsToGitHub" || (tool.permission === "write" && !changeSetCommandToolNames.has(tool.name));
}

function permissionsForProject(repository: StoryMapperRepository, projectId: string): McpPermissionSettings {
  const settings = repository.getSafetySettings(projectId);
  const writesAllowed = agentAccessEnabled(settings);
  return {
    read: agentAccessEnabled(settings),
    proposal: agentAccessEnabled(settings),
    approval: agentApprovalAllowed(settings),
    write: writesAllowed,
    github: agentAccessEnabled(settings) && settings.github,
    admin: false
  };
}

function permissionsForUnknownProject(): McpPermissionSettings {
  return {
    read: true,
    proposal: true,
    approval: false,
    write: false,
    github: false,
    admin: false
  };
}

function resolveStoryMapProjectId(repository: StoryMapperRepository, storyMapId: string): string | undefined {
  return repository.listStoryMaps().find((map) => map.id === storyMapId)?.projectId;
}

function resolveCardProjectId(repository: StoryMapperRepository, cardId: string): string | undefined {
  const card = repository.getCardDetails(cardId);
  return card ? resolveStoryMapProjectId(repository, card.storyMapId) : undefined;
}

async function projectCommandResult(pending: McpToolResult | Promise<McpToolResult>): Promise<McpToolResult> {
  const result = await pending;
  return changeSetCommandResponseSchema.parse(await result.data);
}
