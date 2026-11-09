import { useQuery } from "@tanstack/react-query";
import { planStateResponseSchema, listPlanStatesResponseSchema, planStateComparisonSchema } from "@storymapper/contracts";
import { sendJson } from "@storymapper/web/app/api";
import { appStrings } from "@storymapper/ui-strings";

async function readPlanData(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal });
  const data: unknown = await response.json();
  if (!response.ok) {
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") throw new Error(data.message);
    throw new Error(appStrings.requestFailed(response.status));
  }
  return data;
}

export function usePlanStates(storyMapId: string) {
  return useQuery({ queryKey: ["plan-states", storyMapId], retry: false, queryFn: async ({ signal }) => {
    const response = await readPlanData(`/api/story-maps/${storyMapId}/plan-states`, signal);
    return listPlanStatesResponseSchema.parse(response).states;
  } });
}

export async function capturePlanState(storyMapId: string) {
  return planStateResponseSchema.parse(await sendJson<unknown>(`/api/story-maps/${storyMapId}/plan-states`, "POST", {})).state;
}

export function usePlanStateComparison(storyMapId: string, beforeId: string, afterId: string) {
  return useQuery({ queryKey: ["plan-state-comparison", storyMapId, beforeId, afterId], enabled: Boolean(beforeId && afterId), retry: false, queryFn: async ({ signal }) => planStateComparisonSchema.parse(await readPlanData(`/api/story-maps/${storyMapId}/plan-states/compare?beforeId=${beforeId}&afterId=${afterId}`, signal)) });
}
