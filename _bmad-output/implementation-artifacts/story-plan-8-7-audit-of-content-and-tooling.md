---
epic: 8
story: 7
status: ready
date: 2026-10-19
version: 1
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.7: Audit of content and tooling

Reproducing statement: Plan complete tracked-content and reachable-history audit, remove all employer references and unsafe material, and provide a sanitized blocking publication result without rewriting history or publishing.

## Intent

The maintainer receives concrete resolved current-tree findings and an honest history/publication decision record, with no sensitive contents exposed in the report.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md): remove all employer-specific references, including the company identifier supplied by the maintainer, throughout current tracked files.
- No employer approval or name checks; private-detail placeholders are permitted during implementation but remain explicitly unresolved publication prerequisites.
- 8.8 consumes a machine-checkable publication verdict; 8.9 changes require a final rescan on the eventual exact publication candidate.

## Design decisions (this story)

Inventory current tracked paths and reachable Git history, including commit messages and blobs, branches/tags selected for publication, binaries, tooling, templates, copied skills, planning artifacts and publishable evidence. Never read ignored credential/user-data directories merely to perform this audit. A shallow/incomplete history scan must report incomplete and block publication, not return clean.

Findings identify category, safe path/revision, owner role, resolution and validation state without secret values, personal excerpts or private URLs. Configure scanner output redaction before running; do not first write raw secrets into logs and redact later. If an actual credential is discovered, retain only safe fingerprint/location evidence and report required rotation; do not silently rewrite history, access the account or send messages.

Remove or generalize employer references across code/defaults/config/docs/skills/templates/planning/evidence, then search the whole current tracked tree again. Preserve useful generic functionality; do not merely rename private defaults while retaining private URLs/board ids. Remove retired provider references from current files as required by the epics; historical commits remain audit findings until final disposition. Audit reports should use category descriptions rather than repeat content that the cleanup is supposed to remove.

For `docs/story-mapping-playbook.pdf`, obtain actual redistribution provenance or remove the tracked file and fix inbound links. Apply the same evidence standard to other third-party assets; no copyright assumptions from being tracked. Keep both surviving GitHub skill copies synchronized, and do not replace global personal instructions outside this repo.

Produce a minimal sanitized report and a deterministic publication gate that 8.8 can invoke. It checks report schema/completeness, unresolved findings, required private-detail markers, applicable scan scope and exact candidate freshness. Do not use a self-referential report-file hash; fingerprint the audited publication content with explicit treatment of the report itself, then validate report integrity separately. A changed candidate needs a rescan, not a manually flipped clean flag. History findings remain until the maintainer chooses rewrite/fresh repository and the actual result is rescanned.

## Task sequence

1. Tracked tree/Git objects: build scope and scanner plan with safe diagnostics; record revision, history completeness, binary coverage and tool versions.
2. `tools/`, `.agents/skills`, `.claude/skills`, `docs/templates`, `.github/ISSUE_TEMPLATE`, `.cursor/rules/card-authoring.mdc`, `docs/usability-report.md`: inspect, generalize/translate/remove employer-specific content while preserving required generic use cases.
3. Entire current tracked repository, including instructions, `_bmad-output`, `.wolf` and evidence: remove remaining company/customer/provider/private content within scope; do not create a fresh report that republishes the removed content.
4. `docs/story-mapping-playbook.pdf` and other third-party assets: attach provenance evidence or remove and repair links. Do not extract sensitive binary contents into tool output.
5. Proposed `scripts/check-publication.mjs` and sanitized audit report: implement the blocking verdict/freshness contract; test unresolved/incomplete/stale/placeholder/tool-failure refusal with safe fixtures. Keep dependency audit as its separate gate.
6. Rescan current tree and full reachable history; record resolved findings, unresolved history/private-detail actions and final maintainer disposition prerequisites. Rerun normal quality checks to verify generalized tooling still works; do not rewrite Git history, push or send reports elsewhere.

## Preliminary code map

- `tools/`, both GitHub skill trees, `.github/ISSUE_TEMPLATE`, `.cursor/rules/card-authoring.mdc`, `docs/templates`, `docs/usability-report.md`.
- `docs/story-mapping-playbook.pdf`; README/runbook/current instruction and planning files.
- `scripts/check-hygiene.mjs`, `scripts/verify.mjs`, 8.3 aggregate and license checker.
- 8.5 private-detail markers and community files; future 8.8 workflow.
- Existing `.gitignore` defines protected local data exclusions; it must not be used to hide tracked findings.

## Acceptance outline

- **Given** tracked files and complete reachable history **When** audited **Then** findings for secrets, personal/employer/customer content and redistribution rights have safe locations and explicit resolutions.
- **Given** the existing PDF **When** completing current-tree cleanup **Then** redistribution is evidenced or the file and obsolete links are removed.
- **Given** tools/skills/templates and all other current tracked files **When** rescanned **Then** employer-specific references and retired-provider mentions required to be removed are absent, including in new reports.
- **Given** unresolved history findings, required private markers, stale scope or incomplete scanner results **When** the publication gate runs **Then** publication is blocked with actionable sanitized reasons.
- **Given** a later changed candidate, including 8.9 content **When** checked **Then** prior clean evidence cannot silently authorize publication of unaudited changes.

## Out of scope

History rewrite/deletion, remote ref cleanup, name checks, invented contact information, credential rotation/account writes, external reports/messages or first public push.

## Risks and mitigations

- Scanning can itself leak findings: use redacted output from the first scan and inspect safe summaries only.
- Instructions/evidence can retain private names after source cleanup: audit every tracked publication file, not just runtime folders.
- Rewriting history is destructive and explicitly deferred: keep publication blocked until the maintainer's final choice and repeat audit.

## Open questions

None for implementation. Final history disposition and private details remain maintainer publication prerequisites.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-19 | Full-surface employer cleanup, provenance evidence and fail-closed publication audit |
