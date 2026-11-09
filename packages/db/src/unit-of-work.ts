import { AsyncLocalStorage } from "node:async_hooks";
import type { SqliteDatabase } from "@storymapper/db/connection";
import type { ActorContext, LiveTransaction } from "@storymapper/contracts";
import { assertSynchronous, DatabaseHandle, TransactionContext } from "@storymapper/db/database-handle";
import { ProjectRepository } from "@storymapper/db/repositories/project-repository";
import { StoryMapperRepository } from "@storymapper/db/repositories/storymapper-repository";

export interface TransactionRepositories {
  repository: StoryMapperRepository<"transaction">;
  projects: ProjectRepository<"transaction">;
}

interface ActiveUnitOfWork {
  handle: DatabaseHandle;
  actor: ActorContext;
  repositories: TransactionRepositories;
}

const activeUnitOfWork = new AsyncLocalStorage<ActiveUnitOfWork>();

export class CommittedUnitOfWorkError<Result = unknown> extends Error {
  constructor(readonly result: Result, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Post-commit publication failed.", { cause });
    this.name = "CommittedUnitOfWorkError";
  }
}

export class UnitOfWork {
  private readonly listeners = new Set<(event: LiveTransaction) => void>();

  constructor(readonly handle: DatabaseHandle, private readonly afterCommit?: () => void, private readonly resolveActor?: (actor: ActorContext) => ActorContext, private readonly reportPublicationFailure: (error: unknown) => void = () => process.emitWarning("Post-commit publication failed; database changes remain committed.")) {}

  subscribe(listener: (event: LiveTransaction) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  runPrepared<Prepared, Result>(actorContext: ActorContext, prepare: (database: SqliteDatabase) => Prepared, fn: (repositories: TransactionRepositories, prepared: Prepared) => Result extends PromiseLike<unknown> ? never : Result): Result {
    if (activeUnitOfWork.getStore()?.handle === this.handle) throw new Error("Prepared unit of work cannot start inside a transaction.");
    let transaction: TransactionContext | undefined;
    const actor = this.resolveActor?.(actorContext) ?? actorContext;
    const result = TransactionContext.executePrepared(this.handle, actor, prepare, (context, prepared) => {
      transaction = context;
      const repositories = { repository: new StoryMapperRepository(this.handle, context), projects: new ProjectRepository(this.handle, context) } as TransactionRepositories;
      return activeUnitOfWork.run({ handle: this.handle, actor, repositories }, () => fn(repositories, prepared)) as Result;
    });
    this.publishCommitted(transaction!, result);
    return result;
  }

  run<Result>(actorContext: ActorContext, fn: (repositories: TransactionRepositories) => Result extends PromiseLike<unknown> ? never : Result): Result {
    const active = activeUnitOfWork.getStore();
    if (active?.handle === this.handle) {
      const actor = this.resolveActor?.(actorContext) ?? actorContext;
      if (actor.actorType !== active.actor.actorType || actor.actorId !== active.actor.actorId || actor.mcpSessionId !== active.actor.mcpSessionId) {
        throw new Error("A nested unit of work cannot change actor identity.");
      }
      const result = fn(active.repositories);
      assertSynchronous(result, "Unit of work callbacks must be synchronous.");
      return result;
    }
    let transaction: TransactionContext | undefined;
    const actor = this.resolveActor?.(actorContext) ?? actorContext;
    const result = TransactionContext.execute(this.handle, actor, (context) => {
      transaction = context;
      const repositories = { repository: new StoryMapperRepository(this.handle, context), projects: new ProjectRepository(this.handle, context) } as TransactionRepositories;
      return activeUnitOfWork.run({ handle: this.handle, actor, repositories }, () => fn(repositories)) as Result;
    });
    this.publishCommitted(transaction!, result);
    return result;
  }

  private publishCommitted<Result>(transaction: TransactionContext, result: Result): void {
    try {
      if (transaction.committedEvent) for (const listener of this.listeners) listener(transaction.committedEvent);
      assertSynchronous(this.afterCommit?.(), "After-commit hooks must be synchronous; database changes are already committed.");
    } catch (error) {
      this.reportPublicationFailure(error);
      throw new CommittedUnitOfWorkError(result, error);
    }
  }
}
