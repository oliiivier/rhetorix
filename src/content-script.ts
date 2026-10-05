// Content script : extraction (Readability), localisation des citations, surlignage
// par la CSS Custom Highlight API, bulles d'analyse au survol ou au toucher (Shadow
// DOM), message bref sur mobile et détection des clics (architecture §4 et §5).
// Les annotations d'ensemble (B3) sont ancrées sur le titre de l'article.
// Injecté à la demande par le panneau ; ne modifie pas le DOM de la page.

import { Readability } from "@mozilla/readability";
import { AnnotationPopover, type EntryState } from "./annotation-popover";
import type { DisplayMode } from "./config";
import { CONTESTED_KEY, contestKey, loadContested } from "./contested";
import { ext } from "./ext";
import { getUiStrings } from "./i18n";
import type { ExtractResult, HighlightItem, HighlightResult, PanelToBackground, PanelToContent } from "./messages";
import { isDocumentLevel } from "./schema";
import type { Category } from "./taxonomy";
import { findQuote, normalize, normalizeWithMap } from "./text-match";

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
/** Titre de l'article, ancre des annotations d'ensemble (B3). */
const DOCUMENT = "rhetorix-document";
/** Annotations contestées par l'utilisateur (Q4). */
const CONTESTED = "rhetorix-contested";
/** Clé de `located` pour le titre. */
const TITLE_ID = "rhetorix-title";

const located = new Map<string, Range>();
const annotationsMap = new Map<string, HighlightItem>();
/** Annotations d'ensemble, dans l'ordre de l'analyse. */
let documentIds: string[] = [];
const verifying = new Set<string>();
const verifyErrors = new Map<string, string>();
/** Clés (contestKey) des annotations contestées. */
let contestedKeys = new Set<string>();
let currentDisplayMode: DisplayMode = "both";
let hideTimer: number | null = null;
let pointerRaf: number | null = null;

function isContested(id: string): boolean {
  const item = annotationsMap.get(id);
  return Boolean(item && contestedKeys.has(contestKey(location.href, item)));
}

function sendToBackground(msg: PanelToBackground): void {
  ext.runtime.sendMessage(msg).catch(() => {
    // Script de fond indisponible : rien à faire.
  });
}

const popover = new AnnotationPopover(
  {
    onVerify: (id) => sendToBackground({ type: "verify-annotation", id }),
    onContest: (id, contested) => sendToBackground({ type: "contest-annotation", id, contested }),
    onMouseEnter: () => cancelHide(),
    onMouseLeave: () => scheduleHide(),
  },
  (id): EntryState => ({ verifying: verifying.has(id), error: verifyErrors.get(id), contested: isContested(id) }),
);

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


// ---------- Bulles ----------

function showPopover(id: string): void {
  if (currentDisplayMode === "sidepanel") return;
  const range = located.get(id);
  if (!range) return;
  if (id === TITLE_ID) {
    const items = documentIds.map((d) => annotationsMap.get(d)).filter((it): it is HighlightItem => Boolean(it));
    popover.show(id, range, items, getUiStrings(popover.lang).documentLevelHeading);
    return;
  }
  const item = annotationsMap.get(id);
  if (item) popover.show(id, range, [item]);
}

function hidePopover(): void {
  cancelHide();
  popover.hide();
}

function cancelHide(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide(): void {
  if (hideTimer !== null) return;
  hideTimer = window.setTimeout(() => {
    hideTimer = null;
    popover.hide();
  }, 200);
}

// ---------- Surlignage ----------

function clear(): void {
  hidePopover();
  located.clear();
  annotationsMap.clear();
  documentIds = [];
  verifying.clear();
  verifyErrors.clear();
  for (const name of [...Object.values(HIGHLIGHT_NAMES), ACTIVE, DOCUMENT, CONTESTED]) CSS.highlights.delete(name);
}

/** Les annotations contestées (Q4) passent du surlignage de leur catégorie à un surlignage atténué. */
function applyHighlights(): void {
  const groups: Record<Category, Range[]> = { sophism: [], bias: [], factual_claim: [] };
  const contested: Range[] = [];
  for (const [id, range] of located) {
    const item = annotationsMap.get(id);
    if (!item) continue;
    if (isContested(id)) contested.push(range);
    else groups[item.category].push(range);
  }
  for (const [category, ranges] of Object.entries(groups) as [Category, Range[]][]) {
    if (ranges.length) CSS.highlights.set(HIGHLIGHT_NAMES[category], new Highlight(...ranges));
    else CSS.highlights.delete(HIGHLIGHT_NAMES[category]);
  }
  if (contested.length) CSS.highlights.set(CONTESTED, new Highlight(...contested));
  else CSS.highlights.delete(CONTESTED);
}

/**
 * Plage du titre de l'article (B3) : de préférence un <h1> dont le texte correspond au
 * titre extrait (Readability peut y ajouter le nom du site), sinon la première
 * occurrence du titre dans la page, sinon le seul <h1> de la page.
 */
function locateTitle(title: string | undefined, index: PageIndex): Range | null {
  const visible = (h: Element) => (h as HTMLElement).offsetParent !== null || h.getClientRects().length > 0;
  const headings = [...document.querySelectorAll("h1")].filter((h) => visible(h) && (h.textContent ?? "").trim());
  const wanted = title ? normalize(title) : "";
  const contentsOf = (h: Element) => {
    const range = document.createRange();
    range.selectNodeContents(h);
    return range;
  };
  if (wanted) {
    const h = headings.find((h) => {
      const text = normalize(h.textContent ?? "");
      return text.length > 0 && (wanted.includes(text) || text.includes(wanted));
    });
    if (h) return contentsOf(h);
    const match = findQuote(index.hay, title!);
    if (match) {
      const range = document.createRange();
      const start = locate(index.segments, match.start, false);
      const end = locate(index.segments, match.end, true);
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return range;
    }
  }
  return headings.length === 1 ? contentsOf(headings[0]!) : null;
}

function highlight(items: HighlightItem[], mode?: DisplayMode, lang?: string, title?: string, canVerify?: boolean): HighlightResult {
  clear();
  if (mode) currentDisplayMode = mode;
  if (lang) popover.lang = lang;
  popover.canVerify = Boolean(canVerify);

  const index = buildIndex();
  const unlocated: string[] = [];

  for (const item of items) {
    annotationsMap.set(item.id, item);
    if (isDocumentLevel(item)) {
      documentIds.push(item.id);
      continue;
    }
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
  }
  applyHighlights();

  let titleLocated = false;
  if (documentIds.length > 0) {
    const range = locateTitle(title, index);
    if (range) {
      located.set(TITLE_ID, range);
      CSS.highlights.set(DOCUMENT, new Highlight(range));
      titleLocated = true;
    }
  }
  return { unlocated, titleLocated };
}

function setActive(id: string): Range | undefined {
  const range = located.get(documentIds.includes(id) ? TITLE_ID : id);
  if (range) CSS.highlights.set(ACTIVE, new Highlight(range));
  else CSS.highlights.delete(ACTIVE);
  return range;
}

function focus(id: string): void {
  const range = setActive(id);
  const node = range?.startContainer;
  const el = node instanceof Element ? node : node?.parentElement;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** Annotation modifiée par une vérification à la demande (C2). */
function updateAnnotation(item: HighlightItem, isVerifying?: boolean, error?: string): void {
  if (!annotationsMap.has(item.id)) return;
  annotationsMap.set(item.id, item);
  if (isVerifying) verifying.add(item.id);
  else verifying.delete(item.id);
  if (error) verifyErrors.set(item.id, error);
  else verifyErrors.delete(item.id);
  popover.update(item);
  popover.refresh();
}

async function refreshContested(): Promise<void> {
  contestedKeys = new Set((await loadContested()).map((e) => e.key));
  if (annotationsMap.size === 0) return;
  applyHighlights();
  popover.refresh();
}

// ---------- Détection du survol et clic ----------

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const pos = document.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = (document as Document & { caretRangeFromPoint?(x: number, y: number): Range | null }).caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** Ancre (annotation ou titre) sous le point, s'il y en a une. */
function anchorAt(x: number, y: number): string | null {
  const point = caretAt(x, y);
  if (!point) return null;
  for (const [id, range] of located) {
    try {
      if (range.isPointInRange(point.node, point.offset)) return id;
    } catch {
      // Nœud détaché ou dans un autre document : on ignore.
    }
  }
  return null;
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType !== "mouse" || currentDisplayMode === "sidepanel" || located.size === 0) return;
  if (pointerRaf !== null) return;
  const x = event.clientX;
  const y = event.clientY;
  pointerRaf = window.requestAnimationFrame(() => {
    pointerRaf = null;
    if (popover.containsPoint(x, y)) {
      cancelHide();
      return;
    }
    const foundId = anchorAt(x, y);
    if (foundId) {
      cancelHide();
      if (foundId !== popover.anchorId) showPopover(foundId);
    } else if (popover.anchorId) {
      scheduleHide();
    }
  });
}

function onScrollOrResize(): void {
  if (popover.anchorId && popover.visible) popover.reposition();
}

/**
 * Clic, ou toucher sur mobile (D9) : met la citation en avant, ouvre sa bulle et
 * prévient le panneau. Un toucher hors des citations et de la bulle ferme celle-ci.
 */
function onClick(event: MouseEvent): void {
  if (located.size === 0) return;
  if (popover.contains(event)) return;
  const id = anchorAt(event.clientX, event.clientY);
  if (id) {
    const target = id === TITLE_ID ? documentIds[0] : id;
    if (!target) return;
    setActive(target);
    if (id !== popover.anchorId) showPopover(id);
    ext.runtime.sendMessage({ type: "annotation-clicked", id: target }).catch(() => {
      // Panneau fermé : rien à synchroniser.
    });
    return;
  }
  if (popover.anchorId) hidePopover();
}

// ---------- Messages ----------

function init(): void {
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  // Au doigt, pointerleave suit chaque toucher : seule la souris referme la bulle ainsi.
  document.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && scheduleHide(), { passive: true });
  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });
  void refreshContested();
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CONTESTED_KEY]) void refreshContested();
  });

  ext.runtime.onMessage.addListener((msg: PanelToContent, _sender, sendResponse) => {
    switch (msg.type) {
      case "extract":
        sendResponse(extract());
        break;
      case "highlight":
        sendResponse(highlight(msg.annotations, msg.displayMode, msg.lang, msg.title, msg.canVerify));
        break;
      case "update-annotation":
        updateAnnotation(msg.annotation, msg.verifying, msg.error);
        sendResponse(null);
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
        popover.showToast(msg.text, msg.isError, msg.durationMs);
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
