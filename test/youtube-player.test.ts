import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoAnnotation } from "../src/youtube/types";
import { YouTubePlayerController } from "../src/youtube/youtube-player";

function createMockVideo(initialTime = 0, duration = 3600) {
  const listeners: Record<string, ((e?: Event) => void)[]> = {};
  return {
    currentTime: initialTime,
    duration,
    paused: false,
    addEventListener: (event: string, fn: (e?: Event) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    removeEventListener: (event: string, fn: (e?: Event) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((l) => l !== fn);
      }
    },
    trigger: (event: string) => {
      listeners[event]?.forEach((fn) => fn());
    },
    pause: vi.fn(function (this: { paused: boolean }) {
      this.paused = true;
    }),
    play: vi.fn(async function (this: { paused: boolean }) {
      this.paused = false;
    }),
  };
}

function createMockContainer(isAd = false) {
  const classes = new Set<string>();
  if (isAd) classes.add("ad-showing");
  return {
    classList: {
      contains: (c: string) => classes.has(c),
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
    },
    querySelector: () => null,
  } as unknown as HTMLElement;
}

const mockAnnotations: VideoAnnotation[] = [
  {
    id: "ann-1",
    exact_quote: "citation sophisme",
    category: "sophism",
    label: "homme_de_paille",
    severity: "high",
    rhetoric_critique: "critique",
    fact_check: { status: "unverified", context: "", sources: [] },
    startTime: 10,
    endTime: 14,
    chunkIndex: 0,
  },
  {
    id: "ann-2",
    exact_quote: "citation biais",
    category: "bias",
    label: "biais_confirmation",
    severity: "medium",
    rhetoric_critique: "critique",
    fact_check: { status: "unverified", context: "", sources: [] },
    startTime: 50,
    endTime: 55,
    chunkIndex: 0,
  },
];

describe("YouTubePlayerController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gère les options par défaut et personnalisées", () => {
    const controller = new YouTubePlayerController({ minDisplayDuration: 8 });
    expect(controller.getOptions().minDisplayDuration).toBe(8);
    expect(controller.getOptions().pauseMode).toBe("none");

    controller.setOptions({ pauseMode: "pause_start" });
    expect(controller.getOptions().pauseMode).toBe("pause_start");
  });

  it("active une annotation quand currentTime est dans la plage temporelle", () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    const controller = new YouTubePlayerController(
      { minDisplayDuration: 6 },
      { onAnnotationActive: onActive, onAnnotationInactive: onInactive },
    );

    const mockVideo = createMockVideo(0);
    controller.attach(mockVideo as unknown as HTMLVideoElement, createMockContainer());
    controller.setAnnotations(mockAnnotations);

    // À t=5s : pas d'annotation
    mockVideo.currentTime = 5;
    controller.checkPlaybackState();
    expect(onActive).not.toHaveBeenCalled();

    // À t=11s : ann-1 est active (startTime: 10, endTime: 14)
    mockVideo.currentTime = 11;
    controller.checkPlaybackState();
    expect(onActive).toHaveBeenCalledWith(mockAnnotations[0], false);

    // À t=15s : ann-1 est toujours active grâce à minDisplayDuration (10 + 6 = 16s)
    mockVideo.currentTime = 15;
    controller.checkPlaybackState();
    expect(onInactive).not.toHaveBeenCalled();

    // À t=18s : ann-1 devient inactive
    mockVideo.currentTime = 18;
    controller.checkPlaybackState();
    expect(onInactive).toHaveBeenCalledWith("ann-1");

    controller.detach();
  });

  it("met en pause au début du passage en mode pause_start", () => {
    const onActive = vi.fn();
    const controller = new YouTubePlayerController(
      { pauseMode: "pause_start" },
      { onAnnotationActive: onActive },
    );

    const mockVideo = createMockVideo(0);
    controller.attach(mockVideo as unknown as HTMLVideoElement, createMockContainer());
    controller.setAnnotations(mockAnnotations);

    // Arrivée à startTime (10s)
    mockVideo.currentTime = 10;
    controller.checkPlaybackState();

    expect(mockVideo.pause).toHaveBeenCalled();
    expect(onActive).toHaveBeenCalledWith(mockAnnotations[0], true);

    // Vérifier qu'une vérification suivante ne déclenche pas une boucle de pause
    mockVideo.pause.mockClear();
    controller.checkPlaybackState();
    expect(mockVideo.pause).not.toHaveBeenCalled();

    controller.detach();
  });

  it("met en pause à la fin du passage en mode pause_after", () => {
    const onActive = vi.fn();
    const controller = new YouTubePlayerController(
      { pauseMode: "pause_after" },
      { onAnnotationActive: onActive },
    );

    const mockVideo = createMockVideo(0);
    controller.attach(mockVideo as unknown as HTMLVideoElement, createMockContainer());
    controller.setAnnotations(mockAnnotations);

    // À t=11s (en cours de passage) : pas de pause
    mockVideo.currentTime = 11;
    controller.checkPlaybackState();
    expect(mockVideo.pause).not.toHaveBeenCalled();
    expect(onActive).toHaveBeenCalledWith(mockAnnotations[0], false);

    // À t=14s (endTime) : pause déclenchée
    mockVideo.currentTime = 14;
    controller.checkPlaybackState();
    expect(mockVideo.pause).toHaveBeenCalled();

    controller.detach();
  });

  it("détecte les sauts en dehors des zones analysées (seek vers la 20e ou 50e minute)", () => {
    const onSeekOutside = vi.fn();
    const controller = new YouTubePlayerController({}, { onSeekOutsideAnalyzed: onSeekOutside });

    const mockVideo = createMockVideo(0);
    controller.attach(mockVideo as unknown as HTMLVideoElement, createMockContainer());

    // Zone analysée : 00:00 à 15:00 (0 à 900s)
    controller.setAnnotations(mockAnnotations, [{ startSec: 0, endSec: 900 }]);

    // Saut à la 5e minute (300s) : dans la zone couverte
    mockVideo.currentTime = 300;
    mockVideo.trigger("seeked");
    expect(onSeekOutside).not.toHaveBeenCalled();

    // Saut à la 50e minute (3000s) : en dehors de la zone couverte
    mockVideo.currentTime = 3000;
    mockVideo.trigger("seeked");
    expect(onSeekOutside).toHaveBeenCalledWith(3000);

    controller.detach();
  });

  it("neutralise l'affichage pendant les publicités", () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    const controller = new YouTubePlayerController(
      {},
      { onAnnotationActive: onActive, onAnnotationInactive: onInactive },
    );

    const mockVideo = createMockVideo(11); // sur ann-1
    const container = createMockContainer(true); // ad-showing activé
    controller.attach(mockVideo as unknown as HTMLVideoElement, container);
    controller.setAnnotations(mockAnnotations);

    controller.checkPlaybackState();
    expect(onActive).not.toHaveBeenCalled();

    controller.detach();
  });

  it("gère le compte à rebours de reprise automatique", () => {
    const controller = new YouTubePlayerController();
    const mockVideo = createMockVideo(10);
    controller.attach(mockVideo as unknown as HTMLVideoElement, createMockContainer());

    const onTick = vi.fn();
    const onComplete = vi.fn();

    controller.startAutoResume(onTick, onComplete, 3);
    expect(onTick).toHaveBeenCalledWith(3);

    // 1 seconde s'écoule
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledWith(2);

    // Suspension du compte à rebours (ex: survol souris)
    controller.pauseAutoResume();
    vi.advanceTimersByTime(2000);
    expect(onTick).not.toHaveBeenCalledWith(1); // Pas décrémenté pendant la pause

    // Reprise du compte à rebours
    controller.resumeAutoResume();
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledWith(1);

    // Expiration
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalled();
    expect(mockVideo.play).toHaveBeenCalled();

    controller.detach();
  });
});
