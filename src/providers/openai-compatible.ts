// Adaptateur pour les endpoints compatibles OpenAI Chat Completions (OpenAI, Mistral,
// OpenRouter, Ollama, LM Studio, Perplexity…).
// Prise en charge des citations web (D3) si l'endpoint dispose de la recherche web.

import type { Config } from "../config";
import { consolidatePrompt, systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA, enforceAnnotationSourcePolicy, normalizeSourceUrl } from "../schema";
import { parseSseJson, ProgressiveJsonParser, stripCodeFence } from "../streaming-json";
import { postJson } from "./http";
import { ProviderError, type LlmProvider } from "./types";

interface ChatCompletionChunk {
  choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  citations?: string[];
}

export const openAiCompatibleProvider: LlmProvider = {
  supportsWebSearch: (config) => Boolean(config.webSearch),

  async analyze(input, config: Config, signal) {
    const webSearch = Boolean(config.webSearch);
    const url = `${config.endpoint.replace(/\/+$/, "")}/chat/completions`;
    const res = await postJson(
      url,
      config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
      {
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt({ ...input, webSearch }) },
          { role: "user", content: userPrompt(input) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: ANALYSIS_JSON_SCHEMA } },
        stream: true,
      },
      signal,
      "l'endpoint",
    );

    const searchedUrls = webSearch ? new Set<string>() : undefined;

    const parser = new ProgressiveJsonParser({
      onSummary: input.onStream?.onSummary,
      onAnnotation: (a) => {
        const safe = enforceAnnotationSourcePolicy(a, searchedUrls);
        input.onStream?.onAnnotation?.(safe);
      },
    });

    for await (const chunk of parseSseJson<ChatCompletionChunk>(res)) {
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason === "length") {
        throw new ProviderError("Réponse tronquée. Réduire la taille des morceaux dans les options.", "max_tokens");
      }
      if (choice?.delta?.refusal) {
        throw new ProviderError(`Refus du modèle : ${choice.delta.refusal}`, "refusal", choice.delta.refusal);
      }
      if (searchedUrls && chunk.citations) {
        for (const u of chunk.citations) {
          searchedUrls.add(normalizeSourceUrl(u));
        }
      }
      if (choice?.delta?.content) {
        parser.feed(choice.delta.content);
      }
    }

    const rawText = stripCodeFence(parser.getRawText());
    if (!rawText) throw new ProviderError("Réponse vide de l'endpoint.", "empty_response");
    try {
      return { raw: JSON.parse(rawText), searchedUrls };
    } catch {
      throw new ProviderError("La réponse n'est pas un JSON valide.", "invalid_json");
    }
  },

  async consolidateSummary(title, summaries, language, config, signal, onProgressText) {
    const { system, user } = consolidatePrompt(title, summaries, language);
    const url = `${config.endpoint.replace(/\/+$/, "")}/chat/completions`;
    const res = await postJson(
      url,
      config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
      {
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: true,
      },
      signal,
      "l'endpoint",
    );

    let accumulated = "";
    for await (const chunk of parseSseJson<ChatCompletionChunk>(res)) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        accumulated += content;
        onProgressText?.(accumulated);
      }
    }
    const text = accumulated.trim();
    if (!text) throw new ProviderError("Résumé consolidé vide.", "empty_consolidated");
    return text;
  },
};
