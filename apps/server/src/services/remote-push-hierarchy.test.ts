import { expect, it } from "vitest";
import { vi } from "vitest";
import { prepareHierarchy } from "@storymapper/server/services/remote-push-hierarchy";
import type { Planning } from "@storymapper/server/services/remote-push-plan";

function fixture(baseline: number | null, current: number | null, desired: boolean): Planning {
  const issue = (number: number, parent: number | null) => ({ remoteId: String(number), remoteNumber: number, url: `https://github.com/org/repo/issues/${number}`, title: "Issue", body: "", state: "open", labels: [], parentEvidence: parent === null ? null : { number: parent, url: `https://github.com/org/repo/issues/${parent}`, repository: "org/repo" } });
  return {
    context: { repository: { listOpenSyncConflicts: () => [] }, connection: { id: "connection", provider: "github", owner: "org", repository: "repo" } }, input: {},
    snapshot: { cards: [{ id: "child", key: "CHILD", title: "Child", parentId: desired ? "parent" : null }, { id: "parent", key: "PARENT", title: "Parent", parentId: null }], remoteWorkItemLinks: [{ cardId: "child", connectionId: "connection", remoteParentNumber: baseline, baseline: { parentKnown: true } }] },
    source: { items: [{ cardId: "child" }] }, remoteIssues: new Map([["child", issue(2, current)], ["parent", issue(1, null)]]), items: [], blockers: [], check: () => {}
  } as unknown as Planning;
}

  it("prepares an add with explicit expected absence", async () => {
    const plan = fixture(null, null, true);
    await prepareHierarchy(plan);
    expect(plan.items).toMatchObject([{ kind: "relationship", action: "add", expectedParent: null, resultingParent: { remoteNumber: 1 }, child: { remoteNumber: 2 } }]);
  });
  it("prepares a change as dependent removal and addition", async () => {
    const plan = fixture(3, 3, true);
    await prepareHierarchy(plan);
    expect(plan.items).toMatchObject([{ action: "remove", expectedParent: { remoteNumber: 3 }, resultingParent: null }, { action: "add", expectedParent: null, resultingParent: { remoteNumber: 1 } }]);
    expect(plan.items[1]!.dependencies).toContain(plan.items[0]!.id);
  });
  it("prepares removal and blocks remote divergence", async () => {
    const removal = fixture(3, 3, false);
    await prepareHierarchy(removal);
    expect(removal.items).toMatchObject([{ action: "remove", resultingParent: null }]);
    const conflict = fixture(3, 4, true);
    await prepareHierarchy(conflict);
    expect(conflict.items).toEqual([]);
    expect(conflict.blockers).toEqual([expect.stringContaining("Parent conflict")]);
  });
  it("depends on newly created parent and child Issues regardless of selection order", async () => {
    const plan = fixture(null, null, true);
    plan.remoteIssues.clear();
    plan.items.push({ kind: "issue", id: "parent-create", entityId: "parent", action: "create" } as never, { kind: "issue", id: "child-create", entityId: "child", action: "create" } as never);
    await prepareHierarchy(plan);
    expect(plan.items[2]).toMatchObject({ action: "add", dependencies: ["child-create", "parent-create"], resultingParent: { kind: "create", cardKey: "PARENT" } });
  });
  it("does not overwrite a changed parent or interpret incomplete observations as absence", async () => {
    const plan = fixture(null, null, true);
    plan.remoteIssues.get("child")!.parentEvidence = undefined;
    await prepareHierarchy(plan);
    expect(plan.items).toEqual([]);
    expect(plan.blockers).toEqual([expect.stringContaining("incomplete")]);
    const converged = fixture(3, 1, true);
    await prepareHierarchy(converged);
    expect(converged.items).toMatchObject([{ action: "acknowledge", expectedParent: { remoteNumber: 1 }, resultingParent: { remoteNumber: 1 } }]);
    expect(converged.blockers).toEqual([]);
  });
  it("uses the explicitly selected parent after validating its identity", async () => {
    const plan = fixture(null, null, false);
    plan.input.parentIssueNumber = 1;
    plan.provider = { getRemoteItem: vi.fn(async () => ({ status: "found", item: plan.remoteIssues.get("parent")! })) } as never;
    plan.auth = { connection: plan.context.connection, auth: {} } as never;
    await prepareHierarchy(plan);
    expect(plan.items).toMatchObject([{ action: "add", resultingParent: { remoteNumber: 1 } }]);
  });
  it("blocks cyclic local parent references", async () => {
    const plan = fixture(null, null, true);
    plan.snapshot.cards[1]!.parentId = "child";
    await prepareHierarchy(plan);
    expect(plan.items).toEqual([]);
    expect(plan.blockers).toEqual([expect.stringContaining("cyclic")]);
  });
  it("blocks changes from a legacy unknown baseline and offers explicit converged acknowledgement", async () => {
    const change = fixture(null, null, true);
    delete change.snapshot.remoteWorkItemLinks[0]!.baseline!.parentKnown;
    await prepareHierarchy(change);
    expect(change.items).toEqual([]);
    expect(change.blockers).toEqual([expect.stringContaining("unknown")]);
    const converged = fixture(null, null, false);
    delete converged.snapshot.remoteWorkItemLinks[0]!.baseline!.parentKnown;
    await prepareHierarchy(converged);
    expect(converged.items).toMatchObject([{ action: "acknowledge", expectedParent: null, resultingParent: null }]);
  });
