import { describe, expect, it } from "vitest";
import type { Annotation } from "../src/schema";
import {
  ProgressiveJsonParser,
  stripCodeFence,
  unescapeJsonString,
} from "../src/streaming-json";

describe("streaming-json", () => {
  describe("unescapeJsonString", () => {
    it("dé-échappe les chaînes normales et les guillemets", () => {
      expect(unescapeJsonString("Bonjour le monde")).toBe("Bonjour le monde");
      expect(unescapeJsonString('Un mot \\"entre guillemets\\"')).toBe('Un mot "entre guillemets"');
      expect(unescapeJsonString("Ligne 1\\nLigne 2")).toBe("Ligne 1\nLigne 2");
    });

    it("gère les séquences tronquées en fin de flux", () => {
      expect(unescapeJsonString("Début\\")).toBe("Début");
      expect(unescapeJsonString("Caractère \\u00")).toBe("Caractère ");
      expect(unescapeJsonString("Caractère \\u00e9 fini")).toBe("Caractère é fini");
    });
  });

  describe("stripCodeFence", () => {
    it("retire les blocs markdown", () => {
      expect(stripCodeFence('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
      expect(stripCodeFence('```\n{"a": 1}\n```')).toBe('{"a": 1}');
      expect(stripCodeFence('{"a": 1}')).toBe('{"a": 1}');
    });
  });

  describe("readSseLines", () => {
    it("découpe un ReadableStream en lignes SSE même avec des fragments découpés", async () => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode("data: {\"a\":"),
        encoder.encode(" 1}\n\ndata: {\"b\": 2}"),
        encoder.encode("\r\n\r\n"),
      ];
      let i = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (i < chunks.length) {
            controller.enqueue(chunks[i++]!);
          } else {
            controller.close();
          }
        },
      });
      const response = new Response(stream);
      const lines: string[] = [];
      const { readSseLines } = await import("../src/streaming-json");
      for await (const line of readSseLines(response)) {
        lines.push(line);
      }
      expect(lines).toEqual(['data: {"a": 1}', "", 'data: {"b": 2}', ""]);
    });
  });

  describe("ProgressiveJsonParser", () => {
    const sampleJson = JSON.stringify({
      summary: 'Analyse critique d\'un "discours" fallacieux.\nSeconde ligne.',
      annotations: [
        {
          id: "ann-1",
          exact_quote: 'Ceci est une citation avec {accolades} et "guillemets".',
          category: "sophism",
          label: "homme_de_paille",
          severity: "high",
          rhetoric_critique: "Déformation évidente de l'argument adverse.",
          fact_check: {
            status: "unverified",
            context: "",
            sources: [],
          },
        },
        {
          id: "ann-2",
          exact_quote: "Le taux d'inflation est de 99 %.",
          category: "factual_claim",
          label: "statistique",
          severity: "high",
          rhetoric_critique: "Chiffre fantaisiste.",
          fact_check: {
            status: "refuted",
            context: "L'inflation mesurée était de 5 %.",
            sources: [{ title: "INSEE", url: "https://insee.fr/stat" }],
          },
        },
      ],
    }, null, 2);

    it("extrait le résumé et les annotations au fil de l'eau par blocs de 7 caractères", () => {
      const summaryEvents: { text: string; complete: boolean }[] = [];
      const annotations: Annotation[] = [];

      const parser = new ProgressiveJsonParser({
        onSummary: (text, complete) => summaryEvents.push({ text, complete }),
        onAnnotation: (a) => annotations.push(a),
      });

      const chunkSize = 7;
      for (let i = 0; i < sampleJson.length; i += chunkSize) {
        parser.feed(sampleJson.slice(i, i + chunkSize));
      }

      expect(summaryEvents.length).toBeGreaterThan(1);
      const lastSummary = summaryEvents[summaryEvents.length - 1];
      expect(lastSummary).toEqual({
        text: 'Analyse critique d\'un "discours" fallacieux.\nSeconde ligne.',
        complete: true,
      });

      expect(annotations).toHaveLength(2);
      expect(annotations[0]?.id).toBe("ann-1");
      expect(annotations[0]?.exact_quote).toBe('Ceci est une citation avec {accolades} et "guillemets".');
      expect(annotations[1]?.id).toBe("ann-2");
      expect(annotations[1]?.fact_check.status).toBe("refuted");
      expect(annotations[1]?.fact_check.sources[0]?.url).toBe("https://insee.fr/stat");
    });

    it("fonctionne caractère par caractère", () => {
      const annotations: Annotation[] = [];
      let finalSummary = "";

      const parser = new ProgressiveJsonParser({
        onSummary: (s, complete) => {
          if (complete) finalSummary = s;
        },
        onAnnotation: (a) => annotations.push(a),
      });

      for (const char of sampleJson) {
        parser.feed(char);
      }

      expect(finalSummary).toBe('Analyse critique d\'un "discours" fallacieux.\nSeconde ligne.');
      expect(annotations).toHaveLength(2);
    });

    it("gère l'ordre inversé (annotations avant summary)", () => {
      const reversedJson = JSON.stringify({
        annotations: [
          {
            id: "a1",
            exact_quote: "citation unique",
            category: "bias",
            label: "biais_de_confirmation",
            severity: "low",
            rhetoric_critique: "critique",
            fact_check: { status: "unverified", context: "", sources: [] },
          },
        ],
        summary: "Résumé final",
      });

      const annotations: Annotation[] = [];
      let finalSummary = "";

      const parser = new ProgressiveJsonParser({
        onSummary: (s, complete) => {
          if (complete) finalSummary = s;
        },
        onAnnotation: (a) => annotations.push(a),
      });

      for (let i = 0; i < reversedJson.length; i += 4) {
        parser.feed(reversedJson.slice(i, i + 4));
      }

      expect(annotations).toHaveLength(1);
      expect(annotations[0]?.id).toBe("a1");
      expect(finalSummary).toBe("Résumé final");
    });
  });
});
