import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TOKEN_STATS,
  formatTokenCount,
  getScheduledResetDate,
  loadTokenStats,
  recordTokenUsage,
  resetTokenStats,
  setMonthlyResetDay,
  shouldMonthlyReset,
  TOKEN_STATS_KEY,
  type TokenStats,
} from "../src/tokens";

let mockStorageData: Record<string, unknown> = {};

vi.mock("../src/ext", () => ({
  ext: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: mockStorageData[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(mockStorageData, items);
        }),
      },
    },
  },
}));

describe("tokens module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageData = {};
  });

  describe("getScheduledResetDate", () => {
    it("renvoie la date exacte pour un jour valide", () => {
      const d = getScheduledResetDate(2026, 9, 15); // Octobre = 9 (0-indexé)
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(9);
      expect(d.getDate()).toBe(15);
    });

    it("plafonne le jour si le mois a moins de jours (ex. 31 en février)", () => {
      const d = getScheduledResetDate(2026, 1, 31); // Février = 1
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(28); // 2026 n'est pas bissextile
    });
  });

  describe("shouldMonthlyReset", () => {
    it("renvoie false si monthlyResetDay vaut 0 (désactivé)", () => {
      const lastReset = new Date(2026, 8, 1).getTime();
      const now = new Date(2026, 9, 4);
      expect(shouldMonthlyReset(lastReset, 0, now)).toBe(false);
    });

    it("renvoie true si la date courante a dépassé le jour de reset du mois", () => {
      const lastReset = new Date(2026, 8, 15).getTime(); // 15 sept
      const now = new Date(2026, 9, 4); // 4 oct
      // resetDay = 1 : l'échéance d'octobre est le 1er oct, et lastReset (15 sept) < 1er oct
      expect(shouldMonthlyReset(lastReset, 1, now)).toBe(true);
    });

    it("renvoie false si le reset a déjà eu lieu pour ce cycle", () => {
      const lastReset = new Date(2026, 9, 2).getTime(); // 2 oct
      const now = new Date(2026, 9, 4); // 4 oct
      // resetDay = 1 : l'échéance d'octobre est le 1er oct, lastReset est après
      expect(shouldMonthlyReset(lastReset, 1, now)).toBe(false);
    });

    it("gère le cas où le jour de reset est plus tard dans le mois (ex. le 15)", () => {
      const now = new Date(2026, 9, 4); // 4 oct
      // Le 15 oct n'est pas encore arrivé, donc la dernière échéance était le 15 sept
      const lastResetBeforeSept15 = new Date(2026, 8, 10).getTime();
      expect(shouldMonthlyReset(lastResetBeforeSept15, 15, now)).toBe(true);

      const lastResetAfterSept15 = new Date(2026, 8, 20).getTime();
      expect(shouldMonthlyReset(lastResetAfterSept15, 15, now)).toBe(false);
    });
  });

  describe("loadTokenStats & monthly reset", () => {
    it("initialise les stats par défaut si aucune donnée stockée", async () => {
      const now = new Date(2026, 9, 4);
      const stats = await loadTokenStats(now);
      expect(stats.periodTotalTokens).toBe(0);
      expect(stats.allTimeTotalTokens).toBe(0);
      expect(stats.monthlyResetDay).toBe(1);
      expect(stats.lastResetTimestamp).toBe(now.getTime());
    });

    it("remet à zéro le compteur de période si le reset mensuel est dû", async () => {
      const lastReset = new Date(2026, 8, 1).getTime(); // 1er sept
      mockStorageData[TOKEN_STATS_KEY] = {
        periodInputTokens: 5000,
        periodOutputTokens: 1000,
        periodTotalTokens: 6000,
        allTimeInputTokens: 15000,
        allTimeOutputTokens: 3000,
        allTimeTotalTokens: 18000,
        lastResetTimestamp: lastReset,
        monthlyResetDay: 1,
      };

      const now = new Date(2026, 9, 4); // 4 oct
      const stats = await loadTokenStats(now);

      // La période est remise à zéro
      expect(stats.periodInputTokens).toBe(0);
      expect(stats.periodOutputTokens).toBe(0);
      expect(stats.periodTotalTokens).toBe(0);
      expect(stats.lastResetTimestamp).toBe(now.getTime());

      // Le cumul allTime est préservé
      expect(stats.allTimeInputTokens).toBe(15000);
      expect(stats.allTimeOutputTokens).toBe(3000);
      expect(stats.allTimeTotalTokens).toBe(18000);
    });
  });

  describe("recordTokenUsage", () => {
    it("incrémente les compteurs de période et all-time", async () => {
      const now = new Date(2026, 9, 4);
      await recordTokenUsage({ inputTokens: 1200, outputTokens: 350, totalTokens: 1550 }, now);

      const stats = await loadTokenStats(now);
      expect(stats.periodInputTokens).toBe(1200);
      expect(stats.periodOutputTokens).toBe(350);
      expect(stats.periodTotalTokens).toBe(1550);
      expect(stats.allTimeInputTokens).toBe(1200);
      expect(stats.allTimeOutputTokens).toBe(350);
      expect(stats.allTimeTotalTokens).toBe(1550);

      // Deuxième enregistrement
      await recordTokenUsage({ inputTokens: 800, outputTokens: 200, totalTokens: 1000 }, now);
      const updated = await loadTokenStats(now);
      expect(updated.periodInputTokens).toBe(2000);
      expect(updated.periodOutputTokens).toBe(550);
      expect(updated.periodTotalTokens).toBe(2550);
      expect(updated.allTimeTotalTokens).toBe(2550);
    });
  });

  describe("resetTokenStats", () => {
    it("réinitialise la période par défaut tout en conservant le cumul all-time", async () => {
      mockStorageData[TOKEN_STATS_KEY] = {
        periodInputTokens: 500,
        periodOutputTokens: 100,
        periodTotalTokens: 600,
        allTimeInputTokens: 5000,
        allTimeOutputTokens: 1000,
        allTimeTotalTokens: 6000,
        lastResetTimestamp: 123456,
        monthlyResetDay: 1,
      };

      const result = await resetTokenStats("period");
      expect(result.periodTotalTokens).toBe(0);
      expect(result.allTimeTotalTokens).toBe(6000);
      expect(result.lastResetTimestamp).toBeGreaterThan(123456);
    });

    it("réinitialise tout si 'all' est spécifié", async () => {
      mockStorageData[TOKEN_STATS_KEY] = {
        periodInputTokens: 500,
        periodOutputTokens: 100,
        periodTotalTokens: 600,
        allTimeInputTokens: 5000,
        allTimeOutputTokens: 1000,
        allTimeTotalTokens: 6000,
        lastResetTimestamp: 123456,
        monthlyResetDay: 1,
      };

      const result = await resetTokenStats("all");
      expect(result.periodTotalTokens).toBe(0);
      expect(result.allTimeTotalTokens).toBe(0);
    });
  });

  describe("setMonthlyResetDay", () => {
    it("met à jour et borne le jour de reset", async () => {
      await setMonthlyResetDay(15);
      let stats = await loadTokenStats();
      expect(stats.monthlyResetDay).toBe(15);

      await setMonthlyResetDay(40);
      stats = await loadTokenStats();
      expect(stats.monthlyResetDay).toBe(31);

      await setMonthlyResetDay(-5);
      stats = await loadTokenStats();
      expect(stats.monthlyResetDay).toBe(0);
    });
  });

  describe("formatTokenCount", () => {
    it("formate les grands nombres avec séparateur", () => {
      const formatted = formatTokenCount(1234567, "fr");
      // Selon l'environnement, espace ou espace insécable
      expect(formatted).toMatch(/1[\s\u202f]234[\s\u202f]567/);
    });
  });
});
