import { changeSetSchema, DomainError } from "@storymapper/contracts";
import { proposeHappyPathSlice } from "@storymapper/core";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { describe, expect, it } from "vitest";
import { createAiProposal, createAiTemplate, updateAiTemplate, deleteAiTemplate } from "@storymapper/server/application/ai/ai.use-cases";

describe("proposal visibility", () => {
  it("excludes stories beneath parked or archived ancestors in AI and release slice proposals", () => {
    const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
    const repository = new StoryMapperRepository(handle);
    const unitOfWork = new UnitOfWork(handle);
    const actor = { actorType: "human", actorId: "proposal-fixture" } as const;
    try {
      const data = unitOfWork.run(actor, ({ repository }) => {
        const project = repository.createProject({ name: "Proposal visibility" });
        const map = repository.createStoryMap({ projectId: project.id, name: "Map" });
        const roots = ["Visible", "Parked", "Archived"].map((title) => repository.createCard({ storyMapId: map.id, level: "activity", title }));
        const stories = roots.map((root) => {
          const step = repository.createCard({ storyMapId: map.id, level: "step", parentId: root.id, title: `${root.title} step` });
          return repository.createCard({ storyMapId: map.id, level: "story", parentId: step.id, title: `${root.title} story` });
        });
        handle.current.$client.prepare("UPDATE cards SET parked = 1 WHERE id = ?").run(roots[1]!.id);
        repository.archiveCard(roots[2]!.id);
        return { project, map, stories };
      });
      const proposal = createAiProposal({ repository, unitOfWork }, actor, { projectId: data.project.id, storyMapId: data.map.id, templateId: "release-slice", releaseTarget: { kind: "new" } });
      expect(changeSetSchema.parse(proposal.changeSet)).toEqual(proposal.changeSet);
      for (const templateId of ["personas", "goals-steps-stories", "prd-to-map", "story-writing", "acceptance-criteria", "test-cases", "invest", "spidr-split", "effort-estimate", "gap-analysis"] as const) {
        const generated = createAiProposal({ repository, unitOfWork }, actor, { projectId: data.project.id, storyMapId: data.map.id, templateId });
        expect(changeSetSchema.parse(generated.changeSet)).toEqual(generated.changeSet);
      }
      expect(proposal.changeSet.operations.filter((operation) => operation.entity === "card").map((operation) => operation.entityId)).toEqual([data.stories[0]!.id]);
      expect(proposeHappyPathSlice(repository.listCards(data.map.id)).cardIds).toEqual([data.stories[0]!.id]);
      expect(() => createAiProposal({ repository, unitOfWork }, actor, { projectId: data.project.id, storyMapId: data.map.id, templateId: "story-writing", cardIds: [data.stories[1]!.id, data.stories[2]!.id] })).toThrow(DomainError);
      expect(repository.getCardDetails(data.stories[0]!.id)?.releaseId).toBeNull();
    } finally {
      handle.current.$client.close();
    }
  });
});

it("refuses direct Agent template authoring before writes", () => {
  const handle = new DatabaseHandle(openStoryMapperDb(":memory:"));
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  try {
    const human = { actorType: "human", actorId: "template-human" } as const;
    const agent = { actorType: "agent", actorId: "template-agent", mcpSessionId: "session" } as const;
    const deps = { repository, unitOfWork };
    const project = unitOfWork.run(human, ({ repository }) => repository.createProject({ name: "Human authoring" }));
    const input = { projectId: project.id, id: "authored", name: "Authored", instructions: "Propose a ChangeSet.", arguments: [], examples: [] };
    expect(() => createAiTemplate(deps, agent, input)).toThrow("human-only");
    const created = createAiTemplate(deps, human, input).template;
    expect(() => updateAiTemplate(deps, agent, project.id, created.id, { name: "Agent edit" })).toThrow("human-only");
    expect(() => deleteAiTemplate(deps, agent, project.id, created.id)).toThrow("human-only");
    expect(repository.getAiTemplate(project.id, created.id)).toEqual(created);
    expect(repository.listActivity(project.id).filter((row) => row.action.startsWith("aiTemplate.")).map((row) => row.actorType)).toEqual(["human"]);
  } finally { handle.current.$client.close(); }
});
