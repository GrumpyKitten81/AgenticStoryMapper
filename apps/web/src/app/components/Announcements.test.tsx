// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Announcements } from "@storymapper/web/app/components/Announcements";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";

const host = document.createElement("div");
const root = createRoot(host);
const controlName = "Continue work";
afterEach(async () => {
  await act(async () => root.unmount());
  useAnnouncementStore.setState({ status: "", alert: "", revision: 0, statusRevision: 0, alertRevision: 0 });
  host.remove();
});

it("keeps a persistent polite region and dismisses status without clearing or reannouncing errors", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.append(host);
  await act(async () => root.render(<main id="workspace" tabIndex={-1}><button type="button">{controlName}</button><Announcements /></main>));
  const status = host.querySelector('[role="status"]')!;
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.getAttribute("aria-atomic")).toBe("true");
  expect(host.querySelector('[aria-label="Dismiss status message"]')).toBeNull();
  await act(async () => useAnnouncementStore.getState().announce("Keep this error visible.", "alert"));
  const error = host.querySelector('[role="alert"] span')!;
  await act(async () => useAnnouncementStore.getState().announceFeedback("30 cards changed by Claude Code."));
  expect(host.querySelector('[role="status"]')).toBe(status);
  expect(status.textContent).toBe("30 cards changed by Claude Code.");
  expect(status.parentElement!.getAttribute("title")).toContain("What changed or Activity");
  expect(host.querySelector('[role="alert"] span')).toBe(error);
  const previous = status.firstElementChild;
  await act(async () => useAnnouncementStore.getState().announceFeedback("30 cards changed by Claude Code."));
  expect(status.firstElementChild).not.toBe(previous);
  expect(host.querySelector('[role="alert"] span')).toBe(error);
  const opener = host.querySelector<HTMLButtonElement>("button")!;
  await act(async () => { opener.focus(); host.querySelector<HTMLButtonElement>('[aria-label="Dismiss status message"]')!.focus(); host.querySelector<HTMLButtonElement>('[aria-label="Dismiss status message"]')!.click(); });
  expect(status.textContent).toBe("");
  expect(host.querySelector('[aria-label="Dismiss status message"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(error.textContent).toBe("Keep this error visible.");
  expect(host.querySelector('[role="alert"] span')).toBe(error);
  await act(async () => useAnnouncementStore.getState().announce("Retry succeeded.", "status"));
  expect(useAnnouncementStore.getState().alert).toBe("");
  expect(status.textContent).toBe("Retry succeeded.");
});
