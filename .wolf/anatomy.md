# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-10-30T23:57:21.054Z
> Files: 1179 tracked | Anatomy hits: 0 | Misses: 0

> Project structure index. Auto-maintained by OpenWolf hooks and daemon.
> Run `openwolf scan` to generate, or wait for the first Claude Code session.
> Status: Pending initial scan

## ./

- `.gitattributes` — Git attributes (~6 tok)
- `.gitignore` — Git ignore rules (~121 tok)
- `.mcp.json` (~46 tok)
- `AGENTS.md` — Instruction hierarchy (~2170 tok)
- `CLAUDE.md` — OpenWolf (~229 tok)
- `CODE_OF_CONDUCT.md` — Code of conduct (~688 tok)
- `CONTRIBUTING.md` — Contributing to StoryMapper (~2254 tok)
- `LICENSE` — Project license (~287 tok)
- `opencode.jsonc` (~61 tok)
- `package.json` — Node.js package manifest (~414 tok)
- `pnpm-workspace.yaml` (~12 tok)
- `publication-audit.json` (~262390 tok)
- `README.md` — Project documentation (~2312 tok)
- `SECURITY.md` — Security policy (~616 tok)
- `tsconfig.base.json` (~349 tok)

## .agents/skills/bmad-build-auto/

- `step-01-clarify-and-route.md` — Step 1: Clarify and Route (~3327 tok)
- `step-02-plan.md` — Step 2: Plan (~961 tok)

## .bmad-loop/

- `claude-unattended.settings.json` (~13 tok)
- `policy.codex.toml` — bmad-loop orchestration policy. All keys optional; defaults shown. (~4439 tok)
- `policy.macci.bak` — bmad-loop orchestration policy. All keys optional; defaults shown. (~4335 tok)
- `policy.opencode.toml` — bmad-loop orchestration policy. All keys optional; defaults shown. (~4348 tok)
- `policy.toml` — bmad-loop orchestration policy. All keys optional; defaults shown. (~4335 tok)
- `supervision-current-run.json` (~106 tok)

## .claude/skills/bmad-build-auto/

- `step-01-clarify-and-route.md` — Step 1: Clarify and Route (~3327 tok)
- `step-02-plan.md` — Step 2: Plan (~961 tok)

## .claude/skills/bmad-prepare-epic/

- `SKILL.md` (~143 tok)
- `workflow.md` — Prepare Epic Workflow (~654 tok)

## .claude/skills/bmad-prepare-epic/assets/

- `epic-preparation-template.md` — Epic {N} Preparation: {Title} (~229 tok)
- `story-plan-template.md` — Story Plan {epic}.{story}: {Title} (~196 tok)

## .github/ISSUE_TEMPLATE/

- `01-feature.yml` (~1120 tok)
- `02-bug.yml` (~1564 tok)
- `03-epic.yml` (~942 tok)
- `04-story.yml` (~1522 tok)
- `05-task.yml` (~265 tok)
- `06-spike.yml` (~935 tok)
- `07-theme.yml` (~252 tok)
- `config.yml` (~8 tok)

## .github/agents/

- `bmad-agent-analyst.agent.md` (~77 tok)
- `bmad-agent-architect.agent.md` (~68 tok)
- `bmad-agent-dev.agent.md` (~73 tok)
- `bmad-agent-pm.agent.md` (~71 tok)
- `bmad-agent-ux-designer.agent.md` (~65 tok)

## .rtk/

- `filters.toml` — Project-local RTK filters — commit this file with your repo. (~178 tok)

## _bmad-output/implementation-artifacts/

- `bmad-build-auto-result-4-5-operation-registry-for-the-remaining-objects.md` — BMad Build Auto Result (~483 tok)
- `deferred-work.md` — ## DW-1: Existing linked sentences retain component-level word order; translating into a language that requires moving the link would require adjus... (~22292 tok)
- `epic-1-context.md` — Epic 1 Context: Run anywhere, in English (~1561 tok)
- `epic-2-context.md` — Epic 2 Context: Project data you can trust (~1856 tok)
- `epic-3-context.md` — Epic 3 Context: Human and agent share one live map (~1802 tok)
- `epic-3-retro-2026-10-10.md` — Epic 3 Retrospective: Human and agent share one live map (~7082 tok)
- `epic-4-context.md` — Epic 4 Context: Agents cut and publish, humans review (~1832 tok)
- `epic-4-preparation.md` — Epic 4 Preparation: Agents cut and publish, humans review (~4516 tok)
- `epic-4-retro-2026-10-17.md` — Epic 4 retrospective (~6130 tok)
- `epic-5-context.md` — Epic 5 Context: See and judge the cut (~1972 tok)
- `epic-5-preparation.md` — Epic 5 Preparation: See and judge the cut (~2971 tok)
- `epic-5-retro-2026-10-16.md` — Epic 5 completion and retrospective (~4950 tok)
- `epic-6-context.md` — Epic 6 Context: Everyday board work (~1812 tok)
- `epic-6-preparation.md` — Epic 6 Preparation: Everyday board work (~5480 tok)
- `epic-6-retro-2026-10-17.md` — Epic 6 retrospective — Complete editing and core views (~8126 tok)
- `epic-7-context.md` — Epic 7 Context: Plan with GitHub (~1783 tok)
- `epic-7-preparation.md` — Epic 7 Preparation: Plan with GitHub (~6444 tok)
- `epic-7-retro-2026-10-19.md` — Epic 7 retrospective — Plan with GitHub (~7167 tok)
- `epic-8-context.md` — Epic 8 Context: Ready for the public (~1704 tok)
- `epic-8-preparation.md` — Epic 8 Preparation: Ready for the public (~5114 tok)
- `evidence-3-10-browser.json` (~409 tok)
- `evidence-3-8-browser.json` (~398 tok)
- `plan-3-4-use-case-layer-handoff.md` — Handoff-Plan: Story 3.4 — Use-case layer for the remaining capabilities (~2939 tok)
- `report-3-4-implementation-blockers.md` — Report: Wo die Umsetzung von Story 3.4 hängt (~1656 tok)
- `review-3-8-independent-md.json` (~1600 tok)
- `review-3-8-pass-1-preserved.patch` — Exports listActivity (~27713 tok)
- `review-3-9-pass-1-preserved.patch` (~43855 tok)
- `review-3-9-pass-2-preserved.patch` (~49412 tok)
- `spec-1-1-english-ui-from-one-string-module.md` — Intent (~10651 tok)
- `spec-1-2-serve-the-app-under-one-url.md` — Intent (~8038 tok)
- `spec-1-3-one-command-to-set-up-and-start-on-any-system.md` — Intent (~7999 tok)
- `spec-1-4-understandable-failures-and-a-doctor-command.md` — Intent (~11647 tok)
- `spec-1-5-sample-map-and-getting-started-checklist.md` — Intent (~13352 tok)
- `spec-1-6-verified-baseline-for-the-board-requirements.md` — Intent (~5009 tok)
- `spec-2-1-all-or-nothing-changes-attributed-to-an-actor.md` — Intent (~10003 tok)
- `spec-2-2-create-and-list-restore-points.md` — Intent (~7647 tok)
- `spec-2-3-version-counters-on-every-editable-root.md` — Intent (~7224 tok)
- `spec-2-4-read-a-card-s-history.md` — Intent (~6400 tok)
- `spec-2-5-park-archive-and-delete-as-separate-actions.md` — Intent (~8539 tok)
- `spec-2-6-restore-the-project-to-a-restore-point.md` — Intent (~7736 tok)
- `spec-2-7-portable-project-archive.md` — Intent (~6621 tok)
- `spec-3-1-contracts-on-zod-4-and-the-current-mcp-sdk.md` — Intent (~12577 tok)
- `spec-3-10-live-board-updates.md` — Intent (~10249 tok)
- `spec-3-11-concurrent-edits-never-lose-data-silently.md` — Intent (~3161 tok)
- `spec-3-12-persisted-product-context-and-templates-as-mcp-prompts.md` — Intent (~9515 tok)
- `spec-3-2-only-the-own-browser-may-address-the-server.md` — Intent (~4287 tok)
- `spec-3-3-use-case-layer-for-story-map-data.md` — Summary (~912 tok)
- `spec-3-4-use-case-layer-for-the-remaining-capabilities.md` — Intent (~8286 tok)
- `spec-3-5-safety-switches-replace-the-privacy-mode.md` — Completion notes (~443 tok)
- `spec-3-6-mcp-on-the-app-port-and-a-stdio-bridge.md` — Intent (~6274 tok)
- `spec-3-7-complete-mcp-tool-surface-intent-gap.patch` — Exports listAiTemplatesDescriptor (~59421 tok)
- `spec-3-7-complete-mcp-tool-surface.md` — Intent (~19477 tok)
- `spec-3-8-record-every-tool-call.md` — Intent (~16233 tok)
- `spec-3-9-one-writer-health-and-orderly-shutdown.md` — Intent (~15833 tok)
- `spec-4-1-import-markdown-and-txt-sources-with-stable-chunks.md` — Intent (~4877 tok)
- `spec-4-10-slicing-proposals-and-release-notes.md` — Intent (~6422 tok)
- `spec-4-11-delivery-status-from-agents.md` — Story 4.11: Delivery status from Agents (~5895 tok)
- `spec-4-12-the-bmad-round-trip.md` — Intent (~6802 tok)
- `spec-4-13-validation-gate-with-five-bmad-users.md` — Current disposition — externally verified completion, 2026-10-16 (~6790 tok)
- `spec-4-2-provenance-on-every-card.md` — Intent (~7349 tok)
- `spec-4-3-external-references-on-cards-releases-and-personas.md` — Intent (~6024 tok)
- `spec-4-4-operation-registry-for-the-core-objects.md` — Intent (~6870 tok)
- `spec-4-5-operation-registry-for-the-remaining-objects.md` — Intent (~8835 tok)
- `spec-4-6-changeset-executor.md` — Intent (~12419 tok)
- `spec-4-7-writing-agent-tools-run-through-changesets.md` — Intent (~10225 tok)
- `spec-4-8-an-agent-submits-its-own-changeset.md` — Intent (~8313 tok)
- `spec-4-9-preview-a-changeset-on-the-board.md` — Intent (~5736 tok)
- `spec-5-1-dependencies-between-cards.md` — Story 5.1: Dependencies between Cards (~19468 tok)
- `spec-5-2-slices-view.md` — Story 5.2: Slices view (~8930 tok)
- `spec-5-3-dependency-graph-view.md` — Story 5.3: Dependency graph view (~8423 tok)
- `spec-5-4-what-changed-since-i-looked.md` — Story 5.4: What changed since I looked (~8200 tok)
- `spec-5-5-plan-drift-report.md` — Story 5.5: Plan drift report (~11719 tok)
- `spec-6-1-every-function-reachable-and-addressable.md` — Intent (~5364 tok)
- `spec-6-10-performance-and-accessibility-budgets.md` — Intent (~7104 tok)
- `spec-6-2-create-and-edit-cards.md` — Intent (~9080 tok)
- `spec-6-3-move-cards-by-mouse-keyboard-or-form.md` — Intent (~7917 tok)
- `spec-6-4-search-filter-and-bulk-actions.md` — Intent (~6896 tok)
- `spec-6-5-collapse-card-keys-and-notes.md` — Intent (~6028 tok)
- `spec-6-6-the-five-core-views.md` — Intent (~6915 tok)
- `spec-6-7-card-detail-as-a-deep-linkable-modal.md` — Intent (~7996 tok)
- `spec-6-8-manage-personas-annotations-statuses-and-templates.md` — Intent (~7713 tok)
- `spec-6-9-manage-releases-and-read-their-summary.md` — Intent (~6251 tok)
- `spec-7-2-connect-github-in-the-app.md` — Intent (~7402 tok)
- `spec-7-3-github-identity-in-external-references.md` — Intent (~8406 tok)
- `spec-7-4-push-with-a-mandatory-dry-run.md` — Intent (~8950 tok)
- `spec-7-5-import-and-sync.md` — Intent (~13077 tok)
- `spec-7-6-conflicts-and-sync-health.md` — Intent (~9478 tok)
- `spec-7-7-import-a-single-ticket-while-creating-a-card.md` — Intent (~6417 tok)
- `spec-7-8-provider-extension-points.md` — Intent (~6922 tok)
- `spec-8-1-baseline-migration-and-upgrade-path.md` — Story 8.1: Baseline migration and upgrade path (~8232 tok)
- `spec-8-2-dependency-upgrade-wave.md` — Story 8.2: Dependency upgrade wave (~9378 tok)
- `spec-8-3-quality-gate-scripts.md` — Story 8.3: Quality gate scripts (~9996 tok)
- `spec-8-4-continuous-integration-on-three-operating-systems.md` — Story 8.4 (~5466 tok)
- `spec-8-5-license-and-community-files.md` — Story 8.5 (~4982 tok)
- `spec-8-6-public-documentation-in-english.md` — Story 8.6: Public documentation in English (~7036 tok)
- `spec-8-7-audit-of-content-and-tooling.md` — Story 8.7: Audit of content and tooling (~12713 tok)
- `spec-8-8-versioned-releases.md` — Story 8.8: Versioned releases (~5883 tok)
- `spec-8-9-agentic-coding-reference-material.md` — Story 8.9: Agentic-coding reference material (~11835 tok)
- `spec-epic-3-retro-findings-remediation.md` — Intent (~3350 tok)
- `spec-epic-4-retro-remediation.md` — Intent (~4227 tok)
- `spec-epic-6-retro-remediation.md` — Intent (~2436 tok)
- `spec-epic-7-retro-blockers.md` — Intent (~3362 tok)
- `spec-orchestrator-epic-4-5-completion-reconciliation.md` — Intent (~2483 tok)
- `sprint-status.yaml` — STATUS DEFINITIONS: (~5034 tok)
- `story-plan-4-1-import-markdown-and-txt-sources-with-stable-chunks.md` — Story Plan 4.1: Import Markdown and TXT sources with stable chunks (~1347 tok)
- `story-plan-4-10-slicing-proposals-and-release-notes.md` — Story Plan 4.10: Slicing proposals and release notes (~1406 tok)
- `story-plan-4-11-delivery-status-from-agents.md` — Story Plan 4.11: Delivery status from Agents (~1305 tok)
- `story-plan-4-12-the-bmad-round-trip.md` — Story Plan 4.12: The BMad round trip (~1723 tok)
- `story-plan-4-13-validation-gate-with-five-bmad-users.md` — Story Plan 4.13: Validation gate with five BMad users (~1576 tok)
- `story-plan-4-2-provenance-on-every-card.md` — Story Plan 4.2: Provenance on every Card (~1223 tok)
- `story-plan-4-3-external-references-on-cards-releases-and-personas.md` — Story Plan 4.3: External references on Cards, Releases and Personas (~1259 tok)
- `story-plan-4-4-operation-registry-for-the-core-objects.md` — Story Plan 4.4: Operation registry for the core objects (~1373 tok)
- `story-plan-4-5-operation-registry-for-the-remaining-objects.md` — Story Plan 4.5: Operation registry for the remaining objects (~1825 tok)
- `story-plan-4-6-changeset-executor.md` — Story Plan 4.6: ChangeSet executor (~1971 tok)
- `story-plan-4-7-writing-agent-tools-run-through-changesets.md` — Story Plan 4.7: Writing agent tools run through ChangeSets (~1692 tok)
- `story-plan-4-8-an-agent-submits-its-own-changeset.md` — Story Plan 4.8: An Agent submits its own ChangeSet (~1480 tok)
- `story-plan-4-9-preview-a-changeset-on-the-board.md` — Story Plan 4.9: Preview a ChangeSet on the board (~1619 tok)
- `story-plan-5-1-dependencies-between-cards.md` — Story Plan 5.1: Dependencies between Cards (~1490 tok)
- `story-plan-5-2-slices-view.md` — Story Plan 5.2: Slices view (~2118 tok)
- `story-plan-5-3-dependency-graph-view.md` — Story Plan 5.3: Dependency graph view (~1332 tok)
- `story-plan-5-4-what-changed-since-i-looked.md` — Story Plan 5.4: What changed since I looked (~1656 tok)
- `story-plan-5-5-plan-drift-report.md` — Story Plan 5.5: Plan drift report (~2075 tok)
- `story-plan-6-1-every-function-reachable-and-addressable.md` — Story Plan 6.1: Every function reachable and addressable (~1308 tok)
- `story-plan-6-10-performance-and-accessibility-budgets.md` — Story Plan 6.10: Performance and accessibility budgets (~1950 tok)
- `story-plan-6-2-create-and-edit-cards.md` — Story Plan 6.2: Create and edit Cards (~1471 tok)
- `story-plan-6-3-move-cards-by-mouse-keyboard-or-form.md` — Story Plan 6.3: Move Cards by mouse, keyboard or form (~1761 tok)
- `story-plan-6-4-search-filter-and-bulk-actions.md` — Story Plan 6.4: Search, filter and bulk actions (~1597 tok)
- `story-plan-6-5-collapse-card-keys-and-notes.md` — Story Plan 6.5: Collapse, Card Keys and Notes (~1340 tok)
- `story-plan-6-6-the-five-core-views.md` — Story Plan 6.6: The five core Views (~1487 tok)
- `story-plan-6-7-card-detail-as-a-deep-linkable-modal.md` — Story Plan 6.7: Card detail as a deep-linkable modal (~1348 tok)
- `story-plan-6-8-manage-personas-annotations-statuses-and-templates.md` — Story Plan 6.8: Manage Personas, Annotations, Statuses and Templates (~1532 tok)
- `story-plan-6-9-manage-releases-and-read-their-summary.md` — Story Plan 6.9: Manage Releases and read their summary (~1453 tok)
- `story-plan-7-2-connect-github-in-the-app.md` — Story Plan 7.2: Connect GitHub in the app (~1752 tok)
- `story-plan-7-3-github-identity-in-external-references.md` — Story Plan 7.3: GitHub identity in external references (~2221 tok)
- `story-plan-7-4-push-with-a-mandatory-dry-run.md` — Story Plan 7.4: Push with a mandatory Dry Run (~2135 tok)
- `story-plan-7-5-import-and-sync.md` — Story Plan 7.5: Import and sync (~2275 tok)
- `story-plan-7-6-conflicts-and-sync-health.md` — Story Plan 7.6: Conflicts and Sync Health (~1997 tok)
- `story-plan-7-7-import-a-single-ticket-while-creating-a-card.md` — Story Plan 7.7: Import a single ticket while creating a Card (~1886 tok)
- `story-plan-7-8-provider-extension-points.md` — Story Plan 7.8: Provider extension points (~1765 tok)
- `story-plan-8-1-baseline-migration-and-upgrade-path.md` — Story Plan 8.1: Baseline migration and upgrade path (~2172 tok)
- `story-plan-8-2-dependency-upgrade-wave.md` — Story Plan 8.2: Dependency upgrade wave (~1717 tok)
- `story-plan-8-3-quality-gate-scripts.md` — Story Plan 8.3: Quality gate scripts (~1862 tok)
- `story-plan-8-4-continuous-integration-on-three-operating-systems.md` — Story Plan 8.4: Continuous integration on three operating systems (~1253 tok)
- `story-plan-8-5-license-and-community-files.md` — Story Plan 8.5: License and community files (~1270 tok)
- `story-plan-8-6-public-documentation-in-english.md` — Story Plan 8.6: Public documentation in English (~1358 tok)
- `story-plan-8-7-audit-of-content-and-tooling.md` — Story Plan 8.7: Audit of content and tooling (~1824 tok)
- `story-plan-8-8-versioned-releases.md` — Story Plan 8.8: Versioned releases (~1566 tok)
- `story-plan-8-9-agentic-coding-reference-material.md` — Story Plan 8.9: Agentic-coding reference material (~1571 tok)

## _bmad-output/implementation-artifacts/evidence/

- `epic-4-5-orchestrator-reconciliation-20261016.json` (~6268 tok)
- `epic-4-5-reconciliation-check-20261016.json` (~21118 tok)
- `epic-4-5-reconciliation-check.py` — sha, object_sha, command, git + 10 more (~3149 tok)
- `epic-4-behavior-20261017.json` (~1361 tok)
- `epic-4-git-evidence-20261017.json` (~21622 tok)
- `epic-4-proposed-actions-20261017.json` (~754 tok)
- `epic-4-prototype-operation-probe.ts` — Declares operation (~462 tok)
- `epic-4-prototype-operation-result-20261017.json` (~68 tok)
- `epic-4-review-20261017.json` — Declares object (~3719 tok)
- `epic-4-status-evidence-20261017.json` (~2015 tok)
- `epic-5-git-evidence-2026-10-16.json` (~9450 tok)
- `epic-5-review-2026-10-16.json` (~1730 tok)
- `epic-5-status-evidence-2026-10-16.json` (~533 tok)
- `story-4-13-current-verification-20261016.json` (~926 tok)
- `story-4-13-independent-audit-20261016.json` (~32961 tok)
- `story-4-13-independent-audit.py` — require, extract_and_verify, verify_manifest_coverage, verified_results + 11 more (~4479 tok)
- `story-4-13-synthetic-evidence.tar.gz.sha256` (~28 tok)
- `story-5-1-redispatch-20261014-proof.json` (~1018 tok)
- `story-5-1-resume-browser-proof.json` (~849 tok)
- `story-5-2-browser.json` (~3084 tok)
- `story-5-2-operator-browser.json` (~2326 tok)
- `story-5-3-browser.json` (~10969 tok)
- `story-5-3-operator-browser.json` (~2829 tok)
- `story-5-4-browser.json` (~2972 tok)
- `story-5-4-operator-browser.json` (~3246 tok)
- `story-5-5-browser.json` (~7704 tok)

## _bmad-output/implementation-artifacts/evidence/epic-4-remediation/

- `a1-core.log` (~142 tok)
- `a1-db.log` (~148 tok)
- `a1-guard-core.log` (~84 tok)
- `a1-guard-http.log` (~83 tok)
- `a1-guard-types.log` (~75 tok)
- `a1-http.log` (~83 tok)
- `a1-types.log` (~75 tok)
- `a1.json` (~182 tok)
- `a2-executor.log` (~84 tok)
- `a2-permissions.log` (~88 tok)
- `a2-preview.log` (~83 tok)
- `a2-types.log` (~33 tok)
- `a2.json` (~137 tok)
- `a3-db-full-escalated.log` (~3423 tok)
- `a3-db-full.log` — Declares and (~3453 tok)
- `a3-focused-final.log` (~257 tok)
- `a3-scope-test-2.log` (~184 tok)
- `a3-scope-test-3.log` (~549 tok)
- `a3-scope-test-4.log` (~183 tok)
- `a3-scope-test.log` (~380 tok)
- `a3-typecheck-final-2.log` (~32 tok)
- `a3-typecheck-final.log` (~32 tok)
- `a3-typecheck-with-tests.log` (~32 tok)
- `a3-typecheck.log` (~32 tok)
- `a3.json` (~267 tok)
- `a4-after-executor.log` (~359 tok)
- `a4-after-preview.log` (~310 tok)
- `a4-after-publication-escalated.log` (~482 tok)
- `a4-after-publication.log` (~1290 tok)
- `a4-core-final.log` (~396 tok)
- `a4-core-initial.log` (~377 tok)
- `a4-db-focused.log` (~179 tok)
- `a4-reference-2.log` (~24131 tok)
- `a4-reference-3.log` (~86 tok)
- `a4-reference-4.log` (~86 tok)
- `a4-reference-initial.log` (~23220 tok)
- `a4-typecheck-2.log` (~288 tok)
- `a4-typecheck-final-2.log` (~33 tok)
- `a4-typecheck-final.log` (~33 tok)
- `a4-typecheck.log` — Declares sufficiently (~330 tok)
- `a4.json` (~361 tok)
- `a5-before-final.log` — Declares result (~671 tok)
- `a5-before.log` — result: normalizeOperation (~1143 tok)
- `a5-core-first.log` — Declares closed (~434 tok)
- `a5-core.log` (~413 tok)
- `a5-db-focused.log` (~306 tok)
- `a5-db-full-final.log` — Declares and (~3201 tok)
- `a5-db-full.log` — Declares and (~3137 tok)
- `a5-db.log` (~148 tok)
- `a5-hidden-before.log` — Declares action (~1108 tok)
- `a5-hidden-final.log` (~85 tok)
- `a5-http-extra.log` (~85 tok)
- `a5-http-physical.log` (~124 tok)
- `a5-http.log` (~102 tok)
- `a5-restore.log` (~125 tok)
- `a5-types.log` (~75 tok)
- `a5.json` (~495 tok)
- `a6-core-helper.log` (~82 tok)
- `a6-core-typecheck.log` (~33 tok)
- `a6-db-focused.log` (~146 tok)
- `a6-db-typecheck.log` (~32 tok)
- `a6-parity-2.log` (~112 tok)
- `a6-parity-initial.log` — Declares changeSet (~870 tok)
- `a6-server-typecheck.log` (~33 tok)
- `a6-source-guards.log` (~82 tok)
- `a6.json` (~220 tok)
- `a7-db-final.log` (~166 tok)
- `a7-db.log` — Declares normalizeOperation (~506 tok)
- `a7-mixed.log` (~410 tok)
- `a7-types-final.log` (~32 tok)
- `a7-types.log` (~598 tok)
- `a7.json` (~203 tok)
- `browser-activity.ax.txt` — Declares 34 (~3246 tok)
- `browser-applied.ax.txt` — Declares 34 (~3246 tok)
- `browser-approved.ax.txt` — Declares 34 (~3128 tok)
- `browser-approved.json` (~7831 tok)
- `browser-board.ax.txt` (~1269 tok)
- `browser-final.json` (~7863 tok)
- `browser-fixture.mts` — base: request (~698 tok)
- `browser-selected.ax.txt` — Declares 34 (~3066 tok)
- `closure.json` (~5462 tok)
- `full-tests-final.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~77624 tok)
- `full-tests.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~77750 tok)
- `p1-final.log` (~53 tok)
- `p1-node-tests.log` (~52 tok)
- `p1-python-tests.log` (~887 tok)
- `p1.json` (~260 tok)
- `release-verify-before-review-fix.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `release-verify-final.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `release-verify-initial-review-type-error.log` (~415 tok)
- `retro-baseline-executor.log` (~359 tok)
- `retro-baseline-preview.log` (~310 tok)
- `retro-baseline-publication.log` (~482 tok)
- `review-core-typecheck.log` (~32 tok)
- `review-fullreference-branches.log` (~86 tok)
- `review-hidden-unlink-after.log` (~85 tok)
- `review-hidden-unlink-before.log` (~397 tok)
- `review-p1-fixes.log` (~53 tok)
- `review-p1-portable-mode.log` (~63 tok)
- `review-results.json` — Declares rejects (~1129 tok)
- `status-diff.txt` — - sprint-status.before (~786 tok)
- `status-isolation.json` (~299 tok)
- `status-update.json` (~57 tok)
- `typecheck.log` (~218 tok)
- `verified-sources.json` (~36623 tok)

## _bmad-output/implementation-artifacts/evidence/epic-4-remediation/browser-initial/

- `browser-activity.ax.txt` — Declares 38 (~1563 tok)
- `browser-applied.ax.txt` — Declares 35 (~3247 tok)
- `browser-approved.ax.txt` — Declares 35 (~3128 tok)
- `browser-approved.json` (~7811 tok)
- `browser-board.ax.txt` (~1269 tok)
- `browser-final.json` (~7863 tok)
- `browser-fixture.mts` — base: request (~718 tok)
- `browser-selected.ax.txt` — Declares 35 (~3066 tok)

## _bmad-output/implementation-artifacts/evidence/epic-6-remediation/

- `epic6-collapse-after.log` (~136 tok)
- `epic6-collapse-before.log` (~775 tok)
- `epic6-visibility-final.log` (~88 tok)
- `fresh-checks-attempt-1.json` (~37 tok)
- `fresh-checks-attempt-2.json` (~37 tok)
- `fresh-checks.json` (~159 tok)
- `graph-changes.json` (~11530 tok)
- `map-visibility.log` (~136 tok)
- `native-boundaries.json` (~324 tok)
- `navigation-final.log` (~142 tok)
- `release-verify.log` (~84900 tok)
- `root-tests-attempt-1.log` (~2528 tok)
- `root-tests-attempt-2.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~114849 tok)
- `run-status-after.json` (~2310 tok)
- `runtime.json` (~840 tok)
- `source-fingerprint.json` (~40307 tok)
- `sprint-update.json` (~65 tok)
- `tracking-validation.json` (~74 tok)
- `workspace-tests.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~184869 tok)

## _bmad-output/implementation-artifacts/evidence/epic-6-retro/

- `adversarial.json` (~2596 tok)
- `aggregate.json` (~67706 tok)
- `changed-code-paths.json` (~5429 tok)
- `edges.json` — Declares renamed (~283 tok)
- `fresh-checks.json` (~73 tok)
- `git-evidence.json` (~24160 tok)
- `release-verify.log` (~84807 tok)
- `root-tests.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~186008 tok)
- `run-status.json` (~2310 tok)
- `runtime-observations.json` (~386 tok)
- `scope-summary.json` (~745 tok)
- `sprint-detection-before.json` (~677 tok)
- `sprint-update.json` (~62 tok)
- `tracking-validation.json` (~72 tok)
- `triage.json` (~4485 tok)
- `verification.json` (~682 tok)

## _bmad-output/implementation-artifacts/evidence/epic-7-remediation/

- `actual-http-observations-final.json` (~286 tok)
- `actual-http-observations.json` (~286 tok)
- `actual-http-source.mts.txt` — root: api (~2231 tok)
- `baseline.json` (~168 tok)
- `detect-epic-before-closure.json` (~760 tok)
- `epic-closure.json` (~244 tok)
- `final-source-state.json` (~82 tok)
- `implementation-focused-results.json` (~372 tok)
- `manifest.json` (~1329 tok)
- `matrix-audit.json` (~983 tok)
- `retro-action-update.json` (~65 tok)
- `retrospective-v1.md.txt` — Declares defect (~5250 tok)
- `review-final-blind.json` — Declares baseline (~1424 tok)
- `review-final-edges.json` (~1 tok)
- `review-final-summary.json` — Declares baseline (~246 tok)
- `review-final-verification.json` (~462 tok)
- `review-pass-1.json` (~837 tok)
- `sprint-before-closure.yaml` — STATUS DEFINITIONS: (~5040 tok)
- `tracking-validation.json` (~182 tok)
- `verification.json` (~537 tok)

## _bmad-output/implementation-artifacts/evidence/epic-7-retro/

- `actions.json` (~533 tok)
- `adversarial-lens.json` (~1561 tok)
- `architecture-source.py.txt` — ts: walk (~1790 tok)
- `architecture.json` (~20641 tok)
- `composer-browser.txt` (~2937 tok)
- `detect-epic.json` (~761 tok)
- `edge-case-lens.json` (~224 tok)
- `git-evidence.json` (~36053 tok)
- `loop-status.json` (~1872 tok)
- `manifest.json` (~603 tok)
- `native-fixture.source.txt` — Declares root (~961 tok)
- `runtime-probes.source.txt` — Declares data (~838 tok)
- `sprint-timestamp-correction.json` (~57 tok)
- `sprint-update.json` (~61 tok)
- `tracking-validation.json` (~66 tok)
- `verification-gap-lens.json` (~1037 tok)
- `verification.json` (~759 tok)

## _bmad-output/implementation-artifacts/evidence/story-6-1/

- `acceptance.json` (~731 tok)
- `resume-test.log` (~1122 tok)
- `resume-typecheck.log` (~31 tok)
- `resume-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `resume.json` (~325 tok)
- `tests.log` (~1121 tok)
- `verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)

## _bmad-output/implementation-artifacts/evidence/story-6-2/

- `db-tests-reviewed.log` — Declares retention (~1636 tok)
- `db-tests.log` (~3707 tok)
- `http-acceptance.json` (~737 tok)
- `shell-diagnostic.log` (~121 tok)
- `typecheck-reviewed.log` (~31 tok)
- `typecheck.log` (~31 tok)
- `verify-reviewed.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `web-tests-confirm.log` (~1242 tok)
- `web-tests-final.log` — Declares at (~12913 tok)
- `web-tests-reviewed.log` (~1958 tok)
- `web-tests.log` — Declares copy (~1821 tok)

## _bmad-output/implementation-artifacts/evidence/story-6-3/

- `backend-core-tests.log` (~429 tok)
- `backend-focused-tests.log` (~126 tok)
- `backend-review-fixes-core-tests.log` (~85 tok)
- `backend-review-fixes-tests.log` (~82 tok)
- `backend-server-build-first-attempt.log` (~419 tok)
- `backend-server-completeness-first-attempt.log` (~55885 tok)
- `backend-server-tests.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~57933 tok)
- `backend-typecheck.log` (~33 tok)
- `final-core.log` (~429 tok)
- `final-db.log` — Declares and (~3022 tok)
- `final-handoff-hygiene.log` (~80 tok)
- `final-server.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~58256 tok)
- `final-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `final-web.log` (~2010 tok)
- `focused-lifecycle-final-tests.log` (~86 tok)
- `focused-web-tests.log` (~146 tok)
- `http-acceptance.json` (~556 tok)
- `http-acceptance.py` — req, snapshot, create (~954 tok)
- `http-move-matrix-tests.log` (~85 tok)
- `parent-core.log` (~429 tok)
- `parent-db.log` — Declares and (~3515 tok)
- `parent-server.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~57475 tok)
- `parent-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `parent-web.log` (~1940 tok)
- `review-repairs-web-first-attempt.log` — Declares copy (~581 tok)
- `review-repairs-web-tests.log` (~100 tok)
- `web-tests-first-attempt.log` — Declares copy (~12851 tok)
- `web-tests.log` (~1936 tok)
- `web-typecheck.log` (~31 tok)

## _bmad-output/implementation-artifacts/evidence/story-6-4/

- `cleanup.json` (~74 tok)
- `diagnostic-index.json` (~1227 tok)
- `dom-timing-delegated.json` (~622 tok)
- `filter-final.log` (~86 tok)
- `final-db.log` — Declares and (~3087 tok)
- `final-handoff-hygiene.log` (~80 tok)
- `final-server.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~58483 tok)
- `final-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `final-web.log` (~2012 tok)
- `focused-web-final.log` (~180 tok)
- `http-acceptance.json` (~1589 tok)
- `http-acceptance.py` — request, snapshot, create, roots (~1483 tok)
- `matrix-audit.json` (~503 tok)
- `native-acceptance.json` (~402 tok)
- `native-repairs-focused.log` (~138 tok)
- `parent-db.log` — Declares retention (~2895 tok)
- `parent-server.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~58423 tok)
- `parent-verify-native-repairs.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `parent-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `parent-web-native-repairs.log` (~2016 tok)
- `parent-web.log` (~1608 tok)
- `restart-acceptance.json` (~55 tok)
- `review-repairs-focused.log` (~148 tok)
- `review-triage.json` (~1872 tok)
- `story-6-4-discovery-dom-timing-1792247216356.json` (~665 tok)
- `story-6-4-discovery-dom-timing-1792247461674.json` (~665 tok)
- `story-6-4-dom-timing-1792242993985.json` (~621 tok)
- `story-6-4-dom-timing-1792243258356.json` (~622 tok)
- `story-6-4-dom-timing-1792244503099.json` (~622 tok)
- `story-6-4-dom-timing-1792244682900.json` (~622 tok)
- `story-6-4-dom-timing-1792244889746.json` (~621 tok)
- `story-6-4-dom-timing-1792245085377.json` (~622 tok)
- `story-6-4-dom-timing-1792247212600.json` (~622 tok)
- `story-6-4-dom-timing-1792247457243.json` (~620 tok)
- `web-test-transient-string-hygiene.log` — Declares copy (~2261 tok)

## _bmad-output/implementation-artifacts/evidence/story-6-5/

- `final-contracts.log` (~297 tok)
- `final-core.log` (~429 tok)
- `final-db.log` — Declares and (~3258 tok)
- `final-server.log` (~470 tok)
- `final-web.log` (~1725 tok)
- `http-acceptance.json` (~239 tok)
- `http-acceptance.py` — request, snapshot, create (~1507 tok)
- `matrix-audit.json` (~508 tok)
- `native-acceptance.json` (~397 tok)
- `parent-contracts.log` (~297 tok)
- `parent-core.log` (~429 tok)
- `parent-db.log` — Declares and (~3571 tok)
- `parent-server.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~58133 tok)
- `parent-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `parent-web.log` (~2014 tok)
- `repaired-final-collapse.log` (~87 tok)
- `repaired-final-server.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~57954 tok)
- `repaired-final-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `restart-acceptance.json` (~46 tok)

## _bmad-output/implementation-artifacts/evidence/story-6-6/

- `complete-final-core.log` (~429 tok)
- `complete-final-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `complete-final-web.log` (~2396 tok)
- `final-accessible-core.log` (~429 tok)
- `final-accessible-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `final-accessible-web.log` (~1991 tok)
- `final-core.log` (~429 tok)
- `final-web.log` (~2734 tok)
- `followup-core.log` (~429 tok)
- `followup-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `followup-web.log` (~2409 tok)
- `http-fixture.json` (~238 tok)
- `matrix-audit.json` (~794 tok)
- `native-acceptance.json` (~301 tok)
- `parent-core.log` (~429 tok)
- `parent-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `parent-web-repaired.log` (~2319 tok)
- `parent-web.log` (~2213 tok)
- `repaired-final-verify.log` (~442 tok)
- `repaired-final-web.log` (~2430 tok)

## _bmad-output/implementation-artifacts/evidence/story-6-7/

- `implementation-build.log` (~234 tok)
- `implementation-build2.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~528 tok)
- `implementation-build3.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~528 tok)
- `implementation-build4.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~528 tok)
- `implementation-fullweb.log` (~10916 tok)
- `implementation-fullweb2.log` (~18946 tok)
- `implementation-fullweb3.log` (~17823 tok)
- `implementation-nav3.log` (~15342 tok)
- `implementation-patch-final-navigation.log` (~15089 tok)
- `implementation-patch-frozen-install.log` (~142 tok)
- `implementation-patch-lock-refresh.log` (~178 tok)
- `implementation-patchtests.log` (~15254 tok)
- `implementation-review-expanded.log` (~34109 tok)
- `implementation-review-expanded2.log` (~33861 tok)
- `implementation-review-final-tests.log` (~34310 tok)
- `implementation-review-final-tests2.log` (~37857 tok)
- `implementation-review-final-tests3.log` (~34310 tok)
- `implementation-review-final-tests4.log` (~34310 tok)
- `implementation-review-focus-preview.log` (~174 tok)
- `implementation-review-frozen.log` (~142 tok)
- `implementation-review-frozen2.log` (~142 tok)
- `implementation-review-initial.log` (~17623 tok)
- `implementation-review-lock.log` (~178 tok)
- `implementation-review-lock2.log` (~178 tok)
- `implementation-review-patch.log` (~148 tok)
- `implementation-root.log` (~88 tok)
- `implementation-server.log` (~80 tok)
- `implementation-test.log` (~1355 tok)
- `implementation-test2.log` (~7856 tok)
- `matrix-audit.json` (~854 tok)
- `native-acceptance.json` (~742 tok)
- `parent-final-markdown.log` (~80 tok)
- `parent-final-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `parent-final-web.log` (~36189 tok)
- `parent-markdown.log` (~80 tok)
- `parent-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `parent-web.log` (~17986 tok)
- `repair-parent-final-markdown.log` (~80 tok)
- `repair-parent-final-root-test.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~183557 tok)
- `repair-parent-final-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `repair-parent-final-web.log` (~85031 tok)
- `repair-parent-markdown.log` (~80 tok)
- `repair-parent-root-test.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~122788 tok)
- `repair-parent-verify.log` — Anchors a pattern source. The interpolation lives here rather than at the call site because (~1179 tok)
- `repair-parent-web.log` (~36621 tok)
- `repair-review-navigation.log` (~82672 tok)
- `repair-root-test.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~122312 tok)

## _bmad-output/implementation-artifacts/evidence/story-7-1/

- `matrix-audit.json` (~718 tok)
- `review-triage.json` (~2387 tok)
- `verification-summary.json` (~747 tok)

## _bmad-output/implementation-artifacts/evidence/story-7-2/

- `matrix-audit.json` (~906 tok)
- `native-acceptance.json` (~529 tok)
- `review-triage.json` (~2850 tok)
- `verification-summary.json` (~585 tok)

## _bmad-output/implementation-artifacts/evidence/story-7-3/

- `changed-files.json` (~14048 tok)
- `complete-surface-repair.json` (~436 tok)
- `identity-boardimport.log` (~81 tok)
- `identity-capabilities-final.log` (~15 tok)
- `identity-capabilities-test.log` (~318 tok)
- `identity-complete-surface-repair-final.log` (~136 tok)
- `identity-complete-surface-repair.log` — sourceHash: seedLegacySourceLink (~1078 tok)
- `identity-contracts.log` (~32 tok)
- `identity-core-goldens-final.log` (~84 tok)
- `identity-db-typecheck.log` (~2363 tok)
- `identity-http-mcp.log` — call: requiredScope (~1620 tok)
- `identity-import-sdk.log` (~101 tok)
- `identity-launchers-focus.log` (~87 tok)
- `identity-packages.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~2784 tok)
- `identity-server-finalcheck2.log` (~32 tok)
- `identity-server-security-typecheck.log` (~32 tok)
- `identity-size-complete-surface.log` (~136 tok)
- `identity-size-contracts-tests.log` (~297 tok)
- `identity-size-contracts-typecheck.log` (~35 tok)
- `identity-size-db-repository.log` (~85 tok)
- `identity-size-db-typecheck.log` (~31 tok)
- `identity-size-hygiene.log` (~1 tok)
- `identity-size-server-typecheck.log` (~32 tok)
- `identity-sync-tests.log` (~11203 tok)
- `identity-tool-proposals-final.log` (~18298 tok)
- `identity-tool-proposals-final2.log` (~20711 tok)
- `identity-tool-proposals-final3.log` (~20666 tok)
- `identity-typecheck-final.log` (~555 tok)
- `identity-workspace.log` (~9154 tok)
- `implementation-handoff-verification.json` (~1013 tok)
- `main-review-core-final.log` (~123 tok)
- `main-review-db-final.log` (~150 tok)
- `main-review-repairs-summary.json` (~763 tok)
- `main-review-sdk-final.log` (~82 tok)
- `main-review-sdk-initial-failure.log` — Declares http (~438 tok)
- `main-review-sequential-owner-core.log` (~140 tok)
- `main-review-sequential-owner-db.log` (~103 tok)
- `main-review-sequential-owner-summary.json` (~323 tok)
- `main-review-server-final.log` (~117 tok)
- `native-acceptance.json` (~82 tok)
- `operations-contracts-final.log` (~297 tok)
- `operations-core-footer-final.log` (~183 tok)
- `operations-core-typecheck-final.log` (~32 tok)
- `operations-provider-final.log` (~312 tok)
- `operations-review-card-detail.log` (~87 tok)
- `operations-review-footer.log` (~81 tok)
- `operations-review-provider.log` (~83 tok)
- `operations-sdk-security-final.log` (~82 tok)
- `operations-server-sync-final.log` (~131 tok)
- `operations-server-typecheck-initial-failure.log` (~6082 tok)
- `operations-sync-initial-integration-failures.log` (~34771 tok)
- `operations-tree-navigation-regression-before-fix.log` — Declares row (~650 tok)
- `operations-verification-matrix.json` (~3783 tok)
- `operations-web-final.log` (~85423 tok)
- `operations-web-typecheck-final.log` (~31 tok)
- `parent-archive-repair.log` (~82 tok)
- `parent-matrix-audit.json` (~785 tok)
- `parent-release-verify-final.log` (~84900 tok)
- `parent-release-verify.log` (~141 tok)
- `parent-review-release-verify-final.log` (~84900 tok)
- `parent-review-root-test-final.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~189198 tok)
- `parent-review-root-test.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~119553 tok)
- `parent-root-test-final.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~189704 tok)
- `parent-root-test.log` — , **/dist/**, **/cypress/**, **/.{idea,git,cache,output,temp}/**, **/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint... (~201822 tok)
- `review-triage.json` — Declares Project (~2746 tok)
- `reviewed-source.json` (~139 tok)
- `source-size-repair.json` (~262 tok)
- `storage-archive-review-repairs-summary.json` (~1583 tok)
- `storage-archive-review-repairs.json` (~2188 tok)
- `storage-archive-review-repairs.log` (~18 tok)
- `storage-focused-initial-failures.json` (~27677 tok)

## _bmad-output/planning-artifacts/

- `board-requirements-baseline-2026-10-04.md` — Verified board requirements baseline (~6462 tok)
- `epic-4-readiness-2026-10-10.md` — Epic 4 implementation readiness (~2428 tok)
- `epics.md` — StoryMapper - Epic Breakdown (~38313 tok)

## _bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/

- `.memlog.md` — Declares and (~2702 tok)
- `ARCHITECTURE-SPINE.md` — Architecture Spine — StoryMapper (~9829 tok)

## _bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/reviews/

- `reconcile-prd.md` — Reconcile: PRD vs Architecture Spine (~4686 tok)
- `review-adversarial.md` — Adversarial review: ARCHITECTURE-SPINE.md (StoryMapper v1.0) (~9168 tok)
- `review-web-verify.md` — Review: web reality check of ARCHITECTURE-SPINE.md (~3185 tok)

## _bmad-output/planning-artifacts/prds/prd-StoryMapper-2026-09-29/

- `.memlog.md` — Declares into (~992 tok)
- `addendum.md` — Addendum: StoryMapper PRD (~1749 tok)
- `epic-topics.md` — Epic topics (~1515 tok)
- `prd.md` — PRD: StoryMapper (~14793 tok)
- `review-code-alignment.md` — PRD to code alignment review (~3312 tok)

## _bmad-output/planning-artifacts/ux-designs/ux-StoryMapper-2026-09-29/

- `.memlog.md` (~656 tok)
- `DESIGN.md` — Brand & Style (~5635 tok)
- `EXPERIENCE.md` — StoryMapper — Experience Spine (~9125 tok)
- `review-accessibility.md` — Adversarial accessibility review: DESIGN.md and EXPERIENCE.md (~13027 tok)
- `review-rubric.md` — Spine Pair Review - StoryMapper (~8530 tok)

## _bmad/

- `config.toml` — ───────────────────────────────────────────────────────────────── (~823 tok)
- `config.user.toml` — ───────────────────────────────────────────────────────────────── (~200 tok)

## _bmad/_config/

- `bmad-help.csv` (~1950 tok)
- `files-manifest.csv` (~8910 tok)
- `manifest.yaml` (~161 tok)
- `skill-manifest.csv` (~2571 tok)

## _bmad/bmad-loop/

- `module-help.csv` (~157 tok)

## _bmad/bmm/

- `config.yaml` — BMM Module Configuration (~147 tok)
- `module-help.csv` (~1304 tok)

## _bmad/bmm/v6-shims/

- `README.md` — Project documentation (~442 tok)

## _bmad/core/

- `config.yaml` — CORE Module Configuration (~76 tok)
- `module-help.csv` (~680 tok)

## _bmad/core/v6-shims/

- `README.md` — Project documentation (~376 tok)

## _bmad/custom/

- `.gitignore` — Git ignore rules (~4 tok)
- `bmad-build-auto.toml` — StoryMapper: bind bmad-build-auto planning to epic-preparation artifacts. (~211 tok)
- `config.toml` — Team / enterprise overrides for _bmad/config.toml. (~99 tok)

## _bmad/custom/references/

- `bmad-build-auto-epic-story-plans.md` — Epic story detail plans (dev consumption) (~528 tok)

## _bmad/scripts/

- `config_utils.py` — Shared strict TOML loading and structural merge support. (~1200 tok)
- `memlog.py` — memlog — an append-only memory log: LLM-optimal working memory for a skill. (~2619 tok)
- `render_skill.py` — Render a skill's Markdown sources into an immutable project snapshot. (~4439 tok)
- `resolve_config.py` — Resolve BMad's four central TOML layers to JSON. (~623 tok)
- `resolve_customization.py` — Resolve a skill's default, team, and user TOML customization layers. (~1494 tok)

## apps/server/

- `package.json` — Node.js package manifest (~378 tok)
- `tsconfig.json` — TypeScript configuration (~40 tok)
- `vitest.config.ts` — Vitest test configuration (~245 tok)

## apps/server/src/

- `main.test.ts` — API routes: GET (3 endpoints) (~3102 tok)
- `main.ts` — debug: shutDown, finishShutdown, startupFailure (~1594 tok)
- `runtime-lifecycle.test.ts` — FastifyInstance: holdArchiveLoad, uploadArchive, coordinateSnapshotRead + 5 more (~10016 tok)
- `server.test.ts` — actual: inject (~6462 tok)
- `server.ts` — Exports buildServer (~1229 tok)

## apps/server/src/application/

- `actors.ts` — Exports localHumanActor, requireActor, requireHumanActor, cardCreationOrigin (~175 tok)
- `base-versions.ts` — Exports BaseVersionTarget, assertBaseVersions (~429 tok)
- `capability-manifest.json` (~8571 tok)
- `capability-manifest.test.ts` — Declares documentedTools (~1442 tok)
- `deps.ts` — Exports ApplicationDeps (~50 tok)
- `descriptors.ts` — Exports applicationCapabilityDescriptors (~2388 tok)
- `errors.ts` — Exports asDomainError, replyWithError (~340 tok)
- `mcp-http-parity.test.ts` — human: fixture, cardFields (~3655 tok)
- `validation.ts` — Exports requireEntity, requirePatch (~124 tok)

## apps/server/src/application/ai/

- `ai.use-cases.test.ts` — Declares handle (~1125 tok)
- `ai.use-cases.ts` — Exports listAiTemplatesDescriptor, listAiTemplates, createAiProposalDescriptor, createAiProposal + 6 more (~816 tok)
- `prompts.test.ts` — Declares cleanup (~718 tok)
- `prompts.ts` — Exports createAiPromptHandlers (~1670 tok)

## apps/server/src/application/card/

- `card-children.use-cases.ts` — Exports parkCardDescriptor, parkCard, unparkCardDescriptor, unparkCard + 20 more (~1977 tok)
- `card.use-cases.ts` — Exports listCardsDescriptor, listCards, getCardDetailsDescriptor, getCardDetails + 12 more (~1460 tok)

## apps/server/src/application/changeset/

- `changeset.use-cases.ts` — Exports listChangeSetsDescriptor, listChangeSets, approveChangeSetDescriptor, approveChangeSet + 10 more (~1742 tok)
- `proposal-builders.ts` — Exports buildMapProposalChangeSet, buildBacklogGroomingChangeSet (~1110 tok)
- `tool-proposals.use-cases.ts` — Exports proposeStoryMapCopyDescriptor, proposeStoryMapCopy, proposeGitHubBoardDescriptor, proposeGitHubBoard (~387 tok)

## apps/server/src/application/connector/

- `connector.use-cases.ts` — Exports listConnectorConnectionsDescriptor, listConnectorConnections, createConnectorConnectionDescriptor, createConnectorConnection + 6 more (~1399 tok)

## apps/server/src/application/customization/

- `customization.use-cases.ts` — Exports getCustomizationDescriptor, getCustomization, createWorkflowStatusDescriptor, createWorkflow (~3560 tok)

## apps/server/src/application/export/

- `export.use-cases.ts` — Exports exportStoryMapDescriptor, exportStoryMap, exportAuditDescriptor, exportAudit + 6 more (~1213 tok)

## apps/server/src/application/github-link/

- `github-link.use-cases.ts` — Exports listGitHubLinksDescriptor, listGitHubLinks, createGitHubLinkDescriptor, createGitHubLink + 8 more (~945 tok)

## apps/server/src/application/http/

- `validate.ts` — Exports parseInput (~101 tok)

## apps/server/src/application/persona/

- `persona.use-cases.ts` — Exports listPersonasDescriptor, listPersonas, createPersonaDescriptor, createPersona + 4 more (~878 tok)

## apps/server/src/application/project/

- `project.use-cases.ts` — Exports listProjectsDescriptor, listProjects, createProjectDescriptor, createProject + 10 more (~1096 tok)

## apps/server/src/application/release/

- `release.use-cases.ts` — Exports getReleaseDetailsDescriptor, getReleaseDetails, createReleaseDescriptor, createRelease + 4 more (~932 tok)

## apps/server/src/application/report/

- `report.use-cases.ts` — Exports getBacklogHealthReportDescriptor, getBacklogHealthReport, getSourceCoverageReportDescriptor, getSourceCoverageReport + 4 more (~761 tok)

## apps/server/src/application/restore/

- `restore.use-cases.ts` — Exports getRestorePointCapabilitiesDescriptor, getRestorePointCapabilities, readRestoreActivityDescriptor, readRestoreActivity + 6 more (~925 tok)

## apps/server/src/application/roadmap/

- `roadmap.use-cases.ts` — Exports listRoadmapsDescriptor, listRoadmaps, createRoadmapDescriptor, createRoadmap + 12 more (~1220 tok)

## apps/server/src/application/source-document/

- `source-document.use-cases.ts` — Exports importSourceDocumentDescriptor, importSourceDocument, listSourceDocumentsDescriptor, listSourceDocuments + 2 more (~543 tok)

## apps/server/src/application/story-map/

- `snapshot-source-visibility.ts` — Exports visibleSnapshotSources (~300 tok)
- `story-map.use-cases.ts` — Exports listStoryMapsDescriptor, listStoryMaps, getStoryMapSnapshotDescriptor, getStoryMapSnapshot + 8 more (~1189 tok)

## apps/server/src/application/sync/

- `github-import-command.ts` — API routes: GET (1 endpoints) (~2566 tok)
- `sync-conflict.use-cases.ts` — Exports resolveSyncConflictDescriptor, resolveSyncConflict (~713 tok)
- `sync.use-cases.ts` — Exports planWorkItemsDescriptor, planWorkItems, pushWorkItemsDescriptor, pushWorkItems + 8 more (~951 tok)

## apps/server/src/config/

- `failures.d.mts` — Exports redact (~103 tok)
- `failures.mjs` — Exports redact, failure, nativeFailure, portFailure, renderFailure (~467 tok)
- `local-env.ts` — Exports findEnvFile, loadLocalEnv (~389 tok)
- `project-lock.test.ts` — Declares actual (~2087 tok)
- `project-lock.ts` — Exports acquireProjectLock, ProjectOwnership (~2492 tok)
- `runtime-log.test.ts` — Declares directory (~550 tok)
- `runtime-log.ts` — Exports createRuntimeLog (~1019 tok)
- `runtime-port.test.ts` — directories: portFile (~473 tok)
- `runtime-port.ts` — Exports RuntimePort, readRuntimePort, runtimeUrl, getDatabasePath + 2 more (~834 tok)
- `runtime.ts` — Exports RuntimeConfig, getRuntimeConfig, isLoopbackHost (~322 tok)

## apps/server/src/fixtures/

- `runtime-lifecycle.ts` — Declares call (~246 tok)

## apps/server/src/http/

- `live-events.test.ts` — API routes: POST (3 endpoints) (~5666 tok)
- `live-events.ts` — API routes: GET (1 endpoints) (~2170 tok)
- `request-origin.ts` — Exports requestActor, requestHumanActor, installRequestOrigin (~408 tok)
- `request-security.ts` — Exports installRequestSecurity (~590 tok)
- `restore-request-gate.ts` — Exports RESTORE_PROJECT_ROUTE, installRestoreRequestGate (~726 tok)
- `web-app.ts` — API routes: GET (2 endpoints) (~708 tok)

## apps/server/src/http/routes/

- `ai-routes.ts` — Exports aiRoutes (~550 tok)
- `application-route.ts` — Exports registerApplicationRoute, requiredQuery, optionalQuery, routeParam, baseVersionQuery (~505 tok)
- `base-version-conflicts.test.ts` — cleanup: fixture, commands, send (~3462 tok)
- `card-history.test.ts` — cleanup: fixture (~1186 tok)
- `card-markdown.test.ts` — Declares FastifyInstance (~1005 tok)
- `card-routes.ts` — Exports cardRoutes (~1380 tok)
- `changeset-routes.ts` — API routes: GET, POST (4 endpoints) (~718 tok)
- `connector-routes.ts` — Exports connectorRoutes (~555 tok)
- `customization-management.test.ts` — human: fixture, statusEvidence (~2847 tok)
- `customization-routes.ts` — Exports customizationRoutes (~1058 tok)
- `export-routes.ts` — Exports exportRoutes (~753 tok)
- `getting-started.test.ts` — cleanup: fixture (~6154 tok)
- `github-link-routes.ts` — Exports githubLinkRoutes (~574 tok)
- `index.test.ts` — Declares cleanup (~9253 tok)
- `index.ts` — Exports createRoutes (~948 tok)
- `infrastructure-routes.ts` — API routes: GET, POST (6 endpoints) (~1042 tok)
- `persona-routes.ts` — API routes: GET, POST, PATCH, DELETE (4 endpoints) (~650 tok)
- `project-routes.ts` — Exports projectRoutes (~693 tok)
- `release-routes.ts` — API routes: POST, PATCH (3 endpoints) (~547 tok)
- `report-routes.ts` — Exports reportRoutes (~418 tok)
- `restore-points.test.ts` — API routes: POST (1 endpoints) (~4814 tok)
- `restore-points.ts` — Exports restorePointRoutes (~560 tok)
- `roadmap-routes.ts` — Exports roadmapRoutes (~755 tok)
- `route-deps.ts` — Exports RouteDeps, toApplicationDeps (~119 tok)
- `source-document-routes.ts` — API routes: POST, GET (3 endpoints) (~693 tok)
- `story-map-routes.ts` — Exports storyMapRoutes (~526 tok)
- `sync-routes.ts` — Exports syncRoutes (~705 tok)
- `tool-proposals.test.ts` — API routes: GET (8 endpoints) (~13059 tok)
- `unit-of-work.test.ts` — ChangeSet: fixture, state (~11714 tok)

## apps/server/src/http/websocket/

- `.gitkeep` (~1 tok)

## apps/server/src/jobs/

- `.gitkeep` (~1 tok)

## apps/server/src/mcp/

- `adapter.test.ts` — cleanup: fixture (~3849 tok)
- `http.test.ts` — Card: fixture, request, changeSafety (~8728 tok)
- `http.ts` — Exports registerMcpHttp (~1649 tok)
- `stdio-main.test.ts` — ChildProcessWithoutNullStreams: protocol, stop, createBridgeCard + 4 more (~7423 tok)

## apps/server/src/mcp/tools/

- `audit-tool-call.ts` — Exports auditToolCall (~2360 tok)
- `complete-surface.test.ts` — McpToolName: seedLegacySourceLink, fixture, seedHistoricalChangeSet, created (~20062 tok)
- `project-scopes.ts` — API routes: GET (1 endpoints) (~4352 tok)
- `register-card-tools.ts` — Exports registerAdditionalCardTools (~1572 tok)
- `register-content-tools.ts` — Exports registerContentTools (~1229 tok)
- `register-customization-tools.ts` — Exports registerCustomizationTools (~908 tok)
- `register-structure-tools.ts` — Exports registerStructureTools (~1000 tok)
- `register-tools.test.ts` — Declares cleanup (~3595 tok)
- `register-tools.ts` — Exports RegistrationContext, createMcpRegistry (~4781 tok)
- `submit-changeset.test.ts` — ChangeOperation: fixture, call, cut (~6884 tok)
- `surface.test.ts` — human: seedLegacySourceLink, fixture (~1502 tok)
- `tool-call-audit-paging.test.ts` — ActivityEvent: fixture, recordCalls, newestFirst, expectPage (~2656 tok)
- `tool-call-audit.test.ts` — ActivityEvent: fixture, hash, calls + 3 more (~9899 tok)
- `tool-call-performance.test.ts` — directory: measureTcpBursts (~2121 tok)
- `tool-call-recorder.ts` — Exports createToolCallRecorder (~583 tok)

## apps/server/src/services/

- `ai-proposal-change-set.test.ts` — actor: fixture (~703 tok)
- `ai-proposal-change-set.ts` — Exports buildAiProposalChangeSet (~522 tok)
- `default-ai-templates.ts` — Exports defaultAiFunctionTemplates (~573 tok)
- `prepare-source-document-import.ts` — Exports prepareSourceDocumentImport (~136 tok)
- `project-archive.test.ts` — FastifyInstance: fixture, changedArchive, upload (~12223 tok)
- `project-archive.ts` — Exports ProjectArchiveError, exportProjectArchive, importProjectArchive (~3161 tok)
- `remote-write-outcomes.ts` — Exports RemoteWriteContext, RemotePersistenceError, remotePersistenceFailure, failedSyncItem + 2 more (~876 tok)
- `sync-conflict-resolution.ts` — Exports ConflictResolutionContext, prepareConflictResolution, revalidateConflictResolution, conflictWritePayload, persistConflictResolution (~2204 tok)
- `sync-merge.ts` — Exports SyncFields, syncPayload, changedFieldsForRemote, conflictFields + 4 more (~1806 tok)
- `sync-review.test.ts` — SyncConflict: fixture, remoteFor, input + 5 more (~10035 tok)
- `work-item-sync.test.ts` — RemoteWorkItem: fixture, remoteFor, rows + 6 more (~10948 tok)
- `work-item-sync.ts` — Exports WorkItemSyncError, planWorkItems, pushWorkItems, importWorkItems (~8616 tok)

## apps/web/

- `index.html` — StoryMapper (~80 tok)
- `package.json` — Node.js package manifest (~322 tok)
- `tsconfig.json` — TypeScript configuration (~52 tok)
- `vite.config.ts` — Vite build configuration (~230 tok)

## apps/web/src/

- `main.tsx` — queryClient (~223 tok)
- `vite-env.d.ts` — / <reference types="vite/client" /> (~31 tok)

## apps/web/src/app/

- `api.ts` — API routes: GET (2 endpoints) (~10317 tok)
- `conflict-fallback.ts` — Exports createConflictMutationCache (~255 tok)
- `conflicts.test.ts` — id: run (~799 tok)
- `conflicts.ts` — Exports ConflictError, isConflictError, conflictFor, throwRequestFailure (~278 tok)
- `query-meta.d.ts` — Declares Register (~43 tok)
- `router.tsx` — rootRoute — uses useParams (~1500 tok)

## apps/web/src/app/components/

- `Announcements.tsx` — Announcements (~181 tok)

## apps/web/src/app/live/

- `live-announcements.test.ts` — Declares transaction (~430 tok)
- `live-announcements.ts` — Exports createLiveAnnouncements (~421 tok)
- `live-client-id.ts` — Exports getLiveClientId (~39 tok)
- `live-interaction-store.ts` — Exports useLiveInteractionStore, useLiveDrag, liveUpdatesHeld (~564 tok)
- `live-origin.test.ts` — @vitest-environment jsdom // REQ Story3.10 all browser mutations carry their tab origin (~408 tok)
- `live-query-invalidation.test.ts` — Declares client (~654 tok)
- `live-query-invalidation.ts` — Exports affectedLiveQueries (~864 tok)
- `live-stream-reader.test.ts` — LiveMessage: chunks (~1329 tok)
- `live-stream-reader.ts` — Exports LiveMessage, LiveStreamError, LiveStreamIdleError, readLiveStream (~905 tok)
- `live-stream.test.ts` — API routes: GET (5 endpoints) (~2997 tok)
- `live-stream.ts` — API routes: GET (1 endpoints) (~1602 tok)
- `live-updates.test.tsx` — transport (~10602 tok)
- `useLiveUpdates.ts` — Exports useLiveUpdates (~1964 tok)

## apps/web/src/app/routes/

- `audit.test.ts` — @vitest-environment jsdom // REQ paged audit interactions (~3566 tok)
- `audit.tsx` — AuditRoute — renders form — uses useParams, useState (~1636 tok)
- `customize.tsx` — CustomizeRoute — uses useParams (~159 tok)
- `github.tsx` — GitHubConnectionsRoute — uses useParams (~146 tok)
- `index.tsx` — RootIndexRoute (~157 tok)
- `onboarding.tsx` — OnboardingRoute (~42 tok)
- `personas.tsx` — PersonasRoute — uses useParams, useNavigate (~189 tok)
- `root-layout.test.ts` — Declares ReactNode (~876 tok)
- `RootLayout.tsx` — RootLayout — renders map — uses useState, useMutation, useEffect (~3569 tok)
- `sources.tsx` — SourcesRoute — uses useParams (~110 tok)
- `story-map-shell.tsx` — StoryMapSnapshotContext — uses useContext, useParams, useEffect, useMutation (~2189 tok)
- `story-map.ai-mcp.tsx` — AiMcpRoute — uses useParams (~150 tok)
- `story-map.backlog.tsx` — BacklogRoute (~39 tok)
- `story-map.discovery.tsx` — DiscoveryRoute (~42 tok)
- `story-map.github.tsx` — GitHubRoute — uses useParams (~225 tok)
- `story-map.planning.tsx` — PlanningRoute (~40 tok)
- `story-map.releases.tsx` — ReleasesRoute (~128 tok)
- `story-map.roadmaps.tsx` — RoadmapsRoute — uses useParams (~172 tok)
- `story-map.timeline.tsx` — TimelineRoute (~40 tok)
- `story-map.tracking.tsx` — TrackingRoute (~40 tok)
- `story-map.tree.tsx` — TreeRoute (~36 tok)
- `story-maps.index.tsx` — StoryMapsIndexRoute — uses useParams, useState, useMutation, useEffect (~1289 tok)

## apps/web/src/app/stores/

- `active-story-map-store.ts` — Exports useActiveStoryMapStore (~240 tok)
- `announcement-store.ts` — Exports useAnnouncementStore (~136 tok)
- `discovery-lane-collapse-store.ts` — Exports useDiscoveryLaneCollapseStore (~280 tok)
- `discovery-zoom-store.ts` — Exports DISCOVERY_ZOOM_DEFAULT, DISCOVERY_ZOOM_MIN, DISCOVERY_ZOOM_MAX, DISCOVERY_ZOOM_STEP, useDiscoveryZoomStore (~206 tok)
- `onboarding-store.ts` — Exports useOnboardingStore (~188 tok)
- `tree-collapse-store.ts` — Exports useTreeCollapseStore (~270 tok)

## apps/web/src/components/

- `.gitkeep` (~1 tok)
- `Dialog.test.ts` — @vitest-environment jsdom // REQ UX-DR1 (~3575 tok)
- `Dialog.tsx` — DialogDepth — renders modal — uses useContext, useState, useRef (~2321 tok)

## apps/web/src/features/ai-mcp/

- `AiMcpPanel.test.tsx` — templateState (~1251 tok)
- `AiMcpPanel.tsx` — AiMcpPanel — uses useState (~4049 tok)
- `context-draft.test.ts` — @vitest-environment jsdom // REQ AD11 preserves editor drafts during live updates. (~1561 tok)
- `host-config-copy.test.tsx` — @vitest-environment jsdom // REQ MCP host configuration copying (~745 tok)
- `TemplateEditor.test.tsx` — @vitest-environment jsdom // REQ persisted template CRUD is exposed through the human editor. (~3198 tok)
- `TemplateEditor.tsx` — TemplateEditor (~1327 tok)
- `undone-changesets.test.ts` — @vitest-environment jsdom // REQ historical undone ChangeSets cannot mutate the map (~810 tok)
- `useAiMcpPanelState.ts` — Exports AiMcpPanelProps, AiMcpPanelState, useAiMcpPanelState (~2434 tok)
- `useTemplateEditor.ts` — Exports useTemplateEditor (~760 tok)

## apps/web/src/features/conflicts/

- `ChangeAlert.tsx` — ChangeAlert (~195 tok)
- `ConflictAlert.tsx` — ConflictAlert (~254 tok)
- `useLatestVersions.ts` — Exports useLatestVersions (~130 tok)

## apps/web/src/features/customization/

- `CustomizationPanel.tsx` — CustomizationPanel — uses useState, useMutation (~1803 tok)

## apps/web/src/features/github-sync/

- `github-visibility.test.tsx` — @vitest-environment jsdom // REQ FR-49 (~2372 tok)
- `GitHubConnectionsPanel.tsx` — createDefaultConnectionDraft — uses useState, useEffect, useMutation (~4909 tok)
- `GitHubSyncPanel.tsx` — GitHubSyncPanel — uses useMemo, useState, useEffect, useMutation (~5189 tok)
- `sync-status.ts` — Exports githubSyncStateHint (~182 tok)

## apps/web/src/features/onboarding/

- `getting-started.test.ts` — checklist: render (~1290 tok)
- `GettingStartedChecklist.tsx` — GettingStartedChecklist — uses useMutation (~561 tok)
- `OnboardingPanel.tsx` — OnboardingPanel — uses useNavigate (~933 tok)

## apps/web/src/features/personas/

- `PersonaDetail.test.ts` — @vitest-environment jsdom // REQ AD11 preserves Persona editor drafts across live refreshes. (~2527 tok)
- `PersonaDetail.tsx` — TEXT_FIELDS — uses useState, useRef, useEffect, useMutation (~2472 tok)
- `PersonasPanel.tsx` — PersonasPanel — uses useState, useMutation (~1242 tok)

## apps/web/src/features/privacy/

- `PrivacyExportPanel.tsx` — PrivacyExportPanel — uses useMutation (~798 tok)

## apps/web/src/features/project-archive/

- `project-archive-export.test.ts` — Declares downloadEnvironment (~1328 tok)
- `project-archive-import.test.ts` — @vitest-environment jsdom // REQ portable archive import interactions (~1614 tok)
- `project-archive-runtime.test.ts` — @vitest-environment jsdom // REQ mounted archive refresh and uncertain-response recovery (~1890 tok)
- `project-archive-runtime.ts` — Exports reloadProjectArchiveRuntime (~26 tok)
- `ProjectArchivePanel.tsx` — downloadProjectArchive — uses useNavigate, useMutation, useEffect (~1115 tok)

## apps/web/src/features/releases/

- `release-utils.ts` — Exports invalidateReleaseViews (~110 tok)
- `ReleaseDateFields.test.ts` — @vitest-environment jsdom (~1137 tok)
- `ReleaseDateFields.tsx` — datesOf — uses useState, useRef, useEffect, useMutation (~899 tok)
- `ReleaseKanban.test.tsx` — @vitest-environment jsdom (~762 tok)
- `ReleaseKanban.tsx` — kanbanStatuses — uses useMemo, useRef, useMutation (~1376 tok)
- `ReleasePanel.tsx` — ReleasePanel — uses useState, useMemo, useMutation (~1094 tok)
- `ReleaseTimelineChart.tsx` — ReleaseTimelineChart — renders chart (~499 tok)

## apps/web/src/features/reports/

- `ReportsPanel.tsx` — issueLabels (~922 tok)

## apps/web/src/features/restore-points/

- `restore-points.test.ts` — @vitest-environment jsdom // REQ restore point Activity interactions (~8408 tok)
- `restore-result.ts` — Exports RESTORE_PROJECT_KEY, RestoreAttemptStorageError, RestoreAttempt, SavedRestoreState + 9 more (~1354 tok)
- `RestorePointsPanel.tsx` — CREATE_RESTORE_POINT_KEY — renders modal — uses useRef, useState, useMutation, useEffect (~1718 tok)
- `RestoreProgressDialog.tsx` — RestoreProgressDialog — renders modal (~306 tok)
- `RestoreResultDialog.tsx` — RestoreResultDialog — renders modal — uses useState, useMutation, useEffect (~1130 tok)

## apps/web/src/features/roadmaps/

- `RoadmapEditor.test.ts` — @vitest-environment jsdom (~1084 tok)
- `RoadmapEditor.tsx` — fieldsOf — uses useState, useRef, useEffect, useMutation (~936 tok)
- `RoadmapPanel.tsx` — RoadmapPanel — renders map — uses useState, useMemo, useMutation, useEffect (~2166 tok)

## apps/web/src/features/safety/

- `SafetySwitchStrip.tsx` — switchLabel — renders form, modal — uses useState, useMutation, useEffect (~1360 tok)

## apps/web/src/features/source-documents/

- `SourceDocumentsPanel.tsx` — SourceDocumentsPanel — uses useState, useMutation (~1216 tok)

## apps/web/src/features/story-map/

- `card-query-invalidation.ts` — Exports invalidateCardReports (~144 tok)
- `card-taxonomy.ts` — Exports CardLevelMeta, cardLevelMeta (~88 tok)
- `card-visual-options.ts` — Exports CardColorCategory, CARD_COLOR_CATEGORIES, DEFAULT_CARD_COLOR, CARD_PRIORITY_OPTIONS (~273 tok)
- `drop-targets.ts` — Exports storyBoardCollisionDetection, StoryCellDropTarget, resolveStoryCellDropTarget (~418 tok)
- `useStoryMapBoardState.ts` — Exports GitHubFilter, BoardFilters, defaultBoardFilters, useStoryMapBoardState (~5251 tok)

## apps/web/src/features/story-map/components/

- `BacklogList.tsx` — BacklogList — uses useMemo (~1854 tok)
- `BoardToolbar.tsx` — BoardToolbar — uses useState (~2661 tok)
- `card-detail.test.ts` — @vitest-environment jsdom // REQ FR-15 (~14187 tok)
- `CardChoice.tsx` — CardChoice (~812 tok)
- `CardDetailModal.tsx` — CardDetailModal (~8293 tok)
- `CardHistoryEntryView.tsx` — HISTORY_PREVIEW_LENGTH — uses useState (~894 tok)
- `CardHistoryPanel.tsx` — CardHistoryPanel — uses useState, useEffect (~702 tok)
- `CardTile.tsx` — CardTile (~3173 tok)
- `DescriptionEditor.test.tsx` — change (~909 tok)
- `DescriptionEditor.tsx` — DescriptionEditor — uses useEffect (~478 tok)
- `DiscoveryLanes.tsx` — STORY_SORT_MODE — renders form — uses useState (~4506 tok)
- `DiscoveryMatrix.tsx` — EPIC_ADD_KEY — uses useState (~6372 tok)
- `lifecycle.test.tsx` — @vitest-environment jsdom // REQ FR-49 (~5916 tok)
- `LifecycleActions.tsx` — LifecycleActions (~398 tok)
- `LifecycleDialog.tsx` — LifecycleDialog — renders modal — uses useState, useRef, useMutation (~1724 tok)
- `LifecycleInventory.tsx` — LifecycleInventory — renders modal — uses useState (~594 tok)
- `MoveAreaDialog.tsx` — MoveAreaDialog — renders modal — uses useState, useRef (~625 tok)
- `ReleaseDeleteDialog.tsx` — ReleaseDeleteDialog — renders modal — uses useRef, useMutation (~558 tok)
- `StoryMapExportActions.tsx` — exportOptions (~623 tok)
- `SwimlaneGrid.tsx` — SwimlaneGrid (~1860 tok)
- `TreeGrid.tsx` — buildWorkItemRefs — uses useMemo (~1852 tok)

## apps/web/src/features/story-map/export/

- `export-with-progress.test.ts` — Declares options (~520 tok)
- `export-with-progress.ts` — Exports exportStoryMapViewAndRecord (~103 tok)
- `story-map-view-export.test.ts` — clone: outerHTML (~602 tok)
- `story-map-view-export.ts` — Exports StoryMapViewKind, StoryMapExportFormat, exportStoryMapView (~4786 tok)

## apps/web/src/features/story-map/views/

- `BacklogView.tsx` — BacklogView — uses useParams, useNavigate (~264 tok)
- `DiscoveryView.tsx` — DiscoveryView — uses useNavigate (~248 tok)
- `PlanningView.tsx` — PlanningView — uses useParams, useNavigate (~265 tok)
- `TimelineView.tsx` — TimelineView — renders chart (~104 tok)
- `TrackingView.tsx` — TrackingView — uses useNavigate (~225 tok)
- `TreeView.tsx` — TreeView — uses useNavigate (~192 tok)

## apps/web/src/styles/

- `foundation.css` — Styles: 125 rules, 22 vars (~3925 tok)
- `global.css` — Styles: 106 rules, 30 vars (~16154 tok)
- `responsive-and-accessibility.css` — Styles: 76 rules, 6 vars (~2374 tok)

## apps/web/src/ui-strings/

- `app.ts` — Exports appStrings (~1710 tok)
- `index.ts` — Exports liveUpdateStrings, conflictStrings, auditStrings, restorePointStrings + 2 more (~7019 tok)
- `story-map.ts` — Exports storyMapStrings (~3875 tok)
- `ui-strings.test.ts` — sourceRoot: sourceFiles, render, hasLiteralCopy, hasCopyAttribute, visit (~3436 tok)

## docs/

- `agent-tooling.md` — Agent tooling for StoryMapper (RTK, code-review-graph, OpenWolf) (~889 tok)
- `bmad-epic-preparation.md` — Epic preparation (detail plans) (~658 tok)
- `bmad-loop.md` — bmad-loop for StoryMapper (~2806 tok)
- `mcp-tools.md` — MCP Tools (~3726 tok)
- `RUNBOOK.md` — StoryMapper Runbook (~3615 tok)
- `usability-report.md` — StoryMapper Usability-Report: Erstnutzung durch einen PO (~4157 tok)

## docs/adr/

- `0001-runtime-tool-call-activity.md` — Record unscoped tool calls as runtime Activity (~731 tok)
- `0002-bump-card-version-on-coalesced-save.md` — Bump the Card version on every accepted save (~551 tok)
- `0003-changeset-file-and-remote-effect-boundary.md` — ChangeSet atomicity for files and remote effects (~562 tok)
- `0004-optional-agent-changeset-approval.md` — Optional Agent approval of ChangeSets (~761 tok)
- `0009-canonical-github-identity-in-external-refs.md` — Canonical GitHub identity in external references (~454 tok)

## docs/templates/

- `bug-ticket-template.md` — Problem und Kontext (~419 tok)
- `epic-template.md` — Strategische Einordnung (~240 tok)
- `feature-template.md` — Einordnung (~341 tok)
- `spike-template.md` — Spike (~236 tok)
- `story-template.md` — User Story (~465 tok)
- `task-template.md` — Task (~92 tok)
- `theme-template.md` — Theme (~55 tok)

## local-projects/

- `.gitkeep` (~1 tok)

## packages/ai/

- `package.json` — Node.js package manifest (~146 tok)
- `tsconfig.json` — TypeScript configuration (~43 tok)

## packages/ai/src/

- `index.ts` (~39 tok)

## packages/ai/src/prompt-templates/

- `templates.ts` — Exports AiFunctionTemplate, defaultAiFunctionTemplates (~641 tok)

## packages/ai/src/proposal-engine/

- `propose-map.ts` — Exports proposeMapSkeletonFromChunks (~268 tok)

## packages/ai/src/providers/

- `provider.ts` — Exports ModelProviderKind, ModelProviderProfile (~85 tok)

## packages/contracts/

- `package.json` — Node.js package manifest (~184 tok)
- `tsconfig.json` — TypeScript configuration (~40 tok)
- `vitest.config.ts` — Vitest test configuration (~64 tok)

## packages/contracts/src/

- `base-version.test.ts` — Declares id (~788 tok)
- `index.ts` (~178 tok)
- `migration.test.ts` — Declares id (~3686 tok)

## packages/contracts/src/api/

- `application-responses.ts` — Exports ListProjectsResponse, ListStoryMapsResponse, ListRoadmapsResponse, ListSourceDocumentsResponse + 43 more (~1500 tok)
- `card-customization.ts` — Zod schemas: bulkUpdateCardsPatchSchema, bulkUpdateCardsResponseSchema, cardAttachmentResponseSchema, cardAttachmentsResponseSchema + 8 more (~3347 tok)
- `commands.ts` — Zod schemas: baseVersionBodySchema, baseVersionQuerySchema (~637 tok)
- `http.ts` — Zod schemas: listProjectsResponseSchema, restorePointProjectParamsSchema, createRestorePointRequestSchema, createRestorePointResponseSchema + 26 more (~6080 tok)
- `tool-proposals.ts` — Zod schemas: repositorySchema, copyStoryMapProposalRequestSchema, githubBoardIssueSchema, githubBoardProposalRequestSchema (~610 tok)

## packages/contracts/src/events/

- `domain-events.ts` — Zod schemas: domainEventSchema (~262 tok)
- `live-events.test.ts` — Declares epoch (~420 tok)
- `live-events.ts` — Zod schemas: liveEntitySchema, liveCursorSchema, liveEventIdSchema (~444 tok)

## packages/contracts/src/mcp/

- `tool-inputs.test.ts` — Declares projectId (~946 tok)
- `tool-inputs.ts` — Zod schemas: projectInputSchema (~2320 tok)
- `tools.ts` — Zod schemas: mcpToolNameSchema, listStoryMapsToolInputSchema, storyMapToolInputSchema, cardDetailsToolInputSchema + 13 more (~1846 tok)

## packages/contracts/src/schemas/

- `application.ts` — Exports capabilityKinds, CapabilityKind, CapabilityDescriptor (~73 tok)
- `audit.test.ts` — Declares id (~537 tok)
- `audit.ts` — Zod schemas: toolCallMetadataSchema, activityCursorSchema, activityQuerySchema, activityResponseSchema (~546 tok)
- `conflicts.ts` — Zod schemas: baseVersionSchema, conflictEntrySchema, conflictResponseSchema (~180 tok)
- `domain.ts` — Zod schemas: uuidSchema, sha256HexSchema, cardLevelSchema, workflowGroupSchema + 28 more (~8037 tok)
- `errors.ts` — Exports domainErrorCodes, DomainErrorCode, DomainError, ErrorResponseBody, toErrorResponse (~484 tok)
- `github-identity.test.ts` (~336 tok)
- `health.ts` — Zod schemas: operationalHealthSchema (~125 tok)
- `project-archive.ts` — Zod schemas: projectArchiveExportQuerySchema, projectArchiveCapabilities (~154 tok)
- `restore-points.ts` — Zod schemas: restorePointClassSchema, restorePointSchema, restorePointCapabilitySchema, restorePoint (~745 tok)
- `sync-results.ts` — Zod schemas: syncFailurePhaseSchema, syncFailureDetailsSchema, syncItemResultSchema (~251 tok)

## packages/core/

- `package.json` — Node.js package manifest (~141 tok)
- `tsconfig.json` — TypeScript configuration (~40 tok)
- `vitest.config.ts` — Vitest test configuration (~98 tok)

## packages/core/src/

- `default-ai-templates.ts` — Exports defaultAiFunctionTemplates (~731 tok)
- `index.ts` (~233 tok)

## packages/core/src/audit/

- `events.ts` — Exports createActivityEvent (~246 tok)
- `summaries.test.ts` — Declares ActivityEvent (~726 tok)
- `summaries.ts` — Exports summarizeActivity (~129 tok)

## packages/core/src/changesets/

- `changeset.ts` — Exports createChangeSet, summarizeChangeSet, assertChangeSetCanApply (~318 tok)

## packages/core/src/proposals/

- `ai-proposals.ts` — Exports proposalOperations, selectedStoryCards (~2883 tok)
- `proposal-builders.ts` — Exports buildMapProposalChangeSet, buildBacklogGroomingChangeSet (~1223 tok)
- `proposals.test.ts` — operationContext: card, proposal (~2445 tok)
- `release-slice.ts` — Exports buildReleaseSliceOperations (~367 tok)

## packages/core/src/publishing/

- `export-files.ts` — Exports buildStoryMapExport, buildAuditExport (~486 tok)
- `export-formatters.ts` — Exports buildGitHubIssueBody, githubIssueTypeForCard, buildStoryMapMarkdown, appendCardMeta + 5 more (~1815 tok)
- `publish-provider.ts` — Exports PublishTarget, PublishPlan, PublishResult, PublishProvider (~138 tok)
- `sync-fields.test.ts` — Declares connection (~369 tok)
- `sync-fields.ts` — Exports normalizeRemoteWorkItemTitle, replaceSyncStatusLabels (~187 tok)

## packages/core/src/release-slicing/

- `slice.ts` — Exports ReleaseSliceCandidate, proposeHappyPathSlice (~182 tok)

## packages/core/src/reports/

- `reports.test.ts` — timestamp: card, release, reportInput (~1740 tok)
- `reports.ts` — Exports buildSourceDocumentSummary, buildBacklogHealthReport, buildSourceCoverageReport, buildReleaseSummaryReport + 2 more (~1613 tok)
- `roadmap.ts` — Exports buildRoadmapDetails, buildRoadmapCardReport (~579 tok)
- `sync-health.test.ts` — timestamp: fixture (~1212 tok)
- `sync-health.ts` — Exports sameSyncStatusLabels, buildGitHubSyncHealthReport, buildWorkItemSyncHealthReport (~1059 tok)

## packages/core/src/source-linking/

- `coverage.ts` — Exports SourceCoverageInput, SourceCoverageSummary, calculateSourceCoverage (~205 tok)

## packages/core/src/story-map/

- `hierarchy.test.ts` — now: card (~400 tok)
- `hierarchy.ts` — Exports HierarchyIssue, validateCardHierarchy, getChildren, getStoryMapColumns, reindexSiblingPositions (~511 tok)
- `template.test.ts` — Declares template (~764 tok)
- `template.ts` — Exports sampleStoryMapTemplate, createStoryMapFromTemplate (~490 tok)
- `visibility.test.ts` — Declares card (~459 tok)
- `visibility.ts` — Exports visibleCards (~227 tok)

## packages/core/templates/

- `sample-story-map.json` (~226 tok)

## packages/db/

- `package.json` — Node.js package manifest (~209 tok)
- `tsconfig.json` — TypeScript configuration (~40 tok)
- `vitest.config.ts` — Vitest test configuration (~178 tok)

## packages/db/src/

- `ai-templates.test.ts` — actor: fixture (~2409 tok)
- `archive-database.ts` — Exports ArchiveValidationError, archiveDevelopmentSchemaVersion, validateArchiveDatabase, prepareImportedDatabase (~2262 tok)
- `connection.ts` — Exports SqliteDatabase, openExistingStoryMapperDb, openStoryMapperDb (~5713 tok)
- `database-handle.ts` — Exports DatabaseOwnership, DatabaseHandle, TransactionContext, assertSynchronous, RepositoryContext (~1820 tok)
- `index.ts` (~134 tok)
- `live-change-tracking.ts` — Exports LiveRoot, trackLiveRoot, finalizeLiveRoots, trackLiveActivity (~1083 tok)
- `live-events.test.ts` — ACTOR: fixture (~4001 tok)
- `live-events.ts` — Exports LiveTransactionState, readLiveCursor, databaseLiveCursor, finalizeLiveTransaction, replayLiveTransactions (~1171 tok)
- `native-probe.mjs` — Exports probeNativeSqlite (~66 tok)
- `restore-failures.test.ts` — actual: fixture (~2111 tok)
- `restore-history.ts` — Exports laterGitHubLinks, prepareRestoredHistory (~1160 tok)
- `restore-point-files.ts` — Exports listRestorePointFiles, nextRestorePointSequence, retainRestorePointFiles (~862 tok)
- `restore-points.test.ts` — RestorePoint: fixture, readPoint, resizePoint (~6481 tok)
- `restore-points.ts` — Exports restorePointDirectory, developmentSchemaVersion, listRestorePoints, createRestorePoint, runProtectedMigration (~1324 tok)
- `restore-project.test.ts` — RestoreProjectResult: fixture, proposed, prepared (~7190 tok)
- `restore-project.ts` — Exports restoreProject (~1733 tok)
- `restore-recovery.ts` — Exports removeDatabaseSidecars, publishRollbackDecision, replaceWithProtectedSnapshot, publishPreparedRestore + 2 more (~2258 tok)
- `restore-validation.ts` — Exports RestoreValidationError, databaseSchemaVersion, validateRestoreDatabase (~395 tok)
- `snapshot.test.ts` — Declares cleanup (~1594 tok)
- `snapshot.ts` — Exports RedactedSnapshot, createRedactedSnapshot (~1786 tok)
- `source-document-migration.test.ts` — Declares directories (~855 tok)
- `sqlite-path.ts` — DESIGN SQLite requires extended Windows paths for long restore-point filenames. (~101 tok)
- `unit-of-work.test.ts` — SqliteDatabase: fixture, state (~11334 tok)
- `unit-of-work.ts` — Exports TransactionRepositories, UnitOfWork (~767 tok)

## packages/db/src/fixtures/

- `archive-demo.ts` — Exports archiveDemoSecrets, archiveBusinessTables, archiveDemoActor, populateArchiveDemo, archiveBusinessRows (~1106 tok)
- `restore-crash.ts` — Declares path (~616 tok)
- `runtime-audit.mjs` — Exports readToolCallCount (~104 tok)
- `runtime-inspection.ts` — Exports inspectRuntimeDatabase, openWalPinnedReader (~318 tok)

## packages/db/src/migrations/

- `.gitkeep` (~1 tok)

## packages/db/src/repositories/

- `ai-templates-repository.ts` — Exports seedAiTemplates, listAiTemplates, getAiTemplate, createAiTemplate + 2 more (~1315 tok)
- `audit-repository.ts` — Exports listActivity, listActivityPage, listAuditExportActivity, logMcpToolCall, logActivity (~2017 tok)
- `card-history-repository.ts` — Exports listCardHistoryPage (~576 tok)
- `card-history.test.ts` — ActorContext: fixture (~2143 tok)
- `card-provenance.test.ts` — ActorContext: fixture, state (~8015 tok)
- `card-visibility.test.ts` — ACTOR: fixture (~2946 tok)
- `cards-repository.ts` — Exports listCards, getCardDetails, listCardsInInsertionOrder, createCard + 6 more (~7036 tok)
- `changesets-repository.ts` — Exports listChangeSets, getChangeSet, createChangeSet, updateChangeSetStatus, applyChangeSet (~2894 tok)
- `customizations-repository.ts` — Exports listWorkflowStatuses, createWorkflowStatus, updateWorkflowStatus, deleteWorkflowStatus + 12 more (~6174 tok)
- `getting-started-store.ts` — Exports GettingStartedStore (~946 tok)
- `getting-started.test.ts` — Database: fixture, rows, persistedState, connection, failCompletion (~18933 tok)
- `map-copy-repository.ts` — Exports storyMapCopyRows, mapFingerprint, storyMapInventory, copyStoryMap (~1472 tok)
- `project-repository.ts` — Exports ProjectRepository (~534 tok)
- `projects-repository.ts` — Exports assertAgentWriteSafety, ensureSeedData, createProjectWithGettingStarted, initializeGettingStarted + 14 more (~5127 tok)
- `release-report-data.test.ts` — Declares TEST_ACTOR (~2349 tok)
- `releases-repository.ts` — Exports listReleases, createRelease, updateRelease, moveRelease + 5 more (~1963 tok)
- `repository-errors.ts` — Exports ReleasePositionError, ChangeSetConflictError (~178 tok)
- `repository-values.ts` — Exports hashText, labelsForStatus, stateForStatus, unique + 20 more (~1971 tok)
- `roadmaps-repository.ts` — Exports listRoadmaps, createRoadmap, updateRoadmap, getRoadmapDetailsData + 10 more (~2931 tok)
- `root-versions.test.ts` — SqliteDatabase: fixture, versions, databaseState, latestHistory (~10011 tok)
- `root-versions.ts` — Exports createRootVersion, bumpRootVersion (~396 tok)
- `row-mappers.ts` — Exports toProject, toStoryMap, toCard, toRelease + 24 more (~3535 tok)
- `source-document-import.test.ts` — Declares actor (~972 tok)
- `sources-repository.ts` — Exports importSourceDocument, listSourceDocumentSummaryData, getSourceDocumentDetails, createCardSourceLink + 7 more (~4948 tok)
- `storymapper-repository.test.ts` — Declares TEST_ACTOR (~14075 tok)
- `storymapper-repository.ts` — Exports StoryMapperRepository (~8960 tok)
- `tool-proposals-repository.ts` — Exports proposeStoryMapCopy, proposeGitHubBoard, applyToolProposal (~4966 tok)
- `work-item-repository.ts` — Exports listConnectorConnections, getConnectorConnection, publicConnectorConnection, createConnectorConnection + 6 more (~7188 tok)

## packages/db/src/schema/

- `classification.ts` — Exports aggregateTables, redactedTables, redactedActivityEntityTypes, assertClassifiedTables (~348 tok)
- `index.ts` (~18 tok)
- `tables.ts` — Exports projects, projectSettings, storyMaps, releases + 18 more (~5101 tok)

## packages/db/src/seed/

- `.gitkeep` (~1 tok)

## packages/github/

- `package.json` — Node.js package manifest (~151 tok)
- `tsconfig.json` — TypeScript configuration (~43 tok)

## packages/github/src/

- `index.ts` (~56 tok)

## packages/github/src/auth/

- `auth-source.ts` — Exports GitHubAuthSource, GitHubConnectionSettings (~53 tok)

## packages/github/src/conflict-resolution/

- `conflicts.ts` — Exports GitHubSyncConflict, hasGitHubConflict (~83 tok)

## packages/github/src/mapping/

- `status-mapping.ts` — Exports GitHubStatusMapping, defaultStatusMappings (~176 tok)

## packages/github/src/providers/

- `github-provider.test.ts` — Declares SyncPlanItem (~4539 tok)
- `github-provider.ts` — Exports GitHubProvider (~4373 tok)
- `index.ts` — Exports createWorkItemProvider (~128 tok)
- `work-item-provider.ts` — Exports ProviderAuth, RemoteIteration, RemoteWorkItem, CreatedRemoteWorkItem + 2 more (~415 tok)

## packages/github/src/sync/

- `dry-run.ts` — Exports GitHubIssueDryRun, buildIssueDryRun (~121 tok)

## packages/importers/

- `package.json` — Node.js package manifest (~174 tok)
- `tsconfig.json` — TypeScript configuration (~43 tok)

## packages/importers/src/

- `index.ts` (~66 tok)

## packages/importers/src/docx/

- `import-docx.ts` — Exports importDocxDocument (~51 tok)

## packages/importers/src/images/

- `import-image.ts` — Exports importImageDocument (~39 tok)

## packages/importers/src/markdown/

- `import-markdown.test.ts` — Declares chunks (~142 tok)
- `import-markdown.ts` — Exports ImportedDocument, importMarkdownDocument, splitMarkdownIntoChunks (~557 tok)

## packages/importers/src/pdf/

- `import-pdf.ts` — Exports importPdfDocument (~51 tok)

## packages/importers/src/txt/

- `import-txt.test.ts` — Declares chunks (~143 tok)
- `import-txt.ts` — Exports splitTextIntoChunks (~85 tok)

## packages/importers/src/xlsx/

- `import-xlsx.ts` — Exports importXlsxDocument (~51 tok)

## packages/mcp/

- `package.json` — Node.js package manifest (~216 tok)
- `tsconfig.json` — TypeScript configuration (~43 tok)

## packages/mcp/src/

- `index.ts` (~48 tok)

## packages/mcp/src/permissions/

- `permissions.ts` — Exports McpPermissionSettings, proposalOnlyPermissions, canUseTool (~156 tok)

## packages/mcp/src/tool-definitions/

- `capabilities.ts` — Exports generatedMcpToolDefinitions (~2944 tok)
- `tools.ts` — Exports StoryMapperMcpToolDefinition, storyMapperMcpTools (~119 tok)

## packages/mcp/src/tool-handlers/

- `registry.ts` — Exports McpToolHandler, McpToolRegistry (~416 tok)

## packages/mcp/src/transports/

- `server.ts` — Exports createStoryMapperMcpServer, invokeMcpTool (~453 tok)

## scripts/

- `bmad-loop-preflight.mjs` — Fail-fast checks before unattended bmad-loop resume/resolve. (~672 tok)
- `bmad-loop-reconcile-sprint.mjs` — Reconcile finished bmad-loop run state when stories were completed outside the (~1151 tok)
- `bmad-loop-resume.sh` — Run bmad-loop preflight, then forward to bmad-loop (resolve/resume/run/…). (~220 tok)
- `capability-artifacts.mjs` — Exports capabilityArtifactPaths, toolMetadata, serializeToolDefinitions, generatedMcpToolDefinitions, serializeToolDocumentation (~1239 tok)
- `capability-scan.mjs` — Exports applicationDirectory, scanCapabilitySource, scanCapabilities, checkDescriptorRegistry, serializeCapabilities (~1868 tok)
- `capability-scan.test.mjs` — Zod schemas: mcpToolNameSchema (~2397 tok)
- `capability-surface.mjs` — Exports checkToolSurface (~1342 tok)
- `check-capabilities.mjs` — Exports checkCapabilities (~404 tok)
- `check-hygiene.mjs` — Exports findViolations, checkHygiene (~624 tok)
- `check-hygiene.test.mjs` — Declares letters (~952 tok)
- `commands.test.mjs` — Declares result (~7101 tok)
- `diagnostics.mjs` — Exports commandOptions, checkDependencies, readableFile, webBuildPresent + 5 more (~1787 tok)
- `doctor.mjs` — Declares env (~512 tok)
- `doctor.test.mjs` — checkoutSnapshot: visit, assertSevenChecks, privateDependency (~7675 tok)
- `failures.test.mjs` — Declares secret (~522 tok)
- `generate-capability-manifest.mjs` — Declares root (~200 tok)
- `german-stop-words.txt` (~68 tok)
- `launcher.mjs` — Exports productionCommand, launch (~1600 tok)
- `mcp-bridge.mjs` — API routes: GET (2 endpoints) (~1439 tok)
- `mcp-tool-metadata.json` (~966 tok)
- `processes.mjs` — Exports ownedProcess, stopProcess, run, commandMain (~1388 tok)
- `runtime-port.test.mjs` — Declares foreign (~2320 tok)
- `runtime.mjs` — Exports repository, corepackEntry, checkNode, checkCorepack + 8 more (~2040 tok)
- `setup.mjs` (~316 tok)
- `start.mjs` — Declares environment (~175 tok)
- `verify.mjs` — gitHygiene: projectFolder (~625 tok)

## scripts/fixtures/

- `browser.mjs` — Declares config (~245 tok)
- `checkout.mjs` — Exports git, fixture, interrupt, ownedServerPid + 7 more (~2132 tok)
- `command.mjs` — Declares config (~296 tok)
- `descendant.mjs` — Declares config (~87 tok)
- `preload.mjs` — Declares directory (~887 tok)
- `server.mjs` — Declares config (~451 tok)

## tools/

- `copy_story_map.py` — Copy a story map by name to a new story map. (~2965 tok)
- `import_github_board_view.py` — from: graphql, get_json, request, main + 7 more (~12296 tok)

## tools/github_api/

- `__init__.py` (~15 tok)
- `cli.py` — configure_logging, build_client, write_json, positive_int + 1 more (~321 tok)
- `client.py` — GitHubApiError: get_json, graphql, paginate_get (~1709 tok)
- `env.py` — find_repo_root, load_env, require_token (~522 tok)
- `gh_cli.py` — get_issue_via_gh, get_issues_from_refs_via_gh, resolve_issue_refs_via_gh, resolve_issue_number_via_gh + 3 more (~4267 tok)
- `issues.py` — search_issues, list_repo_issues, get_issue, get_issues_from_refs + 3 more (~2006 tok)
- `projects.py` — get_project, list_project_views, list_project_items (~3304 tok)
- `ticket_cache.py` — from: model_validate, model_dump, model_validate, model_dump + 8 more (~3420 tok)
