import { createHash, randomUUID } from "node:crypto";
import { DomainError, changeSetCommandToolNames, humanOnlyRestoreToolNames, mcpToolNameSchema, parseMcpToolAuditInput, sha256HexSchema, toErrorResponse, uuidSchema, type McpToolResult, type ToolCallMetadata } from "@storymapper/contracts";
import { withExecutorAudit } from "@storymapper/server/application/changeset/executor-audit";
import { ChangeSetConflictError, CommittedUnitOfWorkError } from "@storymapper/db";
import { asDomainError } from "@storymapper/server/application/errors";
import { resolveAuditProjectIds } from "@storymapper/server/mcp/tools/project-scopes";
import type { RegistrationContext } from "@storymapper/server/mcp/tools/register-tools";

function hashJson(value: unknown): string {
  const chunks: string[] = [];
  const pending: Array<{ value: unknown } | { text: string }> = [{ value }];
  while (pending.length) {
    const frame = pending.pop()!;
    if ("text" in frame) { chunks.push(frame.text); continue; }
    const item = frame.value;
    if (item === null || typeof item !== "object") { chunks.push(JSON.stringify(item) ?? "undefined"); continue; }
    if (Array.isArray(item)) {
      chunks.push("[");
      pending.push({ text: "]" });
      for (let index = item.length - 1; index >= 0; index--) {
        pending.push({ value: item[index] === undefined || typeof item[index] === "function" || typeof item[index] === "symbol" ? null : item[index] });
        if (index) pending.push({ text: "," });
      }
    } else {
      const entries = Object.entries(item).filter(([, entry]) => entry !== undefined && typeof entry !== "function" && typeof entry !== "symbol");
      chunks.push("{");
      pending.push({ text: "}" });
      for (let index = entries.length - 1; index >= 0; index--) {
        const [key, entry] = entries[index]!;
        pending.push({ value: entry }, { text: `${JSON.stringify(key)}:` });
        if (index) pending.push({ text: "," });
      }
    }
  }
  return createHash("sha256").update(chunks.join("")).digest("hex");
}

function affectedIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return ids;
  if (Array.isArray(value)) {
    for (const item of value) affectedIds(item, ids);
    return ids;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "before" || key === "after" || key === "toolCall" || key === "activityEvents" || key === "nextCursor") continue;
    if (key === "id" || /Ids?$/.test(key)) {
      for (const id of Array.isArray(item) ? item : [item]) if (typeof id === "string" && !ids.has(id) && isEntityId(id)) ids.add(id);
    } else affectedIds(item, ids);
  }
  return ids;
}

function inputIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => key === "patch" ? inputIds(item) : key === "id" || /Ids?$/.test(key) ? (Array.isArray(item) ? item : [item]).filter((id): id is string => typeof id === "string" && isEntityId(id)) : []);
}

function isEntityId(value: string): boolean {
  return uuidSchema.safeParse(value).success || sha256HexSchema.safeParse(value).success;
}

type ToolInvocation = (recordProjectIds?: (projectIds: string[], parsedInput?: unknown) => void) => McpToolResult | Promise<McpToolResult>;

function createAuditState(name: unknown, input: unknown) {
  const validName = mcpToolNameSchema.safeParse(name);
  const toolName = validName.success ? validName.data : typeof name === "string" && humanOnlyRestoreToolNames.includes(name) ? name : "UnrecognizedTool";
  return {
    validName, toolName, input, base: { toolName, inputHash: hashJson(input), affectedEntityIds: [] as string[] },
    projectIds: [] as string[], declaredInput: undefined as unknown, scopesResolved: false,
    result: undefined as McpToolResult | undefined, persistedInline: false, atomicAuditInsertStarted: false,
    failure: undefined as ReturnType<typeof asDomainError> | undefined, metadata: undefined as ToolCallMetadata | undefined
  };
}

type AuditState = ReturnType<typeof createAuditState>;

export async function auditToolCall(context: RegistrationContext, name: unknown, input: unknown, invoke: ToolInvocation, atomic = false): Promise<McpToolResult> {
  const state = createAuditState(name, input);
  try {
    await invokeAuditedTool(context, state, invoke, atomic);
    if (!state.persistedInline) {
      resolveScopes(context, state);
      recordSuccess(state, state.result);
    }
  } catch (error) {
    if (error instanceof CommittedUnitOfWorkError && state.persistedInline) {
      if (state.failure) throw state.failure;
      return state.result!;
    }
    recordFailure(context, state, error);
  }
  if (!state.persistedInline) {
    try { await context.recordToolCall({ projectId: state.projectIds.length === 1 ? state.projectIds[0]! : null, metadata: state.metadata! }); }
    catch (error) { throw asDomainError(error); }
  }
  if (state.failure) throw state.failure;
  return state.result!;
}

async function invokeAuditedTool(context: RegistrationContext, state: AuditState, invoke: ToolInvocation, atomic: boolean): Promise<void> {
  const recordScopes = (resolved: string[], parsed: unknown) => {
    state.projectIds = resolved;
    state.declaredInput = parsed;
    state.scopesResolved = true;
  };
  if (state.toolName === "ApplyChangeSet" || !atomic && state.validName.success && changeSetCommandToolNames.has(state.validName.data)) {
    state.result = await withExecutorAudit((repository, response) => {
      recordSuccess(state, response);
      state.atomicAuditInsertStarted = true;
      repository.logMcpToolCall({ projectId: state.projectIds.length === 1 ? state.projectIds[0]! : null, metadata: state.metadata!, initiatingActor: context.actor });
      state.persistedInline = true;
    }, () => invoke(recordScopes));
  } else if (atomic) {
    invokeAtomicTool(context, state, () => invoke(recordScopes));
  } else {
    state.result = await invoke(recordScopes);
  }
}

function invokeAtomicTool(context: RegistrationContext, state: AuditState, invoke: () => McpToolResult | Promise<McpToolResult>): void {
  context.unitOfWork.run(context.actor, ({ repository }) => {
    let pending: McpToolResult | Promise<McpToolResult>;
    try { pending = invoke(); }
    catch (error) {
      const domainError = asDomainError(error);
      if (!(error instanceof ChangeSetConflictError)) throw error;
      state.failure = domainError;
      resolveScopes(context, state);
      state.base.affectedEntityIds = [...new Set(inputIds(state.declaredInput))];
      const { statusCode: _status, ...envelope } = toErrorResponse(domainError);
      state.metadata = { ...state.base, outcome: "rejected", outputHash: hashJson(envelope), rejectionReason: "conflict" };
      state.atomicAuditInsertStarted = true;
      repository.logMcpToolCall({ projectId: state.projectIds.length === 1 ? state.projectIds[0]! : null, metadata: state.metadata });
      state.persistedInline = true;
      return;
    }
    if (pending && typeof pending === "object" && "then" in pending) throw new Error("Atomic MCP tool handlers must complete synchronously.");
    state.result = pending;
    resolveScopes(context, state);
    recordSuccess(state, state.result);
    state.atomicAuditInsertStarted = true;
    repository.logMcpToolCall({ projectId: state.projectIds.length === 1 ? state.projectIds[0]! : null, metadata: state.metadata! });
    state.persistedInline = true;
  });
}

function resolveScopes(context: RegistrationContext, state: AuditState): void {
  if (!state.scopesResolved && state.validName.success) {
    state.declaredInput = parseMcpToolAuditInput(state.validName.data, state.input);
    state.projectIds = resolveAuditProjectIds(context.repository, state.declaredInput);
  }
}

function recordSuccess(state: AuditState, response: unknown): void {
  state.base.affectedEntityIds = [...new Set(inputIds(state.declaredInput))];
  state.metadata = { ...state.base, outcome: "ok", outputHash: hashJson(response), affectedEntityIds: [...affectedIds(response, new Set(state.base.affectedEntityIds))] };
}

function recordFailure(context: RegistrationContext, state: AuditState, error: unknown): void {
  if (state.atomicAuditInsertStarted) {
    const domainError = asDomainError(error);
    state.failure = new DomainError("internal", "An internal error occurred.", { ...domainError.details, errorId: domainError.details?.errorId ?? randomUUID() });
    const { statusCode: _status, ...envelope } = toErrorResponse(state.failure);
    state.metadata = { ...state.base, outcome: "error", outputHash: hashJson(envelope), errorId: state.failure.details?.errorId as string };
    state.persistedInline = false;
  } else {
    state.failure = asDomainError(error);
    if (state.failure.code === "internal") state.failure = new DomainError("internal", "An internal error occurred.", { ...state.failure.details, errorId: uuidSchema.safeParse(state.failure.details?.errorId).data ?? randomUUID() });
    const { statusCode: _status, ...envelope } = toErrorResponse(state.failure);
    if (state.validName.success) {
      state.declaredInput = parseMcpToolAuditInput(state.validName.data, state.input);
      if (state.failure.code !== "internal") {
        const actualOwners = resolveAuditProjectIds(context.repository, state.declaredInput);
        const record = state.declaredInput as Record<string, unknown> | undefined;
        if (!state.scopesResolved || actualOwners.length === 1 && typeof record?.projectId === "string" && actualOwners[0] !== record.projectId) state.projectIds = actualOwners;
      }
      state.base.affectedEntityIds = [...new Set(inputIds(state.declaredInput))];
    }
    state.metadata = { ...state.base, outcome: state.failure.code === "internal" ? "error" : "rejected", outputHash: hashJson(envelope), ...(state.failure.code === "internal" ? { errorId: state.failure.details?.errorId as string } : { rejectionReason: state.failure.code }) };
  }
}
