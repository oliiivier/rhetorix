// Adaptateur pour Chrome Built-in AI (Prompt API / Gemini Nano).
// Entièrement local, sans clé API, sans coût et respectueux de la vie privée.
// Pas de recherche web : mode "unverified" (D3).

import type { Config } from "../config";
import { systemPrompt, userPrompt } from "../prompt";
import { enforceAnnotationSourcePolicy } from "../schema";
import { ProgressiveJsonParser, stripCodeFence } from "../streaming-json";
import { ProviderError, type LlmProvider } from "./types";

interface AILanguageModelCapabilities {
  available: "readily" | "after-download" | "no";
  defaultTemperature?: number;
  maxTemperature?: number;
  defaultTopK?: number;
  maxTopK?: number;
}

interface AILanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
}

interface AILanguageModelFactory {
  capabilities?(): Promise<AILanguageModelCapabilities>;
  availability?(): Promise<"readily" | "after-download" | "no">;
  create(options?: {
    systemPrompt?: string;
    signal?: AbortSignal;
    temperature?: number;
    topK?: number;
    monitor?: (m: unknown) => void;
  }): Promise<AILanguageModelSession>;
}

interface GlobalWithAI {
  ai?: {
    languageModel?: AILanguageModelFactory;
  };
}

function getAILanguageModelFactory(): AILanguageModelFactory | undefined {
  const g = globalThis as unknown as GlobalWithAI;
  return g.ai?.languageModel;
}

async function checkAvailability(factory: AILanguageModelFactory): Promise<"readily" | "after-download" | "no"> {
  if (typeof factory.availability === "function") {
    return await factory.availability();
  }
  if (typeof factory.capabilities === "function") {
    const cap = await factory.capabilities();
    return cap.available;
  }
  return "readily";
}

export const chromeAiProvider: LlmProvider = {
  supportsWebSearch: () => false,

  async analyze(input, _config: Config, signal) {
    const factory = getAILanguageModelFactory();
    if (!factory) {
      throw new ProviderError(
        "Chrome Built-in AI (Gemini Nano) n'est pas disponible sur ce navigateur. Nécessite Chromium 128+ avec le flag chrome://flags/#prompt-api-for-gemini-nano activé.",
        "blocked",
      );
    }

    const availability = await checkAvailability(factory);
    if (availability === "no") {
      throw new ProviderError(
        "Gemini Nano n'est pas supporté par ce système ou ce matériel.",
        "blocked",
      );
    }

    const session = await factory.create({
      systemPrompt: systemPrompt({ ...input, webSearch: false }),
      signal,
    });

    const parser = new ProgressiveJsonParser({
      onSummary: input.onStream?.onSummary,
      onAnnotation: (a) => {
        const safe = enforceAnnotationSourcePolicy(a, undefined);
        input.onStream?.onAnnotation?.(safe);
      },
    });

    const sysText = systemPrompt({ ...input, webSearch: false });
    const userText = userPrompt(input);
    const promptTokens = Math.ceil((sysText.length + userText.length) / 4);
    let outputTokens = 0;

    input.onStream?.onUsage?.({
      inputTokens: promptTokens,
      outputTokens: 0,
      totalTokens: promptTokens,
    });

    try {
      const stream = session.promptStreaming(userText, { signal });
      let accumulated = "";
      for await (const chunk of stream) {
        let delta = chunk;
        if (chunk.startsWith(accumulated)) {
          delta = chunk.slice(accumulated.length);
          accumulated = chunk;
        } else {
          accumulated += chunk;
        }
        if (delta) {
          outputTokens = Math.ceil(accumulated.length / 4);
          parser.feed(delta);
          input.onStream?.onUsage?.({
            inputTokens: promptTokens,
            outputTokens,
            totalTokens: promptTokens + outputTokens,
          });
        }
      }

      const finalUsage = {
        inputTokens: promptTokens,
        outputTokens,
        totalTokens: promptTokens + outputTokens,
      };
      input.onStream?.onUsage?.(finalUsage);

      const rawText = stripCodeFence(parser.getRawText());
      if (!rawText) throw new ProviderError("Réponse vide de Chrome Built-in AI.", "empty_response");
      try {
        return { raw: JSON.parse(rawText), usage: finalUsage };
      } catch {
        throw new ProviderError("La réponse de Chrome Built-in AI n'est pas un JSON valide.", "invalid_json");
      }
    } finally {
      session.destroy();
    }
  },

  async complete(request, _config, signal, callbacks) {
    const factory = getAILanguageModelFactory();
    if (!factory) {
      throw new ProviderError("Chrome Built-in AI non disponible.", "blocked");
    }

    const { system, user } = request;
    const session = await factory.create({
      systemPrompt: system,
      signal,
    });

    const promptTokens = Math.ceil((system.length + user.length) / 4);

    try {
      let accumulated = "";
      for await (const chunk of session.promptStreaming(user, { signal })) {
        // Selon la version de Chrome, chaque élément est le texte cumulé ou un delta.
        accumulated = chunk.startsWith(accumulated) ? chunk : accumulated + chunk;
        callbacks?.onText?.(accumulated);
      }
      const text = accumulated.trim();
      const outputTokens = Math.ceil(text.length / 4);
      callbacks?.onUsage?.({
        inputTokens: promptTokens,
        outputTokens,
        totalTokens: promptTokens + outputTokens,
      });
      if (!text) throw new ProviderError("Réponse vide de Chrome Built-in AI.", "empty_completion");
      return text;
    } finally {
      session.destroy();
    }
  },
};
