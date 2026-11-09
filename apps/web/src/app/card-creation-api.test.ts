// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@storymapper/web/app/api";
import { RequestError } from "@storymapper/web/app/conflicts";

afterEach(() => vi.unstubAllGlobals());

it.each([
  [400, '{"message":"Parent is invalid."}', "Parent is invalid."],
  [409, '{"message":"Parent changed."}', "Parent changed."],
  [500, "", "Request failed: 500"],
  [502, "<html>Bad Gateway</html>", "Request failed: 502"],
  [409, "not-json", "Request failed: 409"],
  [400, "{}", "Request failed: 400"]
] as const)("preserves create HTTP failure status %i and its available message", async (status, body, message) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
  const request = api.createCard({ storyMapId: "map", level: "note", title: "Actual title" });
  await expect(request).rejects.toBeInstanceOf(RequestError);
  await expect(request).rejects.toMatchObject({ status, message });
});

it("does not mask non-parsing response read failures", async () => {
  const failure = new TypeError("Response body unavailable");
  const response = new Response("{}", { status: 500 });
  vi.spyOn(response, "json").mockRejectedValue(failure);
  vi.stubGlobal("fetch", vi.fn(async () => response));
  await expect(api.createCard({ storyMapId: "map", level: "note", title: "Actual title" })).rejects.toBe(failure);
});
