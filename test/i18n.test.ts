import { describe, expect, it } from "vitest";
import { getUiStrings, normalizeLanguage, SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from "../src/i18n";
import { systemPrompt } from "../src/prompt";
import { CATEGORIES, LABELS, labelDef } from "../src/taxonomy";

describe("i18n module", () => {
  it("normalise correctement les codes de langue", () => {
    expect(normalizeLanguage("fr")).toBe("fr");
    expect(normalizeLanguage("fr-FR")).toBe("fr");
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("en-GB")).toBe("en");
    expect(normalizeLanguage("es-ES")).toBe("es");
    expect(normalizeLanguage("de-DE")).toBe("de");
    expect(normalizeLanguage("it-IT")).toBe("it");
    expect(normalizeLanguage("unknown")).toBe("fr");
  });

  it("fournit toutes les traductions requises pour chaque langue supportée", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const strings = UI_TRANSLATIONS[lang];
      expect(strings).toBeDefined();
      expect(strings.panelTitle).toBe("Rhetorix");
      expect(strings.analyzeBtn).toBeTruthy();
      expect(strings.reanalyzeBtn).toBeTruthy();
      expect(strings.cancelBtn).toBeTruthy();
      expect(strings.optionsTitle).toBeTruthy();
      expect(strings.idleStatus).toBeTruthy();

      // Vérification des catégories
      expect(strings.categories.sophism).toBeTruthy();
      expect(strings.categories.bias).toBeTruthy();
      expect(strings.categories.factual_claim).toBeTruthy();

      // Vérification des sévérités
      expect(strings.severities.high).toBeTruthy();
      expect(strings.severities.medium).toBeTruthy();
      expect(strings.severities.low).toBeTruthy();

      // Vérification des statuts de fact-checking
      expect(strings.factStatuses.refuted).toBeTruthy();
      expect(strings.factStatuses.supported).toBeTruthy();
      expect(strings.factStatuses.misleading).toBeTruthy();
      expect(strings.factStatuses.unverified).toBeTruthy();
    }
  });

  it("getUiStrings s'adapte au paramètre chaîne ou objet Config", () => {
    expect(getUiStrings("en").analyzeBtn).toBe("Analyze page");
    expect(getUiStrings({ language: "es" } as never).analyzeBtn).toBe("Analizar la página");
    expect(getUiStrings({ language: "de" } as never).analyzeBtn).toBe("Seite analysieren");
    expect(getUiStrings({ language: "it" } as never).analyzeBtn).toBe("Analizza la pagina");
    expect(getUiStrings({ language: "fr" } as never).analyzeBtn).toBe("Analyser la page");
  });

  it("traduit les erreurs des providers et d'extraction dans toutes les langues", async () => {
    const { formatErrorMessage } = await import("../src/i18n");
    const { ProviderError } = await import("../src/providers/types");

    for (const lang of SUPPORTED_LANGUAGES) {
      const strings = UI_TRANSLATIONS[lang];
      expect(strings.extractNoArticleError).toBeTruthy();
      expect(strings.extractEmptyArticleError).toBeTruthy();
      expect(strings.invalidEndpoint).toBeTruthy();
      expect(strings.errorPrefix("test")).toContain("test");

      const errRefusal = new ProviderError("Refus", "refusal", "contenu haineux");
      expect(formatErrorMessage(errRefusal, strings)).toBeTruthy();

      const errTokens = new ProviderError("Tokens", "max_tokens");
      expect(formatErrorMessage(errTokens, strings)).toBeTruthy();

      const errHttp = new ProviderError("HTTP", "http_error", "500 Internal Error");
      expect(formatErrorMessage(errHttp, strings)).toContain("500 Internal Error");
    }
  });
});

describe("Multilingual Taxonomy", () => {
  it("traduit les labels dans les langues supportées", () => {
    // Anglais
    const enDef = labelDef("sophism", "ad_hominem", "en");
    expect(enDef?.name).toBe("Ad Hominem");
    expect(enDef?.definition).toContain("substance of the argument");

    // Espagnol
    const esDef = labelDef("sophism", "ad_hominem", "es");
    expect(esDef?.name).toBe("Ataque personal");

    // Allemand
    const deDef = labelDef("sophism", "ad_hominem", "de");
    expect(deDef?.name).toBe("Persönlicher Angriff");

    // Italien
    const itDef = labelDef("sophism", "ad_hominem", "it");
    expect(itDef?.name).toBe("Attacco personale");

    // Français
    const frDef = labelDef("sophism", "ad_hominem", "fr");
    expect(frDef?.name).toBe("Attaque personnelle");
  });

  it("se replie sur le français pour une langue non supportée", () => {
    const fallbackDef = labelDef("sophism", "homme_de_paille", "xx");
    expect(fallbackDef?.name).toBe("Homme de paille");
  });

  it("vérifie que tous les labels ont une traduction dans chaque langue", () => {
    for (const lang of ["en", "es", "de", "it"] as const) {
      for (const cat of CATEGORIES) {
        for (const labelId of Object.keys(LABELS[cat])) {
          const def = labelDef(cat, labelId, lang);
          expect(def, `Label manquant : ${cat}/${labelId} pour ${lang}`).toBeDefined();
          expect(def?.name).toBeTruthy();
          expect(def?.definition).toBeTruthy();
        }
      }
    }
  });

  it("injecte les définitions traduites dans le systemPrompt", () => {
    const enPrompt = systemPrompt({ language: "en", webSearch: false });
    expect(enPrompt).toContain("ad_hominem (Ad Hominem)");
    expect(enPrompt).toContain("homme_de_paille (Straw Man)");

    const esPrompt = systemPrompt({ language: "es", webSearch: false });
    expect(esPrompt).toContain("ad_hominem (Ataque personal)");
    expect(esPrompt).toContain("homme_de_paille (Hombre de paja)");

    const frPrompt = systemPrompt({ language: "fr", webSearch: false });
    expect(frPrompt).toContain("ad_hominem (Attaque personnelle)");
    expect(frPrompt).toContain("homme_de_paille (Homme de paille)");
  });
});
