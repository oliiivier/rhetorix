// Gestion de la consommation de tokens et statistiques d'usage.
// Stockage local (chrome.storage.local) sans aucune permission supplémentaire.

import { ext } from "./ext";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface TokenStats {
  periodInputTokens: number;
  periodOutputTokens: number;
  periodTotalTokens: number;
  allTimeInputTokens: number;
  allTimeOutputTokens: number;
  allTimeTotalTokens: number;
  lastResetTimestamp: number;
  /** Jour du mois pour le reset automatique (1..28/31), ou 0 si désactivé. */
  monthlyResetDay: number;
}

export const TOKEN_STATS_KEY = "token_stats";

export const DEFAULT_TOKEN_STATS: TokenStats = {
  periodInputTokens: 0,
  periodOutputTokens: 0,
  periodTotalTokens: 0,
  allTimeInputTokens: 0,
  allTimeOutputTokens: 0,
  allTimeTotalTokens: 0,
  lastResetTimestamp: 0,
  monthlyResetDay: 1, // Par défaut : le 1er du mois
};

/**
 * Calcule la date de réinitialisation programmée pour une année et un mois donnés,
 * en plafonnant le jour au nombre réel de jours dans ce mois (ex. 31 pour février devient 28 ou 29).
 */
export function getScheduledResetDate(year: number, month: number, targetDay: number): Date {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.max(1, Math.min(targetDay, daysInMonth));
  return new Date(year, month, clampedDay, 0, 0, 0, 0);
}

/**
 * Vérifie si une réinitialisation mensuelle doit être déclenchée.
 */
export function shouldMonthlyReset(lastResetTimestamp: number, monthlyResetDay: number, now: Date = new Date()): boolean {
  if (monthlyResetDay <= 0 || monthlyResetDay > 31) return false;
  if (!lastResetTimestamp) return false;

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const resetThisMonth = getScheduledResetDate(currentYear, currentMonth, monthlyResetDay);
  let mostRecentResetDate: Date;

  if (now.getTime() >= resetThisMonth.getTime()) {
    mostRecentResetDate = resetThisMonth;
  } else {
    // Le jour de reset de ce mois n'est pas encore arrivé, la dernière échéance était le mois précédent
    mostRecentResetDate = getScheduledResetDate(currentYear, currentMonth - 1, monthlyResetDay);
  }

  return lastResetTimestamp < mostRecentResetDate.getTime();
}

/**
 * Charge les statistiques de consommation de tokens depuis storage.local,
 * en appliquant la réinitialisation mensuelle si la date limite est franchie.
 */
export async function loadTokenStats(now: Date = new Date()): Promise<TokenStats> {
  const res = await ext.storage.local.get(TOKEN_STATS_KEY);
  const stored = res[TOKEN_STATS_KEY] as Partial<TokenStats> | undefined;

  const stats: TokenStats = {
    ...DEFAULT_TOKEN_STATS,
    ...stored,
    // Initialiser lastResetTimestamp au moment du premier chargement s'il vaut 0
    lastResetTimestamp: stored?.lastResetTimestamp ?? now.getTime(),
  };

  if (stored?.lastResetTimestamp && shouldMonthlyReset(stored.lastResetTimestamp, stats.monthlyResetDay, now)) {
    stats.periodInputTokens = 0;
    stats.periodOutputTokens = 0;
    stats.periodTotalTokens = 0;
    stats.lastResetTimestamp = now.getTime();
    await ext.storage.local.set({ [TOKEN_STATS_KEY]: stats });
  } else if (!stored) {
    await ext.storage.local.set({ [TOKEN_STATS_KEY]: stats });
  }

  return stats;
}

/**
 * Enregistre les tokens consommés par une analyse dans le cumul local.
 */
export async function recordTokenUsage(usage: TokenUsage, now: Date = new Date()): Promise<TokenStats> {
  const stats = await loadTokenStats(now);
  if (usage.inputTokens > 0 || usage.outputTokens > 0) {
    stats.periodInputTokens += Math.max(0, usage.inputTokens);
    stats.periodOutputTokens += Math.max(0, usage.outputTokens);
    stats.periodTotalTokens = stats.periodInputTokens + stats.periodOutputTokens;

    stats.allTimeInputTokens += Math.max(0, usage.inputTokens);
    stats.allTimeOutputTokens += Math.max(0, usage.outputTokens);
    stats.allTimeTotalTokens = stats.allTimeInputTokens + stats.allTimeOutputTokens;

    await ext.storage.local.set({ [TOKEN_STATS_KEY]: stats });
  }
  return stats;
}

/**
 * Réinitialise manuellement les compteurs de tokens (RAZ).
 */
export async function resetTokenStats(type: "period" | "all" = "period"): Promise<TokenStats> {
  const stats = await loadTokenStats();
  stats.periodInputTokens = 0;
  stats.periodOutputTokens = 0;
  stats.periodTotalTokens = 0;
  stats.lastResetTimestamp = Date.now();

  if (type === "all") {
    stats.allTimeInputTokens = 0;
    stats.allTimeOutputTokens = 0;
    stats.allTimeTotalTokens = 0;
  }

  await ext.storage.local.set({ [TOKEN_STATS_KEY]: stats });
  return stats;
}

/**
 * Modifie le jour de réinitialisation mensuel.
 */
export async function setMonthlyResetDay(day: number): Promise<TokenStats> {
  const stats = await loadTokenStats();
  stats.monthlyResetDay = Math.max(0, Math.min(31, Math.floor(day)));
  await ext.storage.local.set({ [TOKEN_STATS_KEY]: stats });
  return stats;
}

/**
 * Formate un nombre de tokens selon la locale de l'utilisateur.
 */
export function formatTokenCount(n: number, lang = "fr"): string {
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch {
    return n.toLocaleString();
  }
}
