import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../../app/api";
import { exportStoryMapView } from "./story-map-view-export";
import { exportStoryMapViewAndRecord } from "./export-with-progress";

vi.mock("./story-map-view-export", () => ({ exportStoryMapView: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(exportStoryMapView).mockReset(); });

const options = { projectId: "project", storyMapName: "PRD to Delivery Map", viewKind: "discovery", format: "html" } as const;

it("records progress only after visual generation completes", async () => {
  let finish!: () => void;
  vi.mocked(exportStoryMapView).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const record = vi.spyOn(api, "recordGettingStartedExport").mockResolvedValue({ checklist: { projectId: "project", initialized: true, dismissed: false, sampleStoryMapId: "sample", completed: { createStoryMap: false, addCards: false, connectGitHub: false, export: true } } });
  const exporting = exportStoryMapViewAndRecord(options);
  expect(record).not.toHaveBeenCalled();
  finish();
  await exporting;
  expect(record).toHaveBeenCalledOnce();
  expect(record).toHaveBeenCalledWith("project", "html");
});

it("does not record failed generation and propagates persistence errors", async () => {
  const record = vi.spyOn(api, "recordGettingStartedExport").mockRejectedValue(new Error("Persistence failed"));
  vi.mocked(exportStoryMapView).mockRejectedValueOnce(new Error("Generation failed"));
  await expect(exportStoryMapViewAndRecord(options)).rejects.toThrow("Generation failed");
  expect(record).not.toHaveBeenCalled();
  vi.mocked(exportStoryMapView).mockResolvedValueOnce();
  await expect(exportStoryMapViewAndRecord(options)).rejects.toThrow("Persistence failed");
});
