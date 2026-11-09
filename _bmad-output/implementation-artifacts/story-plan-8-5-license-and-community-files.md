---
epic: 8
story: 5
status: ready
date: 2026-10-19
version: 1
epic_preparation: epic-8-preparation.md
---

# Story Plan 8.5: License and community files

Reproducing statement: Plan private independent MIT publication, English community files and generic templates, applying the maintainer's explicit waiver of name checks and permission for private-detail placeholders.

## Intent

Contributors can identify MIT licensing, contribution expectations, conduct rules and private security-reporting instructions without employer/team-specific process.

## Cross-story constraints

- Follow [Preparation](epic-8-preparation.md): private publication independent of the employer; MIT/StoryMapper retained; no employer approval or name checks required.
- The maintainer explicitly permits private-detail placeholders. Do not invent a legal identity or email address. Required contact/license placeholders remain publication blockers until supplied.
- 8.3 owns dependency-license checking; 8.6 rewrites product documentation and 8.7 audits the complete publication surface.

## Design decisions (this story)

Add root `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` in English. Use MIT text with `[COPYRIGHT_HOLDER]` where private data is absent; use `[PRIVATE_SECURITY_CONTACT]` and `[CONDUCT_CONTACT]` for absent private channels. Explain explicitly that a placeholder is not a live reporting destination and must be filled before publication. Do not publish an invented address or route vulnerabilities into public issues.

Generalize the existing `.github/ISSUE_TEMPLATE/*.yml` and config, then add a PR template. Retain only generic actionable fields; remove team identifiers, private-board routing, company defaults and unused template categories where justified by actual contributor needs. Do not create real issues or send messages. Preserve accessibility and valid GitHub template syntax.

CONTRIBUTING uses the actual Node 24/Corepack setup, 8.3 check command, review/spec workflow and required CI checks. State who can merge/release without inventing a maintainer identity. Keep private-detail markers recognizable by the 8.7/8.8 publication gate.

## Task sequence

1. Record the accepted 2026-10-19 scope decision in runnable story notes: private independent MIT release, no name searches and explicit placeholder exception.
2. Root `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md`: write the selected text/process with the agreed marker names, avoiding unsupported support contacts or private security features claimed to be enabled.
3. Root `CONTRIBUTING.md`: document real install/test/check/review commands and required platform check names supplied by 8.3/8.4; link current architecture and instructions.
4. `.github/ISSUE_TEMPLATE/*.yml`, `config.yml`, new `.github/PULL_REQUEST_TEMPLATE.md`: generalize/translate existing templates and validate links/field structure.
5. Run 8.3's dependency-license gate and validate Markdown links/template syntax. Record unresolved private markers as accepted story output and separate publication prerequisites, not resolved audit findings.

## Preliminary code map

- Existing `.github/ISSUE_TEMPLATE/{01-feature,02-bug,03-epic,04-story,05-task,06-spike,07-theme}.yml`, `config.yml`.
- New root community files and PR template; `docs/templates` may supply generic patterns but employer-specific text is not copied.
- Root manifest/scripts, `docs/bmad-loop.md`, `AGENTS.md`, architecture spine and 8.3 license rules.

## Acceptance outline

- **Given** root community files **When** inspected **Then** all four exist in English and licensing is MIT with only explicitly permitted absent private-detail markers.
- **Given** SECURITY.md **When** read **Then** the private reporting procedure is clear and any missing contact is explicitly inactive/pending, never a public vulnerability-report instruction.
- **Given** existing issue/PR templates **When** inspected **Then** syntax is valid, fields are generic English and employer/team routing is absent.
- **Given** dependencies **When** the license check runs **Then** all resolved licenses pass the selected MIT-compatible rules or fail explicitly.
- **Given** start notes **When** reviewed **Then** the private publication decision and waived name checks are recorded without claiming those searches occurred.

## Out of scope

Name/trademark searches, employer approval, inventing personal data, legal certification, remote repository security settings, real reports/messages or first publication.

## Risks and mitigations

- Placeholder permission is not a working reporting channel: keep markers machine-detectable and blocked at publication.
- Template generalization can leave private defaults in config or URLs: inspect all existing templates/config, not only displayed labels.

## Open questions

None. The maintainer chose placeholders; their final values are a later publication prerequisite.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-19 | Maintainer-approved private publication scope and placeholder contract |
