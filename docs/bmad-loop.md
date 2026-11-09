# bmad-loop for Agentic Story Mapper

Stand: 2026-11-08

Dokumentversion: 0.1.13

Reproducing statement: Diese Anleitung beschreibt die eingerichtete `bmad-loop`-Orchestrierung für Agentic Story Mapper (Dev → Verify → unabhängiges Review → Fix → Verify → Story-Commit), die Konfigurationsorte, Multi-CLI-Nutzung (Claude Code, OpenCode, Codex), Test- und Startbefehle sowie die explizite beleggestützte Übernahme externer Abschlüsse.

English contributor sequence: [Agentic-coding walkthrough](agentic-coding.md). The policy/model examples below are machine-local choices; a clone does not include policy, authentication or workspace trust.

Diese Anleitung betrifft optionale Maintainer-Automation zur Entwicklung des Repositorys. Für die Nutzung von Agentic Story Mapper, einschließlich MCP-Anbindung, ist kein Loop erforderlich.

## Kurzantwort: Ist bmad-loop Claude-spezifisch?

Nein. `bmad-loop` ist ein **deterministischer Orchestrator** (Python). Er steuert den Story-Zyklus; die Coding-Agenten sind austauschbare **Adapter/Profile**:

| Profil | Binary | Skills-Pfad | Hooks / Transport |
| --- | --- | --- | --- |
| `claude` | `claude` (Claude Code) | `.claude/skills/` | `.claude/settings.json` + tmux |
| `opencode` / `opencode-http` | `opencode` | `.claude/skills/` | kein Hook-File; eigener HTTP/SSE-Server |
| `codex` | `codex` | `.agents/skills/` | `.codex/hooks.json` + tmux |
| weitere | `gemini`, `copilot`, `antigravity`, Custom | je Profil | siehe `bmad-loop adapters` |

Die sichtbaren `bmad-loop-*`-Ordner unter `.claude/skills/` kommen daher, dass Claude Code (und OpenCode) diesen Skill-Tree nutzen. Für Codex liegen dieselben Skills parallel unter `.agents/skills/`. Welcher Client pro Phase läuft, steuert `.bmad-loop/policy.toml` (`[adapter]`, `[adapter.dev]`, `[adapter.review]`).

## Epic-Vorbereitung (vor dem Loop)

Für eine Epic-Welle mit schwächerem Dev-Modell: zuerst **`/bmad-prepare-epic`** (Epic-Nummer) ausführen. Erzeugt `epic-{N}-preparation.md` und je Story `story-plan-{N}-{M}-{slug}.md` unter `_bmad-output/implementation-artifacts/`. **`bmad-build-auto` Step 02 (Plan)** liest diese Dateien als verbindliche Richtschnur (Regeln: `docs/bmad-epic-preparation.md`, `_bmad/custom/bmad-build-auto.toml`).

## Was der Loop macht

```text
sprint-status.yaml → nächste Story
  → DEV-Session (frisch)     → bmad-build-auto
  → VERIFY                   → typecheck / lint / test
  → REVIEW-Session (frisch)  → unabhängiges Review
  → FIX bei Findings
  → VERIFY erneut
  → ein Story-Commit (bei worktree: squash-merge)
  → nächste Story
```

Dev und Review sind **getrennte Sessions** (kein gemeinsamer Kontext).

## Voraussetzungen

- Python 3.11+, `uv`, Git ≥ 2.34
- Session-Multiplexer für Claude Code / Codex (OpenCode braucht keinen):
  - **macOS/Linux:** `tmux` auf `PATH`
  - **Windows:** `psmux` (`winget install marlocarlo.psmux`). WinGet legt die Binary oft **nicht** auf `PATH`; ohne `psmux` crasht `run`/`resume` mit `WinError 2`. Typischer Ordner: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\marlocarlo.psmux_Microsoft.Winget.Source_8wekyb3d8bbwe` — mit `psmux --version` prüfen oder per `where.exe /R %LOCALAPPDATA%\Microsoft\WinGet psmux.exe` suchen und den Ordner dauerhaft in die Benutzer-`PATH`-Variable eintragen.
- Coding-CLI(s): mindestens der in der Policy genannte Client
- BMAD v6 im Repo (`_bmad/`, `sprint-status.yaml`, Skills `bmad-build-auto` + Review-Layer)
- Tool: `uv tool install "bmad-loop[tui,opencode] @ git+https://github.com/bmad-code-org/bmad-loop.git"`
- Für OpenCode: `opencode` auf PATH; Modelle/Auth wie in `~/.config/opencode/opencode.jsonc` (bei lokalem Main z. B. LM Studio laufen lassen)

## Konfiguration (wo liegt was)

| Artefakt | Pfad | Getrackt? |
| --- | --- | --- |
| Policy | `.bmad-loop/policy.toml` | nein (gitignored, maschinenlokal) |
| Run-State / Logs | `.bmad-loop/runs/`, `.bmad-loop/cache/` | nein |
| Story-Queue | `_bmad-output/implementation-artifacts/sprint-status.yaml` | ja |
| Loop-Skills (Claude/OpenCode) | `.claude/skills/bmad-loop-{resolve,sweep,setup}/` | ja |
| Loop-Skills (Codex u. a.) | `.agents/skills/bmad-loop-{resolve,sweep,setup}/` | ja |
| Claude Hooks | `.claude/settings.json` | ja (enthält absolute `bmad-loop`-Pfade → auf anderer Maschine `init` erneut) |
| Codex Hooks | `.codex/hooks.json` | ja (dito absolute Pfade) |
| OpenCode Modelle | `~/.config/opencode/opencode.jsonc` (+ Projekt-`opencode.jsonc`) | global / ja |

### Lokales Policy-Beispiel (keine Clone-Defaults)

In `.bmad-loop/policy.toml` (lokal, nicht im Git):

- **Gates:** `mode = "none"`, Retro `never` — keine Zwischenfragen / keine Epic-Pausen für Menschen
- **Review:** `enabled = true`, `trigger = "always"`, max. 3 Zyklen; `on_status_contradiction = "retry"` (kein Escalate-Pause)
- **Operator-Park:** `enabled = false` — Agents entscheiden selbst (done/blocked/defer), kein `awaiting-operator`
- **Adapter:** Dev/Triage/Retro = **Codex** (`gpt-6.1-sol` + `model_reasoning_effort=high`); **Review = Claude Code** (`claude-sonnet-5-5` + `--effort high`)
- **Verify:** `corepack pnpm typecheck`, `lint`, `test`
- **SCM:** `isolation = "none"` — Stories nacheinander **im Repo auf dem aktuellen Branch (main)**; nach jeder erfolgreichen Story ein Commit. Keine Worktrees (kein Codex-Trust pro Worktree). `rollback_on_failure = true` (Auto-Revert bei Stall/Retry, sonst manueller Hard-Reset).
- **Mux:** Windows-Policy typisch `backend = "psmux"`; macOS/Linux `backend = "tmux"` (siehe `[mux]` in `.bmad-loop/policy.toml`)

Bypass: Codex nur `--dangerously-bypass-approvals-and-sandbox` in `extra_args`. Claude Review: `--dangerously-skip-permissions`, `--effort high` und **`--permission-mode bypassPermissions`** in `[adapter.review] extra_args` — eigene `extra_args` ersetzen die Profil-Defaults; ohne `bypassPermissions` kann Review auf Permission-Prompts hängen (Harness-Warnung beim Start). Codex-Reasoning high aus `~/.codex/config.toml`.

### OpenWolf (`.wolf/`) in Worktrees

Agents schreiben während der Arbeit automatisch in `.wolf/` (Memory, Anatomy, …). Das ist **gewollt**.

| Art | Beispiele | Git |
| --- | --- | --- |
| Getrackt | `memory.md`, `anatomy.md`, `anatomy-index.json`, `cerebrum.md`, `STATUS.md`, `buglog.json`, `config.json`, `OPENWOLF.md` | mit der Story committen/mergen |
| Ignoriert | `hooks/`, `handoff/`, `activity/`, `usage/`, `updates/`, `*.lock`, `_scan-state.json`, … (siehe `.wolf/.gitignore`) | nie committen |

**Nicht** wegen geänderter getrackter `.wolf/*`-Dateien die Story als `blocked` markieren — sie gehören zum Story-Commit.

### Anderen Client oder Mix nutzen

Hooks + Skills für mehrere CLIs:

```bash
bmad-loop init --project . --cli opencode --cli claude --cli codex
```

Aktuell (Codex Dev + Claude Review):

```toml
[adapter]
name = "codex"
model = "gpt-6.1-sol"
extra_args = ["--dangerously-bypass-approvals-and-sandbox"]

[adapter.dev]
name = "codex"
model = "gpt-6.1-sol"
extra_args = ["--dangerously-bypass-approvals-and-sandbox"]

[adapter.review]
name = "claude"
model = "claude-sonnet-5-5"
extra_args = [
  "--dangerously-skip-permissions",
  "--permission-mode", "bypassPermissions",
  "--effort", "high",
]
```

Codex-Reasoning **high** liegt in `~/.codex/config.toml` (`model_reasoning_effort = "high"`) — nicht in `extra_args` (sonst wird Hook-Trust „unverifiable“).

**Einmalig im Repo:** `codex` starten → Workspace-Trust und „Hooks need review → Trust all and continue“. Ebenso `claude` einmal Trust/Hooks.

**SCM:** Worktrees sind aus (`isolation = "none"`), damit Codex nur das eine Repo-Trust braucht und jede Story direkt auf main committed. `rollback_on_failure = true`, damit ein gestallter In-Place-Versuch automatisch zurückgesetzt wird und der Loop ohne manuellen `git reset --hard` weiterlaufen kann.

**Engine muss leben:** Resume über TUI oder ctl-/tmux-Session — nicht in einer Shell, die nach dem Launch endet. Nach terminalem Spec-Result muss Codex den Prozess beenden (sonst Zombie ohne Stop/post-kill-Rescue).

**Verify = Node 24:** `[verify].commands` mit `PATH=…/node/v24.17.0/bin:$PATH` prefixen (ctl erbt oft Node 22).

**Claude muss eingeloggt bleiben:** Review = Claude Code. Ist `claude auth status` → `loggedIn: false`, parkte die Review-Session auf IdlePrompt (`Not logged in · Run /login`) und eskaliert die Story (gesehen bei 2-7). Vor jedem Resume/Resolve:

```bash
node scripts/bmad-loop-preflight.mjs
# oder gebündelt:
scripts/bmad-loop-resume.sh resolve --story 2-7-portable-project-archive --no-interactive --resume 20261003-002047-b324
```

Liste der Adapter: `bmad-loop adapters`.

## Einmalig vor dem ersten Run

Vor Login oder interaktiven Trust-/Hook-Dialogen zuerst alle nichtinteraktiven Prüfungen ausführen, die erforderliche Aktion/Zeitspanne erklären und explizit bestätigen lassen, dass ein Mensch anwesend ist. Login niemals automatisch starten.

1. `node scripts/bmad-loop-preflight.mjs` unter Node 24 zuerst nichtinteraktiv ausführen; Ergebnisse einschließlich fehlender Authentifizierung protokollieren, bevor Login oder Trust eingerichtet werden.
2. Erst nach separater Bestätigung der menschlichen Anwesenheit die Coding-CLI authentifizieren (`opencode auth login` / `claude auth login` / `codex` je nach Adapter). Claude-Session darf nicht auslaufen, solange Review auf Claude zeigt. Login niemals automatisch starten.
3. Den jeweiligen Client nach bestätigter Anwesenheit **einmal interaktiv** im Repo starten und Trust + Hooks bestätigen (unbeaufsichtigte Sessions können Dialoge nicht beantworten). Bei OpenCode: OAuth einmalig; Headless-Server nutzen die gespeicherten Credentials.
4. Danach `node scripts/bmad-loop-preflight.mjs` erneut ausführen — Node 24 + Claude logged-in + Unattended-Settings müssen vor dem Run erfolgreich geprüft sein.
5. Arbeitsbaum clean halten (`bmad-loop validate` / `run` verlangen das bei Worktree-Isolation).
6. Wenn Main lokal ist: LM Studio (o. ä.) mit den in der OpenCode-Config genannten Modellen laden.

## Testen und starten

```bash
node scripts/bmad-loop-preflight.mjs       # Claude-Login + Node 24
bmad-loop validate                         # bmad-loop Preflight
bmad-loop run --dry-run                    # Plan ohne Sessions
bmad-loop run --max-stories 1              # eine Story
bmad-loop run --story 1-1-english-ui-from-one-string-module
bmad-loop run --epic 1                     # nur Epic 1
bmad-loop tui                              # Dashboard
bmad-loop run                              # Queue abarbeiten
```

Nützliche Begleitbefehle: `bmad-loop status`, `attach`, `stop`, `list`, `diagnose`.

Empfohlene Eskalation: 1 Story → 3 Stories → 1 Epic → gesamtes Backlog. Das lokale Policy-Beispiel verwendet `isolation = "none"`; vor jedem autorisierten Lauf die tatsächliche lokale Policy prüfen.

## Externe Abschlüsse übernehmen

Im Repository-Stamm benötigt `node scripts/bmad-loop-reconcile-sprint.mjs` immer `--run-id` mit der vollständigen Lauf-ID und `--manifest` mit einer JSON-Datei. Ohne `--apply` werden alle Prüfbefehle ausgeführt, aber keine Laufdateien geändert. Erst `--apply` übernimmt den geprüften Abschluss. Voraussetzung ist die über `uv tool dir` auffindbare installierte bmad-loop-Python-Umgebung; deren Dateien werden nicht verändert.

Das Manifest hat genau diese Felder:

| Feld | Inhalt |
| --- | --- |
| `version` | `1` |
| `run_id` | Dieselbe vollständige Lauf-ID wie im CLI-Aufruf |
| `verification_revision` | Vollständiger 40-stelliger Commit-SHA des aktuellen `HEAD` |
| `stories` | Nichtleere Liste mit `story_key`, `delivery_commit`, `spec`, `acceptance` je Story |
| `stories[].delivery_commit` | Exakter vollständiger Liefer-Commit; muss Vorfahr der Prüfrevision sein |
| `stories[].spec` | Objekt mit projekt-relativem `path` und `sha256`; die zugehörige Spec muss im Liefer-Commit und aktuell bytegleich sowie `done` sein |
| `stories[].acceptance` | Nichtleere Liste mit `path` und `sha256`; optional `commit` für einen separat committeden Abnahmebeleg, sonst gilt der Liefer-Commit |

Die Liste muss den gesamten durch Story-/Epic-Filter ausgewählten Laufumfang belegen. Ist die gespeicherte `max_stories`-Grenze durch die Zahl aufgezeichneter Aufgaben erreicht oder überschritten, genügen genau diese Aufgaben; dies entspricht dem Abbruchprädikat des installierten Engines. Ausgewählte Stories ohne aufgezeichnete Aufgabe müssen sowohl bereits `done` sein als auch vollständige Manifest-Belege besitzen. So entstehen keine erfundenen Aufgaben oder beim nächsten Resume noch auswählbare Backlog-Einträge. Eine erforderliche Board-Korrektur erfolgt separat. Mehrdeutige Filter, fehlende Belege, aktive oder nicht prüfbare Engines und belegte Laufsperren verhindern die Übernahme. Ein `done`-Status allein gilt nicht als Nachweis.

Die aktuellen und im Lauf gespeicherten `[verify].commands` müssen nichtleer und identisch sein. Alle Befehle müssen erfolgreich enden; Quell-, Index-, Ref-, Policy-, Manifest- und Lauf-Fingerprints müssen währenddessen stabil bleiben. Der Fingerprint des geprüften Arbeitsstands wird zusätzlich zur Commit-Revision protokolliert.

Vor dem Schreiben werden Originalzustand, Journal, vorhandene `ATTENTION` und Manifest unter dem Lauf in `external-completions/<Manifest-SHA256>/` gesichert. Der neue Journaleintrag bezeichnet die externe Übernahme ausdrücklich. Sessions, Preserve-Refs, unbekannte Felder und historische Fehler bleiben erhalten; die aktive `ATTENTION` wird nach erfolgreichem Zustandswechsel entfernt. Derselbe unveränderte Aufruf ist wiederholbar. Ein unterbrochener Schreibvorgang mit vorhandenem Backup wird zur manuellen Prüfung angehalten. Sprint-Status, Deferred-Work-Ledger, Git-Refs und andere Läufe werden nicht geschrieben; es werden keine Agenten gestartet.

## Related tooling

RTK, code-review-graph und OpenWolf für Claude + OpenCode: siehe `docs/agent-tooling.md`. Alle laufen parallel zu bmad-loop-Hooks.

## Changelog

| Version | Datum | Änderung |
| --- | --- | --- |
| 0.1.13 | 2026-11-08 | Alte Einzelrun-Auswertung aus der Betriebsanleitung entfernt; Maintainer-Scope klargestellt |
| 0.1.12 | 2026-10-21 | Nichtinteraktiven Preflight vor Login/Trust stellen, fehlende Authentifizierung protokollieren und nach bestätigtem interaktivem Setup erneut prüfen |
| 0.1.11 | 2026-10-20 | English walkthrough verlinkt; lokale Policy statt Clone-Defaults und Isolation-Widerspruch korrigiert |
| 0.1.10 | 2026-10-17 | Unsicheren Bulk-Abgleich durch explizite Manifest-Prüfung und gesicherte externe Abschlussübernahme ersetzt |
| 0.1.9 | 2026-10-10 | Epic-Vorbereitung: Skill `bmad-prepare-epic`, Detailpläne für dev step 02 |
| 0.1.8 | 2026-10-03 | SCM isolation=none: Stories sequentiell auf main, ein Commit pro Story (kein Worktree) |
| 0.1.7 | 2026-10-03 | Dev = Codex gpt-6.1-sol high; Review = Claude Opus 5.5 high (nach lokalen OpenCode-Timeouts) |
| 0.1.6 | 2026-10-02 | Auswertung 05a4 (Luna OK, Claude Review nie erreicht); `.wolf` commit-Policy |
| 0.1.5 | 2026-10-01 | Unattended: Retro never, kein Operator-Park, Review-Contradiction retry |
| 0.1.4 | 2026-10-01 | Review = Claude/sonnet; Story-Squash-Commit bleibt auf Zielbranch |
| 0.1.3 | 2026-10-01 | Default-Adapter OpenCode; model/effort leer → OpenCode-Config |
| 0.1.2 | 2026-09-30 | Related tooling um OpenWolf ergänzt |
| 0.1.1 | 2026-09-30 | Link auf RTK / code-review-graph |
| 0.1.0 | 2026-09-30 | Erstversion: Setup, Multi-CLI, Policy-Defaults, Start/Test |
