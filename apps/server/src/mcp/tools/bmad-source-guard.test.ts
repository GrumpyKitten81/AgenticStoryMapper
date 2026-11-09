import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

function parserConstruct(source: string): boolean {
  const namedParser = /(?:function\s+|(?:const|class)\s+)(?=[\w$]*(?:bmad|Bmad|BMad|BMAD))(?=[\w$]*(?:parse|Parse|parser|Parser|extract|Extract|read|Read|import|Import))[\w$]+/;
  const planningFormat = /sprint-status\.ya?ml|(?:Epic|Story)(?: |\\s[+*?]?)*(?:\(\??:?)?(?:\\d|\[0-9\])|["'`]#{1,6} (?:Epic|Story) /;
  const parserCall = /(?:yaml\.(?:parse|load)|(?:parse|load)Yaml|\.match(?:All)?\(|\.exec\(|new RegExp\(|\.startsWith\(|\.split\()/;
  return namedParser.test(source) || planningFormat.test(source) && parserCall.test(source);
}
function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["fixtures", "__fixtures__", "__tests__", "dist", "node_modules"].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) ? [path] : [];
  });
}
it("keeps recorded planning parsers test-only while permitting generic reference metadata", () => {
  const root = resolve(import.meta.dirname, "../../../../..");
  const files = [...productionSources(resolve(root, "apps")), ...productionSources(resolve(root, "packages"))];
  expect(files.length).toBeGreaterThan(100);
  expect(files.filter((path) => parserConstruct(readFileSync(path, "utf8")))).toEqual([]);
  expect(files.filter((path) => /(?:from\s+["']|import\(["'])[^"']*fixtures\/bmad-round-trip/.test(readFileSync(path, "utf8")))).toEqual([]);
});
it.each([
  'function parseBmadEpics(input: string) { return input.matchAll(/^Epic\\s+(\\d+)/g); }',
  'const bmadStoryParser = (text: string) => text.split("Story");',
  'class BMadSprintImporter {}',
  'const result = text.match(/^Epic (\\d+): (.+)$/);',
  'const pattern = /^Story (\\d+)\\.(\\d+)/; const result = pattern.exec(text);',
  'const roots = lines.filter(line => line.startsWith("## Epic "));',
  'const stories = text.split("# Story ");',
  'const file = "sprint-status.yaml"; const plan = yaml.parse(readFileSync(file));',
  'const heading = text.match(/^Story\\s+(\\d+\\.\\d+)/);'
])("rejects production parser construct %s", (source) => { expect(parserConstruct(source)).toBe(true); });
it.each([
  'const selector = { system: "bmad", externalId: "story-1.1" };',
  'const baseline = snapshot.externalRefs.find((ref) => ref.system === "bmad");',
  'function readExternalRefs() { return repository.listExternalRefs(); }'
])("permits generic publication metadata %s", (source) => { expect(parserConstruct(source)).toBe(false); });
