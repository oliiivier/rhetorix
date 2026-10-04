// Content script spécifique à YouTube : extraction de la transcription,
// synchronisation vidéo, overlay In-Player et marqueurs sur la barre de progression.

import { ext } from "./ext";
import type { PanelToContent, YouTubeExtractResult } from "./messages";
import type { CaptionTrackMeta, VideoTranscript } from "./youtube/types";
import { extractVideoId, isYouTubeWatchUrl, setupSpaNavigationListener } from "./youtube/youtube-detector";
import { YouTubeOverlay } from "./youtube/youtube-overlay";
import { YouTubePlayerController } from "./youtube/youtube-player";
import {
  parseJson3Transcript,
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

/**
 * Récupère les métadonnées de sous-titres (captionTracks) depuis l'environnement de la page.
 */
function extractCaptionTracks(): CaptionTrackMeta[] {
  // 1. Essai direct via la variable globale si accessible
  if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
    return window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
  }

  // 2. Recherche dans les balises <script> de la page HTML
  const scripts = document.querySelectorAll("script");
  for (const s of scripts) {
    const text = s.textContent || "";
    if (text.includes("captionTracks")) {
      const match = text.match(/"captionTracks":\s*(\[.*?\])/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]) as CaptionTrackMeta[];
        } catch {}
      }
    }
  }

  return [];
}

/**
 * Télécharge la transcription JSON3 depuis l'URL timedtext de YouTube.
 */
async function fetchTranscriptJson3(baseUrl: string): Promise<unknown> {
  const url = baseUrl.includes("fmt=json3") ? baseUrl : `${baseUrl}&fmt=json3`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Échec de récupération des sous-titres (HTTP ${res.status})`);
  }
  return res.json();
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
    const tracks = extractCaptionTracks();
    const originalTrack = selectOriginalCaptionTrack(tracks);

    if (!originalTrack || !originalTrack.baseUrl) {
      return {
        ok: false,
        error: "Aucune transcription disponible pour cette vidéo.",
        errorCode: "no_transcript",
      };
    }

    try {
      const rawJson = (await fetchTranscriptJson3(originalTrack.baseUrl)) as Parameters<typeof parseJson3Transcript>[0];
      cachedTranscript = parseJson3Transcript(rawJson, videoId, originalTrack.languageCode);
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

  // Attachement initial si une vidéo est déjà présente
  ensurePlayerAndOverlay();
}

if (!window.__rhetorix_youtube) {
  window.__rhetorix_youtube = true;
  initYouTube();
}
