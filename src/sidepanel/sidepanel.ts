// Panneau latéral : déclenche l'analyse de l'onglet actif, affiche les cartes et
// synchronise la sélection avec la page. Tout contenu issu du LLM ou de la page est
// inséré via textContent (jamais innerHTML).

import { analyzeArticle } from "../analyze";
import { getCached, putCached, sha256 } from "../cache";
import { isConfigured, loadConfig, providerOrigin, resolveLanguage, type Config } from "../config";
import { ext } from "../ext";
import { formatErrorMessage, getUiStrings } from "../i18n";
import type { ContentToPanel, ExtractResult, HighlightResult, PanelToContent } from "../messages";
import type { Analysis, Annotation } from "../schema";
import { labelDef, type Category } from "../taxonomy";

interface TabState {
  url: string | undefined;
  analysis: Analysis;
  unlocated: Set<string>;
  cachedAt?: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const analyzeBtn = $<HTMLButtonElement>("analyze");
const cancelBtn = $<HTMLButtonElement>("cancel");
const statusEl = $<HTMLParagraphElement>("status");
const resultEl = $<HTMLElement>("result");
const cardsEl = $<HTMLOListElement>("cards");
const filtersEl = $<HTMLElement>("filters");
const template = $<HTMLTemplateElement>("card-template");

const states = new Map<number, TabState>();
let config: Config | null = null;
let currentTabId: number | undefined;
let windowId: number | undefined;
let running: AbortController | null = null;
let activeCategoryFilter: "all" | Category = "all";

function strings() {
  return getUiStrings(config ?? undefined);
}

function currentLang(): string {
  return config ? resolveLanguage(config) : "fr";
}

function applyI18n(): void {
  const t = strings();
  const hasAnalysis = currentTabId !== undefined && states.has(currentTabId);
  analyzeBtn.textContent = hasAnalysis ? t.reanalyzeBtn : t.analyzeBtn;
  cancelBtn.textContent = t.cancelBtn;
  const optBtn = $("options");
  optBtn.title = t.optionsBtnTitle;
  optBtn.setAttribute("aria-label", t.optionsBtnTitle);
  const heading = $("summary-heading");
  if (heading) heading.textContent = t.summaryTitle;
  const privacy = $("privacy-footer");
  if (privacy) privacy.textContent = t.privacyNotice;
}

// ---------- Rendu ----------

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
  statusEl.hidden = !text;
}

function showIdle(): void {
  resultEl.hidden = true;
  cardsEl.replaceChildren();
  setStatus(strings().idleStatus);
  analyzeBtn.textContent = strings().analyzeBtn;
}

function renderCard(a: Annotation, unlocated: boolean): HTMLLIElement {
  const t = strings();
  const lang = currentLang();
  const li = (template.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
  const q = <T extends Element>(sel: string) => li.querySelector(sel) as T;
  li.dataset.id = a.id;
  li.classList.add(a.category, `severity-${a.severity}`);
  q<HTMLElement>(".badge").textContent = t.categories[a.category];
  q<HTMLElement>(".badge").classList.add(a.category);
  const def = labelDef(a.category, a.label, lang);
  q<HTMLElement>(".label").textContent = def?.name ?? a.label;
  if (def) q<HTMLElement>(".label").title = def.definition;
  q<HTMLElement>(".severity").textContent = t.severities[a.severity];
  q<HTMLElement>(".quote").textContent = a.exact_quote;
  const unlocatedEl = q<HTMLElement>(".unlocated");
  unlocatedEl.textContent = t.unlocatedQuote;
  unlocatedEl.hidden = !unlocated;
  q<HTMLElement>(".critique").textContent = a.rhetoric_critique;

  const fc = a.fact_check;
  const details = q<HTMLDetailsElement>(".fact-check");
  if (a.category !== "factual_claim" && !fc.context && fc.sources.length === 0) {
    details.remove();
  } else {
    const status = q<HTMLElement>(".fact-status");
    status.textContent = `${t.factCheckLabel} ${t.factStatuses[fc.status]}`;
    status.classList.add(`status-${fc.status}`);
    q<HTMLElement>(".fact-context").textContent = fc.context;
    const list = q<HTMLUListElement>(".sources");
    for (const s of fc.sources) {
      const link = document.createElement("a");
      link.href = s.url;
      link.textContent = s.title || new URL(s.url).hostname;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const item = document.createElement("li");
      item.append(link);
      list.append(item);
    }
  }

  const activate = () => {
    selectCard(a.id, false);
    if (!unlocated && currentTabId !== undefined) void send(currentTabId, { type: "focus", id: a.id });
  };
  li.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a, summary")) return;
    activate();
  });
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target === li) activate();
  });
  return li;
}

function applyCategoryFilter(cat: string): void {
  activeCategoryFilter = cat as "all" | Category;
  for (const btn of filtersEl.querySelectorAll<HTMLButtonElement>(".filter-btn")) {
    btn.classList.toggle("active", btn.dataset.category === cat);
  }
  for (const card of cardsEl.querySelectorAll<HTMLElement>(".card")) {
    if (card.classList.contains("empty")) continue;
    card.hidden = cat !== "all" && !card.classList.contains(cat);
  }
}

function updateFilterCounts(annotations: Annotation[]): void {
  const t = strings();
  const counts = {
    all: annotations.length,
    sophism: annotations.filter((a) => a.category === "sophism").length,
    bias: annotations.filter((a) => a.category === "bias").length,
    factual_claim: annotations.filter((a) => a.category === "factual_claim").length,
  };
  for (const btn of filtersEl.querySelectorAll<HTMLButtonElement>(".filter-btn")) {
    const cat = btn.dataset.category as keyof typeof counts;
    if (cat === "all") btn.textContent = `${t.filterAll} (${counts.all})`;
    else if (cat === "sophism") btn.textContent = `${t.categoriesPlural.sophism} (${counts.sophism})`;
    else if (cat === "bias") btn.textContent = `${t.categoriesPlural.bias} (${counts.bias})`;
    else if (cat === "factual_claim") btn.textContent = `${t.categoriesPlural.factual_claim} (${counts.factual_claim})`;
  }
}

function render(state: TabState): void {
  const t = strings();
  setStatus("");
  resultEl.hidden = false;
  $("summary").textContent = state.analysis.summary;
  const note = $("cache-note");
  note.hidden = state.cachedAt === undefined;
  if (state.cachedAt !== undefined) note.textContent = t.cacheNote(new Date(state.cachedAt).toLocaleString());
  analyzeBtn.textContent = t.reanalyzeBtn;

  updateFilterCounts(state.analysis.annotations);

  if (state.analysis.annotations.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty card";
    empty.textContent = t.emptyResults;
    cardsEl.replaceChildren(empty);
    return;
  }
  cardsEl.replaceChildren(...state.analysis.annotations.map((a) => renderCard(a, state.unlocated.has(a.id))));
  applyCategoryFilter(activeCategoryFilter);
}

function selectCard(id: string, scroll: boolean): void {
  for (const card of cardsEl.querySelectorAll<HTMLElement>(".card")) {
    const active = card.dataset.id === id;
    card.classList.toggle("active", active);
    if (active) {
      if (card.hidden) applyCategoryFilter("all");
      if (scroll) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
}

// ---------- Échanges avec la page ----------

function send<R>(tabId: number, msg: PanelToContent): Promise<R> {
  return ext.tabs.sendMessage(tabId, msg) as Promise<R>;
}

async function inject(tabId: number): Promise<void> {
  try {
    await ext.scripting.executeScript({ target: { tabId }, files: ["content-script.js"] });
    await ext.scripting.insertCSS({ target: { tabId }, files: ["highlights.css"] });
  } catch {
    throw new Error(strings().accessErrorStatus);
  }
}

// ---------- Analyse ----------

async function analyze(force: boolean): Promise<void> {
  const t = strings();
  if (!config || !isConfigured(config)) {
    setStatus(t.needConfigStatus, true);
    void ext.runtime.openOptionsPage();
    return;
  }
  const origin = providerOrigin(config);
  // Appelé avant tout await : la demande de permission exige le geste utilisateur.
  const permission = origin ? ext.permissions.request({ origins: [origin] }) : Promise.resolve(false);

  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const tabId = tab.id;
  currentTabId = tabId;

  running = new AbortController();
  analyzeBtn.disabled = true;
  cancelBtn.hidden = false;
  try {
    if (!(await permission)) throw new Error(t.apiPermissionError);
    setStatus(t.extractingStatus);
    await inject(tabId);
    const extracted = await send<ExtractResult>(tabId, { type: "extract" });
    if (!extracted.ok) {
      if (extracted.errorCode === "no_article") throw new Error(t.extractNoArticleError);
      if (extracted.errorCode === "empty_article") throw new Error(t.extractEmptyArticleError);
      throw new Error(extracted.error);
    }
    const article = extracted.article;

    const fingerprint = {
      textHash: await sha256(article.paragraphs.join("\n\n")),
      provider: config.provider,
      model: config.model,
      lang: resolveLanguage(config),
    };
    const cached = !force && tab.url ? await getCached(tab.url, fingerprint) : null;
    let analysis: Analysis;
    if (cached) {
      analysis = cached.analysis;
    } else {
      const streamedAnnotations: Annotation[] = [];
      cardsEl.replaceChildren();
      $("summary").textContent = "";
      $("cache-note").hidden = true;
      updateFilterCounts([]);

      analysis = await analyzeArticle(article, config, running.signal, {
        onProgress: ({ phase, done, total }) => {
          if (phase === "consolidating") {
            setStatus(t.consolidatingStatus);
          } else {
            setStatus(total > 1 ? t.analyzingPartStatus(done, total) : t.analyzingStatus);
          }
        },
        onSummary: (summary) => {
          resultEl.hidden = false;
          $("summary").textContent = summary;
        },
        onAnnotation: (a) => {
          resultEl.hidden = false;
          streamedAnnotations.push(a);
          const emptyCard = cardsEl.querySelector(".empty");
          if (emptyCard) emptyCard.remove();
          const card = renderCard(a, false);
          card.hidden = activeCategoryFilter !== "all" && !card.classList.contains(activeCategoryFilter);
          cardsEl.append(card);
          updateFilterCounts(streamedAnnotations);
        },
      });
      if (tab.url) await putCached(tab.url, { ...fingerprint, analysis, createdAt: Date.now() });
    }

    const { unlocated } = await send<HighlightResult>(tabId, {
      type: "highlight",
      annotations: analysis.annotations.map(({ id, exact_quote, category }) => ({ id, exact_quote, category })),
    });
    const state: TabState = { url: tab.url, analysis, unlocated: new Set(unlocated), cachedAt: cached?.createdAt };
    states.set(tabId, state);
    if (currentTabId === tabId) render(state);
  } catch (err) {
    cardsEl.replaceChildren();
    resultEl.hidden = true;
    updateFilterCounts([]);
    if (running.signal.aborted) setStatus(t.cancelledStatus);
    else setStatus(formatErrorMessage(err, t), true);
  } finally {
    running = null;
    analyzeBtn.disabled = false;
    cancelBtn.hidden = true;
  }
}

// ---------- Événements ----------

analyzeBtn.addEventListener("click", () => {
  const hasAnalysis = currentTabId !== undefined && states.has(currentTabId);
  void analyze(hasAnalysis);
});
cancelBtn.addEventListener("click", () => running?.abort());
filtersEl.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>(".filter-btn");
  if (btn?.dataset.category) applyCategoryFilter(btn.dataset.category);
});
$("options").addEventListener("click", () => void ext.runtime.openOptionsPage());

ext.runtime.onMessage.addListener((msg: ContentToPanel, sender) => {
  if (msg.type === "annotation-clicked" && sender.tab?.id === currentTabId) selectCard(msg.id, true);
  return false;
});

ext.tabs.onActivated.addListener(({ tabId, windowId: w }) => {
  if (w !== windowId || running) return;
  currentTabId = tabId;
  const state = states.get(tabId);
  if (state) render(state);
  else showIdle();
});

ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "loading") return;
  states.delete(tabId);
  if (tabId === currentTabId && !running) showIdle();
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) {
    void loadConfig().then((c) => {
      config = c;
      applyI18n();
      if (currentTabId) {
        const state = states.get(currentTabId);
        if (state) render(state);
      }
    });
  }
});

void (async () => {
  config = await loadConfig();
  applyI18n();
  windowId = (await ext.windows.getCurrent()).id;
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;
  if (!isConfigured(config)) setStatus(strings().needConfigStatus);
})();
