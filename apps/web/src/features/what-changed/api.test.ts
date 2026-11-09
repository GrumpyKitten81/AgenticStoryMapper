import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { readChanges } from "@storymapper/web/features/what-changed/api";
const epoch = randomUUID(), projectId = randomUUID();
afterEach(() => vi.unstubAllGlobals());
it("drains more than100 eligible events at the original cut despite concurrent appends", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const url = new URL(path, "http://localhost"); requests.push(url);
    const after = Number(url.searchParams.get("afterSeq"));
    return Response.json({ epoch, floor: 0, highWater: 201, nextAfterSeq: after === 0 ? 100 : after === 100 ? 200 : null,
      events: Array.from({ length: after === 200 ? 1 : 100 }, (_, i) => ({ id: randomUUID(), projectId, seq: after + i + 1, actor: "Agent", actorType: "agent", action: "card.updated", createdAt: "2026-10-15T10:00:00Z" })) });
  }));
  const result = await readChanges(projectId, new AbortController().signal);
  expect(result.events).toHaveLength(201);
  expect(requests.map((url) => url.searchParams.get("highWater"))).toEqual([null, "201", "201"]);
});
it("restarts an epoch transition and rejects failed partial drainage instead of exposing a prefix", async () => {
  const replacement = randomUUID();
  let call = 0;
  vi.stubGlobal("fetch", vi.fn(async () => { call++; return Response.json({ epoch: call === 1 ? epoch : replacement, floor: call === 1 ? 0 : 10, highWater: 11, events: [], nextAfterSeq: call === 1 ? 5 : null }); }));
  expect((await readChanges(projectId, new AbortController().signal)).epoch).toBe(replacement);
  expect(call).toBe(3);
  call = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ++call === 1 ? Response.json({ epoch, floor: 0, highWater: 10, events: [], nextAfterSeq: 5 }) : new Response("failure", { status: 503 })));
  await expect(readChanges(projectId, new AbortController().signal)).rejects.toThrow("503");
});
it("sends a persisted cursor above the restored high-water with its old epoch and retains new-epoch post-Restore events", async () => {
  const restoredEpoch = randomUUID();
  const requests: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    requests.push(new URL(path, "http://localhost"));
    return Response.json({ epoch: restoredEpoch, floor: 10, highWater: 12, nextAfterSeq: null, events: [{ id: randomUUID(), projectId, seq: 12, actor: "Agent", actorType: "agent", action: "card.updated", createdAt: "2026-10-15T10:00:00Z" }] });
  }));
  const result = await readChanges(projectId, new AbortController().signal, { epoch, throughSeq: 999 });
  expect(requests[0]!.searchParams.get("epoch")).toBe(epoch);
  expect(requests[0]!.searchParams.get("afterSeq")).toBe("999");
  expect(result.epoch).toBe(restoredEpoch); expect(result.events.map((event) => event.seq)).toEqual([12]);
});
