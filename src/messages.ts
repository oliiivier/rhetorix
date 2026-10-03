// Messages entre le panneau latéral et le content script (architecture §6).

import type { Category } from "./taxonomy";

export interface HighlightItem {
  id: string;
  exact_quote: string;
  category: Category;
}

export type PanelToContent =
  | { type: "extract" }
  | { type: "highlight"; annotations: HighlightItem[] }
  | { type: "focus"; id: string }
  | { type: "clear" };

export type ContentToPanel = { type: "annotation-clicked"; id: string };

export interface Extracted {
  title: string;
  lang: string;
  /** Paragraphes du contenu principal, dans l'ordre (base du découpage D6). */
  paragraphs: string[];
}

export type ExtractErrorCode = "no_article" | "empty_article";
export type ExtractResult =
  | { ok: true; article: Extracted }
  | { ok: false; error: string; errorCode?: ExtractErrorCode };
export interface HighlightResult {
  unlocated: string[];
}
