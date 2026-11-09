import { randomUUID } from "node:crypto";
import { actorContextSchema, type ActorContext, type LiveEntity, type LiveTransaction, type OperationalHealth } from "@storymapper/contracts";
import type { SqliteDatabase } from "@storymapper/db/connection";
import { finalizeLiveTransaction } from "@storymapper/db/live-events";
import { finalizeLiveRoots } from "@storymapper/db/live-change-tracking";

export interface DatabaseOwnership {
  acquire(databasePath: string): () => void;
  releasePrevious(databasePath: string): void;
}

export class DatabaseHandle {
  #operation: string | undefined;
  #restoring = false;
  #requests = 0;
  #lifecycleRequests = 0;
  #drained = new Set<() => void>();
  #stopping = false;
  #unavailableReason: string | undefined;
  #replacementListeners = new Set<() => void>();

  constructor(public current: SqliteDatabase, readonly ownership?: DatabaseOwnership) {}

  get restoring(): boolean { return this.#restoring; }
  get unavailableReason(): string | undefined { return this.#unavailableReason; }
  get stopping(): boolean { return this.#stopping; }
  get writeGate(): OperationalHealth["writeGate"] {
    if (this.#stopping) return "stopping";
    if (this.#unavailableReason || !this.current.$client.open) return "unavailable";
    if (this.#restoring) return "restoring";
    return this.#operation ? "writing" : "available";
  }

  markUnavailable(reason: string): void { this.#unavailableReason = reason; }

  subscribeReplacement(listener: () => void): () => void {
    this.#replacementListeners.add(listener);
    return () => { this.#replacementListeners.delete(listener); };
  }

  assertAvailable(): void {
    if (this.#unavailableReason) throw new Error(this.#unavailableReason);
  }

  enterRequest(lifecycle = false): boolean {
    if (this.#stopping || this.#restoring || this.#unavailableReason) return false;
    if (lifecycle) this.#lifecycleRequests += 1;
    else this.#requests += 1;
    return true;
  }

  leaveRequest(lifecycle = false): void {
    if (lifecycle) this.#lifecycleRequests -= 1;
    else this.#requests -= 1;
    for (const check of this.#drained) check();
  }

  async drain(): Promise<void> {
    this.#stopping = true;
    await this.#waitForDrain(true);
  }

  async #waitForDrain(lifecycle: boolean): Promise<void> {
    if (!this.#requests && (!lifecycle || !this.#lifecycleRequests)) return;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.#requests || lifecycle && this.#lifecycleRequests) return;
        this.#drained.delete(check);
        resolve();
      };
      this.#drained.add(check);
    });
  }

  async restore<Result>(fn: () => Result | Promise<Result>): Promise<Result> {
    this.assertAvailable();
    if (this.#restoring) throw new Error("A project restore is already in progress.");
    this.#restoring = true;
    const previous = this.current;
    let succeeded = false;
    try {
      await this.#waitForDrain(false);
      const result = await fn();
      succeeded = true;
      return result;
    } finally {
      this.#restoring = false;
      if (succeeded && this.current !== previous) for (const listener of this.#replacementListeners) listener();
    }
  }

  exclusive<Result>(operation: string, fn: (database: SqliteDatabase) => Result): Result {
    this.assertAvailable();
    if (this.#operation) throw new Error(`Database write gate is already held by ${this.#operation}; ${operation} cannot reenter.`);
    if (this.current.$client.inTransaction) throw new Error(`${operation} cannot start inside a transaction.`);
    this.#operation = operation;
    try {
      const result = fn(this.current);
      assertSynchronous(result, `${operation} must be synchronous.`);
      return result;
    } finally {
      this.#operation = undefined;
    }
  }
}

const TRANSACTION_CREATION = Symbol("unit-of-work");

export class TransactionContext {
  #active = true;
  readonly createdRoots = new Set<string>();
  readonly bumpedRoots = new Set<string>();
  readonly beforeCommit: Array<() => void> = [];
  readonly transactionId = randomUUID();
  readonly liveEntities = new Map<string, LiveEntity>();
  lastActivitySeq = 0;
  hasBusinessActivity = false;
  committedEvent: LiveTransaction | undefined;

  private constructor(readonly database: SqliteDatabase, readonly actor: ActorContext, creation: symbol) {
    if (creation !== TRANSACTION_CREATION) throw new Error("Transaction contexts can only be created by a unit of work.");
  }

  assertActive(): void {
    if (!this.#active || !this.database.$client.inTransaction) throw new Error("Transaction repository has expired.");
  }

  static execute<Result>(handle: DatabaseHandle, actor: ActorContext, fn: (context: TransactionContext) => Result): Result {
    return TransactionContext.executePrepared(handle, actor, () => undefined, (context) => fn(context));
  }

  static executePrepared<Prepared, Result>(handle: DatabaseHandle, actor: ActorContext, prepare: (database: SqliteDatabase) => Prepared, fn: (context: TransactionContext, prepared: Prepared) => Result): Result {
    return handle.exclusive("Prepared unit of work", (database) => {
      const prepared = prepare(database);
      assertSynchronous(prepared, "Unit of work preparation must be synchronous.");
      const context = new TransactionContext(database, Object.freeze(actorContextSchema.parse(actor)), TRANSACTION_CREATION);
      try {
        return database.$client.transaction(() => {
          const result = fn(context, prepared);
          assertSynchronous(result, "Unit of work callbacks must be synchronous.");
          for (const finalize of context.beforeCommit) finalize();
          finalizeLiveRoots(database, context);
          context.committedEvent = finalizeLiveTransaction(database, context);
          return result;
        })();
      } finally {
        context.#active = false;
      }
    });
  }
}

export function assertSynchronous(result: unknown, message: string): void {
  if (result && (typeof result === "object" || typeof result === "function") && "then" in result) {
    void Promise.resolve(result).then(undefined, () => undefined);
    throw new Error(message);
  }
}

export class RepositoryContext {
  constructor(readonly handle: DatabaseHandle, readonly transaction?: TransactionContext) {}

  get database(): SqliteDatabase {
    this.handle.assertAvailable();
    if (this.transaction) {
      if (!(this.transaction instanceof TransactionContext)) throw new Error("Invalid transaction context.");
      this.transaction.assertActive();
    }
    return this.transaction?.database ?? this.handle.current;
  }

  assertWritable(): ActorContext {
    this.database;
    if (!this.transaction) throw new Error("Repository writes require an active unit of work.");
    return this.transaction.actor;
  }
}
