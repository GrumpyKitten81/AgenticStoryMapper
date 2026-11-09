import { randomUUID } from "node:crypto";
import { DomainError, cardSchema } from "@storymapper/contracts";
import type { ChangeSet, CopyStoryMapProposalRequest, GitHubBoardIssue, GitHubBoardProposalRequest, Card, ConnectorConnection } from "@storymapper/contracts";
import { createChangeSet } from "@storymapper/core";
import { boardImportValues } from "@storymapper/core/changesets/board-import-resolution";
import { mapFingerprint, storyMapInventory } from "@storymapper/db/repositories/map-copy-repository";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

const PREVIEW_STRING_LIMIT = 500;
const SYNC_CARD_FIELDS = ["title", "description", "status", "assignee"] as const;

export function proposeStoryMapCopy(this: StoryMapperRepository<"transaction">, input: CopyStoryMapProposalRequest): ChangeSet {
  this.assertWritable();
  const source = this.getStoryMapOrThrow(input.sourceStoryMapId);
  const targetId = randomUUID();
  return this.createChangeSet(createChangeSet({ id: randomUUID(), createdAt: new Date().toISOString(), projectId: source.projectId,
    title: `Copy ${source.name} to ${input.targetName}`, source: "import", operations: [{
      operationId: randomUUID(), op: "create", entity: "storyMapCopy", entityId: targetId,
      after: { input, expected: fingerprints(this, [source.id]), preview: {
        source: { id: source.id, name: source.name }, target: { id: targetId, name: input.targetName },
        inventory: storyMapInventory.call(this as unknown as StoryMapperRepository, source.id)
      } },
      reason: "Copy the complete Story Map and its owned relationships."
    }]
  }));
}

export function proposeGitHubBoard(this: StoryMapperRepository<"transaction">, input: GitHubBoardProposalRequest): ChangeSet {
  this.assertWritable();
  for (const issue of input.issues) normalizedTitle(issue);
  if (!this.listProjects().some((project) => project.id === input.projectId)) throw new DomainError("not_found", "Project not found.");
  const mapIds = input.cleanup ? this.listStoryMaps(input.projectId).map((map) => map.id) : input.storyMapId ? [input.storyMapId] : [];
  for (const mapId of mapIds) if (this.getStoryMapOrThrow(mapId).projectId !== input.projectId) throw new DomainError("validation", "Story Map belongs to another Project.");
  for (const cardId of input.removeCardIds) if (this.getCard(cardId)?.storyMapId !== input.storyMapId) throw new DomainError("validation", "Removal Card does not belong to the sync Story Map.");
  const existing = input.storyMapId ? existingIssueCards(this, input.storyMapId) : new Map<string, Card>();
  if (input.issues.some((issue) => input.removeCardIds.includes(existing.get(issueKey(issue.repository, issue.number))?.id ?? ""))) throw new DomainError("validation", "An imported issue cannot also be removed.");
  assertDistinctSyncTargets(input, existing);
  return this.createChangeSet(createChangeSet({ id: randomUUID(), createdAt: new Date().toISOString(), projectId: input.projectId,
    title: `${input.storyMapId ? "Sync" : "Import"} GitHub board: ${input.storyMapName}`, source: "import", operations: [{
      operationId: randomUUID(), op: "create", entity: "githubBoardImport", entityId: randomUUID(),
      after: { input, expected: fingerprints(this, mapIds), preview: {
        connectors: connectorPreviews(this, input),
        sync: syncPreviews(this, input, existing),
        cleanup: input.cleanup ? mapIds.map((id) => ({ id, name: this.getStoryMapOrThrow(id).name,
          inventory: { ...storyMapInventory.call(this as unknown as StoryMapperRepository, id),
            githubLinks: this.listGitHubLinksForStoryMap(id).length, remoteWorkItemLinks: this.listRemoteWorkItemLinksForStoryMap(id).length }
        })) : []
      } }, reason: `Read-only GitHub source: ${input.boardUrl}`
    }]
  }));
}

function fingerprints(repository: StoryMapperRepository<"transaction">, ids: string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, mapFingerprint.call(repository as unknown as StoryMapperRepository, id)]));
}

function existingIssueCards(repository: StoryMapperRepository<"transaction">, mapId: string): Map<string, Card> {
  const cards = new Map<string, Card>();
  for (const link of repository.listGitHubLinksForStoryMap(mapId)) {
    if (!link.cardId || !link.issueNumber) continue;
    const key = issueKey(link.repo, link.issueNumber);
    if (cards.has(key)) throw new DomainError("conflict", "Multiple Cards refer to the same GitHub issue.");
    const card = repository.getCard(link.cardId);
    if (card) cards.set(key, card);
  }
  return cards;
}

function connectorPreviews(repository: StoryMapperRepository<"transaction">, input: GitHubBoardProposalRequest) {
  const connections = repository.listConnectorConnections(input.projectId);
  return repositoryNames(input).map((name) => {
    const existing = matchingConnection(connections, name);
    return { repository: name, existingId: existing?.id ?? null,
      before: existing ? { projectId: existing.projectId, provider: existing.provider, owner: existing.owner, repository: existing.repository, readOnly: existing.readOnly } : null,
      after: { readOnly: true as const }
    };
  });
}

function assertDistinctSyncTargets(input: GitHubBoardProposalRequest, existing: Map<string, Card>): void {
  const targets = new Set<string>();
  for (const issue of input.issues) {
    const card = existing.get(issueKey(issue.repository, issue.number));
    if (!card) continue;
    if (targets.has(card.id)) throw new DomainError("conflict", "One Card refers to multiple incoming GitHub issues.");
    targets.add(card.id);
  }
}

function syncPreviews(repository: StoryMapperRepository<"transaction">, input: GitHubBoardProposalRequest, existing: Map<string, Card>) {
  const removals = input.removeCardIds.map((id) => cardIdentity(repository.getCard(id)!));
  const overwrites = input.issues.flatMap((issue) => {
    const current = existing.get(issueKey(issue.repository, issue.number));
    if (!current) return [];
    const values = boardImportValues(issue);
    const changed = SYNC_CARD_FIELDS.filter((field) => (current[field] ?? null) !== values[field]);
    return changed.length ? [{ ...cardIdentity(current), fields: Object.fromEntries(changed.map((field) => [field, {
      before: previewValue(current[field] ?? null), after: previewValue(values[field])
    }])) }] : [];
  });
  return { removals, overwrites };
}

function cardIdentity(card: Card) { return { id: card.id, key: card.key, title: previewValue(card.title) }; }
function previewValue(value: string | null) {
  return value !== null && value.length > PREVIEW_STRING_LIMIT ? { value: value.slice(0, PREVIEW_STRING_LIMIT), truncated: true as const, length: value.length } : value;
}

function repositoryNames(input: GitHubBoardProposalRequest): string[] { return [...new Set(input.issues.map((issue) => issue.repository.toLowerCase()))].sort(); }
function matchingConnection(connections: ConnectorConnection[], name: string): ConnectorConnection | undefined {
  const matches = connections.filter((connection) => connection.provider === "github" && `${connection.owner}/${connection.repository}`.toLowerCase() === name);
  if (matches.length > 1) throw new DomainError("conflict", "Multiple GitHub connectors refer to the same repository.");
  return matches[0];
}
function normalizedTitle(issue: GitHubBoardIssue): string { return cardSchema.shape.title.parse(issue.title.replace(/^[A-Z][A-Z0-9]*-\d+:\s*/, "")); }
function issueKey(repository: string, number: number): string { return `${repository.toLowerCase()}#${number}`; }
