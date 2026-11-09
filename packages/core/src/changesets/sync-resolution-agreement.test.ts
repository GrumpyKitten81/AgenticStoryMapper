import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { annotationSchema, connectorConnectionSchema, type OperationSupply, type RemoteWorkItemLink, type SyncConflict } from "@storymapper/contracts";
import { syncResolutionAgrees } from "@storymapper/core/changesets/sync-resolution-agreement";
import { createdAt, id, snapshot, supply } from "@storymapper/core/changesets/fixtures/remaining-operation-resolution-fixture";

const hash = (text: string): string => createHash("sha256").update(text).digest("hex");

function fixture(field: SyncConflict["field"]) {
  const state = snapshot();
  state.connections = [connectorConnectionSchema.parse({ id: id(50), projectId: id(1), provider: "github", name: "GitHub", authMode: "github-cli", owner: "org", repository: "repo", labelsAsAnnotations: true, releaseSource: "milestone", statusMapping: [{ localStatus: "todo", remoteState: "open", labels: ["todo"] }, { localStatus: "done", remoteState: "closed", labels: ["done-z", "done-a"] }], createdAt, updatedAt: createdAt })];
  const evidence = { titleHash: hash("Remote title"), bodyHash: hash("Remote body"), remoteState: "closed", statusLabels: ["done-a", "done-z"], annotationLabels: ["Remote label"], milestone: null, releaseMetadata: null };
  const link: RemoteWorkItemLink = { id: id(60), externalRefId: id(19), remoteNumber: 1, connectionId: id(50), provider: "github", cardId: id(3), remoteId: "1", url: "https://github.com/org/repo/issues/1", syncState: "conflict", parentOverrideLocal: false, labels: [], baseline: { pendingReleaseAssignment: false, acknowledgedLocal: { ...evidence, releaseId: null }, observedRemote: { ...evidence } } };
  const conflict: SyncConflict = { id: id(62), externalRefId: id(19), syncRunId: id(61), connectionId: id(50), cardId: id(3), remoteId: "1", field, localValue: "Original local evidence", remoteValue: "Original remote evidence", status: "open", createdAt };
  const inputs: OperationSupply = { ...supply(), syncTextHashes: { "Remote title": hash("Remote title"), "Remote body": hash("Remote body") } };
  return { state, link, conflict, inputs };
}

function agrees(value: ReturnType<typeof fixture>, chosen: unknown, resolution: "local" | "remote" = "remote"): boolean {
  return syncResolutionAgrees(value.state, value.inputs, value.conflict, value.link, resolution, { localValue: chosen, remoteValue: chosen });
}

it.each(["title", "description"] as const)("requires the actual chosen %s and both canonical hashes before closure", (field) => {
  const value = fixture(field);
  const chosen = field === "title" ? "Remote title" : "Remote body";
  const key = field === "title" ? "titleHash" : "bodyHash";
  expect(agrees(value, chosen)).toBe(false);
  value.state.cards[0]![field] = chosen;
  expect(agrees(value, chosen)).toBe(true);
  expect(agrees(value, chosen, "local")).toBe(true);
  value.link.baseline!.observedRemote[key] = hash("Unreviewed remote value");
  expect(agrees(value, chosen)).toBe(false);
  value.link.baseline!.observedRemote[key] = hash(chosen);
  value.inputs.syncTextHashes = {};
  expect(agrees(value, chosen)).toBe(false);
});

it("uses authored Markdown rather than its machine footer for description agreement", () => {
  const value = fixture("description");
  value.state.cards[0]!.description = "Remote body\n\n<!-- storymapper:footer:start -->\nCard metadata\n<!-- storymapper:footer:end -->";
  expect(agrees(value, "Remote body")).toBe(true);
  expect(agrees(value, value.state.cards[0]!.description)).toBe(false);
});

it("refuses a baseline-only status choice and accepts actual mapped status without mutating mapping labels", () => {
  const value = fixture("status");
  const chosen = { state: "closed", labels: ["done-a", "done-z"] };
  for (const mapping of value.state.connections[0]!.statusMapping) Object.freeze(mapping.labels);
  const configuration = structuredClone(value.state.connections);
  expect(agrees(value, chosen)).toBe(false);
  value.state.cards[0]!.status = "done";
  expect(agrees(value, chosen)).toBe(true);
  expect(agrees(value, chosen, "local")).toBe(true);
  expect(value.state.connections).toEqual(configuration);
  value.link.baseline!.acknowledgedLocal.statusLabels = ["done-z"];
  expect(agrees(value, chosen)).toBe(false);
});

it("preserves different acknowledged-local and raw observed status labels after an explicit remote choice", () => {
  const value = fixture("status");
  const chosen = { state: "open", labels: ["done-z"] };
  value.state.cards[0]!.status = "done";
  value.link.baseline!.observedRemote.remoteState = "open";
  value.link.baseline!.observedRemote.statusLabels = ["done-z"];
  const original = structuredClone(value);
  expect(agrees(value, chosen)).toBe(true);
  expect(agrees(value, chosen, "local")).toBe(false);
  expect(value).toEqual(original);
});

it("requires effective managed Annotation assignments as well as both label baselines", () => {
  const value = fixture("labels");
  value.state.annotations.push(annotationSchema.parse({ id: id(71), projectId: id(1), storyMapId: id(2), name: "Remote label", position: 1 }));
  expect(agrees(value, ["Remote label"])).toBe(false);
  value.state.cardAnnotations = [{ id: id(72), cardId: id(3), annotationId: id(71), createdAt }];
  expect(agrees(value, ["Remote label"])).toBe(true);
  expect(agrees(value, ["Remote label"], "local")).toBe(true);
  value.state.annotations.push({ ...value.state.annotations[1]!, id: id(73), storyMapId: null });
  expect(agrees(value, ["Remote label"])).toBe(false);
  value.state.annotations.pop();
  value.link.baseline!.observedRemote.annotationLabels = ["Different"];
  expect(agrees(value, ["Remote label"])).toBe(false);
});

function prepareRelease(value: ReturnType<typeof fixture>, source: "milestone" | "iteration") {
  value.state.connections[0]!.releaseSource = source;
  const release = { ...value.state.releases[0]!, id: id(71), name: "Remote release", startDate: "2026-10-19", releaseDate: "2026-11-02" };
  value.state.releases.push(release);
  const metadata = { name: release.name, goal: source === "milestone" ? release.goal : null, released: source === "milestone" ? release.released : null, startDate: source === "iteration" ? release.startDate : null, releaseDate: release.releaseDate };
  const iteration = { title: release.name, startDate: release.startDate, duration: 14 };
  const assignment = source === "iteration" ? JSON.stringify(iteration) : "https://github.com/org/repo/milestone/2";
  if (source === "milestone") value.state.externalRefs.push({ id: id(72), entityType: "release", entityId: release.id, scopeId: id(2), system: "github", externalId: assignment, syncedVersion: 1, createdAt });
  for (const side of [value.link.baseline!.acknowledgedLocal, value.link.baseline!.observedRemote]) {
    side.releaseMetadata = metadata;
    side.milestone = source === "milestone" ? assignment : null;
    if (source === "iteration") side.iteration = iteration;
  }
  value.link.baseline!.acknowledgedLocal.releaseId = release.id;
  return { assignment, metadata };
}

it.each(["milestone", "iteration"] as const)("requires chosen actual Release assignment and metadata for %s resolution", (source) => {
  const value = fixture("milestone");
  const chosen = prepareRelease(value, source);
  expect(agrees(value, chosen)).toBe(false);
  value.state.cards[0]!.releaseId = id(71);
  expect(agrees(value, chosen)).toBe(true);
  expect(agrees(value, chosen, "local")).toBe(true);
  value.state.releases[1]!.name = "Unreviewed local rename";
  expect(agrees(value, chosen)).toBe(false);
  value.state.releases[1]!.name = "Remote release";
  value.link.baseline!.observedRemote.releaseMetadata = { ...chosen.metadata, releaseDate: "2026-11-03" };
  expect(agrees(value, chosen)).toBe(false);
});

it("requires actual Unscheduled state before acknowledging a removed Milestone", () => {
  const value = fixture("milestone");
  expect(agrees(value, null)).toBe(false);
  value.state.cards[0]!.releaseId = null;
  expect(agrees(value, null)).toBe(true);
  expect(agrees(value, null, "local")).toBe(true);
});

it.each(["first", "last"] as const)("selects the Milestone from the Issue repository with foreign refs %s", (order) => {
  const value = fixture("milestone");
  const chosen = prepareRelease(value, "milestone");
  value.state.cards[0]!.releaseId = id(71);
  const foreign = { ...value.state.externalRefs.at(-1)!, id: id(73), externalId: "https://github.com/other/repo/milestone/9" };
  if (order === "first") value.state.externalRefs.unshift(foreign); else value.state.externalRefs.push(foreign);
  expect(agrees(value, chosen)).toBe(true);
  value.state.externalRefs = value.state.externalRefs.filter((row) => row.id !== id(72));
  expect(agrees(value, chosen)).toBe(false);
});

it("normalizes accepted duplicate status mapping labels without changing the configuration", () => {
  const value = fixture("status");
  value.state.connections[0]!.statusMapping[1]!.labels = ["done-z", "done-a", "done-z"];
  value.state.connections[0] = connectorConnectionSchema.parse(value.state.connections[0]);
  value.state.cards[0]!.status = "done";
  const configuration = structuredClone(value.state.connections);
  Object.freeze(value.state.connections[0]!.statusMapping[1]!.labels);
  expect(agrees(value, { labels: ["done-a", "done-z"], state: "closed" })).toBe(true);
  expect(agrees(value, { labels: ["done-a", "done-z"], state: "closed" }, "local")).toBe(true);
  expect(value.state.connections).toEqual(configuration);
  expect(agrees(value, { state: "closed", labels: ["done-z", "done-a"] })).toBe(false);
  expect(agrees(value, { labels: ["done-a", "done-z"], state: "open" })).toBe(false);
});

it("accepts reordered nested Release metadata while refusing actual metadata drift", () => {
  const value = fixture("milestone");
  const chosen = prepareRelease(value, "milestone");
  value.state.cards[0]!.releaseId = id(71);
  const reordered = { metadata: { released: chosen.metadata.released, goal: chosen.metadata.goal, releaseDate: chosen.metadata.releaseDate, startDate: chosen.metadata.startDate, name: chosen.metadata.name }, assignment: chosen.assignment };
  value.link.baseline!.acknowledgedLocal.releaseMetadata = reordered.metadata;
  expect(agrees(value, reordered)).toBe(true);
  expect(agrees(value, { ...reordered, metadata: { ...reordered.metadata, name: "Changed" } })).toBe(false);
});
