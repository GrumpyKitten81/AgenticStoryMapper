import { randomUUID } from "node:crypto";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { liveTransactionSchema } from "@storymapper/contracts";
import { invalidateReleaseViews } from "@storymapper/web/features/releases/release-utils";
import { affectedLiveQueries } from "@storymapper/web/app/live/live-query-invalidation";

it("routes live Card changes to every Project, Story Map, history, attachment, and source query family", () => {
  const client = new QueryClient();
  const projectId = randomUUID();
  const storyMapId = randomUUID();
  const cardId = randomUUID();
  const documentId = randomUUID();
  client.setQueryData(["story-map", storyMapId], { storyMap: { projectId } });
  client.setQueryData(["source-documents", projectId], { documents: [{ id: documentId, projectId }] });
  const keys = [
    ["card-reviews", projectId, storyMapId], ["story-maps", projectId], ["getting-started", projectId], ["activity", projectId], ["source-documents", projectId],
    ["source-coverage", projectId], ["connector-connections", projectId], ["roadmaps", projectId], ["mcp-tools", projectId],
    ["changesets", projectId], ["product-context", projectId], ["ai-function-templates", projectId], ["safety-settings", projectId],
    ["customization", projectId], ["personas", projectId], ["restore-points", projectId], ["github-links", storyMapId, projectId],
    ["story-map", storyMapId], ["backlog-health", storyMapId], ["github-sync-health", storyMapId], ["work-item-sync-health", storyMapId],
    ["release-summary", storyMapId], ["release-timeline", storyMapId], ["release-notes", storyMapId, randomUUID()], ["card-history", cardId], ["card-attachments", cardId], ["source-document", documentId],
    ["plan-states", storyMapId], ["plan-state-comparison", storyMapId, randomUUID(), randomUUID()], ["plan-drift", storyMapId, "source"], ["plan-drift-systems", storyMapId]
  ];
  for (const key of keys) client.setQueryData(key, {});
  const foreignIssues = ["github-links", randomUUID(), randomUUID()];
  client.setQueryData(foreignIssues, {});
  client.setQueryData(["story-map", storyMapId], { storyMap: { projectId } });
  client.setQueryData(["source-documents", projectId], { documents: [{ id: documentId, projectId }] });
  const epoch = randomUUID();
  const transaction = liveTransactionSchema.parse({
    epoch, seq: 1, id: `${epoch}:1`, originClientId: null, actor: { actorType: "human", actorId: "live-test" },
    entities: [{ entityType: "card", entityId: cardId, projectId, version: 2 }]
  });
  const affected = affectedLiveQueries(client, [transaction], false);
  expect([...affected].map((query) => query.queryKey)).toEqual(expect.arrayContaining(keys));
  expect(affected.size).toBe(keys.length);
  client.clear();
});

it("invalidates every cached notes Release for the changed map after Release saves and live status/Release changes", async () => {
  const client = new QueryClient();
  const projectId = randomUUID(), storyMapId = randomUUID(), otherMap = randomUUID();
  const keys = [["release-notes", storyMapId, randomUUID()], ["release-notes", storyMapId, randomUUID()]];
  const foreign = ["release-notes", otherMap, randomUUID()];
  client.setQueryData(["story-map", storyMapId], { storyMap: { projectId } });
  client.setQueryData(["story-map", otherMap], { storyMap: { projectId: randomUUID() } });
  for (const key of [...keys, foreign]) client.setQueryData(key, { markdown: "Prior notes" });
  for (const entityType of ["release", "workflowStatus", "card"] as const) {
    const epoch = randomUUID();
    const transaction = liveTransactionSchema.parse({ epoch, seq: 1, id: `${epoch}:1`, originClientId: null, actor: { actorType: "human", actorId: "test" }, entities: [{ entityType, entityId: randomUUID(), projectId, version: 2 }] });
    const affected = [...affectedLiveQueries(client, [transaction], false)].map((query) => query.queryKey);
    expect(affected).toEqual(expect.arrayContaining(keys));
    expect(affected).not.toContainEqual(foreign);
  }
  await invalidateReleaseViews(client, storyMapId);
  for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
  client.clear();
});

it("refreshes Card review summaries for unversioned metadata even when the Card version stays unchanged", () => {
  const client = new QueryClient();
  const projectId = randomUUID(), storyMapId = randomUUID(), epoch = randomUUID();
  const key = ["card-reviews", projectId, storyMapId];
  client.setQueryData(key, { summaries: [] });
  client.setQueryData(["story-map", storyMapId], { storyMap: { projectId }, cards: [{ id: randomUUID(), version: 1 }] });
  const event = liveTransactionSchema.parse({ epoch, id: `${epoch}:1`, seq: 1, originClientId: null, actor: { actorType: "agent", actorId: "reviewer" }, entities: [{ entityType: "cardReview", entityId: randomUUID(), projectId, version: null }] });
  expect([...affectedLiveQueries(client, [event], false)].map((query) => query.queryKey)).toContainEqual(key);
  client.clear();
});
