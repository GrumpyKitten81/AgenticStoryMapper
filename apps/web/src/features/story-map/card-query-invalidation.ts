import type { QueryClient } from "@tanstack/react-query";

const CARD_REPORT_PREFIXES = ["card-reviews", "plan-drift", "plan-drift-systems", "backlog-health", "github-sync-health", "work-item-sync-health", "release-summary", "release-timeline", "roadmap", "roadmaps", "source-documents", "source-document", "source-coverage", "activity", "card-history"];

export async function invalidateCardReports(queryClient: QueryClient): Promise<void> {
  await Promise.all(CARD_REPORT_PREFIXES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}
