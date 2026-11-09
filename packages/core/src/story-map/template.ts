import { storyMapTemplateSchema, type StoryMapTemplate } from "@storymapper/contracts";
import sample from "../../templates/sample-story-map.json";

export const sampleStoryMapTemplate = storyMapTemplateSchema.parse(sample);

export function createStoryMapFromTemplate(template: StoryMapTemplate): StoryMapTemplate {
  const plan = storyMapTemplateSchema.parse(template);
  const releaseRefs = new Set(plan.releases.map((release) => release.ref));
  const cardRefs = new Map(plan.cards.map((card) => [card.ref, card]));
  if (releaseRefs.size !== plan.releases.length || cardRefs.size !== plan.cards.length) {
    throw new Error("Template references must be unique.");
  }
  const placed = new Set<string>();
  const ordered: StoryMapTemplate["cards"] = [];
  while (ordered.length < plan.cards.length) {
    const available = plan.cards.filter((card) => !placed.has(card.ref) && (!card.parentRef || placed.has(card.parentRef)));
    if (!available.length) throw new Error("Template parents contain missing references or a cycle.");
    for (const card of available) {
      const parent = card.parentRef ? cardRefs.get(card.parentRef) : undefined;
      if ((card.level === "activity" && parent) || (card.level === "step" && parent?.level !== "activity") ||
          (card.level === "story" && parent?.level !== "step") ||
          (card.level === "note" && parent && parent.level !== "activity" && parent.level !== "step")) throw new Error("Template card hierarchy is invalid.");
      if (card.releaseRef && !releaseRefs.has(card.releaseRef)) throw new Error("Template release reference is missing.");
      placed.add(card.ref);
      ordered.push(card);
    }
  }
  return { ...plan, cards: ordered };
}
