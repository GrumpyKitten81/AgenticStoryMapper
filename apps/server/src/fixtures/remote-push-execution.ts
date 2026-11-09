import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, vi, type Mocked } from "vitest";
import type { RemoteIssuePayload, RemoteMilestone, RemoteMilestonePayload, RemotePushEvidence } from "@storymapper/contracts";
import { DatabaseHandle, StoryMapperRepository, UnitOfWork, openStoryMapperDb } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem, type WorkItemProvider } from "@storymapper/github";
import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";
import { executeRemotePush } from "@storymapper/server/services/remote-push-execution";

export const actor = { actorType: "human", actorId: "reviewing-human" } as const;
export const remotePushCleanup: Array<() => void> = [];
afterEach(() => { vi.clearAllMocks(); for (const cleanup of remotePushCleanup.splice(0).reverse()) cleanup(); });

export function remotePushFixture(count = 2) {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-reviewed-push-"));
  const path = join(directory, "storymapper.sqlite");
  const handle = new DatabaseHandle(openStoryMapperDb(path));
  const unitOfWork = new UnitOfWork(handle);
  const repository = new StoryMapperRepository(handle);
  remotePushCleanup.push(() => { if (handle.current.$client.open) handle.current.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const entities = unitOfWork.run(actor, ({ repository }) => {
    const project = repository.createProject({ name: "Reviewed remote effects" });
    repository.updateSafetySettings(project.id, { github: true });
    const map = repository.createStoryMap({ projectId: project.id, name: "Remote review" });
    const cards = Array.from({ length: count }, (_, index) => repository.createCard({ storyMapId: map.id, level: "activity", cardType: "task", title: `Issue ${index + 1}`, description: `Authored body ${index + 1}` }));
    const connection = repository.createConnectorConnection({ projectId: project.id, provider: "github", owner: "reviewed", repository: "fixture", name: "Reviewed", authMode: "token", readOnly: false, issueTypeMapping: [{ cardType: "task", issueType: "Task" }] });
    return { project, map, cards, connection };
  });
  const issues: RemoteWorkItem[] = [];
  const milestones: RemoteMilestone[] = [];
  const inputs: RemotePushEvidence = { issueTypes: ["Task"], labels: ["local-story-map", "story-map:LSM", "level:activity", "status:todo"], writable: true, milestones: [] };
  const provider = providerFixture(issues, milestones, inputs);
  vi.mocked(createWorkItemProvider).mockReturnValue(provider);
  const prepare = (cardIds = entities.cards.map(({ id }) => id), releaseId?: string) => prepareRemotePush(repository, unitOfWork, actor, { storyMapId: entities.map.id, connectionId: entities.connection.id, cardIds, ...(releaseId ? { releaseId } : {}), mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const execute = (id: string, resume = false) => executeRemotePush(repository, unitOfWork, actor, id, resume, () => "http://127.0.0.1:4317");
  return { ...entities, directory, path, handle, unitOfWork, repository, issues, milestones, inputs, provider, prepare, execute };
}

function providerFixture(issues: RemoteWorkItem[], milestones: RemoteMilestone[], inputs: RemotePushEvidence): Mocked<WorkItemProvider> {
  return {
    validateConnection: vi.fn(), listRemoteItems: vi.fn(async () => structuredClone(issues)), createOrUpdateRemoteItem: vi.fn(),
    readPushInputs: vi.fn(async () => structuredClone({ ...inputs, milestones })),
    getRemoteItem: vi.fn(async (_connection, _auth, id: string) => {
      const item = issues.find((row) => row.remoteId === id);
      return item ? { status: "found" as const, item: structuredClone(item) } : { status: "unavailable" as const };
    }),
    findRemoteItemsByMarker: vi.fn(async (_connection, _auth, kind: "issue" | "milestone", marker: string): ReturnType<WorkItemProvider["findRemoteItemsByMarker"]> => ({ complete: true as const, matches: structuredClone(kind === "issue" ? issues.filter((row) => row.body.includes(marker)) : milestones.filter((row) => row.description.includes(marker))) })),
    writeRemoteIssue: vi.fn(async (_connection, _auth, payload: RemoteIssuePayload) => {
      const number = payload.remoteId ? Number(payload.remoteId) : issues.length + 1;
      const item: RemoteWorkItem = { remoteId: String(number), remoteNumber: number, url: `https://github.com/reviewed/fixture/issues/${number}`, title: payload.title, body: payload.body, labels: [...payload.labels], issueType: payload.issueType, state: payload.remoteState, ...(payload.milestoneNumber ? { milestoneNumber: payload.milestoneNumber, milestone: milestones.find((row) => row.remoteNumber === payload.milestoneNumber)?.title, milestoneDueOn: milestones.find((row) => row.remoteNumber === payload.milestoneNumber)?.dueOn ?? undefined, milestoneDescription: milestones.find((row) => row.remoteNumber === payload.milestoneNumber)?.description, milestoneState: milestones.find((row) => row.remoteNumber === payload.milestoneNumber)?.state } : {}) };
      const index = issues.findIndex((row) => row.remoteId === item.remoteId);
      if (index < 0) issues.push(item); else issues[index] = item;
      return structuredClone(item);
    }),
    writeMilestone: vi.fn(async (_connection, _auth, payload: RemoteMilestonePayload) => {
      const number = payload.remoteId ? Number(payload.remoteId) : milestones.length + 1;
      const item: RemoteMilestone = { ...payload, remoteId: String(number), remoteNumber: number, url: `https://github.com/reviewed/fixture/milestone/${number}` };
      const index = milestones.findIndex((row) => row.remoteId === item.remoteId);
      if (index < 0) milestones.push(item); else milestones[index] = item;
      for (const issue of issues) if (issue.milestoneNumber === item.remoteNumber) Object.assign(issue, { milestone: item.title, milestoneDueOn: item.dueOn ?? undefined, milestoneDescription: item.description, milestoneState: item.state });
      return structuredClone(item);
    })
  } satisfies WorkItemProvider;
}
