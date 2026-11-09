# Manual validation

Date: 2026-10-21. Version: 1.
Reproducing statement: Retain manual Git/source validation of the bounded README release sentence.

- git diff --check passed.
- Actual .github/workflows/release.yml has push/v* trigger, three-OS quality matrix, blocking advisory audit and publish dependency; this proves configuration only.
- Read Runbook Versioned releases and Verification and publication prerequisites, and supplied CONTRIBUTING. No release/preview/publish command executed.
- git ls-files --error-unmatch confirms changed release target docs/RUNBOOK.md and contributor/workflow files tracked.
- New fragment versioned-releases matches actual heading Versioned releases after lowercasing and replacing the space. Existing verification-and-publication-prerequisites likewise matches the actual heading.
- Existing README relative file links: PRD, Runbook, MCP tools, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE and Architecture spine all tracked. Existing directory links Story 8.6 evidence and Accessibility evidence have tracked descendants.
- Existing Runbook fragments troubleshooting, credentials-and-connection-consent and github-workflow match actual headings after lowercasing/space replacement. Architecture heading AD-6 — Agent access, protection and approval normalizes to ad-6--agent-access-protection-and-approval (em dash and commas removed); matches existing README link.
- Existing local HTTP URL describes launcher address; no app/browser/HTTP acceptance run. No unresolved relative link/anchor ambiguity observed.
- Root package scripts and scripts/check.mjs inspected for check/build/typecheck/test. setup/start/doctor and verifier source confirm commands/flags; no loop invocation.
- Fixture overlay inspected separately: guide, supplied spec, CONTRIBUTING and two BMAD docs; participant export excludes all five.
- No code-review-graph tools available; source and Git inspection used.
- Native Darwin arm64 only; hosted checks, publication/private audit and external-human trial remain outside scope.

## Changelog

- 2026-10-21 v1: Record actual manual target, anchor and command inspection.
