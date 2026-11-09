<!-- Date: 2026-11-08. Version: 2. Reproducing statement: Generate reviewable versioned release notes from exact selected ancestry using escaped subjects without authors, bodies or annotations. Changelog: Align acceptance limits with the accepted local-verification/Linux-CI policy. -->
# Agentic Story Mapper {{VERSION}}

Commit range: `{{RANGE}}`.

{{COMMITS}}

## Upgrade and recovery

Stop Agentic Story Mapper and preserve the complete Project folder before upgrading. Supported release journals migrate forward with a durable pre-migration restore point. Nonempty prototypes without a release journal, newer journals and divergent journals are refused; do not stamp or edit them. Follow the repository's `docs/RUNBOOK.md` for backup and manual recovery instructions.

## Acceptance limits

Release checks enforce the existing quality, dependency-audit and exact-candidate publication gates. Platform, browser, reader and live-account scenarios not actually exercised remain unverified; unavailable environments alone are not a mandatory multi-OS release gate. Record observed coverage and any known limitations according to docs/RUNBOOK.md. Passing checks does not replace the existing declaration, content/history or contributor-material publication requirements.
