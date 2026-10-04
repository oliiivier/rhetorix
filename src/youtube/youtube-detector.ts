// Détection des URL YouTube, extraction de l'identifiant vidéo et gestion du cycle de vie SPA.

/**
 * Vérifie si une URL correspond à un domaine YouTube.
 */
export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

/**
 * Vérifie si l'URL correspond à une page de lecture vidéo analysable (watch ou shorts).
 */
export function isYouTubeWatchUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      return false;
    }

    if (host === "youtu.be") {
      return parsed.pathname.length > 1;
    }

    return parsed.pathname === "/watch" || parsed.pathname.startsWith("/shorts/");
  } catch {
    return false;
  }
}

/**
 * Extrait l'identifiant unique de la vidéo (videoId) depuis l'URL.
 */
export function extractVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0]?.split("?")[0] ?? "";
      return id || null;
    }

    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v") || null;
    }

    if (parsed.pathname.startsWith("/shorts/")) {
      const id = parsed.pathname.slice("/shorts/".length).split("/")[0]?.split("?")[0] ?? "";
      return id || null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extrait le paramètre temporel t (ex: t=120, t=2m15s, t=1h30m) en secondes.
 */
export function extractTimestampParam(url: string): number {
  if (!url) return 0;
  try {
    const parsed = new URL(url);
    const t = parsed.searchParams.get("t");
    if (!t) return 0;

    // Nombre simple de secondes (ex: t=120 ou t=120s)
    if (/^\d+s?$/i.test(t)) {
      return parseInt(t.replace(/s$/i, ""), 10) || 0;
    }

    // Format combiné (ex: 1h2m3s ou 2m15s)
    let totalSec = 0;
    const hMatch = t.match(/(\d+)h/i);
    const mMatch = t.match(/(\d+)m/i);
    const sMatch = t.match(/(\d+)s/i);

    if (hMatch) totalSec += parseInt(hMatch[1]!, 10) * 3600;
    if (mMatch) totalSec += parseInt(mMatch[1]!, 10) * 60;
    if (sMatch) totalSec += parseInt(sMatch[1]!, 10);

    return totalSec;
  } catch {
    return 0;
  }
}

/**
 * Écoute les transitions internes de navigation YouTube SPA (Single Page Application).
 * Renvoie une fonction de nettoyage pour désactiver les écouteurs.
 */
export function setupSpaNavigationListener(callback: (newVideoId: string | null) => void): () => void {
  let lastVideoId = typeof window !== "undefined" ? extractVideoId(window.location.href) : null;

  const checkNavigation = () => {
    const currentVideoId = extractVideoId(window.location.href);
    if (currentVideoId !== lastVideoId) {
      lastVideoId = currentVideoId;
      callback(currentVideoId);
    }
  };

  // Événements YouTube spécifiques
  window.addEventListener("yt-navigate-finish", checkNavigation);
  window.addEventListener("spfdone", checkNavigation);
  // Événements d'historique de navigateur standards
  window.addEventListener("popstate", checkNavigation);
  window.addEventListener("hashchange", checkNavigation);

  return () => {
    window.removeEventListener("yt-navigate-finish", checkNavigation);
    window.removeEventListener("spfdone", checkNavigation);
    window.removeEventListener("popstate", checkNavigation);
    window.removeEventListener("hashchange", checkNavigation);
  };
}
