import { afterEach, expect, it, vi } from "vitest";
import { exportStoryMapView } from "./story-map-view-export";
import { readFileSync } from "node:fs";

const tokens = readFileSync(new URL("../../../styles/tokens.css", import.meta.url), "utf8");

vi.mock("@storymapper/web/features/story-map/export/story-map-export.css?raw", async () => {
  const { readFileSync } = await import("node:fs");
  return { default: readFileSync(new URL("./story-map-export.css", import.meta.url), "utf8") };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("downloads HTML with the actual English export timestamp, user title and unchanged filename suffix", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));
  let stampText = "";
  const clone = {
    style: {},
    querySelectorAll: vi.fn(() => []),
    append: (stamp: { textContent: string }) => { stampText = stamp.textContent; },
    get outerHTML() { return `<section><h2>PRD to Delivery Map</h2><div>${stampText}</div></section>`; }
  };
  const target = {
    cloneNode: vi.fn(() => clone),
    querySelectorAll: vi.fn(() => []),
    scrollWidth: 800, clientWidth: 800, scrollHeight: 600, clientHeight: 600
  };
  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  const querySelector = vi.fn(() => target);
  vi.stubGlobal("document", {
    querySelector,
    createElement: (tag: string) => tag === "a" ? anchor : { textContent: "", style: {} },
    styleSheets: [{ cssRules: [{ type: 3, styleSheet: { cssRules: [{ cssText: tokens }] } }] }],
    body: { append: vi.fn() }
  });
  vi.stubGlobal("window", { setTimeout: (callback: () => void) => callback() });
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  await exportStoryMapView({ storyMapName: "PRD to Delivery Map", viewKind: "discovery", format: "html" });

  const blob = createObjectURL.mock.calls[0]![0] as Blob;
  const html = await blob.text();
  expect(html).toContain("--color-surface:");
  expect(html).toContain("--color-primary:");
  expect(html).toContain("var(--color-text)");
  expect(html).toContain('class="export-document"');
  expect(html).not.toContain("@import");
  expect(blob.type).toBe("text/html;charset=utf-8");
  expect(html).toContain("Exported: Oct 3, 2026, 12:00 PM");
  expect(html).toContain("<title>PRD to Delivery Map - Discovery</title>");
  expect(html).toContain("<h2>PRD to Delivery Map</h2>");
  expect(querySelector).toHaveBeenCalledWith('[data-story-map-export-target="discovery"]');
  expect(anchor.download).toBe("prd-to-delivery-map-discovery.html");
  expect(anchor.click).toHaveBeenCalledOnce();
});
