import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildReleaseSummaryReport } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const HUMAN = { actorType: "human", actorId: "release-acceptance" } as const;

it("reopens complete Releases and canonical Story summaries without changing assignments", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-release-summary-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  try {
    const rows = unitOfWork.run(HUMAN, ({ repository: tx }) => {
      const project = tx.createProject({ name: "Release persistence" });
      const map = tx.createStoryMap({ projectId: project.id, name: "Map" });
      const released = tx.createRelease({ storyMapId: map.id, name: "Complete", goal: "Ship", startDate: "2026-10-01", releaseDate: "2026-10-17", released: true });
      const open = tx.createRelease({ storyMapId: map.id, name: "Open" });
      const zero = tx.createCard({ storyMapId: map.id, level: "story", title: "Zero", releaseId: open.id, estimate: 0, status: "constructor" });
      const missing = tx.createCard({ storyMapId: map.id, level: "story", title: "Missing", releaseId: released.id, status: "__proto__" });
      tx.createCard({ storyMapId: map.id, level: "story", title: "Unscheduled", status: "toString" });
      tx.createCard({ storyMapId: map.id, level: "note", title: "Note", releaseId: open.id, estimate: 100 });
      for (const status of ["archived", "todo"]) {
        const parent = tx.createCard({ storyMapId: map.id, level: "activity", title: status, status });
        if (status === "todo") tx.parkCard(parent.id, { childStrategy: "unassign" });
        else tx.archiveCard(parent.id);
        const step = tx.createCard({ storyMapId: map.id, level: "step", parentId: parent.id, title: `Step ${status}` });
        tx.createCard({ storyMapId: map.id, level: "story", parentId: step.id, title: `Hidden ${status}`, releaseId: open.id, estimate: 100 });
      }
      return { map, released, open, zero, missing };
    });
    const edited = unitOfWork.run(HUMAN, ({ repository: tx }) => tx.updateRelease(rows.released.id, { name: "Shipped", goal: "Done", startDate: null, releaseDate: "2026-10-18" }))!;
    const before = repository.listCards(rows.map.id);
    const data = repository.getStoryMapReportData(rows.map.id)!;
    const expected = buildReleaseSummaryReport(data);
    expect(expected).toMatchObject({ totalStories: 3, estimateTotal: 0, unestimatedCards: 2 });
    expect(expected.unestimatedStories).toContainEqual({ cardId: rows.missing.id, cardKey: rows.missing.key, cardTitle: rows.missing.title });
    expect(Object.entries(expected.statusCounts)).toEqual([["constructor", 1], ["__proto__", 1], ["toString", 1]]);
    expect(buildReleaseSummaryReport({ ...data, includeReleased: false })).toMatchObject({ totalStories: 2, unestimatedCards: 1 });
    expect(buildReleaseSummaryReport({ ...data, releaseId: rows.released.id, includeReleased: false })).toMatchObject({ totalStories: 1, unestimatedCards: 1 });
    handle.current.$client.close();
    handle.current = openStoryMapperDb(path);
    expect(repository.getRelease(rows.released.id)).toEqual(edited);
    expect(edited).toMatchObject({ name: "Shipped", goal: "Done", released: true, startDate: null, releaseDate: "2026-10-18", version: 2 });
    expect(buildReleaseSummaryReport(repository.getStoryMapReportData(rows.map.id)!)).toEqual(expected);
    expect(repository.listCards(rows.map.id)).toEqual(before);
  } finally {
    handle.current.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
