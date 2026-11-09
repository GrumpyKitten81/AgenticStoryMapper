import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storyMapViewPaths, viewFlagName } from "@storymapper/web/app/story-map-view-paths";

const auxiliaryFlags = ["SOURCES", "RELEASES", "ROADMAPS"] as const;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_FEATURE_PERSONAS", undefined);
  for (const path of storyMapViewPaths) vi.stubEnv(viewFlagName(path), undefined);
  for (const flag of auxiliaryFlags) vi.stubEnv(`VITE_FEATURE_VIEW_${flag}`, undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("defaults to Discovery and Tree with auxiliary views hidden", async () => {
  const flags = await import("@storymapper/web/app/feature-flags");
  expect(flags.enabledStoryMapViews).toEqual(["discovery", "tree"]);
  expect(flags.isSourcesViewEnabled).toBe(false);
  expect(flags.isReleasesViewEnabled).toBe(false);
  expect(flags.isRoadmapsViewEnabled).toBe(false);
  expect(flags.isPersonasEnabled).toBe(false);
});

it.each([["true", true], ["false", false]] as const)("reads Sources=%s explicitly", async (value, expected) => {
  vi.stubEnv("VITE_FEATURE_VIEW_SOURCES", value);
  expect((await import("@storymapper/web/app/feature-flags")).isSourcesViewEnabled).toBe(expected);
});

it.each(["TRUE", "1", "", " false "])("rejects invalid Sources value %j", async (value) => {
  vi.stubEnv("VITE_FEATURE_VIEW_SOURCES", value);
  await expect(import("@storymapper/web/app/feature-flags")).rejects.toThrow('VITE_FEATURE_VIEW_SOURCES must be "true" or "false"');
});

it("requires a Story Map view even when Sources is enabled", async () => {
  for (const path of storyMapViewPaths) vi.stubEnv(viewFlagName(path), "false");
  vi.stubEnv("VITE_FEATURE_VIEW_SOURCES", "true");
  await expect(import("@storymapper/web/app/feature-flags")).rejects.toThrow("At least one VITE_FEATURE_VIEW_* flag must be enabled");
});

it("preserves Story Map flag selection and strict validation", async () => {
  vi.stubEnv("VITE_FEATURE_VIEW_DISCOVERY", "false");
  vi.stubEnv("VITE_FEATURE_VIEW_GRAPH", "true");
  expect((await import("@storymapper/web/app/feature-flags")).enabledStoryMapViews).toEqual(["tree", "graph"]);
  vi.resetModules();
  vi.stubEnv("VITE_FEATURE_VIEW_GRAPH", "yes");
  await expect(import("@storymapper/web/app/feature-flags")).rejects.toThrow('VITE_FEATURE_VIEW_GRAPH must be "true" or "false"');
});

it.each(["RELEASES", "ROADMAPS"] as const)("reads %s independently from the other auxiliary flags", async (name) => {
  for (const value of ["true", "false"] as const) {
    vi.resetModules();
    vi.stubEnv(`VITE_FEATURE_VIEW_${name}`, value);
    const flags = await import("@storymapper/web/app/feature-flags");
    expect(flags.isReleasesViewEnabled).toBe(name === "RELEASES" && value === "true");
    expect(flags.isRoadmapsViewEnabled).toBe(name === "ROADMAPS" && value === "true");
    expect(flags.enabledStoryMapViews).toEqual(["discovery", "tree"]);
  }
});

it.each(["RELEASES", "ROADMAPS"] as const)("rejects invalid %s flag values", async (name) => {
  for (const value of ["TRUE", "1", "", " false "]) {
    vi.resetModules();
    vi.stubEnv(`VITE_FEATURE_VIEW_${name}`, value);
    await expect(import("@storymapper/web/app/feature-flags")).rejects.toThrow(`VITE_FEATURE_VIEW_${name} must be "true" or "false"`);
  }
});

it.each(["RELEASES", "ROADMAPS"] as const)("requires a regular Story Map view when %s is enabled", async (name) => {
  for (const path of storyMapViewPaths) vi.stubEnv(viewFlagName(path), "false");
  vi.stubEnv(`VITE_FEATURE_VIEW_${name}`, "true");
  await expect(import("@storymapper/web/app/feature-flags")).rejects.toThrow("At least one VITE_FEATURE_VIEW_* flag must be enabled");
});

it.each([["true", true], ["false", false]] as const)("reads Personas=%s explicitly", async (value, expected) => {
  vi.stubEnv("VITE_FEATURE_PERSONAS", value);
  const flags = await import("@storymapper/web/app/feature-flags");
  expect(flags.isPersonasEnabled).toBe(expected);
  expect(flags.enabledStoryMapViews).toEqual(["discovery", "tree"]);
});

it.each(["TRUE", "1", "", " false "])("rejects invalid Personas value %j", async (value) => {
  vi.stubEnv("VITE_FEATURE_PERSONAS", value);
  await expect(import("@storymapper/web/app/feature-flags")).rejects.toThrow('VITE_FEATURE_PERSONAS must be "true" or "false"');
});
