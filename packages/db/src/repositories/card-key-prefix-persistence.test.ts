import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";

const ACTOR = { actorType: "human", actorId: "prefix-persistence" } as const;

it("preserves linked keys and the monotonic allocator across prefix changes, highest-key deletion and reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-prefix-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const uow = new UnitOfWork(handle);
  const read = new StoryMapperRepository(handle);
  try {
    const { map, retained, highest } = uow.run(ACTOR, ({ repository }) => {
      const project = repository.createProject({ name: "Prefix persistence" });
      const map = repository.createStoryMap({ projectId: project.id, name: "Keys" });
      const retained = repository.createCard({ storyMapId: map.id, level: "story", title: "Linked Story" });
      repository.createCardSourceLink(retained.id, { kind: "note", note: "Supplied source evidence" });
      repository.createGitHubLink({ cardId: retained.id, repo: "fixture/repo", issueNumber: 1, url: "https://github.com/fixture/repo/issues/1" });
      repository.setExternalRef({ entityType: "card", entityId: retained.id, system: "planner", externalId: "story-1" });
      const highest = repository.createCard({ storyMapId: map.id, level: "story", title: "Highest key" });
      return { map, retained, highest };
    });
    const before = read.getStoryMapSnapshot(map.id)!;
    uow.run(ACTOR, ({ repository }) => {
      repository.deleteCard(highest.id, { strategy: "unassign" });
      repository.updateStoryMap(map.id, { cardKeyPrefix: "NEXT" });
    });
    handle.current.$client.close();
    handle.current = openStoryMapperDb(path);
    const next = uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: map.id, level: "story", title: "Next key" }));
    expect(retained.key).toBe("LSM-1");
    expect(highest.key).toBe("LSM-2");
    expect(next.key).toBe("NEXT-3");
    const after = read.getStoryMapSnapshot(map.id)!;
    expect(after.cards.find((card) => card.id === retained.id)).toEqual(before.cards.find((card) => card.id === retained.id));
    expect(after.sourceLinks).toEqual(before.sourceLinks);
    expect(after.githubLinks).toEqual(before.githubLinks);
    expect(after.externalRefs).toEqual(before.externalRefs);
    uow.run(ACTOR, ({ repository }) => {
      repository.deleteCard(next.id, { strategy: "unassign" });
      repository.updateStoryMap(map.id, { cardKeyPrefix: "FINAL" });
    });
    handle.current.$client.close();
    handle.current = openStoryMapperDb(path);
    expect(uow.run(ACTOR, ({ repository }) => repository.createCard({ storyMapId: map.id, level: "note", title: "After reopen" })).key).toBe("FINAL-4");
  } finally {
    if (handle.current.$client.open) handle.current.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
