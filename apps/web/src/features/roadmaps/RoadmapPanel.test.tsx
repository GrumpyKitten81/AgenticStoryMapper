// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { roadmapDetailsSchema, roadmapSchema } from "@storymapper/contracts";
import { expect, it, vi } from "vitest";
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { RoadmapPanel } from "./RoadmapPanel";

it("labels roadmap card estimate totals with the map estimation unit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stylesheet = document.createElement("style");
  stylesheet.textContent = readStylesheet(`${process.cwd()}/src/styles/global.css`);
  document.head.append(stylesheet);
  const now = new Date().toISOString();
  const [projectId, storyMapId, roadmapId, columnId, roadmapCardId] = Array.from({ length: 5 }, () => randomUUID());
  const roadmap = roadmapSchema.parse({ version: 1, id: roadmapId, projectId, storyMapId, name: "Plan", createdAt: now, updatedAt: now });
  const details = roadmapDetailsSchema.parse({
    roadmap, columns: [{ id: columnId, roadmapId, name: "Now", position: 0 }], swimlanes: [],
    cards: [{ id: roadmapCardId, roadmapId, columnId, swimlaneId: null, title: "Theme", reach: null, impact: null, confidence: null, effort: null, position: 0 }],
    references: [], reports: [{ roadmapCardId, totalCards: 1, totalStories: 1, doneStories: 0, estimateTotal: 5, progressRatio: 0.5, statusCounts: {} }]
  });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(JSON.stringify(path.startsWith("/api/roadmaps?") ? { roadmaps: [roadmap] } : details), { headers: { "content-type": "application/json" } })));
  const host = document.body.appendChild(document.createElement("div"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => createRoot(host).render(createElement(QueryClientProvider, { client }, createElement(RoadmapPanel, { projectId, storyMapId, estimationUnit: "hours", releases: [], cards: [] }))));
  await vi.waitFor(async () => { await act(async () => {}); expect(host.textContent).toContain("50% · 5 hours"); });
  expect(host.textContent).not.toContain("pts");
  for (const panel of host.querySelectorAll(".roadmap-panel, .roadmap-editor, .roadmap-card-form")) expect(panel.classList.contains("form-stack")).toBe(true);
  expect([...host.querySelectorAll(".inline-add")].every((row) => row.classList.contains("button-row"))).toBe(true);
  for (const input of host.querySelectorAll(".inline-add > input")) {
    const rowStyle = getComputedStyle(input.parentElement!);
    expect(rowStyle.display).toBe("flex");
    expect(rowStyle.flexWrap).toBe("wrap");
    const inputStyle = getComputedStyle(input);
    expect(inputStyle.width).toBe("auto");
    expect(inputStyle.minWidth).toBe("0");
    expect(inputStyle.flex).toBe("1 1 12rem");
  }
  stylesheet.remove();
  vi.unstubAllGlobals();
});
