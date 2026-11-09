// @vitest-environment jsdom // REQ Story3.10 all browser mutations carry their tab origin
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { LIVE_CLIENT_ID_HEADER } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";

afterEach(() => vi.unstubAllGlobals());

it("tagsJSON, DELETE, restore and multipart requests with the same per-tab origin", async () => {
  const requests: RequestInit[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    requests.push(init);
    return Response.json({ message: "Expected refusal" }, { status: 400 });
  }));
  const id = randomUUID();
  await expect(api.updateCard(id, { title: "Edited title" }, 1)).rejects.toThrow();
  await expect(api.deletePersona(id, 1)).rejects.toThrow();
  await expect(api.createRestorePoint(id)).rejects.toThrow();
  await expect(api.restoreProject(id, "snapshot.zip")).rejects.toThrow();
  await expect(api.importProjectArchive(new File(["archive"], "project.zip"))).rejects.toThrow();
  expect(requests).toHaveLength(5);
  expect(requests[1]?.method).toBe("DELETE");
  for (const request of requests) expect(new Headers(request.headers).get(LIVE_CLIENT_ID_HEADER)).toBe(getLiveClientId());
  expect(new Headers(requests[4]!.headers).has("content-type")).toBe(false);
});
