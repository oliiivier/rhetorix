// Adaptateur pour les endpoints compatibles OpenAI Chat Completions (OpenAI, Mistral,
// OpenRouter, Ollama, LM Studio…). Pas de recherche web : mode "unverified" (D3).

import type { Config } from "../config";
import { consolidatePrompt, systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA, enforceAnnotationSourcePolicy } from "../schema";
import { ProgressiveJsonParser, readSseLines, stripCodeFence } from "../streaming-json";
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
        ...(input.onStream ? { stream: true } : {}),
      }),
    });
    if (!res.ok) throw new ProviderError(`Erreur ${res.status} de l'endpoint : ${(await res.text()).slice(0, 300)}`);

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
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
          };
          const choice = json.choices?.[0];
          if (choice?.finish_reason === "length") {
            throw new ProviderError("Réponse tronquée. Réduire la taille des morceaux dans les options.");
          }
          if (choice?.delta?.refusal) {
            throw new ProviderError(`Refus du modèle : ${choice.delta.refusal}`);
          }
          const content = choice?.delta?.content;
          if (content) {
            parser.feed(content);
          }
        } catch (e) {
          if (e instanceof ProviderError) throw e;
        }
      }

      const rawText = stripCodeFence(parser.getRawText());
      if (!rawText) throw new ProviderError("Réponse vide de l'endpoint.");
      try {
        return { raw: JSON.parse(rawText) };
      } catch {
        throw new ProviderError("La réponse n'est pas un JSON valide.");
      }
    }

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

  async consolidateSummary(title, summaries, language, config, signal, onProgressText) {
    const { system, user } = consolidatePrompt(title, summaries, language);
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
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(onProgressText ? { stream: true } : {}),
      }),
    });
    if (!res.ok) throw new ProviderError(`Erreur ${res.status} de l'endpoint : ${(await res.text()).slice(0, 300)}`);

    if (onProgressText) {
      let accumulated = "";
      for await (const line of readSseLines(res)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") break;
        try {
          const json = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] };
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            accumulated += content;
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

    const choice = ((await res.json()) as ChatCompletion).choices?.[0];
    const text = choice?.message?.content?.trim();
    if (!text) throw new ProviderError("Résumé consolidé vide.");
    return text;
  },
};
