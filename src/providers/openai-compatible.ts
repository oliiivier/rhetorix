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
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export const openAiCompatibleProvider: LlmProvider = {
  supportsWebSearch: (config) => Boolean(config.webSearch),

  async analyze(input, config: Config, signal) {
    const webSearch = Boolean(config.webSearch);
    const url = `${config.endpoint.replace(/\/+$/, "")}/chat/completions`;
    const sysPrompt = systemPrompt({ ...input, webSearch });
    const uPrompt = userPrompt(input);

    const res = await postJson(
      url,
      config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
      {
        model: config.model,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: uPrompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: ANALYSIS_JSON_SCHEMA } },
        stream: true,
        stream_options: { include_usage: true },
      },
      signal,
      "l'endpoint",
        input.onStream?.onRetry,
    );

    const searchedUrls = webSearch ? new Set<string>() : undefined;

    const parser = new ProgressiveJsonParser({
      onSummary: input.onStream?.onSummary,
      onAnnotation: (a) => {
        const safe = enforceAnnotationSourcePolicy(a, searchedUrls);
        input.onStream?.onAnnotation?.(safe);
      },
    });

    let promptTokens = Math.ceil((sysPrompt.length + uPrompt.length) / 4);
    let completionTokens = 0;
    let streamedChars = 0;

    const emitUsage = () => {
      input.onStream?.onUsage?.({
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        totalTokens: promptTokens + completionTokens,
      });
    };
    emitUsage();

    for await (const chunk of parseSseJson<ChatCompletionChunk>(res)) {
      if (chunk.usage) {
        if (typeof chunk.usage.prompt_tokens === "number") promptTokens = chunk.usage.prompt_tokens;
        if (typeof chunk.usage.completion_tokens === "number") completionTokens = chunk.usage.completion_tokens;
      }
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
        streamedChars += choice.delta.content.length;
        if (!chunk.usage?.completion_tokens) {
          completionTokens = Math.ceil(streamedChars / 4);
        }
        parser.feed(choice.delta.content);
        emitUsage();
      } else if (chunk.usage) {
        emitUsage();
      }
    }

    const finalUsage = {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
    input.onStream?.onUsage?.(finalUsage);

    const rawText = stripCodeFence(parser.getRawText());
    if (!rawText) throw new ProviderError("Réponse vide de l'endpoint.", "empty_response");
    try {
      return { raw: JSON.parse(rawText), searchedUrls, usage: finalUsage };
    } catch {
      throw new ProviderError("La réponse n'est pas un JSON valide.", "invalid_json");
    }
  },

  async consolidateSummary(title, summaries, language, config, signal, onProgressText, onUsage) {
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
        stream_options: { include_usage: true },
      },
      signal,
      "l'endpoint",
    );

    let promptTokens = Math.ceil((system.length + user.length) / 4);
    let completionTokens = 0;
    let streamedChars = 0;

    let accumulated = "";
    for await (const chunk of parseSseJson<ChatCompletionChunk>(res)) {
      if (chunk.usage) {
        if (typeof chunk.usage.prompt_tokens === "number") promptTokens = chunk.usage.prompt_tokens;
        if (typeof chunk.usage.completion_tokens === "number") completionTokens = chunk.usage.completion_tokens;
      }
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        accumulated += content;
        streamedChars += content.length;
        if (!chunk.usage?.completion_tokens) {
          completionTokens = Math.ceil(streamedChars / 4);
        }
        onProgressText?.(accumulated);
      }
    }
    onUsage?.({
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
    });
    const text = accumulated.trim();
    if (!text) throw new ProviderError("Résumé consolidé vide.", "empty_consolidated");
    return text;
  },
};
