# Security policy

Date: 2026-11-11. Version: 2.

Reproducing statement: Use the repository's GitHub Issues for sanitized security reports without promising a private reporting channel.

## Reporting a vulnerability

Start with a sanitized report through the [GitHub issue chooser](https://github.com/GrumpyKitten81/AgenticStoryMapper/issues/new/choose). Include the affected version or revision, operating system, affected component and a high-level description of the impact. Add reproduction steps only when they use disposable data and reveal no confidential exploit details.

Treat the issue and its attachments as public information, including while repository access is restricted. Do not include credentials, tokens, personal information, confidential exploit details, `.env` files, databases, `local-projects/*.lsm/` folders or private source material. If a useful report requires sensitive details, state that limitation without posting them. This project does not provide or promise a private reporting channel or confidential handling.

## Scope and response

Reports may cover Agentic Story Mapper's local application, HTTP and Model Context Protocol (MCP) interfaces, import/export handling, GitHub integration and repository tooling. Report an affected dependency through the same sanitized process; its upstream project may also have its own reporting process.

There is no published supported-version matrix or guaranteed response or fix deadline. Authorized repository maintainers assess reports, request only information safe to share in the issue, prepare and verify fixes, and document affected versions and mitigations when established. Ordinary bugs use the same issue chooser with sanitized reproduction steps.

## Changelog

- 2026-11-11 v2: Adopt GitHub Issues as the reporting route and remove the inactive private-contact prerequisite.
- 2026-10-20 v1: Add the initial reporting policy.
