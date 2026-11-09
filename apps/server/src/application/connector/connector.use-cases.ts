import { connectorConnectionSchema, DomainError, type ActorContext, type CapabilityDescriptor, type ConnectorConnection, type ConnectorConnectionResponse, type ConnectorConnectionsResponse, type CreateConnectorConnectionRequest, type OkResponse, type UpdateConnectorConnectionRequest, type ValidateConnectorConnectionRequest, type ValidateConnectorConnectionResponse } from "@storymapper/contracts";
import { createWorkItemProvider } from "@storymapper/github";
import { requireActor, requireHumanActor } from "@storymapper/server/application/actors";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { requireEntity, requirePatch } from "@storymapper/server/application/validation";
import { providerCredentialStatuses, resolveProviderAuth } from "@storymapper/server/services/credentials";

export const listConnectorConnectionsDescriptor: CapabilityDescriptor = { name: "listConnectorConnections", kind: "read", route: "GET /api/connectors/connections", tool: "ListConnectorConnections" };
export const listGitHubStatusProjectsDescriptor: CapabilityDescriptor = { name: "listGitHubStatusProjects", kind: "human-only", route: "POST /api/connectors/status-projects" };
export async function listGitHubStatusProjects(deps: ApplicationDeps, actor: ActorContext, body: ValidateConnectorConnectionRequest): Promise<{ projects: Array<{ id: string; name: string; fieldId: string }> }> {
  requireHumanActor(actor);
  const database = deps.unitOfWork.handle.current;
  if (!deps.repository.getSafetySettings(body.projectId).github) throw new DomainError("disabled", "GitHub is disabled by the safety switch.");
  const now = new Date().toISOString();
  const connection = { ...body, id: "00000000-0000-4000-8000-000000000000", createdAt: now, updatedAt: now };
  const parsed = connectorConnectionSchema.parse(connection);
  const provider = createWorkItemProvider(parsed.provider);
  if (!provider.listStatusProjects) throw new DomainError("validation", "Provider does not support GitHub Project status discovery.");
  const auth = await resolveProviderAuth(parsed);
  if (database !== deps.unitOfWork.handle.current || !deps.repository.getSafetySettings(body.projectId).github) throw new DomainError("conflict", "GitHub context changed during Project discovery.");
  const projects = await provider.listStatusProjects(auth.connection, auth.auth);
  if (database !== deps.unitOfWork.handle.current || !deps.repository.getSafetySettings(body.projectId).github) throw new DomainError("conflict", "GitHub context changed during Project discovery.");
  return { projects };
}
export function listConnectorConnections(deps: ApplicationDeps, actor: ActorContext, projectId: string): ConnectorConnectionsResponse {
  requireActor(actor);
  return { connections: deps.repository.listConnectorConnections(projectId).map((connection) => deps.repository.publicConnectorConnection(connection)) };
}

export const createConnectorConnectionDescriptor: CapabilityDescriptor = { name: "createConnectorConnection", kind: "human-only", route: "POST /api/connectors/connections" };
export function createConnectorConnection(deps: ApplicationDeps, actor: ActorContext, body: CreateConnectorConnectionRequest): ConnectorConnectionResponse {
  requireHumanActor(actor);
  return { connection: deps.repository.publicConnectorConnection(deps.unitOfWork.run(actor, ({ repository }) => repository.createConnectorConnection(body))) };
}

export const updateConnectorConnectionDescriptor: CapabilityDescriptor = { name: "updateConnectorConnection", kind: "human-only", route: "PATCH /api/connectors/connections/:connectionId" };
export function updateConnectorConnection(deps: ApplicationDeps, actor: ActorContext, connectionId: string, body: UpdateConnectorConnectionRequest): ConnectorConnectionResponse {
  requireHumanActor(actor);
  requirePatch(body);
  return { connection: deps.repository.publicConnectorConnection(requireEntity(deps.unitOfWork.run(actor, ({ repository }) => repository.updateConnectorConnection(connectionId, body)), "Connector connection")) };
}

export const deleteConnectorConnectionDescriptor: CapabilityDescriptor = { name: "deleteConnectorConnection", kind: "human-only", route: "DELETE /api/connectors/connections/:connectionId" };
export function deleteConnectorConnection(deps: ApplicationDeps, actor: ActorContext, connectionId: string): OkResponse {
  requireHumanActor(actor);
  return { ok: deps.unitOfWork.run(actor, ({ repository }) => repository.deleteConnectorConnection(connectionId)) };
}

export const validateConnectorConnectionDescriptor: CapabilityDescriptor = { name: "validateConnectorConnection", kind: "human-only", route: "POST /api/connectors/connections/validate" };
export async function validateConnectorConnection(deps: ApplicationDeps, actor: ActorContext, body: ValidateConnectorConnectionRequest): Promise<ValidateConnectorConnectionResponse> {
  requireHumanActor(actor);
  const database = deps.unitOfWork.handle.current;
  const assertEnabled = () => {
    if (database !== deps.unitOfWork.handle.current) throw new DomainError("conflict", "Database changed during connector validation.");
    if (body.provider === "github" && !deps.repository.getSafetySettings(body.projectId).github) throw new DomainError("disabled", "GitHub is disabled by the safety switch.");
  };
  assertEnabled();
  const provider = createWorkItemProvider(body.provider);
  const credentials = await providerCredentialStatuses(body.provider);
  assertEnabled();
  const now = new Date().toISOString();
  const connection: ConnectorConnection = { id: "00000000-0000-4000-8000-000000000000", projectId: body.projectId, provider: body.provider, name: body.name, authMode: body.authMode, owner: body.owner, repository: body.repository, defaultLabel: body.defaultLabel ?? "local-story-map", readOnly: body.readOnly ?? true, statusSource: body.statusSource, statusMapping: body.statusMapping ?? [], issueTypeMapping: body.issueTypeMapping ?? [], typeMapping: body.typeMapping ?? [{ match: "epic", level: "activity" }, { match: "feature", level: "step" }], releaseSource: body.releaseSource ?? "milestone", iterationFieldName: body.iterationFieldName ?? "Iteration", labelsAsAnnotations: body.labelsAsAnnotations ?? false, createdAt: now, updatedAt: now };
  const authContext = await resolveProviderAuth(connection);
  assertEnabled();
  const result = await provider.validateConnection(authContext.connection, authContext.auth);
  assertEnabled();
  if (!result.ok) throw new DomainError("validation", result.message);
  return { ...result, provider: body.provider, credentials: credentials.map((status) => {
    const selected = status.source === authContext.auth.source;
    return selected ? { ...status, selected, configured: true, unusable: false, message: "These selected credentials were used for this verification." } : { ...status, selected };
  }) };
}
