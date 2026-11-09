import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { storyMapSnapshotSchema } from "@storymapper/contracts";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { appStrings, panelStrings, storyMapStrings } from "@storymapper/ui-strings";
import { OnboardingPanel } from "../features/onboarding/OnboardingPanel";
import { ProjectArchivePanel } from "../features/project-archive/ProjectArchivePanel";
import { PersonaDetail } from "../features/personas/PersonaDetail";
import { CardDetailModal } from "../features/story-map/components/CardDetailModal";
import { GitHubSyncPanel } from "../features/github-sync/GitHubSyncPanel";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useBlocker: () => ({ status: "idle" }),
  useRouter: () => ({ load: vi.fn() }),
  useSearch: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => createElement("a", {}, children)
}));
vi.mock("../features/story-map/components/DescriptionEditor", () => ({
  DescriptionEditor: ({ value }: { value: string }) => createElement("textarea", { defaultValue: value })
}));
vi.mock("@storymapper/web/components/Dialog", () => ({
  Dialog: ({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) => createElement("section", {},
    createElement("h2", {}, title), description ? createElement("p", {}, description) : null, children)
}));

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

function render(component: React.ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, component));
}

function hasLiteralCopy(node: ts.Node): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text.trim().length > 0;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) return hasLiteralCopy(node.expression);
  if (ts.isArrayLiteralExpression(node)) return node.elements.some(hasLiteralCopy);
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) return hasLiteralCopy(node.left) || hasLiteralCopy(node.right);
  if (ts.isConditionalExpression(node)) return hasLiteralCopy(node.whenTrue) || hasLiteralCopy(node.whenFalse);
  if (ts.isTemplateExpression(node)) return node.head.text.trim().length > 0 || node.templateSpans.some((span) => span.literal.text.trim().length > 0 || hasLiteralCopy(span.expression));
  return false;
}

function hasCopyAttribute(node: ts.JsxAttribute, source: ts.SourceFile): boolean {
  const initializer = node.initializer;
  const expression = initializer && (ts.isJsxExpression(initializer) ? initializer.expression : initializer);
  return ["aria-label", "title", "placeholder", "alt", "label"].includes(node.name.getText(source)) && Boolean(expression && hasLiteralCopy(expression));
}

describe("central English interface copy", () => {
  it("detects literal JSX expressions without treating central strings or protocol comparisons as copy", testDetectsLiteralJSXExpressionsWithoutTreatingCentralStringsOrProtocolComparisons);
  it("preserves operation summary counts, grouping and first-seen ordering", () => {
    expect(panelStrings.summarizeOperations([
      { op: "update", entity: "card" },
      { op: "create", entity: "release" },
      { op: "update", entity: "card" },
      { op: "create", entity: "card" },
      { op: "move", entity: "card" }
    ])).toBe("2 update card, 1 create release, 1 create card, 1 move card");
    expect(panelStrings.summarizeOperations([])).toBe("");
  });
  it("detects literal custom labels while preserving central labels and option values", () => {
    for (const [attribute, expected] of [['label="Add story"', true], ['label={"Add story"}', true], ['label={strings.title}', false], ['value="story"', false]] as const) {
      const source = ts.createSourceFile("copy.tsx", `<AddControl ${attribute} />`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const jsx = source.statements[0] as ts.ExpressionStatement;
      const node = (jsx.expression as ts.JsxSelfClosingElement).attributes.properties[0] as ts.JsxAttribute;
      expect(hasCopyAttribute(node, source), attribute).toBe(expected);
    }
  });
  it("has no raw JSX text or literal accessibility copy outside the string module", testHasNoRawJSXTextOrLiteralAccessibilityCopyOutsideThe);

  it("renders English onboarding and portable archive controls", () => {
    const onboarding = render(createElement(OnboardingPanel));
    expect(onboarding).toContain("Welcome to Agentic Story Mapper");
    expect(onboarding).toContain("Your story maps, cards and imported documents stay on this computer unless you trigger an external connector action.");
    expect(onboarding).toContain("An enabled agent may forward retrieved context to its own provider.");
    expect(onboarding).toContain("Understood, get started");
    const archive = render(createElement(ProjectArchivePanel));
    expect(archive).toContain("Export project");
    expect(archive).toContain("Import project");
    expect(archive).toContain('accept=".zip"');
  });

  it("separates GitHub sync labels from their values", () => {
    const markup = render(createElement(GitHubSyncPanel, { storyMapName: "PRD to Delivery Map", storyMapVersion: 1, cards: [], releases: [], links: [] }));
    expect(markup).toContain("Story map: PRD to Delivery Map");
    expect(markup).toContain(`Last run: ${panelStrings.noRun}`);
  });

  it("renders seeded Card detail in English and preserves the seed content and workflow values", testRendersSeededCardDetailInEnglishAndPreservesTheSeedContent);

  it("preserves paths, counts and HTTP status in surrounding English copy", testPreservesPathsCountsAndHTTPStatusInSurroundingEnglishCopy);
});

function testDetectsLiteralJSXExpressionsWithoutTreatingCentralStringsOrProtocolComparisons() {
  for (const expression of ['value || "Missing"', 'value ?? ("Missing")', 'flag && ("Missing")', '(flag ? "Missing" : value)', 'value + " suffix"', '`${"Missing"}`', '`${value ?? "Missing"}`', '"Missing" as string', '"Missing" satisfies string', '"Missing"!', '[strings.title, "Missing"]', '[[strings.title, "Missing"]]']) {
    const source = ts.createSourceFile("copy.tsx", `<span>{${expression}}</span>`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const jsx = source.statements[0] as ts.ExpressionStatement;
    const child = (jsx.expression as ts.JsxElement).children[0] as ts.JsxExpression;
    expect(hasLiteralCopy(child.expression!), expression).toBe(true);
  }
  for (const expression of ['(strings.title)', 'value ?? strings.title', 'card.level === "story" && strings.title', '`${strings.title}`', '`${value ?? strings.title}`', 'strings.title as string', 'strings.title satisfies string', 'strings.title!', '[strings.title]', '[card.level === "story" && strings.title]', '[]']) {
    const source = ts.createSourceFile("copy.tsx", `<span>{${expression}}</span>`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const jsx = source.statements[0] as ts.ExpressionStatement;
    const child = (jsx.expression as ts.JsxElement).children[0] as ts.JsxExpression;
    expect(hasLiteralCopy(child.expression!), expression).toBe(false);
  }
}

function testHasNoRawJSXTextOrLiteralAccessibilityCopyOutsideThe() {
  const violations: string[] = [];
  for (const path of sourceFiles(sourceRoot)) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      const isText = ts.isJsxText(node) && node.text.trim().length > 0;
      const isCopyAttribute = ts.isJsxAttribute(node) && hasCopyAttribute(node, source);
      const isExpressionText = ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent) && hasLiteralCopy(node.expression);
      if (isText || isCopyAttribute || isExpressionText) violations.push(`${relative(sourceRoot, path)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(violations).toEqual([]);
}

function testRendersSeededCardDetailInEnglishAndPreservesTheSeedContent() {
  const projectId = randomUUID();
  const storyMapId = randomUUID();
  const cardId = randomUUID();
  const snapshot = storyMapSnapshotSchema.parse({
    storyMap: { version: 1, id: storyMapId, projectId, name: "PRD to Delivery Map", description: "Seed story map showing the three-level structure.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    cards: [{ creationOrigin: "manual", provenance: "manual", version: 1, id: cardId, storyMapId, key: "LSM-1", parentId: null, releaseId: null, position: 0, level: "activity", title: "Understand product requirements", description: "Collect PRD/SRD input and preserve provenance.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    releases: [], sourceLinks: [], cardDependencies: [], githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
  const markup = render(createElement(CardDetailModal, { cardId, snapshot, projectId }));
  expect(markup).toContain("Understand product requirements");
  expect(markup).toContain("Collect PRD/SRD input and preserve provenance.");
  expect(markup).toContain('aria-label="Close card detail"');
  expect(markup).not.toContain("Activity / Epic");
  expect(markup).toContain("Use structured markdown");
  expect(markup).toContain('value="todo"');
  for (const status of ["active", "done", "archived", "blocked"]) expect(markup).not.toContain(`value="${status}"`);
  expect(markup).toContain("No attachments yet.");
  const customized = storyMapSnapshotSchema.parse({
    ...snapshot,
    workflowStatuses: [{ id: randomUUID(), projectId, storyMapId, name: "blocked", group: "active", position: 0 }],
    personas: [{ version: 1, id: randomUUID(), projectId, storyMapId, name: "Buyer", role: "Decision maker" }]
  });
  const customMarkup = render(createElement(CardDetailModal, { cardId, snapshot: customized, projectId }));
  expect(customMarkup).toContain('value="blocked"');
  expect(customMarkup).toContain(">blocked</option>");
  expect(customMarkup).toContain('value="todo"');
  for (const status of ["active", "done", "archived"]) expect(customMarkup).not.toContain(`value="${status}"`);
  expect(customMarkup).toContain("Buyer");
  const personaMarkup = render(createElement(PersonaDetail, { persona: customized.personas[0]!, projectId, onDeleted: () => {} }));
  expect(personaMarkup).toContain('value="Buyer"');
  expect(personaMarkup).toContain('value="Decision maker"');
}

function testPreservesPathsCountsAndHTTPStatusInSurroundingEnglishCopy() {
  expect(appStrings.archiveImported("/projects/custom.lsm", 2, 5)).toContain("Imported to /projects/custom.lsm. Story Maps: 2, Cards: 5.");
  expect(appStrings.requestFailed(403)).toBe("Request failed: 403");
  expect(appStrings.renameStoryMapLabel("Custom Map")).toBe("Rename story map Custom Map");
  expect(storyMapStrings.confirmDeleteRelease('MVP "A"', 2)).toBe('Delete release "MVP "A""? 2 card(s) will move to Unscheduled.');
  expect(storyMapStrings.structuredCardTemplate("Create traceable story cards")).toBe([
    "As a user, I want create traceable story cards so that I can complete the intended workflow.",
    "", "## Acceptance Criteria", "- Given the relevant context", "- When the user performs the action",
    "- Then the expected result is persisted and visible", "", "## Test Cases", "- Verify the happy path",
    "- Verify validation and error handling", "", "## Open Questions", "- Confirm edge cases", "", "## Notes",
    "- Add implementation notes here"
  ].join("\n"));
}
