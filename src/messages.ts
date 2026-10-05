import type { DisplayMode } from "./config";
import type { Annotation, FactStatus, Severity, Source } from "./schema";
import type { Category } from "./taxonomy";
import type { TimeRange, YouTubePlayerOptions } from "./youtube/youtube-player";
import type { VideoAnnotation, VideoTranscript, VideoTranscriptSlice } from "./youtube/types";
import type { TokenUsage } from "./tokens";

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
  | { type: "toast"; text: string; isError?: boolean; durationMs?: number }
  /** Commandes spécifiques à YouTube. */
  | { type: "youtube-detect" }
  | { type: "youtube-extract"; startSec?: number; durationSec?: number }
  | { type: "youtube-highlight"; annotations: VideoAnnotation[]; analyzedRanges: TimeRange[]; lang?: string }
  | { type: "youtube-seek"; timeSec: number; autoPlay?: boolean }
  | { type: "youtube-set-options"; options: Partial<YouTubePlayerOptions> };

export type ContentToPanel =
  | { type: "annotation-clicked"; id: string }
  | { type: "youtube-time-update"; currentTime: number; duration: number }
  | { type: "youtube-seek-outside"; targetTime: number };

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

export type YouTubeExtractResult =
  | { ok: true; transcript: VideoTranscript; slice: VideoTranscriptSlice; extracted: Extracted }
  | { ok: false; error: string; errorCode?: string };

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
  /** Analyse en cache produite avec d'autres réglages du moteur : peut-être obsolète (D11). */
  stale?: boolean;
  error?: string;
  /** Consommation de tokens mesurée en continu pour cette analyse. */
  usage?: TokenUsage;
  /** Métadonnées spécifiques à l'analyse d'une vidéo YouTube. */
  isVideo?: boolean;
  videoChunkRange?: { startSec: number; endSec: number };
  videoTotalDuration?: number;
  analyzedRanges?: TimeRange[];
  activeTimeSec?: number;
}

export type PanelToBackground =
  | { type: "analyze-tab"; tabId: number; force: boolean }
  | { type: "analyze-youtube-chunk"; tabId: number; startSec: number; force?: boolean }
  | { type: "analyze-youtube-full"; tabId: number; force?: boolean }
  | { type: "cancel"; tabId: number }
  | { type: "get-state"; tabId: number }
  | { type: "open-sidepanel"; tabId?: number }
  | { type: "close-sidebar" };

export type BackgroundToPanel = { type: "run-update"; snapshot: RunSnapshot };

