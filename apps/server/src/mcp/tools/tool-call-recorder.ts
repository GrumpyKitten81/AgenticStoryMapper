import { MessageChannel } from "node:worker_threads";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ActorContext, ToolCallMetadata } from "@storymapper/contracts";
import type { UnitOfWork } from "@storymapper/db";
import { requestActor } from "@storymapper/server/http/request-origin";

interface PendingCall {
  input: { projectId: string | null; metadata: ToolCallMetadata };
  resolve: () => void;
  reject: (error: unknown) => void;
  originClientId: string | undefined;
  run: ReturnType<typeof AsyncLocalStorage.snapshot>;
}

export function createToolCallRecorder(unitOfWork: UnitOfWork, actor: ActorContext): (input: PendingCall["input"]) => Promise<void> {
  const pending: PendingCall[] = [];
  let channel: MessageChannel | undefined;
  return (input) => new Promise<void>((resolve, reject) => {
    pending.push({ input, resolve, reject, originClientId: requestActor(actor).originClientId, run: AsyncLocalStorage.snapshot() });
    if (pending.length !== 1) return;
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.on("message", flush);
    }
    channel.port2.postMessage(null);
  });

  function flush(): void {
    const calls = pending.splice(0);
    const origins = new Map<string | undefined, PendingCall[]>();
    for (const call of calls) {
      const group = origins.get(call.originClientId) ?? [];
      if (!group.length) origins.set(call.originClientId, group);
      group.push(call);
    }
    for (const group of origins.values()) {
      try {
        group[0]!.run(() => unitOfWork.run(actor, ({ repository }) => {
          for (const call of group) repository.logMcpToolCall(call.input);
        }));
        for (const call of group) call.resolve();
      } catch (error) {
        for (const call of group) call.reject(error);
      }
    }
    const current = channel!;
    setImmediate(() => {
      if (pending.length || channel !== current) return;
      current.port1.close();
      current.port2.close();
      channel = undefined;
    });
  }
}
