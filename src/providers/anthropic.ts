// Adaptateur Anthropic : SDK officiel, sortie structurée par un outil strict
// `submit_analysis`, recherche web par l'outil serveur web_search (décision D3).

import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config";
import { consolidatePrompt, systemPrompt, userPrompt } from "../prompt";
import { ANALYSIS_JSON_SCHEMA, enforceAnnotationSourcePolicy, normalizeSourceUrl } from "../schema";
import { ProgressiveJsonParser } from "../streaming-json";
import { ProviderError, type LlmProvider } from "./types";

const SUBMIT_TOOL = "submit_analysis";
const MAX_TURNS = 5;

/** Modèles qui acceptent `fallbacks: "default"` (reprise côté serveur après un refus). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function createAnthropicClient(apiKey: string, endpoint?: string): Anthropic {
  const clean = apiKey.trim();
  const isOAuth = clean.startsWith("sk-ant-oat") || clean.startsWith("Bearer ");
  const token = clean.replace(/^Bearer\s+/i, "");
  const baseUrl = endpoint?.trim().replace(/\/+$/, "");
  return new Anthropic({
    apiKey: isOAuth ? undefined : token,
    authToken: isOAuth ? token : undefined,
    baseURL: baseUrl || undefined,
    dangerouslyAllowBrowser: true,
    defaultHeaders: isOAuth
      ? {
          "anthropic-beta": "oauth-2025-04-20",
        }
      : undefined,
  });
}

export const anthropicProvider: LlmProvider = {
  supportsWebSearch: () => true,

  async analyze(input, config: Config, signal) {
    const cleanKey = config.apiKey.trim();
    const isOAuth = cleanKey.startsWith("sk-ant-oat") || cleanKey.startsWith("Bearer ");
    const client = createAnthropicClient(config.apiKey, config.endpoint);
    const tools: Anthropic.Beta.Messages.BetaToolUnion[] = [
      ...(input.webSearch ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 8 }] : []),
      {
        name: SUBMIT_TOOL,
        description: "Submit the final analysis of the article. Call it exactly once, after any searches.",
        input_schema: ANALYSIS_JSON_SCHEMA as unknown as Anthropic.Beta.Messages.BetaTool.InputSchema,
        strict: true,
      },
    ];
    const baseSystem = `${systemPrompt(input)}\n\nWhen you are done, call the ${SUBMIT_TOOL} tool with the full analysis. Do not answer in plain text.`;
    const system = isOAuth
      ? `You are Claude Code, Anthropic's official CLI for Claude.\n\n${baseSystem}`
      : baseSystem;
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: userPrompt(input) }];
    const fallback = FALLBACK_MODELS.has(config.model);
    const searched = new Set<string>();

    const parser = input.onStream
      ? new ProgressiveJsonParser({
          onSummary: input.onStream.onSummary,
          onAnnotation: (a) => {
            const safe = enforceAnnotationSourcePolicy(a, input.webSearch ? searched : undefined);
            input.onStream?.onAnnotation?.(safe);
          },
        })
      : null;

    const betas: string[] = [
      ...(isOAuth ? ["oauth-2025-04-20"] : []),
      ...(fallback ? ["server-side-fallback-2026-07-01"] : []),
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.beta.messages.stream(
        {
          model: config.model,
          max_tokens: 64_000,
          system,
          tools,
          // Le choix forcé d'un outil est refusé par les modèles récents : auto + consigne.
          tool_choice: { type: "auto" },
          messages,
          ...(config.model.startsWith("claude-haiku") ? {} : { output_config: { effort: "high" as const } }),
          ...(betas.length > 0 ? { betas: betas as unknown as Anthropic.Beta.AnthropicBeta[] } : {}),
          ...(fallback ? { fallbacks: "default" } : {}),
        } as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
        { signal },
      );

      if (parser) {
        let submitBlockIndex: number | null = null;
        stream.on("streamEvent", (event) => {
          if (event.type === "content_block_start") {
            const b = event.content_block;
            if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
              for (const r of b.content) if (r.type === "web_search_result") searched.add(normalizeSourceUrl(r.url));
            }
            if (b.type === "tool_use" && b.name === SUBMIT_TOOL) {
              submitBlockIndex = event.index;
            }
          } else if (event.type === "content_block_delta") {
            if (event.index === submitBlockIndex && event.delta.type === "input_json_delta") {
              parser.feed(event.delta.partial_json);
            }
          } else if (event.type === "content_block_stop") {
            if (event.index === submitBlockIndex) {
              submitBlockIndex = null;
            }
          }
        });
      }

      const message = await stream.finalMessage();

      for (const block of message.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result") searched.add(normalizeSourceUrl(r.url));
        }
      }

      const submit = message.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_TOOL);
      if (submit && submit.type === "tool_use") {
        return { raw: submit.input, searchedUrls: input.webSearch ? searched : undefined };
      }

      switch (message.stop_reason) {
        case "pause_turn":
          // Boucle serveur interrompue (recherches) : renvoyer le tour tel quel pour reprendre.
          messages.push({ role: "assistant", content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
          continue;
        case "refusal":
          throw new ProviderError("Le modèle a refusé d'analyser ce contenu.", "refusal");
        case "max_tokens":
          throw new ProviderError("Réponse tronquée (max_tokens atteint). Réduire la taille des morceaux dans les options.", "max_tokens");
        default:
          throw new ProviderError("Le modèle n'a pas renvoyé d'analyse structurée.", "no_structured_output");
      }
    }
    throw new ProviderError("Trop de reprises de la recherche web.", "too_many_turns");
  },

  async consolidateSummary(title, summaries, language, config, signal, onProgressText) {
    const cleanKey = config.apiKey.trim();
    const isOAuth = cleanKey.startsWith("sk-ant-oat") || cleanKey.startsWith("Bearer ");
    const client = createAnthropicClient(config.apiKey, config.endpoint);
    const { system: baseSystem, user } = consolidatePrompt(title, summaries, language);
    const system = isOAuth
      ? `You are Claude Code, Anthropic's official CLI for Claude.\n\n${baseSystem}`
      : baseSystem;
    const stream = client.messages.stream(
      {
        model: config.model,
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: user }],
      },
      { signal },
    );
    if (onProgressText) {
      stream.on("text", (_delta, snapshot) => {
        onProgressText(snapshot);
      });
    }
    const message = await stream.finalMessage();
    const text = message.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new ProviderError("Résumé consolidé vide.", "empty_consolidated");
    return text;
  },
};
