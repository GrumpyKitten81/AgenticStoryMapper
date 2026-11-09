# Epic 3 Context: Human and agent share one live map

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->
<!-- Reproducing statement: Compile concise Epic 3 developer context from epics, PRD, architecture and UX planning; omit story-level acceptance details and code-derived facts. Date: 2026-10-09. Version: 2. Changelog: Regenerated against current planning, including committed-event transport and interaction constraints. -->

## Goal

Let humans and coding-CLI agents work on the same local Story Map, see changes promptly and control agent access and writes. Establish shared capability implementations, maintained contracts, a single runtime writer, trustworthy audit records and concurrent editing that preserves unsaved work.

## Stories

- Story 3.1: Contracts on zod 4 and the current MCP SDK
- Story 3.2: Only the own browser may address the server
- Story 3.3: Use-case layer for Story Map data
- Story 3.4: Use-case layer for the remaining capabilities
- Story 3.5: Safety switches replace the privacy mode
- Story 3.6: `/mcp` on the app port and a stdio bridge
- Story 3.7: Complete MCP tool surface
- Story 3.8: Record every tool call
- Story 3.9: One writer, health and orderly shutdown
- Story 3.10: Live board updates
- Story 3.11: Concurrent edits never lose data silently
- Story 3.12: Persisted Product Context and templates as MCP prompts

## Requirements & Constraints

- Run locally across Windows, macOS and Linux on Node 24. No telemetry, update checks, remote assets or LLM provider; Markdown/TXT-only imports.
- Agents receive equivalents of UI data capabilities. Safety switches, credentials, ChangeSet approval/rejection, restore, manual restore points and archive import/export remain human-only. Agents may apply already human-approved ChangeSets under the permitted safety state.
- Project defaults are `agentAccess` on, `github` off and `agentProtection` off. Reject/log disabled agent calls and never contact disabled GitHub. Only humans change switches. Until Epic 4 supplies the executor, protection refuses writing tools while reads/proposals remain available. The UI explains cooperative-agent guardrails and possible forwarding to the agent's provider.
- Record every tool call, including reads and refusals, with host/session, tool, input/output hashes, outcome and affected IDs. Filter/page audit records; exports include actor/time/objects without secrets or full payloads.
- External changes reach open Views within two seconds without reload. Preserve unsaved user text during incoming changes and failed saves. Conflicting writes apply nothing and report current state, including every conflict in a bulk operation.

## Technical Decisions

- Contracts supply API/MCP/UI validation and types. Migrate once to Zod 4 and maintained MCP 2.x server/Fastify packages; preserve tool names/input schemas and capability behavior, pass typecheck/tests and introduce no high/critical advisory.
- Application use cases require `ActorContext` and read/write/human-only descriptors. Thin adapters validate, resolve actors, invoke use cases and map errors. Generate capability/MCP inventories and verify route/tool parity. Agent actors arise only on `/mcp` and `/api/mcp/call`, with host/session attribution.
- Domain computations remain pure in `core`; SQL stays in `db`. Mutations use synchronous transaction-bound repositories and the write gate, with network effects outside transactions and permission/version checks inside. Emit stream notifications only after successful commit; rolled-back work creates no notification.
- One typed error mapping serves HTTP/MCP. Unknown errors expose a generic internal error and logged identifier; multi-item external operations return individual outcomes. Source files stay within 750 lines/100 KB and functions within 50 lines.
- One process/port serves UI, API, events and stateful `/mcp`. The stdio bridge forwards through this owner. An exclusive Project lock protects writable opens; health exposes runtime/schema versions, epoch, gate state and pending migration. Shutdown stops admission, drains, closes streams, checkpoints and closes storage before removing owned runtime files.
- Validate Host and present Origin on every route. JSON is required for mutations except multipart and MCP session deletion. The event stream requires `Accept: text/event-stream`. Credentials stay outside Project data, logs, archives and events.
- Activity events gain transactional integer-autoincrement `seq`; stream IDs combine database epoch and sequence. One transaction message carries entity/type/version tuples and `originClientId`, never content. Matching-epoch reconnects replay ordered missed events; restored epochs reset/refetch Views. Use heartbeats, 100 ms invalidation coalescing and one BroadcastChannel-led stream per browser profile; no polling. The client supplies its origin ID on mutations and keeps last-seen sequence per Project for later change review.
- Story Map, Card, Release, Persona and Roadmap are versioned roots; owned children use their root version. Commands carry `baseVersion` and conflicts are atomic. Customization lists intentionally use last-write-wins. Detailed history/coalescing semantics belong to the concurrency story and require resolved intent before implementation.
- Persist Product Context/function templates and expose populated MCP prompts. Deterministic generators move into `core`; remove `packages/ai` and its unused SDK. Generated results remain ChangeSet proposals.

## UX & Interaction Patterns

- Headers show named safety pills, forwarding notice and live connection state. Pills open accessible settings with consequence text; protection uses a shield without alarm styling.
- Queue board-shape changes during dialogs, popovers, drags or focused text fields; show a waiting count and support Hold updates. Hold moves/removals of the focused tile until focus leaves; incoming changes never move focus or replace dirty fields.
- Use centralized English strings and accessible shared dialogs. Dirty-editor changes offer Reload / Keep mine; save conflicts offer Reload / Resubmit with typed text retained.
- External-change announcements name actors and counts, coalesce over a trailing window and occur at most once per five seconds; own echoes are not announced. Reconnecting remains quiet initially, with a persistent failure banner after the defined delay. Errors use the alert region.
- Actor/change markers combine text and glyphs with color; reduced motion removes pulses. Keyboard focus stays visible and updates can be held independently of focus.

## Cross-Story Dependencies

Epic 2 supplies actor-aware transactions, restore points and root versions. Contract migration precedes new transport; shared use cases precede capability parity. Existing Host/Origin rules and safety enforcement cover events/MCP. Audit and committed activity records support live updates; live updates plus resolved concurrency semantics support two-client dirty-editor behavior. Epic 4 supplies the shared ChangeSet executor and complete operation-registry parity. Later change-review views consume event sequence and actor information.
