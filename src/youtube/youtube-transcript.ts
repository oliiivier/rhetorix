// Traitement et normalisation de la transcription YouTube : sélection de la VO,
// parsing du format JSON3 (timedtext), découpage temporel et conversion pour l'analyse.

import type { Extracted } from "../messages";
import type { CaptionTrackMeta, TranscriptCue, VideoTranscript, VideoTranscriptSlice, YouTubeJson3Response } from "./types";

/**
 * Sélectionne la piste de sous-titres correspondant à la Version Originale (VO) de la vidéo.
 * Règle de priorité :
 * 1. Piste manuelle créée par l'auteur dans la langue d'origine.
 * 2. Piste automatique (ASR) créée par YouTube dans la langue d'origine.
 * 3. Exclusion absolue des pistes traduites automatiquement.
 */
export function selectOriginalCaptionTrack(tracks: CaptionTrackMeta[]): CaptionTrackMeta | null {
  if (!tracks || tracks.length === 0) return null;

  // Filtrer pour éliminer les pistes traduites automatiquement (URLs avec tlang ou vssId à 2 codes de langue ex: a.en.fr)
  const nonTranslated = tracks.filter((t) => {
    if (t.baseUrl && /[?&]tlang=/i.test(t.baseUrl)) return false;
    const vss = t.vssId ?? "";
    const parts = vss.split(".").filter(Boolean);
    // Un vssId de type a.en.fr indique une traduction de l'anglais vers le français
    if (parts.length > 2 && (parts[0] === "a" || parts[0] === "")) return false;
    return true;
  });

  const candidates = nonTranslated.length > 0 ? nonTranslated : tracks;

  // YouTube ne génère une piste ASR que pour la langue parlée originale dans la vidéo.
  // Si une piste ASR existe, son code de langue identifie la VO authentique.
  const asrTrack = candidates.find((t) => t.kind === "asr" || t.vssId?.startsWith("a."));
  const detectedOriginalLang = asrTrack?.languageCode;

  if (detectedOriginalLang) {
    // Si une piste manuelle existe dans cette même langue originale, la privilégier (meilleure qualité)
    const manualOriginal = candidates.find(
      (t) => t.languageCode === detectedOriginalLang && t.kind !== "asr" && !t.vssId?.startsWith("a."),
    );
    if (manualOriginal) return manualOriginal;
    return asrTrack;
  }

  // Pas de piste ASR explicite : chercher la première piste manuelle (souvent la langue source)
  const manual = candidates.find((t) => t.kind !== "asr" && !t.vssId?.startsWith("a."));
  if (manual) return manual;

  return candidates[0] ?? null;
}

/**
 * Extrait les captionTracks depuis une chaîne HTML (recherche de "captionTracks": [ ... ] avec équilibrage de crochets).
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

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ouml: "ö",
  ccedil: "ç",
  nbsp: " ",
};

/**
 * Nettoie une chaîne de caractères issue de sous-titres (retrait des balises, entités HTML, retours à la ligne).
 */
export function cleanCueText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&([a-zA-Z]+);/g, (match, entity: string) => {
      const lower = entity.toLowerCase();
      return NAMED_HTML_ENTITIES[lower] || match;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse la réponse JSON3 de l'API timedtext YouTube en une structure VideoTranscript indexée.
 */
export function parseJson3Transcript(json: YouTubeJson3Response, videoId: string, lang = ""): VideoTranscript {
  const events = json.events ?? [];
  const cues: TranscriptCue[] = [];
  let fullText = "";
  let durationMs = 0;

  for (const event of events) {
    const rawSegs = event.segs ?? [];
    const textPieces = rawSegs.map((s) => s.utf8 ?? "").filter(Boolean);
    const rawText = textPieces.join("");
    const text = cleanCueText(rawText);

    if (!text) continue;

    const startMs = event.tStartMs ?? 0;
    const durMs = event.dDurationMs ?? 0;
    const endMs = startMs + durMs;
    if (endMs > durationMs) durationMs = endMs;

    // Concaténer le texte avec un espace séparateur si besoin
    if (fullText.length > 0 && !fullText.endsWith(" ") && !text.startsWith(" ")) {
      fullText += " ";
    }

    const charStart = fullText.length;
    fullText += text;
    const charEnd = fullText.length;

    cues.push({
      startMs,
      endMs,
      text,
      charStart,
      charEnd,
    });
  }

  return {
    videoId,
    lang,
    durationMs,
    cues,
    fullText,
  };
}

/**
 * Parse la réponse XML de timedtext YouTube (formats srv3 <p t="ms" d="ms"> ou classique <text start="s" dur="s">).
 */
export function parseXmlTranscript(xml: string, videoId: string, lang = ""): VideoTranscript {
  const cues: TranscriptCue[] = [];
  let fullText = "";
  let durationMs = 0;

  // 1. Format srv3 (<p t="ms" d="ms">...<s>...</s>...</p>)
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  let hasP = false;

  while ((match = pRegex.exec(xml)) !== null) {
    hasP = true;
    const startStr = match[1];
    const durStr = match[2];
    const inner = match[3] ?? "";
    if (!startStr || !durStr) continue;

    const startMs = parseInt(startStr, 10);
    const durMs = parseInt(durStr, 10);
    const endMs = startMs + durMs;
    if (endMs > durationMs) durationMs = endMs;

    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    let text = "";
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1] ?? "";
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }
    text = cleanCueText(text);
    if (!text) continue;

    if (fullText.length > 0 && !fullText.endsWith(" ") && !text.startsWith(" ")) {
      fullText += " ";
    }
    const charStart = fullText.length;
    fullText += text;
    const charEnd = fullText.length;

    cues.push({ startMs, endMs, text, charStart, charEnd });
  }

  // 2. Format classique (<text start="sec" dur="sec">)
  if (!hasP) {
    const textRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
    while ((match = textRegex.exec(xml)) !== null) {
      const startStr = match[1];
      const durStr = match[2];
      const rawText = match[3] ?? "";
      if (!startStr || !durStr) continue;

      const startMs = Math.round(parseFloat(startStr) * 1000);
      const durMs = Math.round(parseFloat(durStr) * 1000);
      const endMs = startMs + durMs;
      if (endMs > durationMs) durationMs = endMs;

      const text = cleanCueText(rawText.replace(/<[^>]+>/g, ""));
      if (!text) continue;

      if (fullText.length > 0 && !fullText.endsWith(" ") && !text.startsWith(" ")) {
        fullText += " ";
      }
      const charStart = fullText.length;
      fullText += text;
      const charEnd = fullText.length;

      cues.push({ startMs, endMs, text, charStart, charEnd });
    }
  }

  return {
    videoId,
    lang,
    durationMs,
    cues,
    fullText,
  };
}

/**
 * Décode une réponse brute de transcription (JSON3 ou XML) de façon polymorphe et tolérante.
 */
export function parseTranscriptResponse(rawText: string, videoId: string, lang = ""): VideoTranscript {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as YouTubeJson3Response;
      if (json.events && json.events.length > 0) {
        return parseJson3Transcript(json, videoId, lang);
      }
    } catch {}
  }
  return parseXmlTranscript(trimmed, videoId, lang);
}

/**
 * Extrait une tranche temporelle de la transcription (par défaut 900 s = 15 min).
 */
export function sliceTranscript(
  transcript: VideoTranscript,
  startSec: number,
  durationSec = 900,
): VideoTranscriptSlice {
  const startMs = Math.max(0, startSec * 1000);
  const endMs = startMs + Math.max(1, durationSec * 1000);

  // Filtrer les cues qui intersectent l'intervalle [startMs, endMs]
  const matchedCues = transcript.cues.filter((c) => c.endMs > startMs && c.startMs < endMs);

  const textPieces: string[] = [];
  for (const cue of matchedCues) {
    textPieces.push(cue.text);
  }
  const text = textPieces.join(" ");

  const actualEndSec = Math.min(
    startSec + durationSec,
    Math.ceil(transcript.durationMs / 1000),
  );

  return {
    startSec,
    endSec: Math.max(startSec, actualEndSec),
    cues: matchedCues,
    text,
  };
}

/**
 * Convertit une tranche de transcription (ou transcription entière) en structure Extracted
 * compatible avec le pipeline d'analyse Rhetorix (analyzeArticle).
 * Découpe le flux textuel en paragraphes cohérents (par paquets de phrases / ponctuation forte).
 */
export function transcriptToExtracted(
  slice: VideoTranscriptSlice,
  videoTitle: string,
  lang = "",
): Extracted {
  // Découper le texte en pseudo-paragraphes de 40 à 80 mots basés sur la ponctuation finale (. ! ?)
  const words = slice.text.split(/\s+/).filter(Boolean);
  const paragraphs: string[] = [];
  let currentParaWords: string[] = [];

  for (const w of words) {
    currentParaWords.push(w);
    const hasPunctuation = /[.!?]$/.test(w);
    if ((hasPunctuation && currentParaWords.length >= 40) || currentParaWords.length >= 80) {
      paragraphs.push(currentParaWords.join(" "));
      currentParaWords = [];
    }
  }

  if (currentParaWords.length > 0) {
    paragraphs.push(currentParaWords.join(" "));
  }

  // Si aucun mot n'a pu former un paragraphe, utiliser le texte brut s'il existe
  if (paragraphs.length === 0 && slice.text.trim()) {
    paragraphs.push(slice.text.trim());
  }

  const titleWithTime =
    slice.startSec > 0 || slice.endSec > 0
      ? `${videoTitle} (${formatTimestamp(slice.startSec)} - ${formatTimestamp(slice.endSec)})`
      : videoTitle;

  return {
    title: titleWithTime,
    lang,
    paragraphs,
  };
}

/**
 * Formate des secondes au format lisible MM:SS ou HH:MM:SS.
 */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}
