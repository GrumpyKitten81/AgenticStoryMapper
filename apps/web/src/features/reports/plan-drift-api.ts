import { useQuery } from "@tanstack/react-query";
import { planDriftReportSchema, planDriftSystemsResponseSchema } from "@storymapper/contracts";
import { appStrings } from "@storymapper/ui-strings";

async function readPlanDrift(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal });
  const data: unknown = await response.json();
  if (!response.ok) {
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") throw new Error(data.message);
    throw new Error(appStrings.requestFailed(response.status));
  }
  return data;
}

export function usePlanDriftSystems(storyMapId: string, enabled: boolean) {
  return useQuery({ queryKey: ["plan-drift-systems", storyMapId], enabled, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async ({ signal }) => planDriftSystemsResponseSchema.parse(await readPlanDrift(`/api/story-maps/${storyMapId}/plan-drift/systems`, signal)).systems });
}

export function usePlanDrift(storyMapId: string, system: string, enabled: boolean) {
  return useQuery({ queryKey: ["plan-drift", storyMapId, system], enabled: enabled && Boolean(system), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async ({ signal }) => planDriftReportSchema.parse(await readPlanDrift(`/api/story-maps/${storyMapId}/plan-drift?system=${encodeURIComponent(system)}`, signal)) });
}
