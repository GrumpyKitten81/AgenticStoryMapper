import { DomainError } from "@storymapper/contracts";
import type { Card, CardOperationPatch, ChangeOperation, ChangeOperationContext, CreateAiProposalRequest, ProductContext, SourceChunk, StoryMapSnapshot } from "@storymapper/contracts";
import { buildReleaseSliceOperations, proposeHappyPathSlice, visibleCards } from "@storymapper/core";

interface ProposalContext {
  input: CreateAiProposalRequest;
  snapshot: StoryMapSnapshot;
  selectedCards: Card[];
  context: ProductContext;
  sourceChunks: SourceChunk[];
  operationContext: ChangeOperationContext;
}

export function proposalOperations(proposal: ProposalContext): ChangeOperation[] {
  const { input, selectedCards, context, operationContext } = proposal;
  if (input.templateId === "personas") return personaOperations(proposal);
  if (input.templateId === "goals-steps-stories" || input.templateId === "prd-to-map") return mapOperations(proposal);
  if (input.templateId === "release-slice") return releaseOperations(proposal);
  return selectedCards.slice(0, 12).flatMap((card) => {
    const after = proposalPatchForCard(input.templateId, card, context.purpose);
    return Object.keys(after).length ? [updateCardOperation(card, after, reasonForTemplate(input.templateId, card), operationContext)] : [];
  });
}

function personaOperations({ input, snapshot, context, operationContext }: ProposalContext): ChangeOperation[] {
  const operations: ChangeOperation[] = [];

    const users = context.targetUsers || "Primary user";
    operations.push({
      operationId: "create-persona-1",
      op: "create",
      entity: "persona",
      entityId: "proposed-persona-1",
      after: {
        projectId: input.projectId,
        storyMapId: input.storyMapId,
        name: users.split(/[,;\n]/u)[0]?.trim() || "Primary user",
        role: "Primary user",
        description: `Uses ${context.productType || snapshot.storyMap.name} to ${context.purpose || "complete core workflows"}.`,
        goals: context.keyFeatures.slice(0, 3),
        pains: context.nonGoals ? [context.nonGoals] : []
      },
      reason: "Brainstorm a persona from Product Context.",
      context: operationContext
    });
  return operations;
}

function mapHierarchyOperations({ input, snapshot, context, operationContext }: ProposalContext): ChangeOperation[] {
  const operations: ChangeOperation[] = [];
    operations.push({
      op: "create",
      entity: "card",
      operationId: "create-activity-1",
      entityId: "proposed-ai-activity-1",
      after: {
        storyMapId: input.storyMapId,
        parentId: null,
        level: "activity",
        title: context.purpose || "Deliver core product value",
        description: structuredDescription("Goal", context.purpose || snapshot.storyMap.name, [], [], [])
      },
      reason: "Create a product goal from Product Context.",
      context: operationContext
    }, {
      op: "create",
      entity: "card",
      operationId: "create-step-1",
      entityId: "proposed-ai-step-1",
      after: {
        storyMapId: input.storyMapId,
        parentId: "proposed-ai-activity-1",
        level: "step",
        title: "Complete core workflow",
        description: "Step proposed from Product Context and available sources."
      },
      reason: "Create a journey step for generated stories.",
      context: operationContext
    });
  return operations;
}

function mapOperations(proposal: ProposalContext): ChangeOperation[] {
  const { input, context, sourceChunks, operationContext } = proposal;
  const operations = mapHierarchyOperations(proposal);
  const chunks = sourceChunks.slice(0, 4);
  const features = context.keyFeatures.length ? context.keyFeatures : chunks.map((chunk) => chunk.heading ?? chunk.text.slice(0, 60));
  features.slice(0, 5).forEach((feature, index) => {
      const chunk = chunks[index];
      operations.push({
        op: "create",
        entity: "card",
        operationId: `create-story-${index + 1}`,
        entityId: `proposed-ai-story-${index + 1}`,
        after: {
          storyMapId: input.storyMapId,
          parentId: "proposed-ai-step-1",
          level: "story",
          title: feature,
          description: structuredDescription(feature, context.purpose, [`Given ${feature}`, "When the user completes the workflow", "Then the expected value is visible"], [], [])
        },
        reason: chunk ? `Derived from source chunk ${chunk.locator}.` : "Derived from Product Context key features.",
        context: { ...operationContext, sourceChunkIds: chunk ? [chunk.id] : operationContext.sourceChunkIds }
      });
    });
  return operations;
}

function releaseOperations({ input, snapshot, operationContext }: ProposalContext): ChangeOperation[] {
  if (input.templateId !== "release-slice") throw new DomainError("validation", "Release slicing requires the release-slice template.");
  const target = input.releaseTarget;
  const release = target.kind === "existing" ? snapshot.releases.find((candidate) => candidate.id === target.releaseId) : undefined;
  if (target.kind === "existing" && !release) throw new DomainError("not_found", `Release ${target.releaseId} not found.`);
  const candidate = proposeHappyPathSlice(snapshot.cards);
  return buildReleaseSliceOperations(input.storyMapId, candidate, release, new Map(snapshot.cards.map((card) => [card.id, card.version])), input.rationale)
    .map((operation) => ({ ...operation, context: { ...operationContext, cardIds: candidate.cardIds } }));
}

export function selectedStoryCards(snapshot: StoryMapSnapshot, cardIds?: string[]): Card[] {
  const selected = cardIds?.length ? new Set(cardIds) : undefined;
  return visibleCards(snapshot.cards)
    .filter((card) => card.level === "story")
    .filter((card) => !selected || selected.has(card.id));
}

function updateCardOperation(card: Card, after: CardOperationPatch, reason: string, context: ChangeOperationContext): ChangeOperation {
  return {
    op: "update",
    entity: "card",
    operationId: `update-card-${card.id}`,
    entityId: card.id,
    after,
    reason,
    context,
    baseVersion: card.version
  };
}

function proposalPatchForCard(templateId: CreateAiProposalRequest["templateId"], card: Card, purpose: string): CardOperationPatch {
  const title = card.title;
  if (templateId === "story-writing") {
    return { description: structuredDescription(title, purpose, defaultAcceptanceCriteria(title), [], []) };
  }
  if (templateId === "acceptance-criteria") {
    return { description: appendSection(card.description, "Acceptance Criteria", defaultAcceptanceCriteria(title)) };
  }
  if (templateId === "test-cases") {
    return { description: appendSection(card.description, "Test Cases", [`Verify ${title} succeeds`, `Verify ${title} handles missing or invalid input`]) };
  }
  if (templateId === "invest") {
    return { description: appendSection(card.description, "INVEST Check", ["Independent: verify dependencies", "Negotiable: confirm scope", "Valuable: tie to Product Context", "Estimable: confirm effort", "Small: split if larger than one workflow", "Testable: add acceptance criteria"]) };
  }
  if (templateId === "spidr-split") {
    return { color: "#fff7df", description: appendSection(card.description, "SPIDR Split", ["Spike unknowns", "Path happy-path first", "Interface contract", "Data variant", "Rules and edge cases"]) };
  }
  if (templateId === "effort-estimate") {
    return { estimate: card.estimate ?? estimateForCard(card) };
  }
  if (templateId === "gap-analysis") {
    return card.description.trim() ? { color: card.color ?? "#eef6ff" } : { description: structuredDescription(title, purpose, defaultAcceptanceCriteria(title), [], ["Validate source coverage."]), color: "#fff7df" };
  }
  return {};
}

function structuredDescription(title: string, purpose: string, acceptanceCriteria: string[], testCases: string[], notes: string[]): string {
  return [
    `As a user, I want ${title.toLowerCase()}${purpose ? ` so that ${purpose.toLowerCase()}` : ""}.`,
    "",
    "## Acceptance Criteria",
    ...(acceptanceCriteria.length ? acceptanceCriteria.map((item) => `- ${item}`) : ["- Define expected behavior."]),
    "",
    "## Test Cases",
    ...(testCases.length ? testCases.map((item) => `- ${item}`) : ["- Verify the happy path.", "- Verify error handling."]),
    "",
    "## Open Questions",
    "- Confirm edge cases and dependencies.",
    "",
    "## Notes",
    ...(notes.length ? notes.map((item) => `- ${item}`) : ["- Generated locally as a proposal."])
  ].join("\n");
}

function appendSection(description: string, heading: string, items: string[]): string {
  const trimmed = description.trim();
  const section = [`## ${heading}`, ...items.map((item) => `- ${item}`)].join("\n");
  return trimmed.includes(`## ${heading}`) ? trimmed : [trimmed, section].filter(Boolean).join("\n\n");
}

function defaultAcceptanceCriteria(title: string): string[] {
  return [`Given the user needs ${title}`, "When the workflow is executed", "Then the result is clear and persisted"];
}

function estimateForCard(card: Card): number {
  const length = `${card.title} ${card.description}`.length;
  if (length > 700) return 5;
  if (length > 300) return 3;
  return 1;
}

function reasonForTemplate(templateId: string, card: Card): string {
  return `${card.key} updated by ${templateId} proposal.`;
}
