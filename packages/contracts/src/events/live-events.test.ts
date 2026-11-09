import { describe, expect, it } from "vitest";
import { liveEventIdSchema, liveResetSchema, liveTransactionSchema } from "@storymapper/contracts/events/live-events";

const epoch = "c43c812a-10b9-4d88-99c2-a832348c26e6";

describe("ordered metadata event contracts", () => {
  it("parses canonical reconnect boundaries and rejects malformed/unsafe sequences", () => {
    expect(liveEventIdSchema.parse(`${epoch}:42`)).toEqual({ epoch, seq: 42 });
    expect(liveEventIdSchema.parse(`${epoch}:0`)).toEqual({ epoch, seq: 0 });
    for (const value of [`${epoch}:-1`, `${epoch}:1.5`, `${epoch}:01`, `${epoch}:9007199254740992`, `${epoch}:1:2`, "invalid:4"]) {
      expect(liveEventIdSchema.safeParse(value).success).toBe(false);
    }
  });

  it("requires the envelope ID to match its epoch/sequence and permits truthful unversioned metadata", () => {
    const reset = { epoch, seq: 1, id: `${epoch}:1` };
    expect(liveResetSchema.parse(reset)).toEqual(reset);
    expect(liveResetSchema.safeParse({ ...reset, id: `${epoch}:2` }).success).toBe(false);
    const transaction = { ...reset, actor: { actorType: "agent", actorId: "Claude Code", mcpSessionId: "session" }, originClientId: null, entities: [{ entityType: "activity", entityId: epoch, projectId: null, version: null }] };
    expect(liveTransactionSchema.parse(transaction)).toEqual(transaction);
    expect(liveTransactionSchema.safeParse({ ...transaction, id: "invalid" }).success).toBe(false);
  });
});
