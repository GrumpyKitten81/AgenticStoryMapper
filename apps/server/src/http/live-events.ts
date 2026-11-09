import type { ServerResponse } from "node:http";
import { setImmediate } from "node:timers/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { liveEventIdSchema, type LiveReset, type LiveTransaction } from "@storymapper/contracts";
import { readLiveCursor, replayLiveTransactions, type DatabaseHandle, type UnitOfWork } from "@storymapper/db";

const HEARTBEAT_MS = 15_000;
const REPLAY_PAGE_SIZE = 200;
const MAX_PENDING_BYTES = 1_048_576;

interface StreamClient {
  response: ServerResponse;
  cursor: LiveReset;
  replaying: boolean;
  pending: LiveTransaction[];
  blocked: boolean;
  output: Array<{ event: string; value: LiveTransaction | LiveReset; bytes: number }>;
  outputBytes: number;
  close: () => void;
}

function frame(event: string, value: LiveTransaction | LiveReset): string {
  return `id: ${value.id}\nevent: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
}

function advanceCursor(client: StreamClient, value: LiveTransaction | LiveReset): void {
  if (client.cursor.epoch !== value.epoch || value.seq > client.cursor.seq) client.cursor = { id: value.id, epoch: value.epoch, seq: value.seq };
}

export class LiveEventStreams {
  readonly clients = new Set<StreamClient>();
  readonly unsubscribe: Array<() => void>;

  constructor(private readonly handle: DatabaseHandle, unitOfWork: UnitOfWork) {
    this.unsubscribe = [unitOfWork.subscribe((event) => this.publish(event)), handle.subscribeReplacement(() => this.reset())];
  }

  private write(client: StreamClient, event: string, value: LiveTransaction | LiveReset): void {
    if (!this.clients.has(client)) return;
    const output = frame(event, value);
    if (client.blocked) {
      const bytes = Buffer.byteLength(output);
      if (client.output.length && client.outputBytes + bytes > MAX_PENDING_BYTES) { client.close(); return; }
      client.output.push({ event, value, bytes });
      client.outputBytes += bytes;
      advanceCursor(client, value);
      return;
    }
    client.blocked = !client.response.write(output);
    advanceCursor(client, value);
  }

  private publish(event: LiveTransaction): void {
    for (const client of this.clients) {
      if (client.replaying) {
        client.pending.push(event);
        if (client.pending.length > REPLAY_PAGE_SIZE * 5) client.close();
      } else if (event.epoch !== client.cursor.epoch || event.seq > client.cursor.seq) this.write(client, "transaction", event);
    }
  }

  private reset(): void {
    const cursor = readLiveCursor(this.handle);
    for (const client of this.clients) {
      client.pending = [];
      client.output = [];
      client.outputBytes = 0;
      client.replaying = false;
      this.write(client, "reset", cursor);
    }
  }

  async open(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const accept = request.headers.accept;
    if (!accept?.split(",").some((media) => /^text\/event-stream(?:\s*;\s*q=(?:1(?:\.0*)?|0?\.\d*[1-9]\d*))?\s*$/i.test(media.trim()))) {
      await reply.code(406).send({ code: "validation", message: "Accept must include text/event-stream." }); return;
    }
    const rawCursor = request.headers["last-event-id"];
    const parsed = rawCursor === undefined ? undefined : liveEventIdSchema.safeParse(rawCursor);
    if (parsed && !parsed.success) { await reply.code(400).send({ code: "validation", message: "Invalid Last-Event-ID." }); return; }
    const current = readLiveCursor(this.handle);
    const supplied = parsed?.success ? { ...parsed.data, id: String(rawCursor) } : undefined;
    if (supplied?.epoch === current.epoch && supplied.seq > current.seq) {
      await reply.code(400).send({ code: "validation", message: "Last-Event-ID is ahead of the database." }); return;
    }
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    reply.raw.flushHeaders();
    const client = this.createClient(reply.raw, supplied ?? current);
    if (!supplied || supplied.epoch !== current.epoch) this.write(client, supplied ? "reset" : "ready", current);
    else await this.replay(client, current);
  }

  private createClient(response: ServerResponse, cursor: LiveReset): StreamClient {
    const heartbeat = setInterval(() => {
      if (!client.blocked) client.blocked = !response.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);
    heartbeat.unref();
    const client: StreamClient = { response, cursor, replaying: false, pending: [], blocked: false, output: [], outputBytes: 0, close: () => {
      clearInterval(heartbeat); this.clients.delete(client); client.output = []; response.end();
    } };
    response.on("drain", () => {
      client.blocked = false;
      while (this.clients.has(client) && !client.blocked && client.output.length) {
        const next = client.output.shift()!;
        client.outputBytes -= next.bytes;
        this.write(client, next.event, next.value);
      }
    });
    response.once("close", client.close);
    response.once("error", client.close);
    this.clients.add(client);
    return client;
  }

  private async replay(client: StreamClient, boundary: LiveReset): Promise<void> {
    client.replaying = true;
    while (this.clients.has(client) && client.cursor.epoch === boundary.epoch && client.cursor.seq < boundary.seq) {
      const page = replayLiveTransactions(this.handle, client.cursor.seq, REPLAY_PAGE_SIZE);
      if (!page.length) { client.cursor = boundary; break; }
      for (const event of page) {
        if (event.seq > boundary.seq) {
          if (!client.pending.some((pending) => pending.seq === event.seq)) client.pending.unshift(event);
          client.cursor = boundary;
          break;
        }
        if (client.cursor.epoch !== boundary.epoch) break;
        this.write(client, "transaction", event);
        await this.waitForDrain(client);
        if (!this.clients.has(client) || client.cursor.epoch !== boundary.epoch) return;
      }
      if (client.cursor.seq < boundary.seq && page.at(-1)!.seq > boundary.seq) client.cursor = boundary;
      await setImmediate();
    }
    if (!this.clients.has(client) || client.cursor.epoch !== boundary.epoch) return;
    while (client.pending.length) {
      const event = client.pending.shift()!;
      if (event.seq > client.cursor.seq) this.write(client, "transaction", event);
      await this.waitForDrain(client);
      if (!this.clients.has(client) || client.cursor.epoch !== boundary.epoch) return;
    }
    client.replaying = false;
    this.write(client, "ready", client.cursor);
  }

  private async waitForDrain(client: StreamClient): Promise<void> {
    while (client.blocked && this.clients.has(client)) {
      await new Promise<void>((resolve) => {
        const complete = () => {
          client.response.removeListener("drain", complete);
          client.response.removeListener("close", complete);
          resolve();
        };
        client.response.once("drain", complete);
        client.response.once("close", complete);
      });
    }
  }

  close(): void {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    for (const client of this.clients) client.close();
  }
}

export function registerLiveEvents(server: FastifyInstance, handle: DatabaseHandle, unitOfWork: UnitOfWork): LiveEventStreams {
  const streams = new LiveEventStreams(handle, unitOfWork);
  server.get("/api/events", async (request, reply) => streams.open(request, reply));
  server.addHook("preClose", async () => { streams.close(); });
  return streams;
}
