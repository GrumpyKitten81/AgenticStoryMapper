# BMad round trip

Date: 2026-11-08. Version: 3.

Reproducing statement: Publish and refresh BMad epics, stories and sprint slices through Agentic Story Mapper's manifested generic tools, with stable scoped identities, immutable file evidence, reviewable removals and human-edit conflicts. Never modify the orchestrator's sprint-status file.

## Agent instructions

This is an optional planning-format recipe, not BMad development automation or an application startup prerequisite. Complete the [MCP connection and host checks](RUNBOOK.md#connect-codex-or-claude-code) before using it.

Use an existing human-created Project and Story Map. Read the epics file, per-story files and sprint-status file externally. Extract their explicit identifiers, titles, story text, acceptance criteria and slice membership. Stop on duplicate or ambiguous input IDs; do not infer identity from titles. Agentic Story Mapper accepts generic operations and does not parse BMad files.

Use the actual schemas in [tools](mcp-tools.md) and `packages/contracts/src/mcp/tool-inputs.ts`. Agent calls use the connected host’s MCP tools. Do not substitute domain HTTP calls, SQLite access or Project-file edits. Read responses contain `data`; `SubmitChangeSet` and `UpdateDeliveryStatus` return `changeSetId`, `changeSet`, `outcome` and `previewRef`. Check errors and outcome before proceeding. Never supply actor, approval or lifecycle fields as payload claims.

1. Call `GetSafetySettings({projectId})`, `GetStoryMapSnapshot({storyMapId})` and `GetCustomization({projectId,storyMapId})`. Agent access must be enabled. Protection means proposal creation followed by a separate human apply. Read the map's Cards, Releases, external refs and source links from the snapshot.
2. Call `ListSourceDocuments({projectId})`, then `GetSourceDocument({documentId})` for relevant existing files. Match immutable documents by Project, supported type and SHA-256 of the exact inline content. Keep old document/chunk identities; changed content is a new document.
3. Build the mapping below. Preserve explicit IDs separately from display titles. Construct one ordered cut: inline imports, Release upserts, Activity upserts, Step upserts, Story upserts, then source-link replacements. A parent or Release alias must be created by an earlier operation.
4. Call `SubmitChangeSet({projectId,title,operations,context:{projectId,storyMapId},rationale,apply:true})` for initial publication. The unprotected command auto-applies. An empty protected Project receives one complete proposal, including imports and their dependent links; it has no prerequisite source writes.
5. For refresh, include unchanged current upserts so human changes still conflict against the last publication baseline. When a current map/bmad-owned ID disappears, add an archive operation using its last `syncedVersion`, and submit the complete refresh with `apply:false`. Review and apply separately. Skip already archived missing Cards on later identical runs. Never delete missing Cards or match renumbered IDs by title.
6. Re-read the snapshot and source details after successful application. Verify hierarchy, source links, refs, descriptions and Releases. Use `ListChangeSets({projectId})` and `ListActivity({projectId})` to inspect the recorded outcome and actual actors. A proposal, sprint row or an Agent's own success claim does not establish applied state.

## Mapping and identity

This table is the explicit convention for this BMad import recipe. It does not make Epic/Feature/User Story universal aliases for Activity/Step/Story, and it does not infer a Card planning type from its row. See the [concept guide](story-map-levels-and-issues.md).

All references below have `system:"bmad"` and `scopeId:storyMapId`. The display notation `bmad:story-1.2` means separate fields `system:"bmad", externalId:"story-1.2"`.

| BMad input | Agentic Story Mapper entity | Stable externalId | Content |
|---|---|---|---|
| Epic N | Activity Card | `epic-N` | Epic name and purpose; source link to the Epic's chunk |
| Epic N | Step Card under that Activity | `step-N` | Same name as the Epic; source link to the Epic's chunk |
| Story N.M | Story Card under that Step | `story-N.M` | Story text followed by acceptance criteria and Given/When/Then scenarios; source link to its story file |
| MVP slice | Release | `release-MVP` | Explicit MVP membership |
| Sprint with stable identifier S | Release | `release-sprint-S` | Explicit sprint membership |

Keep the Release ID stable if its display name changes. Use the chosen slice ID and ordering consistently. Each Card has one Release assignment: stop on overlapping supplied membership until the intended cut is unambiguous. Assign Stories with `releaseId`; explicitly set it to null when membership is removed. Preserve current delivery status during planning refresh; send delivery changes through the status command below. Gather the whole Story text and all acceptance sections into one description, including multiple paragraphs and nested headings; a chunk boundary is not a new Story identity.

Upsert Cards with `selector:{kind:"externalRef",scopeId:storyMapId,system:"bmad",externalId}` and `after:{storyMapId,level,title,description,parentId,releaseId,position}` as applicable. Upsert Releases with the same selector shape and `after:{storyMapId,name,position}` plus supplied goal/dates. `entityId` may be a local alias for later operations; `operationId` and local `entityId` must differ. Distinct IDs with equal titles remain distinct Cards.

## Sources in the same cut

Each import has `op:"import", entity:"sourceDocument"` and `after:{projectId,title,type:"markdown",fileHash,inlineContent}`. Use the exact original content and its SHA-256; do not pass a host file path to an Agent tool. TXT is also supported.

A dependent link has `op:"link", entity:"sourceLink"` and `after:{kind:"chunk",cardId,chunk:{kind:"import",operationId,locator}}`, where `operationId` identifies the earlier import. For persisted chunks use `after:{kind:"chunk",cardId,chunkId}`. The Card ID may be an earlier publication alias.

Use the actual importer's locator rules for inline files: Markdown normalizes line endings, splits nonempty blocks on blank lines/headings outside fences, joins the heading ancestry with ` > ` and appends `#` plus the global one-based block index. A first block below `# Epic 1` has locator `Epic 1#1`; a later Acceptance block uses its actual global index. Headings inside fenced code are content. Prefer returned `GetSourceDocument` locators for persisted files; verify prepared import/chunk locators in the complete proposal preview. An unknown locator is an error.

Keep a publication record outside the product containing explicit input paths, hashes and locators, returned document/chunk IDs and the exact current source-link IDs created by this recipe. Populate it from public source/snapshot reads after successful application; do not mark proposed files as applied. Owning a document does not mean owning every link to it: preserve an independently added link even if it points into a recipe-owned document. Retain earlier immutable document associations as history. If that ownership record is unavailable, stop rather than guessing from document titles or removing another actor's evidence.

When a file changes, import the new immutable content. Unlink only the previous recipe-owned chunk link with `op:"unlink", entity:"sourceLink", entityId:linkId, after:{cardId,kind:"chunk",id:linkId}`, then link its replacement chunk. Keep unrelated manual/GitHub/source evidence. Old documents/chunks remain available as history. Identical content and identical links are no-ops. Successful composed publication advances only its addressed system's baseline to the resulting Card version, including evidence-only changes.

## Review, removals and conflicts

A removed Card uses `op:"archive", entity:"card", entityId:cardId, selector:{kind:"externalRef",scopeId:storyMapId,system:"bmad",externalId}, baseVersion:ref.syncedVersion, after:{}`. Compare only refs belonging to this map and system. Renumbering creates the new ID and proposes archiving the old one, even when titles are identical. Use the stored synced baseline, never the current human-edited version. Successful owned archive advances that addressed reference to the resulting version, so a later returning ID can upsert the same retained Card; an intervening human edit still conflicts.

The local human reviews, approves and applies through the board’s ChangeSet review controls. An Agent must not impersonate a human by calling the approval HTTP endpoints. Protection permits human application and prevents Agent application. Approval is a separate auditable action; changed selection/state needs the applicable fresh review.

Human edits after the addressed baseline produce indexed conflicts before overwriting or archiving. A conflicting cut applies no partial domain changes. Read every reported conflict and stop; do not reset refs, replace the baseline with current versions or retry with force. Resolve the intended content with the human before composing a fresh proposal.

## Suggested slices and delivery

For a BMad-supplied slice, submit typed Release upsert and Card assignment operations through `SubmitChangeSet` with explicit `apply:false` and rationale. Reuse a stable Release ref; assignments target exact current Story refs with their synced baselines. Review/apply through the human ChangeSet review controls. `ProposeReleaseSlice({storyMapId,releaseTarget:{kind:"existing",releaseId}})` is the built-in first-12-visible-Stories happy path; `{kind:"new"}` explicitly requests a new target.

Read configured method states using `GetCustomization`. If the method needs additional states, configure them first with the generic `CreateWorkflowStatus({projectId,storyMapId,name,group,position})` workflow and review when protected. Read story entries under BMad's `development_status` externally; Epic and retrospective entries are not Story delivery targets. Map their states explicitly to configured names, stopping if a mapping or configured name is missing. The recording maps `done` to `Verified` and `review` to `Review`; these are fixture choices, not universal method names. Never change sprint-status.yaml.

Call `UpdateDeliveryStatus({storyMapId,cards:[{system:"bmad",externalId:"story-N.M",status:configuredName}],apply:true})` for 1–100 unique scoped Cards. It uses one atomic ChangeSet; protection or `apply:false` stores a proposal. Verify the returned outcome, snapshot/Tracking state and Activity. `GetReleaseNotes({storyMapId,releaseId})` returns read-only Markdown grouped by Activity for visible Stories whose configured status group is done.

## Recorded acceptance

The synthetic input and reusable test-only composer live in `apps/server/src/fixtures/bmad-round-trip/`; the real HTTP/MCP scenario lives in `apps/server/src/mcp/tools/bmad-round-trip.test.ts`. Each recording has epics, per-story Markdown and an explicit slice list in `sprint.txt`. `development-status.txt` records representative BMad YAML entries without using the orchestrator-owned filename; `status-mapping.json` records their configured delivery mapping. The tests cover 6 epics/34 Stories, multiline acceptance criteria, protected equivalence, no-op publication, two edits/one removal/one addition, exact evidence replacement, identity isolation, returning archived IDs, delayed human conflicts and planning refresh after delivery. These are acceptance fixtures for Story 4.13, not user research. The source guard checks production TypeScript and JavaScript in `packages`/`apps` for BMad-specific parsing outside tests/fixtures/docs.

## Changelog

- Version 3 (2026-11-08): Require the initial MCP connection, remove domain HTTP as an Agent alternative, and distinguish recipe-specific mapping from structural levels and planning types.

- Version 2 (2026-10-12): Review clarified complete multiline content, singular slice assignments, returning archived identities and external BMad status interpretation with configured public mapping.
- Version 1 (2026-10-12): Initial manifested-tool publication, source, refresh, human review and delivery recipe with recorded acceptance paths.
