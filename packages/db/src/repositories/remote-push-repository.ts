import { parseStoredJson } from "@storymapper/db/versioned-json";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DomainError, remotePushExecutionSchema, remotePushItemExecutionSchema, remotePushPlanSchema, type ActorContext, type RemotePushExecution, type RemotePushItemExecution, type RemotePushPlan, type RemotePushPlanResponse } from "@storymapper/contracts";
import { remotePushExecutions, remotePushPlans } from "@storymapper/db/schema";
import type { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export function getRemotePushPlan(this: StoryMapperRepository<"transaction">, planId: string): RemotePushPlanResponse | undefined {
  this.context.database;
  const row = this.db.select().from(remotePushPlans).where(eq(remotePushPlans.id, planId)).get();
  if (!row) return undefined;
  const execution = this.db.select().from(remotePushExecutions).where(eq(remotePushExecutions.planId, planId)).get();
  if (!execution) throw new DomainError("internal", "Remote plan execution evidence is missing.");
  return { plan: parseStoredJson("remote_push_plans", "plan_json", row.planJson, row.planSchemaVersion), execution: parseStoredJson("remote_push_executions", "execution_json", execution.executionJson, execution.executionSchemaVersion) };
}

export function saveRemotePushPlan(this: StoryMapperRepository<"transaction">, input: RemotePushPlan): RemotePushPlanResponse {
  this.assertWritable();
  const plan = remotePushPlanSchema.parse(input);
  const map = this.getStoryMapOrThrow(plan.storyMapId);
  const connection = this.getConnectorConnection(plan.connectionId);
  if (map.projectId !== plan.projectId || connection?.projectId !== plan.projectId) throw new DomainError("validation", "Remote plan ownership does not match its connection and Story Map.");
  if (this.getSafetySettings(plan.projectId).epoch !== plan.epoch) throw new DomainError("conflict", "Remote plan belongs to a previous database epoch.");
  const knownIds = new Set<string>();
  for (const item of plan.items) {
    if (knownIds.has(item.id) || item.dependencies.some((id) => !knownIds.has(id))) throw new DomainError("validation", "Remote effect identities and dependencies must be unique and ordered.");
    knownIds.add(item.id);
  }
  const execution: RemotePushExecution = { planId: plan.id, status: "reviewed", expectedLocalFingerprint: plan.localFingerprint,
    items: plan.items.map(({ id }) => ({ itemId: id, state: "not_attempted", attempt: 0 })) };
  this.db.insert(remotePushPlans).values({ id: plan.id, projectId: plan.projectId, storyMapId: plan.storyMapId, connectionId: plan.connectionId, epoch: plan.epoch, planSchemaVersion: 1, planJson: JSON.stringify(plan) }).run();
  this.db.insert(remotePushExecutions).values({ planId: plan.id, status: execution.status, executionSchemaVersion: 1, executionJson: JSON.stringify(execution) }).run();
  this.logActivity(plan.projectId, "remotePushPlan.created", "remotePushPlan", plan.id, undefined, plan);
  if (plan.actor.actorType === "agent" && this.getCardReviewSettings(plan.projectId).reviewBeforeAgentPush) {
    this.requestCardReviews(plan.projectId, plan.items.flatMap((item) => item.kind === "issue" ? [item.entityId] : []), "push", plan.id);
  }
  return { plan, execution };
}

function requiredPlan(repository: StoryMapperRepository<"transaction">, planId: string): RemotePushPlanResponse {
  const value = repository.getRemotePushPlan(planId);
  if (!value) throw new DomainError("not_found", "Remote push plan not found.");
  return value;
}

function persistExecution(repository: StoryMapperRepository<"transaction">, execution: RemotePushExecution): RemotePushExecution {
  const parsed = remotePushExecutionSchema.parse(execution);
  repository.db.update(remotePushExecutions).set({ status: parsed.status, executionSchemaVersion: 1, executionJson: JSON.stringify(parsed) }).where(eq(remotePushExecutions.planId, parsed.planId)).run();
  return parsed;
}

export function claimRemotePushPlan(this: StoryMapperRepository<"transaction">, planId: string, actor: ActorContext, resume = false): RemotePushExecution {
  this.assertWritable();
  if (actor.actorType !== "human") throw new DomainError("protected", "Remote push confirmation is human-only.");
  const { plan, execution } = requiredPlan(this, planId);
  if (plan.blockers.length) throw new DomainError("validation", "The reviewed plan has blockers and cannot execute.");
  if (this.getSafetySettings(plan.projectId).epoch !== plan.epoch) throw new DomainError("conflict", "Remote plan belongs to a previous database epoch. Review a new plan.");
  if (resume ? !["running", "interrupted"].includes(execution.status) : execution.status !== "reviewed") throw new DomainError("conflict", "Remote plan was already consumed or is not resumable.");
  const claimed = persistExecution(this, { ...execution, status: "running", confirmedBy: actor, confirmedAt: new Date().toISOString(), runToken: randomUUID() });
  this.logActivity(plan.projectId, resume ? "remotePushPlan.resumed" : "remotePushPlan.confirmed", "remotePushExecution", planId, execution, claimed);
  return claimed;
}

function runningExecution(repository: StoryMapperRepository<"transaction">, planId: string, runToken: string): RemotePushExecution {
  const { execution } = requiredPlan(repository, planId);
  if (execution.status !== "running" || execution.runToken !== runToken) throw new DomainError("conflict", "Remote execution ownership changed.");
  return execution;
}

export function captureRemotePushReconciliation(this: StoryMapperRepository<"transaction">, planId: string, itemId: string): string {
  this.assertWritable();
  const { plan } = requiredPlan(this, planId);
  const effect = plan.items.find((entry) => entry.id === itemId);
  if (!effect) throw new DomainError("not_found", "Remote plan item not found.");
  const overlapping = this.db.select().from(remotePushPlans).where(eq(remotePushPlans.projectId, plan.projectId)).all()
    .filter((row) => row.id !== planId).sort((a, b) => a.id.localeCompare(b.id)).flatMap((row) => {
      const other = requiredPlan(this, row.id);
      const items = other.plan.items.filter((entry) => entry.entityId === effect.entityId && entry.kind === effect.kind)
        .map((entry) => other.execution.items.find((item) => item.itemId === entry.id)!);
      return items.length ? [{ planId: row.id, epoch: other.plan.epoch, status: other.execution.status, runToken: other.execution.runToken, items }] : [];
    });
  return createHash("sha256").update(JSON.stringify(overlapping)).digest("hex");
}

export function recordRemotePushIntent(this: StoryMapperRepository<"transaction">, planId: string, itemId: string, runToken: string, payload?: RemotePushItemExecution["intentPayload"], reconciliation?: { complete: true; remoteId?: string | undefined; executionState?: string }): RemotePushItemExecution {
  this.assertWritable();
  const execution = runningExecution(this, planId, runToken);
  const item = execution.items.find((entry) => entry.itemId === itemId);
  if (!item) throw new DomainError("not_found", "Remote plan item not found.");
  if (["intent", "remote_succeeded", "local_failed", "succeeded", "uncertain"].includes(item.state)) throw new DomainError("conflict", "The remote item must be reconciled before another attempt.");
  assertNoOverlappingIntent(this, planId, itemId, payload, reconciliation);
  const updated: RemotePushItemExecution = { ...item, error: undefined, state: "intent", attempt: item.attempt + 1, ...(payload ? { intentPayload: payload } : {}), intentAt: new Date().toISOString() };
  persistExecution(this, { ...execution, items: execution.items.map((entry) => entry.itemId === itemId ? updated : entry) });
  return updated;
}

function assertNoOverlappingIntent(repository: StoryMapperRepository<"transaction">, planId: string, itemId: string, payload: RemotePushItemExecution["intentPayload"], reconciliation: { complete: true; remoteId?: string | undefined; executionState?: string } | undefined): void {
  const { plan } = requiredPlan(repository, planId);
  const effect = plan.items.find((entry) => entry.id === itemId)!;
  const fresh = reconciliation?.executionState === repository.captureRemotePushReconciliation(planId, itemId);
  for (const row of repository.db.select().from(remotePushPlans).where(eq(remotePushPlans.projectId, plan.projectId)).all()) {
    if (row.id === planId) continue;
    const other = requiredPlan(repository, row.id);
    for (const overlapping of other.plan.items.filter((entry) => entry.entityId === effect.entityId && entry.kind === effect.kind)) {
      const evidence = other.execution.items.find((item) => item.itemId === overlapping.id)!;
      if (!["intent", "uncertain", "remote_succeeded", "local_failed"].includes(evidence.state)) continue;
      const active = other.plan.epoch === plan.epoch && other.execution.status === "running";
      if (!active && fresh && reconciliation?.complete) {
        if (reconciliation.remoteId && payload?.remoteId === reconciliation.remoteId && (!evidence.remoteId || evidence.remoteId === reconciliation.remoteId)) continue;
        if (!reconciliation.remoteId && !payload?.remoteId && ["intent", "uncertain"].includes(evidence.state)) {
          const reconciled = { ...evidence, state: "failed" as const, error: `Complete marker lookup in plan ${planId} proved this effect absent.`, completedAt: new Date().toISOString() };
          persistExecution(repository, { ...other.execution, items: other.execution.items.map((item) => item.itemId === evidence.itemId ? reconciled : item) });
          repository.logActivity(plan.projectId, "remotePushPlan.reconciled", "remotePushExecution", other.plan.id, evidence, reconciled);
          continue;
        }
      }
      throw new DomainError("conflict", `Remote entity has unresolved execution evidence in plan ${row.id}; explicitly reconcile that plan before another write.`, { planId: row.id, itemId: overlapping.id });
    }
  }
}

export function recordRemotePushOutcome(this: StoryMapperRepository<"transaction">, planId: string, itemId: string, outcome: Partial<Omit<RemotePushItemExecution, "itemId" | "attempt">>, runToken: string): RemotePushItemExecution {
  this.assertWritable();
  const execution = runningExecution(this, planId, runToken);
  const item = execution.items.find((entry) => entry.itemId === itemId);
  if (!item) throw new DomainError("not_found", "Remote plan item not found.");
  const transitions: Record<RemotePushItemExecution["state"], readonly RemotePushItemExecution["state"][]> = {
    not_attempted: ["failed"], intent: ["remote_succeeded", "failed", "uncertain"], failed: ["failed"],
    uncertain: ["failed", "remote_succeeded", "uncertain"], remote_succeeded: ["local_failed", "succeeded"],
    local_failed: ["succeeded", "local_failed", "remote_succeeded"], succeeded: ["succeeded"]
  };
  if (outcome.state && !transitions[item.state].includes(outcome.state)) throw new DomainError("conflict", "Remote item outcome transition is invalid.");
  if (["remote_succeeded", "local_failed", "succeeded"].includes(outcome.state ?? item.state) && !(outcome.remoteId ?? item.remoteId)) throw new DomainError("validation", "Successful remote effects require the actual remote identity.");
  const updated = remotePushItemExecutionSchema.parse({ ...item, ...outcome, ...(outcome.state === "succeeded" ? { error: undefined } : {}), itemId, attempt: item.attempt, completedAt: new Date().toISOString() });
  persistExecution(this, { ...execution, items: execution.items.map((entry) => entry.itemId === itemId ? updated : entry) });
  return updated;
}

export function updateRemotePushFingerprint(this: StoryMapperRepository<"transaction">, planId: string, fingerprint: string, runToken: string): void {
  this.assertWritable();
  persistExecution(this, { ...runningExecution(this, planId, runToken), expectedLocalFingerprint: fingerprint });
}

export function finishRemotePushPlan(this: StoryMapperRepository<"transaction">, planId: string, status: "interrupted" | "completed" | "stale", runToken?: string): RemotePushExecution {
  this.assertWritable();
  const { execution } = requiredPlan(this, planId);
  if (runToken ? execution.status !== "running" || execution.runToken !== runToken : execution.status !== "reviewed") throw new DomainError("conflict", "Remote execution ownership changed.");
  if (status === "completed" && execution.items.some((item) => item.state !== "succeeded")) throw new DomainError("conflict", "Remote execution still has unfinished items.");
  return persistExecution(this, { ...execution, status });
}
