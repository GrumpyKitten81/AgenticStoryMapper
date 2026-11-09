# Handoff-Plan: Story 3.4 — Use-case layer for the remaining capabilities

**Ziel:** Ein anderer Agent kann diese Story **ohne bmad-loop** auf Branch `feature/3-4-remaining-use-cases` umsetzen (Basis-Commit `89fda62`).

**Normative Quellen (lesen zuerst):**

- `_bmad-output/planning-artifacts/epics.md` — Abschnitt **Story 3.4** (AC)
- `_bmad-output/planning-artifacts/architecture/architecture-StoryMapper-2026-09-29/ARCHITECTURE-SPINE.md` — **AD-2** (eine Use-Case-Schicht für HTTP + MCP)
- `_bmad-output/implementation-artifacts/spec-3-3-use-case-layer-for-story-map-data.md` — **Referenzimplementierung**
- `AGENTS.md` — Policy (keine Tokens, `packages/db` only für DB, Contracts nicht duplizieren)

**Blocker-Kontext:** `report-3-4-implementation-blockers.md`

---

## Definition of Done (aus Epic, operationalisiert)

1. **Capabilities** aus der Story-Baseline (siehe Inventar unten) haben jeweils:
   - Use-Case-Funktion(en) in `apps/server/src/application/<aggregate>/`
   - Export `*Descriptor: CapabilityDescriptor` mit `{ name, kind, tool?, route? }`
   - Eintrag in `apps/server/src/application/descriptors.ts`
   - Dünnes HTTP-Plugin in `apps/server/src/http/routes/<aggregate>-routes.ts`
   - Wo MCP existiert: `register-tools.ts` ruft **dieselben** Use Cases auf (nicht Repository direkt)

2. **Reports** (`backlog-health`, `source-coverage`, `release-summary`, `release-timeline`):
   - Berechnungslogik als **pure functions** in `packages/core`
   - Use Cases laden Daten via Repository, rufen `core` auf, geben Contract-Typen zurück
   - Repository-Methoden dürfen Daten liefern; **Business-Aggregation** nicht neu in DB duplizieren

3. **Exports** (JSON/Markdown/CSV Story-Map-Export, Audit-Export, Project Archive Import/Export):
   - Server-seitige **Export-Use-Cases**; HTTP nur Validierung + Actor + Response-Headers

4. **Manifest & Parity:**
   - `node scripts/generate-capability-manifest.mjs` → `capability-manifest.json`
   - `pnpm check-capabilities` grün
   - **Erweitern:** Test(s), die prüfen, dass jede relevante HTTP-Route ein `route` auf einem Descriptor hat und jeder exportierte Use Case einen Descriptor hat (Epic AC; AD-2 — aktuell nur Minimaltest in `mcp-http-parity.test.ts`)

5. **Größe:** Keine Datei unter `apps/server/src/http/routes/` oder `apps/server/src/application/` > **750** Zeilen

6. **Verhalten:** `corepack pnpm --filter @storymapper/server test` vollständig grün; `corepack pnpm typecheck`; optional `node scripts/verify.mjs --skip-build` wenn zeitkritisch

7. **Artefakt:** `_bmad-output/implementation-artifacts/spec-3-4-use-case-layer-for-the-remaining-capabilities.md` mit `status: done`, Verification-Tabelle, Changelog

---

## Ausgangszustand (nicht anfassen ohne Grund)

| Pfad | Rolle |
| --- | --- |
| `apps/server/src/http/routes/index.ts` | Orchestrator: registriert Plugins + **noch ~50 Routen** |
| `apps/server/src/http/routes/route-deps.ts` | `RouteDeps`, `toApplicationDeps` |
| `apps/server/src/application/deps.ts` | `ApplicationDeps` (repository + unitOfWork) |
| `apps/server/src/application/errors.ts` | `replyWithError`, `asDomainError` |
| `apps/server/src/application/http/validate.ts` | `parseInput` → `DomainError` validation |
| `apps/server/src/application/actors.ts` | `localHumanActor` |
| `apps/server/src/http/routes/sync-routes.ts` | GitHub/Connector-Sync — **noch Service-Schicht** |

**Bereits extrahiert (3.3):** `story-map`, `card`, `release`, `persona`, `source-document`, `changeset` (+ teilweise Reports in Snapshot-Reads).

---

## Capability-Inventar (noch in `index.ts` oder Services)

Empfohlene **Aggregate-Ordner** (anpassen, wenn es sauberer gruppiert):

| Gruppe | HTTP-Pfade (aktuell) | MCP / Sonstiges | Hinweise |
| --- | --- | --- | --- |
| **project** | `GET/POST /api/projects`, Getting Started (3) | — | `createProject`, Listen, Getting-Started-State |
| **product-context** | `GET/PATCH /api/product-context` | — | `upsertProductContext` im Repository |
| **customization** | `GET /api/customization` | — | Bundle: Workflow, Personas, Annotations, Templates, Links |
| **workflow-status** | `POST/PATCH/DELETE /api/workflow-statuses` | — | Card customization contracts |
| **annotation** | `POST/PATCH/DELETE /api/annotations` | — | |
| **story-template** | `POST/PATCH/DELETE /api/story-templates` | — | |
| **roadmap** | `/api/roadmaps*`, columns, swimlanes, cards, references | — | Größter Block; ggf. Unter-Use-Cases pro Sub-Ressource |
| **activity** | `GET /api/activity` | — | Read-only |
| **privacy-settings** | `GET/PATCH /api/settings/privacy` | — | Story 3.5 wird Schema ändern — **nur** Use-Case-Schicht, kein 3.5-Scope |
| **github-link** | `/api/github/links*`, sync-health, issue-dry-run | Teilweise MCP in 3.3 Sync-Tools | Von Connector-Sync trennen |
| **connector** | `/api/connectors/connections*` | — | Validate-Endpoint |
| **work-item-sync** | in `sync-routes.ts` | MCP: Import/Push/Sync/Pull Tools | Use Cases wrappen `services/work-item-sync` schrittweise |
| **report** | `/api/reports/*` | — | **core**-Extraktion Pflicht |
| **export** | `/api/exports/story-map`, `/api/exports/audit` | — | Formatter-Logik aus DB/Server Services |
| **project-archive** | capabilities, `GET /api/projects/export`, `POST /api/projects/import` | human-only | Bereits Tests `project-archive.test.ts` |
| **ai-proposal** | `/api/ai/templates`, `/api/ai/proposals` | MCP proposal tools teils in changeset | `proposal-builders.ts` existiert |
| **platform** | `/health`, `/api/credentials/status`, MCP meta (`/api/mcp/tools`, `host-configs`, `call`) | — | **Optional** human-only / kein Descriptor; in Spec begründen wenn ausgenommen |

**Restore:** Bleibt `restore-points.ts` (human-only) — nicht in 3.4 Scope verschieben, nur nicht kaputt machen.

---

## Implementierungsreihenfolge (empfohlen)

Jeder Schritt = ein logischer Commit; nach jedem Schritt Gates laufen lassen.

### Phase 0 — Vorbereitung

- [ ] Branch `feature/3-4-remaining-use-cases` von `89fda62` aus checken (bereits vorhanden)
- [ ] Spec-Datei `spec-3-4-use-case-layer-for-the-remaining-capabilities.md` anlegen (`status: in-progress`)
- [ ] **Nicht** `refs/attempt-preserve-dirty/20261006-163930-8c9d-89fda62f-1` mergen

### Phase 1 — Muster duplizieren (klein)

- [ ] Ein kleines Aggregate wählen (z. B. **activity** oder **product-context**):
  - `application/<agg>/<agg>.use-cases.ts` mit `listXDescriptor` + `listX(...)`
  - `http/routes/<agg>-routes.ts` mit `parseInput`, `replyWithError`
  - `index.ts`: Plugin registrieren, alte Handler entfernen
  - `descriptors.ts` erweitern
  - `pnpm generate-capabilities` + `check-capabilities`

### Phase 2 — Customization-Cluster

- [ ] **workflow-status**, **annotation**, **story-template** (evtl. gemeinsames `customization`-Modul oder getrennt)
- [ ] `GET /api/customization` als Read-Use-Case
- [ ] Tests: bestehende `adapter.test.ts` / HTTP-Tests für sparse PATCHs beachten (leere PATCHs → Drizzle `No values to set` → `asDomainError`)

### Phase 3 — Project & Getting Started

- [ ] Project list/create
- [ ] Getting Started dismiss/export-success
- [ ] Eigene Route-Datei `project-routes.ts` oder `getting-started-routes.ts`

### Phase 4 — Roadmap

- [ ] Use Cases pro Operation (create roadmap, update, column, swimlane, card, reference)
- [ ] Dateigröße beobachten — ggf. `roadmap/` Unterdateien (`roadmap-columns.use-cases.ts`, …)

### Phase 5 — Reports → core

- [ ] `packages/core`: pure functions für Source Coverage, Release Summary/Timeline, Backlog Health (vorhandenes `calculateBacklogHealth` wiederverwenden/erweitern)
- [ ] Repository: Daten liefern (Karten, Links, Chunks), **keine** Issue-Listen-Logik in DB behalten wenn verschoben
- [ ] `application/report/report.use-cases.ts` + `report-routes.ts`
- [ ] HTTP-Reports aus `index.ts` entfernen
- [ ] `packages/db` Tests anpassen, wenn Reports nur noch über core laufen

### Phase 6 — Exports & Project Archive

- [ ] Use Cases für Story-Map-Export, Audit-Export, Project Export/Import
- [ ] Human-only Descriptors wo nötig (`kind: "human-only"` falls Contract das vorsieht — sonst `write` + keine MCP)
- [ ] `project-archive.test.ts` grün halten

### Phase 7 — GitHub Links & Connectors

- [ ] Use Cases für CRUD Links, sync-health, issue-dry-run
- [ ] Connector connections + validate
- [ ] MCP-Tools auf Use Cases umstellen, wo sie heute Repository/Services direkt nutzen

### Phase 8 — Work-item sync

- [ ] `sync-routes.ts` refactoren: Handler rufen `application/sync/` oder `application/github-sync/` Use Cases auf
- [ ] `register-tools.ts` Import/Push/Sync/Pull auf dieselben Funktionen
- [ ] Fehlerbehandlung: `sendWorkItemSyncError` vs `replyWithError` vereinheitlichen wo sinnvoll

### Phase 9 — AI proposals

- [ ] `/api/ai/*` → Use Cases; Anbindung an `proposal-builders.ts` / `buildAiProposalChangeSet`

### Phase 10 — Parity & Manifest-Härtung

- [ ] Test: alle registrierten Fastify-Routen unter `/api/` (außer explizit ausgenommene) matchen ein `route` in manifest
- [ ] Jeder Descriptor in `descriptors.ts` im generierten Manifest
- [ ] `mcp-http-parity.test.ts` erweitern (mindestens 1 Read + 1 Write-Pfad aus neuem Scope)
- [ ] `index.ts` auf reines Registrieren + MCP-Meta + Health/Credentials reduzieren

### Phase 11 — Abschluss

- [ ] Zeilenzählung aller `routes/*.ts` und `application/**/*.ts` ≤ 750
- [ ] Spec auf `done`, Verification-Tabelle ausfüllen
- [ ] Commit-Message-Stil wie `c0417a8` / `89fda62`

---

## Code-Muster (Copy from 3.3)

**Descriptor + Use Case:**

```typescript
export const listActivityDescriptor: CapabilityDescriptor = {
  name: "listActivity",
  kind: "read",
  route: "GET /api/activity"
};

export function listActivity(deps: ApplicationDeps, projectId: string) {
  return { events: deps.repository.listActivity(projectId) };
}
```

**Route:**

```typescript
server.get("/api/activity", async (request, reply) => {
  try {
    const projectId = (request.query as { projectId?: string }).projectId;
    if (!projectId) throw new DomainError("validation", "projectId is required.");
    return listActivity(application, projectId);
  } catch (error) {
    return replyWithError(reply, error, request.log);
  }
});
```

**index.ts:**

```typescript
await server.register(activityRoutes, deps);
```

---

## Verifikationsbefehle (Pflicht)

```bash
corepack pnpm typecheck
corepack pnpm check-capabilities
corepack pnpm --filter @storymapper/server test
corepack pnpm --filter @storymapper/core test
corepack pnpm --filter @storymapper/db test   # optional aber empfohlen nach Report-Refactor
```

bmad-loop-Policy (falls Loop später): scoped verify ohne volle DB-Restore-Suite — **externer Agent soll volle Server-Tests fahren**.

---

## Anti-Patterns (explizit verboten)

1. `index.ts` auf wenige Zeilen kürzen, indem Imports auf **nicht existierende** Module zeigen
2. Logik aus `packages/db` **löschen** statt nach `core`/Use Cases zu **verschieben**
3. Preserve-Ref **ff-merge** ohne `typecheck` + volle Server-Tests
4. Zod-Schemas in Server duplizieren — nur `@storymapper/contracts`
5. Raw Drizzle außerhalb `packages/db`
6. `sprint-status.yaml` manuell editieren

---

## Übergabe-Checkliste für den ausführenden Agenten

- [ ] Report gelesen (`report-3-4-implementation-blockers.md`)
- [ ] Epic Story 3.4 AC verstanden
- [ ] Spec 3.3 als Muster geöffnet
- [ ] Branch `feature/3-4-remaining-use-cases` @ `89fda62`
- [ ] Node 24 + pnpm 9.15.4 (Corepack)
- [ ] Nach Fertigstellung: Spec 3.4 + Commit(s); **kein** Push ohne Anweisung

---

## Referenz: Loop-Metadaten (nur Dokumentation)

| Item | Wert |
| --- | --- |
| Defer-Grund | dev session stalled (2×) |
| Preserve | `refs/attempt-preserve-dirty/20261006-163930-8c9d-89fda62f-1` |
| Weighted tokens | ~1.3M (Cache-gewichtet) |
