// Adaptateur pour les endpoints compatibles OpenAI Chat Completions (OpenAI, Mistral,
// OpenRouter, Ollama, LM Studio…). Pas de recherche web : mode "unverified" (D3).

import type { Config } from "../config";
import { systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA } from "../schema";
import { ProviderError, type LlmProvider } from "./types";

interface ChatCompletion {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
}

export const openAiCompatibleProvider: LlmProvider = {
  supportsWebSearch: () => false,

  async analyze(input, config: Config, signal) {
    const url = `${config.endpoint.replace(/\/+$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt({ ...input, webSearch: false }) },
          { role: "user", content: userPrompt(input) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: ANALYSIS_JSON_SCHEMA } },
      }),
    });
    if (!res.ok) throw new ProviderError(`Erreur ${res.status} de l'endpoint : ${(await res.text()).slice(0, 300)}`);

    const choice = ((await res.json()) as ChatCompletion).choices?.[0];
    if (choice?.message?.refusal) throw new ProviderError(`Refus du modèle : ${choice.message.refusal}`);
    if (choice?.finish_reason === "length") throw new ProviderError("Réponse tronquée. Réduire la taille des morceaux dans les options.");
    const content = choice?.message?.content;
    if (!content) throw new ProviderError("Réponse vide de l'endpoint.");
    try {
      return { raw: JSON.parse(content) };
    } catch {
      throw new ProviderError("La réponse n'est pas un JSON valide.");
    }
  },
};
