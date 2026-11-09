import type { Card, CardType } from "@storymapper/contracts";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function makeDraft(card: Card | null) {
  return {
    cardId: card?.id ?? "",
    title: card?.title ?? "",
    cardType: (card?.cardType ?? "") as CardType | "",
    description: card?.description ?? "",
    status: card?.status ?? "todo",
    assignee: card?.assignee ?? "",
    estimate: card?.estimate?.toString() ?? "",
    releaseId: card?.releaseId ?? "",
      priority: card?.priority ?? "",
        color: card?.color ?? "",
          businessValue: card?.businessValue?.toString () ?? "",
            effort: card?.effort?.toString () ?? ""
};
}

export function validateNumbers(draft: ReturnType<typeof makeDraft>, baseline: ReturnType<typeof makeDraft>): string | undefined {
  for (const field of ["estimate", "businessValue", "effort"] as const) {
    const value = draft[field].trim();
    if (!value && baseline[field]) return strings.cardNumberCannotClear(strings[field]);
    if (!value) continue;
    const number = Number(value);
    if (!Number.isFinite(number)) return strings.invalidCardNumber(strings[field]);
    if (field !== "estimate" && !Number.isInteger(number)) return strings.integerCardNumber(strings[field]);
  }
  return undefined;
}

export function buildBreadcrumb(cards: Card[], card: Card) {
  const step = card.parentId ? cards.find((item) => item.id === card.parentId) : null;
  const activity = step?.parentId ? cards.find((item) => item.id === step.parentId) : null;
  return [activity?.title, step?.title, cardLevelMeta[card.level].longLabel].filter(Boolean).join(" > ");
}
