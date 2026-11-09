// @vitest-environment jsdom // REQ FR-62
import { randomUUID } from "node:crypto";
import { act } from "react";
import { expect, it, vi } from "vitest";
import type { PlanState } from "@storymapper/contracts";
import { buildPlanStateProjection, comparePlanStates } from "@storymapper/core";
import { mount, projectId, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

it("announces pending state reads and hides cached successful columns after Restore removes a selected state", async () => {
  const before: PlanState = { id: randomUUID(), projectId, storyMapId, actor: "human", capturedAt: new Date().toISOString(), schemaVersion: 1, payload: buildPlanStateProjection(state.snapshot) };
  const after = { ...structuredClone(before), id: randomUUID() };
  let releaseList!: () => void;
  let releaseComparison!: () => void;
  let removed = false;
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${storyMapId}/plan-states`) {
      if (!removed) await new Promise<void>((resolve) => { releaseList = resolve; });
      return Response.json({ states: removed ? [] : [before, after].map(({ payload: _, ...summary }) => summary) });
    }
    if (path.includes("/plan-states/compare?")) {
      if (removed) return Response.json({ message: "Selected state is unavailable after Restore" }, { status: 404 });
      await new Promise<void>((resolve) => { releaseComparison = resolve; });
      return Response.json(comparePlanStates(before, after));
    }
    return original(path, init);
  }));
  await mount(viewUrl.replace(/tree$/u, "slices"));
  const component = document.querySelector(".plan-state-comparison")!;
  expect(component.getAttribute("aria-busy")).toBe("true");
  expect(component.querySelector("[role=status]")!.textContent).toBe("Loading...");
  await act(async () => releaseList());
  await vi.waitFor(() => expect(component.getAttribute("aria-busy")).toBe("false"));
  const selectors = component.querySelectorAll<HTMLSelectElement>("select");
  await act(async () => {
    selectors[0]!.value = before.id; selectors[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    selectors[1]!.value = after.id; selectors[1]!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await vi.waitFor(() => expect(component.getAttribute("aria-busy")).toBe("true"));
  expect(component.querySelector("[role=status]")!.textContent).toBe("Loading...");
  await act(async () => releaseComparison());
  await vi.waitFor(() => expect(component.querySelector(".plan-state-columns")).not.toBeNull());
  removed = true;
  await act(async () => {
    await Promise.all([state.client.invalidateQueries({ queryKey: ["plan-states", storyMapId] }), state.client.invalidateQueries({ queryKey: ["plan-state-comparison", storyMapId] })]);
  });
  await vi.waitFor(() => expect(component.querySelector("[role=alert]")!.textContent).toContain("unavailable after Restore"));
  expect(state.client.getQueryData(["plan-state-comparison", storyMapId, before.id, after.id])).toBeDefined();
  expect(component.querySelector(".plan-state-columns")).toBeNull();
  expect(component.getAttribute("aria-busy")).toBe("false");
});
