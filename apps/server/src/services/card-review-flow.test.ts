import { expect, it, vi } from "vitest";
import { CARD_REVIEW_CRITERIA, cardReviewReportSubmissionSchema, type CardReviewRequest } from "@storymapper/contracts";
import { actor, remotePushFixture } from "@storymapper/server/fixtures/remote-push-execution";
import { prepareRemotePush } from "@storymapper/server/services/remote-push-plan";
import { commandCardReview } from "@storymapper/server/application/card/card-review.use-cases";
import { approveChangeSet, applyChangeSet } from "@storymapper/server/application/changeset/changeset.use-cases";

vi.mock("@storymapper/github", async (original) => ({ ...await original<typeof import("@storymapper/github")>(), createWorkItemProvider: vi.fn() }));
vi.mock("@storymapper/server/services/credentials", () => ({ resolveProviderAuth: vi.fn(async (connection) => ({ connection, auth: {} })) }));
const agent = { actorType: "agent", actorId: "dor-agent", mcpSessionId: "dor-session" } as const;
function output(request: CardReviewRequest, blocker = false) {
  return cardReviewReportSubmissionSchema.parse({ requestId: request.id, inputFingerprint: request.inputFingerprint, criteriaVersion: "1", skillVersion: "1", status: "success", results: CARD_REVIEW_CRITERIA.map((rule) => ({ ruleId: rule.id, outcome: !(rule.types as readonly string[]).includes(request.input.card.cardType!) ? "not_applicable" : blocker && rule.id === "DOR-04" ? "finding" : "pass", severity: rule.severity, evidence: blocker && rule.id === "DOR-04" ? ["No observable completion criterion."] : [], advice: blocker && rule.id === "DOR-04" ? "State completion criteria." : "" })) });
}
it("persists the first agent Dry Run before review, blocks human confirmation and permits reviewed exact writes", async () => {
  const f = remotePushFixture(2);
  const reviewed = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const data = f.repository.getCardReviews(f.project.id);
  expect(data.requests).toHaveLength(2);
  expect(data.requests[0]?.input.outgoing?.[0]?.body).toContain("Authored body");
  expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
  await expect(f.execute(reviewed.plan.id)).rejects.toThrow("DoR review");
  for (const request of data.requests) f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request)));
  const result = await f.execute(reviewed.plan.id);
  expect(result.execution.status).toBe("completed");
  expect(f.provider.writeRemoteIssue).toHaveBeenCalledTimes(2);
});
it("keeps human-origin pushes review-free and records an explicit enabled exact-plan override", async () => {
  const f = remotePushFixture(1);
  expect((await f.execute((await f.prepare()).plan.id)).execution.status).toBe("completed");
  f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { description: "Changed body" }));
  const plan = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  await expect(f.execute(plan.plan.id)).rejects.toThrow("DoR review");
  f.unitOfWork.run(actor, ({ repository }) => repository.appendReviewRecord(f.project.id, null, { kind: "settings", value: { reviewBeforeAgentPush: true, reviewAfterAgentCreate: false, reviewAfterAgentContentChange: false, allowHumanPushOverride: true } }));
  const { executeRemotePush } = await import("@storymapper/server/services/remote-push-execution");
  expect((await executeRemotePush(f.repository, f.unitOfWork, actor, plan.plan.id, false, () => "http://127.0.0.1:4317", { confirmed: true, reason: "Human accepts this exact outgoing content." })).execution.status).toBe("completed");
});
it("requires separate human correction approval and fresh verification after applying selected findings", () => {
  const f = remotePushFixture(1), deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  let data = commandCardReview(deps, actor, f.project.id, { action: "request", cardIds: [f.cards[0]!.id] });
  const request = data.requests[0]!;
  data = commandCardReview(deps, agent, f.project.id, { action: "submit", report: output(request, true) });
  const report = data.reports[0]!, findingId = report.results.find((result) => result.outcome === "finding")!.id;
  data = commandCardReview(deps, actor, f.project.id, { action: "fix", reportId: report.id, findingIds: [findingId] });
  data = commandCardReview(deps, agent, f.project.id, { action: "proposeFix", fixId: data.fixes[0]!.id, patch: { description: "Completed when the observable outcome is available." } });
  const changeSetId = data.fixes[0]!.changeSetId!;
  expect(f.repository.getCardDetails(f.cards[0]!.id)?.description).toBe(f.cards[0]!.description);
  expect(() => approveChangeSet(deps, agent, changeSetId)).toThrow("human-only");
  approveChangeSet(deps, actor, changeSetId);
  applyChangeSet(deps, actor, changeSetId);
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("awaiting_verification");
  data = commandCardReview(deps, actor, f.project.id, { action: "request", cardIds: [f.cards[0]!.id] });
  const next = data.requests[data.requests.length - 1]!;
  commandCardReview(deps, agent, f.project.id, { action: "submit", report: output(next) });
  expect(f.repository.getCardReviews(f.project.id).summaries[0]).toMatchObject({ state: "reviewed", unresolvedCount: 0 });
  f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { description: "A later independent edit" }));
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("stale");
});
it("queues opted-in context reviews only after human Apply of an agent proposal", () => {
  const f = remotePushFixture(1), deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  commandCardReview(deps, actor, f.project.id, { action: "settings", settings: { reviewBeforeAgentPush: true, reviewAfterAgentCreate: true, reviewAfterAgentContentChange: true, allowHumanPushOverride: false } });
  f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { description: "Human edited content" }));
  expect(f.repository.getCardReviews(f.project.id).requests).toHaveLength(0);
  const proposal = f.unitOfWork.run(agent, ({ repository }) => repository.createChangeSet({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", projectId: f.project.id, source: "ai", title: "Update context", createdAt: new Date().toISOString(), operations: [{ operationId: "update-context", entity: "productContext", entityId: f.map.id, baseVersion: f.map.version, op: "set", after: { projectId: f.project.id, storyMapId: f.map.id, purpose: "New purpose" } }] }));
  expect(f.repository.getCardReviews(f.project.id).requests).toHaveLength(0);
  approveChangeSet(deps, actor, proposal.id);
  applyChangeSet(deps, actor, proposal.id);
  expect(f.repository.getCardReviews(f.project.id).requests).toMatchObject([{ cardId: f.cards[0]!.id, purpose: "save" }]);
});
it("exposes the same review protocol through MCP and rejects agent settings changes", async () => {
  const f = remotePushFixture(1);
  const { createMcpRegistry } = await import("@storymapper/server/mcp/tools/register-tools");
  const registry = createMcpRegistry(f.repository, f.unitOfWork, { hostName: "dor-mcp" });
  const request = await registry.call("CardReview", { projectId: f.project.id, command: { action: "request", cardIds: [f.cards[0]!.id] } });
  expect(request.data).toBeDefined();
  const data = await registry.call("GetCardReviews", { projectId: f.project.id, storyMapId: f.map.id });
  expect(data.data).toBeDefined();
  expect((data.data as { requests: unknown[] }).requests).toHaveLength(1);
  await expect(registry.call("CardReview", { projectId: f.project.id, command: { action: "settings", settings: { reviewBeforeAgentPush: false } } })).rejects.toThrow("human-only");
  expect(f.repository.getCardReviewSettings(f.project.id).reviewBeforeAgentPush).toBe(true);
});
it("rejects a context race after review before sending any remote write", async () => {
  const f = remotePushFixture(1);
  const plan = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const request = f.repository.getCardReviews(f.project.id).requests[0]!;
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request)));
  const read = f.provider.readPushInputs.getMockImplementation()!;
  f.provider.readPushInputs.mockImplementationOnce(async (connection, auth) => {
    f.unitOfWork.run(actor, ({ repository }) => repository.upsertProductContext({ projectId: f.project.id, storyMapId: f.map.id, purpose: "Changed during remote read" }));
    return read(connection, auth);
  });
  await expect(f.execute(plan.plan.id)).rejects.toThrow(/DoR review|Dry Run inputs changed/);
  expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
});
it("exposes a native Issue type update after changing the independent Card type", async () => {
  const f = remotePushFixture(1);
  await f.execute((await f.prepare()).plan.id);
  f.inputs.issueTypes.push("Bug");
  f.unitOfWork.run(actor, ({ repository }) => {
    repository.updateConnectorConnection(f.connection.id, { issueTypeMapping: [{ cardType: "task", issueType: "Task" }, { cardType: "bug", issueType: "Bug" }] });
    repository.updateCard(f.cards[0]!.id, { cardType: "bug" });
  });
  const reviewed = await f.prepare();
  expect(reviewed.plan.items).toMatchObject([{ action: "update", kind: "issue", payload: { issueType: "Bug" } }]);
  expect(f.issues[0]!.issueType).toBe("Task");
});
it("retains the agent origin of a deferred GitHub ChangeSet through human Apply", async () => {
  const f = remotePushFixture(1), deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  commandCardReview(deps, actor, f.project.id, { action: "settings", settings: { reviewBeforeAgentPush: true, reviewAfterAgentCreate: false, reviewAfterAgentContentChange: true, allowHumanPushOverride: false } });
  const { executeChangeSetCommand } = await import("@storymapper/server/application/changeset/changeset-command");
  const proposal = executeChangeSetCommand(deps, { ...agent, actorType: "github" }, { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", projectId: f.project.id, source: "github", title: "Agent incoming content", createdAt: new Date().toISOString(), operations: [{ operationId: "content", entity: "card", op: "update", entityId: f.cards[0]!.id, baseVersion: f.cards[0]!.version, after: { description: "Updated incoming content" } }] }, { initiatingActor: agent, apply: false });
  expect(proposal.changeSet.proposedBy?.actorType).toBe("agent");
  expect(f.repository.getCardReviews(f.project.id).requests).toHaveLength(0);
  approveChangeSet(deps, actor, proposal.changeSetId);
  applyChangeSet(deps, actor, proposal.changeSetId);
  expect(f.repository.getCardReviews(f.project.id).requests).toMatchObject([{ cardId: f.cards[0]!.id, purpose: "save" }]);
});
it.each(["todo", "done"] as const)("keeps reviewed child and prerequisite inputs current while their same-plan %s parent Issue is bound", async (status) => {
  const f = remotePushFixture(1);
  f.inputs.labels.push("level:step", "level:story", "status:done");
  f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { status }));
  const child = f.unitOfWork.run(actor, ({ repository }) => {
    const step = repository.createCard({ storyMapId: f.map.id, level: "step", parentId: f.cards[0]!.id, cardType: "task", title: "Intermediate outcome" });
    const story = repository.createCard({ storyMapId: f.map.id, level: "story", parentId: step.id, cardType: "task", title: "Child outcome" });
    repository.mutateCardDependency(story.id, f.cards[0]!.id, true);
    return story;
  });
  const { plan } = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const requests = f.repository.getCardReviews(f.project.id).requests;
  expect(requests.find((request) => request.cardId === child.id)?.input.parents).toHaveLength(2);
  expect(requests.find((request) => request.cardId === child.id)?.input.prerequisites).toHaveLength(1);
  for (const request of requests) f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request)));
  const result = await f.execute(plan.id);
  expect(result.execution.status).toBe("completed");
  expect(f.provider.writeRemoteIssue).toHaveBeenCalledTimes(status === "done" ? 4 : 3);
});
it.each(["cardType", "mapping"] as const)("includes a %s-only native Issue type delta in outgoing Sync", async (delta) => {
  const f = remotePushFixture(1);
  await f.execute((await f.prepare()).plan.id);
  f.inputs.issueTypes.push("Bug");
  f.unitOfWork.run(actor, ({ repository }) => {
    repository.updateConnectorConnection(f.connection.id, { issueTypeMapping: delta === "mapping" ? [{ cardType: "task", issueType: "Bug" }] : [{ cardType: "task", issueType: "Task" }, { cardType: "bug", issueType: "Bug" }] });
    if (delta === "cardType") repository.updateCard(f.cards[0]!.id, { cardType: "bug" });
  });
  const result = await prepareRemotePush(f.repository, f.unitOfWork, actor, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "sync", localOrigin: "http://127.0.0.1:4317" });
  expect(result.plan.items).toMatchObject([{ kind: "issue", action: "update", payload: { issueType: "Bug" } }]);
});
it("denies an effective blocker before writes, permits a Card-rule waiver and restores denial on revocation", async () => {
  const f = remotePushFixture(1);
  const { plan } = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const request = f.repository.getCardReviews(f.project.id).requests[0]!;
  const report = f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request, true)));
  await expect(f.execute(plan.id)).rejects.toThrow("DoR review");
  expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
  const decision = f.unitOfWork.run(actor, ({ repository }) => repository.decideCardReview(f.project.id, { action: "ignore", reportId: report.id, findingId: report.results.find((row) => row.outcome === "finding")!.id, scope: "rule", reason: "Accepted for this Card." }));
  expect(f.repository.getCardPushReadiness(plan).ready).toBe(true);
  f.unitOfWork.run(actor, ({ repository }) => repository.decideCardReview(f.project.id, { action: "revoke", decisionId: decision.id, reason: "Reconsidered." }));
  await expect(f.execute(plan.id)).rejects.toThrow("DoR review");
  expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
  f.unitOfWork.run(actor, ({ repository }) => repository.decideCardReview(f.project.id, { action: "ignore", reportId: report.id, findingId: report.results.find((row) => row.outcome === "finding")!.id, scope: "rule", reason: "Accepted after reconsideration." }));
  expect((await f.execute(plan.id)).execution.status).toBe("completed");
});
it("permits warning-only reviewed Issues without waivers", async () => {
  const f = remotePushFixture(1);
  const { plan } = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const request = f.repository.getCardReviews(f.project.id).requests[0]!, report = output(request);
  Object.assign(report.results.find((row) => row.ruleId === "DOR-03")!, { outcome: "finding", evidence: ["Scope could be clearer."], advice: "Clarify the boundary." });
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, report));
  expect((await f.execute(plan.id)).execution.status).toBe("completed");
});
it("retains agent DoR enforcement on human resume after a blocker waiver is revoked", async () => {
  const f = remotePushFixture(2);
  const { plan } = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const decisions = f.repository.getCardReviews(f.project.id).requests.map((request) => {
    const report = f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request, true)));
    return f.unitOfWork.run(actor, ({ repository }) => repository.decideCardReview(f.project.id, { action: "ignore", reportId: report.id, findingId: report.results.find((row) => row.outcome === "finding")!.id, scope: "rule", reason: "Accepted for this Card." }));
  });
  const write = f.provider.writeRemoteIssue.getMockImplementation()!;
  f.provider.writeRemoteIssue.mockImplementationOnce(write).mockRejectedValueOnce(new Error("Interrupted provider"));
  expect((await f.execute(plan.id)).execution.status).toBe("interrupted");
  expect(f.provider.writeRemoteIssue).toHaveBeenCalledTimes(2);
  expect(f.repository.getCardPushReadiness(plan).ready).toBe(true);
  f.unitOfWork.run(actor, ({ repository }) => repository.decideCardReview(f.project.id, { action: "revoke", decisionId: decisions.find((decision) => decision.cardId === f.cards[1]!.id)!.id, reason: "Waiver revoked before resume." }));
  await expect(f.execute(plan.id, true)).rejects.toMatchObject({ code: "protected", message: expect.stringContaining("DoR review") });
  expect(f.provider.writeRemoteIssue).toHaveBeenCalledTimes(2);
});

it("keeps unrelated MCP reviews usable after a captured source owner's access is revoked", async () => {
  const f = remotePushFixture(2);
  const { createMcpRegistry } = await import("@storymapper/server/mcp/tools/register-tools");
  const registry = createMcpRegistry(f.repository, f.unitOfWork, { hostName: "source-revocation" });
  const source = f.unitOfWork.run(actor, ({ repository }) => {
    const document = repository.importSourceDocument({ projectId: f.project.id, title: "Private captured evidence", type: "txt", content: "Source-owner secret evidence", parsedChunks: [{ locator: "L1", text: "Source-owner secret evidence" }], fileHash: "a".repeat(64) });
    repository.createCardSourceLink(f.cards[0]!.id, { kind: "chunk", chunkId: document.chunks[0]!.id });
    const owner = repository.createProject({ name: "Source owner" });
    return { ...document, owner };
  });
  const captured = await registry.call("CardReview", { projectId: f.project.id, command: { action: "request", cardIds: [f.cards[0]!.id] } });
  const old = (captured.data as { requests: CardReviewRequest[] }).requests[0]!;
  f.handle.current.$client.prepare("UPDATE source_documents SET project_id = ? WHERE id = ?").run(source.owner.id, source.document.id);
  f.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(source.owner.id, { agentMode: "off" }));
  const local = await registry.call("CardReview", { projectId: f.project.id, command: { action: "request", cardIds: [f.cards[1]!.id] } });
  const visible = local.data as { requests: CardReviewRequest[]; inaccessibleRequestIds: string[] };
  expect(visible.inaccessibleRequestIds).toContain(old.id);
  expect(visible.requests.map((request) => request.cardId)).toEqual([f.cards[1]!.id]);
  expect(JSON.stringify(visible)).not.toContain("Source-owner secret evidence");
  await expect(registry.call("CardReview", { projectId: f.project.id, command: { action: "start", requestId: old.id } })).rejects.toThrow("source evidence");
  await expect(registry.call("CardReview", { projectId: f.project.id, command: { action: "submit", report: output(old) } })).rejects.toThrow("source evidence");
  const current = visible.requests[0]!;
  await registry.call("CardReview", { projectId: f.project.id, command: { action: "start", requestId: current.id } });
  await registry.call("CardReview", { projectId: f.project.id, command: { action: "submit", report: output(current) } });
});
it("redacts GitHub-off review history while local MCP requests and reports remain usable", async () => {
  const f = remotePushFixture(2);
  f.unitOfWork.run(actor, ({ repository }) => repository.bindRemoteWorkItemLink({ cardId: f.cards[0]!.id, connectionId: f.connection.id, provider: "github", remoteId: "51", url: "https://github.com/reviewed/fixture/issues/51", labels: [], titleHash: "private-revision" }));
  const old = commandCardReview({ repository: f.repository, unitOfWork: f.unitOfWork }, actor, f.project.id, { action: "request", cardIds: [f.cards[0]!.id] }).requests[0]!;
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(old)));
  f.unitOfWork.run(actor, ({ repository }) => repository.updateSafetySettings(f.project.id, { github: false }));
  const { createMcpRegistry } = await import("@storymapper/server/mcp/tools/register-tools");
  const registry = createMcpRegistry(f.repository, f.unitOfWork, { hostName: "github-off-history" });
  const result = await registry.call("CardReview", { projectId: f.project.id, command: { action: "request", cardIds: [f.cards[1]!.id] } });
  const data = result.data as { requests: CardReviewRequest[]; inaccessibleRequestIds: string[]; reports: unknown[] };
  expect(data.inaccessibleRequestIds).toContain(old.id);
  expect(data.requests).toHaveLength(1); expect(data.reports).toHaveLength(0);
  expect(JSON.stringify(data)).not.toContain("private-revision");
  await expect(registry.call("CardReview", { projectId: f.project.id, command: { action: "start", requestId: old.id } })).rejects.toThrow("GitHub access is disabled");
  await registry.call("CardReview", { projectId: f.project.id, command: { action: "submit", report: output(data.requests[0]!) } });
  const listed = await registry.call("GetCardReviews", { projectId: f.project.id });
  expect(JSON.stringify(listed.data)).not.toContain("private-revision");
});
it.each(["content", "status", "workflowGroup", "issueState"] as const)("fingerprints prerequisite %s evidence and rejects stale correction proposals", (change) => {
  const f = remotePushFixture(2), deps = { repository: f.repository, unitOfWork: f.unitOfWork };
  const status = f.unitOfWork.run(actor, ({ repository }) => {
    const definition = repository.createWorkflowStatus({ projectId: f.project.id, name: "Validated", group: "active" });
    repository.updateCard(f.cards[1]!.id, { status: "Validated" });
    repository.mutateCardDependency(f.cards[0]!.id, f.cards[1]!.id, true);
    if (change === "issueState") repository.bindRemoteWorkItemLink({ cardId: f.cards[1]!.id, connectionId: f.connection.id, provider: "github", remoteId: "61", url: "https://github.com/reviewed/fixture/issues/61", labels: [], remoteState: "open", statusEvidence: { source: { kind: "repository" }, issueState: "open", membership: "present", optionId: null, name: null } });
    return definition;
  });
  const request = commandCardReview(deps, actor, f.project.id, { action: "request", cardIds: [f.cards[0]!.id] }).requests[0]!;
  expect(request.input.prerequisiteCompletion[0]).toMatchObject({ completed: false, status: "Validated" });
  const report = f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request, true)));
  const fix = commandCardReview(deps, actor, f.project.id, { action: "fix", reportId: report.id, findingIds: [report.results.find((result) => result.outcome === "finding")!.id] }).fixes[0]!;
  f.unitOfWork.run(actor, ({ repository }) => {
    if (change === "content") repository.updateCard(f.cards[1]!.id, { description: "Changed prerequisite scope" });
    if (change === "status") repository.updateCard(f.cards[1]!.id, { status: "done" });
    if (change === "workflowGroup") repository.updateWorkflowStatus(status.id, { group: "done" });
    if (change === "issueState") { const link = repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!; repository.upsertRemoteWorkItemLink({ ...link, statusEvidence: { ...link.statusEvidence!, issueState: "closed" } }); }
  });
  expect(f.repository.getCardReviews(f.project.id).summaries.find((row) => row.cardId === f.cards[0]!.id)?.state).toBe("stale");
  expect(() => commandCardReview(deps, agent, f.project.id, { action: "proposeFix", fixId: fix.id, patch: { description: "Completion criterion" } })).toThrow("stale");
  if (change !== "content") {
    const current = f.unitOfWork.run(actor, ({ repository }) => repository.requestCardReview(f.project.id, f.cards[0]!.id));
    expect(current.input.prerequisiteCompletion[0]?.completed).toBe(true);
    if (change !== "status") expect(current.input.prerequisites[0]?.status).toBe("Validated");
  }
});
it.each(["hashes", "remoteBefore"] as const)("retains locally observed GitHub source %s evidence and invalidates changed evidence", async (change) => {
  const f = remotePushFixture(1);
  await f.execute((await f.prepare()).plan.id);
  await f.prepare();
  const request = f.unitOfWork.run(actor, ({ repository }) => repository.requestCardReview(f.project.id, f.cards[0]!.id));
  expect(request.input.githubSources[0]).toMatchObject({ contentAvailability: "exact", titleHash: expect.any(String), bodyHash: expect.any(String), remoteBefore: { title: f.issues[0]!.title, body: f.issues[0]!.body } });
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request)));
  if (change === "hashes") f.unitOfWork.run(actor, ({ repository }) => { const link = repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!; repository.upsertRemoteWorkItemLink({ ...link, bodyHash: "new-observed-body-hash" }); });
  else { f.issues[0]!.body = "New remotely observed source body"; await f.prepare(); }
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("stale");
});
it("marks locator-only linked GitHub content explicitly unavailable", () => {
  const f = remotePushFixture(1);
  const request = f.unitOfWork.run(actor, ({ repository }) => { repository.createGitHubLink({ cardId: f.cards[0]!.id, repo: "reviewed/fixture", issueNumber: 71, url: "https://github.com/reviewed/fixture/issues/71" }); return repository.requestCardReview(f.project.id, f.cards[0]!.id); });
  expect(request.input.githubSources[0]).toMatchObject({ contentAvailability: "unavailable", titleHash: null, bodyHash: null, remoteBefore: null });
});
it.each(["pending", "error"] as const)("reuses a prior plan's exact successful report despite a newer identical %s request", async (state) => {
  const f = remotePushFixture(1), input = { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push" as const, localOrigin: "http://127.0.0.1:4317" };
  const first = await prepareRemotePush(f.repository, f.unitOfWork, agent, input);
  const old = f.repository.getCardReviews(f.project.id).requests[0]!;
  const second = await prepareRemotePush(f.repository, f.unitOfWork, agent, input);
  expect(f.repository.getCardReviews(f.project.id).requests).toHaveLength(2);
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(old)));
  if (state === "error") {
    const newer = f.repository.getCardReviews(f.project.id).requests.find((request) => request.id !== old.id)!;
    f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, { ...output(newer), status: "error", results: [], error: "Invoking review interrupted" }));
  }
  const { getCardReviews } = await import("@storymapper/server/application/card/card-review.use-cases");
  const data = getCardReviews({ repository: f.repository, unitOfWork: f.unitOfWork }, actor, f.project.id, f.map.id, { planId: second.plan.id, summaryOnly: true });
  expect(data.pushReadiness).toMatchObject({ planId: second.plan.id, ready: true, cards: [{ ready: true, summary: { requestId: old.id, state: "reviewed" } }] });
  expect(first.plan.id).not.toBe(second.plan.id);
  expect((await f.execute(second.plan.id)).execution.status).toBe("completed");
});
it("captures linked source revisions from another owned Map and tracks their stored changes", () => {
  const f = remotePushFixture(1);
  const link = f.unitOfWork.run(actor, ({ repository }) => {
    const other = repository.createStoryMap({ projectId: f.project.id, name: "Source Map" });
    const source = repository.createCard({ storyMapId: other.id, level: "activity", title: "Linked source" });
    const bound = repository.bindRemoteWorkItemLink({ cardId: source.id, connectionId: f.connection.id, provider: "github", remoteId: "81", url: "https://github.com/reviewed/fixture/issues/81", labels: [], titleHash: "linked-title", bodyHash: "linked-body" });
    repository.createCardSourceLink(f.cards[0]!.id, { kind: "github", externalRefId: bound.externalRefId });
    return bound;
  });
  const request = f.unitOfWork.run(actor, ({ repository }) => repository.requestCardReview(f.project.id, f.cards[0]!.id));
  expect(request.input.githubSources[0]).toMatchObject({ projectId: f.project.id, titleHash: "linked-title", bodyHash: "linked-body", contentAvailability: "hash_only", remoteBefore: null });
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request)));
  f.unitOfWork.run(actor, ({ repository }) => repository.upsertRemoteWorkItemLink({ ...link, titleHash: "changed-linked-title" }));
  expect(f.repository.getCardReviews(f.project.id, f.map.id).summaries[0]?.state).toBe("stale");
});
it("serves strict lightweight HTTP summaries and selected-Card history", async () => {
  const f = remotePushFixture(2);
  commandCardReview({ repository: f.repository, unitOfWork: f.unitOfWork }, actor, f.project.id, { action: "request", cardIds: f.cards.map((card) => card.id) });
  const { default: Fastify } = await import("fastify"), { createRoutes } = await import("@storymapper/server/http/routes");
  const server = Fastify();
  await server.register(createRoutes, { localOrigin: () => "http://127.0.0.1:4317", repository: f.repository, unitOfWork: f.unitOfWork, databasePath: f.path });
  try {
    const url = `/api/projects/${f.project.id}/card-reviews?storyMapId=${f.map.id}`;
    const summary = await server.inject({ method: "GET", url: `${url}&summaryOnly=true` });
    expect(summary.statusCode).toBe(200); expect(summary.json().summaries).toHaveLength(2); expect(summary.json().requests).toEqual([]);
    const detail = await server.inject({ method: "GET", url: `${url}&cardId=${f.cards[0]!.id}` });
    expect(detail.statusCode).toBe(200); expect(detail.json().requests).toHaveLength(1);
    for (const suffix of ["&summaryOnly=invalid", "&cardId=invalid", "&unknown=true"]) expect((await server.inject({ method: "GET", url: url + suffix })).statusCode).toBe(400);
  } finally { await server.close(); }
});
it("stales an immutable outgoing review when a newer locally observed GitHub source revision is stored", async () => {
  const f = remotePushFixture(1);
  await f.execute((await f.prepare()).plan.id);
  const { plan } = await prepareRemotePush(f.repository, f.unitOfWork, agent, { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push", localOrigin: "http://127.0.0.1:4317" });
  const request = f.repository.getCardReviews(f.project.id).requests[0]!;
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request)));
  expect(f.repository.getCardPushReadiness(plan).ready).toBe(true);
  f.issues[0]!.body = "Newer locally observed source body";
  await f.prepare();
  expect(f.repository.getCardReviews(f.project.id).summaries[0]?.state).toBe("stale");
  expect(f.repository.getCardPushReadiness(plan).ready).toBe(false);
});

it("uses the newest successful matching report even when an older successful report was clean", async () => {
  const f = remotePushFixture(1), input = { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push" as const, localOrigin: "http://127.0.0.1:4317" };
  await prepareRemotePush(f.repository, f.unitOfWork, agent, input);
  const old = f.repository.getCardReviews(f.project.id).requests[0]!;
  const { plan } = await prepareRemotePush(f.repository, f.unitOfWork, agent, input);
  const newer = f.repository.getCardReviews(f.project.id).requests.find((row) => row.id !== old.id)!;
  f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(old)));
  const blocker = f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(newer, true)));
  expect(f.repository.getCardPushReadiness(plan)).toMatchObject({ ready: false, cards: [{ summary: { reportId: blocker.id, highestSeverity: "blocker" } }] });
  await expect(f.execute(plan.id)).rejects.toThrow("DoR review");
  expect(f.provider.writeRemoteIssue).not.toHaveBeenCalled();
});
it("captures revision-consistent durable source content immediately after an A-to-B update", async () => {
  const f = remotePushFixture(1);
  await f.execute((await f.prepare()).plan.id);
  const original = f.issues[0]!.body;
  f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { title: "Revision B", description: "Body of revision B" }));
  await f.execute((await f.prepare()).plan.id);
  const request = f.unitOfWork.run(actor, ({ repository }) => repository.requestCardReview(f.project.id, f.cards[0]!.id));
  expect(request.input.githubSources[0]).toMatchObject({ contentAvailability: "exact", remoteBefore: { title: "Revision B", body: f.issues[0]!.body } });
  expect(request.input.githubSources[0]?.remoteBefore?.body).not.toBe(original);
  f.unitOfWork.run(actor, ({ repository }) => { const link = repository.listRemoteWorkItemLinksForStoryMap(f.map.id)[0]!; repository.upsertRemoteWorkItemLink({ ...link, bodyHash: "unavailable-later-revision" }); });
  const unavailable = f.unitOfWork.run(actor, ({ repository }) => repository.requestCardReview(f.project.id, f.cards[0]!.id));
  expect(unavailable.input.githubSources[0]).toMatchObject({ contentAvailability: "hash_only", remoteBefore: null, bodyHash: "unavailable-later-revision" });
});
it.each([false, true])("normalizes only same-plan parent/prerequisite updates with a newer unrelated observation=%s", async (unrelatedObservation) => {
  const f = remotePushFixture(1);
  f.inputs.labels.push("level:step");
  const child = f.unitOfWork.run(actor, ({ repository }) => {
    const card = repository.createCard({ storyMapId: f.map.id, parentId: f.cards[0]!.id, level: "step", cardType: "task", title: "Child outcome" });
    repository.mutateCardDependency(card.id, f.cards[0]!.id, true);
    return card;
  });
  const input = { storyMapId: f.map.id, connectionId: f.connection.id, mode: "push" as const, localOrigin: "http://127.0.0.1:4317" };
  await f.execute((await prepareRemotePush(f.repository, f.unitOfWork, actor, input)).plan.id);
  f.unitOfWork.run(actor, ({ repository }) => repository.updateCard(f.cards[0]!.id, { description: "Updated parent outcome" }));
  const { plan } = await prepareRemotePush(f.repository, f.unitOfWork, agent, input);
  const requests = f.repository.getCardReviews(f.project.id).requests;
  expect(requests.find((row) => row.cardId === child.id)?.input.githubSources).toHaveLength(2);
  for (const request of requests) f.unitOfWork.run(agent, ({ repository }) => repository.submitCardReview(f.project.id, output(request)));
  const read = f.provider.readPushInputs.getMockImplementation()!;
  let injected = false;
  f.provider.readPushInputs.mockImplementation(async (connection, auth) => {
    const parentEffect = plan.items.find((item) => item.entityId === f.cards[0]!.id)!;
    if (unrelatedObservation && !injected && f.repository.getRemotePushPlan(plan.id)?.execution.items.some((item) => item.itemId === parentEffect.id && item.state === "succeeded")) {
      injected = true;
      f.issues[0]!.body = "Unreviewed external revision C";
      await f.prepare();
    }
    return read(connection, auth);
  });
  const result = await f.execute(plan.id);
  expect(result.execution.status).toBe(unrelatedObservation ? "interrupted" : "completed");
  expect(f.provider.writeRemoteIssue).toHaveBeenCalledTimes(unrelatedObservation ? 3 : 4);
  if (unrelatedObservation) expect(result.execution.items.some((item) => item.error?.includes("DoR review"))).toBe(true);
});
