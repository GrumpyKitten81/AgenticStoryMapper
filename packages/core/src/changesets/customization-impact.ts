import { isCardArchived } from "@storymapper/core/story-map/github-status";
import { DomainError, type Card, type StoryMap, type WorkflowStatus } from "@storymapper/contracts";

interface ScopedDefinition { id: string; projectId: string; storyMapId: string | null }
interface ReviewEvidence { definitionBefore?: unknown; affectedCards?: { id: string; baseVersion: number }[] | undefined; confirmUnlink?: boolean | undefined }
interface CustomizationState { storyMaps: Pick<StoryMap, "id" | "projectId">[]; cards: Card[]; workflowStatuses: WorkflowStatus[]; remoteWorkItemLinks?: readonly { cardId?: string | undefined }[] }

export function customizationCards(state: Pick<CustomizationState, "storyMaps" | "cards">, definition: ScopedDefinition): Card[] {
  const maps = new Set(state.storyMaps.filter((map) => map.projectId === definition.projectId && (!definition.storyMapId || definition.storyMapId === map.id)).map((map) => map.id));
  return state.cards.filter((card) => maps.has(card.storyMapId));
}

export function assertCustomizationReview(definition: ScopedDefinition, affected: Card[], evidence: ReviewEvidence, unlink = false): void {
  if (JSON.stringify(canonical(definition)) !== JSON.stringify(canonical(evidence.definitionBefore))) throw new DomainError("conflict", "Customization definition changed; review its current usage again.");
  const expected = evidence.affectedCards;
  const versions = new Map(expected?.map((card) => [card.id, card.baseVersion]));
  if (!expected || versions.size !== expected.length || expected.length !== affected.length || affected.some((card) => versions.get(card.id) !== card.version)) throw new DomainError("conflict", "Customization Card usage or versions changed; review its current usage again.");
  if (unlink && affected.length && evidence.confirmUnlink !== true) throw new DomainError("conflict", "Confirm unlinking the affected Cards before deleting this customization.");
}

export function workflowStatusImpact(state: CustomizationState, definition: WorkflowStatus, nextName?: string, replacement?: WorkflowStatus): Card[] {
  if (replacement && (replacement.id === definition.id || replacement.projectId !== definition.projectId)) throw new DomainError("conflict", "Replacement status must be a distinct definition in the same Project.");
  const overlapping = state.workflowStatuses.filter((status) => status.id !== definition.id && status.projectId === definition.projectId && (!status.storyMapId || !definition.storyMapId || status.storyMapId === definition.storyMapId));
  if (overlapping.some((status) => status.name === definition.name)) throw new DomainError("conflict", "Workflow status name ownership is ambiguous.");
  if (nextName && nextName !== definition.name && overlapping.some((status) => status.name === nextName)) throw new DomainError("conflict", "Workflow status name collides with an effective definition.");
  const scopedCards = customizationCards(state, definition);
  const affected = scopedCards.filter((card) => card.status === definition.name && !isCardArchived(card) && !state.remoteWorkItemLinks?.some((link) => link.cardId === card.id));
  const maps = state.storyMaps.filter((map) => map.projectId === definition.projectId && (!definition.storyMapId || definition.storyMapId === map.id));
  for (const map of maps) {
    const effective = state.workflowStatuses.filter((status) => status.projectId === definition.projectId && (!status.storyMapId || status.storyMapId === map.id));
    if (effective.filter((status) => status.name === definition.name).length !== 1) throw new DomainError("conflict", "Workflow status name ownership is ambiguous.");
    if (nextName && nextName !== definition.name && effective.some((status) => status.id !== definition.id && status.name === nextName)) throw new DomainError("conflict", "Workflow status name collides with an effective definition.");
    if (replacement && affected.some((card) => card.storyMapId === map.id) && (replacement.id === definition.id || !effective.some((status) => status.id === replacement.id) || effective.filter((status) => status.name === replacement.name).length !== 1)) throw new DomainError("conflict", "Replacement status is unavailable or ambiguous for an affected Story Map.");
  }
  return affected;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => [key, canonical(field)]));
  return value;
}
