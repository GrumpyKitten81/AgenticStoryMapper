import { parseStoredJson } from "@storymapper/db/versioned-json";
import { and, desc, eq, lt } from "drizzle-orm";
import { cardHistoryQuerySchema, cardHistorySnapshotSchema, type CardHistoryQuery, type CardHistoryResponse } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";
import { changedCardFields } from "@storymapper/db/repositories/repository-values";
import { cards, cardVersions } from "@storymapper/db/schema";

export function listCardHistoryPage(this: StoryMapperRepository, cardId: string, input: CardHistoryQuery): CardHistoryResponse {
  const { beforeVersion, limit } = cardHistoryQuerySchema.parse(input);
  const card = this.db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (card && !this.isStoryMapVisible(card.storyMapId)) return { versions: [], nextCursor: null };
  const rows = this.db.select().from(cardVersions)
    .where(and(eq(cardVersions.cardId, cardId), beforeVersion === undefined ? undefined : lt(cardVersions.version, beforeVersion)))
    .orderBy(desc(cardVersions.version)).limit(limit + 1).all();
  const snapshots = rows.map((row) => cardHistorySnapshotSchema.parse(parseStoredJson("card_versions", "snapshot_json", row.snapshotJson, row.snapshotSchemaVersion)));
  const storyMapId = card?.storyMapId ?? snapshots[0]?.storyMapId;
  if (storyMapId && !this.isStoryMapVisible(storyMapId)) return { versions: [], nextCursor: null };
  const versions = rows.slice(0, limit).map((row, index) => {
    const snapshot = snapshots[index]!;
    const previousSnapshot = snapshots[index + 1] ?? null;
    return {
      id: row.id, cardId: row.cardId, version: row.version,
      actor: row.actor, actorType: row.actorType as CardHistoryResponse["versions"][number]["actorType"],
      ...(row.mcpSessionId === null ? {} : { mcpSessionId: row.mcpSessionId }),
      createdAt: row.createdAt, snapshot, previousSnapshot,
      changedFields: previousSnapshot ? changedCardFields(previousSnapshot, snapshot) : ["created"]
    };
  });
  return { versions, nextCursor: rows.length > limit ? versions.at(-1)!.version : null };
}
