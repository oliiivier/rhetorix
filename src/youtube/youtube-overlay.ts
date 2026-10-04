// Overlay In-Player Shadow DOM et marqueurs de barre de progression YouTube.
// Conçu pour fonctionner de manière transparente en mode normal, cinéma et plein écran.

import { labelDef } from "../taxonomy";
import type { TimeRange } from "./youtube-player";
import { formatTimestamp } from "./youtube-transcript";
import type { VideoAnnotation } from "./types";

const OVERLAY_HOST_ID = "rhetorix-yt-overlay-host";
const STORAGE_KEY_POS = "rhetorix_yt_overlay_pos";

export interface OverlayCallbacks {
  onClose?: () => void;
  onResumeClick?: () => void;
  onMarkerClick?: (startTime: number) => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

export class YouTubeOverlay {
  private playerContainer: HTMLElement | null = null;
  private hostEl: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private bubbleEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private markersContainer: HTMLElement | null = null;

  private callbacks: OverlayCallbacks = {};
  private currentLang = "fr";
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private initialLeft = 0;
  private initialTop = 0;

  constructor(callbacks?: OverlayCallbacks, lang = "fr") {
    if (callbacks) this.callbacks = callbacks;
    this.currentLang = lang;
  }

  public attach(playerContainer: HTMLElement): void {
    this.detach();
    this.playerContainer = playerContainer;

    // Création de l'hôte et du Shadow Root
    this.hostEl = document.createElement("div");
    this.hostEl.id = OVERLAY_HOST_ID;
    this.hostEl.style.position = "absolute";
    this.hostEl.style.top = "0";
    this.hostEl.style.left = "0";
    this.hostEl.style.width = "100%";
    this.hostEl.style.height = "100%";
    this.hostEl.style.pointerEvents = "none";
    this.hostEl.style.zIndex = "60"; // Au-dessus de la vidéo, en dessous des contrôles natifs masqués

    this.shadow = this.hostEl.attachShadow({ mode: "open" });
    this.buildStyles();
    this.buildBubble();
    this.buildToast();

    this.playerContainer.appendChild(this.hostEl);

    // Initialiser les marqueurs sur la barre de progression
    this.initScrubberMarkers();
  }

  public detach(): void {
    this.clearMarkers();
    if (this.hostEl) {
      this.hostEl.remove();
      this.hostEl = null;
      this.shadow = null;
      this.bubbleEl = null;
      this.toastEl = null;
    }
    this.playerContainer = null;
  }

  private buildStyles(): void {
    if (!this.shadow) return;
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      .bubble {
        position: absolute;
        width: 320px;
        max-width: calc(100% - 32px);
        background: rgba(18, 20, 24, 0.95);
        color: #f1f3f5;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-left: 4px solid #4dabf7;
        padding: 12px;
        font-size: 13px;
        line-height: 1.4;
        pointer-events: auto;
        user-select: none;
        box-sizing: border-box;
        display: none;
        transition: opacity 0.15s ease;
      }

      .bubble.visible {
        display: block;
      }

      .bubble.sophism { border-left-color: #fa5252; }
      .bubble.bias { border-left-color: #fd7e14; }
      .bubble.factual_claim { border-left-color: #339af0; }

      .header {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: grab;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 8px;
      }

      .header:active {
        cursor: grabbing;
      }

      .handle {
        color: #868e96;
        font-size: 12px;
      }

      .badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        color: #fff;
      }
      .badge.sophism { background: #e03131; }
      .badge.bias { background: #e8590c; }
      .badge.factual_claim { background: #1971c2; }

      .label {
        font-weight: 600;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12.5px;
      }

      .time {
        font-size: 11px;
        color: #adb5bd;
        font-family: monospace;
      }

      .close-btn {
        background: none;
        border: none;
        color: #adb5bd;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 14px;
        border-radius: 4px;
      }
      .close-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
      }

      .quote {
        font-style: italic;
        color: #dee2e6;
        margin: 6px 0;
        font-size: 12px;
        border-left: 2px solid rgba(255, 255, 255, 0.2);
        padding-left: 8px;
      }

      .critique {
        margin: 6px 0;
        color: #f8f9fa;
        font-size: 12px;
      }

      .fact-check {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px dashed rgba(255, 255, 255, 0.15);
        font-size: 11.5px;
      }

      .fact-status {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10.5px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .status-refuted { background: #4a1515; color: #ff8787; }
      .status-supported { background: #13391b; color: #8ce99a; }
      .status-misleading { background: #4a240b; color: #ffa94d; }
      .status-unverified { background: #2b3038; color: #adb5bd; }

      .sources a {
        color: #74c0fc;
        text-decoration: underline;
        font-size: 11px;
        word-break: break-all;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 11.5px;
      }

      .resume-btn {
        background: #228be6;
        color: #fff;
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .resume-btn:hover { background: #1c7ed6; }

      .countdown {
        color: #ffd43b;
        font-size: 11.5px;
        font-weight: 600;
      }

      /* Toast de notification */
      .toast {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(33, 37, 41, 0.92);
        color: #f8f9fa;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.15);
        display: none;
        pointer-events: auto;
      }
      .toast.visible {
        display: block;
      }
    `;
    this.shadow.appendChild(style);
  }

  private buildBubble(): void {
    if (!this.shadow) return;
    this.bubbleEl = document.createElement("div");
    this.bubbleEl.className = "bubble";

    // Positionnement par défaut : haut droit
    this.restoreOrSetDefaultPosition();

    // Gestion du survol pour suspendre le compte à rebours
    this.bubbleEl.addEventListener("pointerenter", () => this.callbacks.onHoverStart?.());
    this.bubbleEl.addEventListener("pointerleave", () => this.callbacks.onHoverEnd?.());

    this.shadow.appendChild(this.bubbleEl);
  }

  private buildToast(): void {
    if (!this.shadow) return;
    this.toastEl = document.createElement("div");
    this.toastEl.className = "toast";
    this.shadow.appendChild(this.toastEl);
  }

  private restoreOrSetDefaultPosition(): void {
    if (!this.bubbleEl) return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_POS);
      if (saved) {
        const { left, top } = JSON.parse(saved) as { left: number; top: number };
        this.bubbleEl.style.left = `${left}px`;
        this.bubbleEl.style.top = `${top}px`;
        this.bubbleEl.style.right = "auto";
        return;
      }
    } catch {}

    // Par défaut : coin supérieur droit
    this.bubbleEl.style.top = "16px";
    this.bubbleEl.style.right = "16px";
    this.bubbleEl.style.left = "auto";
  }

  public showAnnotation(ann: VideoAnnotation, autoPaused = false): void {
    if (!this.bubbleEl) return;

    this.bubbleEl.className = `bubble visible ${ann.category}`;
    this.bubbleEl.replaceChildren();

    // En-tête avec poignée de déplacement
    const header = document.createElement("div");
    header.className = "header";

    const handle = document.createElement("span");
    handle.className = "handle";
    handle.textContent = "⋮⋮";

    const badge = document.createElement("span");
    badge.className = `badge ${ann.category}`;
    badge.textContent = ann.category === "sophism" ? "Sophisme" : ann.category === "bias" ? "Biais" : "Fait";

    const def = labelDef(ann.category, ann.label, this.currentLang);
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = def?.name ?? ann.label;
    if (def?.definition) label.title = def.definition;

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = `[${formatTimestamp(ann.startTime)}]`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "✕";
    closeBtn.title = "Fermer";
    closeBtn.addEventListener("click", () => {
      this.hide();
      this.callbacks.onClose?.();
    });

    header.append(handle, badge, label, time, closeBtn);

    // Initialisation du drag & drop sur l'en-tête
    this.initDragAndDrop(header);

    // Citation
    const quote = document.createElement("div");
    quote.className = "quote";
    quote.textContent = `« ${ann.exact_quote} »`;

    // Critique
    const critique = document.createElement("div");
    critique.className = "critique";
    critique.textContent = ann.rhetoric_critique;

    this.bubbleEl.append(header, quote, critique);

    // Fact-check optionnel
    if (ann.category === "factual_claim" || ann.fact_check.context || ann.fact_check.sources.length > 0) {
      const fc = document.createElement("div");
      fc.className = "fact-check";
      const fcStatus = document.createElement("span");
      fcStatus.className = `fact-status status-${ann.fact_check.status}`;
      fcStatus.textContent = ann.fact_check.status;
      fc.appendChild(fcStatus);

      if (ann.fact_check.context) {
        const fcContext = document.createElement("div");
        fcContext.textContent = ann.fact_check.context;
        fc.appendChild(fcContext);
      }

      if (ann.fact_check.sources.length > 0) {
        const sources = document.createElement("div");
        sources.className = "sources";
        for (const s of ann.fact_check.sources) {
          const a = document.createElement("a");
          a.href = s.url;
          a.textContent = s.title || s.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          sources.appendChild(a);
        }
        fc.appendChild(sources);
      }

      this.bubbleEl.appendChild(fc);
    }

    // Pied avec bouton Reprendre si autoPaused
    if (autoPaused) {
      const footer = document.createElement("div");
      footer.className = "footer";

      const countdown = document.createElement("span");
      countdown.className = "countdown";
      countdown.id = "rhetorix-countdown";

      const resumeBtn = document.createElement("button");
      resumeBtn.className = "resume-btn";
      resumeBtn.textContent = "▶ Reprendre";
      resumeBtn.addEventListener("click", () => {
        this.callbacks.onResumeClick?.();
      });

      footer.append(countdown, resumeBtn);
      this.bubbleEl.appendChild(footer);
    }
  }

  public updateCountdown(secondsRemaining: number): void {
    if (!this.shadow) return;
    const el = this.shadow.getElementById("rhetorix-countdown");
    if (el) {
      el.textContent = secondsRemaining > 0 ? `Reprise dans ${secondsRemaining}s...` : "";
    }
  }

  public hide(): void {
    if (this.bubbleEl) {
      this.bubbleEl.classList.remove("visible");
      this.bubbleEl.replaceChildren();
    }
  }

  public showToast(text: string, durationMs = 3000): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add("visible");
    setTimeout(() => {
      this.toastEl?.classList.remove("visible");
    }, durationMs);
  }

  // ---------- Drag & Drop ----------

  private initDragAndDrop(handleEl: HTMLElement): void {
    handleEl.addEventListener("pointerdown", (e: PointerEvent) => {
      if (!this.bubbleEl || !this.playerContainer) return;
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = this.bubbleEl.getBoundingClientRect();
      const parentRect = this.playerContainer.getBoundingClientRect();

      this.initialLeft = rect.left - parentRect.left;
      this.initialTop = rect.top - parentRect.top;

      this.bubbleEl.style.right = "auto";
      this.bubbleEl.style.left = `${this.initialLeft}px`;
      this.bubbleEl.style.top = `${this.initialTop}px`;

      const onPointerMove = (ev: PointerEvent) => {
        if (!this.isDragging || !this.bubbleEl || !this.playerContainer) return;

        const dx = ev.clientX - this.dragStartX;
        const dy = ev.clientY - this.dragStartY;

        const parentW = this.playerContainer.clientWidth;
        const parentH = this.playerContainer.clientHeight;
        const bubbleW = this.bubbleEl.offsetWidth;
        const bubbleH = this.bubbleEl.offsetHeight;

        let newLeft = this.initialLeft + dx;
        let newTop = this.initialTop + dy;

        // Contrainte dans les limites du lecteur
        newLeft = Math.max(8, Math.min(parentW - bubbleW - 8, newLeft));
        newTop = Math.max(8, Math.min(parentH - bubbleH - 8, newTop));

        this.bubbleEl.style.left = `${newLeft}px`;
        this.bubbleEl.style.top = `${newTop}px`;
      };

      const onPointerUp = () => {
        if (this.isDragging && this.bubbleEl) {
          this.isDragging = false;
          // Sauvegarder la position
          const left = parseInt(this.bubbleEl.style.left, 10);
          const top = parseInt(this.bubbleEl.style.top, 10);
          try {
            sessionStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ left, top }));
          } catch {}
        }
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });
  }

  // ---------- Marqueurs sur la barre de progression native ----------

  private initScrubberMarkers(): void {
    const progressBar = document.querySelector(".ytp-progress-bar");
    if (!progressBar) return;

    let markerLayer = progressBar.querySelector(".rhetorix-marker-layer") as HTMLElement | null;
    if (!markerLayer) {
      markerLayer = document.createElement("div");
      markerLayer.className = "rhetorix-marker-layer";
      markerLayer.style.position = "absolute";
      markerLayer.style.top = "0";
      markerLayer.style.left = "0";
      markerLayer.style.width = "100%";
      markerLayer.style.height = "100%";
      markerLayer.style.pointerEvents = "none";
      progressBar.appendChild(markerLayer);
    }
    this.markersContainer = markerLayer;
  }

  public renderTimelineMarkers(
    annotations: VideoAnnotation[],
    analyzedRanges: TimeRange[],
    totalDurationSec: number,
  ): void {
    if (!this.markersContainer || totalDurationSec <= 0) return;
    this.markersContainer.replaceChildren();

    // 1. Bandes d'arrière-plan pour les zones analysées
    for (const range of analyzedRanges) {
      const zoneEl = document.createElement("div");
      zoneEl.className = "rhetorix-analyzed-zone";
      const leftPct = (range.startSec / totalDurationSec) * 100;
      const widthPct = ((range.endSec - range.startSec) / totalDurationSec) * 100;

      zoneEl.style.position = "absolute";
      zoneEl.style.left = `${leftPct}%`;
      zoneEl.style.width = `${widthPct}%`;
      zoneEl.style.height = "100%";
      zoneEl.style.background = "rgba(77, 171, 247, 0.25)";
      zoneEl.style.pointerEvents = "none";
      this.markersContainer.appendChild(zoneEl);
    }

    // 2. Marqueurs ponctuels d'annotations
    for (const ann of annotations) {
      if (ann.startTime < 0) continue;

      const marker = document.createElement("div");
      marker.className = `rhetorix-scrubber-marker ${ann.category}`;
      const leftPct = (ann.startTime / totalDurationSec) * 100;

      marker.style.position = "absolute";
      marker.style.left = `${leftPct}%`;
      marker.style.width = "4px";
      marker.style.height = "100%";
      marker.style.top = "0";
      marker.style.pointerEvents = "auto";
      marker.style.cursor = "pointer";
      marker.style.zIndex = "10";

      if (ann.category === "sophism") marker.style.background = "#fa5252";
      else if (ann.category === "bias") marker.style.background = "#fd7e14";
      else marker.style.background = "#339af0";

      const def = labelDef(ann.category, ann.label, this.currentLang);
      marker.title = `[${formatTimestamp(ann.startTime)}] ${def?.name ?? ann.label} : ${ann.exact_quote}`;

      marker.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onMarkerClick?.(ann.startTime);
      });

      this.markersContainer.appendChild(marker);
    }
  }

  public clearMarkers(): void {
    if (this.markersContainer) {
      this.markersContainer.replaceChildren();
    }
  }
}
