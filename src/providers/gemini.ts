// Adaptateur Google Gemini (API generateContent). Sortie structurée via responseJsonSchema.
// La recherche web (grounding Google Search) n'est pas encore branchée : sa combinaison
// avec un schéma de sortie et le rattachement des sources aux annotations restent à
// valider (docs/fonctionnelles/points-ouverts.md). En attendant : mode "unverified".

import type { Config } from "../config";
import { consolidatePrompt, systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA, enforceAnnotationSourcePolicy } from "../schema";
import { ProgressiveJsonParser, readSseLines, stripCodeFence } from "../streaming-json";
import { ProviderError, type LlmProvider } from "./types";

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export const geminiProvider: LlmProvider = {
  supportsWebSearch: () => false,

  async analyze(input, config: Config, signal) {
    const action = input.onStream ? "streamGenerateContent?alt=sse" : "generateContent";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:${action}`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt({ ...input, webSearch: false }) }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: ANALYSIS_JSON_SCHEMA },
      }),
    });
    if (!res.ok) throw new ProviderError(`Erreur ${res.status} de Gemini : ${(await res.text()).slice(0, 300)}`);

    if (input.onStream) {
      const parser = new ProgressiveJsonParser({
        onSummary: input.onStream.onSummary,
        onAnnotation: (a) => {
          const safe = enforceAnnotationSourcePolicy(a, undefined);
          input.onStream?.onAnnotation?.(safe);
        },
      });

      for await (const line of readSseLines(res)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") break;
        try {
          const json = JSON.parse(data) as GenerateContentResponse;
          if (json.promptFeedback?.blockReason) {
            throw new ProviderError(`Requête bloquée par Gemini (${json.promptFeedback.blockReason}).`);
          }
          const candidate = json.candidates?.[0];
          if (candidate?.finishReason === "MAX_TOKENS") {
            throw new ProviderError("Réponse tronquée. Réduire la taille des morceaux dans les options.");
          }
          const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
          if (text) {
            parser.feed(text);
          }
        } catch (e) {
          if (e instanceof ProviderError) throw e;
        }
      }

      const rawText = stripCodeFence(parser.getRawText());
      if (!rawText) throw new ProviderError("Réponse vide de Gemini.");
      try {
        return { raw: JSON.parse(rawText) };
      } catch {
        throw new ProviderError("La réponse n'est pas un JSON valide.");
      }
    }

    const data = (await res.json()) as GenerateContentResponse;
    if (data.promptFeedback?.blockReason) throw new ProviderError(`Requête bloquée par Gemini (${data.promptFeedback.blockReason}).`);
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") throw new ProviderError("Réponse tronquée. Réduire la taille des morceaux dans les options.");
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new ProviderError(`Réponse vide de Gemini (${candidate?.finishReason ?? "inconnu"}).`);
    try {
      return { raw: JSON.parse(text) };
    } catch {
      throw new ProviderError("La réponse n'est pas un JSON valide.");
    }
  },

  async consolidateSummary(title, summaries, language, config, signal, onProgressText) {
    const { system, user } = consolidatePrompt(title, summaries, language);
    const action = onProgressText ? "streamGenerateContent?alt=sse" : "generateContent";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:${action}`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    });
    if (!res.ok) throw new ProviderError(`Erreur ${res.status} de Gemini : ${(await res.text()).slice(0, 300)}`);

    if (onProgressText) {
      let accumulated = "";
      for await (const line of readSseLines(res)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") break;
        try {
          const json = JSON.parse(data) as GenerateContentResponse;
          const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
          if (text) {
            accumulated += text;
            onProgressText(accumulated);
          }
        } catch {
          // ignore
        }
      }
      const text = accumulated.trim();
      if (!text) throw new ProviderError("Résumé consolidé vide.");
      return text;
    }

    const data = (await res.json()) as GenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text) throw new ProviderError("Résumé consolidé vide.");
    return text;
  },
};
