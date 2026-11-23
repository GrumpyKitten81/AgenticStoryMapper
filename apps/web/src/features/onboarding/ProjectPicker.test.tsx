// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/dom";
import type { Project } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLastProjectStore } from "@storymapper/web/app/stores/last-project-store";
import { ProjectPicker } from "./ProjectPicker";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
const projects = [{ id: "first", name: "First" }, { id: "second", name: "Second" }] as Project[];
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); navigate.mockReset(); vi.unstubAllGlobals();
});
async function mount(lastOpenedProjectId: string | undefined) {
  useLastProjectStore.setState({ lastOpenedProjectId });
  await act(async () => root.render(createElement(ProjectPicker, { projects })));
  return host.querySelector("select")!;
}

it("preselects the last opened project and opens the chosen project", async () => {
  expect((await mount("second")).value).toBe("second");
  await act(async () => fireEvent.submit(host.querySelector("form")!));
  expect(navigate).toHaveBeenCalledWith({ to: "/projects/$projectId/story-maps", params: { projectId: "second" } });
});

it("falls back to the first project when the last opened project no longer exists", async () => {
  expect((await mount("removed")).value).toBe("first");
});
