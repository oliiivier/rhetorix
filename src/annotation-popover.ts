// Bulle d'annotation dans la page (Shadow DOM), partagée par le content script des
// articles et celui de YouTube (titre de la vidéo, B3). Elle affiche une annotation,
// ou la liste des annotations d'ensemble ancrées sur le titre, avec la vérification
// en ligne à la demande (C2) et la contestation (Q4). Tout contenu issu du LLM ou de
// la page est inséré via textContent (jamais innerHTML).

import { renderEvidence, renderStudyFlags } from "./evidence-view";
import { getUiStrings, type UiStrings } from "./i18n";
import type { HighlightItem } from "./messages";
import { isVerifiable } from "./schema";
import { labelDef } from "./taxonomy";

/** État d'une annotation propre à la page : vérification en cours, échec, contestation. */
export interface EntryState {
  verifying?: boolean;
  error?: string;
  contested?: boolean;
}

export interface PopoverActions {
  /** Lance la vérification en ligne de l'annotation (C2). */
  onVerify?: (id: string) => void;
  /** Conteste l'annotation ou retire la contestation (Q4). */
  onContest?: (id: string, contested: boolean) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const STYLE = `
  :host { all: initial; }
  .popover {
    position: fixed;
    box-sizing: border-box;
    pointer-events: auto;
    width: max-content;
    max-width: min(390px, calc(100vw - 32px));
    max-height: min(70vh, 520px);
    overflow-y: auto;
    padding: 12px 14px;
    border-radius: 8px;
    background: #ffffff;
    color: #1c1f24;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.22), 0 1px 4px rgba(0, 0, 0, 0.12);
    border: 1px solid #dde1e6;
    border-left: 5px solid #5f6670;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 2147483647;
    display: none;
  }
  .popover.visible {
    display: block;
    opacity: 1;
    transform: translateY(0);
  }
  .popover.sophism { border-left-color: #c92a2a; }
  .popover.bias { border-left-color: #d9480f; }
  .popover.factual_claim { border-left-color: #1c64d1; }
  .popover.document { border-left-color: #7048e8; }

  @media (prefers-color-scheme: dark) {
    .popover {
      background: #1f2228;
      color: #e6e8eb;
      border-color: #343a42;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3);
    }
    .popover.sophism { border-left-color: #ff8787; }
    .popover.bias { border-left-color: #ffa94d; }
    .popover.factual_claim { border-left-color: #74c0fc; }
    .popover.document { border-left-color: #b197fc; }
  }

  .heading {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #7048e8;
  }
  @media (prefers-color-scheme: dark) {
    .heading { color: #b197fc; }
  }
  .entry + .entry {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #dde1e6;
  }
  @media (prefers-color-scheme: dark) {
    .entry + .entry { border-top-color: #343a42; }
  }

  .header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    color: #ffffff;
    background: #5f6670;
  }
  .badge.sophism { background: #c92a2a; }
  .badge.bias { background: #d9480f; }
  .badge.factual_claim { background: #1c64d1; }

  .label {
    font-weight: 600;
    font-size: 13px;
  }
  .severity, .confidence {
    font-size: 11px;
    font-weight: 600;
    color: #5f6670;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.06);
  }
  .severity { margin-left: auto; }
  .confidence { font-weight: 500; }
  .severity.severity-high {
    color: #c92a2a;
    background: rgba(201, 42, 42, 0.12);
  }
  @media (prefers-color-scheme: dark) {
    .severity, .confidence {
      background: rgba(255, 255, 255, 0.08);
      color: #9aa1ab;
    }
    .severity.severity-high {
      color: #ff8787;
      background: rgba(255, 135, 135, 0.2);
    }
  }

  .critique {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .fact-check {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #dde1e6;
    font-size: 12px;
  }
  @media (prefers-color-scheme: dark) {
    .fact-check { border-top-color: #343a42; }
  }

  .fact-status {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .status-refuted { background: #ffe3e3; color: #c92a2a; }
  .status-supported { background: #d3f9d8; color: #2b8a3e; }
  .status-misleading { background: #ffe8cc; color: #d9480f; }
  .status-unverified { background: #e9ecef; color: #495057; }

  @media (prefers-color-scheme: dark) {
    .status-refuted { background: #4a1515; color: #ff8787; }
    .status-supported { background: #13391b; color: #8ce99a; }
    .status-misleading { background: #4a240b; color: #ffa94d; }
    .status-unverified { background: #2b3038; color: #adb5bd; }
  }

  .fact-context {
    margin: 4px 0 6px 0;
    font-size: 12px;
    line-height: 1.4;
  }

  .sources {
    margin: 4px 0 0 0;
    padding-left: 16px;
    font-size: 11.5px;
  }
  .sources li { margin-bottom: 2px; }
  .sources a {
    color: #1c64d1;
    text-decoration: underline;
    word-break: break-all;
  }
  @media (prefers-color-scheme: dark) {
    .sources a { color: #74c0fc; }
  }

  .study-flag {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #e9ecef;
    color: #495057;
  }
  .study-flag.retracted, .study-flag.concern { background: #ffe3e3; color: #c92a2a; }
  .evidence { margin: 4px 0 6px 0; font-size: 12px; }
  .evidence-kind { display: block; color: #5f6670; }
  .evidence-record { color: #1c64d1; text-decoration: underline; overflow-wrap: anywhere; }
  @media (prefers-color-scheme: dark) {
    .study-flag { background: #2b3038; color: #adb5bd; }
    .study-flag.retracted, .study-flag.concern { background: #4a1515; color: #ff8787; }
    .evidence-kind { color: #9aa1ab; }
    .evidence-record { color: #74c0fc; }
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .action {
    font: inherit;
    font-size: 11.5px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #dde1e6;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .action:hover { background: rgba(0, 0, 0, 0.05); }
  .action:disabled { opacity: 0.6; cursor: default; }
  .action.contest { margin-left: auto; color: #5f6670; }
  @media (prefers-color-scheme: dark) {
    .action { border-color: #343a42; }
    .action:hover { background: rgba(255, 255, 255, 0.08); }
    .action.contest { color: #9aa1ab; }
  }
  .verify-note {
    font-size: 11.5px;
    color: #5f6670;
  }
  .verify-note.error { color: #c92a2a; }
  @media (prefers-color-scheme: dark) {
    .verify-note { color: #9aa1ab; }
    .verify-note.error { color: #ff8787; }
  }
  .contested-note {
    margin: 0;
    font-size: 12px;
    font-style: italic;
    color: #5f6670;
  }
  @media (prefers-color-scheme: dark) {
    .contested-note { color: #9aa1ab; }
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    box-sizing: border-box;
    max-width: calc(100vw - 32px);
    max-height: 60vh;
    overflow-y: auto;
    white-space: pre-line;
    padding: 10px 14px;
    border-radius: 8px;
    background: #1c1f24;
    color: #ffffff;
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
  }
  .toast.error { background: #c92a2a; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class AnnotationPopover {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private popover: HTMLElement | null = null;
  private toast: HTMLElement | null = null;
  private toastTimer: number | null = null;
  private range: Range | null = null;
  private items: HighlightItem[] = [];
  private heading: string | undefined;

  lang = "fr";
  canVerify = false;
  /** Identifiant de l'ancre affichée (annotation, ou titre pour les annotations d'ensemble). */
  anchorId: string | null = null;

  constructor(
    private readonly actions: PopoverActions,
    private readonly stateOf: (id: string) => EntryState,
  ) {}

  private ensure(): ShadowRoot {
    if (this.shadow) return this.shadow;
    const host = document.createElement("div");
    host.id = "rhetorix-popover-host";
    Object.assign(host.style, { position: "fixed", top: "0", left: "0", width: "0", height: "0", zIndex: "2147483647", pointerEvents: "none" });
    (document.body || document.documentElement).appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const popover = el("div", "popover");
    popover.addEventListener("mouseenter", () => this.actions.onMouseEnter?.());
    popover.addEventListener("mouseleave", () => this.actions.onMouseLeave?.());
    shadow.append(style, popover);
    this.host = host;
    this.shadow = shadow;
    this.popover = popover;
    return shadow;
  }

  get visible(): boolean {
    return Boolean(this.popover?.classList.contains("visible"));
  }

  /** Vrai si l'événement vient de la bulle ou du message bref. */
  contains(event: Event): boolean {
    const path = event.composedPath();
    return (this.popover !== null && path.includes(this.popover)) || (this.toast !== null && path.includes(this.toast));
  }

  /** Vrai si le point (coordonnées de la fenêtre) est dans la bulle visible. */
  containsPoint(x: number, y: number): boolean {
    if (!this.popover || !this.visible) return false;
    const r = this.popover.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /**
   * Affiche la bulle près de `range`. Une seule annotation, ou plusieurs sous un
   * intitulé (annotations d'ensemble, B3).
   */
  show(anchorId: string, range: Range, items: HighlightItem[], heading?: string): void {
    if (items.length === 0) return;
    this.ensure();
    this.anchorId = anchorId;
    this.range = range;
    this.items = items;
    this.heading = heading;
    this.render();
    this.reposition();
  }

  /** Remplace une annotation affichée (vérification terminée) et redessine la bulle. */
  update(item: HighlightItem): void {
    const i = this.items.findIndex((it) => it.id === item.id);
    if (i < 0) return;
    this.items[i] = item;
    if (this.visible) this.render();
  }

  /** Redessine la bulle visible (changement d'état : vérification, contestation). */
  refresh(): void {
    if (this.visible) this.render();
  }

  hide(): void {
    this.anchorId = null;
    this.range = null;
    if (this.popover) {
      this.popover.classList.remove("visible");
      this.popover.style.display = "none";
    }
  }

  reposition(): void {
    const popover = this.popover;
    const range = this.range;
    if (!popover || !range) return;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      this.hide();
      return;
    }
    popover.style.display = "block";
    popover.style.visibility = "hidden";
    const pRect = popover.getBoundingClientRect();
    const pWidth = pRect.width || 320;
    const pHeight = pRect.height || 180;
    const top = rect.top >= pHeight + 10 ? rect.top - pHeight - 8 : rect.bottom + 8;
    const left = Math.max(8, Math.min(rect.left + (rect.width - pWidth) / 2, window.innerWidth - pWidth - 8));
    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;
    popover.style.visibility = "visible";
    popover.classList.add("visible");
  }

  private render(): void {
    const popover = this.popover!;
    const t = getUiStrings(this.lang);
    const single = this.items.length === 1 && !this.heading;
    popover.className = `popover ${single ? this.items[0]!.category : "document"}${this.visible ? " visible" : ""}`;
    const children: HTMLElement[] = [];
    if (this.heading) children.push(el("p", "heading", this.heading));
    for (const item of this.items) children.push(this.renderEntry(item, t));
    popover.replaceChildren(...children);
  }

  private renderEntry(item: HighlightItem, t: UiStrings): HTMLElement {
    const state = this.stateOf(item.id);
    const entry = el("div", "entry");

    const header = el("div", "header");
    header.append(el("span", `badge ${item.category}`, t.categories[item.category]));
    const def = item.label ? labelDef(item.category, item.label, this.lang) : undefined;
    const label = el("span", "label", def?.name ?? item.label ?? "");
    if (def?.definition) label.title = def.definition;
    header.append(label);
    if (item.severity) header.append(el("span", `severity severity-${item.severity}`, t.severities[item.severity]));
    if (item.confidence && !state.contested) {
      const confidence = el("span", "confidence", t.confidences[item.confidence]);
      confidence.title = t.confidenceHint;
      header.append(confidence);
    }
    entry.append(header);

    if (state.contested) {
      entry.append(el("p", "contested-note", t.contestedNote));
      entry.append(this.renderActions(item, state, t));
      return entry;
    }

    if (item.rhetoric_critique) entry.append(el("p", "critique", item.rhetoric_critique));

    const fc = item.fact_check;
    if (fc && (item.category === "factual_claim" || fc.context || fc.sources.length > 0 || fc.evidence)) {
      const box = el("div", "fact-check");
      box.append(el("span", `fact-status status-${fc.status}`, `${t.factCheckLabel} ${t.factStatuses[fc.status]}`), ...renderStudyFlags(fc.evidence, t));
      if (fc.context) box.append(el("p", "fact-context", fc.context));
      const evidence = renderEvidence(fc.evidence, t);
      if (evidence) box.append(evidence);
      if (fc.sources.length > 0) {
        const list = el("ul", "sources");
        for (const s of fc.sources) {
          const a = document.createElement("a");
          a.href = s.url;
          a.textContent = s.title || new URL(s.url).hostname;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          const li = document.createElement("li");
          li.append(a);
          list.append(li);
        }
        box.append(list);
      }
      entry.append(box);
    }
    entry.append(this.renderActions(item, state, t));
    return entry;
  }

  private renderActions(item: HighlightItem, state: EntryState, t: UiStrings): HTMLElement {
    const actions = el("div", "actions");
    const verifiable =
      this.canVerify && this.actions.onVerify && item.fact_check && isVerifiable({ ...item, fact_check: item.fact_check });
    if (verifiable && !state.contested) {
      const verify = el("button", "action verify", state.verifying ? t.verifyingStatus : t.verifyBtn);
      verify.type = "button";
      verify.title = t.verifyBtnTitle;
      verify.disabled = Boolean(state.verifying);
      verify.addEventListener("click", (e) => {
        e.stopPropagation();
        this.actions.onVerify?.(item.id);
      });
      actions.append(verify);
      if (state.error && !state.verifying) actions.append(el("span", "verify-note error", state.error));
    }
    if (this.actions.onContest) {
      const contest = el("button", "action contest", state.contested ? t.uncontestBtn : t.contestBtn);
      contest.type = "button";
      contest.title = state.contested ? t.uncontestBtnTitle : t.contestBtnTitle;
      contest.addEventListener("click", (e) => {
        e.stopPropagation();
        this.actions.onContest?.(item.id, !state.contested);
      });
      actions.append(contest);
    }
    return actions;
  }

  // ---------- Message bref (mobile, sans panneau) ----------

  /** durationMs = 0 : le message reste affiché jusqu'au suivant ou jusqu'au toucher. */
  showToast(text: string, isError = false, durationMs = 0): void {
    const shadow = this.ensure();
    if (!this.toast) {
      this.toast = el("div", "toast");
      this.toast.setAttribute("role", "status");
      this.toast.hidden = true;
      this.toast.addEventListener("click", () => this.hideToast());
      shadow.append(this.toast);
    }
    this.toast.textContent = text;
    this.toast.classList.toggle("error", isError);
    this.toast.hidden = false;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = durationMs > 0 ? window.setTimeout(() => this.hideToast(), durationMs) : null;
  }

  hideToast(): void {
    if (this.toast) this.toast.hidden = true;
  }

  /** Retire l'hôte de la page (changement de vidéo, nettoyage). */
  destroy(): void {
    this.host?.remove();
    this.host = this.shadow = this.popover = this.toast = null;
    this.anchorId = this.range = null;
  }
}
