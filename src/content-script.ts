// Content script : extraction (Readability), localisation des citations, surlignage
// par la CSS Custom Highlight API, bulles d'analyse au survol ou au toucher (Shadow
// DOM), message bref sur mobile et détection des clics (architecture §4 et §5).
// Injecté à la demande par le panneau ; ne modifie pas le DOM de la page.

import { Readability } from "@mozilla/readability";
import type { DisplayMode } from "./config";
import { ext } from "./ext";
import { getUiStrings } from "./i18n";
import type { ExtractResult, HighlightItem, HighlightResult, PanelToContent } from "./messages";
import { labelDef, type Category } from "./taxonomy";
import { findQuote, normalizeWithMap } from "./text-match";

declare global {
  interface Window {
    __rhetorix?: boolean;
  }
}

const HIGHLIGHT_NAMES: Record<Category, string> = {
  sophism: "rhetorix-sophism",
  bias: "rhetorix-bias",
  factual_claim: "rhetorix-factual",
};
const ACTIVE = "rhetorix-active";

const located = new Map<string, Range>();
const annotationsMap = new Map<string, HighlightItem>();
let currentDisplayMode: DisplayMode = "both";
let currentLang = "fr";
let activeHoverId: string | null = null;
let hideTimer: number | null = null;
let pointerRaf: number | null = null;

// ---------- Extraction ----------

const LEAF_BLOCKS = "p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, figcaption, td";

/** Métadonnée de publication nettoyée (C1) ; absente si vide. */
function meta(value: string | null | undefined): string | undefined {
  const v = value?.replace(/\s+/g, " ").trim().slice(0, 200);
  return v || undefined;
}

function extract(): ExtractResult {
  const article = new Readability(document.cloneNode(true) as Document).parse();
  if (!article?.content) return { ok: false, error: "Aucun contenu d'article détecté sur cette page.", errorCode: "no_article" };

  // DOMParser produit un document inerte : aucun script de la page n'est exécuté.
  const doc = new DOMParser().parseFromString(article.content, "text/html");
  let paragraphs = [...doc.body.querySelectorAll(LEAF_BLOCKS)]
    .filter((el) => !el.querySelector(LEAF_BLOCKS))
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    paragraphs = (article.textContent ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }
  if (paragraphs.length === 0) return { ok: false, error: "L'article extrait est vide.", errorCode: "empty_article" };

  return {
    ok: true,
    article: {
      title: article.title ?? document.title,
      lang: article.lang ?? document.documentElement.lang ?? "",
      paragraphs,
      publishedTime: meta(article.publishedTime),
      byline: meta(article.byline),
      siteName: meta(article.siteName),
    },
  };
}

// ---------- Index texte de la page ----------

const SKIPPED = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "SELECT", "SVG"]);
const BLOCK_SELECTOR = "p, div, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, pre, section, article, figcaption, header, footer, dd, dt";

interface Segment {
  node: Text;
  start: number;
}

interface PageIndex {
  hay: ReturnType<typeof normalizeWithMap>;
  segments: Segment[];
}

/**
 * Concatène les nœuds Text du body. Un espace est inséré entre deux nœuds de blocs
 * différents pour ne pas coller les mots ; entre nœuds inline du même bloc, rien
 * n'est inséré (une citation peut traverser <em>, <a>…).
 */
function buildIndex(): PageIndex {
  const segments: Segment[] = [];
  let text = "";
  let lastBlock: Element | null = null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let el = node.parentElement; el; el = el.parentElement) {
        if (SKIPPED.has(el.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const block = node.parentElement?.closest(BLOCK_SELECTOR) ?? null;
    if (segments.length > 0 && block !== lastBlock) text += " ";
    lastBlock = block;
    segments.push({ node, start: text.length });
    text += node.nodeValue;
  }
  return { hay: normalizeWithMap(text), segments };
}

/** Convertit un offset du texte concaténé en position (nœud, offset local). */
function locate(segments: Segment[], offset: number, isEnd: boolean): { node: Text; offset: number } {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const s = segments[mid]!;
    if (s.start < offset || (!isEnd && s.start === offset)) lo = mid;
    else hi = mid - 1;
  }
  const seg = segments[lo]!;
  return { node: seg.node, offset: Math.min(Math.max(offset - seg.start, 0), seg.node.length) };
}

// ---------- Bulles flottantes (Shadow DOM) ----------

let hostEl: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let popoverEl: HTMLElement | null = null;
let badgeEl: HTMLElement | null = null;
let labelEl: HTMLElement | null = null;
let severityEl: HTMLElement | null = null;
let critiqueEl: HTMLElement | null = null;
let factCheckEl: HTMLElement | null = null;
let factStatusEl: HTMLElement | null = null;
let factContextEl: HTMLElement | null = null;
let sourcesListEl: HTMLUListElement | null = null;

function ensurePopover(): void {
  if (hostEl) return;
  hostEl = document.createElement("div");
  hostEl.id = "rhetorix-popover-host";
  hostEl.style.position = "fixed";
  hostEl.style.top = "0";
  hostEl.style.left = "0";
  hostEl.style.width = "0";
  hostEl.style.height = "0";
  hostEl.style.zIndex = "2147483647";
  hostEl.style.pointerEvents = "none";
  (document.body || document.documentElement).appendChild(hostEl);

  shadow = hostEl.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .popover {
      position: fixed;
      box-sizing: border-box;
      pointer-events: auto;
      width: max-content;
      max-width: min(390px, calc(100vw - 32px));
      padding: 12px 14px;
      border-radius: 8px;
      background: #ffffff;
      color: #1c1f24;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.22), 0 1px 4px rgba(0, 0, 0, 0.12);
      border: 1px solid #dde1e6;
      border-left: 5px solid #5f6670;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      z-index: 2147483647;
      display: none;
    }
    .popover.visible {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }
    .popover.sophism { border-left-color: #c92a2a; }
    .popover.bias { border-left-color: #d9480f; }
    .popover.factual_claim { border-left-color: #1c64d1; }

    @media (prefers-color-scheme: dark) {
      .popover {
        background: #1f2228;
        color: #e6e8eb;
        border-color: #343a42;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3);
      }
      .popover.sophism { border-left-color: #ff8787; }
      .popover.bias { border-left-color: #ffa94d; }
      .popover.factual_claim { border-left-color: #74c0fc; }
    }

    .header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      color: #ffffff;
      background: #5f6670;
    }
    .badge.sophism { background: #c92a2a; }
    .badge.bias { background: #d9480f; }
    .badge.factual_claim { background: #1c64d1; }

    .label {
      font-weight: 600;
      font-size: 13px;
    }
    .severity {
      margin-left: auto;
      font-size: 11px;
      font-weight: 600;
      color: #5f6670;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.06);
    }
    .severity.severity-high {
      color: #c92a2a;
      background: rgba(201, 42, 42, 0.12);
    }
    @media (prefers-color-scheme: dark) {
      .severity {
        background: rgba(255, 255, 255, 0.08);
        color: #9aa1ab;
      }
      .severity.severity-high {
        color: #ff8787;
        background: rgba(255, 135, 135, 0.2);
      }
    }

    .critique {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.45;
    }

    .fact-check {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #dde1e6;
      font-size: 12px;
    }
    @media (prefers-color-scheme: dark) {
      .fact-check { border-top-color: #343a42; }
    }

    .fact-status {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .status-refuted { background: #ffe3e3; color: #c92a2a; }
    .status-supported { background: #d3f9d8; color: #2b8a3e; }
    .status-misleading { background: #ffe8cc; color: #d9480f; }
    .status-unverified { background: #e9ecef; color: #495057; }

    @media (prefers-color-scheme: dark) {
      .status-refuted { background: #4a1515; color: #ff8787; }
      .status-supported { background: #13391b; color: #8ce99a; }
      .status-misleading { background: #4a240b; color: #ffa94d; }
      .status-unverified { background: #2b3038; color: #adb5bd; }
    }

    .fact-context {
      margin: 4px 0 6px 0;
      font-size: 12px;
      line-height: 1.4;
    }

    .sources {
      margin: 4px 0 0 0;
      padding-left: 16px;
      font-size: 11.5px;
    }
    .sources li { margin-bottom: 2px; }
    .sources a {
      color: #1c64d1;
      text-decoration: underline;
      word-break: break-all;
    }
    @media (prefers-color-scheme: dark) {
      .sources a { color: #74c0fc; }
    }
  `;
  shadow.appendChild(style);

  popoverEl = document.createElement("div");
  popoverEl.className = "popover";

  const header = document.createElement("div");
  header.className = "header";
  badgeEl = document.createElement("span");
  badgeEl.className = "badge";
  labelEl = document.createElement("span");
  labelEl.className = "label";
  severityEl = document.createElement("span");
  severityEl.className = "severity";
  header.append(badgeEl, labelEl, severityEl);

  critiqueEl = document.createElement("p");
  critiqueEl.className = "critique";

  factCheckEl = document.createElement("div");
  factCheckEl.className = "fact-check";
  factStatusEl = document.createElement("span");
  factStatusEl.className = "fact-status";
  factContextEl = document.createElement("p");
  factContextEl.className = "fact-context";
  sourcesListEl = document.createElement("ul");
  sourcesListEl.className = "sources";
  factCheckEl.append(factStatusEl, factContextEl, sourcesListEl);

  popoverEl.append(header, critiqueEl, factCheckEl);
  shadow.appendChild(popoverEl);

  popoverEl.addEventListener("mouseenter", () => {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  });
  popoverEl.addEventListener("mouseleave", () => {
    scheduleHide();
  });
}

function updatePopoverPosition(range: Range): void {
  if (!popoverEl) return;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    hidePopover();
    return;
  }

  popoverEl.style.display = "block";
  popoverEl.style.visibility = "hidden";
  const pRect = popoverEl.getBoundingClientRect();
  const pWidth = pRect.width || 320;
  const pHeight = pRect.height || 180;

  let top: number;
  if (rect.top >= pHeight + 10) {
    top = rect.top - pHeight - 8;
  } else {
    top = rect.bottom + 8;
  }

  let left = rect.left + (rect.width - pWidth) / 2;
  const minLeft = 8;
  const maxLeft = window.innerWidth - pWidth - 8;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  popoverEl.style.top = `${Math.round(top)}px`;
  popoverEl.style.left = `${Math.round(left)}px`;
  popoverEl.style.visibility = "visible";
  popoverEl.classList.add("visible");
}

function showPopover(id: string): void {
  if (currentDisplayMode === "sidepanel") return;
  const range = located.get(id);
  const item = annotationsMap.get(id);
  if (!range || !item) return;

  ensurePopover();
  if (!popoverEl || !badgeEl || !labelEl || !severityEl || !critiqueEl || !factCheckEl || !factStatusEl || !factContextEl || !sourcesListEl) {
    return;
  }

  activeHoverId = id;
  const t = getUiStrings(currentLang);

  popoverEl.className = `popover ${item.category}`;
  badgeEl.textContent = t.categories[item.category];
  badgeEl.className = `badge ${item.category}`;

  const def = item.label ? labelDef(item.category, item.label, currentLang) : undefined;
  labelEl.textContent = def?.name ?? item.label ?? "";
  if (def?.definition) labelEl.title = def.definition;
  else labelEl.removeAttribute("title");

  if (item.severity) {
    severityEl.textContent = t.severities[item.severity];
    severityEl.className = `severity severity-${item.severity}`;
    severityEl.hidden = false;
  } else {
    severityEl.hidden = true;
  }

  critiqueEl.textContent = item.rhetoric_critique ?? "";
  critiqueEl.hidden = !item.rhetoric_critique;

  const fc = item.fact_check;
  if (item.category === "factual_claim" || (fc && (fc.context || fc.sources.length > 0))) {
    factCheckEl.hidden = false;
    if (fc) {
      factStatusEl.textContent = `${t.factCheckLabel} ${t.factStatuses[fc.status]}`;
      factStatusEl.className = `fact-status status-${fc.status}`;
      factContextEl.textContent = fc.context;
      factContextEl.hidden = !fc.context;

      sourcesListEl.replaceChildren();
      for (const s of fc.sources) {
        const a = document.createElement("a");
        a.href = s.url;
        a.textContent = s.title || new URL(s.url).hostname;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        const li = document.createElement("li");
        li.append(a);
        sourcesListEl.append(li);
      }
      sourcesListEl.hidden = fc.sources.length === 0;
    }
  } else {
    factCheckEl.hidden = true;
  }

  updatePopoverPosition(range);
}

function hidePopover(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  activeHoverId = null;
  if (popoverEl) {
    popoverEl.classList.remove("visible");
    popoverEl.style.display = "none";
  }
}

function scheduleHide(): void {
  if (hideTimer !== null) return;
  hideTimer = window.setTimeout(() => {
    hidePopover();
  }, 200);
}

// ---------- Message bref (mobile, sans panneau) ----------

let toastEl: HTMLElement | null = null;
let toastTimer: number | null = null;

function ensureToast(): HTMLElement {
  ensurePopover();
  if (toastEl) return toastEl;
  const style = document.createElement("style");
  style.textContent = `
    .toast {
      position: fixed;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      box-sizing: border-box;
      max-width: calc(100vw - 32px);
      padding: 10px 14px;
      border-radius: 8px;
      background: #1c1f24;
      color: #ffffff;
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
    }
    .toast.error { background: #c92a2a; }
  `;
  toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.setAttribute("role", "status");
  toastEl.hidden = true;
  toastEl.addEventListener("click", hideToast);
  shadow!.append(style, toastEl);
  return toastEl;
}

function hideToast(): void {
  if (toastEl) toastEl.hidden = true;
}

/** durationMs = 0 : le message reste affiché jusqu'au suivant. */
function showToast(text: string, isError = false, durationMs = 0): void {
  const el = ensureToast();
  el.textContent = text;
  el.classList.toggle("error", isError);
  el.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = durationMs > 0 ? window.setTimeout(hideToast, durationMs) : null;
}

// ---------- Surlignage ----------

function clear(): void {
  hidePopover();
  located.clear();
  annotationsMap.clear();
  for (const name of [...Object.values(HIGHLIGHT_NAMES), ACTIVE]) CSS.highlights.delete(name);
}

function highlight(items: HighlightItem[], mode?: DisplayMode, lang?: string): HighlightResult {
  clear();
  if (mode) currentDisplayMode = mode;
  if (lang) currentLang = lang;

  const index = buildIndex();
  const groups: Record<Category, Range[]> = { sophism: [], bias: [], factual_claim: [] };
  const unlocated: string[] = [];

  for (const item of items) {
    annotationsMap.set(item.id, item);
    const match = findQuote(index.hay, item.exact_quote);
    if (!match) {
      unlocated.push(item.id);
      continue;
    }
    const start = locate(index.segments, match.start, false);
    const end = locate(index.segments, match.end, true);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    located.set(item.id, range);
    groups[item.category].push(range);
  }
  for (const [category, ranges] of Object.entries(groups) as [Category, Range[]][]) {
    if (ranges.length) CSS.highlights.set(HIGHLIGHT_NAMES[category], new Highlight(...ranges));
  }
  return { unlocated };
}

function setActive(id: string): Range | undefined {
  const range = located.get(id);
  if (range) CSS.highlights.set(ACTIVE, new Highlight(range));
  else CSS.highlights.delete(ACTIVE);
  return range;
}

function focus(id: string): void {
  const range = setActive(id);
  const el = range?.startContainer.parentElement;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- Détection du survol et clic ----------

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const pos = document.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = (document as Document & { caretRangeFromPoint?(x: number, y: number): Range | null }).caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType !== "mouse" || currentDisplayMode === "sidepanel" || located.size === 0) return;
  if (pointerRaf !== null) return;
  const x = event.clientX;
  const y = event.clientY;
  pointerRaf = window.requestAnimationFrame(() => {
    pointerRaf = null;

    if (popoverEl && popoverEl.classList.contains("visible")) {
      const pRect = popoverEl.getBoundingClientRect();
      if (x >= pRect.left && x <= pRect.right && y >= pRect.top && y <= pRect.bottom) {
        if (hideTimer !== null) {
          window.clearTimeout(hideTimer);
          hideTimer = null;
        }
        return;
      }
    }

    const point = caretAt(x, y);
    if (!point) {
      if (activeHoverId) scheduleHide();
      return;
    }

    let foundId: string | null = null;
    for (const [id, range] of located) {
      try {
        if (range.isPointInRange(point.node, point.offset)) {
          foundId = id;
          break;
        }
      } catch {
        // Nœud détaché : on ignore.
      }
    }

    if (foundId) {
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (foundId !== activeHoverId) {
        showPopover(foundId);
      }
    } else if (activeHoverId) {
      scheduleHide();
    }
  });
}

function onScrollOrResize(): void {
  if (!activeHoverId || !popoverEl || !popoverEl.classList.contains("visible")) return;
  const range = located.get(activeHoverId);
  if (range) updatePopoverPosition(range);
}

/**
 * Clic, ou toucher sur mobile (D9) : met la citation en avant, ouvre sa bulle et
 * prévient le panneau. Un toucher hors des citations et de la bulle ferme celle-ci.
 */
function onClick(event: MouseEvent): void {
  if (located.size === 0) return;
  if (popoverEl && event.composedPath().includes(popoverEl)) return;
  const point = caretAt(event.clientX, event.clientY);
  if (point) {
    for (const [id, range] of located) {
      try {
        if (range.isPointInRange(point.node, point.offset)) {
          setActive(id);
          if (id !== activeHoverId) showPopover(id);
          ext.runtime.sendMessage({ type: "annotation-clicked", id }).catch(() => {
            // Panneau fermé : rien à synchroniser.
          });
          return;
        }
      } catch {
        // Nœud détaché ou dans un autre document : on ignore.
      }
    }
  }
  if (activeHoverId) hidePopover();
}

// ---------- Messages ----------

function init(): void {
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  // Au doigt, pointerleave suit chaque toucher : seule la souris referme la bulle ainsi.
  document.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && scheduleHide(), { passive: true });
  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });

  ext.runtime.onMessage.addListener((msg: PanelToContent, _sender, sendResponse) => {
    switch (msg.type) {
      case "extract":
        sendResponse(extract());
        break;
      case "highlight":
        sendResponse(highlight(msg.annotations, msg.displayMode, msg.lang));
        break;
      case "set-display-mode":
        currentDisplayMode = msg.displayMode;
        if (currentDisplayMode === "sidepanel") hidePopover();
        sendResponse(null);
        break;
      case "focus":
        focus(msg.id);
        sendResponse(null);
        break;
      case "clear":
        clear();
        sendResponse(null);
        break;
      case "toast":
        showToast(msg.text, msg.isError, msg.durationMs);
        sendResponse(null);
        break;
    }
    return false;
  });
}

// Le panneau peut réinjecter le script : une seule initialisation par page.
if (!window.__rhetorix) {
  window.__rhetorix = true;
  init();
}
