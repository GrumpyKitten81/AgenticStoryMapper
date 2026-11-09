import { AsyncLocalStorage } from "node:async_hooks";
import type { McpToolResult } from "@storymapper/contracts";
import type { StoryMapperRepository } from "@storymapper/db";

const executorAudit = new AsyncLocalStorage<(repository: StoryMapperRepository<"transaction">, result: McpToolResult) => void>();

export function withExecutorAudit<Result>(audit: (repository: StoryMapperRepository<"transaction">, result: McpToolResult) => void, invoke: () => Result): Result {
  return executorAudit.run(audit, invoke);
}

export function persistExecutorAudit(repository: StoryMapperRepository<"transaction">, result: McpToolResult): void {
  executorAudit.getStore()?.(repository, result);
}
