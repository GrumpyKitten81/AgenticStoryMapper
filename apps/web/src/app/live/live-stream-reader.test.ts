import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveTransactionSchema } from "@storymapper/contracts";
import { LiveStreamError, LiveStreamIdleError, readLiveStream, type LiveMessage } from "@storymapper/web/app/live/live-stream-reader";

afterEach(() => vi.useRealTimers());

function chunks(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    for (let start = 0; start < bytes.length; start += size) controller.enqueue(bytes.slice(start, start + size));
    controller.close();
  } });
}

describe("Story3.10 SSE framing", () => {
  it("decodes splitCRLF, splitUTF8, heartbeats, multiline metadata and reset in stream order", async () => {
    const epoch = randomUUID();
    const event = liveTransactionSchema.parse({ id: `${epoch}:1`, epoch, seq: 1, actor: { actorType: "agent", actorId: "Agent\u00e9" }, originClientId: null,
      entities: [{ entityType: "card", entityId: randomUUID(), projectId: randomUUID(), version: 1 }] });
    const data = JSON.stringify(event, null, 2).split("\n").map((line) => `data: ${line}`).join("\r\n");
    const reset = { epoch, seq: 2, id: `${epoch}:2` };
    const stream = `: heartbeat\r\n\r\nevent: transaction\r\nid: ${event.id}\r\n${data}\r\n\r\nevent: reset\r\nid: ${reset.id}\r\ndata: ${JSON.stringify(reset)}\r\n\r\n`;
    const received: LiveMessage[] = [];
    await readLiveStream(chunks(stream, 1), (message) => received.push(message));
    expect(received).toEqual([{ kind: "transaction", value: event }, { kind: "reset", value: reset }]);
  });

  it.each(["invalid JSON", "mismatched ID", "unknown event"])("refuses %s instead of silently skipping a committed message", async (kind) => {
    const epoch = randomUUID();
    const reset = { epoch, seq: 0, id: `${epoch}:0` };
    const stream = `event: ${kind === "unknown event" ? "unknown" : "reset"}\nid: ${kind === "mismatched ID" ? `${epoch}:1` : reset.id}\ndata: ${kind === "invalid JSON" ? "{" : JSON.stringify(reset)}\n\n`;
    await expect(readLiveStream(chunks(stream, 3), () => {})).rejects.toBeInstanceOf(LiveStreamError);
  });

  it("cancels an underlying open stream before releasing its reader on malformed metadata", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode("event: transaction\ndata: {}\n\n"));
    }, cancel });
    await expect(readLiveStream(body, () => {})).rejects.toBeInstanceOf(LiveStreamError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("accepts a valid transaction larger than1MiB and preserves the following ordered event", async () => {
    const epoch = randomUUID();
    const projectId = randomUUID();
    const event = liveTransactionSchema.parse({ id: `${epoch}:1`, epoch, seq: 1, actor: { actorType: "agent", actorId: "Large operation batch" }, originClientId: null,
      entities: Array.from({ length: 12_000 }, () => ({ entityType: "card", entityId: randomUUID(), projectId, version: 1 })) });
    const next = { epoch, seq: 2, id: `${epoch}:2` };
    const frame = `event: transaction\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
    expect(new TextEncoder().encode(frame).length).toBeGreaterThan(1_048_576);
    const received: LiveMessage[] = [];
    await readLiveStream(chunks(`${frame}event: ready\nid: ${next.id}\ndata: ${JSON.stringify(next)}\n\n`, 32_768), (message) => received.push(message));
    expect(received).toEqual([{ kind: "transaction", value: event }, { kind: "ready", value: next }]);
  });

  it("keeps heartbeat comments alive but cancels after30seconds with no bytes", testKeepsHeartbeatCommentsAliveButCancelsAfter30secondsWithNoBytes);
});

async function testKeepsHeartbeatCommentsAliveButCancelsAfter30secondsWithNoBytes() {
  vi.useFakeTimers();
  const cancel = vi.fn();
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; }, cancel });
  const read = readLiveStream(body, vi.fn());
  const refused = expect(read).rejects.toBeInstanceOf(LiveStreamIdleError);
  for (let beat = 0; beat < 3; beat += 1) {
    await vi.advanceTimersByTimeAsync(15_000);
    stream.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).not.toHaveBeenCalled();
  }
  await vi.advanceTimersByTimeAsync(29_999);
  expect(cancel).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await refused;
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
}
