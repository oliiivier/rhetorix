// Alignement déterministe entre les citations du LLM (exact_quote) et les cues horodatées
// de la transcription YouTube. Permet d'obtenir les secondes exactes [startTime, endTime].

import type { Annotation } from "../schema";
import { findQuote, normalizeWithMap } from "../text-match";
import type { CueMatchResult, TranscriptCue, VideoAnnotation } from "./types";

interface CuesIndex {
  haystack: ReturnType<typeof normalizeWithMap>;
  cuesMap: Array<{
    cue: TranscriptCue;
    charStart: number;
    charEnd: number;
  }>;
}

/**
 * Construit un index textuel normalisé à partir d'une liste de cues horodatées.
 */
export function buildCuesIndex(cues: TranscriptCue[]): CuesIndex {
  const cuesMap: CuesIndex["cuesMap"] = [];
  let fullText = "";

  for (const cue of cues) {
    if (fullText.length > 0 && !fullText.endsWith(" ") && !cue.text.startsWith(" ")) {
      fullText += " ";
    }
    const charStart = fullText.length;
    fullText += cue.text;
    const charEnd = fullText.length;

    cuesMap.push({
      cue,
      charStart,
      charEnd,
    });
  }

  const haystack = normalizeWithMap(fullText);

  return {
    haystack,
    cuesMap,
  };
}

/**
 * Recherche une citation exacte dans un index de cues et retourne les bornes temporelles
 * calculées [startTime, endTime] en secondes.
 */
export function matchQuoteToCues(
  index: CuesIndex,
  quote: string,
): CueMatchResult | null {
  if (!quote || index.cuesMap.length === 0) return null;

  const match = findQuote(index.haystack, quote);
  if (!match) return null;

  // Retrouver les cues qui chevauchent l'intervalle [match.start, match.end[
  const matched = index.cuesMap.filter(
    (item) => item.charEnd > match.start && item.charStart < match.end,
  );

  if (matched.length === 0) return null;

  const firstCue = matched[0]!.cue;
  const lastCue = matched[matched.length - 1]!.cue;

  const startTime = firstCue.startMs / 1000;
  const endTime = Math.max(startTime + 0.5, lastCue.endMs / 1000);

  return {
    startTime: Number(startTime.toFixed(2)),
    endTime: Number(endTime.toFixed(2)),
    matchedCues: matched.map((m) => m.cue),
  };
}

/**
 * Alignement par lot pour une liste d'annotations retournées par le LLM.
 * Chaque annotation est enrichie des champs temporels startTime et endTime (en secondes).
 * Si une annotation ne peut pas être alignée, startTime et endTime sont fixés à -1.
 */
export function matchAnnotationsToCues(
  annotations: Annotation[],
  cues: TranscriptCue[],
  chunkIndex = 0,
): VideoAnnotation[] {
  if (annotations.length === 0) return [];
  const index = buildCuesIndex(cues);

  return annotations.map((ann) => {
    const matched = matchQuoteToCues(index, ann.exact_quote);
    if (!matched) {
      return {
        ...ann,
        startTime: -1,
        endTime: -1,
        chunkIndex,
      };
    }

    return {
      ...ann,
      startTime: matched.startTime,
      endTime: matched.endTime,
      chunkIndex,
    };
  });
}
