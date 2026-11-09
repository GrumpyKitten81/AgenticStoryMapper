import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const stylesDirectory = new URL("../", import.meta.url);
const stylesheets = readdirSync(stylesDirectory, { recursive: true }).filter((filename): filename is string => typeof filename === "string" && filename.endsWith(".css"));
const colorLiteral = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:white|black)\b(?!-)/giu;

it("keeps UI color values in the central token stylesheet", () => {
  const paths = [
    ...stylesheets.filter((filename) => filename !== "styles/tokens.css").map((filename) => new URL(filename, stylesDirectory)),
    new URL("../features/story-map/export/story-map-view-export.ts", import.meta.url)
  ];
  for (const path of paths) {
    expect(readFileSync(path, "utf8").match(colorLiteral), path.pathname).toBeNull();
  }
});

it("defines every stylesheet token reference and prevents reference cycles", () => {
  const stylesheet = stylesheets.map((filename) => readFileSync(new URL(filename, stylesDirectory), "utf8")).join("\n");
  const definitions = new Map([...stylesheet.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/gu)].map((match) => [match[1]!, match[2]!]));
  const references = (value: string): string[] => [...value.matchAll(/var\(\s*(--[\w-]+)/gu)].map((match) => match[1]!);
  const check = (token: string, ancestors: string[]): void => {
    if (["--discovery-zoom", "--discovery-activity-h", "--pinned-na-h", "--pinned-unscheduled-h"].includes(token)) {
      expect(readFileSync(new URL("../features/story-map/components/DiscoveryMatrix.tsx", import.meta.url), "utf8")).toContain(`"${token}":`);
      return;
    }
    expect(definitions.has(token), `Undefined token ${token}`).toBe(true);
    expect(ancestors, `Circular token ${token}`).not.toContain(token);
    for (const reference of references(definitions.get(token)!)) check(reference, [...ancestors, token]);
  };
  for (const token of references(stylesheet)) check(token, []);
});

it("keeps page action-button appearance in shared controls", () => {
  const featureSheets = stylesheets.filter((filename) => filename !== "styles/controls.css");
  for (const filename of featureSheets) {
    const css = readFileSync(new URL(filename, stylesDirectory), "utf8");
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
      if (!/(?:^|[ >])button(?:[.#:]|\s|$)|\.(?:icon-button|button-link|secondary|danger|topbar-title-edit)\b/u.test(rule[1]!)) continue;
      expect(rule[2], `${filename}: ${rule[1]!.trim()}`).not.toMatch(/(?:^|;)\s*(?:font(?:-size|-family|-weight)?|line-height|min-height|padding(?:-inline|-block)?|border-radius|background|color)\s*:/u);
    }
  }
});

it("uses the same compact size for buttons and navigation actions", () => {
  const css = readFileSync(new URL("./controls.css", import.meta.url), "utf8");
  const compactRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].filter((rule) => rule[1]!.includes(".button-row.compact button"));
  expect(compactRules).toHaveLength(1);
  expect(compactRules[0]![1]).toContain(".button-row.compact button");
  expect(compactRules[0]![1]).toContain(".button-row.compact .button-link");
  expect(compactRules[0]![2]).toContain("min-height: var(--control-height-compact)");
});
