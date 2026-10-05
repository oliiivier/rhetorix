// Adaptateur Google Gemini (API streamGenerateContent?alt=sse). Sortie structurée via responseJsonSchema.
// Recherche web intégrée via l'outil de grounding Google Search (D3).

import type { Config } from "../config";
import { systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA, enforceAnnotationSourcePolicy, normalizeSourceUrl } from "../schema";
import { parseSseJson, ProgressiveJsonParser, stripCodeFence } from "../streaming-json";
import { postJson } from "./http";
import { ProviderError, type LlmProvider } from "./types";

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
}

interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GenerateContentChunk {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: GroundingMetadata;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: UsageMetadata;
}

export const geminiProvider: LlmProvider = {
  supportsWebSearch: (config) => Boolean(config.webSearch),

  async analyze(input, config: Config, signal) {
    const webSearch = Boolean(config.webSearch);
    const modelName = config.model.replace(/^models\//, "");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse`;
    const tools = webSearch ? [{ googleSearch: {} }] : undefined;

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt({ ...input, webSearch }) }] },
      contents: [{ role: "user", parts: [{ text: userPrompt(input) }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: ANALYSIS_JSON_SCHEMA },
    };
    if (tools) body.tools = tools;

    let res: Response;
    try {
      res = await postJson(
        url,
        { "x-goog-api-key": config.apiKey },
        body,
        signal,
        "Gemini",
        input.onStream?.onRetry,
      );
    } catch (err) {
      if (webSearch && err instanceof ProviderError) {
        const msg = (err.detail || err.message).toLowerCase();
        if (
          msg.includes("billing") ||
          msg.includes("quota") ||
          msg.includes("search") ||
          msg.includes("grounding") ||
          msg.includes("permission")
        ) {
          throw new ProviderError(
            `${err.message} (Astuce : avec le quota gratuit de Google AI Studio, désactivez « Vérifier les faits par recherche web » dans les options de Rhetorix).`,
            err.code,
            err.detail,
          );
        }
      }
      throw err;
    }

    const searchedUrls = webSearch ? new Set<string>() : undefined;

    const parser = new ProgressiveJsonParser({
      onSummary: input.onStream?.onSummary,
      onAnnotation: (a) => {
        const safe = enforceAnnotationSourcePolicy(a, searchedUrls);
        input.onStream?.onAnnotation?.(safe);
      },
    });

    const sysText = systemPrompt({ ...input, webSearch });
    const userText = userPrompt(input);
    let promptTokens = Math.ceil((sysText.length + userText.length) / 4);
    let candidateTokens = 0;
    let streamedChars = 0;

    const emitUsage = () => {
      input.onStream?.onUsage?.({
        inputTokens: promptTokens,
        outputTokens: candidateTokens,
        totalTokens: promptTokens + candidateTokens,
      });
    };
    emitUsage();

    for await (const chunk of parseSseJson<GenerateContentChunk>(res)) {
      if (chunk.usageMetadata) {
        if (typeof chunk.usageMetadata.promptTokenCount === "number") {
          promptTokens = chunk.usageMetadata.promptTokenCount;
        }
        if (typeof chunk.usageMetadata.candidatesTokenCount === "number") {
          candidateTokens = chunk.usageMetadata.candidatesTokenCount;
        }
      }
      if (chunk.promptFeedback?.blockReason) {
        throw new ProviderError(`Requête bloquée par Gemini (${chunk.promptFeedback.blockReason}).`, "blocked", chunk.promptFeedback.blockReason);
      }
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new ProviderError("Réponse tronquée. Réduire la taille des morceaux dans les options.", "max_tokens");
      }
      if (searchedUrls && candidate?.groundingMetadata?.groundingChunks) {
        for (const g of candidate.groundingMetadata.groundingChunks) {
          if (g.web?.uri) {
            searchedUrls.add(normalizeSourceUrl(g.web.uri));
          }
        }
      }
      const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
      if (text) {
        streamedChars += text.length;
        if (!chunk.usageMetadata?.candidatesTokenCount) {
          candidateTokens = Math.ceil(streamedChars / 4);
        }
        parser.feed(text);
        emitUsage();
      } else if (chunk.usageMetadata) {
        emitUsage();
      }
    }

    const finalUsage = {
      inputTokens: promptTokens,
      outputTokens: candidateTokens,
      totalTokens: promptTokens + candidateTokens,
    };
    input.onStream?.onUsage?.(finalUsage);

    const rawText = stripCodeFence(parser.getRawText());
    if (!rawText) throw new ProviderError("Réponse vide de Gemini.", "empty_response");
    try {
      return { raw: JSON.parse(rawText), searchedUrls, usage: finalUsage };
    } catch {
      throw new ProviderError("La réponse n'est pas un JSON valide.", "invalid_json");
    }
  },

  async complete(request, config, signal, callbacks) {
    const { system, user } = request;
    const modelName = config.model.replace(/^models\//, "");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse`;
    const res = await postJson(
      url,
      { "x-goog-api-key": config.apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        ...(request.json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      },
      signal,
      "Gemini",
      callbacks?.onRetry,
    );

    let promptTokens = Math.ceil((system.length + user.length) / 4);
    let candidateTokens = 0;
    let streamedChars = 0;

    let accumulated = "";
    for await (const chunk of parseSseJson<GenerateContentChunk>(res)) {
      if (chunk.usageMetadata) {
        if (typeof chunk.usageMetadata.promptTokenCount === "number") promptTokens = chunk.usageMetadata.promptTokenCount;
        if (typeof chunk.usageMetadata.candidatesTokenCount === "number") candidateTokens = chunk.usageMetadata.candidatesTokenCount;
      }
      if (chunk.promptFeedback?.blockReason) {
        throw new ProviderError(`Requête bloquée par Gemini (${chunk.promptFeedback.blockReason}).`, "blocked", chunk.promptFeedback.blockReason);
      }
      const text = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (text) {
        accumulated += text;
        streamedChars += text.length;
        if (!chunk.usageMetadata?.candidatesTokenCount) {
          candidateTokens = Math.ceil(streamedChars / 4);
        }
        callbacks?.onText?.(accumulated);
      }
    }
    callbacks?.onUsage?.({
      inputTokens: promptTokens,
      outputTokens: candidateTokens,
      totalTokens: promptTokens + candidateTokens,
    });
    const text = accumulated.trim();
    if (!text) throw new ProviderError("Réponse vide de Gemini.", "empty_completion");
    return text;
  },
};
