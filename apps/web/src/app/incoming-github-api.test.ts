// @vitest-environment jsdom // REQ Story 7.5 truthful incoming preparation failures
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@storymapper/web/app/api";
import { IncomingGitHubError } from "@storymapper/web/app/incoming-github-error";
import { RequestError } from "@storymapper/web/app/conflicts";

const items = [
  { status: "not_attempted", remoteId: "6", message: "Prepared item was not applied because preparation failed." },
  { status: "failed", remoteId: "7", code: "validation", message: "Provider unavailable.", details: { phase: "prepare" } },
  { status: "not_attempted", remoteId: "8", message: "An earlier preparation failed." }
];
afterEach(() => vi.unstubAllGlobals());

it.each(["import", "sync", "pull"] as const)("retains all structured %s failure results without reporting success", async (operation) => {
  const fetch = vi.fn(async () => Response.json({ code: "validation", message: "Provider unavailable.", details: { items } }, { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  const request = operation === "import" ? api.importWorkItems({ storyMapId: "map", connectionId: "connection", apply: false })
    : operation === "sync" ? api.syncWorkItems({ storyMapId: "map", connectionId: "connection", confirm: true, apply: false })
    : api.pullStoryMapWorkItems({ storyMapId: "map", confirm: true, apply: false });
  await expect(request).rejects.toBeInstanceOf(IncomingGitHubError);
  await expect(request).rejects.toMatchObject({ status: 400, message: "Provider unavailable.", items });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves an actionable outgoing preparation refusal", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "validation", message: "Refresh the GitHub session." }, { status: 400 })));
  const request = api.planWorkItemSync({ storyMapId: "map", connectionId: "connection", cardIds: ["card"], mode: "sync" });
  await expect(request).rejects.toBeInstanceOf(RequestError);
  await expect(request).rejects.toMatchObject({ status: 400, message: "Refresh the GitHub session." });
});
