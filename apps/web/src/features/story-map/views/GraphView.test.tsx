// @vitest-environment jsdom // REQ FR-63
import { randomUUID } from "node:crypto";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { button, cardId, mount, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

afterEach(() => vi.unstubAllEnvs());

const url = viewUrl.replace(/tree$/u, "graph");
function prepare() {
  const [activity, step, story] = state.snapshot.cards;
  const hidden = { ...story!, id: randomUUID(), key: "LSM-4", title: "Hidden prerequisite", parked: true };
  const extra = { ...story!, id: randomUUID(), key: "LSM-5", title: "Unrelated", assignee: "Grace", parentId: null };
  state.snapshot = { ...state.snapshot, cards: [activity!, step!, { ...story!, assignee: "Ada" }, hidden, extra], cardDependencies: [{ id: randomUUID(), cardId, prerequisiteCardId: step!.id, createdAt: story!.createdAt }, { id: randomUUID(), cardId, prerequisiteCardId: hidden.id, createdAt: story!.createdAt }] };
  return { activity: activity!, step: step!, hidden, extra };
}
const node = (id: string = cardId) => document.querySelector<HTMLButtonElement>(`[data-graph-card-id="${id}"]`)!;
async function choose(label: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`[aria-label="Graph ${label}"]`)!;
  await act(async () => { select.focus(); select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(document.activeElement).toBe(select);
}

it("opens directly, shows all active levels and named canonical blockers, and shares selection across unmounted representations", async () => {
  const { step } = prepare(); await mount(url);
  expect(document.querySelectorAll(".graph-node")).toHaveLength(4);
  expect(document.querySelectorAll(".graph-viewport polyline")).toHaveLength(1);
  await act(async () => node().click());
  const panel = document.querySelector(".graph-relationships")!;
  expect(panel.textContent).toContain("Selected: LSM-3");
  expect(panel.textContent).toContain("LSM-4: Hidden prerequisite (Outside displayed dataset)");
  expect(panel.textContent).toContain("Open prerequisites: LSM-2, LSM-4");
  expect(node(step.id).textContent).toContain("Requires");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => button("Graph table").click());
  expect(document.querySelector(".graph-canvas")).toBeNull();
  expect(document.querySelectorAll(".graph-table tbody tr")).toHaveLength(3);
  expect(document.querySelectorAll(".graph-table th")).toHaveLength(4);
  expect(document.querySelector('.graph-table button[aria-pressed="true"]')!.textContent).toContain("LSM-3");
  await act(async () => button("Graph canvas").click());
  expect(document.querySelector(".graph-table")).toBeNull(); expect(node().getAttribute("aria-pressed")).toBe("true");
});

it("intersects filters, retains canonical out-of-filter names and clears selection and details on an empty dataset", async () => {
  const { activity } = prepare(); await mount(url);
  await act(async () => node().click());
  await choose("Activity", activity.id); await choose("Slice", "unscheduled"); await choose("Assignee", "assigned:Ada");
  expect(document.querySelectorAll(".graph-node")).toHaveLength(1); expect(document.querySelectorAll("polyline")).toHaveLength(0);
  expect(document.querySelector(".graph-relationships")!.textContent).toContain("LSM-2: Import source document (Outside displayed dataset)");
  await choose("Assignee", "assigned:Grace");
  expect(state.host.textContent).toContain("No cards match the current filters.");
  expect(document.querySelector(".graph-relationships")!.textContent).not.toContain("Selected:");
  await choose("Assignee", ""); expect(node().getAttribute("aria-pressed")).toBe("false");
});

it("scopes pan and zoom to the canvas and uses natural prerequisite-first button traversal", async () => {
  const { step } = prepare(); await mount(url);
  const nodes = [...document.querySelectorAll<HTMLButtonElement>(".graph-node")];
  expect(nodes.indexOf(node(step.id))).toBeLessThan(nodes.indexOf(node()));
  const viewport = document.querySelector<HTMLElement>("[data-graph-viewport]")!;
  const canvas = document.querySelector<HTMLElement>(".graph-canvas")!;
  const event = (key: string) => new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key });
  const outside = document.querySelector("select")!;
  await act(async () => outside.dispatchEvent(event("ArrowRight"))); expect(viewport.style.transform).toContain("translate(0px, 0px)");
  await act(async () => canvas.dispatchEvent(event("ArrowRight"))); expect(viewport.style.transform).toContain("translate(-40px, 0px)");
  await act(async () => node().dispatchEvent(event("+"))); expect(viewport.style.transform).toContain("scale(1.1)");
  for (const key of ["Tab", "Enter"]) { const press = event(key); await act(async () => node().dispatchEvent(press)); expect(press.defaultPrevented).toBe(false); }
});

it("pans and zooms with every canvas key within bounds and leaves browser shortcuts alone", async () => {
  prepare(); await mount(url);
  const viewport = document.querySelector<HTMLElement>("[data-graph-viewport]")!;
  const canvas = document.querySelector<HTMLElement>(".graph-canvas")!;
  const press = async (key: string, modifiers: KeyboardEventInit = {}) => act(async () => { canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...modifiers })); });
  for (const [key, transform] of [["ArrowLeft", "translate(40px, 0px)"], ["ArrowDown", "translate(40px, -40px)"], ["ArrowUp", "translate(40px, 0px)"]] as const) { await press(key); expect(viewport.style.transform).toContain(transform); }
  await press("-"); expect(viewport.style.transform).toContain("scale(0.9)");
  for (let index = 0; index < 20; index += 1) await press("-");
  expect(viewport.style.transform).toContain("scale(0.25)");
  for (let index = 0; index < 30; index += 1) await press("+");
  expect(viewport.style.transform).toContain("scale(2)");
  const before = viewport.style.transform;
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) { await press("-", modifiers); await press("ArrowRight", modifiers); }
  expect(viewport.style.transform).toBe(before);
});

it("renders canonical Required by and Blocked order cells in the table", async () => {
  const { step, extra } = prepare();
  const release = (id: string, position: number) => ({ id, storyMapId: step.storyMapId, name: id, position }) as never;
  state.snapshot = { ...state.snapshot, releases: [release("early", 0), release("late", 1)],
    cards: state.snapshot.cards.map((item) => item.id === cardId ? { ...item, releaseId: "early" } : item.id === step.id ? { ...item, releaseId: "late" } : item),
    cardDependencies: [...state.snapshot.cardDependencies, { id: randomUUID(), cardId: extra.id, prerequisiteCardId: cardId, createdAt: step.createdAt }] };
  await mount(url);
  await act(async () => button("Graph table").click());
  const row = [...document.querySelectorAll(".graph-table tbody tr")].find((candidate) => candidate.querySelector("td")!.textContent!.includes("LSM-3"))!;
  const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent);
  expect(cells[2]).toContain("LSM-5");
  expect(cells[3]).toContain("LSM-2");
});

it("pans the background without selecting and ends dragging on pointer cancellation", async () => {
  prepare(); await mount(url);
  const canvas = document.querySelector<HTMLElement>(".graph-canvas")!;
  canvas.setPointerCapture = vi.fn();
  const pointer = (type: string, x: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 10 }); Object.defineProperty(event, "pointerId", { value: 1 }); return event; };
  await act(async () => canvas.dispatchEvent(pointer("pointerdown", 10)));
  await act(async () => canvas.dispatchEvent(pointer("pointermove", 50)));
  const viewport = document.querySelector<HTMLElement>("[data-graph-viewport]")!;
  expect(viewport.style.transform).toContain("translate(40px, 0px)");
  await act(async () => canvas.dispatchEvent(pointer("pointercancel", 50)));
  await act(async () => canvas.dispatchEvent(pointer("pointermove", 100)));
  expect(viewport.style.transform).toContain("translate(40px, 0px)");
  expect(document.querySelector('.graph-node[aria-pressed="true"]')).toBeNull();
});

it("recomputes relationships on canonical refetch and clears a removed selection", async () => {
  prepare(); await mount(url); await act(async () => node().click());
  state.snapshot = { ...state.snapshot, cardDependencies: [] };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  expect(document.querySelector(".graph-relationships")!.textContent).toContain("Requires: None");
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.filter((card) => card.id !== cardId) };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  expect(document.querySelector(".graph-relationships")!.textContent).not.toContain("Selected:");
});

it("uses the explicit Open Card action and retains shared dirty-editor guards", async () => {
  prepare(); await mount(url); await act(async () => node().click()); await act(async () => button("Open Card").click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  const input = document.querySelector<HTMLInputElement>('[aria-label="Title"]') ?? document.querySelector<HTMLInputElement>('.card-detail-modal input');
  expect(input).not.toBeNull();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Unsaved graph edit"); input!.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close card detail"]')!.click());
  expect(document.body.textContent).toContain("Unsaved changes");
});

it("uses the supplied preview graph without changing canonical Cards and guards modal opening", async () => {
  prepare();
  const original = fetch;
  const previewId = randomUUID();
  const projected = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Preview graph title" } : card), cardDependencies: [] };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => path === `/api/changesets/${previewId}/preview` ? Response.json({ changeSet: { id: previewId, title: "Graph preview", status: "proposed" }, selectedOperationIds: [], conflicts: [], operations: [], boards: [{ snapshot: projected, markers: [] }], presentationStatus: "pending", closed: false, canApply: false, canApprove: false }) : original(path, init)));
  await mount(`${url}?preview=${previewId}`, "Preview graph title");
  expect(node().textContent).toContain("Preview graph title"); expect(document.querySelectorAll("polyline")).toHaveLength(0);
  expect(state.snapshot.cards.find((card) => card.id === cardId)!.title).toBe("Create traceable story cards");
  await act(async () => node().click());
  expect(button("Open Card").disabled).toBe(true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("renders directed arrow endpoints from the dependent boundary to its prerequisite boundary", async () => {
  const { step } = prepare(); await mount(url);
  const line = document.querySelector(".graph-viewport polyline")!;
  expect(line.getAttribute("marker-end")).toBe("url(#graph-arrow)");
  const points = line.getAttribute("points")!.split(" ").map((point) => point.split(",").map(Number));
  const dependent = node(), prerequisite = node(step.id);
  const start = points[0]!, end = points.at(-1)!;
  expect(start[0]).toBeCloseTo(Number.parseFloat(dependent.style.left) + Number.parseFloat(dependent.style.width));
  expect(start[1]).toBeCloseTo(Number.parseFloat(dependent.style.top) + Number.parseFloat(dependent.style.height) / 2);
  expect(end[0]).toBeCloseTo(Number.parseFloat(prerequisite.style.left));
  expect(end[1]).toBeCloseTo(Number.parseFloat(prerequisite.style.top) + Number.parseFloat(prerequisite.style.height) / 2);
  expect(start[0]).toBeLessThan(end[0]!);
});

it("encodes a literal unassigned assignee independently from the missing-assignee option", async () => {
  prepare();
  state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, assignee: "unassigned" } : card);
  await mount(url);
  const options = [...document.querySelectorAll<HTMLOptionElement>('[aria-label="Graph Assignee"] option')];
  expect(options.find((option) => option.textContent === "unassigned")!.value).toBe("assigned:unassigned");
  expect(options.find((option) => option.textContent === "Unassigned")!.value).toBe("unassigned");
  await choose("Assignee", "assigned:unassigned"); expect(document.querySelectorAll(".graph-node")).toHaveLength(1); expect(node()).not.toBeNull();
  await choose("Assignee", "unassigned"); expect(node()).toBeNull(); expect(document.querySelectorAll(".graph-node")).toHaveLength(2);
});

it("resets a panned and zoomed viewport when filters replace the layout", async () => {
  prepare(); await mount(url);
  const canvas = document.querySelector<HTMLElement>(".graph-canvas")!;
  await act(async () => {
    canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "+" }));
  });
  expect(document.querySelector<HTMLElement>("[data-graph-viewport]")!.style.transform).toBe("translate(-40px, 0px) scale(1.1)");
  await choose("Assignee", "assigned:Ada");
  expect(document.querySelector<HTMLElement>("[data-graph-viewport]")!.style.transform).toBe("translate(0px, 0px) scale(1)");
  expect(document.querySelectorAll(".graph-node")).toHaveLength(1);
});

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) };
}
function focusGeometry(target: HTMLElement, left: number, top: number) {
  const canvas = document.querySelector<HTMLElement>(".graph-canvas")!;
  const viewport = document.querySelector<HTMLElement>("[data-graph-viewport]")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => rect(100, 100, 500, 300));
  vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => {
    const values = viewport.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!;
    const zoom = Number(values[3]);
    return rect(100 + left * zoom + Number(values[1]), 100 + top * zoom + Number(values[2]), 240 * zoom, 150 * zoom);
  });
  return { canvas, viewport };
}

it("reveals an offscreen focused Card with explicit viewport geometry", async () => {
  prepare(); await mount(url);
  const target = node(); const { viewport } = focusGeometry(target, 700, 500);
  await act(async () => target.focus());
  expect(document.activeElement).toBe(target);
  expect(viewport.style.transform).toBe("translate(-448px, -358px) scale(1)");
  const bounds = target.getBoundingClientRect();
  expect(bounds.right).toBe(592); expect(bounds.bottom).toBe(392);
});

it("keeps the focused Card visible after keyboard zoom changes its geometry", async () => {
  prepare(); await mount(url);
  const target = node(); const { viewport } = focusGeometry(target, 250, 100);
  await act(async () => target.focus());
  expect(viewport.style.transform).toBe("translate(0px, 0px) scale(1)");
  await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "+" })));
  expect(viewport.style.transform).toBe("translate(-47px, 0px) scale(1.1)");
  expect(target.getBoundingClientRect().right).toBe(592);
  expect(document.activeElement).toBe(target);
});

it("preserves branching graph edges, named relationship words, selection and prerequisite ordering in both representations", async () => {
  const { activity, step, extra } = prepare();
  const last = { ...extra, id: randomUUID(), key: "LSM-6", title: "Second dependent" };
  state.snapshot.cards.push(last);
  const edge = (dependent: string, prerequisite: string) => ({ id: randomUUID(), cardId: dependent, prerequisiteCardId: prerequisite, createdAt: last.createdAt });
  state.snapshot.cardDependencies = [edge(cardId, activity.id), edge(cardId, step.id), edge(extra.id, cardId), edge(last.id, cardId)];
  await mount(url);
  const ids = [...document.querySelectorAll<HTMLElement>(".graph-node")].map((element) => element.dataset.graphCardId);
  expect(ids.indexOf(activity.id)).toBeLessThan(ids.indexOf(cardId)); expect(ids.indexOf(step.id)).toBeLessThan(ids.indexOf(cardId));
  expect(ids.indexOf(cardId)).toBeLessThan(ids.indexOf(extra.id)); expect(ids.indexOf(cardId)).toBeLessThan(ids.indexOf(last.id));
  expect(document.querySelectorAll("polyline")).toHaveLength(4);
  await act(async () => node().click());
  expect(node(activity.id).textContent).toContain("Requires"); expect(node(step.id).textContent).toContain("Requires");
  expect(node(extra.id).textContent).toContain("Required by"); expect(node(last.id).textContent).toContain("Required by");
  const panel = document.querySelector(".graph-relationships")!;
  expect(panel.textContent).toContain("Requires: LSM-1: Understand product requirements, LSM-2: Import source document");
  expect(panel.textContent).toContain("Required by: LSM-5: Unrelated, LSM-6: Second dependent");
  await act(async () => button("Graph table").click());
  const rows = [...document.querySelectorAll(".graph-table tbody tr")];
  expect(rows).toHaveLength(4);
  expect(rows.map((row) => [row.children[0]!.textContent, row.children[1]!.textContent])).toEqual([
    ["LSM-3: Create traceable story cards (Selected)", "LSM-1: Understand product requirements"],
    ["LSM-3: Create traceable story cards (Selected)", "LSM-2: Import source document"],
    ["LSM-5: Unrelated", "LSM-3: Create traceable story cards (Selected)"],
    ["LSM-6: Second dependent", "LSM-3: Create traceable story cards (Selected)"]
  ]);
  expect(document.querySelector(".graph-relationships")).toBe(panel);
  await act(async () => button("Graph canvas").click()); expect(node().getAttribute("aria-pressed")).toBe("true");
});

it("groups analysis navigation with every existing View exposed", async () => {
  prepare(); await mount(url);
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".story-map-view-tab-list a")];
  const names = links.map((link) => link.textContent!.trim());
  const slices = names.indexOf("Slices"), graph = names.indexOf("Graph"), github = names.indexOf("GitHub Sync");
  expect(graph).toBe(slices + 1); expect(github).toBe(graph + 2);
  expect(links[slices]!.classList.contains("view-tab-divider")).toBe(true);
  expect(links[graph]!.classList.contains("view-tab-divider")).toBe(false);
  expect(links[github]!.classList.contains("view-tab-divider")).toBe(true);
  expect(names[graph + 1]).toBe("TimelineExperimental");
});
it("shows a Changed cue when only a prerequisite endpoint changed in table mode", async () => {
  const { step } = prepare();
  const epoch = randomUUID();
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => path.startsWith("/api/activity/changes?") ? Response.json({ epoch, floor: 0, highWater: 1, nextAfterSeq: null, events: [{ id: randomUUID(), projectId: state.snapshot.storyMap.projectId, seq: 1, actor: "Agent", actorType: "agent", action: "card.updated", cards: [{ id: step.id, title: step.title, storyMapId }], createdAt: step.createdAt }] }) : original(path, init)));
  await mount(url);
  await act(async () => button("Graph table").click());
  await vi.waitFor(() => expect(document.querySelectorAll(".graph-table .changed-marker")).toHaveLength(1));
  const cell = document.querySelector(".graph-table .changed-marker")!.closest("td")!;
  expect(cell.cellIndex).toBe(1); expect(cell.textContent).toContain(step.title);
  expect(document.querySelector(".graph-table tbody tr td:first-child .changed-marker")).toBeNull();
});
