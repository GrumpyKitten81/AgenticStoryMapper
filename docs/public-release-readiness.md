# Agentic Story Mapper: Repository-Bereitschaft

Datum: 2026-11-11. Version: 8.

Reproducing statement: Den Abschluss des Repository-Umzugs von optionalen Tag-Releases und einer späteren öffentlichen Freigabe trennen.

## Abschluss von Issue 1

Das neue Repository ist [GrumpyKitten81/AgenticStoryMapper](https://github.com/GrumpyKitten81/AgenticStoryMapper). Für seine Bereitschaft zählen korrekte Clone-/Beitragslinks, die bestehende MIT-Lizenz mit GrumpyKitten81 als Copyright-Halter, konsistente Meldewege über bereinigte GitHub Issues und eine erfolgreiche lokale Prüfung der Dokumentationskorrekturen. Die [Security](../SECURITY.md)- und [Conduct](../CODE_OF_CONDUCT.md)-Regeln versprechen keinen privaten Meldekanal.

Tags, GitHub Releases, eine neue Release-Version, zusätzliche Hosted-CI-Nachweise, Branch-/Tag-Schutz und ein Actions-Secret sind dafür nicht erforderlich. Die [schlanke Linux-CI](adr/0012-minimal-hosted-ci-and-local-verification.md) bleibt auf Pull Requests begrenzt; umfassende Produktprüfungen bleiben lokal. Fehlende Actions-Läufe nach direkten Pushes sind kein nachgewiesener CI-Fehler.

## Optionale spätere Veröffentlichung

Eine Änderung der Repository-Sichtbarkeit benötigt eine separate Maintainer-Entscheidung und eine Prüfung der tatsächlich zu veröffentlichenden Inhalte, Herkunft und Rechte. Der vorhandene `publication-audit.json` betrifft einen alten Kandidaten und ist blockiert; er belegt weder aktuelle Befunde noch eine Freigabe für das neue Repository.

Falls später ein Tag-Release gewünscht ist, gilt das [Release-Verfahren](RUNBOOK.md#versioned-releases): Version und exakten Kandidaten wählen, vollständige lokale Produktprüfung und Verifier unter Node 24/pnpm 9.15.4 ausführen und die bestehenden Dependency-/Publikationsgates erfüllen. `PUBLICATION_POLICY` wird nur von diesem optionalen Release-Workflow benötigt, nicht von der lokalen App. Eine `.env` ersetzt dessen Actions-Secret nicht.

## Vorhandene Nachweise und Grenzen

Setup, Start und der MCP-Ablauf im echten Codex-Host wurden zuvor auf einem isolierten Checkout geprüft. Die [Umsetzungsnotiz](../_bmad-output/implementation-artifacts/spec-gh-1-guided-mcp-onboarding.md) dokumentiert gezielte Tests und ihre Grenzen. Aktuelle Bedienung: [README](../README.md#quickstart) und [Runbook](RUNBOOK.md). Frühere Ergebnisse sind kein Nachweis eines neuen Release-Kandidaten.

Nicht vollständig beobachtete Erstnutzer-, Browser-, Plattform- und Reader-Szenarien bleiben explizite Prüfgrenzen. Sie sind kein bestätigter Defekt und keine zusätzliche pauschale Sperre für den Repository-Abschluss. Ein konkreter Fehler erfordert gezielte Prüfung und Korrektur.

Die Windows-Setup-Untersuchung [Issue 3](https://github.com/GrumpyKitten81/AgenticStoryMapper/issues/3) und die BMAD-Loop-Recovery [Issue 4](https://github.com/GrumpyKitten81/AgenticStoryMapper/issues/4) bleiben getrennte Aufgaben. Historische Story-Berichte und der [Usability-Nachweis](usability-report.md) sind keine aktuelle Pflichtaufgabenliste.

## Changelog

- 2026-11-11 v8: Repository-Abschluss auf die freigegebenen Kriterien begrenzen; optionale Releases, öffentliche Sichtbarkeit und bestehende Prüfgrenzen getrennt dokumentieren.
- 2026-11-08 v7: Release-Abschluss auf Kandidatenprüfung und bewusste Veröffentlichung begrenzen.
