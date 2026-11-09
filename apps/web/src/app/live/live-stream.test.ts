import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { startLiveStream } from "@storymapper/web/app/live/live-stream";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";

let stop: (() => void) | undefined;
const stops: Array<() => void> = [];
afterEach(async () => { stop?.(); stop = undefined; stops.splice(0).forEach((close) => close()); await Promise.resolve(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function serializedLocks() {
  interface WaitingLock { signal: AbortSignal; callback: () => Promise<void>; resolve: () => void; reject: (error: unknown) => void; abort: () => void }
  const queue: WaitingLock[] = [];
  let held = false;
  const grant = () => {
    if (held) return;
    const next = queue.shift();
    if (!next) return;
    next.signal.removeEventListener("abort", next.abort);
    held = true;
    void Promise.resolve().then(next.callback).then(() => {
      held = false; next.resolve(); grant();
    }, (error: unknown) => { held = false; next.reject(error); grant(); });
  };
  return { request: (_name: string, { signal }: { signal: AbortSignal }, callback: () => Promise<void>) => new Promise<void>((resolve, reject) => {
    const next: WaitingLock = { signal, callback, resolve, reject, abort: () => {
      const index = queue.indexOf(next);
      if (index >= 0) queue.splice(index, 1);
      reject(new DOMException("Canceled queued leader", "AbortError"));
    } };
    if (signal.aborted) { next.abort(); return; }
    queue.push(next);
    signal.addEventListener("abort", next.abort, { once: true });
    grant();
  }) };
}

it("resumes with the shared cursor and refuses stale or duplicate follower welcomes", async () => {
  const epoch = randomUUID();
  const stored = new Map([["storymapper-live-stream-cursor", `${epoch}:1`]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
  let channel: FakeChannel | undefined;
  class FakeChannel {
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    constructor() { channel = this; }
    postMessage() {}
    close() {}
  }
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, callback: () => Promise<void>) => callback() } });
  let headers: Headers | undefined;
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    headers = new Headers(init.headers);
    const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; init.signal?.addEventListener("abort", () => controller.close(), { once: true }); } });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  }));
  const receive = vi.fn();
  stop = startLiveStream({ receive, state: vi.fn() });
  expect(headers!.get("Last-Event-ID")).toBe(`${epoch}:1`);
  const ready = { epoch, seq: 2, id: `${epoch}:2` };
  stream!.enqueue(new TextEncoder().encode(`event: ready\nid: ${ready.id}\ndata: ${JSON.stringify(ready)}\n\n`));
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  const welcome = (seq: number) => channel!.onmessage!({ data: { type: "welcome", target: getLiveClientId(), value: { epoch, seq, id: `${epoch}:${seq}` }, state: "connected" } } as MessageEvent);
  welcome(1);
  welcome(2);
  expect(stored.get("storymapper-live-stream-cursor")).toBe(`${epoch}:2`);
  expect(receive).toHaveBeenCalledOnce();
  welcome(3);
  expect(receive).toHaveBeenCalledTimes(2);
  expect(stored.get("storymapper-live-stream-cursor")).toBe(`${epoch}:3`);
});

it("backs off empty200 streams to5s without reporting connected until validated metadata arrives", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; postMessage() {} close() {} });
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, callback: () => Promise<void>) => callback() } });
  const epoch = randomUUID();
  const ready = { epoch, seq: 0, id: `${epoch}:0` };
  let validNext = false;
  const request = vi.fn(async (_path: string, init: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      if (!validNext) { controller.close(); return; }
      controller.enqueue(new TextEncoder().encode(`event: ready\nid: ${ready.id}\ndata: ${JSON.stringify(ready)}\n\n`));
      init.signal?.addEventListener("abort", () => controller.close(), { once: true });
    } });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  vi.stubGlobal("fetch", request);
  const state = vi.fn();
  const receive = vi.fn();
  stop = startLiveStream({ receive, state });
  await vi.advanceTimersByTimeAsync(0);
  let attempts = 1;
  for (const delay of [250, 500, 1000, 2000, 4000, 5000, 5000]) {
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(request).toHaveBeenCalledTimes(attempts);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(++attempts);
    expect(state.mock.calls.some(([value]) => value === "connected")).toBe(false);
  }
  expect(receive).not.toHaveBeenCalled();
  expect(state).toHaveBeenLastCalledWith("reconnecting");
  validNext = true;
  await vi.advanceTimersByTimeAsync(5000);
  expect(state.mock.calls.filter(([value]) => value === "connected")).toHaveLength(1);
  expect(receive).toHaveBeenCalledWith({ kind: "ready", value: ready });
});

it("relays between independent tabs and relinquishes terminal leadership before later bootstrap and shutdown handoff", async () => {
  const stored = new Map<string, string>();
  const posts = exerciseRelaysBetweenIndependentTabsAndRelinquishesTerminalLeadershipBefore2(stored);
  const sockets: Array<{ controller: ReadableStreamDefaultController<Uint8Array>; closed: boolean; headers: Headers }> = [];
  let active = 0;
  let maximum = 0;
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    const socket = { controller: undefined as unknown as ReadableStreamDefaultController<Uint8Array>, closed: false, headers: new Headers(init.headers) };
    const finish = () => { if (!socket.closed) { socket.closed = true; active -= 1; init.signal?.removeEventListener("abort", abort); } };
    const abort = () => { if (!socket.closed) { socket.controller.close(); finish(); } };
    const body = new ReadableStream<Uint8Array>({ start(controller) { socket.controller = controller; }, cancel: finish });
    init.signal?.addEventListener("abort", abort, { once: true });
    sockets.push(socket);
    active += 1;
    maximum = Math.max(maximum, active);
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  }));
  const receiveFirst = vi.fn();
  const receiveSecond = vi.fn();
  const receiveLate = vi.fn();
  const startTab = async (receive: Parameters<typeof startLiveStream>[0]["receive"]) => {
    vi.resetModules();
    const tab = await import("@storymapper/web/app/live/live-stream");
    const close = tab.startLiveStream({ receive, state: vi.fn() });
    stops.push(close);
    return close;
  };
  const epoch = randomUUID();
  const sendReady = (socket: number, seq: number) => {
    const value = { epoch, seq, id: `${epoch}:${seq}` };
    sockets[socket]!.controller.enqueue(new TextEncoder().encode(`event: ready\nid: ${value.id}\ndata: ${JSON.stringify(value)}\n\n`));
  };
  await startTab(receiveFirst);
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  sendReady(0, 1);
  await vi.waitFor(() => expect(receiveFirst).toHaveBeenCalledOnce());
  const stopSecond = await startTab(receiveSecond);
  await exerciseRelaysBetweenIndependentTabsAndRelinquishesTerminalLeadershipBefore(receiveSecond, epoch, sockets, sendReady, posts, startTab, receiveLate, stopSecond);
  const transaction = { epoch, seq: 3, id: `${epoch}:3`, actor: { actorType: "agent", actorId: "Claude Code" }, originClientId: null,
    entities: [{ entityType: "card", entityId: randomUUID(), version: 3, projectId: randomUUID() }] };
  sockets[2]!.controller.enqueue(new TextEncoder().encode(`event: transaction\nid: ${transaction.id}\ndata: ${JSON.stringify(transaction)}\n\n`));
  await vi.waitFor(() => expect(receiveFirst).toHaveBeenLastCalledWith({ kind: "transaction", value: transaction }));
  expect(receiveLate).toHaveBeenLastCalledWith({ kind: "transaction", value: transaction });
  expect(active).toBe(1);
  expect(maximum).toBe(1);
});

function exerciseRelaysBetweenIndependentTabsAndRelinquishesTerminalLeadershipBefore2(stored: Map<string, string>) {
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
  const channels = new Set<TestChannel>();
  const posts: Array<{ sender: TestChannel; message: unknown; }> = [];
  class TestChannel {
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    closed = false;
    constructor() { channels.add(this); }
    postMessage(message: unknown) {
      if (this.closed) throw new DOMException("Closed channel", "InvalidStateError");
      posts.push({ sender: this, message });
      for (const peer of channels) if (peer !== this) queueMicrotask(() => {
        if (!peer.closed) peer.onmessage?.({ data: structuredClone(message) } as MessageEvent);
      });
    }
    close() { this.closed = true; channels.delete(this); }
  }
  vi.stubGlobal("BroadcastChannel", TestChannel);
  vi.stubGlobal("navigator", { locks: serializedLocks() });
  return posts;
}

async function exerciseRelaysBetweenIndependentTabsAndRelinquishesTerminalLeadershipBefore(receiveSecond: Parameters<typeof startLiveStream>[0]["receive"], epoch: string, sockets: { controller: ReadableStreamDefaultController<Uint8Array>; closed: boolean; headers: Headers; }[], sendReady: (socket: number, seq: number) => void, posts: { message: unknown; }[], startTab: (receive: Parameters<typeof startLiveStream>[0]["receive"]) => Promise<() => void>, receiveLate: Parameters<typeof startLiveStream>[0]["receive"], stopSecond: () => void) {
  await vi.waitFor(() => expect(receiveSecond).toHaveBeenCalledWith({ kind: "ready", value: { epoch, seq: 1, id: `${epoch}:1` } }));
  expect(sockets).toHaveLength(1);
  sockets[0]!.controller.enqueue(new TextEncoder().encode("event: transaction\ndata: {}\n\n"));
  await vi.waitFor(() => expect(sockets).toHaveLength(2));
  expect(sockets[0]!.closed).toBe(true);
  expect(sockets[1]!.headers.get("Last-Event-ID")).toBe(`${epoch}:1`);
  sendReady(1, 2);
  await vi.waitFor(() => expect(receiveSecond).toHaveBeenLastCalledWith({ kind: "ready", value: { epoch, seq: 2, id: `${epoch}:2` } }));
  const beforeJoin = posts.length;
  await startTab(receiveLate);
  await vi.waitFor(() => expect(receiveLate).toHaveBeenCalledWith({ kind: "ready", value: { epoch, seq: 2, id: `${epoch}:2` } }));
  const welcomes = posts.slice(beforeJoin).filter(({ message }) => (message as { type: string; }).type === "welcome");
  expect(welcomes).toHaveLength(1);
  expect(sockets).toHaveLength(2);
  stopSecond();
  await vi.waitFor(() => expect(sockets).toHaveLength(3));
  expect(sockets[2]!.headers.get("Last-Event-ID")).toBe(`${epoch}:2`);
  sendReady(2, 2);
}
