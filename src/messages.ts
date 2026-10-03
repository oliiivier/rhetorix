// Messages entre le panneau latéral, le script de fond et le content script (architecture §6).

import type { DisplayMode } from "./config";
import type { Annotation, FactStatus, Severity, Source } from "./schema";
import type { Category } from "./taxonomy";

export interface HighlightItem {
  id: string;
  exact_quote: string;
  category: Category;
  label?: string;
  severity?: Severity;
  rhetoric_critique?: string;
  fact_check?: {
    status: FactStatus;
    context: string;
    sources: Source[];
  };
}

export type PanelToContent =
  | { type: "extract" }
  | { type: "highlight"; annotations: HighlightItem[]; displayMode?: DisplayMode; lang?: string }
  | { type: "set-display-mode"; displayMode: DisplayMode }
  | { type: "focus"; id: string }
  | { type: "clear" }
  /** Message bref affiché dans la page quand il n'y a pas de panneau (mobile, D9). */
  | { type: "toast"; text: string; isError?: boolean; durationMs?: number };

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

// ---------- Panneau ↔ script de fond (architecture §6) ----------
// Le script de fond pilote l'analyse (D9) ; le panneau n'en est qu'une vue.

export type RunStatus = "running" | "done" | "error" | "cancelled";
export type RunPhase = "extracting" | "analyzing" | "consolidating";

/** État d'une analyse pour un onglet, tel que le panneau l'affiche. */
export interface RunSnapshot {
  tabId: number;
  url: string | undefined;
  status: RunStatus;
  phase: RunPhase;
  done: number;
  total: number;
  summary: string;
  clickbaitGap?: string;
  blindSpot?: string;
  /** Annotations reçues au fil du flux, puis liste finale fusionnée. */
  annotations: Annotation[];
  unlocated: string[];
  cachedAt?: number;
  error?: string;
}

export type PanelToBackground =
  | { type: "analyze-tab"; tabId: number; force: boolean }
  | { type: "cancel"; tabId: number }
  | { type: "get-state"; tabId: number };

export type BackgroundToPanel = { type: "run-update"; snapshot: RunSnapshot };
