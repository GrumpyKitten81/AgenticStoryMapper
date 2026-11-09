import { parseStoredJson } from "@storymapper/db/versioned-json";
import { storeWorkItemReference } from "@storymapper/db/repositories/github-refs-repository";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { DomainError, parseGitHubLocator, parseWorkItemLocator, remoteWorkItemIdentity, canonicalWorkItemId, workItemScopeMatches } from "@storymapper/contracts";
import type { ConnectorConnection, CreateConnectorConnectionRequest, RemoteWorkItemLink, RemoteWorkItemSyncState, SyncConflict, SyncPlan, SyncRun, UpdateConnectorConnectionRequest } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";
import { cards, releases, connectorConnections, storyMaps, remoteWorkItemLinks, externalRefs, syncConflicts, syncRuns } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { toStoryMap, toConnectorConnection, toRemoteWorkItemLink, toSyncRun, toSyncConflict } from "@storymapper/db/repositories/row-mappers";
import { labelsForStatus, stateForStatus, unique, ImportRemoteWorkItem, detectImportLevel, remoteStateToLocalStatus, compact } from "@storymapper/db/repositories/repository-values";
import { buildGitHubIssueBody } from "@storymapper/core";
import { trackLiveActivity } from "@storymapper/db/live-change-tracking";

export function listConnectorConnections(this: StoryMapperRepository<"transaction">, projectId: string): ConnectorConnection[] {
    this.context.database;
    return this.db
      .select()
      .from(connectorConnections)
      .where(eq(connectorConnections.projectId, projectId))
      .orderBy(asc(connectorConnections.createdAt))
      .all()
      .map(toConnectorConnection);
  }

export function getConnectorConnection(this: StoryMapperRepository<"transaction">, connectionId: string): ConnectorConnection | undefined {
    this.context.database;
    const row = this.db.select().from(connectorConnections).where(eq(connectorConnections.id, connectionId)).get();
    return row ? toConnectorConnection(row) : undefined;
  }

export function publicConnectorConnection(this: StoryMapperRepository<"transaction">, connection: ConnectorConnection): ConnectorConnection {
    this.context.database;
    return connection;
  }

export function createConnectorConnection(this: StoryMapperRepository<"transaction">, input: CreateConnectorConnectionRequest): ConnectorConnection {
    this.assertWritable();
      const now = new Date().toISOString();
      const connection: typeof connectorConnections.$inferInsert = {
        id: randomUUID(),
        projectId: input.projectId,
        provider: input.provider,
        name: input.name,
        authMode: input.authMode,
        owner: input.owner,
        repository: input.repository ?? null,
        defaultLabel: input.defaultLabel ?? "local-story-map",
        readOnly: input.readOnly ?? true,
        statusSourceSchemaVersion: 1, statusSourceJson: JSON.stringify(input.statusSource ?? { kind: "repository" }),
        statusMappingSchemaVersion: 1, statusMappingJson: JSON.stringify(input.statusMapping ?? []),
        issueTypeMappingSchemaVersion: 1, issueTypeMappingJson: JSON.stringify(input.issueTypeMapping ?? []),
        typeMappingSchemaVersion: 1, typeMappingJson: JSON.stringify(input.typeMapping ?? [{ match: "epic", level: "activity" }, { match: "feature", level: "step" }]),
        releaseSource: input.releaseSource ?? "milestone",
        iterationFieldName: input.iterationFieldName ?? "Iteration",
        labelsAsAnnotations: input.labelsAsAnnotations ?? false,
        createdAt: now,
        updatedAt: now
      };
      this.ensureSafetySettings(input.projectId);
      this.db.insert(connectorConnections).values(connection).run();
      if (input.provider === "github") this.gettingStarted.complete(input.projectId, "connectGitHub");
      const created = this.getConnectorConnection(connection.id);
      if (!created) {
        throw new DomainError("internal", "Connector connection could not be created.");
      }
      this.logActivity(input.projectId, "connectorConnection.created", "connectorConnection", created.id, undefined, created);
      return created;
    }

export function updateConnectorConnection(this: StoryMapperRepository<"transaction">, connectionId: string, input: UpdateConnectorConnectionRequest): ConnectorConnection | undefined {
    this.assertWritable();
    const before = this.getConnectorConnection(connectionId);
    if (!before) {
      return undefined;
    }
    const updateValues = compact({
      name: input.name,
      statusSourceSchemaVersion: 1, statusSourceJson: input.statusSource ? JSON.stringify(input.statusSource) : undefined,
      authMode: input.authMode,
      owner: input.owner,
      repository: input.repository,
      defaultLabel: input.defaultLabel,
      readOnly: input.readOnly,
      statusMappingSchemaVersion: 1, statusMappingJson: input.statusMapping ? JSON.stringify(input.statusMapping) : undefined,
      issueTypeMappingSchemaVersion: 1, issueTypeMappingJson: input.issueTypeMapping ? JSON.stringify(input.issueTypeMapping) : undefined,
      typeMappingSchemaVersion: 1, typeMappingJson: input.typeMapping ? JSON.stringify(input.typeMapping) : undefined,
      releaseSource: input.releaseSource,
      iterationFieldName: input.iterationFieldName,
      labelsAsAnnotations: input.labelsAsAnnotations,
      updatedAt: new Date().toISOString()
    });
    this.db.update(connectorConnections).set(updateValues).where(eq(connectorConnections.id, connectionId)).run();
    const after = this.getConnectorConnection(connectionId);
    if (!after) {
      return undefined;
    }
    this.logActivity(before.projectId, "connectorConnection.updated", "connectorConnection", connectionId, before, after);
    return after;
  }

export function deleteConnectorConnection(this: StoryMapperRepository<"transaction">, connectionId: string): boolean {
    this.assertWritable();
    const before = this.getConnectorConnection(connectionId);
    if (!before) {
      return false;
    }
    const maps = this.db.select().from(storyMaps).where(eq(storyMaps.defaultConnectionId, connectionId)).all();
    for (const map of maps) {
      this.db.update(storyMaps).set({ defaultConnectionId: null, updatedAt: new Date().toISOString() }).where(eq(storyMaps.id, map.id)).run();
      this.bumpRootVersion("storyMaps", map.id);
      const after = toStoryMap(this.db.select().from(storyMaps).where(eq(storyMaps.id, map.id)).get()!);
      this.logActivity(map.projectId, "storyMap.updated", "storyMap", map.id, toStoryMap(map), after);
    }
    this.db.delete(connectorConnections).where(eq(connectorConnections.id, connectionId)).run();
    this.logActivity(before.projectId, "connectorConnection.deleted", "connectorConnection", connectionId, before, undefined);
    return true;
  }

export function createWorkItemPushPlan(this: StoryMapperRepository<"transaction">, input: { localOrigin?: string | undefined; storyMapId: string; connectionId: string; cardIds?: string[] | undefined; releaseId?: string | null | undefined; parentIssueNumber?: number | undefined; mode: SyncPlan["mode"] }): SyncPlan {
    this.assertWritable();
    const snapshot = this.getStoryMapSnapshot(input.storyMapId);
    const connection = this.getConnectorConnection(input.connectionId);
    if (!snapshot || !connection) {
      throw new DomainError("not_found", "Story map or connector connection not found.");
    }
    if (snapshot.storyMap.projectId !== connection.projectId) throw new DomainError("validation", "Connection belongs to another Project.");
    if (input.cardIds?.some((id) => !snapshot.cards.some((card) => card.id === id))) throw new DomainError("validation", "Selected Card does not belong to this Story Map.");
    if (input.releaseId && !snapshot.releases.some((release) => release.id === input.releaseId)) throw new DomainError("validation", "Selected Release does not belong to this Story Map.");
    const selectedCardIds = input.cardIds === undefined ? undefined : new Set(input.cardIds);
    const existingLinks = new Map(
      this.listRemoteWorkItemLinksForStoryMap(input.storyMapId)
        .filter((link) => link.connectionId === input.connectionId && link.cardId)
        .map((link) => [link.cardId, link])
    );
    const releaseNameById = new Map(snapshot.releases.map((release) => [release.id, release.name]));
    const items = visibleCards(snapshot.cards)
      .filter((card) => card.level !== "note")
      .filter((card) => !selectedCardIds || selectedCardIds.has(card.id))
      .filter((card) => input.releaseId === undefined || card.releaseId === input.releaseId)
      .map((card) => {
        const existing = existingLinks.get(card.id);
        if (!existing && snapshot.externalRefs.some((ref) => ref.system === connection.provider && ref.entityType === "card" && ref.entityId === card.id)) throw new DomainError("conflict", "A source-only GitHub reference does not grant outbound synchronization ownership.");
        const labels = [connection.defaultLabel, ...labelsForStatus(connection, card.status), `story-map:${snapshot.storyMap.cardKeyPrefix}`, `level:${card.level}`];
        return {
          cardId: card.id,
          action: existing ? "update" as const : "create" as const,
          title: card.title,
          body: buildGitHubIssueBody(card, snapshot.storyMap.name, { origin: input.localOrigin!, projectId: snapshot.storyMap.projectId }),
          labels: unique(labels),
          milestone: card.releaseId ? releaseNameById.get(card.releaseId) : undefined,
          githubIssueType: connection.issueTypeMapping.find((entry) => entry.cardType === card.cardType)?.issueType,
          parentIssueNumber: input.parentIssueNumber,
          remoteState: stateForStatus(connection, card.status),
          remoteId: existing?.remoteId
        };
      });

    return {
      storyMapId: input.storyMapId,
      connectionId: input.connectionId,
      provider: connection.provider,
      mode: input.mode,
      items
    };
  }

export function createSyncRun(this: StoryMapperRepository<"transaction">, input: { storyMapId: string; connectionId: string; mode: SyncRun["mode"]; status: SyncRun["status"]; summary?: string }): SyncRun {
    this.assertWritable();
    const storyMap = this.getStoryMapOrThrow(input.storyMapId);
    const connection = this.getConnectorConnection(input.connectionId);
    if (!connection) {
      throw new DomainError("not_found", `Connector connection ${input.connectionId} not found.`);
    }
    const run: SyncRun = {
      id: randomUUID(),
      projectId: storyMap.projectId,
      storyMapId: input.storyMapId,
      connectionId: input.connectionId,
      provider: connection.provider,
      mode: input.mode,
      status: input.status,
      summary: input.summary ?? "",
      createdAt: new Date().toISOString()
    };
    this.db.insert(syncRuns).values(run).run();
    this.logActivity(storyMap.projectId, `workItemSync.${input.mode}.${input.status}`, "syncRun", run.id, undefined, run);
    return run;
  }

export function upsertRemoteWorkItemLink(this: StoryMapperRepository<"transaction">, input: Omit<RemoteWorkItemSyncState, "id" | "syncState" | "parentOverrideLocal"> & { syncState?: RemoteWorkItemLink["syncState"] | undefined; parentOverrideLocal?: boolean | undefined }): RemoteWorkItemLink {
  this.assertWritable();
  const ref = this.db.select().from(externalRefs).where(and(eq(externalRefs.id, input.externalRefId))).get();
  const connection = this.getConnectorConnection(input.connectionId);
  const locator = ref && parseWorkItemLocator(ref.system, ref.externalId);
  const owner = ref?.entityType === "card" ? this.getCard(ref.entityId) : ref?.entityType === "release" ? this.getRelease(ref.entityId) : undefined;
  if (!ref || !connection || !locator || !owner) throw new DomainError("not_found", "Canonical GitHub reference or connection not found.");
  if (this.getStoryMapOrThrow(owner.storyMapId).projectId !== connection.projectId || !workItemScopeMatches(locator, connection)) throw new DomainError("validation", "GitHub sync scope and connection disagree.");
  if (ref.entityType === "card" ? locator.resource !== "issues" || "level" in owner && owner.level === "note" : locator.resource !== "milestone") throw new DomainError("validation", "Outbound sync requires a Card Issue or Release Milestone.");
  const existing = this.db.select().from(remoteWorkItemLinks).where(eq(remoteWorkItemLinks.externalRefId, ref.id)).get();
  if (existing && existing.connectionId !== connection.id) throw new DomainError("conflict", "GitHub identity already belongs to another connection.");
  const values = { statusEvidenceJson: input.statusEvidence ? JSON.stringify(input.statusEvidence) : existing?.statusEvidenceJson ?? null, statusEvidenceSchemaVersion: input.statusEvidence ? 1 : existing?.statusEvidenceSchemaVersion ?? null, labelsSchemaVersion: 1, managedLabelsSchemaVersion: 1, baselineSchemaVersion: input.baseline ? 1 : existing?.baselineSchemaVersion ?? null, externalRefId: ref.id, connectionId: connection.id, baselineJson: input.baseline ? JSON.stringify(input.baseline) : existing?.baselineJson ?? null, titleHash: input.titleHash ?? null, bodyHash: input.bodyHash ?? null,
    remoteState: input.remoteState ?? null, issueType: input.issueType ?? existing?.issueType ?? null, managedLabelsJson: JSON.stringify(input.managedLabels ?? (existing ? parseStoredJson("remote_work_item_links", "managed_labels_json", existing.managedLabelsJson, existing.managedLabelsSchemaVersion) : [])), labelsJson: JSON.stringify(input.labels), milestone: input.milestone ?? null,
    remoteParentNumber: input.remoteParentNumber ?? null, parentOverrideLocal: input.parentOverrideLocal ?? existing?.parentOverrideLocal ?? false,
    syncState: input.syncState ?? "synced", lastSyncedAt: input.lastSyncedAt ?? new Date().toISOString() };
  const id = existing?.id ?? randomUUID();
  if (existing) this.db.update(remoteWorkItemLinks).set(values).where(eq(remoteWorkItemLinks.id, id)).run();
  else this.db.insert(remoteWorkItemLinks).values({ id, ...values }).run();
  const result = toRemoteWorkItemLink({ id, ...values }, ref);
  trackLiveActivity(this.db, this.context.transaction!, connection.projectId, "remoteWorkItemLink", id, existing ? toRemoteWorkItemLink(existing, ref) : undefined, result);
  return result;
}

export function bindRemoteWorkItemLink(this: StoryMapperRepository<"transaction">, input: Omit<RemoteWorkItemLink, "id" | "externalRefId" | "syncState" | "parentOverrideLocal" | "remoteNumber"> & { remoteNumber?: number | undefined; identity?: import("@storymapper/contracts").WorkItemIdentity | undefined; syncState?: RemoteWorkItemLink["syncState"] | undefined; parentOverrideLocal?: boolean | undefined }): RemoteWorkItemLink {
  this.assertWritable();
  const connection = this.getConnectorConnection(input.connectionId);
  if (!connection || connection.provider !== input.provider) throw new DomainError("validation", "Remote binding provider and connection disagree.");
  const locator = remoteWorkItemIdentity(connection, input, input.cardId ? "issues" : "milestone");
  if (Boolean(input.cardId) === Boolean(input.releaseId)) throw new DomainError("validation", "Exactly one Card or Release must own a remote reference.");
  const entityType = input.cardId ? "card" : "release", entityId = (input.cardId ?? input.releaseId)!;
  const owner = entityType === "card" ? this.getCard(entityId) : this.getRelease(entityId);
  if (!owner || this.getStoryMapOrThrow(owner.storyMapId).projectId !== connection.projectId) throw new DomainError("validation", "GitHub sync scope and connection disagree.");
  const externalId = canonicalWorkItemId(connection.provider, locator);
  const ref = storeWorkItemReference(this, { id: randomUUID(), entityType, entityId, scopeId: owner.storyMapId, system: connection.provider, externalId, syncedVersion: owner.version, createdAt: new Date().toISOString() });
  return this.upsertRemoteWorkItemLink({ ...input, externalRefId: ref.id });
}

export function listRemoteWorkItemLinksForStoryMap(this: StoryMapperRepository<"transaction">, storyMapId: string): RemoteWorkItemLink[] {
  this.context.database;
  if (!this.isStoryMapVisible(storyMapId)) return [];
  return this.db.select({ state: remoteWorkItemLinks, ref: externalRefs }).from(remoteWorkItemLinks)
    .innerJoin(externalRefs, eq(remoteWorkItemLinks.externalRefId, externalRefs.id)).where(eq(externalRefs.scopeId, storyMapId))
    .orderBy(sql`${remoteWorkItemLinks}.rowid`).all().map(({ state, ref }) => toRemoteWorkItemLink(state, ref));
}

export function getWorkItemSyncHealthData(this: StoryMapperRepository<"transaction">, storyMapId: string): import("@storymapper/contracts").WorkItemSyncHealthData {
  this.context.database;
  const storyMap = this.getStoryMapOrThrow(storyMapId);
  const runs = this.db.select().from(syncRuns).where(eq(syncRuns.storyMapId, storyMapId)).orderBy(asc(syncRuns.createdAt)).all().map(toSyncRun);
  return { annotations: this.listAnnotations(storyMap.projectId, storyMapId), cardAnnotations: this.listCardAnnotationsForStoryMap(storyMapId), storyMap, cards: this.listCards(storyMapId), releases: this.listReleases(storyMapId), connections: this.listConnectorConnections(storyMap.projectId), links: this.listRemoteWorkItemLinksForStoryMap(storyMapId), runs, openConflicts: this.listOpenSyncConflicts(storyMapId), deletedRefs: this.listDeletedGitHubRefs(storyMap.projectId, storyMapId) };
}

export function createSyncConflict(this: StoryMapperRepository<"transaction">, input: Omit<SyncConflict, "id" | "status" | "createdAt">): SyncConflict {
    this.assertWritable();
    validateSyncConflictOwner(this, input);
    const existing = this.db.select().from(syncConflicts).where(and(eq(syncConflicts.externalRefId, input.externalRefId), eq(syncConflicts.field, input.field), eq(syncConflicts.status, "open"))).get();
    if (existing) return toSyncConflict(existing);
    const conflict: SyncConflict = {
      id: randomUUID(),
      ...input,
      status: "open",
      createdAt: new Date().toISOString()
    };
    this.db.insert(syncConflicts).values({
      id: conflict.id,
      externalRefId: conflict.externalRefId,
      syncRunId: conflict.syncRunId,
      connectionId: conflict.connectionId,
      cardId: conflict.cardId ?? null,
      remoteId: conflict.remoteId ?? null,
      field: conflict.field,
      localValueSchemaVersion: 1, localValueJson: JSON.stringify(conflict.localValue),
      remoteValueSchemaVersion: 1, remoteValueJson: JSON.stringify(conflict.remoteValue),
      status: conflict.status,
      createdAt: conflict.createdAt,
      resolvedAt: null
    }).run();
    trackLiveActivity(this.db, this.context.transaction!, this.getConnectorConnection(input.connectionId)!.projectId, "syncConflict", conflict.id, undefined, conflict);
    return conflict;
  }

export function listOpenSyncConflicts(this: StoryMapperRepository<"transaction">, storyMapId: string): SyncConflict[] {
    this.context.database;
    if (!this.isStoryMapVisible(storyMapId)) return [];
    const cardIds = new Set(this.listCards(storyMapId).map((card) => card.id));
    return this.db
      .select()
      .from(syncConflicts)
      .where(eq(syncConflicts.status, "open"))
      .all()
      .filter((row) => Boolean(row.cardId && cardIds.has(row.cardId)))
      .map(toSyncConflict);
  }

export function getSyncConflict(this: StoryMapperRepository<"transaction">, conflictId: string): SyncConflict | undefined {
    this.context.database;
    const row = this.db.select().from(syncConflicts).where(eq(syncConflicts.id, conflictId)).get();
    return row ? toSyncConflict(row) : undefined;
  }

export function resolveSyncConflict(this: StoryMapperRepository<"transaction">, conflictId: string, resolution: "local" | "remote"): SyncConflict | undefined {
    this.assertWritable();
    const before = this.db.select().from(syncConflicts).where(eq(syncConflicts.id, conflictId)).get();
    if (!before) {
      return undefined;
    }
    if (before.status !== "open") throw new DomainError("conflict", "Sync conflict is no longer open.");
    validateSyncConflictOwner(this, toSyncConflict(before));
    const status = resolution === "local" ? "resolved-local" : "resolved-remote";
    this.db.update(syncConflicts).set({ status, resolvedAt: new Date().toISOString() }).where(eq(syncConflicts.id, conflictId)).run();
    const after = this.db.select().from(syncConflicts).where(eq(syncConflicts.id, conflictId)).get();
    if (after) trackLiveActivity(this.db, this.context.transaction!, this.getConnectorConnection(after.connectionId)!.projectId, "syncConflict", conflictId, toSyncConflict(before), toSyncConflict(after));
    return after ? toSyncConflict(after) : undefined;
  }

function validateSyncConflictOwner(repository: StoryMapperRepository<"transaction">, conflict: Pick<SyncConflict, "externalRefId" | "syncRunId" | "connectionId" | "cardId" | "remoteId">): void {
  const run = repository.db.select().from(syncRuns).where(eq(syncRuns.id, conflict.syncRunId)).get();
  const connection = repository.getConnectorConnection(conflict.connectionId);
  const card = conflict.cardId ? repository.getCard(conflict.cardId) : undefined;
  const binding = card && repository.listRemoteWorkItemLinksForStoryMap(card.storyMapId).find((row) => row.externalRefId === conflict.externalRefId);
  const ref = binding && repository.listExternalRefsForStoryMap(card!.storyMapId).find((row) => row.id === binding.externalRefId);
  const locator = ref && parseWorkItemLocator(ref.system, ref.externalId);
  if (!run || !connection || !card || !binding || !locator || !workItemScopeMatches(locator, connection) || run.provider !== connection.provider || run.connectionId !== connection.id || run.projectId !== connection.projectId || run.storyMapId !== card.storyMapId || binding.cardId !== card.id || binding.connectionId !== connection.id || binding.remoteId !== conflict.remoteId) throw new DomainError("validation", "Sync conflict canonical reference, Card, run and connection disagree.");
}

export function createWorkItemImportPlan(this: StoryMapperRepository<"transaction">, input: { storyMapId: string; connectionId: string; items: ImportRemoteWorkItem[] }): SyncPlan {
    this.assertWritable();
    this.getStoryMapOrThrow(input.storyMapId);
    const connection = this.getConnectorConnection(input.connectionId);
    if (!connection) {
      throw new DomainError("not_found", `Connector connection ${input.connectionId} not found.`);
    }
    const existingRemoteIds = new Set(this.listGitHubLinksForStoryMap(input.storyMapId).map((link) => link.url));
    const items = input.items.map((item) => {
      const level = detectImportLevel(connection, item);
      return compact({
        action: existingRemoteIds.has(parseGitHubLocator(item.url)?.url ?? item.url) ? "skip" as const : "create" as const,
        title: item.title,
        body: item.body,
        labels: item.labels,
        milestone: item.milestone,
        remoteState: item.state,
        remoteId: item.remoteId,
        reason: existingRemoteIds.has(parseGitHubLocator(item.url)?.url ?? item.url) ? "Already linked." : undefined,
        level,
        assignee: item.assignee,
        localStatus: remoteStateToLocalStatus(connection, item.state, item.labels)
      }) as SyncPlan["items"][number];
    });
    return {
      storyMapId: input.storyMapId,
      connectionId: input.connectionId,
      provider: connection.provider,
      mode: "import",
      items
    };
  }
