// Panneau latéral : vue de l'analyse de l'onglet actif, pilotée par le script de fond
// (D9). Il affiche les cartes et synchronise la sélection avec la page. Tout contenu
// issu du LLM ou de la page est inséré via textContent (jamais innerHTML).

import { isConfigured, loadConfig, providerOrigin, resolveLanguage, saveConfig, type Config, type DisplayMode } from "../config";
import { ext } from "../ext";
import { getUiStrings } from "../i18n";
import type { BackgroundToPanel, ContentToPanel, PanelToBackground, PanelToContent, RunSnapshot } from "../messages";
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
const modeSelect = $<HTMLSelectElement>("display-mode");
const statusEl = $<HTMLParagraphElement>("status");
const resultEl = $<HTMLElement>("result");
const cardsEl = $<HTMLOListElement>("cards");
const filtersEl = $<HTMLElement>("filters");
const template = $<HTMLTemplateElement>("card-template");

const states = new Map<number, TabState>();
let config: Config | null = null;
let currentTabId: number | undefined;
let windowId: number | undefined;
/** Onglets dont l'analyse est en cours dans le script de fond. */
const runningTabs = new Set<number>();
let activeCategoryFilter: "all" | Category = "all";

function strings() {
  return getUiStrings(config ?? undefined);
}

function currentLang(): string {
  return config ? resolveLanguage(config) : "fr";
}

function updateDisplayModeBanner(): void {
  const t = strings();
  const notice = $("inline-notice");
  if (!notice) return;
  if (config?.displayMode === "inline") {
    notice.textContent = t.inlineModeNotice;
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
}

function applyI18n(): void {
  const t = strings();
  const hasAnalysis = currentTabId !== undefined && states.has(currentTabId);
  analyzeBtn.textContent = hasAnalysis ? t.reanalyzeBtn : t.analyzeBtn;
  cancelBtn.textContent = t.cancelBtn;
  const optBtn = $("options");
  optBtn.title = t.optionsBtnTitle;
  optBtn.setAttribute("aria-label", t.optionsBtnTitle);
  const optBoth = $("opt-both");
  if (optBoth) optBoth.textContent = t.displayModes.both;
  const optInline = $("opt-inline");
  if (optInline) optInline.textContent = t.displayModes.inline;
  const optSidepanel = $("opt-sidepanel");
  if (optSidepanel) optSidepanel.textContent = t.displayModes.sidepanel;
  const heading = $("summary-heading");
  if (heading) heading.textContent = t.summaryTitle;
  const privacy = $("privacy-footer");
  if (privacy) privacy.textContent = t.privacyNotice;
  updateDisplayModeBanner();
}

// ---------- Rendu ----------

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
  statusEl.hidden = !text;
}

let currentTabUrl: string | undefined;

function isAnalyzableUrl(url?: string): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
}

function showIdle(isWebPage = true): void {
  resultEl.hidden = true;
  cardsEl.replaceChildren();
  if (isWebPage) {
    setStatus(strings().idleStatus);
    analyzeBtn.disabled = false;
  } else {
    setStatus(strings().internalPageNotice);
    analyzeBtn.disabled = true;
  }
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
  updateDisplayModeBanner();
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

// ---------- Échanges avec la page et le script de fond ----------

function send<R>(tabId: number, msg: PanelToContent): Promise<R> {
  return ext.tabs.sendMessage(tabId, msg) as Promise<R>;
}

function sendToBackground<R>(msg: PanelToBackground): Promise<R> {
  return ext.runtime.sendMessage(msg) as Promise<R>;
}

// ---------- Analyse ----------

function setRunningUi(running: boolean): void {
  analyzeBtn.disabled = running;
  cancelBtn.hidden = !running;
}

function analyze(force: boolean): void {
  const t = strings();
  if (!config || !isConfigured(config)) {
    setStatus(t.needConfigStatus, true);
    void ext.runtime.openOptionsPage();
    return;
  }
  const origins = ["https://*/*", "http://*/*"];
  const origin = providerOrigin(config);
  if (origin && !origins.includes(origin)) {
    origins.push(origin);
  }
  // Appelé avant tout await : la demande de permission exige le geste utilisateur.
  const permission = ext.permissions.request({ origins }).catch(() => false);

  void (async () => {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    currentTabId = tab.id;
    currentTabUrl = tab.url;

    if (!isAnalyzableUrl(tab.url)) {
      setStatus(t.internalPageNotice, true);
      analyzeBtn.disabled = true;
      return;
    }

    if (!(await permission)) {
      setStatus(t.apiPermissionError, true);
      return;
    }
    setRunningUi(true);
    await sendToBackground({ type: "analyze-tab", tabId: tab.id, force });
  })();
}

function statusText(s: RunSnapshot): string {
  const t = strings();
  if (s.phase === "extracting") return t.extractingStatus;
  if (s.phase === "consolidating") return t.consolidatingStatus;
  return s.total > 1 ? t.analyzingPartStatus(s.done, s.total) : t.analyzingStatus;
}

function toState(s: RunSnapshot): TabState {
  return {
    url: s.url,
    analysis: { summary: s.summary, annotations: s.annotations },
    unlocated: new Set(s.unlocated),
    cachedAt: s.cachedAt,
  };
}

/** Affiche l'état publié par le script de fond pour l'onglet courant. */
function renderSnapshot(s: RunSnapshot): void {
  const t = strings();
  setRunningUi(s.status === "running");
  switch (s.status) {
    case "running": {
      setStatus(statusText(s));
      if (s.phase === "extracting") {
        resultEl.hidden = true;
        cardsEl.replaceChildren();
        return;
      }
      resultEl.hidden = s.annotations.length === 0 && !s.summary;
      $("summary").textContent = s.summary;
      $("cache-note").hidden = true;
      // Ajout incrémental : seules les annotations nouvelles reçoivent une carte.
      const shown = new Set([...cardsEl.querySelectorAll<HTMLElement>(".card")].map((c) => c.dataset.id));
      for (const a of s.annotations) {
        if (shown.has(a.id)) continue;
        const card = renderCard(a, false);
        card.hidden = activeCategoryFilter !== "all" && !card.classList.contains(activeCategoryFilter);
        cardsEl.append(card);
      }
      updateFilterCounts(s.annotations);
      return;
    }
    case "done": {
      const state = toState(s);
      states.set(s.tabId, state);
      render(state);
      return;
    }
    case "error":
    case "cancelled":
      cardsEl.replaceChildren();
      resultEl.hidden = true;
      updateFilterCounts([]);
      if (s.status === "cancelled") setStatus(t.cancelledStatus);
      else setStatus(s.error ?? "", true);
      analyzeBtn.textContent = states.has(s.tabId) ? t.reanalyzeBtn : t.analyzeBtn;
      return;
  }
}

/** Onglet devenu courant : état mémorisé, sinon celui du script de fond, sinon repos. */
async function showTab(tabId: number): Promise<void> {
  const tab = await ext.tabs.get(tabId).catch(() => null);
  currentTabUrl = tab?.url;
  const isWebPage = isAnalyzableUrl(currentTabUrl);

  const state = states.get(tabId);
  if (state && !runningTabs.has(tabId)) {
    setRunningUi(false);
    render(state);
    return;
  }
  const snapshot = await sendToBackground<RunSnapshot | null>({ type: "get-state", tabId }).catch(() => null);
  if (tabId !== currentTabId) return;
  if (snapshot) renderSnapshot(snapshot);
  else {
    setRunningUi(false);
    showIdle(isWebPage);
  }
}

// ---------- Événements ----------

analyzeBtn.addEventListener("click", () => {
  const hasAnalysis = currentTabId !== undefined && states.has(currentTabId);
  analyze(hasAnalysis);
});
cancelBtn.addEventListener("click", () => {
  if (currentTabId !== undefined) void sendToBackground({ type: "cancel", tabId: currentTabId });
});
modeSelect.addEventListener("change", async () => {
  if (!config) return;
  const newMode = modeSelect.value as DisplayMode;
  config = { ...config, displayMode: newMode };
  await saveConfig(config);
  if (currentTabId !== undefined) {
    void send(currentTabId, { type: "set-display-mode", displayMode: newMode });
  }
  updateDisplayModeBanner();
});
filtersEl.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>(".filter-btn");
  if (btn?.dataset.category) applyCategoryFilter(btn.dataset.category);
});
$("options").addEventListener("click", () => void ext.runtime.openOptionsPage());

ext.runtime.onMessage.addListener((msg: ContentToPanel | BackgroundToPanel, sender) => {
  if (msg.type === "annotation-clicked" && sender.tab?.id === currentTabId) selectCard(msg.id, true);
  if (msg.type === "run-update") {
    const s = msg.snapshot;
    if (s.status === "running") runningTabs.add(s.tabId);
    else runningTabs.delete(s.tabId);
    if (s.tabId === currentTabId) renderSnapshot(s);
    else if (s.status === "done") states.set(s.tabId, toState(s));
  }
  return false;
});

ext.tabs.onActivated.addListener(({ tabId, windowId: w }) => {
  if (w !== windowId) return;
  currentTabId = tabId;
  void showTab(tabId);
});

ext.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId === currentTabId && (info.url || tab?.url)) {
    currentTabUrl = info.url || tab?.url;
  }
  if (info.status !== "loading") {
    if (tabId === currentTabId && !states.has(tabId) && !runningTabs.has(tabId)) {
      showIdle(isAnalyzableUrl(currentTabUrl));
    }
    return;
  }
  states.delete(tabId);
  runningTabs.delete(tabId);
  if (tabId === currentTabId) {
    setRunningUi(false);
    showIdle(isAnalyzableUrl(currentTabUrl));
  }
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) {
    void loadConfig().then((c) => {
      config = c;
      modeSelect.value = c.displayMode ?? "both";
      applyI18n();
      if (currentTabId !== undefined && !runningTabs.has(currentTabId)) {
        const state = states.get(currentTabId);
        if (state) render(state);
      }
    });
  }
});

void (async () => {
  config = await loadConfig();
  modeSelect.value = config.displayMode ?? "both";
  applyI18n();
  windowId = (await ext.windows.getCurrent()).id;
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;
  currentTabUrl = tab?.url;
  if (!isConfigured(config)) setStatus(strings().needConfigStatus);
  else if (currentTabId !== undefined) await showTab(currentTabId);
})();
