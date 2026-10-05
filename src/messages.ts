import type { DisplayMode } from "./config";
import type { Annotation, Confidence, FactCheck, Severity } from "./schema";
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
  confidence?: Confidence;
  rhetoric_critique?: string;
  fact_check?: FactCheck;
}

export type PanelToContent =
  | { type: "extract" }
  | {
      type: "highlight";
      annotations: HighlightItem[];
      displayMode?: DisplayMode;
      lang?: string;
      /** Titre de l'article, ancre des annotations d'ensemble (B3). */
      title?: string;
      /** Vérification en ligne à la demande possible avec le provider configuré (C2). */
      canVerify?: boolean;
    }
  /** Annotation modifiée après l'analyse : vérification à la demande en cours ou terminée (C2). */
  | { type: "update-annotation"; annotation: HighlightItem; verifying?: boolean; error?: string }
  | { type: "set-display-mode"; displayMode: DisplayMode }
  | { type: "focus"; id: string }
  | { type: "clear" }
  /** Message bref affiché dans la page quand il n'y a pas de panneau (mobile, D9). */
  | { type: "toast"; text: string; isError?: boolean; durationMs?: number }
  /** Commandes spécifiques à YouTube. */
  | { type: "youtube-detect" }
  | { type: "youtube-extract"; startSec?: number; durationSec?: number }
  | {
      type: "youtube-highlight";
      annotations: VideoAnnotation[];
      analyzedRanges: TimeRange[];
      lang?: string;
      /** Annotations d'ensemble (B3), ancrées sur le titre de la vidéo. */
      documentAnnotations?: Annotation[];
    }
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
  /** Métadonnées de publication fournies par Readability, si la page les déclare (C1). */
  publishedTime?: string;
  byline?: string;
  siteName?: string;
}

export type ExtractErrorCode = "no_article" | "empty_article";
export type ExtractResult =
  | { ok: true; article: Extracted }
  | { ok: false; error: string; errorCode?: ExtractErrorCode };

export type YouTubeExtractResult =
  | { ok: true; transcript: VideoTranscript; slice: VideoTranscriptSlice; extracted: Extracted }
  | { ok: false; error: string; errorCode?: string };

export interface HighlightResult {
  /** Annotations de passage non localisées (les annotations d'ensemble n'y figurent pas). */
  unlocated: string[];
  /** Titre trouvé dans la page : les annotations d'ensemble y sont accessibles (B3). */
  titleLocated?: boolean;
}

// ---------- Panneau ↔ script de fond (architecture §6) ----------
// Le script de fond pilote l'analyse (D9) ; le panneau n'en est qu'une vue.

export type RunStatus = "running" | "done" | "error" | "cancelled";
export type RunPhase = "extracting" | "mapping" | "analyzing" | "consolidating" | "reviewing" | "studies";

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
  /** Analyse partielle (A3) : début des passages non analysés. */
  skipped?: string[];
  /** Le provider a renvoyé une erreur passagère : nouvel essai en attente (A4). */
  retrying?: boolean;
  error?: string;
  /** Titre surligné dans la page, ancre des annotations d'ensemble (B3). */
  titleLocated?: boolean;
  /** Vérification en ligne à la demande possible avec le provider configuré (C2). */
  canVerify?: boolean;
  /** Annotations dont la vérification à la demande est en cours (C2). */
  verifying?: string[];
  /** Dernier échec de vérification à la demande, par annotation (C2). */
  verifyErrors?: Record<string, string>;
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
  /**
   * Vérification en ligne d'une allégation (C2) et contestation d'une annotation (Q4).
   * Envoyés par le panneau ou par les bulles de la page ; sans tabId, l'onglet est
   * celui de l'expéditeur.
   */
  | { type: "verify-annotation"; tabId?: number; id: string }
  | { type: "contest-annotation"; tabId?: number; id: string; contested: boolean }
  | { type: "get-state"; tabId: number }
  | { type: "open-sidepanel"; tabId?: number }
  | { type: "close-sidebar" };

export type BackgroundToPanel = { type: "run-update"; snapshot: RunSnapshot };

