// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { RemotePushPlan } from "@storymapper/contracts";
import { RemotePushReview } from "@storymapper/web/features/github-sync/RemotePushReview";

vi.mock("@storymapper/web/features/card-review", () => ({ PushReviewControls: () => null }));
const container = document.createElement("div");
const root = createRoot(container);
afterEach(() => { act(() => root.render(null)); });

it("shows a reviewed relationship transition, created parent and blocker", async () => {
  const parentId = randomUUID();
  const cardId = randomUUID();
  const effect = { id: randomUUID(), entityId: cardId, marker: "relationship", dependencies: [parentId], labelAdditions: [], labelRemovals: [], managedLabels: [] };
  const plan: RemotePushPlan = {
    id: randomUUID(), actor: { actorType: "human", actorId: "test" }, projectId: randomUUID(), storyMapId: randomUUID(), connectionId: randomUUID(), epoch: "test", createdAt: "2026-11-24T00:00:00.000Z", selection: {}, localFingerprint: "local", connectionFingerprint: "connection", safetyFingerprint: "safety", remoteFingerprint: "remote", remoteEvidence: { writable: true, labels: [], issueTypes: [], milestones: [] }, exclusions: [], blockers: ["Resolve conflict"],
    items: [
      { ...effect, id: parentId, kind: "issue", action: "create", dependencies: [], payload: { title: "Parent card", body: "", labels: [], issueType: "Task", remoteState: "open", milestoneNumber: null } },
      { ...effect, kind: "relationship", action: "add", cardKey: "US-1", cardTitle: "Child", child: { kind: "existing", remoteNumber: 7, url: "https://github.com/owner/repo/issues/7" }, expectedParent: null, resultingParent: { kind: "create", itemId: parentId, cardKey: "F-1", cardTitle: "Parent card" } }
    ]
  };
  const confirm = vi.fn();
  await act(async () => root.render(<RemotePushReview plan={plan} onConfirm={confirm} />));
  expect(container.textContent).toContain("Parent card (Issue created by this plan)");
  expect(container.textContent).toContain("No parent");
  expect(container.querySelector('a[href="https://github.com/owner/repo/issues/7"]')?.textContent).toBe("#7");
  expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
  expect(confirm).not.toHaveBeenCalled();
});
