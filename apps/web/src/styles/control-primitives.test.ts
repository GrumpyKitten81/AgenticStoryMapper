// @vitest-environment jsdom // REQ native-control and shared-style regression checks
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { afterEach, beforeEach, expect, it } from "vitest";

const stylesheet = readStylesheet(`${process.cwd()}/src/styles/global.css`) + readStylesheet(`${process.cwd()}/src/styles/slices.css`);

beforeEach(() => {
  const style = document.createElement("style");
  style.textContent = stylesheet;
  document.head.append(style);
});

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

it.each([
  ["checkbox", ""], ["radio", ""], ["checkbox", "card-checkbox"],
  ["checkbox", "checkbox-row"], ["radio", "lifecycle-strategy radio-row"],
  ["radio", "safety-settings-row"]
])("keeps %s geometry and accent consistent in %s", (type, className) => {
  const input = document.createElement("input");
  input.type = type!;
  const label = document.createElement("label");
  label.className = className!;
  label.append(input);
  document.body.append(label);
  const style = getComputedStyle(input);
  expect(style.width).toBe("var(--selection-control-size)");
  expect(style.height).toBe("var(--selection-control-size)");
  expect(style.padding).toBe("0px");
  expect(style.accentColor).toBe("var(--color-primary)");
});

it("styles range accents without treating the slider as a text field", () => {
  const input = document.createElement("input");
  input.type = "range";
  document.body.append(input);
  const style = getComputedStyle(input);
  expect(style.width).not.toBe("100%");
  expect(style.padding).toBe("0px");
  expect(style.accentColor).toBe("var(--color-primary)");
});

it("does not stretch a review action to the height of its grid row", () => {
  const item = document.createElement("article");
  item.className = "changeset-item";
  const action = document.createElement("button");
  item.append(action);
  document.body.append(item);
  expect(getComputedStyle(item).alignItems).toBe("start");
  expect(getComputedStyle(action).alignSelf).not.toBe("stretch");
  expect(getComputedStyle(action).minHeight).toBe("var(--control-height)");
});

it("gives title-edit icons the shared compact dimensions", () => {
  const action = document.createElement("button");
  action.className = "secondary icon-button topbar-title-edit";
  document.body.append(action);
  const style = getComputedStyle(action);
  expect(style.minHeight).toBe("var(--control-height-compact)");
  expect(style.minWidth).toBe("var(--control-height-compact)");
  expect(style.borderRadius).toBe("var(--radius-control)");
});

it.each(["discovery-dialog", "card-detail-modal", "card-close-confirm"])("uses the dialog radius for %s", (className) => {
  const dialog = document.createElement("section");
  dialog.className = className;
  document.body.append(dialog);
  expect(getComputedStyle(dialog).borderRadius).toBe("var(--radius-dialog)");
});

it("uses semantic heading sizes instead of browser defaults", () => {
  for (const [tag, token] of [["h2", "--font-size-section"], ["h3", "--font-size-body"]]) {
    const heading = document.createElement(tag!);
    document.body.append(heading);
    expect(getComputedStyle(heading).fontSize).toBe(`var(${token})`);
  }
});

it("keeps dialog error paragraphs distinct from muted explanatory text", () => {
  const layer = document.createElement("div");
  layer.className = "dialog-layer";
  const dialog = document.createElement("section");
  dialog.className = "discovery-dialog";
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  dialog.append(alert);
  layer.append(dialog);
  document.body.append(layer);
  expect(getComputedStyle(alert).color).toBe("var(--color-danger-text)");
});

it("preserves stretching for structural persona tiles and detail chips", () => {
  for (const className of ["persona-tile", "detail-chip"]) {
    const control = document.createElement("button");
    control.className = className;
    document.body.append(control);
    expect(getComputedStyle(control).alignSelf).not.toBe("start");
    expect(getComputedStyle(control).justifySelf).not.toBe("start");
  }
});

it("uses shared spacing and borderless fieldsets in connection forms", () => {
  const form = document.createElement("div");
  form.className = "github-connection-form form-stack";
  const fields = document.createElement("fieldset");
  fields.className = "form-stack";
  const label = document.createElement("label");
  fields.append(label);
  form.append(fields);
  document.body.append(form);
  expect(getComputedStyle(form).gap).toBe("var(--space-12)");
  expect(getComputedStyle(fields).borderWidth).toBe("0px");
  expect(getComputedStyle(fields).padding).toBe("0px");
  expect(getComputedStyle(label).gap).toBe("var(--space-4)");
});

it("keeps danger hover rules out of the green action border state", () => {
  const action = document.createElement("button");
  action.className = "danger";
  document.body.append(action);
  const borders: string[] = [];
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(":hover")) continue;
      if (rule.selectorText.split(",").some((selector) => action.matches(selector.replaceAll(":hover", "")))) {
        const border = rule.style.getPropertyValue("border-color");
        if (border) borders.push(border);
      }
    }
  }
  expect(borders).not.toContain("var(--color-accent)");
  expect(borders.at(-1)).toBe("var(--color-danger)");
});

it.each(["release-tracking-panel", "product-context-panel", "mcp-config-panel", "roadmap-panel", "roadmap-card-form", "roadmap-editor", "github-form", "slice-move-controls"])("keeps %s actions intrinsic with shared form spacing", (className) => {
  const panel = document.createElement("section");
  panel.className = `${className} form-stack`;
  const action = document.createElement("button");
  const label = document.createElement("label");
  panel.append(label, action);
  document.body.append(panel);
  expect(getComputedStyle(panel).gap).toBe("var(--space-12)");
  expect(getComputedStyle(label).gap).toBe("var(--space-4)");
  expect(getComputedStyle(action).justifySelf).toBe("start");
  expect(getComputedStyle(action).alignSelf).toBe("start");
  expect(getComputedStyle(action).maxWidth).toBe("100%");
});

it.each(["release-external-refs", "changeset-item"])("uses wrapping and spaced actions in %s", (className) => {
  const item = document.createElement("article");
  item.className = className;
  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(document.createElement("strong"), document.createElement("button"));
  item.append(actions);
  document.body.append(item);
  const style = getComputedStyle(actions);
  expect(style.display).toBe("flex");
  expect(style.flexWrap).toBe("wrap");
  expect(style.gap).toBe("var(--space-8)");
  expect(getComputedStyle(actions.querySelector("button")!).minHeight).toBe("var(--control-height)");
});

it("gives the ChangeSet review its own full-width grid row below the action group", () => {
  const item = document.createElement("article");
  item.className = "changeset-item";
  document.body.append(item);
  expect(getComputedStyle(item).gridTemplateColumns).toBe("minmax(0, 1fr)");
});

it("wraps long release reference badges without changing badges elsewhere", () => {
  const releases = document.createElement("div");
  releases.className = "release-external-refs";
  const badge = document.createElement("span");
  badge.className = "external-ref-badge";
  badge.textContent = `planner:${"Release-42".repeat(60)}`;
  releases.append(badge);
  document.body.append(releases);
  expect(getComputedStyle(badge).whiteSpace).toBe("normal");
  expect(getComputedStyle(badge).maxWidth).toBe("100%");
  expect(getComputedStyle(badge).overflowWrap).toBe("anywhere");
  document.body.append(badge);
  expect(getComputedStyle(badge).whiteSpace).toBe("nowrap");
});

it("uses the shared gap without extra paragraph margins in form stacks", () => {
  const stack = document.createElement("section");
  stack.className = "form-stack";
  const paragraph = stack.appendChild(document.createElement("p"));
  document.body.append(stack);
  expect(getComputedStyle(stack).gap).toBe("var(--space-12)");
  expect(getComputedStyle(paragraph).marginBlock).toBe("0");
});
