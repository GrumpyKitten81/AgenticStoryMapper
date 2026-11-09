// @vitest-environment jsdom // REQ shared Card tooltip rendering
import { expect, it } from "vitest";
import { cardId, mount, state, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

it.each(["discovery", "tree"])("shows a bounded description in %s Card title tooltips", async (view) => {
  const card = state.snapshot.cards.find((candidate) => candidate.id === cardId)!;
  card.description = `  Description\n\n${"x".repeat(400)}`;
  await mount(viewUrl.replace(/tree$/, view));
  const selector = view === "tree" ? `button[data-card-id="${cardId}"]` : `[data-card-id="${cardId}"] .card-title`;
  const title = state.host.querySelector<HTMLElement>(selector)!;
  expect(title.getAttribute("title")).toBe(`${card.title}\n\nDescription ${"x".repeat(288)}…`);
  expect(title.textContent).toBe(card.title);
  expect(state.host.textContent).not.toContain(card.description);
});
