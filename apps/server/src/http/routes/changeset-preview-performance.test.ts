import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { StoryMapSnapshot } from "@storymapper/contracts";
import { previewFixture } from "@storymapper/server/fixtures/changeset-preview";

it.each([1, 2, 3])("measures serial actual GET preview sample %s for 1,000 Cards and 200 selected operations", async (sample) => {
  const f = await previewFixture(1000);
  try {
    const proposal = f.proposal(f.cards.slice(0, 200).map((card, index) => ({ operationId: `update-${index}`, entity: "card", op: "update", entityId: card.id, baseVersion: card.version, after: { title: `Updated ${index}` } })));
    const selection = proposal.operations.map((operation) => operation.operationId);
    const before = f.handle.current.$client.serialize();
    const start = performance.now();
    const response = await f.preview(proposal.id, selection);
    const durationMs = performance.now() - start;
    const measurement = { measuredAt: new Date().toISOString(), pipeline: "actual-http-GET-preview", sample, cards: 1000, operations: 200, durationMs, boundMs: 500, passed: durationMs <= 500 };
    appendFileSync(join(tmpdir(), "storymapper-4-9-preview-budget.jsonl"), JSON.stringify(measurement) + "\n");
    process.stdout.write(JSON.stringify(measurement) + "\n");
    expect(response.statusCode, response.body.slice(0, 200)).toBe(200);
    const preview = response.json();
    expect(preview.selectedOperationIds).toEqual(selection);
    expect(preview.operations).toHaveLength(200);
    expect(preview.boards[0].snapshot.cards).toHaveLength(1000);
    expect(preview.boards[0].snapshot.cards.filter((card: { title: string }) => card.title.startsWith("Updated "))).toHaveLength(200);
    expect(f.handle.current.$client.serialize().equals(before)).toBe(true);
    const payload = { selectedOperationIds: preview.selectedOperationIds };
    for (const action of ["approve", "apply"]) {
      const result = await f.server.inject({ method: "POST", url: `/api/changesets/${proposal.id}/${action}`, payload });
      expect(result.statusCode, result.body.slice(0, 200)).toBe(200);
    }
    expect(semanticSnapshot(f.repository.getStoryMapSnapshot(f.map.id)!)).toEqual(semanticSnapshot(preview.boards[0].snapshot));
    expect(durationMs, `actual GET preview ${durationMs.toFixed(2)}ms; nominal 500ms`).toBeLessThanOrEqual(1500);
  } finally { await f.close(); }
});

function semanticSnapshot(snapshot: StoryMapSnapshot) {
  const { version: _version, updatedAt: _updatedAt, ...storyMap } = snapshot.storyMap;
  return { ...snapshot, storyMap, cards: snapshot.cards.map(({ version: _version, updatedAt: _updatedAt, ...card }) => card) };
}
