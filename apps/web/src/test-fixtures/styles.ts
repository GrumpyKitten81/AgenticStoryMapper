import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function readStylesheet(path: string | URL): string {
  const filename = path instanceof URL ? fileURLToPath(path) : path;
  const expanded = readFileSync(filename, "utf8").replace(/^@import "([^"]+)";$/gm, (_line, relative: string) =>
    readStylesheet(resolve(dirname(filename), relative)));
  if (/^\s*@import\b/m.test(expanded)) throw new Error(`${filename}: unresolved @import.`);
  return expanded;
}
