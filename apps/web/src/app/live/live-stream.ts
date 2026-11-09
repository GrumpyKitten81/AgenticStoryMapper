import { liveResetSchema, liveTransactionSchema } from "@storymapper/contracts";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";
import { LiveStreamError, LiveStreamIdleError, readLiveStream, type LiveMessage } from "@storymapper/web/app/live/live-stream-reader";

const LIVE_CHANNEL = "storymapper-live-events";
const LIVE_CURSOR_KEY = "storymapper-live-stream-cursor";

export type LiveConnectionState = "connecting" | "connected" | "reconnecting" | "failed";
interface LiveStreamCallbacks {
  receive: (message: LiveMessage) => void;
  state: (state: LiveConnectionState) => void;
}

function networkError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof DOMException && error.name === "AbortError";
}

function waitToReconnect(signal: AbortSignal, delay: number): Promise<void> {
  return new Promise((resolve) => {
    const complete = () => { clearTimeout(timer); signal.removeEventListener("abort", complete); resolve(); };
    const timer = setTimeout(complete, delay);
    signal.addEventListener("abort", complete, { once: true });
  });
}

async function connect(signal: AbortSignal, cursor: () => string | undefined, receive: (message: LiveMessage) => void, state: LiveStreamCallbacks["state"]): Promise<void> {
  let delay = 250;
  while (!signal.aborted) {
    try {
      const id = cursor();
      const response = await fetch("/api/events", { signal, headers: { Accept: "text/event-stream", ...(id ? { "Last-Event-ID": id } : {}) } });
      if (response.status === 503) state("reconnecting");
      else {
        if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new LiveStreamError("Live stream was rejected.");
        let receivedMetadata = false;
        await readLiveStream(response.body, (message) => {
          if (!receivedMetadata) { state("connected"); delay = 250; receivedMetadata = true; }
          receive(message);
        });
      }
    } catch (error) {
      if (signal.aborted && networkError(error)) return;
      if (error instanceof LiveStreamError) { state("failed"); return; }
      if (!(error instanceof LiveStreamIdleError) && !networkError(error)) throw error;
    }
    if (signal.aborted) return;
    state("reconnecting");
    await waitToReconnect(signal, delay);
    delay = Math.min(delay * 2, 5000);
  }
}

export function startLiveStream(callbacks: LiveStreamCallbacks): () => void {
  if (typeof BroadcastChannel === "undefined" || !navigator.locks) { callbacks.state("failed"); return () => { }; }
  const clientId = getLiveClientId();
  const controller = new AbortController();
  const channel = new BroadcastChannel(LIVE_CHANNEL);
  let cursor = localStorage.getItem(LIVE_CURSOR_KEY) ?? undefined;
  let latest: LiveMessage | undefined;
  let leader = false;
  let state: LiveConnectionState = "connecting";
  const receive = (message: LiveMessage) => {
    if (controller.signal.aborted) return;
    const previous = latest?.value;
    if (previous?.epoch === message.value.epoch && previous.seq >= message.value.seq) return;
    latest = message;
    cursor = message.value.id;
    localStorage.setItem(LIVE_CURSOR_KEY, cursor);
    callbacks.receive(message);
  };
  const publishState = (next: LiveConnectionState) => {
    if (controller.signal.aborted) return;
    state = next;
    callbacks.state(next);
    channel.postMessage({ type: "state", value: next, source: clientId });
  };
  channel.onmessage = createLiveChannelReceiver({ channel, clientId, callbacks, receive, latest: () => latest, isLeader: () => leader, state: () => state });
  callbacks.state("connecting");
  channel.postMessage({ type: "hello", source: clientId });
  void navigator.locks.request(LIVE_CHANNEL, { signal: controller.signal }, async () => {
    leader = true;
    cursor = localStorage.getItem(LIVE_CURSOR_KEY) ?? undefined;
    try {
      await connect(controller.signal, () => cursor, (message) => {
        if (controller.signal.aborted) return;
        receive(message);
        channel.postMessage({ type: "event", message });
      }, publishState);
    } finally { leader = false; }
  }).catch((error: unknown) => {
    if (controller.signal.aborted && error instanceof DOMException && error.name === "AbortError") return;
    callbacks.state("failed");
    throw error;
  });
  return () => { controller.abort(); channel.close(); };
}

interface LiveChannelReceiver {
  channel: BroadcastChannel;
  clientId: string;
  callbacks: LiveStreamCallbacks;
  receive: (message: LiveMessage) => void;
  latest: () => LiveMessage | undefined;
  isLeader: () => boolean;
  state: () => LiveConnectionState;
}

function createLiveChannelReceiver({ channel, clientId, callbacks, receive, latest, isLeader, state }: LiveChannelReceiver) {
  return (event: MessageEvent<unknown>) => {
    if (!event.data || typeof event.data !== "object") return;
    const data = event.data as Record<string, unknown>;
    if (data.type === "hello" && isLeader()) {
      const value = latest() ? { id: latest()!.value.id, epoch: latest()!.value.epoch, seq: latest()!.value.seq } : undefined;
      channel.postMessage({ type: "welcome", target: data.source, value, state: state() });
    }
    if (data.type === "state" && ["connecting", "connected", "reconnecting", "failed"].includes(String(data.value))) callbacks.state(data.value as LiveConnectionState);
    if (data.type === "event") {
      const message = data.message as LiveMessage;
      const parsed = message?.kind === "transaction" ? liveTransactionSchema.safeParse(message.value) : liveResetSchema.safeParse(message?.value);
      if (!parsed.success || !["transaction", "reset", "ready"].includes(message?.kind)) { callbacks.state("failed"); return; }
      receive(message);
    }
    if (data.type === "welcome" && data.target === clientId) {
      const parsed = liveResetSchema.safeParse(data.value);
      if (parsed.success) receive({ kind: "ready", value: parsed.data });
      if (["connecting", "connected", "reconnecting", "failed"].includes(String(data.state))) callbacks.state(data.state as LiveConnectionState);
    }
  };
}
