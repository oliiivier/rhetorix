// Internationalisation de Rhetorix (décision D5).
// Prise en charge du français (fr), anglais (en), espagnol (es), allemand (de) et italien (it).

import type { Config, DisplayMode } from "./config";
import { ext } from "./ext";
import type { ProviderErrorCode } from "./providers/types";
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
  internalPageNotice: string;
  needConfigStatus: string;
  apiPermissionError: string;
  extractNoArticleError: string;
  extractEmptyArticleError: string;
  summaryTitle: string;
  cacheNote: (date: string) => string;
  emptyResults: string;
  unlocatedQuote: string;
  factCheckLabel: string;
  sourcesLabel: string;
  privacyNotice: string;
  filterAll: string;
  displayModes: Record<DisplayMode, string>;
  inlineModeNotice: string;
  categories: Record<Category, string>;
  categoriesPlural: Record<Category, string>;
  severities: Record<Severity, string>;
  factStatuses: Record<FactStatus, string>;

  // Options
  optionsTitle: string;
  displayModeLabel: string;
  displayModeHint: string;
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
  webSearchHintOpenAi: string;
  maxChunkLabel: string;
  maxChunkHint: string;
  saveBtn: string;
  savedSuccess: string;
  savedPermissionDenied: string;
  invalidEndpoint: string;
  errorPrefix: (msg: string) => string;
  cacheSectionTitle: string;
  clearCacheBtn: string;
  cacheCleared: string;
  privacySectionTitle: string;
  privacyText: string;
  getGeminiKeyBtn: string;
  getAnthropicKeyBtn: string;
  presetOllamaBtn: string;
  presetOllamaSuccess: string;
  presetClaudeBridgeBtn: string;
  presetClaudeBridgeSuccess: string;
  chromeAiOption: string;
  chromeAiHint: string;
  apiKeyPlaceholderOllama: string;
  refreshModelsBtn: string;
  refreshingModels: string;
  modelsFound: (count: number) => string;
  modelHint: string;
  toggleCustomModelBtn: string;
  toggleSelectModelBtn: string;
  anthropicAuthModeLabel: string;
  anthropicModeApiKey: string;
  anthropicModeOAuth: string;
  apiKeyLabelOAuth: string;
  apiKeyHintOAuth: string;
  copySetupTokenBtn: string;
  copiedToClipboard: string;

  // Erreurs providers
  providerErrors: Record<ProviderErrorCode, (detail?: string) => string>;
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
      "Impossible d'accéder au contenu de cette page. Les pages internes du navigateur et les boutiques d'extensions ne sont pas analysables.",
    internalPageNotice:
      "Ouvrez un article en ligne pour lancer l'analyse (les pages internes du navigateur ne sont pas analysables).",
    needConfigStatus: "Configurez un fournisseur LLM dans les options (⚙) pour commencer.",
    apiPermissionError: "Accès à l'API du fournisseur refusé. Vérifiez l'endpoint dans les options.",
    extractNoArticleError: "Aucun contenu d'article détecté sur cette page.",
    extractEmptyArticleError: "L'article extrait est vide.",
    summaryTitle: "Posture argumentative",
    cacheNote: (date) => `Analyse du ${date} (cache).`,
    emptyResults: "Aucun procédé rhétorique notable relevé.",
    unlocatedQuote: "Citation introuvable dans la page.",
    factCheckLabel: "Vérification :",
    sourcesLabel: "Sources :",
    privacyNotice: "Le texte de l'article est envoyé au fournisseur LLM configuré.",
    filterAll: "Tous",
    displayModes: {
      both: "Combiné (panneau et bulles)",
      inline: "Bulles au survol uniquement",
      sidepanel: "Panneau latéral uniquement",
    },
    inlineModeNotice: "Mode bulles au survol actif. Survolez les passages surlignés dans la page pour consulter les analyses.",
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

    optionsTitle: "Rhetorix — Options",
    displayModeLabel: "Mode d'affichage",
    displayModeHint: "Choisissez si les annotations s'affichent sous forme de bulles au survol du texte, dans le panneau latéral, ou les deux.",
    providerLabel: "Fournisseur",
    endpointLabel: "Endpoint",
    endpointHint: "URL de base de l'API ; <code>/chat/completions</code> y est ajouté.",
    endpointOllamaHint:
      'Pour Ollama en local (ex. <code>http://localhost:11434/v1</code>), lancez le serveur avec <code>OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*"</code> pour autoriser l\'accès.',
    apiKeyLabel: "Clé API",
    apiKeyHint: "Stockée uniquement dans ce navigateur (stockage local, non synchronisé).",
    modelLabel: "Modèle",
    languageLabel: "Langue de l'analyse",
    webSearchLabel: "Vérifier les faits par recherche web",
    webSearchHintAnthropic: "Utilise l'outil de recherche web d'Anthropic.",
    webSearchHintUnavailable: "Indisponible pour ce fournisseur : les vérifications restent en « non vérifié ».",
    webSearchHintGemini:
      "Utilise le grounding Google Search. Attention : nécessite un compte de facturation (Pay-as-you-go). Décochez cette case pour utiliser le quota 100% gratuit de Google AI Studio.",
    webSearchHintOpenAi:
      "Actif si l'endpoint supporte la recherche web (Perplexity, OpenRouter :online…). Avec Ollama ou Mistral sans recherche, les allégations restent en « non vérifié ».",
    maxChunkLabel: "Taille maximale d'un morceau (tokens)",
    maxChunkHint: "Au-delà de cette taille, l'article est découpé par paragraphes et analysé en plusieurs appels.",
    saveBtn: "Enregistrer",
    savedSuccess: "Configuration enregistrée.",
    savedPermissionDenied: "Configuration enregistrée, mais la permission d'accès à l'API a été refusée.",
    invalidEndpoint: "Endpoint invalide.",
    errorPrefix: (msg) => `Erreur : ${msg}`,
    cacheSectionTitle: "Cache des analyses",
    clearCacheBtn: "Vider le cache",
    cacheCleared: "Cache vidé.",
    privacySectionTitle: "Vie privée",
    privacyText:
      "Le texte des articles analysés est envoyé uniquement au fournisseur que vous avez configuré. Rhetorix ne dispose d'aucun serveur central.",
    getGeminiKeyBtn: "✨ Obtenir une clé Gemini gratuite (Google AI Studio) ↗",
    getAnthropicKeyBtn: "Obtenir une clé Anthropic ↗",
    presetOllamaBtn: "🦙 Configurer pour Ollama local (zéro clé)",
    presetOllamaSuccess: "Paramètres appliqués pour Ollama local (http://localhost:11434/v1, mistral).",
    presetClaudeBridgeBtn: "⚡ Configurer pour le pont Claude Code local (Abonnement)",
    presetClaudeBridgeSuccess:
      "Paramètres appliqués pour le pont Claude Code local (http://localhost:8080/v1). Lancez 'npm run bridge' dans le terminal.",
    chromeAiOption: "Chrome Built-in AI (Gemini Nano local, sans clé)",
    chromeAiHint: "Exécution 100% locale via Gemini Nano. Aucune clé API ni compte requis, gratuit et confidentiel.",
    apiKeyPlaceholderOllama: "Facultatif pour Ollama / LM Studio local",
    refreshModelsBtn: "🔄 Actualiser les modèles",
    refreshingModels: "Recherche des modèles disponibles…",
    modelsFound: (count) => `${count} modèle(s) disponible(s).`,
    modelHint: "Sélectionnez un modèle dans la liste ou passez en saisie libre.",
    toggleCustomModelBtn: "✍️ Saisie libre",
    toggleSelectModelBtn: "📋 Choisir dans la liste",
    anthropicAuthModeLabel: "Mode d'authentification Anthropic",
    anthropicModeApiKey: "🔑 Clé API (Pay-as-you-go)",
    anthropicModeOAuth: "⚡ Abonnement Claude (OAuth)",
    apiKeyLabelOAuth: "Token OAuth Claude Code (Abonnement)",
    apiKeyHintOAuth:
      "Générez votre token dans un terminal avec 'claude setup-token' puis collez-le ici. Vos requêtes seront imputées à votre abonnement Claude Pro / Max.",
    copySetupTokenBtn: "📋 Copier 'claude setup-token'",
    copiedToClipboard: "Copié dans le presse-papiers !",

    providerErrors: {
      refusal: (detail) => (detail ? `Refus du modèle : ${detail}` : "Le modèle a refusé d'analyser ce contenu."),
      max_tokens: () => "Réponse tronquée (max_tokens atteint). Réduire la taille des morceaux dans les options.",
      no_structured_output: () => "Le modèle n'a pas renvoyé d'analyse structurée.",
      too_many_turns: () => "Trop de reprises de la recherche web.",
      empty_response: () => "Réponse vide du fournisseur.",
      invalid_json: () => "La réponse du fournisseur n'est pas un JSON valide.",
      empty_consolidated: () => "Résumé consolidé vide.",
      blocked: (detail) => (detail ? `Requête bloquée (${detail}).` : "Requête bloquée par les filtres de sécurité."),
      http_error: (detail) => (detail ? `Erreur du fournisseur : ${detail}` : "Erreur de communication avec le fournisseur."),
    },
  },

  en: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Analyze page",
    reanalyzeBtn: "Re-analyze",
    cancelBtn: "Cancel",
    optionsBtnTitle: "Options",
    idleStatus: "Open an article and start the analysis.",
    extractingStatus: "Extracting article…",
    analyzingStatus: "Analyzing…",
    analyzingPartStatus: (done, total) => `Analyzing… (${done}/${total} parts)`,
    consolidatingStatus: "Synthesizing overall summary…",
    cancelledStatus: "Analysis cancelled.",
    accessErrorStatus:
      "Cannot access this page. Browser internal pages and extension stores cannot be analyzed.",
    internalPageNotice:
      "Open an online article to start analysis (browser internal pages cannot be analyzed).",
    needConfigStatus: "Configure an LLM provider in options (⚙) to get started.",
    apiPermissionError: "Provider API access denied. Check the endpoint in options.",
    extractNoArticleError: "No article content detected on this page.",
    extractEmptyArticleError: "The extracted article is empty.",
    summaryTitle: "Argumentative stance",
    cacheNote: (date) => `Analysis from ${date} (cached).`,
    emptyResults: "No significant rhetorical devices found.",
    unlocatedQuote: "Quote could not be located in the page.",
    factCheckLabel: "Fact-check:",
    sourcesLabel: "Sources:",
    privacyNotice: "Article text is sent to the configured LLM provider.",
    filterAll: "All",
    displayModes: {
      both: "Combined (panel & hover bubbles)",
      inline: "Hover bubbles only",
      sidepanel: "Side panel only",
    },
    inlineModeNotice: "Hover bubbles mode active. Hover over highlighted text in the page to view analyses.",
    categories: {
      sophism: "Fallacy",
      bias: "Bias",
      factual_claim: "Claim",
    },
    categoriesPlural: {
      sophism: "Fallacies",
      bias: "Biases",
      factual_claim: "Claims",
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
    displayModeLabel: "Display mode",
    displayModeHint: "Choose whether annotations appear as hover bubbles over the text, in the side panel, or both.",
    providerLabel: "Provider",
    endpointLabel: "Endpoint",
    endpointHint: "API base URL; <code>/chat/completions</code> is appended.",
    endpointOllamaHint:
      'For local Ollama (e.g. <code>http://localhost:11434/v1</code>), start server with <code>OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*"</code> to allow requests.',
    apiKeyLabel: "API Key",
    apiKeyHint: "Stored exclusively in this browser (local storage, not synced).",
    modelLabel: "Model",
    languageLabel: "Analysis language",
    webSearchLabel: "Verify facts via web search",
    webSearchHintAnthropic: "Uses Anthropic web search tool.",
    webSearchHintUnavailable: "Unavailable for this provider: fact-checks will remain 'unverified'.",
    webSearchHintGemini:
      "Uses Google Search grounding. Note: requires a billing account (Pay-as-you-go). Uncheck this box to use Google AI Studio's 100% free quota.",
    webSearchHintOpenAi:
      "Active if the endpoint supports web search (Perplexity, OpenRouter :online…). With Ollama or Mistral without search, claims remain 'unverified'.",
    maxChunkLabel: "Max chunk size (tokens)",
    maxChunkHint: "Beyond this limit, the article is split by paragraphs and analyzed across multiple calls.",
    saveBtn: "Save",
    savedSuccess: "Configuration saved.",
    savedPermissionDenied: "Configuration saved, but API access permission was denied.",
    invalidEndpoint: "Invalid endpoint.",
    errorPrefix: (msg) => `Error: ${msg}`,
    cacheSectionTitle: "Analysis cache",
    clearCacheBtn: "Clear cache",
    cacheCleared: "Cache cleared.",
    privacySectionTitle: "Privacy",
    privacyText:
      "The text of analyzed articles is sent exclusively to the provider you configured. Rhetorix does not run any central server.",
    getGeminiKeyBtn: "✨ Get a free Gemini API key (Google AI Studio) ↗",
    getAnthropicKeyBtn: "Get an Anthropic API key ↗",
    presetOllamaBtn: "🦙 Configure for local Ollama (no key)",
    presetOllamaSuccess: "Settings applied for local Ollama (http://localhost:11434/v1, mistral).",
    presetClaudeBridgeBtn: "⚡ Configure for local Claude Code bridge (Subscription)",
    presetClaudeBridgeSuccess:
      "Settings applied for local Claude Code bridge (http://localhost:8080/v1). Run 'npm run bridge' in the terminal.",
    chromeAiOption: "Chrome Built-in AI (local Gemini Nano, no key)",
    chromeAiHint: "Runs 100% locally with Gemini Nano. No API key or account required, free and private.",
    apiKeyPlaceholderOllama: "Optional for local Ollama / LM Studio",
    refreshModelsBtn: "🔄 Refresh models",
    refreshingModels: "Fetching available models…",
    modelsFound: (count) => `${count} model(s) available.`,
    modelHint: "Select a model from the list or switch to custom input.",
    toggleCustomModelBtn: "✍️ Custom input",
    toggleSelectModelBtn: "📋 Choose from list",
    anthropicAuthModeLabel: "Anthropic authentication mode",
    anthropicModeApiKey: "🔑 API Key (Pay-as-you-go)",
    anthropicModeOAuth: "⚡ Claude Subscription (OAuth)",
    apiKeyLabelOAuth: "Claude Code OAuth Token (Subscription)",
    apiKeyHintOAuth:
      "Generate your token in a terminal with 'claude setup-token' then paste it here. Requests will be billed to your Claude Pro / Max subscription.",
    copySetupTokenBtn: "📋 Copy 'claude setup-token'",
    copiedToClipboard: "Copied to clipboard!",

    providerErrors: {
      refusal: (detail) => (detail ? `Model refusal: ${detail}` : "The model refused to analyze this content."),
      max_tokens: () => "Response truncated (max_tokens reached). Reduce chunk size in options.",
      no_structured_output: () => "The model did not return a structured analysis.",
      too_many_turns: () => "Too many web search retry turns.",
      empty_response: () => "Empty response from provider.",
      invalid_json: () => "Provider response is not valid JSON.",
      empty_consolidated: () => "Consolidated summary is empty.",
      blocked: (detail) => (detail ? `Request blocked (${detail}).` : "Request blocked by safety filters."),
      http_error: (detail) => (detail ? `Provider error: ${detail}` : "Communication error with provider."),
    },
  },

  es: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Analizar la página",
    reanalyzeBtn: "Reanalizar",
    cancelBtn: "Cancelar",
    optionsBtnTitle: "Opciones",
    idleStatus: "Abra un artículo e inicie el análisis.",
    extractingStatus: "Extrayendo el artículo…",
    analyzingStatus: "Analizando…",
    analyzingPartStatus: (done, total) => `Analizando… (${done}/${total} partes)`,
    consolidatingStatus: "Sintetizando el resumen global…",
    cancelledStatus: "Análisis cancelado.",
    accessErrorStatus:
      "No se puede acceder a esta página. Las páginas internas del navegador y las tiendas de extensiones no se pueden analizar.",
    internalPageNotice:
      "Abra un artículo en línea para iniciar el análisis (las páginas internas del navegador no son analizables).",
    needConfigStatus: "Configure un proveedor LLM en las opciones (⚙) para comenzar.",
    apiPermissionError: "Acceso a la API del proveedor denegado. Compruebe el endpoint en las opciones.",
    extractNoArticleError: "No se detectó contenido de artículo en esta página.",
    extractEmptyArticleError: "El artículo extraído está vacío.",
    summaryTitle: "Postura argumentativa",
    cacheNote: (date) => `Análisis del ${date} (caché).`,
    emptyResults: "No se detectaron recursos retóricos relevantes.",
    unlocatedQuote: "Cita no encontrada en la página.",
    factCheckLabel: "Verificación:",
    sourcesLabel: "Fuentes:",
    privacyNotice: "El texto del artículo se envía al proveedor LLM configurado.",
    filterAll: "Todos",
    displayModes: {
      both: "Combinado (panel y burbujas)",
      inline: "Solo burbujas al pasar el cursor",
      sidepanel: "Solo panel lateral",
    },
    inlineModeNotice: "Modo burbujas activo. Pase el cursor sobre el texto resaltado en la página para ver los análisis.",
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
    displayModeLabel: "Modo de visualización",
    displayModeHint: "Elija si las anotaciones se muestran como burbujas al pasar el cursor sobre el texto, en el panel lateral o ambos.",
    providerLabel: "Proveedor",
    endpointLabel: "Endpoint",
    endpointHint: "URL base de la API; se añade <code>/chat/completions</code>.",
    endpointOllamaHint:
      'Para Ollama en local (ej. <code>http://localhost:11434/v1</code>), inicie el servidor con <code>OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*"</code> para autorizar solicitudes.',
    apiKeyLabel: "Clave API",
    apiKeyHint: "Almacenada exclusivamente en este navegador (almacenamiento local, no sincronizado).",
    modelLabel: "Modelo",
    languageLabel: "Idioma del análisis",
    webSearchLabel: "Verificar hechos mediante búsqueda web",
    webSearchHintAnthropic: "Utiliza la herramienta de búsqueda web de Anthropic.",
    webSearchHintUnavailable: "No disponible para este proveedor: las verificaciones permanecerán como 'no verificado'.",
    webSearchHintGemini:
      "Utiliza Google Search grounding. Nota: requiere una cuenta de facturación (Pay-as-you-go). Desmarque esta casilla para usar la cuota 100% gratuita de Google AI Studio.",
    webSearchHintOpenAi:
      "Activo si el endpoint admite búsqueda web (Perplexity, OpenRouter :online…). Con Ollama o Mistral sin búsqueda, las afirmaciones permanecen como 'no verificado'.",
    maxChunkLabel: "Tamaño máximo de fragmento (tokens)",
    maxChunkHint: "Más allá de este límite, el artículo se divide por párrafos y se analiza en varias llamadas.",
    saveBtn: "Guardar",
    savedSuccess: "Configuración guardada.",
    savedPermissionDenied: "Configuración guardada, pero se denegó el permiso de acceso a la API.",
    invalidEndpoint: "Endpoint no válido.",
    errorPrefix: (msg) => `Error: ${msg}`,
    cacheSectionTitle: "Caché de análisis",
    clearCacheBtn: "Vaciar caché",
    cacheCleared: "Caché vaciada.",
    privacySectionTitle: "Privacidad",
    privacyText:
      "El texto de los artículos analizados se envía únicamente al proveedor que haya configurado. Rhetorix no dispone de ningún servidor central.",
    getGeminiKeyBtn: "✨ Obtener una clave Gemini gratuita (Google AI Studio) ↗",
    getAnthropicKeyBtn: "Obtener una clave Anthropic ↗",
    presetOllamaBtn: "🦙 Configurar para Ollama local (sin clave)",
    presetOllamaSuccess: "Ajustes aplicados para Ollama local (http://localhost:11434/v1, mistral).",
    presetClaudeBridgeBtn: "⚡ Configurar para el puente local de Claude Code (Suscripción)",
    presetClaudeBridgeSuccess:
      "Ajustes aplicados para el puente local de Claude Code (http://localhost:8080/v1). Ejecute 'npm run bridge' en el terminal.",
    chromeAiOption: "Chrome Built-in AI (Gemini Nano local, sin clave)",
    chromeAiHint: "Ejecución 100% local con Gemini Nano. Sin clave API ni cuenta, gratuito y privado.",
    apiKeyPlaceholderOllama: "Opcional para Ollama / LM Studio local",
    refreshModelsBtn: "🔄 Actualizar modelos",
    refreshingModels: "Buscando modelos disponibles…",
    modelsFound: (count) => `${count} modelo(s) disponible(s).`,
    modelHint: "Seleccione un modelo de la lista o cambie a entrada libre.",
    toggleCustomModelBtn: "✍️ Entrada libre",
    toggleSelectModelBtn: "📋 Elegir de la lista",
    anthropicAuthModeLabel: "Modo de autenticación de Anthropic",
    anthropicModeApiKey: "🔑 Clave API (Pay-as-you-go)",
    anthropicModeOAuth: "⚡ Suscripción Claude (OAuth)",
    apiKeyLabelOAuth: "Token OAuth de Claude Code (Suscripción)",
    apiKeyHintOAuth:
      "Genere su token en un terminal con 'claude setup-token' y péguelo aquí. Las solicitudes se cargarán a su suscripción Claude Pro / Max.",
    copySetupTokenBtn: "📋 Copiar 'claude setup-token'",
    copiedToClipboard: "¡Copiado al portapapeles!",

    providerErrors: {
      refusal: (detail) => (detail ? `Rechazo del modelo: ${detail}` : "El modelo rechazó analizar este contenido."),
      max_tokens: () => "Respuesta truncada (límite de tokens alcanzado). Reduzca el tamaño de los fragmentos en las opciones.",
      no_structured_output: () => "El modelo no devolvió un análisis estructurado.",
      too_many_turns: () => "Demasiados intentos de búsqueda web.",
      empty_response: () => "Respuesta vacía del proveedor.",
      invalid_json: () => "La respuesta del proveedor no es un JSON válido.",
      empty_consolidated: () => "El resumen consolidado está vacío.",
      blocked: (detail) => (detail ? `Solicitud bloqueada (${detail}).` : "Solicitud bloqueada por filtros de seguridad."),
      http_error: (detail) => (detail ? `Error del proveedor: ${detail}` : "Error de comunicación con el proveedor."),
    },
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
    analyzingPartStatus: (done, total) => `Analyse läuft… (${done}/${total} Abschnitte)`,
    consolidatingStatus: "Gesamtzusammenfassung wird erstellt…",
    cancelledStatus: "Analyse abgebrochen.",
    accessErrorStatus:
      "Auf diese Seite kann nicht zugegriffen werden. Interne Browserseiten und Add-on-Stores können nicht analysiert werden.",
    internalPageNotice:
      "Öffnen Sie einen Online-Artikel, um die Analyse zu starten (interne Browserseiten können nicht analysiert werden).",
    needConfigStatus: "Konfigurieren Sie einen LLM-Anbieter in den Optionen (⚙), um zu beginnen.",
    apiPermissionError: "Zugriff auf die Anbieter-API verweigert. Überprüfen Sie den Endpunkt in den Optionen.",
    extractNoArticleError: "Kein Artikelinhalt auf dieser Seite erkannt.",
    extractEmptyArticleError: "Der extrahierte Artikel ist leer.",
    summaryTitle: "Argumentative Haltung",
    cacheNote: (date) => `Analyse vom ${date} (Cache).`,
    emptyResults: "Keine auffälligen rhetorischen Mittel festgestellt.",
    unlocatedQuote: "Zitat auf der Seite nicht gefunden.",
    factCheckLabel: "Faktencheck:",
    sourcesLabel: "Quellen:",
    privacyNotice: "Der Artikeltext wird an den konfigurierten LLM-Anbieter gesendet.",
    filterAll: "Alle",
    displayModes: {
      both: "Kombiniert (Panel & Hover-Blasen)",
      inline: "Nur Hover-Blasen",
      sidepanel: "Nur Seitenleiste",
    },
    inlineModeNotice: "Hover-Blasen-Modus aktiv. Bewegen Sie den Mauszeiger über hervorgehobenen Text auf der Seite, um Analysen anzuzeigen.",
    categories: {
      sophism: "Trugschluss",
      bias: "Verzerrung",
      factual_claim: "Behauptung",
    },
    categoriesPlural: {
      sophism: "Trugschlüsse",
      bias: "Verzerrungen",
      factual_claim: "Behauptungen",
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
      unverified: "Nicht überprüft",
    },

    optionsTitle: "Rhetorix — Optionen",
    displayModeLabel: "Anzeigemodus",
    displayModeHint: "Wählen Sie, ob Anmerkungen als Hover-Blasen über dem Text, in der Seitenleiste oder in beiden angezeigt werden.",
    providerLabel: "Anbieter",
    endpointLabel: "Endpunkt",
    endpointHint: "Basis-URL der API; <code>/chat/completions</code> wird angehängt.",
    endpointOllamaHint:
      'Für lokales Ollama (z. B. <code>http://localhost:11434/v1</code>), starten Sie den Server mit <code>OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*"</code>, um Anfragen zu erlauben.',
    apiKeyLabel: "API-Schlüssel",
    apiKeyHint: "Wird ausschließlich in diesem Browser gespeichert (lokaler Speicher, nicht synchronisiert).",
    modelLabel: "Modell",
    languageLabel: "Analysesprache",
    webSearchLabel: "Fakten per Websuche prüfen",
    webSearchHintAnthropic: "Nutzt das native Websuche-Tool von Anthropic.",
    webSearchHintUnavailable: "Für diesen Anbieter nicht verfügbar: Überprüfungen bleiben 'nicht überprüft'.",
    webSearchHintGemini:
      "Nutzt Google Search Grounding. Hinweis: Erfordert ein Pay-as-you-go-Abrechnungskonto. Deaktivieren Sie dieses Kontrollkästchen, um das 100% kostenlose Kontingent von Google AI Studio zu nutzen.",
    webSearchHintOpenAi:
      "Aktiv, wenn der Endpunkt Websuche unterstützt (Perplexity, OpenRouter :online…). Bei Ollama oder Mistral ohne Suche bleiben Behauptungen 'nicht überprüft'.",
    maxChunkLabel: "Maximale Blockgröße (Tokens)",
    maxChunkHint: "Jenseits dieser Grenze wird der Artikel in Absätze unterteilt und über mehrere Aufrufe analysiert.",
    saveBtn: "Speichern",
    savedSuccess: "Konfiguration gespeichert.",
    savedPermissionDenied: "Konfiguration gespeichert, aber die Zugriffsberechtigung für die API wurde verweigert.",
    invalidEndpoint: "Ungültiger Endpunkt.",
    errorPrefix: (msg) => `Fehler: ${msg}`,
    cacheSectionTitle: "Analyse-Cache",
    clearCacheBtn: "Cache leeren",
    cacheCleared: "Cache geleert.",
    privacySectionTitle: "Datenschutz",
    privacyText:
      "Der Text analysierter Artikel wird ausschließlich an den von Ihnen konfigurierten Anbieter gesendet. Rhetorix betreibt keinen zentralen Server.",
    getGeminiKeyBtn: "✨ Kostenlosen Gemini-API-Schlüssel holen (Google AI Studio) ↗",
    getAnthropicKeyBtn: "Anthropic-API-Schlüssel holen ↗",
    presetOllamaBtn: "🦙 Für lokales Ollama vorkonfigurieren (kein Schlüssel)",
    presetOllamaSuccess: "Einstellungen für lokales Ollama angewendet (http://localhost:11434/v1, mistral).",
    presetClaudeBridgeBtn: "⚡ Für lokale Claude Code-Bridge konfigurieren (Abonnement)",
    presetClaudeBridgeSuccess:
      "Einstellungen für lokale Claude Code-Bridge angewendet (http://localhost:8080/v1). Führen Sie 'npm run bridge' im Terminal aus.",
    chromeAiOption: "Chrome Built-in AI (lokales Gemini Nano, ohne Schlüssel)",
    chromeAiHint: "Läuft zu 100% lokal mit Gemini Nano. Kein API-Schlüssel oder Konto erforderlich, kostenlos und privat.",
    apiKeyPlaceholderOllama: "Optional für lokales Ollama / LM Studio",
    refreshModelsBtn: "🔄 Modelle aktualisieren",
    refreshingModels: "Verfügbare Modelle werden abgerufen…",
    modelsFound: (count) => `${count} Modell(e) verfügbar.`,
    modelHint: "Wählen Sie ein Modell aus der Liste oder wechseln Sie zur freien Eingabe.",
    toggleCustomModelBtn: "✍️ Freie Eingabe",
    toggleSelectModelBtn: "📋 Aus Liste wählen",
    anthropicAuthModeLabel: "Anthropic-Authentifizierungsmodus",
    anthropicModeApiKey: "🔑 API-Schlüssel (Pay-as-you-go)",
    anthropicModeOAuth: "⚡ Claude-Abonnement (OAuth)",
    apiKeyLabelOAuth: "Claude Code OAuth-Token (Abonnement)",
    apiKeyHintOAuth:
      "Generieren Sie Ihr Token in einem Terminal mit 'claude setup-token' und fügen Sie es hier ein. Anfragen werden Ihrem Claude Pro / Max-Abonnement angerechnet.",
    copySetupTokenBtn: "📋 'claude setup-token' kopieren",
    copiedToClipboard: "In die Zwischenablage kopiert!",

    providerErrors: {
      refusal: (detail) => (detail ? `Ablehnung durch das Modell: ${detail}` : "Das Modell hat die Analyse dieses Inhalts abgelehnt."),
      max_tokens: () => "Antwort abgeschnitten (max_tokens erreicht). Reduzieren Sie die Blockgröße in den Optionen.",
      no_structured_output: () => "Das Modell hat keine strukturierte Analyse zurückgegeben.",
      too_many_turns: () => "Zu viele Versuche bei der Websuche.",
      empty_response: () => "Leere Antwort vom Anbieter.",
      invalid_json: () => "Die Antwort des Anbieters ist kein gültiges JSON.",
      empty_consolidated: () => "Zusammenfassung ist leer.",
      blocked: (detail) => (detail ? `Anfrage blockiert (${detail}).` : "Anfrage durch Sicherheitsfilter blockiert."),
      http_error: (detail) => (detail ? `Anbieterfehler: ${detail}` : "Kommunikationsfehler mit dem Anbieter."),
    },
  },

  it: {
    panelTitle: "Rhetorix",
    analyzeBtn: "Analizza la pagina",
    reanalyzeBtn: "Rianalizza",
    cancelBtn: "Annulla",
    optionsBtnTitle: "Opzioni",
    idleStatus: "Apri un articolo e avvia l'analisi.",
    extractingStatus: "Estrazione dell'articolo…",
    analyzingStatus: "Analisi in corso…",
    analyzingPartStatus: (done, total) => `Analisi in corso… (${done}/${total} parti)`,
    consolidatingStatus: "Sintesi del riassunto generale…",
    cancelledStatus: "Analisi annullata.",
    accessErrorStatus:
      "Impossibile accedere al contenuto di questa pagina. Le pagine interne del browser e gli store di estensioni non sono analizzabili.",
    internalPageNotice:
      "Apri un articolo online per avviare l'analisi (le pagine interne del browser non sono analizzabili).",
    needConfigStatus: "Configura un fornitore LLM nelle opzioni (⚙) per iniziare.",
    apiPermissionError: "Accesso all'API del fornitore negato. Verifica l'endpoint nelle opzioni.",
    extractNoArticleError: "Nessun contenuto di articolo rilevato su questa pagina.",
    extractEmptyArticleError: "L'articolo estratto è vuoto.",
    summaryTitle: "Postura argomentativa",
    cacheNote: (date) => `Analisi del ${date} (cache).`,
    emptyResults: "Nessun artificio retorico rilevante individuato.",
    unlocatedQuote: "Citazione non trovata nella pagina.",
    factCheckLabel: "Verifica:",
    sourcesLabel: "Fonti:",
    privacyNotice: "Il testo dell'articolo viene inviato al fornitore LLM configurato.",
    filterAll: "Tutti",
    displayModes: {
      both: "Combinato (pannello e fumetti)",
      inline: "Solo fumetti al passaggio del mouse",
      sidepanel: "Solo pannello laterale",
    },
    inlineModeNotice: "Modalità fumetti attiva. Passa il cursore sul testo evidenziato nella pagina per visualizzare le analisi.",
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
    displayModeLabel: "Modalità di visualizzazione",
    displayModeHint: "Scegli se visualizzare le annotazioni come fumetti al passaggio del mouse sul testo, nel pannello laterale o entrambi.",
    providerLabel: "Fornitore",
    endpointLabel: "Endpoint",
    endpointHint: "URL base dell'API; <code>/chat/completions</code> viene aggiunto automaticamente.",
    endpointOllamaHint:
      'Per Ollama in locale (es. <code>http://localhost:11434/v1</code>), avvia con <code>OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*"</code> per autorizzare le richieste.',
    apiKeyLabel: "Chiave API",
    apiKeyHint: "Memorizzata esclusivamente in questo browser (storage locale, non sincronizzato).",
    modelLabel: "Modello",
    languageLabel: "Lingua dell'analisi",
    webSearchLabel: "Verifica i fatti tramite ricerca web",
    webSearchHintAnthropic: "Utilizza lo strumento di ricerca web di Anthropic.",
    webSearchHintUnavailable: "Non disponibile per questo fornitore: le verifiche saranno contrassegnate come «non verificato».",
    webSearchHintGemini:
      "Utilizza Google Search grounding. Nota: richiede un account di fatturazione (Pay-as-you-go). Deseleziona questa casella per utilizzare la quota gratuita al 100% di Google AI Studio.",
    webSearchHintOpenAi:
      "Attivo se l'endpoint supporta la ricerca web (Perplexity, OpenRouter :online…). Con Ollama o Mistral senza ricerca, le affermazioni rimangono «non verificato».",
    maxChunkLabel: "Dimensione massima porzione (token)",
    maxChunkHint: "Oltre questo limite, l'articolo viene suddiviso in paragrafi e analizzato in più chiamate.",
    saveBtn: "Salva",
    savedSuccess: "Configurazione salvata.",
    savedPermissionDenied: "Salvato, ma l'autorizzazione di accesso all'API è stata negata.",
    invalidEndpoint: "Endpoint non valido.",
    errorPrefix: (msg) => `Errore: ${msg}`,
    cacheSectionTitle: "Cache delle analisi",
    clearCacheBtn: "Svuota cache",
    cacheCleared: "Cache svuotata.",
    privacySectionTitle: "Privacy",
    privacyText:
      "Il testo degli articoli analizzati viene inviato esclusivamente al fornitore configurato. Rhetorix non dispone di alcun server centrale.",
    getGeminiKeyBtn: "✨ Ottieni una chiave Gemini gratuita (Google AI Studio) ↗",
    getAnthropicKeyBtn: "Ottieni una chiave Anthropic ↗",
    presetOllamaBtn: "🦙 Configura per Ollama locale (senza chiave)",
    presetOllamaSuccess: "Impostazioni applicate per Ollama locale (http://localhost:11434/v1, mistral).",
    presetClaudeBridgeBtn: "⚡ Configura per il bridge locale di Claude Code (Abbonamento)",
    presetClaudeBridgeSuccess:
      "Impostazioni applicate per il bridge locale di Claude Code (http://localhost:8080/v1). Esegui 'npm run bridge' nel terminale.",
    chromeAiOption: "Chrome Built-in AI (Gemini Nano locale, senza chiave)",
    chromeAiHint: "Esecuzione 100% locale con Gemini Nano. Nessuna chiave API né account richiesti, gratuito e privato.",
    apiKeyPlaceholderOllama: "Opzionale per Ollama / LM Studio locale",
    refreshModelsBtn: "🔄 Aggiorna modelli",
    refreshingModels: "Recupero modelli disponibili…",
    modelsFound: (count) => `${count} modello/i disponibile/i.`,
    modelHint: "Seleziona un modello dall'elenco o passa all'inserimento libero.",
    toggleCustomModelBtn: "✍️ Inserimento libero",
    toggleSelectModelBtn: "📋 Scegli dall'elenco",
    anthropicAuthModeLabel: "Modalità di autenticazione Anthropic",
    anthropicModeApiKey: "🔑 Chiave API (Pay-as-you-go)",
    anthropicModeOAuth: "⚡ Abbonamento Claude (OAuth)",
    apiKeyLabelOAuth: "Token OAuth Claude Code (Abbonamento)",
    apiKeyHintOAuth:
      "Genera il tuo token in un terminale con 'claude setup-token' e incollalo qui. Le richieste saranno addebitate al tuo abbonamento Claude Pro / Max.",
    copySetupTokenBtn: "📋 Copia 'claude setup-token'",
    copiedToClipboard: "Copiato negli appunti!",

    providerErrors: {
      refusal: (detail) => (detail ? `Rifiuto del modello: ${detail}` : "Il modello ha rifiutato di analizzare questo contenuto."),
      max_tokens: () => "Risposta troncata (max_tokens raggiunto). Riduci la dimensione delle parti nelle opzioni.",
      no_structured_output: () => "Il modello non ha restituito un'analisi strutturata.",
      too_many_turns: () => "Troppi tentativi di ricerca web.",
      empty_response: () => "Risposta vuota dal provider.",
      invalid_json: () => "La risposta del provider non è un JSON valido.",
      empty_consolidated: () => "Il riassunto consolidato è vuoto.",
      blocked: (detail) => (detail ? `Richiesta bloccata (${detail}).` : "Richiesta bloccata dai filtri di sicurezza."),
      http_error: (detail) => (detail ? `Errore del provider: ${detail}` : "Errore di comunicazione con il provider."),
    },
  },
};

export function formatErrorMessage(err: unknown, t: UiStrings): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: ProviderErrorCode }).code;
    const detail = (err as { detail?: string }).detail;
    if (code && t.providerErrors[code]) {
      return t.providerErrors[code](detail);
    }
  }
  return err instanceof Error ? err.message : String(err);
}

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
