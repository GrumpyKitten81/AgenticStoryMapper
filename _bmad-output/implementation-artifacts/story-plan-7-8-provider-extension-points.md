---
epic: 7
story: 8
status: ready
date: 2026-10-18
version: 1
epic_preparation: ./epic-7-preparation.md
---

# Story Plan 7.8: Provider extension points

Reproducing statement: Prepare explicit provider registration and a test-only extension exercise against the actual WorkItemProvider/credential seams, retaining GitHub behavior and the interface-only PublishProvider. Version: 1. Date: 2026-10-18.

## Intent

Make another work-item adapter addable through one contract enum, one registry and one credential registration without editing GitHub implementation/tests or shared application orchestration.

## Cross-story constraints

- Follow [Epic preparation](epic-7-preparation.md) and the concrete normalized provider methods introduced by 7.2–7.7. No speculative methods or provider framework are needed.
- GitHub remains the only shipped provider. Test-only implementation source is necessarily new; “three change points” counts production integration sites, not the provider's own module/test.
- `PublishProvider` already exists in core and remains interface-only; do not implement a publisher, plugin discovery or new outbound service.

## Design decisions (this story)

- Keep current `WorkItemProvider` seam in `packages/github/src/providers/work-item-provider.ts` and factory export path; package name does not justify a disruptive move. Document exact current paths in AD-15.
- Replace exhaustiveness-only factory/credential switches that can fall through to undefined with an explicit registry keyed by the contracts provider enum and a typed `unknown provider` refusal. Validate runtime input, not only TypeScript types.
- Provider-specific credential selection is registered through the 7.1 application seam; no provider module independently reads environment/files and no registry returns credentials publicly.
- Shared import/merge/conflict/health/remote-plan orchestration consumes normalized contracts. Remove GitHub-specific branch assumptions only where the extension exercise proves they block required behavior; GitHub wire payloads and marker/type/Milestone translation stay inside the adapter.
- A test-only provider proves validate, list/get, explicit remote plan effects/reconciliation, incoming ChangeSet and conflict flow using normalized values. No real network, no production enum member/connector surface for a fake provider and no edits to GitHub implementation/tests for this exercise.
- “Only three change points” means extending the isolated test's provider enum fixture, registry and credential registration plus supplying the new adapter module. Production enum remains `github` only. Test dependency injection uses the existing factory/application seams; no plugin loader, dynamic eval or test environment branch in product code.

## Task sequence

1. Inspect the completed 7.1–7.7 interface and its actual consumers, especially conflict preparation and health calculations. Record the normalized fields/methods they really require.
2. `packages/github/src/providers/index.ts` and credential registration in `apps/server/src/services/credentials.ts`: implement one explicit registry/lookup and typed refusal for unknown id; preserve central selection and public exports.
3. `apps/server/src/application/sync`, connector use cases, sync/conflict services and pure reports: replace residual provider-id branches with normalized adapter results only where required by the extension contract. Keep ownership/protection/confirmed-plan gates above the adapter.
4. Add an isolated test-only provider module and registration exercise. Track hashes/diff of GitHub implementation/tests before/after the exercise to prove they did not change for extension; verify required registration completeness against the enum fixture.
5. `_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md` AD-15: actual interface/registry/credential paths, three integration sites, no publisher implementation and no provider-id duplication elsewhere.
6. Run provider/credential focused tests, relevant sync/HTTP/MCP tests, capability parity, typecheck and full epic acceptance. Ensure unknown providers are rejected before any resolver/provider side effect.

## Preliminary code map

- `packages/github/src/providers/work-item-provider.ts`: actual WorkItemProvider and normalized remote item/auth/result interfaces.
- `packages/github/src/providers/index.ts`: `createWorkItemProvider`, currently a one-case switch with no explicit runtime rejection.
- `apps/server/src/services/credentials.ts`: `resolveProviderAuth`, currently another one-case switch.
- `apps/server/src/services/sync-conflict-resolution.ts`: current `provider !== github` refusal that must not survive in a shared extension flow.
- `packages/core/src/publishing/publish-provider.ts`: existing PublishTarget/Plan/Result/Provider interfaces, no implementation.
- `packages/contracts/src/schemas/domain.ts`: production provider enum; keep the test-only provider out of public shipped schemas.
- `packages/core/src/reports/sync-health.ts`, application sync and connector use cases: normalized fields and generic gates that the test adapter must exercise.

## Acceptance outline

- **Given** an unknown runtime provider id **When** requested through registry/credential lookup **Then** a typed explicit error is returned before any external effect, never undefined.
- **Given** the isolated test provider **When** it is integrated **Then** only enum fixture, registry and credential registration are integration edits, plus its own module/tests; GitHub implementation/tests and shared application orchestration stay unchanged for that exercise.
- **Given** the test provider's incoming/outgoing/conflict data **When** shared application flows run **Then** incoming writes still use ChangeSets, remote effects still require human-confirmed plans and the normal protection/ownership gates hold.
- **Given** AD-15 **When** inspected **Then** it names both actual interface files, registry and credential registration sites, and explicitly states that no publish provider ships.

## Out of scope

Production second provider, plugin framework, moving interfaces for cosmetic consistency, new account store, publisher implementation, duplicate provider enums and network-backed test adapters.

## Risks and mitigations

- A fake-only registry unit test would miss GitHub assumptions in application conflict/sync paths: exercise actual shared application consumers.
- A fake production enum value would ship an unsupported Connector: keep extension fixtures isolated and verify the production enum remains GitHub-only.
- Do not confuse initial seam cleanup in this story with extension edits: establish the normalized baseline first, then prove the test adapter needs only the three documented integration sites.

## Open questions

None. No additional provider or implementation framework is authorized.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Explicit registry and actual application extension proof |
