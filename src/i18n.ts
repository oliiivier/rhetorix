// Internationalisation de Rhetorix (décision D5).
// Prise en charge du français (fr), anglais (en), espagnol (es), allemand (de) et italien (it).

import type { Config } from "./config";
import { ext } from "./ext";
import type { FactStatus, Severity } from "./schema";
import type { Category } from "./taxonomy";

export type Language = "fr" | "en" | "es" | "de" | "it";
export const SUPPORTED_LANGUAGES: Language[] = ["fr", "en", "es", "de", "it"];

export interface UiStrings {
  // Panneau latéral
  panelTitle: string;
  analyzeBtn: string;
  reanalyzeBtn: string;
  cancelBtn: string;
  optionsBtnTitle: string;
  idleStatus: string;
  extractingStatus: string;
  analyzingStatus: string;
  analyzingPartStatus: (done: number, total: number) => string;
  consolidatingStatus: string;
  cancelledStatus: string;
  accessErrorStatus: string;
  needConfigStatus: string;
  apiPermissionError: string;
  summaryTitle: string;
  cacheNote: (date: string) => string;
  emptyResults: string;
  unlocatedQuote: string;
  factCheckLabel: string;
  sourcesLabel: string;
  privacyNotice: string;
  filterAll: string;
  categories: Record<Category, string>;
  categoriesPlural: Record<Category, string>;
  severities: Record<Severity, string>;
  factStatuses: Record<FactStatus, string>;

  // Options
  optionsTitle: string;
  providerLabel: string;
  endpointLabel: string;
  endpointHint: string;
  endpointOllamaHint: string;
  apiKeyLabel: string;
  apiKeyHint: string;
  modelLabel: string;
  languageLabel: string;
  webSearchLabel: string;
  webSearchHintAnthropic: string;
  webSearchHintUnavailable: string;
  webSearchHintGemini: string;
  maxChunkLabel: string;
  maxChunkHint: string;
  saveBtn: string;
  savedSuccess: string;
  savedPermissionDenied: string;
  cacheSectionTitle: string;
  clearCacheBtn: string;
  cacheCleared: string;
  privacySectionTitle: string;
  privacyText: string;
}

export const UI_TRANSLATIONS: Record<Language, UiStrings> = {
  fr: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Analyser la page",
    reanalyzeBtn: "Ré-analyser",
    cancelBtn: "Annuler",
    optionsBtnTitle: "Options",
    idleStatus: "Ouvrez un article puis lancez l'analyse.",
    extractingStatus: "Extraction de l'article…",
    analyzingStatus: "Analyse en cours…",
    analyzingPartStatus: (done, total) => `Analyse en cours… (${done}/${total} parties)`,
    consolidatingStatus: "Synthèse du résumé global…",
    cancelledStatus: "Analyse annulée.",
    accessErrorStatus:
      "Impossible d'accéder à cette page. Les pages internes du navigateur ne sont pas analysables ; " +
      "sinon, cliquez sur l'icône de Rhetorix depuis cet onglet pour autoriser l'accès.",
    needConfigStatus: "Configurez un fournisseur LLM dans les options (⚙) pour commencer.",
    apiPermissionError: "Accès à l'API du fournisseur refusé. Vérifiez l'endpoint dans les options.",
    summaryTitle: "Posture argumentative",
    cacheNote: (date) => `Analyse du ${date} (cache).`,
    emptyResults: "Aucun procédé rhétorique notable relevé.",
    unlocatedQuote: "Citation introuvable dans la page.",
    factCheckLabel: "Vérification :",
    sourcesLabel: "Sources :",
    privacyNotice: "Le texte de l'article est envoyé au fournisseur LLM configuré.",
    filterAll: "Tous",
    categories: {
      sophism: "Sophisme",
      bias: "Biais",
      factual_claim: "Allégation",
    },
    categoriesPlural: {
      sophism: "Sophismes",
      bias: "Biais",
      factual_claim: "Allégations",
    },
    severities: {
      high: "Élevée",
      medium: "Moyenne",
      low: "Faible",
    },
    factStatuses: {
      refuted: "Réfuté",
      supported: "Confirmé",
      misleading: "Trompeur",
      unverified: "Non vérifié",
    },

    optionsTitle: "Rhetorix — options",
    providerLabel: "Fournisseur",
    endpointLabel: "Endpoint",
    endpointHint: "URL de base de l'API ; /chat/completions y est ajouté.",
    endpointOllamaHint:
      'Pour Ollama en local (ex. http://localhost:11434/v1), lancez le serveur avec OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" pour autoriser l\'accès.',
    apiKeyLabel: "Clé API",
    apiKeyHint: "Stockée uniquement dans ce navigateur (stockage local, non synchronisé).",
    modelLabel: "Modèle",
    languageLabel: "Langue de l'analyse",
    webSearchLabel: "Vérifier les faits par recherche web",
    webSearchHintAnthropic: "Utilise l'outil de recherche web d'Anthropic (à activer pour votre organisation dans la console).",
    webSearchHintUnavailable: "Non disponible pour ce fournisseur : les vérifications seront marquées « non vérifié ».",
    webSearchHintGemini: "Pas encore disponible pour Gemini : les vérifications seront marquées « non vérifié ».",
    maxChunkLabel: "Taille maximale d'un morceau (tokens)",
    maxChunkHint: "Au-delà, l'article est découpé par paragraphes et analysé en plusieurs appels.",
    saveBtn: "Enregistrer",
    savedSuccess: "Enregistré.",
    savedPermissionDenied: "Enregistré, mais l'accès à l'API a été refusé.",
    cacheSectionTitle: "Cache des analyses",
    clearCacheBtn: "Vider le cache",
    cacheCleared: "Cache vidé.",
    privacySectionTitle: "Confidentialité",
    privacyText:
      "Le texte des articles analysés est envoyé au fournisseur configuré ci-dessus, et à lui seul. Rhetorix ne dispose d'aucun serveur.",
  },

  en: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Analyze page",
    reanalyzeBtn: "Re-analyze",
    cancelBtn: "Cancel",
    optionsBtnTitle: "Options",
    idleStatus: "Open an article then start analysis.",
    extractingStatus: "Extracting article…",
    analyzingStatus: "Analyzing…",
    analyzingPartStatus: (done, total) => `Analyzing… (${done}/${total} parts)`,
    consolidatingStatus: "Synthesizing overall summary…",
    cancelledStatus: "Analysis cancelled.",
    accessErrorStatus:
      "Cannot access this page. Browser internal pages cannot be analyzed; " +
      "otherwise, click the Rhetorix icon on this tab to grant access.",
    needConfigStatus: "Configure an LLM provider in options (⚙) to get started.",
    apiPermissionError: "Access to provider API denied. Check endpoint in options.",
    summaryTitle: "Argumentative stance",
    cacheNote: (date) => `Analysis from ${date} (cache).`,
    emptyResults: "No notable rhetorical device found.",
    unlocatedQuote: "Quote not found on page.",
    factCheckLabel: "Fact check:",
    sourcesLabel: "Sources:",
    privacyNotice: "Article text is sent directly to the configured LLM provider.",
    filterAll: "All",
    categories: {
      sophism: "Fallacy",
      bias: "Bias",
      factual_claim: "Factual claim",
    },
    categoriesPlural: {
      sophism: "Fallacies",
      bias: "Biases",
      factual_claim: "Factual claims",
    },
    severities: {
      high: "High",
      medium: "Medium",
      low: "Low",
    },
    factStatuses: {
      refuted: "Refuted",
      supported: "Supported",
      misleading: "Misleading",
      unverified: "Unverified",
    },

    optionsTitle: "Rhetorix — Options",
    providerLabel: "Provider",
    endpointLabel: "Endpoint",
    endpointHint: "Base API URL; /chat/completions is appended to it.",
    endpointOllamaHint:
      'For local Ollama (e.g. http://localhost:11434/v1), start with OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" to allow extension requests.',
    apiKeyLabel: "API Key",
    apiKeyHint: "Stored only in this browser (local storage, never synced).",
    modelLabel: "Model",
    languageLabel: "Analysis language",
    webSearchLabel: "Verify facts via web search",
    webSearchHintAnthropic: "Uses Anthropic web search tool (enable for your organization in console).",
    webSearchHintUnavailable: "Not available for this provider: fact checks will be marked as unverified.",
    webSearchHintGemini: "Not yet available for Gemini: fact checks will be marked as unverified.",
    maxChunkLabel: "Maximum chunk size (tokens)",
    maxChunkHint: "Beyond this limit, long articles are split by paragraphs and analyzed in batches.",
    saveBtn: "Save",
    savedSuccess: "Saved.",
    savedPermissionDenied: "Saved, but API access permission was denied.",
    cacheSectionTitle: "Analysis Cache",
    clearCacheBtn: "Clear cache",
    cacheCleared: "Cache cleared.",
    privacySectionTitle: "Privacy",
    privacyText:
      "Analyzed article text is sent strictly to your chosen LLM provider. Rhetorix has no central server.",
  },

  es: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Analizar página",
    reanalyzeBtn: "Reanalizar",
    cancelBtn: "Cancelar",
    optionsBtnTitle: "Opciones",
    idleStatus: "Abra un artículo e inicie el análisis.",
    extractingStatus: "Extrayendo artículo…",
    analyzingStatus: "Analizando…",
    analyzingPartStatus: (done, total) => `Analizando… (${done}/${total} partes)`,
    consolidatingStatus: "Sintetizando resumen global…",
    cancelledStatus: "Análisis cancelado.",
    accessErrorStatus:
      "No se puede acceder a esta página. Las páginas internas del navegador no son analizables; " +
      "de lo contrario, haga clic en el icono de Rhetorix en esta pestaña para conceder acceso.",
    needConfigStatus: "Configure un proveedor LLM en las opciones (⚙) para comenzar.",
    apiPermissionError: "Acceso a la API del proveedor denegado. Compruebe el endpoint en las opciones.",
    summaryTitle: "Postura argumentativa",
    cacheNote: (date) => `Análisis del ${date} (caché).`,
    emptyResults: "No se encontró ningún recurso retórico destacable.",
    unlocatedQuote: "Cita no encontrada en la página.",
    factCheckLabel: "Verificación:",
    sourcesLabel: "Fuentes:",
    privacyNotice: "El texto del artículo se envía al proveedor LLM configurado.",
    filterAll: "Todos",
    categories: {
      sophism: "Falacia",
      bias: "Sesgo",
      factual_claim: "Afirmación",
    },
    categoriesPlural: {
      sophism: "Falacias",
      bias: "Sesgos",
      factual_claim: "Afirmaciones",
    },
    severities: {
      high: "Alta",
      medium: "Media",
      low: "Baja",
    },
    factStatuses: {
      refuted: "Refutado",
      supported: "Confirmado",
      misleading: "Engañoso",
      unverified: "No verificado",
    },

    optionsTitle: "Rhetorix — Opciones",
    providerLabel: "Proveedor",
    endpointLabel: "Endpoint",
    endpointHint: "URL base de la API; se añade /chat/completions.",
    endpointOllamaHint:
      'Para Ollama en local (ej. http://localhost:11434/v1), ejecute con OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" para permitir el acceso.',
    apiKeyLabel: "Clave API",
    apiKeyHint: "Almacenada únicamente en este navegador (almacenamiento local, sin sincronizar).",
    modelLabel: "Modelo",
    languageLabel: "Idioma del análisis",
    webSearchLabel: "Verificar hechos mediante búsqueda web",
    webSearchHintAnthropic: "Utiliza la herramienta de búsqueda web de Anthropic.",
    webSearchHintUnavailable: "No disponible para este proveedor: las verificaciones se marcarán como «no verificado».",
    webSearchHintGemini: "Aún no disponible para Gemini: las verificaciones se marcarán como «no verificado».",
    maxChunkLabel: "Tamaño máximo de fragmento (tokens)",
    maxChunkHint: "A partir de este límite, el artículo se divide por párrafos y se analiza en varias llamadas.",
    saveBtn: "Guardar",
    savedSuccess: "Guardado.",
    savedPermissionDenied: "Guardado, pero el permiso de acceso a la API fue denegado.",
    cacheSectionTitle: "Caché de análisis",
    clearCacheBtn: "Vaciar caché",
    cacheCleared: "Caché vaciada.",
    privacySectionTitle: "Privacidad",
    privacyText:
      "El texto de los artículos analizados se envía únicamente al proveedor configurado. Rhetorix no dispone de servidor central.",
  },

  de: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Seite analysieren",
    reanalyzeBtn: "Erneut analysieren",
    cancelBtn: "Abbrechen",
    optionsBtnTitle: "Optionen",
    idleStatus: "Öffnen Sie einen Artikel und starten Sie die Analyse.",
    extractingStatus: "Artikel wird extrahiert…",
    analyzingStatus: "Analyse läuft…",
    analyzingPartStatus: (done, total) => `Analyse läuft… (${done}/${total} Teile)`,
    consolidatingStatus: "Gesamtzusammenfassung wird erstellt…",
    cancelledStatus: "Analyse abgebrochen.",
    accessErrorStatus:
      "Zugriff auf diese Seite nicht möglich. Interne Browserseiten können nicht analysiert werden; " +
      "klicken Sie andernfalls auf das Rhetorix-Symbol auf diesem Tab, um den Zugriff zu erlauben.",
    needConfigStatus: "Konfigurieren Sie einen LLM-Anbieter in den Optionen (⚙), um zu beginnen.",
    apiPermissionError: "Zugriff auf Anbieter-API verweigert. Prüfen Sie den Endpunkt in den Optionen.",
    summaryTitle: "Argumentative Haltung",
    cacheNote: (date) => `Analyse vom ${date} (Cache).`,
    emptyResults: "Keine auffälligen rhetorischen Mittel festgestellt.",
    unlocatedQuote: "Zitat auf der Seite nicht gefunden.",
    factCheckLabel: "Faktencheck:",
    sourcesLabel: "Quellen:",
    privacyNotice: "Der Text des Artikels wird an den konfigurierten LLM-Anbieter gesendet.",
    filterAll: "Alle",
    categories: {
      sophism: "Fehlschluss",
      bias: "Verzerrung",
      factual_claim: "Faktenbehauptung",
    },
    categoriesPlural: {
      sophism: "Fehlschlüsse",
      bias: "Verzerrungen",
      factual_claim: "Faktenbehauptungen",
    },
    severities: {
      high: "Hoch",
      medium: "Mittel",
      low: "Niedrig",
    },
    factStatuses: {
      refuted: "Widerlegt",
      supported: "Bestätigt",
      misleading: "Irreführend",
      unverified: "Ungeprüft",
    },

    optionsTitle: "Rhetorix — Optionen",
    providerLabel: "Anbieter",
    endpointLabel: "Endpunkt",
    endpointHint: "Basis-URL der API; /chat/completions wird angehängt.",
    endpointOllamaHint:
      'Für lokales Ollama (z. B. http://localhost:11434/v1) mit OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" starten, um Anfragen zu erlauben.',
    apiKeyLabel: "API-Schlüssel",
    apiKeyHint: "Nur lokal in diesem Browser gespeichert (keine Cloud-Synchronisierung).",
    modelLabel: "Modell",
    languageLabel: "Sprache der Analyse",
    webSearchLabel: "Fakten per Websuche überprüfen",
    webSearchHintAnthropic: "Verwendet das Websuche-Tool von Anthropic.",
    webSearchHintUnavailable: "Für diesen Anbieter nicht verfügbar: Prüfungen werden als «ungeprüft» markiert.",
    webSearchHintGemini: "Für Gemini noch nicht verfügbar: Prüfungen werden als «ungeprüft» markiert.",
    maxChunkLabel: "Maximale Stückgröße (Tokens)",
    maxChunkHint: "Darüber hinaus wird der Artikel nach Absätzen geteilt und in mehreren Anfragen analysiert.",
    saveBtn: "Speichern",
    savedSuccess: "Gespeichert.",
    savedPermissionDenied: "Gespeichert, aber der Zugriff auf die API wurde verweigert.",
    cacheSectionTitle: "Analyse-Cache",
    clearCacheBtn: "Cache leeren",
    cacheCleared: "Cache geleert.",
    privacySectionTitle: "Datenschutz",
    privacyText:
      "Der Text analysierter Artikel wird ausschließlich an den gewählten Anbieter gesendet. Rhetorix betreibt keinen eigenen Server.",
  },

  it: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Analizza pagina",
    reanalyzeBtn: "Rianalizza",
    cancelBtn: "Annulla",
    optionsBtnTitle: "Opzioni",
    idleStatus: "Apri un articolo e avvia l'analisi.",
    extractingStatus: "Estrazione dell'articolo…",
    analyzingStatus: "Analisi in corso…",
    analyzingPartStatus: (done, total) => `Analisi in corso… (${done}/${total} parti)`,
    consolidatingStatus: "Sintesi del riassunto globale…",
    cancelledStatus: "Analisi annullata.",
    accessErrorStatus:
      "Impossibile accedere a questa pagina. Le pagine interne del browser non sono analizzabili; " +
      "altrimenti fai clic sull'icona Rhetorix in questa scheda per concedere l'accesso.",
    needConfigStatus: "Configura un fornitore LLM nelle opzioni (⚙) per iniziare.",
    apiPermissionError: "Accesso all'API del fornitore negato. Verifica l'endpoint nelle opzioni.",
    summaryTitle: "Postura argomentativa",
    cacheNote: (date) => `Analisi del ${date} (cache).`,
    emptyResults: "Nessun artificio retorico rilevante individuato.",
    unlocatedQuote: "Citazione non trovata nella pagina.",
    factCheckLabel: "Verifica:",
    sourcesLabel: "Fonti:",
    privacyNotice: "Il testo dell'articolo viene inviato al fornitore LLM configurato.",
    filterAll: "Tutti",
    categories: {
      sophism: "Fallacia",
      bias: "Bias",
      factual_claim: "Affermazione",
    },
    categoriesPlural: {
      sophism: "Fallacie",
      bias: "Bias",
      factual_claim: "Affermazioni",
    },
    severities: {
      high: "Alta",
      medium: "Media",
      low: "Bassa",
    },
    factStatuses: {
      refuted: "Confutato",
      supported: "Confermato",
      misleading: "Fuorviante",
      unverified: "Non verificato",
    },

    optionsTitle: "Rhetorix — Opzioni",
    providerLabel: "Fornitore",
    endpointLabel: "Endpoint",
    endpointHint: "URL base dell'API; /chat/completions viene aggiunto automaticamente.",
    endpointOllamaHint:
      'Per Ollama in locale (es. http://localhost:11434/v1), avvia con OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" per autorizzare le richieste.',
    apiKeyLabel: "Chiave API",
    apiKeyHint: "Memorizzata esclusivamente in questo browser (storage locale, non sincronizzato).",
    modelLabel: "Modello",
    languageLabel: "Lingua dell'analisi",
    webSearchLabel: "Verifica i fatti tramite ricerca web",
    webSearchHintAnthropic: "Utilizza lo strumento di ricerca web di Anthropic.",
    webSearchHintUnavailable: "Non disponibile per questo fornitore: le verifiche saranno contrassegnate come «non verificato».",
    webSearchHintGemini: "Non ancora disponibile per Gemini: le verifiche saranno contrassegnate come «non verificato».",
    maxChunkLabel: "Dimensione massima porzione (token)",
    maxChunkHint: "Oltre questo limite, l'articolo viene suddiviso in paragrafi e analizzato in più chiamate.",
    saveBtn: "Salva",
    savedSuccess: "Salvato.",
    savedPermissionDenied: "Salvato, ma l'autorizzazione di accesso all'API è stata negata.",
    cacheSectionTitle: "Cache delle analisi",
    clearCacheBtn: "Svuota cache",
    cacheCleared: "Cache svuotata.",
    privacySectionTitle: "Privacy",
    privacyText:
      "Il testo degli articoli analizzati viene inviato esclusivamente al fornitore configurato. Rhetorix non dispone di alcun server centrale.",
  },
};

export function normalizeLanguage(lang: string | undefined): Language {
  if (!lang || lang === "auto") {
    const uiLang = typeof ext !== "undefined" && ext.i18n ? ext.i18n.getUILanguage() : "fr";
    return normalizeLanguage(uiLang);
  }
  const prefix = lang.slice(0, 2).toLowerCase() as Language;
  return SUPPORTED_LANGUAGES.includes(prefix) ? prefix : "fr";
}

export function getUiStrings(langOrConfig?: string | Config): UiStrings {
  if (!langOrConfig) return UI_TRANSLATIONS.fr;
  const langCode = typeof langOrConfig === "string" ? langOrConfig : langOrConfig.language;
  const norm = normalizeLanguage(langCode);
  return UI_TRANSLATIONS[norm] ?? UI_TRANSLATIONS.fr;
}
