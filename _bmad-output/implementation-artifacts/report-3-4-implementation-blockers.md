# Report: Wo die Umsetzung von Story 3.4 hängt

**Stand:** 2026-10-07
**Epic:** 3 — Application layer
**Story:** 3.4 — Use-case layer for the remaining capabilities
**Branch:** `feature/3-4-remaining-use-cases` (HEAD `89fda62`)
**Vorgänger:** Story 3.3 abgeschlossen (`c0417a8` + `89fda62` auf demselben Branch)

---

## Kurzfassung

Story **3.4 ist nicht implementiert**. Der automatisierte **bmad-loop**-Lauf ist mit **defer** beendet (zwei Codex-Dev-Versuche **stalled**). Der Working Tree ist **sauber** und entspricht `89fda62` (nur 3.3 + Windows-Restore-Fixes). Ein Preserve-Ref enthält **unbrauchbare** Teilarbeit — **nicht mergen**.

Die eigentliche Blockade ist **Umfang + Architektur-Disziplin**, nicht ein einzelner Compile-Fehler: ~**576 Zeilen** und **~50 HTTP-Routen** hängen noch in `apps/server/src/http/routes/index.ts`, Reports/Exports liegen teils noch in `packages/db` statt in `packages/core`, und die Story verlangt **Descriptor + Parity** für alle verbleibenden Capabilities.

---

## Was bereits erledigt ist (Story 3.3 — Voraussetzung)

| Bereich | Status |
| --- | --- |
| Use cases | Story Map, Card, Release, Persona, Source Document, ChangeSet unter `apps/server/src/application/` |
| HTTP | Dünne Module: `story-map-routes`, `card-routes`, `release-routes`, `persona-routes`, `source-document-routes`, `changeset-routes`, `sync-routes` (Sync nur teilweise — siehe unten) |
| MCP | `register-tools.ts` ruft dieselben Use Cases für Story-Map-Daten auf |
| Manifest | `pnpm generate-capabilities` / `check-capabilities` (32 Capabilities) |
| Fehler | `DomainError` / `replyWithError` in `application/errors.ts` |
| Tests | `corepack pnpm --filter @storymapper/server test` → **168/168** (nach Windows-Restore-Fixes in `packages/db`) |
| Spec | `_bmad-output/implementation-artifacts/spec-3-3-use-case-layer-for-story-map-data.md` (`status: done`) |

---

## bmad-loop-Lauf 3.4 (fehlgeschlagen)

| Feld | Wert |
| --- | --- |
| Run-ID | `20261006-163930-8c9d` |
| Ergebnis | **0 done**, **1 deferred**, **0 escalated** |
| ATTENTION | `.bmad-loop/runs/20261006-163930-8c9d/ATTENTION` |
| Preserve-Ref | `refs/attempt-preserve-dirty/20261006-163930-8c9d-89fda62f-1` |

### Ablauf

1. **Dev attempt 1** — Session **stalled** (~30 min), `produced_work: true` → Rollback auf `89fda62`, Arbeit in Preserve-Ref geparkt.
2. **Dev attempt 2** — Wieder **stalled** (Idle > 600 s) → **defer**, kein zweiter Rollback (Tree bereits clean).

### Warum der Preserve-Ref nicht hilft

| Problem | Detail |
| --- | --- |
| Kein Story-Artefakt | **Keine** `spec-3-4-use-case-layer-for-the-remaining-capabilities.md` im Ref |
| Zerstörerisches Diff | `index.ts` von ~640 auf ~40 Zeilen gekürzt; große Teile der **Repository-Schicht** in `packages/db` gelöscht/vereinfacht (Export-Formatter, Audit, Releases, ChangeSets, Tests) |
| Keine neuen Module | `git diff --name-status` zeigt **keine** `A`-Dateien — nur Änderungen/Löschungen |
| Bekanntes Muster | Gleiche Klasse wie frühere „attempt worktree snapshot“-Commits bei 3-2/3-3: **nicht** blind `merge --ff-only` |

**Fazit:** Der Loop hat die Story nicht fertiggestellt; der Preserve-Ref ist eher **Anti-Vorlage** als Recover-Basis.

---

## Technische Stolpersteine (unabhängig vom Loop)

### 1. Monolith `routes/index.ts`

Noch direkt in `index.ts` verdrahtet (Auszug):

- Projekte, Getting Started, Product Context
- AI Templates / Proposals
- GitHub Links, Sync Health, Issue Dry-Run
- Connector Connections (+ Validate)
- Roadmaps (inkl. Columns, Swimlanes, Cards, References)
- Customization-Bundle, Workflow Statuses, Annotations, Story Templates
- Activity, Privacy Settings
- Exports (Story Map, Audit), Project Import/Export, Archive Capabilities
- Reports: `source-coverage`, `backlog-health`, `release-summary`, `release-timeline`
- MCP: `/api/mcp/tools`, `host-configs`, `call`
- Credentials, Health

`sync-routes.ts` existiert, ruft aber noch **`services/work-item-sync`** direkt auf — **keine** Application-Use-Cases für Connector-Sync.

### 2. Acceptance Criteria vs. Ist-Zustand

| AC (Epic 3.4) | Ist |
| --- | --- |
| Jede Capability = Use Case + Descriptor + dünne Route-Module | Nur Story-Map-Daten-Aggregate (3.3) |
| Reports: Logik in **`core`**, Use Cases rufen nur auf | `getBacklogHealthReport` / `getSourceCoverageReport` / `getReleaseSummaryReport` noch in **`packages/db`**; in `core` existiert nur `calculateBacklogHealth` (Teil) |
| Exports server-seitig über Export-Use-Cases | Logik noch in `index.ts` + Repository/Service (`exportProjectArchive`, …) |
| Parity: jede Route → Descriptor | Aktuell nur schmales `mcp-http-parity.test.ts` (ein Fall: `ListStoryMaps`); **kein** vollständiger Route↔Descriptor-Scan wie in AD-2 beschrieben |
| Dateien ≤ 750 Zeilen | `index.ts` noch ~576 Zeilen; bei naivem „alles verschieben“ Gefahr großer Einzeldateien (`changeset.use-cases.ts` schon ~140 Zeilen) |

### 3. Windows / CI (bereits entschärft für 3.3)

Restore-Pfadlänge und `fsync` wurden in `89fda62` behoben (`packages/db/src/sqlite-path.ts`, `restore-recovery.ts`). **Volle** `@storymapper/db` Restore-Suites waren historisch Windows-problematisch; bmad-loop **verify** nutzt scoped Server-Tests (`src/mcp`, `project-archive.test.ts`). Externer Agent sollte trotzdem **`corepack pnpm --filter @storymapper/server test`** voll laufen lassen.

### 4. Orchestrator / Sprint-Status

`sprint-status.yaml` listet 3-3 und 3-4 noch als **backlog** — wird vom Orchestrator gesetzt. Manuell nicht „auf done“ drehen ohne Review/Verify.

### 5. Loop-Umgebung (Hinweis für Wiederholung)

- Windows: Psmux/tmux-Warnungen, kein Desktop-Notify → `ATTENTION` beobachten
- Review-Adapter ohne `--permission-mode bypassPermissions` kann Review-Phase blockieren (betrifft 3.4 erst nach erfolgreichem Dev)

---

## Was **nicht** das Problem ist

- Typecheck / Build der aktuellen Basis (`89fda62`) — zuletzt grün
- Story-3.3-Muster (Descriptors, `route-deps`, `parseInput`, `replyWithError`) — vorhanden und kopierbar
- Contracts als Schema-Quelle — unverändert gültig

---

## Empfohlene Richtung für externe Umsetzung

1. **Spec-first:** `spec-3-4-*.md` anlegen (siehe separaten Plan).
2. **Inkrementell** pro Aggregate extrahieren; `index.ts` nur verkleinern, nicht „leeren“.
3. **Preserve-Ref ignorieren** oder nur per `git show` einzelne Ideen prüfen — **kein** FF-Merge.
4. Nach jedem Aggregate: `typecheck`, `check-capabilities`, Server-Tests.
5. Am Ende: Reports nach `core` ziehen, Export-Use-Cases, Route↔Descriptor-Parität erweitern (Story + AD-2).

**Nächstes Dokument:** `plan-3-4-use-case-layer-handoff.md` (Schritt-für-Schritt-Übergabe).
