# GitHub connection consent and synchronization policy

- Status: accepted
- Date: 2026-10-18
- Deciders: maintainer
- Consulted: Epic 7 preparation source/test audit

Reproducing statement: Record the six explicit maintainer decisions from Epic 7 preparation, including the required notice that an off GitHub switch continues to block normal usage after successful verification. Version: 1.

## Context and Problem Statement

Story 7.2 requires verifying GitHub before enabling its switch, but current validation and AD-15 forbid every off-switch provider call. Import currently assigns Releases immediately, contrary to the Unscheduled requirement. Read-only pulls overwrite divergent local fields. CLI login lifecycle, native Issue type ownership and bidirectional label scope were unspecified.

## Decision Drivers

- Explicit consent for outbound traffic and persisted connection/flag changes.
- Preserve local planning decisions and prevent silent overwrite.
- Reuse current Card, connection and provider boundaries with bounded scope.
- Make implementation choices consistent across all eight stories.

## Considered Options

| Decision | Chosen | Alternative |
| --- | --- | --- |
| D1 Verification while off | Explicit human verification is permitted; normal use remains blocked and the user is told so | Enable the switch before any check |
| D2 Initial import placement | Unscheduled; Release assignment only during explicit later sync | Assign Milestone/iteration Releases during import |
| D3 Read-only behavior | Forbid GitHub writes; retain ordinary local divergence/conflict protection | Treat GitHub as authoritative and overwrite local edits |
| D4 CLI login | Guided `gh auth login` in the user's own terminal, then Recheck | App-managed interactive login process |
| D5 Native Issue types | Connection-level Card-level mapping; preserve imported types | Add a GitHub type field to every Card |
| D6 Label ownership | Synchronize mapped labels; preserve unrelated remote labels | Mirror every remote label as an Annotation |

## Decision Outcome

The maintainer explicitly accepted all six chosen options in this chat on 2026-10-18, with an additional D1 notice requirement.

D1 is a narrow exception to AD-12/15 for the human connection dialog only. A direct, explicit Verify action may contact the candidate repository while `github` is off; it neither saves credentials/configuration nor enables the switch. After success the dialog says, in central English UI strings: “Connection verified. GitHub is off and blocks import, sync and push. Confirm Connect to enable GitHub.” Final Connect remains a separate explicit human action that saves the credential/configuration and enables the switch with audit. MCP, background reads, mounted status checks and ordinary import/sync/push do not inherit this exception. If the switch is already on, verification does not manufacture an off-state notice or a second enablement event.

D2 retains imported Activity/Step hierarchy and remote Milestone/type evidence but creates new Cards without Release assignment. Explicit later sync may propose Release assignment. Shared baselines must distinguish intentional initial null placement from a locally removed Release; import must not imply a future remote Milestone deletion.

D3 applies the same three-way conflict protection to read-only connections. Incoming non-conflicting values may apply; local-only edits remain unsynced and divergent fields persist as conflicts. Local-wins cannot remotely apply until the connection is writable and its Dry Run is confirmed.

D4 supplies instructions and Recheck in the app. The app does not start, supervise or store credentials for the interactive CLI login.

D5 maps Activity, Step and Story to actual repository-native Issue types in connection settings, validates availability before writes and preserves imported native type in sync metadata. Title prefixes are not type inference. Notes are excluded from outbound ownership/push.

D6 synchronizes status labels and, when `labelsAsAnnotations` is enabled, mapped Annotation labels. Unrelated remote labels survive; export/structure labels remain adapter-managed. Effective existing scoped Annotation names supply that mapping; synchronize assignments without deleting reusable definitions or auto-creating Annotations for unknown remote labels. Both adds and removals are explicit reviewed effects.

### Consequences

- AD-12/15, FR-3/26/27/28, UJ-2 and Epic 7 acceptance/detail plans must use these same rules.
- The connection dialog has a testable consent/verification/notice/confirmation sequence without an app-managed authentication process.
- Existing tests requiring Release-at-import or destructive read-only mirroring change deliberately with D2/D3; no compatibility branch preserves obsolete semantics.
- Native type mapping and label ownership live in connection/sync metadata rather than adding a GitHub-specific field to the Card aggregate.
- This decision authorizes preparation and defines future implementation behavior. It does not authorize live login, credential inspection, remote writes, or bmad-loop execution during preparation.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-18 | Accepted D1–D6 and the off-switch blocking notice |
