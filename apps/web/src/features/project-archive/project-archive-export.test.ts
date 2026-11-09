import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../app/api";
import { downloadProjectArchive } from "./ProjectArchivePanel";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function downloadEnvironment() {
  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal("document", { createElement: () => anchor, body: { append: vi.fn() } });
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:archive");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { anchor, createObjectURL, revokeObjectURL };
}

it("awaits the archive response and artifact, downloads it, then refreshes the exported Project checklist", async () => {
  const { anchor, createObjectURL } = downloadEnvironment();
  let resolveResponse!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  client.setQueryData(["getting-started", "one"], {});
  client.setQueryData(["getting-started", "two"], {});
  const exporting = downloadProjectArchive(client, "one");
  expect(anchor.click).not.toHaveBeenCalled();
  expect(client.getQueryState(["getting-started", "one"])?.isInvalidated).toBe(false);
  resolveResponse(new Response("archive contents", { headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="local-project.zip"' } }));
  await exporting;
  expect(fetch).toHaveBeenCalledWith("/api/projects/export?projectId=one");
  expect(await (createObjectURL.mock.calls[0]![0] as Blob).text()).toBe("archive contents");
  expect(anchor.download).toBe("local-project.zip");
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(client.getQueryState(["getting-started", "one"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["getting-started", "two"])?.isInvalidated).toBe(false);
  client.clear();
});

it("failed server generation and failed downloads reject without refreshing completion", async () => {
  const { anchor, revokeObjectURL } = downloadEnvironment();
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const fetch = vi.fn().mockResolvedValueOnce(new Response("generation failed", { status: 500 }));
  vi.stubGlobal("fetch", fetch);
  await expect(downloadProjectArchive(client, "one")).rejects.toThrow("500");
  expect(anchor.click).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(new Response("archive", { headers: { "content-disposition": 'attachment; filename="project.zip"' } }));
  anchor.click.mockImplementationOnce(() => { throw new Error("Download failed"); });
  await expect(downloadProjectArchive(client, "one")).rejects.toThrow("Download failed");
  expect(invalidate).not.toHaveBeenCalled();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:archive");
  client.clear();
});

it("uses the same awaited artifact download for successful server map and audit exports", async () => {
  const { anchor } = downloadEnvironment();
  const fetch = vi.fn().mockResolvedValueOnce(new Response("generated map", { headers: { "content-disposition": 'attachment; filename="delivery-story-map.json"' } }))
    .mockResolvedValueOnce(new Response("generated audit", { headers: { "content-disposition": 'attachment; filename="local-project-audit.md"' } }));
  vi.stubGlobal("fetch", fetch);
  await api.downloadStoryMapExport("map", "json");
  expect(anchor.download).toBe("delivery-story-map.json");
  await api.downloadAuditExport("project", "markdown");
  expect(fetch.mock.calls.map((call) => call[0])).toEqual(["/api/exports/story-map?storyMapId=map&format=json", "/api/exports/audit?projectId=project&format=markdown"]);
  expect(anchor.download).toBe("local-project-audit.md");
  expect(anchor.click).toHaveBeenCalledTimes(2);
});

it("rejects a response with no filename before creating a download or refreshing completion", async () => {
  const { anchor, createObjectURL } = downloadEnvironment();
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("archive")));
  await expect(downloadProjectArchive(client, "one")).rejects.toThrow("Export response is missing its filename.");
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(anchor.click).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  client.clear();
});
