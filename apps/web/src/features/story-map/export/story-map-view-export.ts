import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import exportStyles from "@storymapper/web/features/story-map/export/story-map-export.css?raw";
import "@storymapper/web/features/story-map/export/story-map-export.css";

export type StoryMapViewKind = "discovery" | "tree" | "planning" | "backlog" | "tracking" | "timeline";
export type StoryMapExportFormat = "html" | "png" | "pdf";

interface ExportStoryMapViewOptions {
  storyMapName: string;
  viewKind: StoryMapViewKind;
  format: StoryMapExportFormat;
}

const EXPORT_TARGET_ATTRIBUTE = "data-story-map-export-target";
const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const PNG_CONTENT_TYPE = "image/png";
const PDF_UNIT = "pt";
const CANVAS_SCALE_LIMIT = 2;
const HTML_EXPORT_INTERACTION_SCRIPT = `(() => { const dialog = document.querySelector('[data-export-description-dialog]'); if (!dialog) return; const title = dialog.querySelector('[data-export-description-title]'); const key = dialog.querySelector('[data-export-description-key]'); const description = dialog.querySelector('[data-export-description-text]'); const openCard = (card) => { if (!card || !title || !key || !description) return; title.textContent = card.getAttribute('data-export-card-title') || ${JSON.stringify(strings.card)}; key.textContent = card.getAttribute('data-export-card-key') || ''; description.textContent = card.getAttribute('data-export-card-description') || ''; if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', 'open'); }; document.querySelectorAll('[data-export-card-description]').forEach((card) => { card.addEventListener('click', () => openCard(card)); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCard(card); } }); }); dialog.querySelectorAll('[data-export-description-close]').forEach((button) => { button.addEventListener('click', () => dialog.close()); }); dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }); })();`;

export async function exportStoryMapView({ storyMapName, viewKind, format }: ExportStoryMapViewOptions): Promise<void> {
  const target = getExportTarget(viewKind);
  const baseName = `${slugifyFileName(storyMapName)}-${viewKind}`;

  if (format === "html") {
    const html = await buildStandaloneHtml(target, storyMapName, viewKind);
    downloadBlob(new Blob([html], { type: HTML_CONTENT_TYPE }), `${baseName}.html`);
    return;
  }

  const canvas = await renderTargetToCanvas(target);
  if (format === "png") {
    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, `${baseName}.png`);
    return;
  }

  downloadPdf(canvas, `${baseName}.pdf`);
}

function getExportTarget(viewKind: StoryMapViewKind): HTMLElement {
  const target = document.querySelector<HTMLElement>(`[${EXPORT_TARGET_ATTRIBUTE}="${viewKind}"]`);
  if (!target) {
    throw new Error(strings.exportTargetNotFound(viewKind));
  }
  return target;
}

async function buildStandaloneHtml(target: HTMLElement, storyMapName: string, viewKind: StoryMapViewKind): Promise<string> {
  const clone = target.cloneNode(true) as HTMLElement;
  preserveFormControlValues(target, clone);
  addDescriptionInteractions(clone);
  appendExportDateStamp(clone);
  await inlineImages(target, clone);

  const width = Math.max(target.scrollWidth, target.clientWidth);
  const height = Math.max(target.scrollHeight, target.clientHeight);
  const styles = collectStyleSheetText();
  const title = strings.exportTitle(storyMapName, viewKind);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${styles}\n[${EXPORT_TARGET_ATTRIBUTE}]{width:${width}px;min-height:${height}px;overflow:visible !important;max-height:none !important;}\n${exportStyles}</style></head><body class="export-document">${clone.outerHTML}${buildDescriptionDialogHtml()}<script>${HTML_EXPORT_INTERACTION_SCRIPT}</script></body></html>`;
}

function addDescriptionInteractions(clone: HTMLElement): void {
  const cards = clone.querySelectorAll<HTMLElement>("[data-export-card-description]");
  cards.forEach((card) => {
    const description = card.dataset.exportCardDescription?.trim();
    if (!description) {
      card.removeAttribute("data-export-card-description");
      return;
    }
    card.dataset.exportCardPreview = description.length > 220 ? `${description.slice(0, 220)}...` : description;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", strings.showDescription(card.dataset.exportCardKey ?? strings.cardLowercase));
  });
}

function buildDescriptionDialogHtml(): string {
  return `<dialog class="export-description-dialog" data-export-description-dialog><article><header><div><small data-export-description-key></small><h2 data-export-description-title></h2></div><button type="button" class="secondary" data-export-description-close>${escapeHtml(strings.close)}</button></header><p data-export-description-text></p></article></dialog>`;
}

function preserveFormControlValues(source: HTMLElement, clone: HTMLElement): void {
  const sourceControls = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const cloneControls = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  sourceControls.forEach((sourceControl, index) => {
    const cloneControl = cloneControls[index];
    if (!cloneControl) return;
    if (sourceControl instanceof HTMLTextAreaElement && cloneControl instanceof HTMLTextAreaElement) {
      cloneControl.textContent = sourceControl.value;
      return;
    }
    if (sourceControl instanceof HTMLSelectElement && cloneControl instanceof HTMLSelectElement) {
      preserveSelectedOptions(sourceControl, cloneControl);
      return;
    }
    if (sourceControl instanceof HTMLInputElement && cloneControl instanceof HTMLInputElement) {
      preserveInputValue(sourceControl, cloneControl);
    }
  });
}

function preserveSelectedOptions(source: HTMLSelectElement, clone: HTMLSelectElement): void {
  [...clone.options].forEach((option) => option.removeAttribute("selected"));
  [...source.selectedOptions].forEach((selectedOption) => {
    const cloneOption = clone.options.item(selectedOption.index);
    cloneOption?.setAttribute("selected", "selected");
  });
}

function preserveInputValue(source: HTMLInputElement, clone: HTMLInputElement): void {
  if (source.type === "checkbox" || source.type === "radio") {
    clone.toggleAttribute("checked", source.checked);
    return;
  }
  clone.setAttribute("value", source.value);
}

async function inlineImages(source: HTMLElement, clone: HTMLElement): Promise<void> {
  const sourceImages = [...source.querySelectorAll<HTMLImageElement>("img")];
  const cloneImages = [...clone.querySelectorAll<HTMLImageElement>("img")];
  await Promise.all(sourceImages.map(async (sourceImage, index) => {
    const cloneImage = cloneImages[index];
    if (!cloneImage || !sourceImage.currentSrc || sourceImage.currentSrc.startsWith("data:")) return;
    cloneImage.src = await fetchAsDataUrl(sourceImage.currentSrc);
  }));
}

async function fetchAsDataUrl(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(strings.imageExportFailedFor(sourceUrl));
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error(strings.imageExportFailed)));
    reader.readAsDataURL(blob);
  });
}

function collectStyleSheetText(): string {
  return [...document.styleSheets].filter(isSameOriginStyleSheet).map(inlineStyleSheet).join("\n");
}

function inlineStyleSheet(styleSheet: CSSStyleSheet): string {
  return [...styleSheet.cssRules].map((rule) => {
    if (rule.type === 3) {
      const imported = (rule as CSSImportRule).styleSheet;
      if (!imported || !isSameOriginStyleSheet(imported)) throw new Error("Export stylesheet must be available locally.");
      return inlineStyleSheet(imported);
    }
    return rule.cssText;
  }).join("\n");
}

function isSameOriginStyleSheet(styleSheet: CSSStyleSheet): boolean {
  return !styleSheet.href || isSameOriginUrl(styleSheet.href);
}

function isSameOriginUrl(value: string): boolean {
  return new URL(value, window.location.href).origin === window.location.origin;
}

async function renderTargetToCanvas(target: HTMLElement): Promise<HTMLCanvasElement> {
  const captureTarget = createCanvasCaptureTarget(target);
  await waitForRenderFrame();
  try {
    return await html2canvas(captureTarget.element, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim(),
      height: captureTarget.height,
      scale: Math.min(window.devicePixelRatio || 1, CANVAS_SCALE_LIMIT),
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      width: captureTarget.width,
      windowHeight: captureTarget.height,
      windowWidth: captureTarget.width
    });
  } finally {
    captureTarget.remove();
  }
}

function createCanvasCaptureTarget(target: HTMLElement): { element: HTMLElement; width: number; height: number; remove: () => void } {
  const content = target.querySelector<HTMLElement>(".discovery-matrix");
  const containerWidth = Math.max(target.scrollWidth, target.clientWidth);
  const containerHeight = Math.max(target.scrollHeight, target.clientHeight);
  const baseWidth = content ? Math.min(containerWidth, Math.max(content.scrollWidth, 1)) : containerWidth;
  const baseHeight = content ? Math.min(containerHeight, Math.max(content.scrollHeight, 1)) : containerHeight;
  const zoom = readDiscoveryMatrixZoom(target);
  const width = Math.ceil(baseWidth / zoom);
  const height = Math.ceil(baseHeight / zoom);
  const viewKind = target.getAttribute(EXPORT_TARGET_ATTRIBUTE);
  if (!viewKind) {
    throw new Error(strings.missingExportViewMarker);
  }
  const clonedTarget = target.cloneNode(true) as HTMLElement;
  preserveFormControlValues(target, clonedTarget);
  prepareCanvasCaptureTarget(clonedTarget, width, height);
  const stage = document.createElement("div");
  stage.className = "export-capture-stage";
  stage.style.top = `${document.documentElement.scrollHeight + 100}px`;
  stage.style.width = `${width}px`;
  stage.style.minHeight = `${height}px`;
  stage.append(clonedTarget);
  document.body.append(stage);
  return {
    element: clonedTarget,
    width,
    height,
    remove: () => stage.remove()
  };
}

function prepareCanvasCaptureTarget(clonedTarget: HTMLElement, width: number, height: number): void {
  clonedTarget.style.width = `${width}px`;
  clonedTarget.style.minHeight = `${height}px`;
  clonedTarget.style.maxHeight = "none";
  clonedTarget.style.overflow = "visible";
  clonedTarget.classList.add("export-capture-target");
  normalizeClonedDiscoveryMatrix(clonedTarget);
  normalizeClonedStickyCells(clonedTarget);
  normalizeClonedCanvasEffects(clonedTarget);
  resetClonedDragArtifacts(clonedTarget);
  appendExportDateStamp(clonedTarget);
}

function appendExportDateStamp(element: HTMLElement): void {
  const stamp = document.createElement("div");
  stamp.textContent = strings.exportStamp(formatExportTimestamp(new Date()));
  stamp.className = "export-date-stamp";
  element.style.position = "relative";
  element.append(stamp);
}

function formatExportTimestamp(date: Date): string {
  return new Intl.DateTimeFormat(strings.exportLocale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function waitForRenderFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function readDiscoveryMatrixZoom(target: HTMLElement): number {
  const discoveryMatrix = target.querySelector<HTMLElement>(".discovery-matrix");
  if (!discoveryMatrix) return 1;
  const zoom = Number.parseFloat(window.getComputedStyle(discoveryMatrix).getPropertyValue("zoom"));
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function normalizeClonedDiscoveryMatrix(clonedTarget: HTMLElement): void {
  const discoveryMatrix = clonedTarget.querySelector<HTMLElement>(".discovery-matrix");
  if (!discoveryMatrix) return;
  discoveryMatrix.style.zoom = "1";
  discoveryMatrix.style.setProperty("--discovery-zoom", "1");
  discoveryMatrix.style.transformOrigin = "initial";
  discoveryMatrix.style.transform = "none";
}

const STICKY_SELECTOR = ".discovery-activity-cell, .discovery-step-cell, .discovery-add-activity-cell, .discovery-lane-pinned, .discovery-pinned-block, .tree-header";

function normalizeClonedStickyCells(clonedTarget: HTMLElement): void {
  const stickyCells = clonedTarget.querySelectorAll<HTMLElement>(STICKY_SELECTOR);
  stickyCells.forEach((stickyCell) => {
    stickyCell.style.position = "static";
    stickyCell.style.top = "auto";
    stickyCell.style.right = "auto";
    stickyCell.style.bottom = "auto";
    stickyCell.style.left = "auto";
    stickyCell.style.zIndex = "auto";
    stickyCell.style.boxShadow = "none";
  });
}

function normalizeClonedCanvasEffects(clonedTarget: HTMLElement): void {
  const shadowedElements = clonedTarget.querySelectorAll<HTMLElement>(".card-tile, .card-detail-modal, .modal-panel");
  shadowedElements.forEach((shadowedElement) => {
    shadowedElement.style.boxShadow = "none";
  });
}

function resetClonedDragArtifacts(clonedTarget: HTMLElement): void {
  const dragArtifactElements = [clonedTarget, ...clonedTarget.querySelectorAll<HTMLElement>("[style]")];
  dragArtifactElements.forEach((element) => {
    if (element.style.opacity && Number.parseFloat(element.style.opacity) < 1) {
      element.style.opacity = "1";
    }
    if (element.style.transform && !element.classList.contains("discovery-matrix")) {
      element.style.transform = "none";
    }
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(strings.pngExportFailed));
        return;
      }
      resolve(blob);
    }, PNG_CONTENT_TYPE);
  });
}

function downloadPdf(canvas: HTMLCanvasElement, fileName: string): void {
  const width = canvas.width;
  const height = canvas.height;
  const pdf = new jsPDF({ orientation: width >= height ? "landscape" : "portrait", unit: PDF_UNIT, format: [width, height] });
  pdf.addImage(canvas.toDataURL(PNG_CONTENT_TYPE), "PNG", 0, 0, width, height);
  pdf.save(fileName);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

function slugifyFileName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "story-map";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character] ?? character);
}
