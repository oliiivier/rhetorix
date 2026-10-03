// Adaptateur Google Gemini (API generateContent). Sortie structurée via responseJsonSchema.
// La recherche web (grounding Google Search) n'est pas encore branchée : sa combinaison
// avec un schéma de sortie et le rattachement des sources aux annotations restent à
// valider (docs/fonctionnelles/points-ouverts.md). En attendant : mode "unverified".

import type { Config } from "../config";
import { systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA } from "../schema";
import { ProviderError, type LlmProvider } from "./types";

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export const geminiProvider: LlmProvider = {
  supportsWebSearch: () => false,

  async analyze(input, config: Config, signal) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
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
};
