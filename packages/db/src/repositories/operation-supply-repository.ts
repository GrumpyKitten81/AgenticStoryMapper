import { stripGitHubIssueFooter } from "@storymapper/core";
import { createHash, randomUUID } from "node:crypto";
import { DomainError, sourceDocumentSchema, type ChangeOperation, type OperationSnapshot, type OperationSupply } from "@storymapper/contracts";
import { ownValue } from "@storymapper/core/changesets/supply-values";
import { copyRows } from "@storymapper/core/changesets/copy-resolution";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function prepareOperationSupply(this: StoryMapperRepository, operations: readonly ChangeOperation[], snapshot: OperationSnapshot, preparedSourceImports?: OperationSupply["preparedSourceImports"]): OperationSupply {
  const createdAt = new Date().toISOString();
  const imports: NonNullable<OperationSupply["preparedSourceImports"]> extends Readonly<infer T> ? T : never = Object.assign(Object.create(null), preparedSourceImports);
  const ids: Record<string, string> = Object.create(null);
  const externalRefIds: Record<string, string> = Object.create(null);
  const copyIds: Record<string, Record<string, string>> = Object.create(null);
  const boardIds: Record<string, Record<string, string>> = Object.create(null);
  const boardHashes: NonNullable<OperationSupply["boardHashes"]> extends Readonly<infer T> ? T : never = Object.create(null);
  const roadmapSeedIds: Record<string, { columns: [string, string, string]; swimlane: string }> = Object.create(null);
  const bulkRelationshipIds: Record<string, Record<string, { persona: string; annotation: string }>> = Object.create(null);
  const syncTextHashes: Record<string, string> = Object.create(null);
  if (operations.some((operation) => operation.entity === "syncConflict" && operation.op === "resolve")) {
    for (const card of snapshot.cards) for (const text of [card.title, stripGitHubIssueFooter(card.description)]) syncTextHashes[text] = hash(text);
    for (const operation of operations) {
      if (operation.entity === "syncConflict" && operation.op === "resolve") for (const value of Object.values(operation.after.reviewed)) if (typeof value === "string") syncTextHashes[value] = hash(value);
      if (operation.entity === "card" && "title" in operation.after && typeof operation.after.title === "string") syncTextHashes[operation.after.title] = hash(operation.after.title);
      if (operation.entity === "card" && "description" in operation.after && typeof operation.after.description === "string") { const body = stripGitHubIssueFooter(operation.after.description); syncTextHashes[body] = hash(body); }
    }
  }
  for (const operation of operations) {
    ids[operation.operationId] = operation.entity === "storyMapCopy" ? operation.entityId : operation.entity === "sourceDocument" && Object.hasOwn(imports, operation.operationId) ? preparedSourceId(imports, operation.operationId) : randomUUID();
    externalRefIds[operation.operationId] = randomUUID();
    if (operation.entity === "storyMapCopy") copyIds[operation.operationId] = Object.assign(Object.create(null), Object.fromEntries(Object.values(copyRows(snapshot, operation.after.input.sourceStoryMapId)).flatMap((entries) => entries.map((row) => [row.id, randomUUID()]))));
    if (operation.entity === "roadmap" && operation.op === "create") roadmapSeedIds[operation.operationId] = { columns: [randomUUID(), randomUUID(), randomUUID()], swimlane: randomUUID() };
    if (operation.entity === "card" && operation.op === "bulk") bulkRelationshipIds[operation.operationId] = Object.assign(Object.create(null), Object.fromEntries(operation.after.cards.map((card) => [card.id, { persona: randomUUID(), annotation: randomUUID() }])));
    if (operation.entity === "githubBoardImport") {
      const entries: Record<string, string> = Object.assign(Object.create(null), { "parking:activity": randomUUID(), "parking:step": randomUUID() });
      const hashes: Record<string, { titleHash: string; bodyHash: string }> = Object.create(null);
      for (const issue of operation.after.input.issues) {
        const key = `${issue.repository.toLowerCase()}#${issue.number}`;
        for (const prefix of ["card", "github", "remote"]) entries[`${prefix}:${key}`] = randomUUID();
        entries[`connection:${issue.repository.toLowerCase()}`] = randomUUID();
        hashes[key] = { titleHash: hash(issue.title), bodyHash: hash(stripGitHubIssueFooter(issue.body)) };
      }
      boardIds[operation.operationId] = entries;
      boardHashes[operation.operationId] = hashes;
    }
  }
  return { syncTextHashes, createdAt, ids, externalRefIds, copyIds, boardIds, boardHashes, roadmapSeedIds, bulkRelationshipIds, preparedSourceImports: imports, creationOrigin: "inference" };
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function preparedSourceId(imports: OperationSupply["preparedSourceImports"], operationId: string): string {
  const prepared = ownValue(imports, operationId);
  const document = sourceDocumentSchema.safeParse(prepared?.document);
  if (!document.success) throw new DomainError("validation", "Prepared source document violates its domain schema.", { operationId });
  return document.data.id;
}
