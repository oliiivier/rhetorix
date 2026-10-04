import { describe, expect, it } from "vitest";
import type { Annotation } from "../src/schema";
import type { TranscriptCue } from "../src/youtube/types";
import {
  buildCuesIndex,
  matchAnnotationsToCues,
  matchQuoteToCues,
} from "../src/youtube/youtube-matcher";

describe("youtube-matcher", () => {
  const cues: TranscriptCue[] = [
    {
      startMs: 1000,
      endMs: 3500,
      text: "Mes chers concitoyens,",
      charStart: 0,
      charEnd: 22,
    },
    {
      startMs: 3600,
      endMs: 7200,
      text: "nous devons choisir entre la ruine totale",
      charStart: 23,
      charEnd: 63,
    },
    {
      startMs: 7300,
      endMs: 11000,
      text: "ou notre plan de sauvetage sans précédent.",
      charStart: 64,
      charEnd: 106,
    },
    {
      startMs: 11500,
      endMs: 15200,
      text: "Tous les experts sérieux sont d'accord avec moi.",
      charStart: 107,
      charEnd: 155,
    },
  ];

  const index = buildCuesIndex(cues);

  it("aligne une citation contenue dans une seule cue", () => {
    const quote = "Tous les experts sérieux sont d'accord avec moi";
    const res = matchQuoteToCues(index, quote);

    expect(res).not.toBeNull();
    expect(res?.startTime).toBe(11.5);
    expect(res?.endTime).toBe(15.2);
    expect(res?.matchedCues).toHaveLength(1);
    expect(res?.matchedCues[0]?.text).toContain("Tous les experts");
  });

  it("aligne une citation qui chevauche deux cues consécutives", () => {
    const quote = "choisir entre la ruine totale ou notre plan de sauvetage";
    const res = matchQuoteToCues(index, quote);

    expect(res).not.toBeNull();
    // Commence dans la cue 2 (3.6s) et se termine dans la cue 3 (11.0s)
    expect(res?.startTime).toBe(3.6);
    expect(res?.endTime).toBe(11.0);
    expect(res?.matchedCues).toHaveLength(2);
  });

  it("gère les différences de typographie, de casse et de guillemets", () => {
    const quote = "« MES CHERS CONCITOYENS »";
    const res = matchQuoteToCues(index, quote);

    expect(res).not.toBeNull();
    expect(res?.startTime).toBe(1.0);
    expect(res?.endTime).toBe(3.5);
  });

  it("gère les ellipses et points de suspension", () => {
    const quote = "...nous devons choisir entre la ruine totale...";
    const res = matchQuoteToCues(index, quote);

    expect(res).not.toBeNull();
    expect(res?.startTime).toBe(3.6);
    expect(res?.endTime).toBe(7.2);
  });

  it("renvoie null pour une citation inexistante", () => {
    const quote = "Le ciel est complètement bleu aujourd'hui";
    const res = matchQuoteToCues(index, quote);

    expect(res).toBeNull();
  });

  it("aligne une liste d'annotations complètes", () => {
    const annotations: Annotation[] = [
      {
        id: "ann-1",
        exact_quote: "nous devons choisir entre la ruine totale ou notre plan de sauvetage sans précédent.",
        category: "sophism",
        label: "faux_dilemme",
        severity: "high",
        rhetoric_critique: "Présentation d'un faux dilemme binaire sans nuances.",
        fact_check: {
          status: "unverified",
          context: "",
          sources: [],
        },
      },
      {
        id: "ann-2",
        exact_quote: "Tous les experts sérieux sont d'accord avec moi.",
        category: "sophism",
        label: "argument_autorite",
        severity: "medium",
        rhetoric_critique: "Appel anonyme à l'autorité sans citer aucune source vérifiable.",
        fact_check: {
          status: "unverified",
          context: "",
          sources: [],
        },
      },
      {
        id: "ann-3",
        exact_quote: "Citation introuvable qui n'existe nulle part dans la vidéo.",
        category: "bias",
        label: "biais_confirmation",
        severity: "low",
        rhetoric_critique: "Biais.",
        fact_check: {
          status: "unverified",
          context: "",
          sources: [],
        },
      },
    ];

    const result = matchAnnotationsToCues(annotations, cues, 0);
    expect(result).toHaveLength(3);

    // Première annotation (faux dilemme)
    expect(result[0]?.startTime).toBe(3.6);
    expect(result[0]?.endTime).toBe(11.0);
    expect(result[0]?.chunkIndex).toBe(0);

    // Deuxième annotation (argument d'autorité)
    expect(result[1]?.startTime).toBe(11.5);
    expect(result[1]?.endTime).toBe(15.2);

    // Troisième annotation non localisée (startTime = -1)
    expect(result[2]?.startTime).toBe(-1);
    expect(result[2]?.endTime).toBe(-1);
  });
});
