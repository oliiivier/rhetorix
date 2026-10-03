// Content script : extraction (Readability), localisation des citations, surlignage
// par la CSS Custom Highlight API et détection des clics (architecture §4 et §5).
// Injecté à la demande par le panneau ; ne modifie pas le DOM de la page.

import { Readability } from "@mozilla/readability";
import { ext } from "./ext";
import type { ExtractResult, HighlightItem, HighlightResult, PanelToContent } from "./messages";
import type { Category } from "./taxonomy";
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

// ---------- Extraction ----------

const LEAF_BLOCKS = "p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, figcaption, td";

function extract(): ExtractResult {
  const article = new Readability(document.cloneNode(true) as Document).parse();
  if (!article?.content) return { ok: false, error: "Aucun contenu d'article détecté sur cette page." };

  // DOMParser produit un document inerte : aucun script de la page n'est exécuté.
  const doc = new DOMParser().parseFromString(article.content, "text/html");
  let paragraphs = [...doc.body.querySelectorAll(LEAF_BLOCKS)]
    .filter((el) => !el.querySelector(LEAF_BLOCKS))
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    paragraphs = (article.textContent ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }
  if (paragraphs.length === 0) return { ok: false, error: "L'article extrait est vide." };

  return {
    ok: true,
    article: {
      title: article.title ?? document.title,
      lang: article.lang ?? document.documentElement.lang ?? "",
      paragraphs,
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

// ---------- Surlignage ----------

function clear(): void {
  located.clear();
  for (const name of [...Object.values(HIGHLIGHT_NAMES), ACTIVE]) CSS.highlights.delete(name);
}

function highlight(items: HighlightItem[]): HighlightResult {
  clear();
  const index = buildIndex();
  const groups: Record<Category, Range[]> = { sophism: [], bias: [], factual_claim: [] };
  const unlocated: string[] = [];

  for (const item of items) {
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

// ---------- Clic sur une citation ----------
// Les highlights ne reçoivent pas d'événements : on retrouve le point cliqué et on
// teste son appartenance aux Range connus.

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const pos = document.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = (document as Document & { caretRangeFromPoint?(x: number, y: number): Range | null }).caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function onClick(event: MouseEvent): void {
  if (located.size === 0) return;
  const point = caretAt(event.clientX, event.clientY);
  if (!point) return;
  for (const [id, range] of located) {
    try {
      if (range.isPointInRange(point.node, point.offset)) {
        setActive(id);
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

// ---------- Messages ----------

function init(): void {
  document.addEventListener("click", onClick, true);
  ext.runtime.onMessage.addListener((msg: PanelToContent, _sender, sendResponse) => {
    switch (msg.type) {
      case "extract":
        sendResponse(extract());
        break;
      case "highlight":
        sendResponse(highlight(msg.annotations));
        break;
      case "focus":
        focus(msg.id);
        sendResponse(null);
        break;
      case "clear":
        clear();
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
