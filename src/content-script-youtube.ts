// Content script spécifique à YouTube : extraction de la transcription,
// synchronisation vidéo, overlay In-Player et marqueurs sur la barre de progression.
// Les annotations d'ensemble (B3) sont ancrées sur le titre de la vidéo, sous le lecteur.

import { AnnotationPopover, type EntryState } from "./annotation-popover";
import { CONTESTED_KEY, contestKey, loadContested } from "./contested";
import { ext } from "./ext";
import { getUiStrings } from "./i18n";
import type { PanelToBackground, PanelToContent, YouTubeExtractResult } from "./messages";
import type { Annotation } from "./schema";
import type { CaptionTrackMeta, VideoTranscript } from "./youtube/types";
import { extractVideoId, isYouTubeWatchUrl, setupSpaNavigationListener } from "./youtube/youtube-detector";
import { YouTubeOverlay } from "./youtube/youtube-overlay";
import { YouTubePlayerController } from "./youtube/youtube-player";
import {
  parseJson3Transcript,
  parseTranscriptResponse,
  selectOriginalCaptionTrack,
  sliceTranscript,
  transcriptToExtracted,
} from "./youtube/youtube-transcript";

declare global {
  interface Window {
    __rhetorix_youtube?: boolean;
    ytInitialPlayerResponse?: {
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: CaptionTrackMeta[];
        };
      };
      videoDetails?: {
        title?: string;
        lengthSeconds?: string;
      };
    };
  }
}

let playerController: YouTubePlayerController | null = null;
let overlay: YouTubeOverlay | null = null;
let cachedTranscript: VideoTranscript | null = null;
let currentVideoId: string | null = null;

// ---------- Annotations d'ensemble, ancrées sur le titre (B3) ----------

const TITLE_SELECTOR = "ytd-watch-metadata h1, #above-the-fold #title h1, h1.title";
const DOCUMENT_HIGHLIGHT = "rhetorix-document";
const TITLE_ID = "rhetorix-title";
let documentAnnotations: Annotation[] = [];
let contestedKeys = new Set<string>();
let hideTimer: number | null = null;

const titlePopover = new AnnotationPopover(
  {
    onContest: (id, contested) => {
      const msg: PanelToBackground = { type: "contest-annotation", id, contested };
      ext.runtime.sendMessage(msg).catch(() => {});
    },
    onMouseEnter: () => cancelTitleHide(),
    onMouseLeave: () => scheduleTitleHide(),
  },
  (id): EntryState => {
    const a = documentAnnotations.find((d) => d.id === id);
    return { contested: Boolean(a && contestedKeys.has(contestKey(location.href, a))) };
  },
);

function titleElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(TITLE_SELECTOR);
}

function titleRange(): Range | null {
  const el = titleElement();
  if (!el || !(el.textContent ?? "").trim()) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

function setDocumentAnnotations(annotations: Annotation[], lang?: string): void {
  documentAnnotations = annotations;
  if (lang) titlePopover.lang = lang;
  titlePopover.hide();
  const range = annotations.length > 0 ? titleRange() : null;
  if (range) CSS.highlights.set(DOCUMENT_HIGHLIGHT, new Highlight(range));
  else CSS.highlights.delete(DOCUMENT_HIGHLIGHT);
}

function showTitlePopover(): void {
  const range = titleRange();
  if (!range || documentAnnotations.length === 0) return;
  titlePopover.show(TITLE_ID, range, documentAnnotations, getUiStrings(titlePopover.lang).documentLevelHeading);
}

function cancelTitleHide(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleTitleHide(): void {
  if (hideTimer !== null) return;
  hideTimer = window.setTimeout(() => {
    hideTimer = null;
    titlePopover.hide();
  }, 200);
}

function onTitleClick(event: MouseEvent): void {
  if (documentAnnotations.length === 0 || titlePopover.contains(event)) return;
  const onTitle = (event.target as Element | null)?.closest?.(TITLE_SELECTOR);
  if (onTitle) showTitlePopover();
  else if (titlePopover.anchorId) titlePopover.hide();
}

function onTitlePointerMove(event: PointerEvent): void {
  if (event.pointerType !== "mouse" || documentAnnotations.length === 0) return;
  if (titlePopover.containsPoint(event.clientX, event.clientY)) {
    cancelTitleHide();
    return;
  }
  const onTitle = (event.target as Element | null)?.closest?.(TITLE_SELECTOR);
  if (onTitle) {
    cancelTitleHide();
    if (!titlePopover.anchorId) showTitlePopover();
  } else if (titlePopover.anchorId) {
    scheduleTitleHide();
  }
}

async function refreshContested(): Promise<void> {
  contestedKeys = new Set((await loadContested()).map((e) => e.key));
  titlePopover.refresh();
}

/**
 * Extrait les captionTracks depuis une chaîne HTML (recherche équilibrée de "captionTracks": [ ... ]).
 */
export function extractCaptionTracksFromHtml(html: string): CaptionTrackMeta[] {
  const idx = html.indexOf('"captionTracks":');
  if (idx === -1) return [];
  const start = html.indexOf("[", idx);
  if (start === -1) return [];

  let count = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "[") count++;
      else if (char === "]") {
        count--;
        if (count === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1)) as CaptionTrackMeta[];
          } catch {
            return [];
          }
        }
      }
    }
  }
  return [];
}

/**
 * Récupère les métadonnées de sous-titres (captionTracks) par plusieurs stratégies complémentaires.
 */
async function fetchCaptionTracks(videoId: string): Promise<CaptionTrackMeta[]> {
  // Stratégie 1 : InnerTube API avec client Android (la plus robuste, sans PoToken / exp=xpe et persistante en navigation SPA)
  try {
    const resp = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
          },
        },
        videoId,
      }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrackMeta[] } };
      };
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        return tracks;
      }
    }
  } catch (err) {
    console.warn("Rhetorix: InnerTube player fetch failed, trying fallback:", err);
  }

  // Stratégie 2 : Téléchargement direct de la page de la vidéo (même origine, contient ytInitialPlayerResponse)
  try {
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { credentials: "omit" });
    if (pageResp.ok) {
      const html = await pageResp.text();
      const tracks = extractCaptionTracksFromHtml(html);
      if (tracks.length > 0) return tracks;
    }
  } catch (err) {
    console.warn("Rhetorix: watch page fetch fallback failed:", err);
  }

  // Stratégie 3 : Recherche dans les balises <script> du DOM actuel
  const scripts = document.querySelectorAll("script");
  for (const s of scripts) {
    const text = s.textContent || "";
    if (text.includes("captionTracks")) {
      const tracks = extractCaptionTracksFromHtml(text);
      if (tracks.length > 0) return tracks;
    }
  }

  // Stratégie 4 : Propriété globale si disponible
  if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
    return window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
  }

  return [];
}

/**
 * Télécharge le contenu brut de la transcription (XML srv3 ou JSON3) depuis YouTube.
 */
async function fetchTranscriptRaw(baseUrl: string): Promise<string> {
  // 1. Tenter avec l'URL brute (format XML timedtext standard renvoyé par Android)
  try {
    const res = await fetch(baseUrl);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 0) return text;
    }
  } catch {}

  // 2. Si vide ou échec, tenter avec &fmt=srv3 (XML format 3)
  try {
    const srv3Url = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=srv3`;
    const res = await fetch(srv3Url);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 0) return text;
    }
  } catch {}

  // 3. Tenter avec &fmt=json3
  try {
    const json3Url = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=json3`;
    const res = await fetch(json3Url);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 0) return text;
    }
  } catch {}

  throw new Error("La transcription retournée par YouTube est vide.");
}

/**
 * Initialise ou rattache le contrôleur de lecteur et l'overlay à l'élément vidéo actif.
 */
function ensurePlayerAndOverlay(): boolean {
  const video = document.querySelector<HTMLVideoElement>("video.html5-main-video") || document.querySelector<HTMLVideoElement>("video");
  const playerContainer = (document.getElementById("movie_player") as HTMLElement | null) || (video?.parentElement as HTMLElement | null);

  if (!video || !playerContainer) return false;

  if (!overlay) {
    overlay = new YouTubeOverlay({
      onClose: () => {
        playerController?.cancelAutoResume();
      },
      onResumeClick: () => {
        playerController?.play();
      },
      onMarkerClick: (timeSec) => {
        playerController?.seekTo(timeSec, true);
      },
      onHoverStart: () => {
        playerController?.pauseAutoResume();
      },
      onHoverEnd: () => {
        playerController?.resumeAutoResume();
      },
    });
  }
  overlay.attach(playerContainer);

  if (!playerController) {
    playerController = new YouTubePlayerController(
      {},
      {
        onTimeUpdate: (currentTime, duration) => {
          ext.runtime.sendMessage({
            type: "youtube-time-update",
            currentTime,
            duration,
          }).catch(() => {});
        },
        onAnnotationActive: (ann, isAutoPaused) => {
          overlay?.showAnnotation(ann, isAutoPaused);
          if (isAutoPaused) {
            const opts = playerController?.getOptions();
            if (opts?.autoResume) {
              playerController?.startAutoResume(
                (remaining) => overlay?.updateCountdown(remaining),
                () => overlay?.hide(),
                opts.autoResumeDuration,
              );
            }
          }
        },
        onAnnotationInactive: () => {
          overlay?.hide();
        },
        onSeekOutsideAnalyzed: (targetTime) => {
          ext.runtime.sendMessage({
            type: "youtube-seek-outside",
            targetTime,
          }).catch(() => {});
          overlay?.showToast(`⏳ Analyse de la tranche à partir de ${Math.floor(targetTime / 60)} min...`);
        },
      },
    );
  }
  playerController.attach(video, playerContainer);

  return true;
}

/**
 * Traite la demande d'extraction de transcription pour la vidéo courante.
 */
async function handleExtract(startSec = 0, durationSec = 900): Promise<YouTubeExtractResult> {
  const videoId = extractVideoId(window.location.href);
  if (!videoId) {
    return { ok: false, error: "Identifiant vidéo YouTube introuvable.", errorCode: "no_video_id" };
  }

  currentVideoId = videoId;
  ensurePlayerAndOverlay();

  // Si déjà en cache mémoire pour la même vidéo
  if (!cachedTranscript || cachedTranscript.videoId !== videoId) {
    const tracks = await fetchCaptionTracks(videoId);
    const originalTrack = selectOriginalCaptionTrack(tracks);

    if (!originalTrack || !originalTrack.baseUrl) {
      return {
        ok: false,
        error: "Aucune transcription disponible pour cette vidéo.",
        errorCode: "no_transcript",
      };
    }

    try {
      const rawText = await fetchTranscriptRaw(originalTrack.baseUrl);
      cachedTranscript = parseTranscriptResponse(rawText, videoId, originalTrack.languageCode);
      if (cachedTranscript.cues.length === 0) {
        throw new Error("Aucun segment de transcription n'a pu être extrait.");
      }
    } catch (err) {
      return {
        ok: false,
        error: `Impossible de charger la transcription : ${err instanceof Error ? err.message : String(err)}`,
        errorCode: "fetch_error",
      };
    }
  }

  const slice = sliceTranscript(cachedTranscript, startSec, durationSec);
  const title = document.title.replace(/ - YouTube$/i, "").trim() || "Vidéo YouTube";
  const extracted = transcriptToExtracted(slice, title, cachedTranscript.lang);

  return {
    ok: true,
    transcript: cachedTranscript,
    slice,
    extracted,
  };
}

function initYouTube(): void {
  currentVideoId = extractVideoId(window.location.href);

  // Écouter les navigations SPA (changement de vidéo sans rechargement de page)
  setupSpaNavigationListener((newVideoId) => {
    if (newVideoId !== currentVideoId) {
      currentVideoId = newVideoId;
      cachedTranscript = null;
      setDocumentAnnotations([]);
      overlay?.clearMarkers();
      overlay?.hide();
      playerController?.detach();
      ensurePlayerAndOverlay();
    }
  });

  // Gestion des messages reçus du runner ou du panneau latéral
  ext.runtime.onMessage.addListener((msg: PanelToContent, _sender, sendResponse) => {
    switch (msg.type) {
      case "youtube-detect": {
        const isWatch = isYouTubeWatchUrl(window.location.href);
        const videoId = extractVideoId(window.location.href);
        sendResponse({ isYouTube: isWatch, videoId, title: document.title });
        break;
      }

      case "youtube-extract": {
        void handleExtract(msg.startSec, msg.durationSec).then((res) => {
          sendResponse(res);
        });
        return true; // Réponse asynchrone
      }

      case "youtube-highlight": {
        setDocumentAnnotations(msg.documentAnnotations ?? [], msg.lang);
        ensurePlayerAndOverlay();
        if (playerController && overlay) {
          playerController.setAnnotations(msg.annotations, msg.analyzedRanges);
          const video = document.querySelector<HTMLVideoElement>("video");
          const totalDuration = video?.duration || (cachedTranscript ? cachedTranscript.durationMs / 1000 : 0);
          overlay.renderTimelineMarkers(msg.annotations, msg.analyzedRanges, totalDuration);
        }
        sendResponse(null);
        break;
      }

      case "youtube-seek": {
        ensurePlayerAndOverlay();
        playerController?.seekTo(msg.timeSec, msg.autoPlay ?? true);
        sendResponse(null);
        break;
      }

      case "youtube-set-options": {
        playerController?.setOptions(msg.options);
        sendResponse(null);
        break;
      }
    }
    return false;
  });

  document.addEventListener("click", onTitleClick, true);
  document.addEventListener("pointermove", onTitlePointerMove, { passive: true });
  window.addEventListener("scroll", () => titlePopover.anchorId && titlePopover.reposition(), { passive: true });
  void refreshContested();
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CONTESTED_KEY]) void refreshContested();
  });

  // Attachement initial si une vidéo est déjà présente
  ensurePlayerAndOverlay();
}

if (typeof window !== "undefined" && !window.__rhetorix_youtube) {
  window.__rhetorix_youtube = true;
  initYouTube();
}
