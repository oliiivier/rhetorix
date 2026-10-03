// Adaptateur Google Gemini (API streamGenerateContent?alt=sse). Sortie structurée via responseJsonSchema.
// La recherche web (grounding Google Search) n'est pas encore branchée : sa combinaison
// avec un schéma de sortie et le rattachement des sources aux annotations restent à
// valider (docs/fonctionnelles/points-ouverts.md). En attendant : mode "unverified".

import type { Config } from "../config";
import { consolidatePrompt, systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA, enforceAnnotationSourcePolicy } from "../schema";
import { parseSseJson, ProgressiveJsonParser, stripCodeFence } from "../streaming-json";
import { postJson } from "./http";
import { ProviderError, type LlmProvider } from "./types";

interface GenerateContentChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export const geminiProvider: LlmProvider = {
  supportsWebSearch: () => false,

  async analyze(input, config: Config, signal) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`;
    const res = await postJson(
      url,
      { "x-goog-api-key": config.apiKey },
      {
        systemInstruction: { parts: [{ text: systemPrompt({ ...input, webSearch: false }) }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: ANALYSIS_JSON_SCHEMA },
      },
      signal,
      "Gemini",
    );

    const parser = new ProgressiveJsonParser({
      onSummary: input.onStream?.onSummary,
      onAnnotation: (a) => {
        const safe = enforceAnnotationSourcePolicy(a, undefined);
        input.onStream?.onAnnotation?.(safe);
      },
    });

    for await (const chunk of parseSseJson<GenerateContentChunk>(res)) {
      if (chunk.promptFeedback?.blockReason) {
        throw new ProviderError(`Requête bloquée par Gemini (${chunk.promptFeedback.blockReason}).`, "blocked", chunk.promptFeedback.blockReason);
      }
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new ProviderError("Réponse tronquée. Réduire la taille des morceaux dans les options.", "max_tokens");
      }
      const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
      if (text) {
        parser.feed(text);
      }
    }

    const rawText = stripCodeFence(parser.getRawText());
    if (!rawText) throw new ProviderError("Réponse vide de Gemini.", "empty_response");
    try {
      return { raw: JSON.parse(rawText) };
    } catch {
      throw new ProviderError("La réponse n'est pas un JSON valide.", "invalid_json");
    }
  },

  async consolidateSummary(title, summaries, language, config, signal, onProgressText) {
    const { system, user } = consolidatePrompt(title, summaries, language);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`;
    const res = await postJson(
      url,
      { "x-goog-api-key": config.apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      },
      signal,
      "Gemini",
    );

    let accumulated = "";
    for await (const chunk of parseSseJson<GenerateContentChunk>(res)) {
      const text = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (text) {
        accumulated += text;
        onProgressText?.(accumulated);
      }
    }
    const text = accumulated.trim();
    if (!text) throw new ProviderError("Résumé consolidé vide.", "empty_consolidated");
    return text;
  },
};
