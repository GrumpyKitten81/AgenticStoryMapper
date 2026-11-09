import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { LiveTransaction } from "@storymapper/contracts";
import { createLiveAnnouncements } from "@storymapper/web/app/live/live-announcements";

function transaction(actorId: string): LiveTransaction {
  const epoch = randomUUID();
  return { epoch, seq: 1, id: `${epoch}:1`, actor: { actorType: "agent", actorId }, originClientId: null,
    entities: [{ entityType: "card", entityId: randomUUID(), projectId: randomUUID(), version: 1 }] };
}

afterEach(() => vi.useRealTimers());

it("uses trailing1.5s coalescing and a5s rate bound with truthful mixed actors and120-character copy", async () => {
  vi.useFakeTimers();
  const announce = vi.fn();
  const announcements = createLiveAnnouncements(announce);
  announcements.add([transaction("Claude Code")]);
  await vi.advanceTimersByTimeAsync(1000);
  announcements.add([transaction("GitHub sync")]);
  await vi.advanceTimersByTimeAsync(1499);
  expect(announce).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(announce).toHaveBeenLastCalledWith("2 cards changed by multiple actors.");
  announcements.add([transaction("Very long actor ".repeat(30))]);
  await vi.advanceTimersByTimeAsync(4999);
  expect(announce).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(announce).toHaveBeenCalledTimes(2);
  expect(announce.mock.calls[1]![0].length).toBeLessThanOrEqual(120);
  announcements.close();
});
