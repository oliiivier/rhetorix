import { describe, expect, it } from "vitest";
import type { CaptionTrackMeta, YouTubeJson3Response } from "../src/youtube/types";
import {
  cleanCueText,
  extractCaptionTracksFromHtml,
  formatTimestamp,
  parseJson3Transcript,
  parseXmlTranscript,
  parseTranscriptResponse,
  selectOriginalCaptionTrack,
  sliceTranscript,
  transcriptToExtracted,
} from "../src/youtube/youtube-transcript";

describe("selectOriginalCaptionTrack", () => {
  it("retourne null si aucune piste n'est fournie", () => {
    expect(selectOriginalCaptionTrack([])).toBeNull();
  });

  it("choisit la piste manuelle dans la langue originale si une piste ASR existe dans la même langue", () => {
    const tracks: CaptionTrackMeta[] = [
      { baseUrl: "https://yt/timedtext?lang=fr", languageCode: "fr", vssId: "a.fr.en" }, // traduit
      { baseUrl: "https://yt/timedtext?lang=fr", languageCode: "fr", vssId: "a.fr", kind: "asr" }, // ASR français
      { baseUrl: "https://yt/timedtext?lang=fr", languageCode: "fr", vssId: ".fr" }, // manuel français
      { baseUrl: "https://yt/timedtext?lang=en", languageCode: "en", vssId: ".en" }, // manuel anglais
    ];

    const selected = selectOriginalCaptionTrack(tracks);
    expect(selected?.vssId).toBe(".fr");
    expect(selected?.languageCode).toBe("fr");
  });

  it("choisit la piste ASR si c'est la seule piste dans la langue originale", () => {
    const tracks: CaptionTrackMeta[] = [
      { baseUrl: "https://yt/timedtext?lang=en", languageCode: "en", vssId: "a.en", kind: "asr" },
      { baseUrl: "https://yt/timedtext?lang=es", languageCode: "es", vssId: "a.en.es" }, // traduction auto
    ];

    const selected = selectOriginalCaptionTrack(tracks);
    expect(selected?.vssId).toBe("a.en");
    expect(selected?.languageCode).toBe("en");
  });

  it("exclut formellement les pistes avec tlang", () => {
    const tracks: CaptionTrackMeta[] = [
      { baseUrl: "https://yt/timedtext?lang=en&tlang=fr", languageCode: "fr", vssId: ".fr" },
      { baseUrl: "https://yt/timedtext?lang=en", languageCode: "en", vssId: ".en" },
    ];

    const selected = selectOriginalCaptionTrack(tracks);
    expect(selected?.languageCode).toBe("en");
  });
});

describe("cleanCueText", () => {
  it("décode les entités HTML et normalise les espaces", () => {
    expect(cleanCueText("L&#39;homme a dit &quot;Bonjour&quot; &amp; merci &lt;ami&gt;")).toBe(
      'L\'homme a dit "Bonjour" & merci <ami>',
    );
    expect(cleanCueText("ligne 1\n\n  ligne 2  ")).toBe("ligne 1 ligne 2");
  });
});

describe("parseJson3Transcript", () => {
  it("parse un payload YouTube JSON3 standard avec plusieurs segments", () => {
    const raw: YouTubeJson3Response = {
      events: [
        {
          tStartMs: 1200,
          dDurationMs: 2500,
          segs: [{ utf8: "Bonjour à tous" }],
        },
        {
          tStartMs: 3800,
          dDurationMs: 3100,
          segs: [{ utf8: "et bienvenue sur cette chaîne." }],
        },
        {
          // Segment vide ou simple retour à la ligne ignoré
          tStartMs: 7000,
          dDurationMs: 500,
          segs: [{ utf8: "\n" }],
        },
        {
          tStartMs: 8000,
          dDurationMs: 4000,
          segs: [{ utf8: "Aujourd'hui nous allons analyser un sujet crucial." }],
        },
      ],
    };

    const transcript = parseJson3Transcript(raw, "video123", "fr");
    expect(transcript.videoId).toBe("video123");
    expect(transcript.lang).toBe("fr");
    expect(transcript.cues).toHaveLength(3);
    expect(transcript.durationMs).toBe(12000);
    expect(transcript.fullText).toBe(
      "Bonjour à tous et bienvenue sur cette chaîne. Aujourd'hui nous allons analyser un sujet crucial.",
    );

    const first = transcript.cues[0]!;
    expect(first.startMs).toBe(1200);
    expect(first.endMs).toBe(3700);
    expect(transcript.fullText.slice(first.charStart, first.charEnd)).toBe("Bonjour à tous");
  });
});

describe("sliceTranscript", () => {
  const sampleTranscript = parseJson3Transcript(
    {
      events: [
        { tStartMs: 0, dDurationMs: 60000, segs: [{ utf8: "Partie 1 (minute 0)" }] },
        { tStartMs: 800000, dDurationMs: 120000, segs: [{ utf8: "Partie 2 (minute 14)" }] },
        { tStartMs: 950000, dDurationMs: 60000, segs: [{ utf8: "Partie 3 (minute 16)" }] },
        { tStartMs: 1800000, dDurationMs: 60000, segs: [{ utf8: "Partie 4 (minute 30)" }] },
      ],
    },
    "vid",
  );

  it("découpe la première tranche de 15 minutes (0 - 900 s)", () => {
    const slice = sliceTranscript(sampleTranscript, 0, 900);
    expect(slice.startSec).toBe(0);
    expect(slice.endSec).toBe(900);
    expect(slice.cues).toHaveLength(2); // minute 0 et minute 14 (800 s à 920 s)
    expect(slice.text).toContain("Partie 1");
    expect(slice.text).toContain("Partie 2");
    expect(slice.text).not.toContain("Partie 4");
  });

  it("découpe la tranche suivante (900 - 1800 s)", () => {
    const slice = sliceTranscript(sampleTranscript, 900, 900);
    expect(slice.startSec).toBe(900);
    expect(slice.cues.length).toBeGreaterThanOrEqual(1);
    expect(slice.text).toContain("Partie 3");
  });
});

describe("transcriptToExtracted", () => {
  it("génère des paragraphes et un titre horodaté", () => {
    const slice = {
      startSec: 0,
      endSec: 900,
      cues: [],
      text: "Première phrase claire. Deuxième phrase avec argument. Troisième phrase de conclusion.",
    };

    const extracted = transcriptToExtracted(slice, "Interview exclusive", "fr");
    expect(extracted.title).toBe("Interview exclusive (00:00 - 15:00)");
    expect(extracted.paragraphs.length).toBeGreaterThan(0);
    expect(extracted.paragraphs.join(" ")).toBe(slice.text);
  });
});

describe("formatTimestamp", () => {
  it("formate en MM:SS pour les durées sous l'heure", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(75)).toBe("01:15");
    expect(formatTimestamp(899)).toBe("14:59");
  });

  it("formate en HH:MM:SS pour les durées au-delà d'une heure", () => {
    expect(formatTimestamp(3600)).toBe("01:00:00");
    expect(formatTimestamp(3723)).toBe("01:02:03");
  });
});

describe("parseXmlTranscript", () => {
  it("parse le format srv3 (<p t=\"ms\" d=\"ms\"><s>...</s></p>)", () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<head><wp id="1"/></head>
<body>
<p t="4480" d="5800"><s ac="0">Et</s><s t="160" ac="0"> alors,</s></p>
<p t="10500" d="3200">monsieur le pr&eacute;sident</p>
</body></timedtext>`;

    const transcript = parseXmlTranscript(xml, "vid123", "fr");
    expect(transcript.videoId).toBe("vid123");
    expect(transcript.lang).toBe("fr");
    expect(transcript.durationMs).toBe(13700);
    expect(transcript.cues).toHaveLength(2);
    expect(transcript.cues[0]!.text).toBe("Et alors,");
    expect(transcript.cues[0]!.startMs).toBe(4480);
    expect(transcript.cues[0]!.endMs).toBe(10280);
    expect(transcript.cues[1]!.text).toBe("monsieur le président");
    expect(transcript.fullText).toBe("Et alors, monsieur le président");
  });

  it("parse le format classique (<text start=\"s\" dur=\"s\">)", () => {
    const xml = `<transcript>
<text start="1.5" dur="3.0">Premi&egrave;re phrase</text>
<text start="5.0" dur="2.5">Deuxi&egrave;me phrase</text>
</transcript>`;

    const transcript = parseXmlTranscript(xml, "vid456", "fr");
    expect(transcript.cues).toHaveLength(2);
    expect(transcript.cues[0]!.text).toBe("Première phrase");
    expect(transcript.cues[0]!.startMs).toBe(1500);
    expect(transcript.cues[0]!.endMs).toBe(4500);
    expect(transcript.cues[1]!.text).toBe("Deuxième phrase");
    expect(transcript.cues[1]!.startMs).toBe(5000);
    expect(transcript.cues[1]!.endMs).toBe(7500);
  });
});

describe("parseTranscriptResponse", () => {
  it("détecte automatiquement le format JSON3", () => {
    const jsonStr = JSON.stringify({
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Bonjour" }] },
      ],
    });
    const transcript = parseTranscriptResponse(jsonStr, "v1", "fr");
    expect(transcript.cues).toHaveLength(1);
    expect(transcript.cues[0]!.text).toBe("Bonjour");
  });

  it("détecte automatiquement le format XML", () => {
    const xml = `<timedtext><p t="2000" d="3000">Salut</p></timedtext>`;
    const transcript = parseTranscriptResponse(xml, "v2", "fr");
    expect(transcript.cues).toHaveLength(1);
    expect(transcript.cues[0]!.text).toBe("Salut");
  });
});

describe("extractCaptionTracksFromHtml", () => {
  it("extrait le tableau captionTracks avec crochets imbriqués", () => {
    const html = `<div>Prefix</div><script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://yt/timedtext?v=123","languageCode":"fr","kind":"asr"}]}}};</script><div>Suffix</div>`;
    const tracks = extractCaptionTracksFromHtml(html);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.languageCode).toBe("fr");
    expect(tracks[0]!.kind).toBe("asr");
  });

  it("retourne un tableau vide si captionTracks est absent", () => {
    expect(extractCaptionTracksFromHtml("<html><body>Pas de sous-titres</body></html>")).toEqual([]);
  });
});
