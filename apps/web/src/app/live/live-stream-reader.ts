import { liveResetSchema, liveTransactionSchema, type LiveReset, type LiveTransaction } from "@storymapper/contracts";

export type LiveMessage = { kind: "transaction"; value: LiveTransaction } | { kind: "reset" | "ready"; value: LiveReset };

export class LiveStreamError extends Error {}
export class LiveStreamIdleError extends Error {}

function streamIdleTimeout(): { expired: Promise<never>; touch: () => void; close: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectIdle!: (error: LiveStreamIdleError) => void;
  const expired = new Promise<never>((_resolve, reject) => { rejectIdle = reject; });
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => rejectIdle(new LiveStreamIdleError("Live stream received no bytes for 30 seconds.")), 30_000);
  };
  touch();
  return { expired, touch, close: () => clearTimeout(timer) };
}

function parseFrame(frame: string): LiveMessage | undefined {
  let kind = "message";
  let id: string | undefined;
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const name = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (name === "event") kind = value;
    if (name === "id") id = value;
    if (name === "data") data.push(value);
  }
  if (!data.length) return undefined;
  if (kind !== "transaction" && kind !== "reset" && kind !== "ready") throw new LiveStreamError("Unknown live event.");
  let input: unknown;
  try { input = JSON.parse(data.join("\n")); }
  catch (error) { if (error instanceof SyntaxError) throw new LiveStreamError("Invalid live event JSON."); throw error; }
  const parsed = kind === "transaction" ? liveTransactionSchema.safeParse(input) : liveResetSchema.safeParse(input);
  if (!parsed.success || parsed.data.id !== id) throw new LiveStreamError("Invalid live event metadata.");
  return kind === "transaction" ? { kind, value: parsed.data as LiveTransaction } : { kind, value: parsed.data as LiveReset };
}

export async function readLiveStream(body: ReadableStream<Uint8Array>, receive: (message: LiveMessage) => void): Promise<void> {
  const reader = body.getReader();
  const idle = streamIdleTimeout();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), idle.expired]);
      if (chunk.done) break;
      if (chunk.value.length) idle.touch();
      pending += decoder.decode(chunk.value, { stream: true });
      pending = pending.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const frame = parseFrame(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        if (frame) receive(frame);
      }
    }
  } finally {
    idle.close();
    try { await reader.cancel(); }
    catch (error) { if (!(error instanceof TypeError || error instanceof DOMException && error.name === "AbortError")) throw error; }
    finally { reader.releaseLock(); }
  }
}
