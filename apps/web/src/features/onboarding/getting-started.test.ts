import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GettingStartedChecklist as Checklist } from "@storymapper/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { GettingStartedChecklist } from "./GettingStartedChecklist";
import { RootIndexRoute } from "../../app/routes";
import { StoryMapsIndexRoute } from "../../app/routes/story-maps.index";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: "project" }),
  useNavigate: () => vi.fn(),
  Navigate: ({ to }: { to: string }) => createElement("span", {}, to),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => createElement("a", { href: to }, children)
}));

const checklist: Checklist = {
  projectId: "project", initialized: true, dismissed: false, sampleStoryMapId: "sample",
  completed: { createStoryMap: false, addCards: false, connectGitHub: false, export: false }
};
const clients: QueryClient[] = [];

function render(component: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })): string {
  clients.push(client);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, component));
}

afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

it("renders two core progress items and separates optional links with accessible dismissal", () => {
  const markup = render(createElement(GettingStartedChecklist, { checklist, storyMapId: "sample" }));
  expect(markup.match(/<li[ >]/g)).toHaveLength(2);
  expect(markup.match(/Pending/g)).toHaveLength(2);
  expect(markup).toContain('href="/projects/project/story-maps/sample/discovery"');
  expect(markup).toContain('href="/projects/project/github"');
  expect(markup).toContain('href="#new-story-map"');
  expect(markup).toContain('href="#project-archive"');
  expect(markup).toContain("Connect GitHub (optional)");
  expect(markup).toContain("Optional next steps");
  expect(markup).toContain("Dismiss getting-started checklist</button>");
  const complete = render(createElement(GettingStartedChecklist, { checklist: { ...checklist, completed: { ...checklist.completed, addCards: true } } }));
  expect(complete.match(/Complete/g)).toHaveLength(1);
  expect(render(createElement(GettingStartedChecklist, { checklist: { ...checklist, dismissed: true } }))).toBe("");
});

it("first visit goes to Story Maps regardless of browser onboarding state", () => {
  const client = new QueryClient();
  client.setQueryData(["projects"], { projects: [{ id: "project" }] });
  expect(render(createElement(RootIndexRoute), client)).toBe("<span>/projects/$projectId/story-maps</span>");
});

it("waits for initialization before enabling the map list", () => {
  const client = new QueryClient();
  render(createElement(StoryMapsIndexRoute), client);
  expect(client.getQueryCache().find({ queryKey: ["story-maps", "project"] })?.options).toMatchObject({ enabled: false });
});

it("a checklist request failure still enables maps and displays the error", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  await expect(client.fetchQuery({ queryKey: ["getting-started", "project"], queryFn: () => Promise.reject(new Error("Initialization failed")) })).rejects.toThrow("Initialization failed");
  client.setQueryData(["story-maps", "project"], { storyMaps: [{ id: "existing", name: "PRD to Delivery Map", description: "" }] });
  const markup = render(createElement(StoryMapsIndexRoute), client);
  expect(markup).toContain("Getting-started checklist could not be loaded: Initialization failed");
  expect(markup).toContain("PRD to Delivery Map");
  expect(client.getQueryCache().find({ queryKey: ["story-maps", "project"] })?.options).toMatchObject({ enabled: true });
});

it("presents the Project before its owned maps and keeps the checklist secondary", () => {
  const client = new QueryClient();
  client.setQueryData(["getting-started", "project"], { checklist });
  client.setQueryData(["story-maps", "project"], { storyMaps: [{ id: "sample", name: "PRD to Delivery Map", description: "" }, { id: "other", name: "PRD to Delivery Map", description: "" }] });
  const markup = render(createElement(StoryMapsIndexRoute), client);
  expect(markup.indexOf("Create a Story Map")).toBeLessThan(markup.indexOf("Getting started"));
  expect(markup.indexOf('id="active-project-heading"')).toBeLessThan(markup.indexOf('id="owned-story-maps-heading"'));
  expect(markup).toContain('href="/agent-setup"');
  expect(markup).toContain('local container for its Story Maps');
  expect(markup).toContain('<summary>Project storage and archive</summary>');
  expect(markup.match(/aria-label="Delete sample Story Map"/g)).toHaveLength(1);
  expect(markup.indexOf('href="/projects/project/story-maps/other/discovery"')).toBeLessThan(markup.indexOf('href="/projects/project/story-maps/sample/discovery"'));
  expect(markup.indexOf('class="story-map-list"')).toBeLessThan(markup.indexOf('<summary>Getting started</summary>'));
});
