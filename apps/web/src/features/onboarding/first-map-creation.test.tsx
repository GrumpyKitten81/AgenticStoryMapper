// @vitest-environment jsdom // REQ first-use creation interaction
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole } from "@testing-library/dom";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoryMapsIndexRoute } from "@storymapper/web/app/routes/story-maps.index";
import { api } from "@storymapper/web/app/api";
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";

const controls = vi.hoisted(() => ({ navigate: vi.fn(), create: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: "project" }), useNavigate: () => controls.navigate,
  Link: ({ children }: { children: React.ReactNode }) => createElement("a", {}, children)
}));
vi.mock("@storymapper/web/app/feature-flags", () => ({ enabledStoryMapViews: ["tree"] }));
vi.mock("@storymapper/web/app/api", () => ({
  api: { createStoryMap: controls.create },
  useGettingStartedChecklist: () => ({ isFetched: true }),
  useProjects: () => ({ data: { projects: [{ id: "project", name: "Project", localPath: `/${"unbroken".repeat(60)}.lsm` }] } }),
  useStoryMaps: () => ({ isSuccess: true, data: { storyMaps: [] } })
}));
vi.mock("@storymapper/web/features/project-archive/ProjectArchivePanel", () => ({ ProjectArchivePanel: () => null }));
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove(); client?.clear(); vi.clearAllMocks();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.unstubAllGlobals();
});
async function mount() {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  host = document.body.appendChild(document.createElement("div")); root = createRoot(host);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(StoryMapsIndexRoute))));
}
async function name(value: string) {
  await act(async () => fireEvent.change(getByRole(host, "textbox", { name: "New story map name" }), { target: { value } }));
}

it("wraps the Project path and uses the central label-input spacing in a narrow overview", async () => {
  const stylesheet = document.head.appendChild(document.createElement("style"));
  stylesheet.textContent = readStylesheet(`${process.cwd()}/src/styles/global.css`);
  try {
    await mount();
    host.style.width = "320px";
    const path = host.querySelector<HTMLElement>(".path-display")!;
    path.closest("details")!.open = true;
    expect(path.textContent).toBe(`/${"unbroken".repeat(60)}.lsm`);
    expect(getComputedStyle(path).overflowWrap).toBe("anywhere");
    expect(getComputedStyle(path).minWidth).toBe("0");
    const input = getByRole(host, "textbox", { name: "New story map name" });
    const label = input.closest("label")!;
    expect(getComputedStyle(label).gap).toBe("var(--space-4)");
    expect(label.querySelector("button")).toBeNull();
    expect(label.nextElementSibling).toBe(getByRole(host, "button", { name: "Create a Story Map" }));
  } finally { stylesheet.remove(); }
});

it("rejects blanks and repeated submits, trims the name and opens the enabled default view only on success", async () => {
  let finish!: (map: { id: string }) => void;
  controls.create.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await mount();
  const form = host.querySelector("form")!;
  await name("   ");
  expect(getByRole(host, "button", { name: "Create a Story Map" }).hasAttribute("disabled")).toBe(true);
  await act(async () => fireEvent.submit(form));
  expect(api.createStoryMap).not.toHaveBeenCalled();
  await name("  My map  ");
  await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(api.createStoryMap).toHaveBeenCalledTimes(1);
  expect(controls.create.mock.calls[0]![0]).toEqual({ projectId: "project", name: "My map" });
  expect(controls.navigate).not.toHaveBeenCalled();
  expect(getByRole(host, "button", { name: "Creating Story Map..." }).hasAttribute("disabled")).toBe(true);
  await act(async () => finish({ id: "new-map" }));
  await vi.waitFor(() => expect(controls.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/projects/$projectId/story-maps/$storyMapId/tree", params: { projectId: "project", storyMapId: "new-map" } }));
});

it("keeps the entered name after failure and opens the map once a retry succeeds", async () => {
  controls.create.mockRejectedValue(new Error("Disk unavailable"));
  await mount(); await name("My map");
  await act(async () => fireEvent.submit(host.querySelector("form")!));
  await vi.waitFor(() => expect(getByRole(host, "alert").textContent).toBe("Disk unavailable"));
  expect((getByRole(host, "textbox", { name: "New story map name" }) as HTMLInputElement).value).toBe("My map");
  expect(getByRole(host, "button", { name: "Create a Story Map" }).hasAttribute("disabled")).toBe(false);
  expect(controls.navigate).not.toHaveBeenCalled();
  controls.create.mockResolvedValueOnce({ id: "retried-map" });
  await act(async () => fireEvent.submit(host.querySelector("form")!));
  await vi.waitFor(() => expect(controls.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/projects/$projectId/story-maps/$storyMapId/tree", params: { projectId: "project", storyMapId: "retried-map" } }));
  expect(controls.create).toHaveBeenCalledTimes(2);
});
