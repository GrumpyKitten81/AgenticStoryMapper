import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { expect, it } from "vitest";

const stylesheet = ["global.css", "graph.css", "slices.css"].map((filename) => readStylesheet(new URL(filename, import.meta.url))).join("\n");

function declaration(selector: string, property: string): string {
  const values = [...stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
    .filter((match) => match[1]!.trim() === selector || match[1]!.split(",").map((value) => value.trim()).includes(selector))
    .flatMap((match) => match[2]!.split(";").map((line) => line.trim()))
    .filter((line) => line.startsWith(`${property}:`));
  expect(values.length, `${selector} ${property}`).toBeGreaterThan(0);
  const value = values.at(-1)!;
  return value.slice(value.indexOf(":") + 1).trim();
}

function resolveTokens(value: string, seen: string[] = []): string {
  return value.replace(/var\((--[\w-]+)\)/gu, (_match, token: string) => {
    expect(seen, `Circular token reference: ${token}`).not.toContain(token);
    return resolveTokens(declaration(":root", token), [...seen, token]);
  });
}

function resolvedDeclaration(selector: string, property: string): string {
  return resolveTokens(declaration(selector, property));
}

function luminance(hex: string): number {
  expect(hex).toMatch(/^#[\da-f]{6}$/iu);
  const channels = hex.slice(1).match(/../gu)!.map((part) => parseInt(part, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1]! + 0.05) / (values[0]! + 0.05);
}

it.each([
  [".persona-tile", ".persona-tile"],
  ["button.secondary[aria-pressed=\"true\"]", "button.secondary[aria-pressed=\"true\"]"],
  [":root", ":root"], [".sidebar", ".sidebar"], [".sidebar a", ".sidebar"],
  [".sidebar a.active,\n.sidebar a:hover", ".sidebar a.active,\n.sidebar a:hover"],
  ["select", "select"], ["button", "button"],
  ["button.secondary", "button.secondary"], [".board-search-row span", ".board-toolbar"],
  [".card-provider-icon", ".card-provider-icon"], [".card-ticket-number", ".card-ticket-number"],
  [".tool-pill", ".tool-pill"], [".tool-pill.enabled", ".tool-pill.enabled"]
])("checks actual normal text pair %s on %s at 4.5:1", (foreground, background) => {
  expect(contrast(resolvedDeclaration(foreground, "color"), resolvedDeclaration(background, "background"))).toBeGreaterThanOrEqual(4.5);
});

it.each([":root", "select", ".board-toolbar", ".card-tile.activity", ".card-tile.step", ".card-tile.bulk-selected"])("checks actual light focus token on %s at 3:1", (selector) => {
  expect(contrast(resolvedDeclaration(":root", "--focus-ring-light"), resolvedDeclaration(selector, "background"))).toBeGreaterThanOrEqual(3);
});

it.each([".sidebar", "button", ".sidebar a.active,\n.sidebar a:hover"])("checks actual dark focus token on %s at 3:1", (selector) => {
  expect(declaration(selector, "--focus-ring")).toBe("var(--focus-ring-dark)");
  expect(contrast(resolvedDeclaration(":root", "--focus-ring-dark"), resolvedDeclaration(selector, "background"))).toBeGreaterThanOrEqual(3);
});

it("uses the input boundary token against its actual surface and visible focus outline", () => {
  const selector = "select";
  expect(declaration(selector, "border")).toBe("1px solid var(--border-input)");
  expect(contrast(resolvedDeclaration(":root", "--border-input"), resolvedDeclaration(selector, "background"))).toBeGreaterThanOrEqual(3);
  expect(stylesheet).toContain("outline: 2px solid var(--focus-ring)");
});

it("uses light focus against graph control surroundings and white graph nodes", () => {
  expect(declaration(".dependency-graph :focus-visible", "outline")).toBe("2px solid var(--focus-ring-light)");
  expect(contrast(resolvedDeclaration(":root", "--focus-ring-light"), resolvedDeclaration(":root", "background"))).toBeGreaterThanOrEqual(3);
  expect(declaration(".graph-node", "--focus-ring")).toBe("var(--focus-ring-light)");
  expect(contrast(resolvedDeclaration(":root", "--focus-ring-light"), resolvedDeclaration(".graph-node", "background"))).toBeGreaterThanOrEqual(3);
});
