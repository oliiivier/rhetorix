// Prompt commun aux providers. La taxonomie (D4) et la langue de sortie (D5)
// y sont injectées ; chaque adaptateur ajoute ses consignes propres.

import { CATEGORIES, LABELS, type LabelDef } from "./taxonomy";

function taxonomyText(): string {
  return CATEGORIES.map((c) => {
    const labels = Object.entries(LABELS[c] as Record<string, LabelDef>)
      .map(([id, def]) => `  - ${id} (${def.name}) : ${def.definition}`)
      .join("\n");
    return `category "${c}":\n${labels}`;
  }).join("\n\n");
}

export function systemPrompt(opts: { language: string; webSearch: boolean }): string {
  const factRule = opts.webSearch
    ? `For "factual_claim" annotations, use the web search tool to check the claim. Only cite URLs that appeared in your search results; never write a URL from memory. If the search is inconclusive, use status "unverified".`
    : `You have no web access. Set every fact_check.status to "unverified" and fact_check.sources to []. You may still give known context in fact_check.context, phrased cautiously.`;

  return `You analyse news articles and interviews for rhetorical fallacies ("sophism"), framing or selection bias ("bias") and checkable factual claims ("factual_claim").

Rules:
- exact_quote must be copied verbatim from the article, character for character, in the article's language. Keep it short: the smallest passage that shows the problem, ideally one sentence, never more than about 300 characters.
- Use only these labels, matching the annotation's category; use "autre" when nothing fits and name the device in rhetoric_critique.
- Be descriptive and even-handed. Each annotation must be justified by the text itself, whatever the political orientation. Returning few or zero annotations is a valid result for a well-argued article.
- severity reflects how much the device distorts the reader's understanding.
- For "sophism" and "bias" annotations, fact_check.status is "unverified" with empty sources unless the passage also makes a checkable claim.
- ${factRule}
- Write summary, rhetoric_critique and fact_check.context in this language: ${opts.language}. ids are "ann-1", "ann-2", …

Labels:
${taxonomyText()}`;
}

export function userPrompt(article: { title: string; text: string; part?: { index: number; total: number } }): string {
  const part = article.part && article.part.total > 1 ? ` (part ${article.part.index + 1} of ${article.part.total})` : "";
  return `Article title: ${article.title}${part}

<article>
${article.text}
</article>`;
}

export function consolidatePrompt(
  title: string,
  summaries: string[],
  language: string,
): { system: string; user: string } {
  return {
    system: `You are an expert editorial analyst. Synthesize the provided partial section summaries of the article into a single, cohesive, objective summary (2 to 3 sentences) in this language: ${language}. Do not include commentary, labels, bullet points or preamble, just the consolidated summary text.`,
    user: `Article title: ${title}\n\nSection summaries:\n${summaries.map((s, i) => `Section ${i + 1}:\n${s}`).join("\n\n")}`,
  };
}

