// Panneau latéral : vue de l'analyse de l'onglet actif, pilotée par le script de fond
// (D9). Il affiche les cartes et synchronise la sélection avec la page. Tout contenu
// issu du LLM ou de la page est inséré via textContent (jamais innerHTML).

import { isConfigured, loadConfig, providerOrigin, resolveLanguage, saveConfig, type Config, type DisplayMode } from "../config";
import { CONTESTED_KEY, contestKey, loadContested } from "../contested";
import { ext } from "../ext";
import { getUiStrings } from "../i18n";
import type { BackgroundToPanel, ContentToPanel, PanelToBackground, PanelToContent, RunSnapshot } from "../messages";
import { isDocumentLevel, isVerifiable, type Analysis, type Annotation } from "../schema";
import { renderEvidence, renderStudyFlags } from "../evidence-view";
import { labelDef, type Category } from "../taxonomy";
import { isYouTubeWatchUrl } from "../youtube/youtube-detector";
import { formatTimestamp } from "../youtube/youtube-transcript";
import type { VideoAnnotation } from "../youtube/types";
import { formatTokenCount, type TokenUsage } from "../tokens";

interface TabState {
  url: string | undefined;
  analysis: Analysis;
  unlocated: Set<string>;
  cachedAt?: number;
  stale?: boolean;
  /** Passages non analysés d'une analyse partielle (A3). */
  skipped?: string[];
  usage?: TokenUsage;
  /** Vérification à la demande possible, en cours, en échec (C2). */
  canVerify?: boolean;
  verifying?: string[];
  verifyErrors?: Record<string, string>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const analyzeBtn = $<HTMLButtonElement>("analyze");
const analyzeFullBtn = $<HTMLButtonElement>("analyze-full");
const cancelBtn = $<HTMLButtonElement>("cancel");
const modeSelect = $<HTMLSelectElement>("display-mode");
const statusEl = $<HTMLParagraphElement>("status");
const resultEl = $<HTMLElement>("result");
const cardsEl = $<HTMLOListElement>("cards");
const documentLevelEl = $<HTMLElement>("document-level");
const documentCardsEl = $<HTMLOListElement>("document-cards");
const filtersEl = $<HTMLElement>("filters");
const template = $<HTMLTemplateElement>("card-template");

const states = new Map<number, TabState>();
let config: Config | null = null;
let currentTabId: number | undefined;
let windowId: number | undefined;
/** Onglets dont l'analyse est en cours dans le script de fond. */
const runningTabs = new Set<number>();
let activeCategoryFilter: "all" | Category = "all";
/** Clés des annotations contestées (Q4). */
let contestedKeys = new Set<string>();

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
    const textEl = $("inline-notice-text");
    if (textEl) textEl.textContent = t.inlineModeNotice;
    const switchBtn = $<HTMLButtonElement>("switch-both-btn");
    if (switchBtn) switchBtn.textContent = t.switchBothBtn;
    const closeBtn = $<HTMLButtonElement>("close-sidebar-btn");
    if (closeBtn) closeBtn.textContent = t.closeSidebarBtn;
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
}

function applyI18n(): void {
  const t = strings();
  const hasAnalysis = currentTabId !== undefined && states.has(currentTabId);
  const isYouTube = Boolean(currentTabUrl && isYouTubeWatchUrl(currentTabUrl));

  if (isYouTube) {
    analyzeBtn.textContent = hasAnalysis ? t.youtubeChunkReadyBtn : t.youtubeAnalyzeChunkBtn;
    analyzeFullBtn.textContent = t.youtubeAnalyzeFullBtn;
    analyzeFullBtn.hidden = hasAnalysis;
  } else {
    analyzeBtn.textContent = hasAnalysis ? t.reanalyzeBtn : t.analyzeBtn;
    analyzeFullBtn.hidden = true;
  }
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
  const clickHeading = $("clickbait-heading");
  if (clickHeading) clickHeading.textContent = t.clickbaitHeading;
  const blindHeading = $("blind-spot-heading");
  if (blindHeading) blindHeading.textContent = t.blindSpotHeading;
  $("document-level-heading").textContent = t.documentLevelHeading;
  $("document-level-hint").textContent = t.documentLevelHint;
  const privacy = $("privacy-footer");
  if (privacy) privacy.textContent = t.privacyNotice;
  const tokenLbl = $("token-label");
  if (tokenLbl) tokenLbl.textContent = t.tokenUsageLabel;
  const tokenOptBtn = $("token-options-btn");
  if (tokenOptBtn) tokenOptBtn.title = t.tabTokens;
  const idleEl = $("token-idle");
  if (idleEl && !idleEl.hidden) idleEl.textContent = t.tokenIdle;
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
  documentCardsEl.replaceChildren();
  documentLevelEl.hidden = true;
  const cb = $("clickbait-banner");
  if (cb) cb.hidden = true;
  const bs = $("blind-spot-card");
  if (bs) bs.hidden = true;
  if (isWebPage) {
    setStatus(strings().idleStatus);
    analyzeBtn.disabled = false;
  } else {
    setStatus(strings().internalPageNotice);
    analyzeBtn.disabled = true;
  }
  renderTokenUsage(undefined);
  applyI18n();
}

function renderTokenUsage(usage: TokenUsage | undefined, isCached = false): void {
  const bar = $("token-bar");
  if (!bar) return;
  const t = strings();
  const lang = currentLang();

  const lbl = $("token-label");
  if (lbl) lbl.textContent = t.tokenUsageLabel;

  const inEl = $("token-in");
  const dotEl = $("token-dot");
  const outEl = $("token-out");
  const totalEl = $("token-total");
  const cachedEl = $("token-cached");
  const idleEl = $("token-idle");

  if (!usage) {
    if (inEl) inEl.textContent = "";
    if (dotEl) dotEl.hidden = true;
    if (outEl) outEl.textContent = "";
    if (totalEl) totalEl.textContent = "";
    if (isCached) {
      if (cachedEl) {
        cachedEl.textContent = t.tokenCached;
        cachedEl.hidden = false;
      }
      if (idleEl) idleEl.hidden = true;
    } else {
      if (cachedEl) cachedEl.hidden = true;
      if (idleEl) {
        idleEl.textContent = t.tokenIdle;
        idleEl.hidden = false;
      }
    }
    return;
  }

  if (idleEl) idleEl.hidden = true;

  if (isCached && usage.totalTokens === 0) {
    if (inEl) inEl.textContent = "";
    if (dotEl) dotEl.hidden = true;
    if (outEl) outEl.textContent = "";
    if (totalEl) totalEl.textContent = "";
    if (cachedEl) {
      cachedEl.textContent = t.tokenCached;
      cachedEl.hidden = false;
    }
  } else {
    if (dotEl) dotEl.hidden = false;
    if (inEl) inEl.textContent = t.tokenIn(formatTokenCount(usage.inputTokens, lang));
    if (outEl) outEl.textContent = t.tokenOut(formatTokenCount(usage.outputTokens, lang));
    if (totalEl) totalEl.textContent = t.tokenTotal(formatTokenCount(usage.totalTokens, lang));
    if (cachedEl) cachedEl.hidden = true;
  }
}

$("token-options-btn")?.addEventListener("click", () => {
  void ext.tabs.create({ url: ext.runtime.getURL("options.html#tokens") });
});

interface CardContext {
  unlocated: boolean;
  canVerify?: boolean;
  verifying?: boolean;
  verifyError?: string;
}

function isContested(a: Annotation): boolean {
  return Boolean(currentTabUrl && contestedKeys.has(contestKey(currentTabUrl, a)));
}

function renderCard(a: Annotation, ctx: CardContext): HTMLLIElement {
  const t = strings();
  const lang = currentLang();
  const unlocated = ctx.unlocated;
  const documentLevel = isDocumentLevel(a);
  const contested = isContested(a);
  const li = (template.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
  const q = <T extends Element>(sel: string) => li.querySelector(sel) as T;
  li.dataset.id = a.id;
  li.classList.add(a.category, `severity-${a.severity}`);
  li.classList.toggle("contested", contested);
  q<HTMLElement>(".badge").textContent = t.categories[a.category];
  q<HTMLElement>(".badge").classList.add(a.category);
  const def = labelDef(a.category, a.label, lang);
  q<HTMLElement>(".label").textContent = def?.name ?? a.label;
  if (def) q<HTMLElement>(".label").title = def.definition;
  q<HTMLElement>(".severity").textContent = t.severities[a.severity];
  const confidence = q<HTMLElement>(".confidence");
  if (a.confidence) {
    confidence.textContent = t.confidences[a.confidence];
    confidence.title = t.confidenceHint;
    confidence.hidden = false;
  }
  if (documentLevel) q<HTMLElement>(".quote").remove();
  else q<HTMLElement>(".quote").textContent = a.exact_quote;
  const unlocatedEl = q<HTMLElement>(".unlocated");
  unlocatedEl.textContent = t.unlocatedQuote;
  unlocatedEl.hidden = !unlocated || documentLevel;
  q<HTMLElement>(".critique").textContent = a.rhetoric_critique;

  const fc = a.fact_check;
  const details = q<HTMLDetailsElement>(".fact-check");
  if (a.category !== "factual_claim" && !fc.context && fc.sources.length === 0 && !fc.evidence) {
    details.remove();
  } else {
    const status = q<HTMLElement>(".fact-status");
    status.textContent = `${t.factCheckLabel} ${t.factStatuses[fc.status]}`;
    status.classList.add(`status-${fc.status}`);
    // D16 : rétractation et prépublication visibles sans déplier la vérification.
    status.after(...renderStudyFlags(fc.evidence, t));
    q<HTMLElement>(".fact-context").textContent = fc.context;
    const evidence = renderEvidence(fc.evidence, t);
    if (evidence) q<HTMLElement>(".fact-context").after(evidence);
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

  // C2 : vérification en ligne d'une allégation restée « non vérifiée ».
  const verifyBtn = q<HTMLButtonElement>(".verify");
  if (ctx.canVerify && isVerifiable(a) && !contested) {
    verifyBtn.hidden = false;
    verifyBtn.textContent = ctx.verifying ? t.verifyingStatus : t.verifyBtn;
    verifyBtn.title = t.verifyBtnTitle;
    verifyBtn.disabled = Boolean(ctx.verifying);
    verifyBtn.addEventListener("click", () => {
      if (currentTabId !== undefined) void sendToBackground({ type: "verify-annotation", tabId: currentTabId, id: a.id });
    });
    const note = q<HTMLElement>(".verify-note");
    if (ctx.verifyError && !ctx.verifying) {
      note.textContent = ctx.verifyError;
      note.hidden = false;
    }
  }

  // Q4 : contestation ; la carte est alors repliée.
  const contestBtn = q<HTMLButtonElement>(".contest");
  contestBtn.textContent = contested ? t.uncontestBtn : t.contestBtn;
  contestBtn.title = contested ? t.uncontestBtnTitle : t.contestBtnTitle;
  contestBtn.addEventListener("click", () => {
    if (currentTabId !== undefined) void sendToBackground({ type: "contest-annotation", tabId: currentTabId, id: a.id, contested: !contested });
  });
  const contestedNote = q<HTMLElement>(".contested-note");
  contestedNote.textContent = t.contestedNote;
  contestedNote.hidden = !contested;

  const va = a as VideoAnnotation;
  const timeBadge = q<HTMLElement>(".time-badge");
  if (timeBadge && va.startTime !== undefined && va.startTime >= 0) {
    timeBadge.textContent = t.youtubeTimeBadge(formatTimestamp(va.startTime));
    timeBadge.hidden = false;
    timeBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      activate();
    });
  } else if (timeBadge) {
    timeBadge.hidden = true;
  }

  const activate = () => {
    selectCard(a.id, false);
    if (va.startTime !== undefined && va.startTime >= 0 && currentTabId !== undefined) {
      void send(currentTabId, { type: "youtube-seek", timeSec: va.startTime, autoPlay: true });
    } else if (!unlocated && !(documentLevel && va.startTime !== undefined) && currentTabId !== undefined) {
      void send(currentTabId, { type: "focus", id: a.id });
    }
  };
  li.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a, summary, button")) return;
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

function updateFilterCounts(all: Annotation[]): void {
  const t = strings();
  const annotations = all.filter((a) => !isDocumentLevel(a));
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

  const cbBanner = $("clickbait-banner");
  if (cbBanner) {
    if (state.analysis.clickbait_gap) {
      const heading = $("clickbait-heading");
      if (heading) heading.textContent = t.clickbaitHeading;
      $("clickbait-text").textContent = state.analysis.clickbait_gap;
      cbBanner.hidden = false;
    } else {
      cbBanner.hidden = true;
    }
  }

  const bsCard = $("blind-spot-card");
  if (bsCard) {
    if (state.analysis.blind_spot) {
      const heading = $("blind-spot-heading");
      if (heading) heading.textContent = t.blindSpotHeading;
      $("blind-spot-text").textContent = state.analysis.blind_spot;
      bsCard.hidden = false;
    } else {
      bsCard.hidden = true;
    }
  }

  const note = $("cache-note");
  note.hidden = state.cachedAt === undefined;
  note.classList.toggle("stale", Boolean(state.stale));
  if (state.cachedAt !== undefined) {
    const date = new Date(state.cachedAt).toLocaleString();
    note.textContent = state.stale ? t.staleCacheNote(date) : t.cacheNote(date);
  }
  renderPartialNote(state.skipped);
  analyzeBtn.textContent = t.reanalyzeBtn;

  updateFilterCounts(state.analysis.annotations);

  const ctx = (a: Annotation): CardContext => ({
    unlocated: state.unlocated.has(a.id),
    canVerify: state.canVerify,
    verifying: state.verifying?.includes(a.id),
    verifyError: state.verifyErrors?.[a.id],
  });
  const overall = state.analysis.annotations.filter(isDocumentLevel);
  const passages = state.analysis.annotations.filter((a) => !isDocumentLevel(a));
  documentCardsEl.replaceChildren(...overall.map((a) => renderCard(a, ctx(a))));
  documentLevelEl.hidden = overall.length === 0;

  if (passages.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty card";
    empty.textContent = t.emptyResults;
    cardsEl.replaceChildren(empty);
    if (overall.length > 0) empty.hidden = true;
    renderTokenUsage(state.usage, Boolean(state.cachedAt));
    return;
  }
  cardsEl.replaceChildren(...passages.map((a) => renderCard(a, ctx(a))));
  applyCategoryFilter(activeCategoryFilter);
  renderTokenUsage(state.usage, Boolean(state.cachedAt));
  updateDisplayModeBanner();
}

function renderPartialNote(skipped: string[] | undefined): void {
  const note = $("partial-note");
  note.hidden = !skipped?.length;
  if (!skipped?.length) return;
  $("partial-text").textContent = strings().partialNote(skipped.length);
  $("partial-list").replaceChildren(
    ...skipped.map((excerpt) => {
      const li = document.createElement("li");
      li.textContent = `« ${excerpt} »`;
      return li;
    }),
  );
}

function selectCard(id: string, scroll: boolean): void {
  for (const card of [...cardsEl.querySelectorAll<HTMLElement>(".card"), ...documentCardsEl.querySelectorAll<HTMLElement>(".card")]) {
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

function analyzeYouTube(isFull: boolean): void {
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
  const permission = ext.permissions.request({ origins }).catch(() => false);

  void (async () => {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    currentTabId = tab.id;
    currentTabUrl = tab.url;

    if (!(await permission)) {
      setStatus(t.apiPermissionError, true);
      return;
    }
    setRunningUi(true);
    if (isFull) {
      await sendToBackground({ type: "analyze-youtube-full", tabId: tab.id, force: true });
    } else {
      await sendToBackground({ type: "analyze-youtube-chunk", tabId: tab.id, startSec: 0, force: true });
    }
  })();
}

function statusText(s: RunSnapshot): string {
  const t = strings();
  if (s.retrying) return t.retryingStatus;
  if (s.isVideo && s.phase === "analyzing") {
    if (s.videoChunkRange) {
      return t.youtubeAnalyzingChunkStatus(
        formatTimestamp(s.videoChunkRange.startSec),
        formatTimestamp(s.videoChunkRange.endSec),
      );
    }
    return t.youtubeAnalyzingFullStatus;
  }
  if (s.phase === "extracting") return t.extractingStatus;
  if (s.phase === "consolidating") return t.consolidatingStatus;
  if (s.phase === "mapping") return t.mappingStatus;
  if (s.phase === "reviewing") return t.reviewingStatus;
  if (s.phase === "studies") return t.studiesStatus;
  return s.total > 1 ? t.analyzingPartStatus(s.done, s.total) : t.analyzingStatus;
}

function toState(s: RunSnapshot): TabState {
  return {
    url: s.url,
    analysis: {
      summary: s.summary,
      clickbait_gap: s.clickbaitGap,
      blind_spot: s.blindSpot,
      annotations: s.annotations,
    },
    unlocated: new Set(s.unlocated),
    cachedAt: s.cachedAt,
    stale: s.stale,
    skipped: s.skipped,
    usage: s.usage,
    canVerify: s.canVerify,
    verifying: s.verifying,
    verifyErrors: s.verifyErrors,
  };
}

/** Affiche l'état publié par le script de fond pour l'onglet courant. */
function renderSnapshot(s: RunSnapshot): void {
  const t = strings();
  setRunningUi(s.status === "running");
  switch (s.status) {
    case "running": {
      setStatus(statusText(s));
      renderTokenUsage(s.usage, false);
      if (s.phase === "extracting") {
        resultEl.hidden = true;
        cardsEl.replaceChildren();
        documentCardsEl.replaceChildren();
        documentLevelEl.hidden = true;
        const cb = $("clickbait-banner");
        if (cb) cb.hidden = true;
        const bs = $("blind-spot-card");
        if (bs) bs.hidden = true;
        return;
      }
      resultEl.hidden = s.annotations.length === 0 && !s.summary;
      $("summary").textContent = s.summary;
      const cbBanner = $("clickbait-banner");
      if (cbBanner) {
        if (s.clickbaitGap) {
          const heading = $("clickbait-heading");
          if (heading) heading.textContent = t.clickbaitHeading;
          $("clickbait-text").textContent = s.clickbaitGap;
          cbBanner.hidden = false;
        } else {
          cbBanner.hidden = true;
        }
      }
      const bsCard = $("blind-spot-card");
      if (bsCard) {
        if (s.blindSpot) {
          const heading = $("blind-spot-heading");
          if (heading) heading.textContent = t.blindSpotHeading;
          $("blind-spot-text").textContent = s.blindSpot;
          bsCard.hidden = false;
        } else {
          bsCard.hidden = true;
        }
      }
      $("cache-note").hidden = true;
      $("partial-note").hidden = true;
      // Ajout incrémental : seules les annotations nouvelles reçoivent une carte.
      const shown = new Set(
        [...cardsEl.querySelectorAll<HTMLElement>(".card"), ...documentCardsEl.querySelectorAll<HTMLElement>(".card")].map((c) => c.dataset.id),
      );
      for (const a of s.annotations) {
        if (shown.has(a.id)) continue;
        const card = renderCard(a, { unlocated: false });
        if (isDocumentLevel(a)) {
          documentCardsEl.append(card);
          documentLevelEl.hidden = false;
          continue;
        }
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
      // A3 : les annotations reçues avant l'échec ou l'annulation restent affichées.
      if (s.annotations.length > 0) {
        const state = toState(s);
        states.set(s.tabId, state);
        render(state);
        if (s.status === "cancelled") setStatus(t.cancelledStatus);
        else setStatus(s.error ?? "", true);
        return;
      }
      cardsEl.replaceChildren();
      documentCardsEl.replaceChildren();
      documentLevelEl.hidden = true;
      resultEl.hidden = true;
      const cb = $("clickbait-banner");
      if (cb) cb.hidden = true;
      const bs = $("blind-spot-card");
      if (bs) bs.hidden = true;
      updateFilterCounts([]);
      renderTokenUsage(s.usage);
      if (s.status === "cancelled") setStatus(t.cancelledStatus);
      else setStatus(s.error ?? "", true);
      applyI18n();
      return;
  }
}

/** Onglet devenu courant : état mémorisé, sinon celui du script de fond, sinon repos. */
async function showTab(tabId: number): Promise<void> {
  const tab = await ext.tabs.get(tabId).catch(() => null);
  currentTabUrl = tab?.url;
  applyI18n();
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
  const isYouTube = Boolean(currentTabUrl && isYouTubeWatchUrl(currentTabUrl));
  if (isYouTube) {
    const hasAnalysis = currentTabId !== undefined && states.has(currentTabId);
    analyzeYouTube(hasAnalysis);
  } else {
    const hasAnalysis = currentTabId !== undefined && states.has(currentTabId);
    analyze(hasAnalysis);
  }
});
analyzeFullBtn?.addEventListener("click", () => {
  analyzeYouTube(true);
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
  if (newMode === "inline") {
    void sendToBackground({ type: "close-sidebar" });
    window.close();
  }
});
$("switch-both-btn")?.addEventListener("click", async () => {
  if (!config) return;
  config = { ...config, displayMode: "both" };
  await saveConfig(config);
  modeSelect.value = "both";
  if (currentTabId !== undefined) {
    void send(currentTabId, { type: "set-display-mode", displayMode: "both" });
  }
  updateDisplayModeBanner();
});
$("close-sidebar-btn")?.addEventListener("click", () => {
  void sendToBackground({ type: "close-sidebar" });
  window.close();
});
filtersEl.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>(".filter-btn");
  if (btn?.dataset.category) applyCategoryFilter(btn.dataset.category);
});
$("options").addEventListener("click", () => void ext.runtime.openOptionsPage());

ext.runtime.onMessage.addListener((msg: ContentToPanel | BackgroundToPanel, sender) => {
  if (msg.type === "annotation-clicked" && currentTabId !== undefined && sender.tab?.id === currentTabId) selectCard(msg.id, true);
  if (msg.type === "youtube-time-update" && currentTabId !== undefined && sender.tab?.id === currentTabId) {
    const currentTime = msg.currentTime;
    const state = states.get(currentTabId);
    if (state) {
      const activeAnn = state.analysis.annotations.find((a) => {
        const va = a as VideoAnnotation;
        return (
          va.startTime !== undefined &&
          va.startTime >= 0 &&
          currentTime >= va.startTime &&
          currentTime <= Math.max(va.endTime, va.startTime + 6)
        );
      });
      if (activeAnn) {
        selectCard(activeAnn.id, false);
      }
    }
  }
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
    applyI18n();
  }
  if (info.status !== "loading") {
    if (tabId === currentTabId && !states.has(tabId) && !runningTabs.has(tabId)) {
      void showTab(tabId);
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

async function refreshContested(): Promise<void> {
  contestedKeys = new Set((await loadContested()).map((e) => e.key));
  if (currentTabId !== undefined && !runningTabs.has(currentTabId)) {
    const state = states.get(currentTabId);
    if (state) render(state);
  }
}

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CONTESTED_KEY]) void refreshContested();
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
  contestedKeys = new Set((await loadContested()).map((e) => e.key));
  modeSelect.value = config.displayMode ?? "both";
  applyI18n();
  windowId = (await ext.windows.getCurrent()).id;
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;
  currentTabUrl = tab?.url;
  if (!isConfigured(config)) {
    setStatus(strings().needConfigStatus);
    renderTokenUsage(undefined);
  } else if (currentTabId !== undefined) {
    await showTab(currentTabId);
  }
})();
