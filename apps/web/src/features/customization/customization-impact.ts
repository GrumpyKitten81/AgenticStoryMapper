import type { Annotation, Persona, WorkflowStatus } from "@storymapper/contracts";
import { api, useCustomization } from "@storymapper/web/app/api";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateCardReports } from "@storymapper/web/features/story-map";

export type CustomizationData = NonNullable<ReturnType<typeof useCustomization>["data"]>;
export type CustomizationRoot = WorkflowStatus | Annotation | Persona;

export function affectedCustomizationCards(data: CustomizationData, root: CustomizationRoot, kind: "status" | "annotation" | "persona") {
  const linked = new Set(kind === "annotation" ? data.cardAnnotations.filter((link) => link.annotationId === root.id).map((link) => link.cardId) : kind === "persona" ? data.cardPersonas.filter((link) => link.personaId === root.id).map((link) => link.cardId) : []);
  return data.usageCards.filter((card) => kind === "status" ? card.status === root.name && (!root.storyMapId || card.storyMapId === root.storyMapId) : linked.has(card.id)).map((card) => ({ id: card.id, baseVersion: card.version }));
}

export async function invalidateCustomization(client: QueryClient): Promise<void> {
  await Promise.all(["customization", "personas", "story-map"].map((key) => client.invalidateQueries({ queryKey: [key] })));
  await invalidateCardReports(client);
}

export async function loadCustomizationReview(projectId: string, storyMapId: string | undefined, root: CustomizationRoot, kind: "status" | "annotation"): Promise<CustomizationData> {
  const data = await api.getCustomization(projectId, storyMapId);
  const current = (kind === "status" ? data.workflowStatuses : data.annotations).find((item) => item.id === root.id);
  if (!current) return data;
  const affectedIds = new Set(affectedCustomizationCards(data, current, kind).map((card) => card.id));
  const maps = [...new Set(data.usageCards.filter((card) => affectedIds.has(card.id)).map((card) => card.storyMapId))].filter((mapId) => mapId !== storyMapId);
  const choices = kind === "status" ? await Promise.all(maps.map((mapId) => api.getCustomization(projectId, mapId))) : [];
  return { ...data, workflowStatuses: [...new Map([data, ...choices].flatMap((entry) => entry.workflowStatuses).map((status) => [status.id, status])).values()] };
}
