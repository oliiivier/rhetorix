// Prompt commun aux providers. La taxonomie (D4) et la langue de sortie (D5)
// y sont injectées ; chaque adaptateur ajoute ses consignes propres.
// Toute modification d'un prompt impose d'incrémenter ENGINE_VERSION (engine-settings.ts).

import { CATEGORIES, LABELS, labelDef, type Category } from "./taxonomy";

function taxonomyText(language: string): string {
  return CATEGORIES.map((c) => {
    const labels = Object.keys(LABELS[c])
      .map((id) => {
        const def = labelDef(c, id, language);
        return `  - ${id} (${def?.name ?? id}) : ${def?.definition ?? ""}`;
      })
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
- Except for document-level annotations (see below), exact_quote must be copied verbatim from the article, character for character, in the article's language. Keep it short: the smallest passage that shows the problem, ideally one sentence, never more than about 300 characters.
- Use only these labels, matching the annotation's category; use "autre" when nothing fits and name the device in rhetoric_critique.
- Be descriptive and even-handed. Each annotation must be justified by the text itself, whatever the political orientation. Returning few or zero annotations is a valid result for a well-argued article.
- Be thorough: read the whole text and annotate every distinct passage that uses a device, not only the most salient ones. A device that recurs in different passages gets one annotation per passage. Polemical, emotional or one-sided texts usually contain many devices; a sound thesis does not exempt the rhetoric used to defend it.
- Unnamed authorities ("experts agree", "studies show", "everyone knows") are "bias/source_vague" or "sophism/argument_autorite" even when the claim itself is also checkable.
- Attacking a person's intelligence, health, sanity, beliefs or private life to discredit them or their actions is "sophism/ad_hominem". Pejorative or emotive wording about groups, things or events, without such a personal attack, is "bias/langage_charge".
- Annotate a "factual_claim" only when it is specific, checkable and either the argument relies on it or a reader could be misled by it. Do not annotate uncontroversial background, routine reporting of events, or accusations and opinions the author openly presents as their own.
- severity reflects how much the device distorts the reader's understanding:
  * "high": the device carries the article's main thesis or conclusion, or a factual claim the argument depends on;
  * "medium": it supports a secondary argument, or misleads on a point the reader may retain;
  * "low": it is a matter of tone, wording or a passing remark that does not change the argument.
- confidence reflects how sure you are that the device is present and correctly labelled, independently of severity:
  * "high": the device is unmistakable and most careful readers would name it the same way;
  * "medium": the reading is defensible, but another reasonable reading exists or another label could fit;
  * "low": the reading is debatable or depends on context you cannot see. Prefer omitting an annotation you would rate low unless the passage really deserves the reader's attention.
- A "sophism" or "bias" that lies in the structure of the whole argument rather than in a passage (for example a conclusion that does not follow from the premises set out across the article, an internal contradiction between distant sections, a position stated early and misrepresented later) is a document-level annotation: set exact_quote to "" and explain in rhetoric_critique which parts of the article are involved. Use it only when no short passage shows the problem; never for "factual_claim". When the text is one part of a longer article, report a document-level annotation only if the defect is visible within this part or between this part and the outline.
- For "sophism" and "bias" annotations, fact_check.status is "unverified" with empty sources unless the passage also makes a checkable claim.
- ${factRule}
- Judge factual claims as of the article's publication date when it is given: a claim that was accurate when published is not "refuted" because of later events. If something relevant has changed since, say so in fact_check.context.
- When an article outline is given, the text is one section of a longer article. Use the outline to recognise devices that span sections (for example a position stated in one section and misrepresented in this one), but quote only from this section.
- Write summary, clickbait_gap, blind_spot, rhetoric_critique and fact_check.context in this language: ${opts.language}. ids are "ann-1", "ann-2", …
- Evaluate editorial integrity at the document level:
  * clickbait_gap: Compare the article's title to its actual content. If the title is sensationalist, misleading, or overpromises compared to the real text, explain the gap concisely (1-2 sentences). If the title is faithful and proportionate, return an empty string "".
  * blind_spot: Highlight any crucial opposing viewpoint, legitimate counter-argument, or established scientific/academic consensus omitted by the article that skews the reader's perspective (1-2 sentences). If the article is balanced and presents necessary perspectives, return an empty string "".

Labels:
${taxonomyText(opts.language)}`;
}

/** Métadonnées de publication transmises au modèle (C1). */
export interface ArticleMeta {
  publishedTime?: string;
  byline?: string;
  siteName?: string;
}

/** En-tête commun : titre, métadonnées de publication (C1) et date de l'analyse. */
function articleHeader(title: string, meta: ArticleMeta | undefined, analysisDate: string | undefined): string {
  const lines = [`Article title: ${title}`];
  if (meta?.siteName) lines.push(`Publication: ${meta.siteName}`);
  if (meta?.byline) lines.push(`Author: ${meta.byline}`);
  if (meta?.publishedTime) lines.push(`Published: ${meta.publishedTime}`);
  if (analysisDate) lines.push(`Analysis date: ${analysisDate}`);
  return lines.join("\n");
}

export function userPrompt(article: {
  title: string;
  text: string;
  part?: { index: number; total: number };
  meta?: ArticleMeta;
  analysisDate?: string;
  outline?: string;
}): string {
  const part = article.part && article.part.total > 1 ? `\nThis is part ${article.part.index + 1} of ${article.part.total}.` : "";
  const outline = article.outline ? `\n\n<article_outline>\n${article.outline}\n</article_outline>` : "";
  return `${articleHeader(article.title, article.meta, article.analysisDate)}${part}${outline}

<article>
${article.text}
</article>`;
}

export interface Prompt {
  system: string;
  user: string;
}

/** Cartographie préalable d'un article découpé (B1, mode approfondi). */
export function mapPrompt(title: string, text: string, meta?: ArticleMeta, truncated = false): Prompt {
  return {
    system: `You prepare the outline of a long article for analysts who will each read only one section of it, looking for rhetorical fallacies and bias. Write a plain-text outline in English, at most 250 words, with these headings:
Thesis: the article's main claim, in one sentence.
Arguments: the main arguments in order, one line each.
Positions attributed to others: each opposing or third-party position the article reports, as the article first states it (paraphrase closely), and where it is answered.
Commitments: definitions, scope limits or concessions made early that later sections should stay consistent with.
Do not evaluate the article. No preamble.${truncated ? " The middle of the article is omitted ([…])." : ""}`,
    user: `${articleHeader(title, meta, undefined)}

<article>
${text}
</article>`,
  };
}

export interface PartialDocumentFindings {
  summary: string;
  clickbait_gap?: string;
  blind_spot?: string;
}

/**
 * Consolidation d'un article découpé (B2) : résumé, décalage titre / contenu et angle
 * mort sont jugés sur l'ensemble, à partir des constats partiels de chaque morceau.
 * Réponse JSON : { summary, clickbait_gap, blind_spot }.
 */
export function consolidatePrompt(title: string, parts: PartialDocumentFindings[], language: string, outline?: string): Prompt {
  const sections = parts
    .map((p, i) => {
      const lines = [`Section ${i + 1} summary: ${p.summary.trim()}`];
      if (p.clickbait_gap?.trim()) lines.push(`Section ${i + 1} title-gap note: ${p.clickbait_gap.trim()}`);
      if (p.blind_spot?.trim()) lines.push(`Section ${i + 1} blind-spot note: ${p.blind_spot.trim()}`);
      return lines.join("\n");
    })
    .join("\n\n");
  return {
    system: `You are an expert editorial analyst. A long article was analysed section by section; each section analyst saw only their section. Produce the document-level findings for the whole article, in this language: ${language}.
Answer with a single JSON object and nothing else: {"summary": "...", "clickbait_gap": "...", "blind_spot": "..."}
- summary: a single, cohesive, objective summary of the article's argumentative stance (2 to 3 sentences).
- clickbait_gap: compare the title to the whole article. Section notes are hints: keep a gap only if the article as a whole does not deliver what the title promises. 1-2 sentences, or "" if the title is faithful.
- blind_spot: a crucial viewpoint, counter-argument or consensus that the whole article omits. A section note may concern a point another section addresses: drop it then. 1-2 sentences, or "" if the article is balanced.`,
    user: `Article title: ${title}${outline ? `\n\n<article_outline>\n${outline}\n</article_outline>` : ""}

${sections}`,
  };
}

export interface ReviewItem {
  id: string;
  category: string;
  label: string;
  quote: string;
  critique: string;
  /** Paragraphe de l'article qui contient la citation, si elle y a été trouvée. */
  context?: string;
}

/** Définition de l'étiquette, pour que la relecture juge sur le même critère que l'analyse. */
function labelLine(it: ReviewItem): string {
  const def = CATEGORIES.includes(it.category as Category) ? labelDef(it.category as Category, it.label, "en") : undefined;
  return def ? ` (${def.name}: ${def.definition})` : "";
}

/**
 * Relecture des annotations (Q2, mode approfondi) : écarte celles que le texte ne
 * justifie pas. Réponse JSON : { rejected: [{ id, reason }] }.
 */
export function reviewPrompt(title: string, items: ReviewItem[], outline?: string): Prompt {
  const list = items
    .map((it) =>
      [
        `[${it.id}] ${it.category}/${it.label}${labelLine(it)}`,
        `Quote: ${it.quote}`,
        `Critique: ${it.critique}`,
        it.quote === ""
          ? "Paragraph: (document-level annotation: it concerns the structure of the whole argument)"
          : it.context
            ? `Paragraph: ${it.context}`
            : "Paragraph: (quote not found verbatim in the article)",
      ].join("\n"),
    )
    .join("\n\n");
  return {
    system: `You review annotations produced by another analyst on a news article: rhetorical fallacies ("sophism"), framing or selection bias ("bias") and checkable factual claims ("factual_claim"). Reject an annotation only if the text does not support it:
- the quoted passage, read in its paragraph and in the article as a whole, does not meet the definition of the label (for example a position presented fairly, a concession, a quotation the author distances themselves from, or a reasonable inference);
- the passage reports what a source said, in a news report that also gives other views, without the article endorsing it: the device, if any, is the source's, not the article's;
- the passage is cautious or balanced (contrasting results, acknowledged uncertainty, sourced attribution) and the critique faults it for vagueness or framing;
- the critique only works through a strained reading: an ordinary descriptive word treated as loaded, a transition treated as a diversion, a plain fact treated as a fallacy;
- for "factual_claim", the passage makes no checkable claim, or it is uncontroversial background or routine reporting that the argument does not rely on;
- the annotation duplicates another one on the same passage;
- the quote is absent from the article and the critique cannot be tied to any passage;
- for a document-level annotation (empty quote), the outline and the other annotations do not bear out the structural defect it describes, or it merely restates a passage-level annotation.
Do not reject an annotation because you disagree with the article's thesis or with the critique's wording, nor because of the truth of a claim, nor because the article's thesis is sound: vehement rhetoric serving a correct conclusion is still rhetoric. Apply the same standard whatever the article's political orientation. Keep an annotation when the device is clearly present, even if minor; reject it when it requires one of the readings above.
Answer with a single JSON object and nothing else: {"rejected": [{"id": "...", "reason": "..."}]}. Use an empty array when every annotation is justified.`,
    user: `Article title: ${title}${outline ? `\n\n<article_outline>\n${outline}\n</article_outline>` : ""}

<annotations>
${list}
</annotations>`,
  };
}


export interface VerifyClaim {
  title: string;
  quote: string;
  /** Paragraphe de l'article qui contient l'allégation, s'il est connu. */
  context?: string;
  /** Explication donnée par l'analyse. */
  critique: string;
  meta?: ArticleMeta;
  analysisDate: string;
}

/**
 * Vérification d'une allégation à la demande (C2), avec la recherche web activée pour
 * ce seul appel. Réponse JSON : { status, context, sources: [{ title, url }] }.
 */
export function verifyPrompt(claim: VerifyClaim, language: string): Prompt {
  return {
    system: `You fact-check one claim taken from a news article. Use the web search tool to check it against reliable sources.
Answer with a single JSON object and nothing else: {"status": "...", "context": "...", "sources": [{"title": "...", "url": "..."}]}
- status: "supported" if reliable sources confirm the claim, "refuted" if they contradict it, "misleading" if it is partly true but distorted, exaggerated or stripped of context, "unverified" if the search is inconclusive.
- context: 1 to 3 sentences giving the relevant facts and figures, in this language: ${language}.
- sources: the pages that support your verdict. Only cite URLs that appeared in your search results; never write a URL from memory. Use [] when you found none.
- Judge the claim as of the article's publication date when it is given: a claim that was accurate when published is not "refuted" because of later events. If something relevant has changed since, say so in context.`,
    user: `${articleHeader(claim.title, claim.meta, claim.analysisDate)}

Claim: ${claim.quote}${claim.context ? `
Paragraph: ${claim.context}` : ""}
Analyst's note: ${claim.critique}`,
  };
}
