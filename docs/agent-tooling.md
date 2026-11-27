# Agent tooling for Agentic Story Mapper (RTK, code-review-graph, OpenWolf)

Stand: 2026-11-27
Dokumentversion: 0.2.2
Reproducing statement: Anleitung zur projektspezifischen Einrichtung von RTK, code-review-graph und OpenWolf für Claude Code und OpenCode neben BMAD/bmad-loop — aus den Prompts zu Multi-Agent-Tooling (Claude + OpenCode).

Diese Werkzeuge sind optionale Maintainer-Integrationen für die Arbeit am Repository. Sie werden weder zum Start von Agentic Story Mapper noch für die MCP-Verbindung eines nutzenden Coding-Agents benötigt. Installations- und Initialisierungsbefehle ändern die lokale Entwicklungsumgebung; nicht als Teil des normalen App-Setups ausführen.

## Passt das zu BMAD / bmad-loop / mehreren Agents?

Die Integrationen ergänzen die Coding-Sessions. Prüfe vor Änderungen die vorhandenen Hook-/Plugin-Konfigurationen und die Hilfe der installierten Version; die folgende Zuordnung ist keine allgemeine Kompatibilitätszusage:

| Tool | Rolle | Claude Code | OpenCode |
| --- | --- | --- | --- |
| **RTK** | verdichtet Bash-Output | `PreToolUse` → `rtk hook claude` | Plugin `~/.config/opencode/plugins/rtk.ts` |
| **code-review-graph** | Code-Graph über MCP | `.mcp.json` + Skills + Hooks | `opencode.jsonc` + `crg-plugin.ts` |
| **OpenWolf** | Projekt-Memory, Anatomy-Index, Handoff, Usage | `.wolf/` + Hooks + Skill/Rules | `.opencode/plugin/openwolf.ts` |

BMAD Skills bleiben unverändert. Die optionalen Claude-Hooks werden erst nach lokaler Einrichtung in `.claude/settings.local.json` aktiviert. Copilot CLI liest auch Claude-Projekteinstellungen aus zusätzlichen Repositories (`--add-dir`); deshalb darf die versionierte `.claude/settings.json` keine maschinenabhängigen Befehle enthalten.

## Binaries (Maschine)

```bash
brew install rtk
uv tool install code-review-graph
npm install -g openwolf@2.5.2
```

Zusätzlich (global / einmalig):

```bash
rtk init -g --agent claude --hook-only --auto-patch
rtk init -g --opencode --auto-patch
code-review-graph install --platform opencode --no-instructions -y
```

## Im Repo

| Pfad | Zweck |
| --- | --- |
| `.claude/hook-settings.template.json` | Vorlage für bmad-loop-, CRG-, RTK- und OpenWolf-Hooks; wird nicht direkt geladen |
| `.claude/settings.local.json` | lokal erzeugte Hooks mit absolutem Pfad zu diesem Checkout |
| `.mcp.json` / `opencode.jsonc` | CRG MCP |
| `.claude/skills/{explore-codebase,review-changes,debug-issue,refactor-safely}/` | CRG Skills |
| `.claude/skills/openwolf/`, `.claude/rules/openwolf.md`, `.claude/commands/*` | OpenWolf Claude-Integration |
| `.opencode/plugin/`, `.opencode/command/` | OpenWolf OpenCode-Plugin + Commands |
| `.wolf/` | Memory, Anatomy, Config (siehe `.wolf/.gitignore`; `hooks/` lokal generiert) |
| `.rtk/filters.toml` | optionale RTK-Filter |
| `AGENTS.md` / `CLAUDE.md` | CRG-, RTK- und OpenWolf-Blöcke **außerhalb** `bmad:context` |

Lokal, nicht committen: `.code-review-graph/`, `.wolf/hooks/`, `.wolf/usage/`, `.wolf/handoff/`, …

## OpenWolf

```bash
openwolf init --agent claude opencode   # einmalig / neue Maschine
openwolf status
openwolf find ChangeSet
openwolf scan                           # Anatomy neu aufbauen
openwolf dashboard                      # Memory, Usage, Hook-Health
openwolf report
```

Wirkung: gemeinsames Projektgedächtnis (STATUS, cerebrum, buglog, anatomy) über Claude- und OpenCode-Sessions; vor Reads Symbol-/Datei-Hinweise; nach Edits Index-Update; Handoff-Checkpoints.

Nach Clone: OpenWolf und die übrigen optionalen Werkzeuge nur für Maintainer-Sitzungen einrichten. `openwolf init --agent claude opencode` stellt `.wolf/hooks/` wieder her, ändert aber auch weitere lokale Projekt- und Benutzerdateien; die Änderungen vorher prüfen. Anschließend aktiviert `node scripts/agent-hooks.mjs install` die verfügbaren Hooks. Das Kommando meldet jede verfügbare oder übersprungene Integration, schreibt bei vollständig fehlenden Voraussetzungen keine Konfiguration und überschreibt keine vorhandene `.claude/settings.local.json`.

Die erzeugten Befehle starten einen versionierten Node-Dispatcher mit absolutem Pfad zu diesem Checkout. Dadurch verwenden sie auch dann diesen Checkout, wenn Copilot CLI ihn über `--add-dir` lädt und das Arbeitsverzeichnis in einem anderen Projekt liegt. Nach einem Umzug des Checkouts die lokale Hook-Datei prüfen und mit dem Installationskommando neu erzeugen. Für reine App- und MCP-Nutzung ist diese Einrichtung nicht erforderlich.

## RTK

```bash
rtk git status
rtk pnpm test
rtk gain
```

## code-review-graph

```bash
code-review-graph status
code-review-graph update
code-review-graph build
code-review-graph detect-changes --brief
```

## Mit bmad-loop

Keine Extra-Policy nötig. Claude-Sessions nutzen die Projekt-Hooks; OpenCode nutzt Plugins unter `.opencode/` bzw. `~/.config/opencode/plugins/`. Review profitiert von Graph + Anatomy; Shell-Output von RTK/OpenWolf-Bash-Governor.

## Changelog

| Version | Datum | Änderung |
| --- | --- | --- |
| 0.2.2 | 2026-11-27 | Maschinenabhängige Hooks lokal einrichten und mit festem Checkout-Pfad ausführen |
| 0.2.1 | 2026-11-08 | Optionale Maintainer-Werkzeuge vom App-/MCP-Einstieg abgegrenzt; pauschale Konfliktfreiheit nicht behauptet |
| 0.2.0 | 2026-09-30 | OpenWolf für Claude + OpenCode ergänzt |
| 0.1.0 | 2026-09-30 | Erstsetup RTK + CRG |
