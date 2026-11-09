import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cardSchema, storyMapSnapshotSchema, type GitHubStatusSource, type RemoteWorkItemLink } from "@storymapper/contracts";
import { cardIsCompleted, cardStatusIdentity, statusFilterOptions } from "@storymapper/web/features/story-map/status-filters";
import { defaultBoardFilters } from "@storymapper/web/features/story-map/board-filters";
import { filterStoryMap } from "@storymapper/web/features/story-map/useStoryMapBoardState";

const source: GitHubStatusSource = { kind: "project", projectId: "delivery", projectName: "Delivery", fieldId: "status" };
function fixture() {
  const mapId = randomUUID(), projectId = randomUUID(), parentId = randomUUID(), connectionId = randomUUID();
  const now = "2026-11-03T00:00:00Z";
  const cards = [cardSchema.parse({ id: parentId, storyMapId: mapId, version: 1, creationOrigin: "manual", provenance: "manual", parentId: null, releaseId: null, key: "K-1", level: "activity", title: "Parent", status: "Closed", position: 0, createdAt: now, updatedAt: now }), cardSchema.parse({ id: randomUUID(), storyMapId: mapId, version: 1, creationOrigin: "manual", provenance: "manual", parentId, releaseId: null, key: "K-2", level: "story", title: "Child", status: "In Review", position: 0, createdAt: now, updatedAt: now })];
  const link = (index: number, owner: string): RemoteWorkItemLink => ({ id: randomUUID(), connectionId: owner, externalRefId: randomUUID(), provider: "github", cardId: cards[index]!.id, remoteId: String(index + 1), remoteNumber: index + 1, url: `https://github.com/owner/repo/issues/${index + 1}`, labels: [], parentOverrideLocal: false, syncState: "synced", statusEvidence: { source, issueState: "open", membership: "present", optionId: index === 0 ? "closed" : "review", name: cards[index]!.status } });
  const links = [link(0, connectionId), link(1, connectionId)];
  const snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: mapId, projectId, version: 1, name: "Map", createdAt: now, updatedAt: now }, cards, releases: [], cardDependencies: [], remoteWorkItemLinks: links, githubStatusCatalogs: [{ connectionId, connectionName: "GitHub", catalog: { source, options: [{ id: "closed", name: "Closed", position: 0 }, { id: "review", name: "In Review", position: 1 }, { id: "removed", name: "Removed", position: 2, retired: true }] } }] });
  const input = { cards: snapshot.cards, releases: snapshot.releases, remoteWorkItemLinks: snapshot.remoteWorkItemLinks, workflowStatuses: snapshot.workflowStatuses, personaById: new Map(), annotationById: new Map(), personaLinksByCardId: {}, annotationLinksByCardId: {}, sourceSearchTextByCardId: {}, githubLinksByCardId: {}, externalRefsByCardId: {}, filters: { ...defaultBoardFilters } };
  return { snapshot, input, cards, links };
}

describe("shared dynamic status filters", () => {
  it("starts unrestricted and retains excluded ancestors only as uncounted context", () => {
    const f = fixture();
    expect(filterStoryMap(f.input).matchingCardIds.size).toBe(2);
    f.input.filters = { ...defaultBoardFilters, statuses: [cardStatusIdentity(f.cards[1]!, f.links, [])] };
    const filtered = filterStoryMap(f.input);
    expect([...filtered.matchingCardIds]).toEqual([f.cards[1]!.id]);
    expect(filtered.visibleCardIds).toEqual(new Set(f.cards.map((card) => card.id)));
  });

  it("ORs selected identities, ANDs other filters, and supports exclusion", () => {
    const f = fixture();
    f.input.filters = { ...defaultBoardFilters, statuses: f.cards.map((card) => cardStatusIdentity(card, f.links, [])), search: "Child" };
    expect([...filterStoryMap(f.input).matchingCardIds]).toEqual([f.cards[1]!.id]);
    f.input.filters = { ...defaultBoardFilters, statuses: [cardStatusIdentity(f.cards[0]!, f.links, [])], statusMode: "exclude" };
    expect([...filterStoryMap(f.input).matchingCardIds]).toEqual([f.cards[1]!.id]);
  });

  it("keeps identical names in different connections distinct and omits unassigned retired options", () => {
    const f = fixture();
    const other = { ...f.links[1]!, connectionId: randomUUID() };
    expect(cardStatusIdentity(f.cards[1]!, [other], [])).not.toBe(cardStatusIdentity(f.cards[1]!, f.links, []));
    const options = statusFilterOptions(f.snapshot);
    expect(options.some((option) => option.name.startsWith("Removed"))).toBe(false);
    expect(options.some((option) => option.name.startsWith("In Review"))).toBe(true);
    expect(options.some((option) => option.name.startsWith("todo"))).toBe(false);
  });

  it("hides closed Issues despite active Project status and ignores same-name local groups", () => {
    const f = fixture();
    f.links[1]!.statusEvidence!.issueState = "closed";
    f.input.remoteWorkItemLinks = f.links;
    f.input.filters.hideCompleted = true;
    expect(filterStoryMap(f.input).matchingCardIds.has(f.cards[1]!.id)).toBe(false);
    f.links[1]!.statusEvidence!.issueState = "open";
    const local = { id: randomUUID(), projectId: f.snapshot.storyMap.projectId, storyMapId: null, name: "In Review", group: "done" as const, position: 0 };
    expect(cardIsCompleted(f.cards[1]!, f.links, [local])).toBe(false);
    expect(cardIsCompleted(f.cards[1]!, [], [local])).toBe(true);
  });
});
