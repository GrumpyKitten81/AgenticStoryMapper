import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { syncConflictSchema } from "@storymapper/contracts";
import { ConflictAlert } from "@storymapper/web/features/conflicts/ConflictAlert";
import { randomUUID } from "node:crypto";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@storymapper/web/app/api";
import { createConflictMutationCache } from "@storymapper/web/app/conflict-fallback";
import { ConflictError, isConflictError, conflictFor, syncConflictsFor } from "@storymapper/web/app/conflicts";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";

const id = randomUUID();
const conflictBody = { code: "conflict", message: "1 object(s) changed since they were read.", conflicts: [{ entity: "card" as const, id, baseVersion: 1, currentVersion: 2, current: { id, title: "Remote" } }] };

afterEach(() => { vi.unstubAllGlobals(); useAnnouncementStore.setState({ alert: "", status: "" }); });

describe("typed request failures", () => {
  it("turns a 409 conflict response into a ConflictError carrying every entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(conflictBody, { status: 409 })));
    const error = await api.updateCard(id, { title: "Mine" }, 1).catch((caught: unknown) => caught);
    expect(isConflictError(error)).toBe(true);
    expect((error as ConflictError).conflicts).toEqual(conflictBody.conflicts);
  });

  it.each([[409, { message: "not a conflict body" }], [500, conflictBody], [400, { message: "bad" }]])("keeps status %s without a valid conflict body a plain error", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));
    const error = await api.deleteStoryMap(id, 1).catch((caught: unknown) => caught);
    expect(isConflictError(error)).toBe(false);
    expect((error as Error).message).toBe(`Request failed: ${status}`);
  });
});

describe("global conflict fallback", () => {
  async function run(meta?: { ownsConflict: boolean }) {
    const queryClient: QueryClient = new QueryClient({ mutationCache: createConflictMutationCache(() => queryClient) });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await queryClient.getMutationCache().build(queryClient, { mutationFn: async () => { throw new ConflictError("stale", conflictBody.conflicts as never); }, ...(meta ? { meta } : {}) }).execute(undefined).catch(() => undefined);
    return spy;
  }

  it("announces an alert and reloads when a mutation without an editor draft conflicts", async () => {
    const spy = await run();
    expect(useAnnouncementStore.getState().alert).toContain("Card changed since you loaded it");
    expect(spy).toHaveBeenCalled();
  });

  it("stays silent for mutations whose editor owns the conflict", async () => {
    const spy = await run({ ownsConflict: true });
    expect(useAnnouncementStore.getState().alert).toBe("");
    expect(spy).not.toHaveBeenCalled();
  });
});

it("preserves simultaneous sync and version recovery when the sync entry appears first", async () => {
  const sync = syncConflictSchema.parse({ id: randomUUID(), externalRefId: randomUUID(), connectionId: randomUUID(), syncRunId: randomUUID(), cardId: id, field: "title", localValue: "Reviewed local title", remoteValue: "Reviewed GitHub title", createdAt: "2026-10-19T00:00:00.000Z" });
  const version = { ...conflictBody.conflicts[0]!, reason: "version" as const };
  const syncEntry = { ...version, reason: "sync" as const, syncConflictId: sync.id, current: sync };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...conflictBody, conflicts: [syncEntry, version] }, { status: 409 })));
  const error = await api.updateCard(id, { title: "Draft" }, 1).catch((caught: unknown) => caught);
  expect(conflictFor(error, id)).toEqual(version);
  expect(syncConflictsFor(error, id)).toEqual([syncEntry]);
  const markup = renderToStaticMarkup(createElement(ConflictAlert, { error, entityId: id, name: "Card", onReload: vi.fn(), onKeepMine: vi.fn() }));
  expect(markup).toContain("Keep mine");
  expect(markup).toContain("Reviewed local title");
  expect(markup).toContain("Reviewed GitHub title");
  expect(markup).toContain("Title is locked");
  expect(conflictFor(new ConflictError("Sync", [syncEntry]), id)).toBeUndefined();
});
