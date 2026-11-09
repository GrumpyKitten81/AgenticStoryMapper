# Agentic Story Mapper: Release-Abschluss

Datum: 2026-11-08. Version: 7.

Reproducing statement: Release-Reports gegen den gelieferten Stand und die akzeptierten Maintainer-Entscheidungen bereinigen; nur notwendige Abschlussarbeiten und belegte Probleme behalten.

Basis: `bf35489ad5c9f17707fbdcf4f7ec2c02156ba783`. Die bisherigen Reports liefern keinen aktuell bestätigten funktionalen Release-Blocker. Die noch offenen Abschlussarbeiten sind:

1. **Release-Kandidat festlegen und prüfen.** Version und Commit wählen; am finalen Kandidaten `corepack pnpm check` und `node scripts/verify.mjs` mit Node24/pnpm9.15.4 ausführen. Das blockierende Dependency-Audit des Release-Workflows muss erfolgreich sein. Ein früherer erfolgreicher Lauf ersetzt diesen Kandidaten-Nachweis nicht.
2. **Die gewählte Version veröffentlichen.** Nach gesonderter Freigabe dem [Release-Verfahren](RUNBOOK.md#versioned-releases) folgen. Tag und Root-Version müssen zusammenpassen. Bei einem neuen Zielrepository auch die Einstiegslinks anpassen. Bestehende Qualitäts-, Audit- und Publikationsprüfungen bleiben unverändert verbindlich; dieser Report behauptet keinen bestandenen Publikationsscan.

## Bereits nachgewiesen

Setup, Start und der MCP-Ablauf im echten Codex-Host wurden auf einem frischen isolierten Checkout mit dem später gelieferten Patch geprüft: erfolgreiche Projekt-/Map-Abfragen vor Änderungen, eine leere Test-Map, ein nicht angewendeter Vorschlag und Wiederverbindung nach Neustart auf einem anderen Port. Die [Umsetzungsnotiz](../_bmad-output/implementation-artifacts/spec-gh-1-guided-mcp-onboarding.md) dokumentiert40 gezielte Tests, Web-Typecheck und die Grenzen dieses Nachweises. Aktuelle Bedienung: [README](../README.md#quickstart) und [Runbook](RUNBOOK.md).

Die Agent-Regeln und die Paketgrenzenprüfung wurden ebenfalls bereinigt. Frühere Installations-, Größen- oder CI-Findings werden nicht erneut als offene Fehler geführt. Es bleibt bei der beschlossenen schlanken Linux-CI; weitere Betriebssystem-Jobs sind keine Release-Pflicht.

## Bekannte Prüfgrenzen

Der sichtbare Erstnutzer-Durchlauf, persönliche dauerhafte Host-Registrierung und nicht verfügbare Plattform-/Reader-Prüfungen sind nicht vollständig beobachtet. Das ist eine dokumentierte Prüfgrenze, kein nachgewiesener Defekt und keine zusätzliche pauschale Release-Sperre. Zusätzliche Restore-, Export- oder UI-Prüfungen werden bei einem konkreten Fehler oder einer relevanten Änderung gezielt nötig.

Der mögliche Windows-Installationsfehler aus [Issue8](https://github.com/GrumpyKitten81/StoryMapper/issues/8) ist hier nicht reproduziert. Seine Forderung nach verpflichtender Windows-CI ist durch die akzeptierte Linux-CI-Entscheidung überholt. Ein bestätigter Fehler bei der normalen Installation wäre dagegen zu beheben.

Historische Story-Berichte und der [gekürzte Usability-Nachweis](usability-report.md) sind keine aktuelle Aufgabenliste. Es werden weder pauschale Neuschreibungen aufgrund von Herkunftsquoten noch weitere Rechte-/Kontaktkampagnen aus alten Reports gestartet. Die bestehenden Publikationsgates werden dadurch nicht aufgehoben.

## Changelog

- 2026-11-08 v7: Erledigte und überholte Aufgaben entfernt; Release-Abschluss auf Kandidatenprüfung und bewusste Veröffentlichung begrenzt; Prüfgrenzen von belegten Fehlern getrennt.
