// Types pour le module YouTube : transcription, segments horodatés, tranches et annotations vidéo.

import type { Annotation } from "../schema";

/** Un segment élémentaire horodaté extrait de la transcription. */
export interface TranscriptCue {
  startMs: number;
  endMs: number;
  text: string;
  charStart: number;
  charEnd: number;
}

/** Transcription complète d'une vidéo YouTube. */
export interface VideoTranscript {
  videoId: string;
  lang: string;
  durationMs: number;
  cues: TranscriptCue[];
  fullText: string;
}

/** Tranche temporelle extraite d'une transcription (ex: 15 minutes). */
export interface VideoTranscriptSlice {
  startSec: number;
  endSec: number;
  cues: TranscriptCue[];
  text: string;
}

/** Métadonnées d'une piste de sous-titres YouTube (captionTrack). */
export interface CaptionTrackMeta {
  baseUrl: string;
  vssId?: string;
  languageCode: string;
  kind?: string; // "asr" pour reconnaissance automatique
  name?: { simpleText?: string; runs?: Array<{ text: string }> };
  isTranslatable?: boolean;
}

/** Format brut d'événement renvoyé par l'endpoint timedtext JSON3 de YouTube. */
export interface YouTubeJson3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

export interface YouTubeJson3Response {
  events?: YouTubeJson3Event[];
}

/** Annotation enrichie des bornes temporelles pour la vidéo. */
export interface VideoAnnotation extends Annotation {
  startTime: number; // en secondes
  endTime: number;   // en secondes
  chunkIndex?: number;
}

/** Intervalle temporel en secondes [début, fin]. */
export interface TimeRange {
  startSec: number;
  endSec: number;
}

/** Résultat de l'alignement d'une citation sur des cues horodatées. */
export interface CueMatchResult {
  startTime: number; // en secondes
  endTime: number;   // en secondes
  matchedCues: TranscriptCue[];
}
