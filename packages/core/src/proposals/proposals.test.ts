import { describe, expect, it } from "vitest";
import type { Card, Release } from "@storymapper/contracts";
import { buildBacklogGroomingChangeSet, buildMapProposalChangeSet, buildReleaseSliceOperations, proposalOperations, proposeHappyPathSlice } from "@storymapper/core";

const operationContext = { templateId: "story-writing" as const, productContextId: "pc", sourceChunkIds: ["c0"], cardIds: [] };
const release = { id: "r1", name: "R1" } as Release;

function card(id: string, patch: Partial<Card> = {}): Card {
  return { id, key: `K-${id}`, storyMapId: "map", parentId: null, releaseId: null, version: 2, creationOrigin: "manual", provenance: "manual", level: "story", title: `Title ${id}`, description: "", position: 0, status: "todo", parked: false, ...patch } as Card;
}

function proposal(templateId: string, selectedCards: Card[], extra: { releases?: Release[]; sourceChunks?: unknown[]; keyFeatures?: string[]; releaseTarget?: { kind: "existing"; releaseId: string } | { kind: "new" }; rationale?: string } = {}) {
  return {
    input: { projectId: "p", storyMapId: "map", templateId, releaseTarget: extra.releaseTarget, rationale: extra.rationale },
    snapshot: { storyMap: { name: "Map" }, cards: selectedCards, releases: extra.releases ?? [] },
    selectedCards,
    context: { purpose: "Fast access", productType: "App", targetUsers: "Admins, Guests", keyFeatures: extra.keyFeatures ?? [], nonGoals: "No billing" },
    sourceChunks: extra.sourceChunks ?? [],
    operationContext
  } as unknown as Parameters<typeof proposalOperations>[0];
}

describe("moved deterministic proposal generators", () => {
  registerWritesAStructuredStoryDescriptionAsAVersionedCard();

  registerAppendsSectionsOnceColorsSplitProposalsAndCapsUpdates();

  registerKeepsEstimatesAndFillsOnlyUndescribedCardsInGap();

  registerProposesAPersonaFromTheFirstTargetUser();

  registerDerivesAtMostFiveProposedStoriesBelowAGoal();

  it("shares the stable twelve-story happy path with explicit existing/new targets and rationale", () => {
    const cards = Array.from({ length: 15 }, (_, index) => card(String(index).padStart(2, "0"))).reverse();
    const created = proposalOperations(proposal("release-slice", cards, { releaseTarget: { kind: "new" }, rationale: "Deliver the journey." }));
    expect(created.map((operation) => operation.entityId)).toEqual(["proposed-release-1", ...Array.from({ length: 12 }, (_, index) => String(index).padStart(2, "0"))]);
    expect(created[0]).toMatchObject({ after: { name: "MVP Happy Path" }, reason: "Deliver the journey.", context: { ...operationContext, cardIds: Array.from({ length: 12 }, (_, index) => String(index).padStart(2, "0")) } });
    expect(created[1]).toMatchObject({ after: { releaseId: "proposed-release-1" }, reason: "Deliver the journey.", baseVersion: 2 });
    const reused = proposalOperations(proposal("release-slice", cards, { releases: [release], releaseTarget: { kind: "existing", releaseId: release.id } }));
    expect(reused).toHaveLength(12);
    expect(reused[0]).toMatchObject({ after: { releaseId: "r1" } });
    expect(() => proposalOperations(proposal("release-slice", cards, { releases: [release], releaseTarget: { kind: "existing", releaseId: "missing" } }))).toThrow("Release missing not found.");
  });

  it("keeps complete release operations and candidate provenance invariant under snapshot permutations and selected subsets", () => {
    const cards = Array.from({ length: 15 }, (_, index) => card(String(index).padStart(2, "0")));
    for (const releaseTarget of [{ kind: "new" as const }, { kind: "existing" as const, releaseId: release.id }]) {
      const full = proposal("release-slice", cards, { releaseTarget, releases: [release] });
      const expected = proposalOperations(full);
      const permuted = { ...full, snapshot: { ...full.snapshot, cards: [...cards].reverse() }, selectedCards: [cards[14]!], operationContext: { ...operationContext, cardIds: [cards[14]!.id] } };
      expect(proposalOperations(permuted)).toEqual(expected);
      expect(expected.every((operation) => JSON.stringify(operation.context?.cardIds) === JSON.stringify(cards.slice(0, 12).map((item) => item.id)))).toBe(true);
      expect(expected[0]!.context).toEqual({ ...operationContext, cardIds: cards.slice(0, 12).map((item) => item.id) });
    }
  });

  it("keeps first twelve visibility semantics independent of input order", () => {
    const cards = [card("hidden-parent", { level: "activity", parked: true }), card("hidden", { parentId: "hidden-parent" }), card("archived", { status: "archived" }), card("note", { level: "note" }), ...Array.from({ length: 14 }, (_, index) => card(String(index).padStart(2, "0")))];
    const before = structuredClone(cards);
    const expected = Array.from({ length: 12 }, (_, index) => String(index).padStart(2, "0"));
    expect(proposeHappyPathSlice(cards).cardIds).toEqual(expected);
    expect(proposeHappyPathSlice([...cards].reverse()).cardIds).toEqual(expected);
    expect(cards).toEqual(before);
  });

});

describe("moved ChangeSet builders", () => {
  it("proposes a map from at most six chunks with source links", () => {
    const chunks = Array.from({ length: 7 }, (_, index) => ({ id: `c${index}`, locator: `L${index}`, text: `text ${index}` }));
    const changeSet = buildMapProposalChangeSet({ id: "cs", createdAt: "2026-10-10T00:00:00.000Z", projectId: "p", storyMapId: "map", documentTitle: "Doc", productPurpose: "Goal", chunks });
    expect(changeSet).toMatchObject({ id: "cs", status: "proposed", source: "mcp", title: "Proposed map from source document", createdAt: "2026-10-10T00:00:00.000Z" });
    expect(changeSet.operations).toHaveLength(2 + 6 * 2);
    expect(changeSet.operations[0]!.after).toMatchObject({ title: "Doc", description: "Activity proposed from imported source material for: Goal" });
    expect(changeSet.operations[3]).toMatchObject({ op: "link", entity: "sourceLink", after: { cardId: "proposed-story-1", chunkId: "c0", confidence: 0.75 } });
  });

  it("grooms known issue types only", () => {
    const issues = ["missing-description", "missing-estimate", "missing-source", "other"].map((type, index) => ({ cardId: `c${index}`, cardKey: `K${index}`, cardTitle: `T${index}`, type }));
    const changeSet = buildBacklogGroomingChangeSet({ id: "cs", createdAt: "2026-10-10T00:00:00.000Z", projectId: "p", issues, versionsByCardId: new Map(issues.map((issue, index) => [issue.cardId, index + 1])) });
    expect(changeSet.title).toBe("Proposed backlog grooming");
    expect(changeSet.operations.map((operation) => [operation.entityId, operation.baseVersion, operation.after])).toEqual([
      ["c0", 1, { description: "Clarify T0 with user value, trigger and expected outcome." }],
      ["c1", 2, { estimate: 1 }],
      ["c2", 3, { color: "#fff7df" }]
    ]);
  });

  it("assigns slice cards to an existing release or a proposed one", () => {
    const candidate = { name: "Happy Path MVP", goal: "g", cardIds: ["a"] } as Parameters<typeof buildReleaseSliceOperations>[1];
    const versions = new Map([["a", 4]]);
    expect(buildReleaseSliceOperations("map", candidate, release, versions)).toEqual([{ operationId: "assign-card-a", op: "update", entity: "card", entityId: "a", baseVersion: 4, after: { releaseId: "r1" }, reason: "Include in R1 happy-path release slice." }]);
    expect(buildReleaseSliceOperations("map", candidate, undefined, versions)).toEqual([
      { operationId: "create-release-1", op: "create", entity: "release", entityId: "proposed-release-1", after: { storyMapId: "map", name: "Happy Path MVP", goal: "g" }, reason: "Create a release for the proposed happy-path slice." },
      { operationId: "assign-card-a", op: "update", entity: "card", entityId: "a", baseVersion: 4, after: { releaseId: "proposed-release-1" }, reason: "Assign to proposed happy-path release." }
    ]);
  });
});

function registerDerivesAtMostFiveProposedStoriesBelowAGoal() {
  it("derives at most five proposed stories below a goal and step with chunk provenance", () => {
    const chunks = [{ id: "c1", locator: "L1", heading: "H1", text: "t" }];
    const operations = proposalOperations(proposal("goals-steps-stories", [], { keyFeatures: ["F1", "F2", "F3", "F4", "F5", "F6"], sourceChunks: chunks }));
    expect(operations.map((operation) => operation.entityId)).toEqual(["proposed-ai-activity-1", "proposed-ai-step-1", ...[1, 2, 3, 4, 5].map((index) => `proposed-ai-story-${index}`)]);
    expect(operations[2]).toMatchObject({ reason: "Derived from source chunk L1.", context: { sourceChunkIds: ["c1"] }, after: { parentId: "proposed-ai-step-1", title: "F1", level: "story" } });
    expect(operations[3]).toMatchObject({ reason: "Derived from Product Context key features.", context: { sourceChunkIds: ["c0"] } });
  });
}

function registerProposesAPersonaFromTheFirstTargetUser() {
  it("proposes a persona from the first target user", () => {
    expect(proposalOperations(proposal("personas", []))).toEqual([{
      operationId: "create-persona-1", op: "create", entity: "persona", entityId: "proposed-persona-1", reason: "Brainstorm a persona from Product Context.", context: operationContext,
      after: { projectId: "p", storyMapId: "map", name: "Admins", role: "Primary user", description: "Uses App to Fast access.", goals: [], pains: ["No billing"] }
    }]);
  });
}

function registerKeepsEstimatesAndFillsOnlyUndescribedCardsInGap() {
  it("keeps estimates and fills only undescribed cards in gap analysis", () => {
    expect(proposalOperations(proposal("effort-estimate", [card("a", { estimate: 8 }), card("b", { title: "x" })])).map((operation) => operation.after)).toEqual([{ estimate: 8 }, { estimate: 1 }]);
    const [described, empty] = proposalOperations(proposal("gap-analysis", [card("a", { description: "d" }), card("b")]));
    expect(described!.after).toEqual({ color: "#eef6ff" });
    expect(Object.keys(empty!.after as object)).toEqual(["description", "color"]);
  });
}

function registerAppendsSectionsOnceColorsSplitProposalsAndCapsUpdates() {
  it("appends sections once, colors split proposals and caps updates at twelve cards", () => {
    const [split] = proposalOperations(proposal("spidr-split", [card("a", { description: "Body" })]));
    expect(split!.after).toEqual({ color: "#fff7df", description: "Body\n\n## SPIDR Split\n- Spike unknowns\n- Path happy-path first\n- Interface contract\n- Data variant\n- Rules and edge cases" });
    expect(proposalOperations(proposal("test-cases", [card("a", { description: "## Test Cases\n- Existing" })]))[0]!.after).toEqual({ description: "## Test Cases\n- Existing" });
    expect(proposalOperations(proposal("acceptance-criteria", Array.from({ length: 15 }, (_, index) => card(String(index)))))).toHaveLength(12);
  });
}

function registerWritesAStructuredStoryDescriptionAsAVersionedCard() {
  it("writes a structured story description as a versioned card update", () => {
    expect(proposalOperations(proposal("story-writing", [card("a", { title: "Login" })]))).toEqual([{
      operationId: "update-card-a", op: "update", entity: "card", entityId: "a", baseVersion: 2, context: operationContext, reason: "K-a updated by story-writing proposal.",
      after: { description: "As a user, I want login so that fast access.\n\n## Acceptance Criteria\n- Given the user needs Login\n- When the workflow is executed\n- Then the result is clear and persisted\n\n## Test Cases\n- Verify the happy path.\n- Verify error handling.\n\n## Open Questions\n- Confirm edge cases and dependencies.\n\n## Notes\n- Generated locally as a proposal." }
    }]);
  });
}
