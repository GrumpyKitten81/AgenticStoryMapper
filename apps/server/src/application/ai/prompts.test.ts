import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseHandle, openStoryMapperDb, StoryMapperRepository, UnitOfWork } from "@storymapper/db";
import { createAiTemplate } from "@storymapper/server/application/ai/ai.use-cases";
import { createAiPromptHandlers } from "@storymapper/server/application/ai/prompts";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

it("persists prompt list and get read audit records", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-prompt-audit-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  cleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const repository = new StoryMapperRepository(handle);
  const unitOfWork = new UnitOfWork(handle);
  const human = { actorType: "human", actorId: "prompt-author" } as const;
  const actor = { actorType: "agent", actorId: "prompt-agent", mcpSessionId: "prompt-session" } as const;
  const project = unitOfWork.run(human, ({ repository }) => repository.createProject({ name: "Prompt audit" }));
  createAiTemplate({ repository, unitOfWork }, human, { projectId: project.id, id: "prompt", name: "Prompt", instructions: "Create a proposal.", arguments: [], examples: [] });
  const prompts = createAiPromptHandlers({ repository, unitOfWork }, actor);
  const listed = await prompts.listPrompts();
  expect(listed.prompts).toEqual(expect.arrayContaining([expect.objectContaining({ name: `${project.id}:prompt` })]));
  await prompts.getPrompt(`${project.id}:prompt`, {});
  const events = repository.listActivity(project.id).filter((event) => event.action === "tool_call");
  expect(events.map((event) => event.affectedEntityId)).toEqual(["prompts/list", "prompts/get"]);
  expect(events.every((event) => event.actor === actor.actorId && event.mcpSessionId === actor.mcpSessionId && typeof (event.after as { outputHash?: unknown }).outputHash === "string")).toBe(true);
  handle.current.$client.close();
  handle.current = openStoryMapperDb(path);
  expect(new StoryMapperRepository(handle).listActivity(project.id).filter((event) => event.action === "tool_call").map((event) => event.affectedEntityId)).toEqual(["prompts/list", "prompts/get"]);
});
