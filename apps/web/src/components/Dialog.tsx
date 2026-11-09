import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  alert?: boolean;
  dismissible?: boolean;
  initialFocus?: "heading" | "container";
  cardId?: string | undefined;
  className?: string;
  returnFocus?: HTMLElement | null | undefined;
  children?: ReactNode;
}

interface DialogLayer {
  element: HTMLElement;
  depth: number;
}

interface DialogStack {
  layers: DialogLayer[];
  inert: Map<HTMLElement, boolean>;
  observer: MutationObserver;
}

const DialogDepth = createContext(0);
const stacks = new WeakMap<Document, DialogStack>();
const focusableSelector = 'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"], summary';

function topLayer(stack: DialogStack): HTMLElement | undefined {
  return stack.layers.reduce<DialogLayer | undefined>((top, layer) => !top || layer.depth >= top.depth ? layer : top, undefined)?.element;
}

function updateInert(document: Document, stack: DialogStack): void {
  const top = topLayer(stack);
  for (const element of document.body.children) {
    if (!(element instanceof HTMLElement)) continue;
    if (!stack.inert.has(element)) stack.inert.set(element, element.inert || element.hasAttribute("inert"));
    element.inert = element !== top;
    element.toggleAttribute("inert", element !== top);
  }
}

function registerLayer(element: HTMLElement, depth: number): DialogStack {
  const document = element.ownerDocument;
  let stack = stacks.get(document);
  if (!stack) {
    const observer = new MutationObserver(() => updateInert(document, stack!));
    stack = { layers: [], inert: new Map(), observer };
    stacks.set(document, stack);
    observer.observe(document.body, { childList: true });
  }
  stack.layers.push({ element, depth });
  document.body.append(element);
  updateInert(document, stack);
  return stack;
}

function unregisterLayer(element: HTMLElement, stack: DialogStack): void {
  stack.layers = stack.layers.filter((layer) => layer.element !== element);
  element.remove();
  stack.inert.delete(element);
  if (stack.layers.length) updateInert(element.ownerDocument, stack);
  else {
    stack.observer.disconnect();
    for (const [background, inert] of stack.inert) {
      background.inert = inert;
      background.toggleAttribute("inert", inert);
    }
    stacks.delete(element.ownerDocument);
  }
}

function canFocus(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[inert], [hidden], [aria-hidden="true"]') || element.matches(":disabled")) return false;
  for (let ancestor: HTMLElement | null = element;ancestor;ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function tabbableElements(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(focusableSelector)].filter((target) => target.tabIndex >= 0 && canFocus(target) && !skippedByRadioGroup(target, element));
}

function skippedByRadioGroup(target: HTMLElement, layer: HTMLElement): boolean {
  if (!(target instanceof HTMLInputElement) || target.type !== "radio" || target.checked || !target.name) return false;
  return [...layer.querySelectorAll<HTMLInputElement>('input[type="radio"]')].some((peer) => peer.name === target.name && peer.checked);
}

function initialTarget(element: HTMLElement, alert: boolean): HTMLElement {
  const container = element.querySelector<HTMLElement>('[data-dialog-container-focus]');
  if (container) return container;
  const cancel = alert ? element.querySelector<HTMLElement>('[data-dialog-cancel]:not(:disabled)') : null;
  return (cancel && canFocus(cancel) ? cancel : null) ?? (alert ? tabbableElements(element)[0] : null) ?? element.querySelector<HTMLElement>("[data-dialog-heading]")!;
}

function restoreFocus(document: Document, stack: DialogStack, opener: HTMLElement | null, cardId?: string): void {
  const top = topLayer(stack);
  if (top) {
    (opener && top.contains(opener) && canFocus(opener) ? opener : initialTarget(top, top.querySelector('[role="alertdialog"]') !== null)).focus();
    return;
  }
  const tile = [...document.querySelectorAll<HTMLButtonElement>("button[data-card-id]")].find((button) => button.dataset.cardId === cardId && canFocus(button));
  const board = document.querySelector<HTMLElement>("[data-story-map-board]");
  const target = opener && canFocus(opener) ? opener : tile ?? board;
  if (target && canFocus(target)) target.focus();
}

export function Dialog({ title, description, onClose, alert = false, dismissible = true, initialFocus = "heading", cardId, className = "discovery-dialog", returnFocus, children }: DialogProps) {
  const depth = useContext(DialogDepth);
  const titleId = useId();
  const descriptionId = useId();
  const [layer] = useState(() => document.createElement("div"));
  const props = useRef({ onClose, alert, cardId, dismissible, returnFocus });
  props.current = { onClose, alert, cardId, dismissible, returnFocus };

  useDialogLayer(layer, depth, props, alert, initialFocus);

  layer.className = "modal-backdrop dialog-layer";
  layer.style.zIndex = String(1000 + depth);
  return createPortal(
    <DialogDepth.Provider value={depth + 1}>
      <div className="dialog-backdrop-hit-area" onMouseDown={(event) => {
        const stack = stacks.get(document);
        if (props.current.dismissible && event.target === event.currentTarget && stack && topLayer(stack) === layer) props.current.onClose();
      }}>
        <section className={className} role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={initialFocus === "container" ? -1 : undefined} data-dialog-container-focus={initialFocus === "container" ? true : undefined}>
          <h2 id={titleId} tabIndex={-1} data-dialog-heading>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
          {children}
        </section>
      </div>
    </DialogDepth.Provider>, layer
  );
}

function useDialogLayer(layer: HTMLDivElement, depth: number, props: import("react").RefObject<{ onClose: () => void; alert: boolean; cardId: string | undefined; dismissible: boolean; returnFocus: HTMLElement | null | undefined }>, alert: boolean, initialFocus: string) {
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const stack = registerLayer(layer, depth);
    let lastFocused = initialTarget(layer, props.current.alert);
    function containFocus(event: FocusEvent) {
      if (topLayer(stack) !== layer) return;
      if (event.target instanceof HTMLElement && layer.contains(event.target)) lastFocused = event.target;
      else (canFocus(lastFocused) ? lastFocused : initialTarget(layer, props.current.alert)).focus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (topLayer(stack) !== layer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const editor = event.target instanceof Element ? event.target.closest('[data-dialog-editor-escape][contenteditable="true"]') : null;
        if (editor && layer.contains(editor)) initialTarget(layer, props.current.alert).focus();
        else if (props.current.dismissible) props.current.onClose();
      } else if (event.key === "Tab") {
        const targets = tabbableElements(layer);
        const index = targets.indexOf(document.activeElement as HTMLElement);
        if (!targets.length || index < 0 || (event.shiftKey ? index === 0 : index === targets.length - 1)) {
          event.preventDefault();
          ((event.shiftKey ? targets.at(-1) : targets[0]) ?? initialTarget(layer, props.current.alert)).focus();
        }
      }
    }
    document.addEventListener("focusin", containFocus, true);
    document.addEventListener("keydown", onKeyDown, true);
    if (topLayer(stack) === layer) lastFocused.focus();
    return () => {
      document.removeEventListener("focusin", containFocus, true);
      document.removeEventListener("keydown", onKeyDown, true);
      unregisterLayer(layer, stack);
      const restoreCardId = props.current.cardId;
      queueMicrotask(() => restoreFocus(document, stacks.get(document) ?? stack, props.current.returnFocus ?? opener, restoreCardId));
    };
  }, [depth, layer]);

  useLayoutEffect(() => {
    const stack = stacks.get(document);
    if (stack && topLayer(stack) === layer) initialTarget(layer, alert).focus();
  }, [initialFocus, layer, alert]);
}
