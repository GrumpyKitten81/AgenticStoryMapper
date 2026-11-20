// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { exportStoryMapView } from "./story-map-view-export";

vi.mock("@storymapper/web/features/story-map/export/story-map-export.css?raw", () => ({ default: "" }));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

it("exports collapsed and pinned Discovery lanes expanded at their normal position without changing the board (#16)", async () => {
  document.body.innerHTML = `<div data-story-map-export-target="discovery"><div class="discovery-matrix">
    <div class="release-band-header discovery-lane-pinned"><button class="lane-pin pinned">Pin</button></div>
    <div role="row" class="discovery-lane-body" hidden style="display: none"><div class="discovery-cell"><div class="story-stack"><div class="card-tile">Collapsed story</div></div></div></div>
    <div role="row" class="discovery-lane-body" style="display: contents"><div class="discovery-cell discovery-lane-pinned pinned" hidden><div class="card-tile">Filtered story</div></div></div>
    <div class="discovery-pinned-block pinned"><div class="discovery-notassigned">Unassigned</div></div>
  </div></div>`;
  const target = document.querySelector("[data-story-map-export-target]")!;
  const original = target.outerHTML;
  const createObjectURL = vi.fn((_blob: Blob) => "blob:export");
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  await exportStoryMapView({ storyMapName: "Map", viewKind: "discovery", format: "html" });

  const reader = new FileReader();
  const html = await new Promise<string>((resolve) => { reader.onload = () => resolve(String(reader.result)); reader.readAsText(createObjectURL.mock.calls[0]![0]); });
  const exported = new DOMParser().parseFromString(html, "text/html");
  const [collapsedLane, filteredLane] = exported.querySelectorAll<HTMLElement>(".discovery-lane-body");
  expect(collapsedLane!.hidden).toBe(false);
  expect(collapsedLane!.style.display).toBe("contents");
  expect(collapsedLane!.textContent).toContain("Collapsed story");
  expect(filteredLane!.querySelector<HTMLElement>(".discovery-cell")!.hidden).toBe(true);
  expect(exported.querySelectorAll(".discovery-lane-pinned, .discovery-pinned-block.pinned, .discovery-cell.pinned")).toHaveLength(0);
  expect(exported.querySelector(".lane-pin.pinned")).not.toBeNull();
  expect(target.outerHTML).toBe(original);
});
