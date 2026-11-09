# Review: web reality check of ARCHITECTURE-SPINE.md

Date 2026-09-29. Method: npm registry JSON, official docs, `pnpm audit` on the repo lockfile, and an executed throwaway prototype (scratchpad, not in repo) on Node 24.15.0 / Windows 11 with the exact spine versions: fastify 5.2.1, @fastify/static 10.1.5, @modelcontextprotocol/sdk 1.31.0, better-sqlite3 13.0.3, drizzle-orm 0.38.4, drizzle-kit 0.30.6, zod 3.24.1.

Verdict: the stack is mostly sound and the core mechanisms work as claimed, but the spine has one version-pin mismatch (MCP SDK), pins that fail its own `pnpm audit` gate on day one, and several rules that collide with verified library behavior (VACUUM INTO vs transaction, Drizzle migrator vs "newer schema refused", UUID ids vs Last-Event-ID, JSON-only rule vs MCP DELETE and uploads).

## Verified OK (no action)

- MCP Streamable HTTP server transport exists in SDK 1.31.0 (`server/streamableHttp.js`, plus `webStandardStreamableHttp.js`). Mounted on Fastify with `reply.hijack()` then `transport.handleRequest(req.raw, reply.raw, req.body)`; a real SDK Client (`StreamableHTTPClientTransport`) initialized and called a tool through it. Stateful mode with `sessionIdGenerator` + `onsessioninitialized` Map works. Source: https://registry.npmjs.org/@modelcontextprotocol/sdk/1.31.0 and prototype.
- DNS rebinding protection is off by default: `validateRequestHeaders` returns immediately unless `enableDnsRebindingProtection` is true, and those options are marked `@deprecated: use external middleware`. A POST with `Host: evil.com` was not rejected for its host. The AD-12 claim is correct. The MCP spec says servers MUST validate Origin and answer 403 (https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), which AD-12 satisfies.
- better-sqlite3 13.0.3: engines node>=22; N-API; `prebuilds/` in the tarball holds darwin-arm64/x64, linux-arm64/x64, linuxmusl-arm64/x64, win32-arm64/x64. The win32-x64 binary loaded and ran on Node 24.15. `VACUUM INTO 'file'` and `db.backup()` both worked, also with WAL on. (macOS and Linux binaries are present but were not executed; glibc floor not verified.) Sources: https://github.com/WiseLibs/better-sqlite3/releases, npm tarball.
- Drizzle migrator: `drizzle-orm/better-sqlite3/migrator` `migrate(db, { migrationsFolder })` exists in 0.38.4 and applied a `meta/_journal.json` + `0000_name.sql` layout. (`drizzle-kit generate` itself was not run.)
- @fastify/static 10.1.5 declares plugin meta `fastify: '5.x'`, deps fastify-plugin ^6, glob ^13, no peer ranges. Registered on Fastify 5.2.1 under Node 24.15 and served a file (200).
- SSE on Fastify 5 without a plugin: `reply.hijack()` + `reply.raw.writeHead(200, text/event-stream)` + keep-alive comments worked, and `req.headers['last-event-id']` arrived.
- Repo pins match the Stack table for every row except the MCP SDK (F2). Node `engines >=24`, pnpm 9.15.4 match. `pnpm@9.15.4 audit` works against the current npm endpoint.

## Findings

### F1 (high) AD-7 vs AD-3: VACUUM INTO cannot run inside a transaction
Claimed: snapshot with `VACUUM INTO` "before every ChangeSet apply, before every migration, at the first write of an MCP session"; AD-3 puts every mutation in one transaction.
Verified: `db.transaction(() => db.exec("VACUUM INTO ..."))` throws `cannot VACUUM from within a transaction` (prototype). The Drizzle migrator also wraps itself in BEGIN, so the snapshot must precede `migrate`. SQLite docs (https://www.sqlite.org/lang_vacuum.html): the output file must not exist or be empty, and the operation is not atomic on interruption (a crash can leave a corrupt file). better-sqlite3 is synchronous, so VACUUM INTO on a large project blocks the event loop (all SSE/MCP requests); `db.backup()` is async and chunked.
Fix: state in AD-7 that the snapshot is taken outside and before the apply transaction, written to `*.tmp` then renamed, and decide VACUUM INTO (simple, blocking) vs `backup()` (non-blocking). Restore on Windows must close the connection and delete `-wal`/`-shm` sidecars before swapping the file.

### F2 (high) MCP SDK: range mismatch, v2 exists, zod floor
Claimed: `@modelcontextprotocol/sdk ^1.31.0`. Repo: `packages/mcp/package.json` has `^1.7.0` (lockfile 1.29.0). This is the only Stack row that differs from the repo.
Verified: 1.31.0 is npm `latest` (published 2026-09-28) and has non-optional peer `zod ^3.25 || ^4.0`. The repo range `zod ^3.24.1` allows 3.24.x, which violates that peer (the prototype installed 3.24.1 and reproduced it). SDK v2 is stable: `@modelcontextprotocol/server` 2.0.0 released 2026-07-27 (latest 2.2.0); a first-party `@modelcontextprotocol/fastify` 2.0.0 (peer fastify ^5.2.0) offers `hostHeaderValidation`/`localhostHostValidation`, and `@modelcontextprotocol/node` provides the Node req/res transport. The typescript-sdk repo states v1.x gets fixes "for at least 6 months after v2's release" (about late January 2027). Sources: https://github.com/modelcontextprotocol/typescript-sdk, https://registry.npmjs.org/@modelcontextprotocol/fastify.
Note: zod 3.24.1 implements Standard Schema (`~standard` present, verified), so v2 need not force a zod 4 migration.
Fix: set `packages/mcp` to `^1.31.0` and the zod floor to `^3.25.76` in Stack and repo. Add an explicit decision (AD or Deferred entry): stay on v1.31 with a dated exit to v2, or adopt v2 now. A v1.0 product on an SDK line with a roughly four-month fix window needs a stated migration trigger.

### F3 (high) Pinned versions fail the AD-19 CI gate (`pnpm audit`)
Verified on the current lockfile: 63 advisories (1 critical, 27 high, 30 moderate, 4 low). Stack-relevant:
- drizzle-orm 0.38.4: high, SQL injection via improperly escaped identifiers, fixed >=0.45.2. Caret on 0.x never leaves 0.38.x, so `pnpm update` cannot fix it; same for drizzle-kit `^0.30.1`. The Deferred list defers Drizzle majors unless "with advisories": it has one, so the deferral does not apply.
- vitest 2.1.9: critical (file read/exec when the UI server listens; UI not used) fixed >=3.2.6; a further moderate needs >=4.1.11. Vite 5.4.21 (via vitest) high, fixed only in 6.4.3+.
- @tiptap/core 2.27.2 moderate, fixed in 3.30.4; tiptap-markdown 0.9.0 requires Tiptap 3 (0.8.10 peer is @tiptap/core ^2.0.3).
- fastify 5.10.0 (find-my-way 9.6.0 high) is fixed within range: latest 5.12.5. SDK 1.29.0 pulls vulnerable hono; 1.31.0 requires hono ^4.11.4.
- Repo packages slated for removal still carry advisories: `xlsx` 0.18.5 high x2 (no fix on npm), `@xmldom/xmldom` via mammoth (8 high), `ai`.
Fix: `pnpm update` within range now (fastify, sdk); add Drizzle (0.45.2+ with drizzle-kit 0.31.x), Vitest (>=3.2.6, prefer 4.x) and Tiptap 3 to the pre-release upgrade list explicitly; define the CI audit threshold (fail on high/critical with a documented allowlist) or AD-19 blocks the first build. Remove mammoth/pdf-parse/xlsx/ai as AD-19 says.

### F4 (medium) AD-8 "newer schema refused" is not provided by the Drizzle migrator
Verified in `drizzle-orm/sqlite-core/dialect.js`: the migrator reads only the newest `created_at` from `__drizzle_migrations` and applies journal entries with a larger timestamp; no hash comparison, no detection of DB rows the journal lacks. A database written by a newer build opens silently. It runs inside `BEGIN`, so PRAGMAs (e.g. `foreign_keys`) inside migrations are no-ops (unverified for generated table rebuilds).
Fix: AD-8 must specify a custom pre-check (compare applied count/last timestamp/hashes with the journal, refuse on extra rows) before `migrate`, after the snapshot (F1). Upgrade risk: Drizzle 1.0 beta.2+ replaced `meta/_journal.json` with per-migration folders (`migration.sql` + `snapshot.json`) and requires `drizzle-kit up` first (https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v1beta2); the layout named in AD-8 changes on that upgrade. The 0.45.0 changelog listed no breaking items.

### F5 (medium) AD-10 vs conventions: UUID v4 ids cannot be a Last-Event-ID cursor
AD-10 streams Activity Event ids and resumes with `Last-Event-ID`; conventions say ids are UUID v4. Replay needs an ordered cursor (`WHERE seq > ?`). Verified the header reaches the handler; replay is application work (the MCP transport's resumability is separate and opt-in via `eventStore`).
Fix: give Activity Events an autoincrement integer used as SSE `id`; state the replay window and behavior when the id is older than retention (send a full-invalidate event). Also: hijacked SSE connections can block `app.close()` under Fastify 5's default `forceCloseConnections: 'idle'` (documented behavior, not tested), so end streams in an `onClose` hook. Browsers cap about 6 HTTP/1.1 connections per origin, so many tabs each holding an SSE stream can starve requests (low).

### F6 (medium) AD-12 "mutating requests require a JSON content type" collides with MCP and uploads
`DELETE /mcp` (session termination, spec) has no body and no content type; attachment/document upload uses `@fastify/multipart` (in repo deps, absent from the Stack table). A literal rule rejects both. Fastify also answers 415 for unsupported POST types before your hook logic can help.
Fix: scope the rule to POST/PUT/PATCH on JSON `/api` routes and exempt `DELETE /mcp` and the multipart route (still Host/Origin checked). Add `@fastify/multipart` to Stack. AD-12 also requires Host to be a loopback name with the served port, which contradicts `STORYMAPPER_ALLOW_REMOTE_HOST=true` in AD-11; define the allowed-host list for that mode.

### F7 (medium) MCP session handling implications for AD-3, AD-7, AD-11
- The MCP session id (AD-3 event field, AD-7 "first write of an MCP session") exists only in stateful mode (`sessionIdGenerator` set); stateless mode has none. The spine must say "stateful".
- SDK sessions are in memory: one `McpServer` connected to one transport per session. A server restart (including `tsx watch`) makes every client session answer 404 "Session not found" and the spec obliges clients to re-initialize; not all hosts do this gracefully. Restart also resets "first write of a session" so an extra snapshot is taken. Add idle expiry and `onsessionclosed` cleanup, and build the `McpServer` per session from a factory over the use cases (AD-2).
- AD-11 "stdio bridge holds no state" is not literally true: it keeps the `Mcp-Session-Id` and must re-initialize on 404. Use the SDK `StreamableHTTPClientTransport` + `StdioServerTransport` rather than hand-forwarding.
- SDK 1.31 depends on express, hono, @hono/node-server, cors, jose and more although only the Node transport is used; this weighs on AD-19 and produced the hono advisories in F3. Fastify `bodyLimit` (default 1 MiB) also applies to `/mcp` posts carrying large ChangeSets.

### F8 (low) @fastify/static specifics not in the spine
Compatible as verified. Not covered: default `wildcard: true` registers `GET /*`, so unknown `/api/...` paths may be answered by static handling instead of the AD-15 `{code,message}` shape; SPA client routes (TanStack Router) need a `setNotFoundHandler` fallback to `index.html` that excludes `/api` and `/mcp`. Not tested.

### F9 (low) Corepack and Node range
`engines >=24` admits Node 25+, where Corepack is no longer bundled (Node TSC decision; it stays in Node 24). AD-18 "Node 24 and Corepack are the only prerequisites" fails on Node 25/26. Fix: `engines` `^24` or document `npm i -g corepack`. Source: https://github.com/nodejs/nodejs.org/issues/7555. Node 24 moves to maintenance LTS in October 2026: fine for v1.0.

### F10 (low) Stack table omissions and stale repo docs
- In repo but not in Stack: `@fastify/cors` (unneeded under AD-11 one origin; list its removal), `@fastify/multipart`, `tsx` (server `start` runs via tsx at runtime while `main` points to `dist`), `lucide-react`, `@tiptap/starter-kit`, `@tiptap/pm`, `@vitejs/plugin-react`, `@types/better-sqlite3` (^7.6.12 against better-sqlite3 13).
- `docs/RUNBOOK.md` and AGENTS.md say better-sqlite3 must match the repo-local Node in `.cache/`. Since v13 (N-API, no `prebuild-install`, binaries shipped in the package) that reason is gone, which supports AD-18 dropping the repo-local Node. Update those docs when AD-18 lands.
- Fit of remaining technologies: html2canvas 1.4.1 has no newer release (last publish 2025-11; weak modern CSS color support, test export rendering); `@dnd-kit/sortable` ^9 (latest 10.0.0; low); `@octokit/rest` ^21 (latest 22, ESM-only; fine). Nothing named in the Stack was removed from npm or deprecated.

## Unverified in this review

`drizzle-kit generate` output for SQLite table rebuilds; native binaries executing on macOS/Linux; glibc minimum for Linux prebuilds; `forceCloseConnections` behavior with hijacked SSE; @fastify/static wildcard/404 interaction.
