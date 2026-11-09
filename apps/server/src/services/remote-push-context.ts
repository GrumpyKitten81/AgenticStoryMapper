import { agentAccessEnabled, agentProtected } from "@storymapper/core";
import { createHash } from "node:crypto";
import { DomainError, canonicalWorkItemId, remoteWorkItemIdentity, isWorkItemProvider, type ActorContext, type ConnectorConnection, type RemotePushPlan } from "@storymapper/contracts";
import type { StoryMapperRepository, UnitOfWork, TransactionRepositories } from "@storymapper/db";
import type { RemoteMilestone } from "@storymapper/contracts";
import { remoteMilestoneIdentity, type RemoteWorkItem } from "@storymapper/github";
import { CommittedUnitOfWorkError } from "@storymapper/db";

export interface RemotePushContext {
  repository: StoryMapperRepository;
  unitOfWork: UnitOfWork;
  actor: ActorContext;
  connection: ConnectorConnection;
  database: UnitOfWork["handle"]["current"];
  storyMapId: string;
  localOrigin?: (() => string | undefined) | undefined;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry)).digest("hex");
}

export function pushContext(repository: StoryMapperRepository, unitOfWork: UnitOfWork, actor: ActorContext, storyMapId: string, connectionId: string): RemotePushContext {
  const connection = repository.getConnectorConnection(connectionId);
  const map = repository.listStoryMaps().find((row) => row.id === storyMapId);
  if (!connection || !map) throw new DomainError("not_found", "Story Map or connection not found.");
  if (map.projectId !== connection.projectId) throw new DomainError("validation", "Connection belongs to another Project.");
  const context = { repository, unitOfWork, actor, connection, database: unitOfWork.handle.current, storyMapId };
  assertPushContext(context);
  return context;
}

export function assertPushContext(context: RemotePushContext): void {
  const { repository, unitOfWork, actor, connection, storyMapId } = context;
  if (unitOfWork.handle.current !== context.database) throw new DomainError("conflict", "Database changed; prepare a new Dry Run.");
  const map = repository.listStoryMaps().find((row) => row.id === storyMapId);
  if (!map || map.projectId !== connection.projectId || fingerprint(repository.getConnectorConnection(connection.id)) !== fingerprint(connection)) throw new DomainError("conflict", "Connection or ownership changed; prepare a new Dry Run.");
  const safety = repository.getSafetySettings(connection.projectId);
  if (actor.actorType !== "human" && agentProtected(safety)) throw new DomainError("protected", "Project is protected from agent remote writes.");
  if (!safety.github || actor.actorType === "agent" && !agentAccessEnabled(safety)) throw new DomainError("disabled", "GitHub command access is disabled for this Project.");
  if (connection.readOnly) throw new DomainError("disabled", "Connection is read-only; GitHub writes are disabled.");
}

export function localPushFingerprint(repository: StoryMapperRepository<"root" | "transaction">, storyMapId: string, selection: RemotePushPlan["selection"]): string {
  const snapshot = repository.getStoryMapSnapshot(storyMapId);
  if (!snapshot) throw new DomainError("not_found", "Story Map not found.");
  const cards = snapshot.cards.filter((card) => (!selection.cardIds || selection.cardIds.includes(card.id)) && (selection.releaseId === undefined || card.releaseId === selection.releaseId));
  const releases = snapshot.releases.filter((release) => release.id === selection.releaseId || cards.some((card) => card.releaseId === release.id));
  const ids = new Set(cards.map((card) => card.id));
  const releaseIds = new Set(releases.map((release) => release.id));
  const externalRefs = snapshot.externalRefs.filter((row) => isWorkItemProvider(row.system) && (row.entityType === "card" ? ids.has(row.entityId) : row.entityType === "release" && releaseIds.has(row.entityId)));
  const memberships = snapshot.remoteWorkItemLinks.filter((row) => row.cardId && ids.has(row.cardId) || row.releaseId && releaseIds.has(row.releaseId));
  return fingerprint({ map: snapshot.storyMap, cards, releases, externalRefs, memberships, annotations: snapshot.annotations, assignments: snapshot.cardAnnotations.filter((row) => ids.has(row.cardId)), conflicts: repository.listOpenSyncConflicts(storyMapId).filter((row) => row.cardId && ids.has(row.cardId)) });
}

export function assertReviewedInputs(context: RemotePushContext, plan: RemotePushPlan, expectedLocalFingerprint = plan.localFingerprint): void {
  assertPushContext(context);
  if (context.localOrigin) assertReviewedOrigin(plan, context.localOrigin());
  const safety = context.repository.getSafetySettings(plan.projectId);
  if (safety.epoch !== plan.epoch || fingerprint(safety) !== plan.safetyFingerprint || fingerprint(context.connection) !== plan.connectionFingerprint || localPushFingerprint(context.repository, plan.storyMapId, plan.selection) !== expectedLocalFingerprint) throw new DomainError("conflict", "Dry Run inputs changed; prepare and review a new plan.");
}

function assertReviewedOrigin(plan: RemotePushPlan, origin: string | undefined): void {
  for (const item of plan.items) {
    if (item.kind !== "issue") continue;
    const footer = item.payload.body.match(/<!-- storymapper:footer:start -->[\s\S]*?<!-- storymapper:footer:end -->/u)?.[0];
    if (!footer) continue;
    const link = footer.match(/\]\((https?:\/\/[^\s)]+)\)/u)?.[1];
    if (!origin || !link || new URL(link).origin !== new URL(origin).origin) throw new DomainError("conflict", "The served Agentic Story Mapper origin changed. Prepare and review a new Dry Run.");
  }
}

export function committedWrite<Result>(context: Pick<RemotePushContext, "unitOfWork" | "actor">, write: (repositories: TransactionRepositories) => Result extends PromiseLike<unknown> ? never : Result): Result {
  try {
    return context.unitOfWork.run(context.actor, write) as Result;
  } catch (error) {
    if (error instanceof CommittedUnitOfWorkError) return error.result as Result;
    throw error;
  }
}

export function assertRemotePushTarget(context: Pick<RemotePushContext, "repository" | "connection" | "storyMapId">, kind: "issue" | "milestone", remote: RemoteWorkItem | RemoteMilestone, requestedId?: string, externalRefId?: string): string {
  if (kind === "issue" ? !("body" in remote) : !("description" in remote)) throw new DomainError("validation", "Remote target kind does not match the reviewed effect.");
  const canonicalId = canonicalWorkItemId(context.connection.provider, remoteWorkItemIdentity(context.connection, remote, kind === "issue" ? "issues" : "milestone"));
  if ("body" in remote) remoteMilestoneIdentity(context.connection, remote);
  if (requestedId !== undefined && remote.remoteId !== requestedId) throw new DomainError("conflict", "Provider returned a different requested remote identity.");
  if (externalRefId !== undefined) {
    const ref = context.repository.listExternalRefsForStoryMap(context.storyMapId).find((row) => row.id === externalRefId);
    if (!ref || ref.system !== context.connection.provider || ref.externalId !== canonicalId) throw new DomainError("conflict", "Provider returned a different bound canonical identity.");
  }
  return canonicalId;
}

export function assertRemotePushMilestones(context: Pick<RemotePushContext, "repository" | "connection" | "storyMapId">, milestones: readonly RemoteMilestone[]): void {
  for (const milestone of milestones) assertRemotePushTarget(context, "milestone", milestone);
}
