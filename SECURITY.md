# Security policy

Date: 2026-10-20. Version: 1.

Reproducing statement: Explain private vulnerability reporting for Agentic Story Mapper, with the explicitly permitted missing contact visibly inactive and publication blocked until it is supplied.

## Reporting a vulnerability

Private reporting contact: `[PRIVATE_SECURITY_CONTACT]` — inactive placeholder, not a working address or reporting channel. Publication is blocked until an authorized repository maintainer supplies and verifies a private contact. GitHub private vulnerability reporting is not claimed to be enabled.

Do not put vulnerability details, exploits, credentials, personal information or user Project data in public issues, discussions, pull requests or attachments. While the private contact is inactive, keep the report private; do not substitute a public report or send sensitive details to an unverified address.

Once a verified private contact is published, send a minimal report there: affected version or revision, operating system, affected component, impact, and reproduction steps using disposable, sanitized data. Include a proposed mitigation if known. Do not send tokens, `.env` files, databases, `local-projects/*.lsm/` folders or private source material. Agree on a safe transfer method with the maintainer if further evidence is needed.

## Scope and response

Reports may cover Agentic Story Mapper's local application, HTTP and Model Context Protocol (MCP) interfaces, import/export handling, GitHub integration and repository tooling. Report a dependency vulnerability privately when it affects Agentic Story Mapper; its upstream project may also have its own reporting process. Ordinary bugs without security implications belong in the public bug form with sanitized reproduction steps.

There is no published supported-version matrix or guaranteed response or fix deadline. Include the exact affected revision so maintainers can assess it. Authorized repository maintainers are responsible for privately assessing the report, requesting only necessary evidence, preparing and verifying a fix, and coordinating disclosure with the reporter. Access to report details should be limited to people needed to investigate and fix the issue. Disclosure should avoid exposing credentials or user data and describe affected versions and mitigations when established.

## Changelog

- 2026-10-20 v1: Add private reporting procedure, maintainer responsibilities and inactive-contact publication prerequisite.
