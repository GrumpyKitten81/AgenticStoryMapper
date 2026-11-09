import type { LiveTransaction, StoryMapSnapshot } from "@storymapper/contracts";
import type { Query, QueryClient } from "@tanstack/react-query";

const PROJECT_QUERIES = new Set(["card-reviews", "story-maps", "getting-started", "activity", "source-documents", "source-coverage", "connector-connections", "roadmaps", "mcp-tools", "changesets", "product-context", "ai-function-templates", "safety-settings", "customization", "personas", "restore-points"]);
const MAP_QUERIES = new Set(["story-map", "backlog-health", "github-sync-health", "work-item-sync-health", "release-summary", "release-timeline", "release-notes", "plan-states", "plan-state-comparison", "plan-drift", "plan-drift-systems"]);

export function affectedLiveQueries(client: QueryClient, transactions: LiveTransaction[], reset: boolean, activeProjectId?: string): Set<Query> {
  const projects = new Set(transactions.flatMap((transaction) => transaction.entities.map((entity) => entity.projectId)));
  const domainProjects = new Set(transactions.flatMap((transaction) => transaction.entities.filter((entity) => entity.entityType !== "activity").map((entity) => entity.projectId)));
  const ids = new Set(transactions.flatMap((transaction) => transaction.entities.map((entity) => entity.entityId)));
  const hasRuntimeActivity = transactions.some((transaction) => transaction.entities.some((entity) => entity.entityType === "activity" && entity.projectId === null));
  const projectForMap = new Map(client.getQueriesData<StoryMapSnapshot>({ queryKey: ["story-map"] }).map(([key, snapshot]) => [key[1], snapshot?.storyMap.projectId]));
  const projectForDocument = new Map(client.getQueriesData<{ documents: { id: string; projectId: string }[] }>({ queryKey: ["source-documents"] }).flatMap(([, data]) => data?.documents.map((document) => [document.id, document.projectId] as const) ?? []));
  return new Set(client.getQueryCache().getAll().filter((query) => {
    const [prefix, id] = query.queryKey;
    const initialActiveRead = query.isActive() && query.state.data === undefined && domainProjects.has(activeProjectId ?? "");
    if (reset) return prefix !== "credential-status";
    if (prefix === "activity" && hasRuntimeActivity) return true;
    if (prefix === "activity" || prefix === "activity-changes") return projects.has(id as string);
    if (PROJECT_QUERIES.has(String(prefix))) return domainProjects.has(id as string);
    if (prefix === "github-links") return domainProjects.has(query.queryKey[2] as string) || ids.has(id as string) || initialActiveRead;
    if (MAP_QUERIES.has(String(prefix))) return domainProjects.has(projectForMap.get(id) ?? "") || ids.has(id as string) || initialActiveRead;
    if (prefix === "card-history" || prefix === "card-attachments") return ids.has(id as string);
    if (prefix === "source-document") return ids.has(id as string) || domainProjects.has(projectForDocument.get(String(id)) ?? "") || initialActiveRead;
    if (prefix === "roadmap") return ids.has(id as string) || domainProjects.has((query.state.data as { roadmap?: { projectId: string } } | undefined)?.roadmap?.projectId ?? "") || initialActiveRead;
    if (prefix === "projects") return transactions.some((transaction) => transaction.entities.some((entity) => entity.entityType === "project"));
    return false;
  }));
}
