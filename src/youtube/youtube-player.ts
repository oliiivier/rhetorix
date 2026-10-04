// Contrôleur du lecteur HTML5 YouTube : synchronisation temporelle, détection de pubs,
// gestion des pauses/reprises et détection des sauts de timeline.

import type { VideoAnnotation } from "./types";

export type YouTubePauseMode = "none" | "pause_start" | "pause_after";

export interface YouTubePlayerOptions {
  minDisplayDuration: number; // en secondes (défaut: 6)
  pauseMode: YouTubePauseMode; // défaut: "none"
  autoResume: boolean; // défaut: true
  autoResumeDuration: number; // en secondes (défaut: 5)
}

export const DEFAULT_PLAYER_OPTIONS: YouTubePlayerOptions = {
  minDisplayDuration: 6,
  pauseMode: "none",
  autoResume: true,
  autoResumeDuration: 5,
};

export interface TimeRange {
  startSec: number;
  endSec: number;
}

export interface YouTubePlayerCallbacks {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onAnnotationActive?: (annotation: VideoAnnotation, isAutoPaused: boolean) => void;
  onAnnotationInactive?: (annotationId: string) => void;
  onSeekOutsideAnalyzed?: (targetTime: number) => void;
  onVideoEnded?: () => void;
}

export class YouTubePlayerController {
  private videoEl: HTMLVideoElement | null = null;
  private containerEl: HTMLElement | null = null;
  private options: YouTubePlayerOptions = { ...DEFAULT_PLAYER_OPTIONS };
  private callbacks: YouTubePlayerCallbacks = {};

  private annotations: VideoAnnotation[] = [];
  private analyzedRanges: TimeRange[] = [];
  private activeAnnotation: VideoAnnotation | null = null;

  // Mémorise les IDs pour lesquels la pause a déjà été déclenchée (évite les boucles infinies de pause)
  private pausedStartDone = new Set<string>();
  private pausedAfterDone = new Set<string>();

  private rafId: number | null = null;
  private lastTickTime = 0;
  private isDestroyed = false;

  // Gestion du compte à rebours de reprise automatique
  private countdownRemaining = 0;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private countdownPaused = false;
  private onCountdownTickCb: ((remainingSec: number) => void) | null = null;
  private onCountdownCompleteCb: (() => void) | null = null;

  constructor(options?: Partial<YouTubePlayerOptions>, callbacks?: YouTubePlayerCallbacks) {
    if (options) this.setOptions(options);
    if (callbacks) this.callbacks = callbacks;
  }

  public setOptions(newOptions: Partial<YouTubePlayerOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  public getOptions(): YouTubePlayerOptions {
    return { ...this.options };
  }

  public attach(video: HTMLVideoElement, container?: HTMLElement | null): void {
    this.detach();
    this.videoEl = video;
    this.containerEl = container ?? video.closest("#movie_player") ?? video.parentElement;
    this.isDestroyed = false;

    video.addEventListener("timeupdate", this.onTimeUpdate);
    video.addEventListener("seeking", this.onSeeking);
    video.addEventListener("seeked", this.onSeeked);
    video.addEventListener("ended", this.onEnded);

    this.startLoop();
  }

  public detach(): void {
    this.isDestroyed = true;
    this.stopLoop();
    this.cancelAutoResume();

    if (this.videoEl) {
      this.videoEl.removeEventListener("timeupdate", this.onTimeUpdate);
      this.videoEl.removeEventListener("seeking", this.onSeeking);
      this.videoEl.removeEventListener("seeked", this.onSeeked);
      this.videoEl.removeEventListener("ended", this.onEnded);
      this.videoEl = null;
    }
    this.containerEl = null;
    this.activeAnnotation = null;
  }

  public setAnnotations(annotations: VideoAnnotation[], ranges: TimeRange[] = []): void {
    this.annotations = [...annotations];
    this.analyzedRanges = [...ranges];
    // Réinitialiser les déclenchements de pause pour les nouvelles annotations
    this.pausedStartDone.clear();
    this.pausedAfterDone.clear();
  }

  public addAnalyzedRange(range: TimeRange): void {
    this.analyzedRanges.push(range);
  }

  public isInAnalyzedRange(timeSec: number): boolean {
    if (this.analyzedRanges.length === 0) return false;
    return this.analyzedRanges.some((r) => timeSec >= r.startSec && timeSec <= r.endSec);
  }

  public seekTo(timeSec: number, autoPlay = true): void {
    if (!this.videoEl) return;
    this.cancelAutoResume();
    this.videoEl.currentTime = Math.max(0, timeSec);
    if (autoPlay) {
      void this.videoEl.play().catch(() => {});
    }
  }

  public play(): void {
    this.cancelAutoResume();
    void this.videoEl?.play().catch(() => {});
  }

  public pause(): void {
    this.cancelAutoResume();
    this.videoEl?.pause();
  }

  public isAdActive(): boolean {
    if (!this.containerEl) return false;
    if (this.containerEl.classList.contains("ad-showing")) return true;
    if (this.containerEl.classList.contains("ad-interrupting")) return true;
    const adOverlay = this.containerEl.querySelector(".ytp-ad-player-overlay, .video-ads:not(:empty)");
    return Boolean(adOverlay && (adOverlay as HTMLElement).offsetParent !== null);
  }

  // ---------- Détection et Boucle de synchronisation ----------

  private scheduleFrame(cb: (time: number) => void): number {
    if (typeof requestAnimationFrame !== "undefined") {
      return requestAnimationFrame(cb);
    }
    return setTimeout(() => cb(Date.now()), 100) as unknown as number;
  }

  private cancelFrame(id: number): void {
    if (typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  }

  private startLoop = (): void => {
    const loop = (timestamp: number) => {
      if (this.isDestroyed) return;
      // Throttling à 10 Hz (toutes les 100 ms) pour ne pas saturer le CPU
      if (timestamp - this.lastTickTime >= 100) {
        this.lastTickTime = timestamp;
        this.checkPlaybackState();
      }
      this.rafId = this.scheduleFrame(loop);
    };
    this.rafId = this.scheduleFrame(loop);
  };

  private stopLoop(): void {
    if (this.rafId !== null) {
      this.cancelFrame(this.rafId);
      this.rafId = null;
    }
  }

  private onTimeUpdate = (): void => {
    this.checkPlaybackState();
  };

  private onSeeking = (): void => {
    this.cancelAutoResume();
  };

  private onSeeked = (): void => {
    if (!this.videoEl) return;
    const current = this.videoEl.currentTime;

    // Si le curseur atterrit en dehors des tranches déjà analysées (ex: saut à 20 min ou 50 min)
    if (this.analyzedRanges.length > 0 && !this.isInAnalyzedRange(current)) {
      this.callbacks.onSeekOutsideAnalyzed?.(current);
    }

    this.checkPlaybackState();
  };

  private onEnded = (): void => {
    this.cancelAutoResume();
    this.callbacks.onVideoEnded?.();
  };

  public checkPlaybackState(): void {
    if (!this.videoEl || this.isDestroyed) return;
    const current = this.videoEl.currentTime;
    const duration = this.videoEl.duration || 0;

    this.callbacks.onTimeUpdate?.(current, duration);

    // Pendant une publicité, désactiver toute bulle active
    if (this.isAdActive()) {
      if (this.activeAnnotation) {
        const id = this.activeAnnotation.id;
        this.activeAnnotation = null;
        this.callbacks.onAnnotationInactive?.(id);
      }
      return;
    }

    // Recherche de l'annotation candidate pour l'instant actuel
    let candidate: VideoAnnotation | null = null;
    for (const ann of this.annotations) {
      if (ann.startTime < 0) continue;
      const displayEnd = Math.max(ann.endTime, ann.startTime + this.options.minDisplayDuration);
      if (current >= ann.startTime && current <= displayEnd) {
        // En cas de chevauchement, prioriser la plus sévère ou la plus récente
        if (!candidate || ann.severity === "high" || ann.startTime > candidate.startTime) {
          candidate = ann;
        }
      }
    }

    // Gestion du déclenchement
    if (candidate) {
      let justAutoPaused = false;

      // Mode pause avant le passage (pause_start)
      if (
        this.options.pauseMode === "pause_start" &&
        !this.pausedStartDone.has(candidate.id) &&
        current >= candidate.startTime &&
        current < candidate.startTime + 0.6
      ) {
        this.pausedStartDone.add(candidate.id);
        this.videoEl.pause();
        justAutoPaused = true;
      }

      // Mode pause après le passage (pause_after)
      if (
        this.options.pauseMode === "pause_after" &&
        !this.pausedAfterDone.has(candidate.id) &&
        current >= candidate.endTime &&
        current < candidate.endTime + 0.6
      ) {
        this.pausedAfterDone.add(candidate.id);
        this.videoEl.pause();
        justAutoPaused = true;
      }

      if (this.activeAnnotation?.id !== candidate.id) {
        this.activeAnnotation = candidate;
        this.callbacks.onAnnotationActive?.(candidate, justAutoPaused);
      } else if (justAutoPaused) {
        this.callbacks.onAnnotationActive?.(candidate, true);
      }
    } else if (this.activeAnnotation) {
      const prevId = this.activeAnnotation.id;
      this.activeAnnotation = null;
      this.callbacks.onAnnotationInactive?.(prevId);
    }
  }

  // ---------- Compte à rebours de reprise automatique (Auto-Resume) ----------

  public startAutoResume(
    onTick: (remainingSec: number) => void,
    onComplete: () => void,
    durationSec?: number,
  ): void {
    this.cancelAutoResume();
    this.countdownRemaining = durationSec ?? this.options.autoResumeDuration;
    this.countdownPaused = false;
    this.onCountdownTickCb = onTick;
    this.onCountdownCompleteCb = onComplete;

    this.onCountdownTickCb(this.countdownRemaining);

    this.countdownTimer = setInterval(() => {
      if (this.countdownPaused) return;

      this.countdownRemaining -= 1;
      if (this.onCountdownTickCb) {
        this.onCountdownTickCb(this.countdownRemaining);
      }

      if (this.countdownRemaining <= 0) {
        const completeCb = this.onCountdownCompleteCb;
        this.cancelAutoResume();
        completeCb?.();
        this.play();
      }
    }, 1000);
  }

  public pauseAutoResume(): void {
    this.countdownPaused = true;
  }

  public resumeAutoResume(): void {
    this.countdownPaused = false;
  }

  public cancelAutoResume(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownRemaining = 0;
    this.countdownPaused = false;
    this.onCountdownTickCb = null;
    this.onCountdownCompleteCb = null;
  }
}
