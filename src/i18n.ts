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
  retryingStatus: string;
  cancelledStatus: string;
  accessErrorStatus: string;
  internalPageNotice: string;
  needConfigStatus: string;
  apiPermissionError: string;
  extractNoArticleError: string;
  extractEmptyArticleError: string;
  summaryTitle: string;
  clickbaitHeading: string;
  blindSpotHeading: string;
  cacheNote: (date: string) => string;
  staleCacheNote: (date: string) => string;
  partialNote: (count: number) => string;
  partialShort: (count: number) => string;
  emptyResults: string;
  unlocatedQuote: string;
  factCheckLabel: string;
  sourcesLabel: string;
  privacyNotice: string;
  filterAll: string;
  displayModes: Record<DisplayMode, string>;
  inlineModeNotice: string;
  closeSidebarBtn: string;
  switchBothBtn: string;
  categories: Record<Category, string>;
  categoriesPlural: Record<Category, string>;
  severities: Record<Severity, string>;
  factStatuses: Record<FactStatus, string>;

  // Popover (icône d'extension)
  brandSubtitle: string;
  activePageLabel: string;
  analysisResultsHeading: string;
  openPanelDetails: string;
  inlineModeTip: string;

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
  chromeAiOption: string;
  chromeAiHint: string;
  apiKeyPlaceholderOllama: string;
  refreshModelsBtn: string;
  refreshingModels: string;
  modelsFound: (count: number) => string;
  modelHint: string;
  toggleCustomModelBtn: string;
  toggleSelectModelBtn: string;

  // Onglets et Guide d'information
  tabSettings: string;
  tabGuide: string;
  guideTitle: string;
  guideIntro: string;
  guideCapabilitiesHeading: string;
  guideCap1Title: string;
  guideCap1Desc: string;
  guideCap2Title: string;
  guideCap2Desc: string;
  guideCap3Title: string;
  guideCap3Desc: string;
  guideCap4Title: string;
  guideCap4Desc: string;
  guideCap5Title: string;
  guideCap5Desc: string;
  guideCap6Title: string;
  guideCap6Desc: string;

  guideColorsHeading: string;
  guideColorsIntro: string;
  guideColorSophismTitle: string;
  guideColorSophismDesc: string;
  guideColorSophismSample: string;
  guideColorBiasTitle: string;
  guideColorBiasDesc: string;
  guideColorBiasSample: string;
  guideColorFactualTitle: string;
  guideColorFactualDesc: string;
  guideColorFactualSample: string;
  guideColorActiveTitle: string;
  guideColorActiveDesc: string;
  guideColorActiveSample: string;

  guideFactCheckHeading: string;
  guideFactCheckIntro: string;
  guideFactSupportedTitle: string;
  guideFactSupportedDesc: string;
  guideFactRefutedTitle: string;
  guideFactRefutedDesc: string;
  guideFactMisleadingTitle: string;
  guideFactMisleadingDesc: string;
  guideFactUnverifiedTitle: string;
  guideFactUnverifiedDesc: string;

  guideSeverityHeading: string;
  guideSeverityIntro: string;
  guideSeverityLowTitle: string;
  guideSeverityLowDesc: string;
  guideSeverityMediumTitle: string;
  guideSeverityMediumDesc: string;
  guideSeverityHighTitle: string;
  guideSeverityHighDesc: string;

  guideTaxonomyHeading: string;
  guideTaxonomyIntro: string;

  // YouTube
  youtubeSectionTitle: string;
  youtubeAnalyzeChunkBtn: string;
  youtubeAnalyzeFullBtn: string;
  youtubeAnalyzingChunkStatus: (start: string, end: string) => string;
  youtubeAnalyzingFullStatus: string;
  youtubeChunkReadyBtn: string;
  youtubeNoTranscriptError: string;
  youtubeChunkLabel: (current: number, total: number, start: string, end: string) => string;
  youtubeChunkMinutesLabel: string;
  youtubeMinDisplayLabel: string;
  youtubePauseModeLabel: string;
  youtubePauseModeNone: string;
  youtubePauseModeStart: string;
  youtubePauseModeAfter: string;
  youtubeAutoResumeLabel: string;
  youtubeAutoResumeDurationLabel: string;
  youtubeTimelineMarkersLabel: string;
  youtubeTimeBadge: (time: string) => string;

  // Tokens
  tokenUsageLabel: string;
  tokenIn: (n: string) => string;
  tokenOut: (n: string) => string;
  tokenTotal: (n: string) => string;
  tokenCached: string;
  tokenIdle: string;
  tabTokens: string;
  tokensSectionTitle: string;
  tokensTabIntro: string;
  tokensPeriodLabel: string;
  tokensAllTimeLabel: string;
  tokensMonthlyResetLabel: string;
  tokensResetDisabled: string;
  tokensResetDayOption: (day: number) => string;
  tokensResetBtn: string;
  tokensResetSuccess: string;
  monthlyResetHint: string;
  quotasHelpHeading: string;

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
    retryingStatus: "Fournisseur saturé ou indisponible : nouvelle tentative…",
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
    clickbaitHeading: "Décalage titre / contenu",
    blindSpotHeading: "Angle mort / Omission clé",
    cacheNote: (date) => `Analyse du ${date} (cache).`,
    staleCacheNote: (date) => `Analyse du ${date} (cache), produite avec d'autres réglages ou une version antérieure du moteur : peut-être obsolète. « Ré-analyser » pour la mettre à jour.`,
    partialNote: (n) => `Analyse partielle : ${n} passage${n > 1 ? "s n'ont" : " n'a"} pas pu être analysé${n > 1 ? "s" : ""}. « Ré-analyser » pour réessayer.`,
    partialShort: (n) => `${n} passage${n > 1 ? "s" : ""} non analysé${n > 1 ? "s" : ""}`,
    emptyResults: "Aucun procédé rhétorique notable relevé.",
    unlocatedQuote: "Citation introuvable dans la page.",
    factCheckLabel: "Vérification :",
    sourcesLabel: "Sources :",
    privacyNotice: "Le texte de l'article est envoyé au fournisseur LLM configuré.",
    filterAll: "Tous",
    displayModes: {
      both: "Bulles & panneau à la demande",
      inline: "Bulles au survol uniquement",
      sidepanel: "Panneau latéral uniquement",
    },
    inlineModeNotice: "Mode bulles au survol actif. Survolez les passages surlignés dans la page pour consulter les analyses.",
    closeSidebarBtn: "Fermer le panneau",
    switchBothBtn: "Passer en mode bulles & panneau à la demande",
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

    brandSubtitle: "Esprit critique & rhétorique",
    activePageLabel: "Page active",
    analysisResultsHeading: "Résultats de l'analyse",
    openPanelDetails: "Ouvrir le panneau détaillé",
    inlineModeTip: "Survolez les passages surlignés dans la page pour afficher les explications et sources.",

    optionsTitle: "Rhetorix — Options",
    displayModeLabel: "Mode d'affichage",
    displayModeHint: "Choisissez si les annotations s'affichent sous forme de bulles au survol avec panneau à la demande, en bulles seules, ou uniquement dans le panneau latéral.",
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
    chromeAiOption: "Chrome Built-in AI (Gemini Nano local, sans clé)",
    chromeAiHint: "Exécution 100% locale via Gemini Nano. Aucune clé API ni compte requis, gratuit et confidentiel.",
    apiKeyPlaceholderOllama: "Facultatif pour Ollama / LM Studio local",
    refreshModelsBtn: "🔄 Actualiser les modèles",
    refreshingModels: "Recherche des modèles disponibles…",
    modelsFound: (count) => `${count} modèle(s) disponible(s).`,
    modelHint: "Sélectionnez un modèle dans la liste ou passez en saisie libre.",
    toggleCustomModelBtn: "✍️ Saisie libre",
    toggleSelectModelBtn: "📋 Choisir dans la liste",

    tabSettings: "Paramètres",
    tabGuide: "Capacités & Charte",
    guideTitle: "Rhetorix — Guide & Capacités",
    guideIntro:
      "Rhetorix est un assistant d'esprit critique conçu pour décortiquer l'argumentation des articles de presse, éditoriaux et discours en ligne. Il identifie les failles de raisonnement, éclaire les procédés d'influence et confronte les affirmations aux faits vérifiés.",
    guideCapabilitiesHeading: "Capacités de l'outil",
    guideCap1Title: "Analyse rhétorique & cognitive",
    guideCap1Desc:
      "Détecte les sophismes logiques et biais de cadrage avec explications critiques et citations textuelles précises.",
    guideCap2Title: "Vérification factuelle & Recherche web",
    guideCap2Desc:
      "Isole les affirmations vérifiables et les confronte au web en direct grâce aux moteurs de recherche intégrés.",
    guideCap3Title: "Extraction d'article propre",
    guideCap3Desc:
      "Isole le cœur du texte avec le moteur Readability de Mozilla, débarrassé des publicités, menus et bannières.",
    guideCap4Title: "Découpage intelligent (Chunking)",
    guideCap4Desc:
      "Prend en charge les articles courts comme les dossiers volumineux par partitionnement de paragraphes et synthèse globale.",
    guideCap5Title: "Affichage adapté à votre lecture",
    guideCap5Desc:
      "Consultez l'analyse dans le volet latéral interactif, en bulles directement au survol du texte, ou les deux à la fois.",
    guideCap6Title: "Confidentialité & Zéro serveur tiers",
    guideCap6Desc:
      "Aucun serveur central Rhetorix : vos requêtes vont directement au fournisseur d'IA configuré ou s'exécutent 100% en local.",

    guideColorsHeading: "Charte de couleur et surlignage",
    guideColorsIntro:
      "Les surlignages dans le texte de l'article correspondent fidèlement aux catégories et cartes du volet latéral :",
    guideColorSophismTitle: "Sophismes",
    guideColorSophismDesc:
      "Erreurs de logique, raisonnements fallacieux ou manipulations argumentatives (homme de paille, ad hominem, faux dilemme, etc.).",
    guideColorSophismSample:
      "« Si nous n'adoptons pas immédiatement cette mesure d'urgence, notre économie va s'effondrer d'ici la fin du mois. »",
    guideColorBiasTitle: "Biais cognitifs & éditoriaux",
    guideColorBiasDesc:
      "Cadrages orientés, langage émotionnellement chargé, omissions de contexte ou sélection partiale d'arguments.",
    guideColorBiasSample:
      "« Les prétendus spécialistes ont une nouvelle fois tenté d'imposer leur vision rétrograde sans la moindre concertation. »",
    guideColorFactualTitle: "Allégations factuelles",
    guideColorFactualDesc:
      "Affirmations portant sur des faits, chiffres, dates ou événements mesurables et vérifiables.",
    guideColorFactualSample:
      "« Le taux de chômage national a reculé de 1,2% au cours du second semestre selon l'institut officiel de statistique. »",
    guideColorActiveTitle: "Sélection active / Focus",
    guideColorActiveDesc:
      "Mise en surbrillance dorée de la citation correspondant à la carte actuellement cliquée ou survolée dans le volet.",
    guideColorActiveSample:
      "« Extrait actuellement sélectionné ou survolé dans le volet latéral »",

    guideFactCheckHeading: "Statuts de vérification des faits",
    guideFactCheckIntro:
      "Lorsque la recherche web est activée, chaque allégation factuelle est confrontée à des sources d'information fiables :",
    guideFactSupportedTitle: "Étayée",
    guideFactSupportedDesc: "L'allégation est vérifiée et corroborée par des sources documentées concordantes.",
    guideFactRefutedTitle: "Réfutée",
    guideFactRefutedDesc: "L'allégation est contredite ou infirmée par les faits et données avérés.",
    guideFactMisleadingTitle: "Trompeuse",
    guideFactMisleadingDesc:
      "L'allégation contient une part de vérité mais est déformée, exagérée ou sortie de son contexte.",
    guideFactUnverifiedTitle: "Non vérifiée",
    guideFactUnverifiedDesc:
      "Les sources consultées sont insuffisantes pour conclure, ou la recherche web n'est pas activée.",

    guideSeverityHeading: "Niveaux de gravité",
    guideSeverityIntro:
      "Chaque sophisme ou biais est évalué selon son impact sur la sincérité et la validité de l'argumentation :",
    guideSeverityLowTitle: "Faible",
    guideSeverityLowDesc: "Biais mineur ou tournure maladroite sans incidence décisive sur la logique globale.",
    guideSeverityMediumTitle: "Moyenne",
    guideSeverityMediumDesc: "Distorsion sensible ou omission notable qui affaiblit nettement la portée du raisonnement.",
    guideSeverityHighTitle: "Élevée",
    guideSeverityHighDesc: "Manipulation caractérisée, contre-vérité grave ou sophisme invalidant la thèse défendue.",

    guideTaxonomyHeading: "Répertoire des sophismes et biais",
    guideTaxonomyIntro:
      "Consultez les définitions complètes des catégories de sophismes, biais cognitifs et allégations répertoriés par Rhetorix :",

    youtubeSectionTitle: "Vidéos & YouTube",
    youtubeAnalyzeChunkBtn: "⚡ Analyser (15 min)",
    youtubeAnalyzeFullBtn: "⚡ Analyser toute la vidéo",
    youtubeAnalyzingChunkStatus: (start, end) => `⏳ Analyse en cours (${start} - ${end})...`,
    youtubeAnalyzingFullStatus: "⏳ Analyse intégrale de la vidéo en cours...",
    youtubeChunkReadyBtn: "⚡ Analyser toute la vidéo",
    youtubeNoTranscriptError: "Aucune transcription disponible pour cette vidéo.",
    youtubeChunkLabel: (current, total, start, end) => `Tranche ${current}/${total} (${start} - ${end})`,
    youtubeChunkMinutesLabel: "Durée de tranche d'analyse (minutes)",
    youtubeMinDisplayLabel: "Durée minimale d'affichage de la bulle (secondes)",
    youtubePauseModeLabel: "Comportement de pause automatique",
    youtubePauseModeNone: "Ne pas stopper la vidéo",
    youtubePauseModeStart: "Mettre en pause avant le passage",
    youtubePauseModeAfter: "Mettre en pause après le passage",
    youtubeAutoResumeLabel: "Reprise automatique après pause (compte à rebours)",
    youtubeAutoResumeDurationLabel: "Délai avant reprise automatique (secondes)",
    youtubeTimelineMarkersLabel: "Afficher les marqueurs et zones analysées sur la barre de lecture YouTube",
    youtubeTimeBadge: (time) => `▶ ${time}`,

    tokenUsageLabel: "Tokens :",
    tokenIn: (n) => `${n} in`,
    tokenOut: (n) => `${n} out`,
    tokenTotal: (n) => `(${n} total)`,
    tokenCached: "0 token (cache)",
    tokenIdle: "— (en attente d'analyse)",
    tabTokens: "Consommation & Quotas",
    tokensSectionTitle: "Consommation de tokens",
    tokensTabIntro: "Mesure précise et locale des tokens d'entrée et de sortie consommés lors de vos analyses.",
    tokensPeriodLabel: "Période en cours",
    tokensAllTimeLabel: "Cumul total (depuis l'installation)",
    tokensMonthlyResetLabel: "Réinitialisation mensuelle",
    tokensResetDisabled: "Désactivée (cumul continu)",
    tokensResetDayOption: (day) => `Le ${day} de chaque mois`,
    tokensResetBtn: "Remettre à zéro le compteur (RAZ)",
    tokensResetSuccess: "Compteur de période réinitialisé.",
    monthlyResetHint: "Le compteur de période se remet à zéro automatiquement à la date choisie.",
    quotasHelpHeading: "Vérifier vos quotas selon votre fournisseur",

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
    retryingStatus: "Provider busy or unavailable: retrying…",
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
    clickbaitHeading: "Headline / Content Gap",
    blindSpotHeading: "Blind Spot / Key Omission",
    cacheNote: (date) => `Analysis from ${date} (cached).`,
    staleCacheNote: (date) => `Analysis from ${date} (cached), produced with different settings or an earlier engine version: possibly outdated. Use “Re-analyze” to update it.`,
    partialNote: (n) => `Partial analysis: ${n} passage${n > 1 ? "s" : ""} could not be analyzed. Use “Re-analyze” to try again.`,
    partialShort: (n) => `${n} passage${n > 1 ? "s" : ""} not analyzed`,
    emptyResults: "No significant rhetorical devices found.",
    unlocatedQuote: "Quote could not be located in the page.",
    factCheckLabel: "Fact-check:",
    sourcesLabel: "Sources:",
    privacyNotice: "Article text is sent to the configured LLM provider.",
    filterAll: "All",
    displayModes: {
      both: "Bubbles & on-demand panel",
      inline: "Hover bubbles only",
      sidepanel: "Side panel only",
    },
    inlineModeNotice: "Hover bubbles mode active. Hover over highlighted text in the page to view analyses.",
    closeSidebarBtn: "Close panel",
    switchBothBtn: "Switch to bubbles & on-demand panel",
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

    brandSubtitle: "Critical thinking & rhetoric",
    activePageLabel: "Active page",
    analysisResultsHeading: "Analysis results",
    openPanelDetails: "Open detailed side panel",
    inlineModeTip: "Hover over highlighted passages in the page to view explanations and sources.",

    optionsTitle: "Rhetorix — Options",
    displayModeLabel: "Display mode",
    displayModeHint: "Choose whether annotations appear as hover bubbles with an on-demand side panel, hover bubbles only, or side panel only.",
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
    chromeAiOption: "Chrome Built-in AI (local Gemini Nano, no key)",
    chromeAiHint: "Runs 100% locally with Gemini Nano. No API key or account required, free and private.",
    apiKeyPlaceholderOllama: "Optional for local Ollama / LM Studio",
    refreshModelsBtn: "🔄 Refresh models",
    refreshingModels: "Fetching available models…",
    modelsFound: (count) => `${count} model(s) available.`,
    modelHint: "Select a model from the list or switch to custom input.",
    toggleCustomModelBtn: "✍️ Custom input",
    toggleSelectModelBtn: "📋 Choose from list",

    tabSettings: "Settings",
    tabGuide: "Capabilities & Chart",
    guideTitle: "Rhetorix — Capabilities & Guide",
    guideIntro:
      "Rhetorix is a critical thinking companion designed to dissect arguments in news articles, op-eds, and speeches. It uncovers reasoning fallacies, highlights persuasion tactics, and verifies factual claims against reliable evidence.",
    guideCapabilitiesHeading: "Tool Capabilities",
    guideCap1Title: "Rhetorical & Cognitive Analysis",
    guideCap1Desc:
      "Identifies logical fallacies and framing biases with detailed critiques and precise text quotes.",
    guideCap2Title: "Fact-Checking & Web Search",
    guideCap2Desc:
      "Extracts verifiable claims and cross-checks them in real time using integrated web search grounding.",
    guideCap3Title: "Clean Article Extraction",
    guideCap3Desc:
      "Isolates the core article text with Mozilla Readability, free from ads, banners, and navigation clutter.",
    guideCap4Title: "Smart Chunking",
    guideCap4Desc:
      "Effortlessly processes short articles and long investigative reports through paragraph batching and consolidated synthesis.",
    guideCap5Title: "Flexible Reading Layout",
    guideCap5Desc:
      "Explore insights in the interactive sidebar, directly in hover tooltips on the page, or both simultaneously.",
    guideCap6Title: "Privacy & Zero Intermediary Server",
    guideCap6Desc:
      "No central Rhetorix server: your requests go straight to your chosen AI provider or run 100% locally on your machine.",

    guideColorsHeading: "Color Chart & Highlighting",
    guideColorsIntro:
      "Highlight colors in the article text correspond directly to the sidebar cards, badges, and filters:",
    guideColorSophismTitle: "Fallacies",
    guideColorSophismDesc:
      "Errors in logic, flawed reasoning, or manipulative arguments (straw man, ad hominem, false dilemma, etc.).",
    guideColorSophismSample:
      "“If we do not adopt this emergency measure immediately, our economy will collapse by the end of the month.”",
    guideColorBiasTitle: "Cognitive & Editorial Biases",
    guideColorBiasDesc:
      "Biased framing, emotionally loaded language, omission of vital context, or cherry-picked evidence.",
    guideColorBiasSample:
      "“The self-proclaimed specialists once again attempted to impose their backward vision without any consultation.”",
    guideColorFactualTitle: "Factual Claims",
    guideColorFactualDesc:
      "Statements asserting measurable facts, figures, historical dates, or attributed quotes.",
    guideColorFactualSample:
      "“The national unemployment rate dropped by 1.2% during the second quarter according to official statistics.”",
    guideColorActiveTitle: "Active Selection / Focus",
    guideColorActiveDesc:
      "Golden spotlight highlighting the text quote corresponding to the card clicked or hovered in the sidebar.",
    guideColorActiveSample:
      "“Excerpt currently selected or hovered in the sidebar”",

    guideFactCheckHeading: "Fact-Checking Verdicts",
    guideFactCheckIntro:
      "When web search is enabled, each factual claim is cross-referenced with trusted information sources:",
    guideFactSupportedTitle: "Supported",
    guideFactSupportedDesc: "The claim is verified and substantiated by reliable, corroborating sources.",
    guideFactRefutedTitle: "Refuted",
    guideFactRefutedDesc: "The claim is contradicted or disproven by documented facts and empirical data.",
    guideFactMisleadingTitle: "Misleading",
    guideFactMisleadingDesc:
      "The claim contains an element of truth but is distorted, exaggerated, or stripped of context.",
    guideFactUnverifiedTitle: "Unverified",
    guideFactUnverifiedDesc:
      "Available sources are inconclusive, or web search is turned off in settings.",

    guideSeverityHeading: "Severity Levels",
    guideSeverityIntro:
      "Each detected issue is evaluated based on its impact on the integrity and validity of the discourse:",
    guideSeverityLowTitle: "Low",
    guideSeverityLowDesc: "Minor bias or awkward wording with negligible effect on the central thesis.",
    guideSeverityMediumTitle: "Medium",
    guideSeverityMediumDesc: "Noticeable distortion or omission that significantly weakens the argument.",
    guideSeverityHighTitle: "High",
    guideSeverityHighDesc: "Major manipulative tactic, severe falsehood, or fallacy invalidating the thesis.",

    guideTaxonomyHeading: "Catalog of Fallacies & Biases",
    guideTaxonomyIntro:
      "Explore the complete definitions of all fallacy, bias, and claim categories cataloged by Rhetorix:",

    youtubeSectionTitle: "Videos & YouTube",
    youtubeAnalyzeChunkBtn: "⚡ Analyze (15 min)",
    youtubeAnalyzeFullBtn: "⚡ Analyze entire video",
    youtubeAnalyzingChunkStatus: (start, end) => `⏳ Analyzing slice (${start} - ${end})...`,
    youtubeAnalyzingFullStatus: "⏳ Analyzing full video...",
    youtubeChunkReadyBtn: "⚡ Analyze entire video",
    youtubeNoTranscriptError: "No transcript available for this video.",
    youtubeChunkLabel: (current, total, start, end) => `Slice ${current}/${total} (${start} - ${end})`,
    youtubeChunkMinutesLabel: "Analysis slice duration (minutes)",
    youtubeMinDisplayLabel: "Minimum popover display duration (seconds)",
    youtubePauseModeLabel: "Automatic video pause behavior",
    youtubePauseModeNone: "Do not stop playback",
    youtubePauseModeStart: "Pause before segment",
    youtubePauseModeAfter: "Pause after segment",
    youtubeAutoResumeLabel: "Auto-resume playback after pause (countdown)",
    youtubeAutoResumeDurationLabel: "Delay before auto-resume (seconds)",
    youtubeTimelineMarkersLabel: "Show markers and analyzed zones on YouTube scrubber bar",
    youtubeTimeBadge: (time) => `▶ ${time}`,

    tokenUsageLabel: "Tokens:",
    tokenIn: (n) => `${n} in`,
    tokenOut: (n) => `${n} out`,
    tokenTotal: (n) => `(${n} total)`,
    tokenCached: "0 tokens (cached)",
    tokenIdle: "— (awaiting analysis)",
    tabTokens: "Token Usage & Quotas",
    tokensSectionTitle: "Token Usage",
    tokensTabIntro: "Precise local measurement of input and output tokens consumed during your analyses.",
    tokensPeriodLabel: "Current Period",
    tokensAllTimeLabel: "All-Time Total",
    tokensMonthlyResetLabel: "Monthly Reset",
    tokensResetDisabled: "Disabled (continuous accumulation)",
    tokensResetDayOption: (day) => `${day}${day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"} of each month`,
    tokensResetBtn: "Reset Period Counter (Zero Out)",
    tokensResetSuccess: "Period counter reset.",
    monthlyResetHint: "The period counter resets automatically on the chosen date.",
    quotasHelpHeading: "Check your quotas by provider",

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
    retryingStatus: "Proveedor saturado o no disponible: reintentando…",
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
    clickbaitHeading: "Desfase titular / contenido",
    blindSpotHeading: "Punto ciego / Omisión clave",
    cacheNote: (date) => `Análisis del ${date} (caché).`,
    staleCacheNote: (date) => `Análisis del ${date} (caché), realizado con otros ajustes o una versión anterior del motor: posiblemente obsoleto. Use «Reanalizar» para actualizarlo.`,
    partialNote: (n) => `Análisis parcial: ${n} pasaje${n > 1 ? "s" : ""} no ${n > 1 ? "pudieron" : "pudo"} analizarse. Use «Reanalizar» para intentarlo de nuevo.`,
    partialShort: (n) => `${n} pasaje${n > 1 ? "s" : ""} sin analizar`,
    emptyResults: "No se detectaron recursos retóricos relevantes.",
    unlocatedQuote: "Cita no encontrada en la página.",
    factCheckLabel: "Verificación:",
    sourcesLabel: "Fuentes:",
    privacyNotice: "El texto del artículo se envía al proveedor LLM configurado.",
    filterAll: "Todos",
    displayModes: {
      both: "Burbujas y panel a petición",
      inline: "Solo burbujas al pasar el cursor",
      sidepanel: "Solo panel lateral",
    },
    inlineModeNotice: "Modo burbujas activo. Pase el cursor sobre el texto resaltado en la página para ver los análisis.",
    closeSidebarBtn: "Cerrar panel",
    switchBothBtn: "Cambiar a burbujas y panel a petición",
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

    brandSubtitle: "Pensamiento crítico y retórica",
    activePageLabel: "Página activa",
    analysisResultsHeading: "Resultados del análisis",
    openPanelDetails: "Abrir el panel detallado",
    inlineModeTip: "Pase el cursor sobre los textos resaltados en la página para ver explicaciones y fuentes.",

    optionsTitle: "Rhetorix — Opciones",
    displayModeLabel: "Modo de visualización",
    displayModeHint: "Elija si las anotaciones se muestran como burbujas con panel lateral a petición, solo burbujas, o solo en el panel lateral.",
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
    chromeAiOption: "Chrome Built-in AI (Gemini Nano local, sin clave)",
    chromeAiHint: "Ejecución 100% local con Gemini Nano. Sin clave API ni cuenta, gratuito y privado.",
    apiKeyPlaceholderOllama: "Opcional para Ollama / LM Studio local",
    refreshModelsBtn: "🔄 Actualizar modelos",
    refreshingModels: "Buscando modelos disponibles…",
    modelsFound: (count) => `${count} modelo(s) disponible(s).`,
    modelHint: "Seleccione un modelo de la lista o cambie a entrada libre.",
    toggleCustomModelBtn: "✍️ Entrada libre",
    toggleSelectModelBtn: "📋 Elegir de la lista",

    tabSettings: "Ajustes",
    tabGuide: "Capacidades y guía",
    guideTitle: "Rhetorix — Capacidades y guía",
    guideIntro:
      "Rhetorix es un asistente de pensamiento crítico diseñado para analizar artículos de prensa, editoriales y discursos en línea. Detecta fallas lógicas, arroja luz sobre tácticas de persuasión y contrasta afirmaciones con hechos comprobados.",
    guideCapabilitiesHeading: "Capacidades de la herramienta",
    guideCap1Title: "Análisis retórico y cognitivo",
    guideCap1Desc:
      "Detecta falacias lógicas y sesgos de encuadre con explicaciones críticas y citas textuales exactas.",
    guideCap2Title: "Verificación de hechos y búsqueda web",
    guideCap2Desc:
      "Aísla afirmaciones comprobables y las contrasta en tiempo real gracias a los motores de búsqueda web integrados.",
    guideCap3Title: "Extracción limpia del artículo",
    guideCap3Desc:
      "Extrae el texto principal con Mozilla Readability, libre de publicidad, menús y elementos distractores.",
    guideCap4Title: "Fragmentación inteligente (Chunking)",
    guideCap4Desc:
      "Procesa con fluidez artículos breves y extensos mediante partición por párrafos y consolidación unificada.",
    guideCap5Title: "Lectura personalizada",
    guideCap5Desc:
      "Consulte los análisis en el panel lateral interactivo, en globos emergentes en el texto o en ambos.",
    guideCap6Title: "Privacidad sin servidor intermediario",
    guideCap6Desc:
      "Sin servidor central Rhetorix: las solicitudes van directamente a su proveedor de IA o se ejecutan 100% en local.",

    guideColorsHeading: "Carta de colores y resaltado",
    guideColorsIntro:
      "Los colores de resaltado en el artículo coinciden con las tarjetas, distintivos y filtros del panel lateral:",
    guideColorSophismTitle: "Falacias",
    guideColorSophismDesc:
      "Errores lógicos, razonamientos engañosos o manipulaciones argumentativas (hombre de paja, ad hominem, falso dilema, etc.).",
    guideColorSophismSample:
      "«Si no adoptamos de inmediato esta medida de urgencia, nuestra economía colapsará antes de fin de mes.»",
    guideColorBiasTitle: "Sesgos cognitivos y editoriales",
    guideColorBiasDesc:
      "Encuadres orientados, lenguaje cargado, omisiones de contexto o selección interesada de hechos.",
    guideColorBiasSample:
      "«Los supuestos especialistas intentaron una vez más imponer su visión retrógrada sin consulta alguna.»",
    guideColorFactualTitle: "Afirmaciones factuales",
    guideColorFactualDesc:
      "Afirmaciones sobre hechos, cifras, fechas o citas atribuibles y verificables.",
    guideColorFactualSample:
      "«La tasa de desempleo nacional se redujo un 1,2% durante el segundo semestre según el instituto oficial.»",
    guideColorActiveTitle: "Selección activa / Enfoque",
    guideColorActiveDesc:
      "Resaltado dorado que señala en la página la cita de la tarjeta seleccionada o sobrevolada en el panel.",
    guideColorActiveSample:
      "«Extracto actualmente seleccionado o sobrevolado en el panel lateral»",

    guideFactCheckHeading: "Estados de verificación factual",
    guideFactCheckIntro:
      "Con la búsqueda web activada, cada afirmación factual se contrasta con fuentes contrastadas:",
    guideFactSupportedTitle: "Respaldada",
    guideFactSupportedDesc: "La afirmación está verificada y corroborada por fuentes documentadas e independientes.",
    guideFactRefutedTitle: "Refutada",
    guideFactRefutedDesc: "La afirmación es contradicha o desmentida por datos y hechos demostrados.",
    guideFactMisleadingTitle: "Engañosa",
    guideFactMisleadingDesc:
      "Contiene algo de verdad pero está descontextualizada, exagerada o deformada.",
    guideFactUnverifiedTitle: "No verificada",
    guideFactUnverifiedDesc:
      "Las fuentes son insuficientes para concluir o la búsqueda web está desactivada.",

    guideSeverityHeading: "Niveles de gravedad",
    guideSeverityIntro:
      "Cada problema detectado se evalúa según su impacto en la solidez y honestidad de la argumentación:",
    guideSeverityLowTitle: "Baja",
    guideSeverityLowDesc: "Sesgo leve o redacción torpe sin alterar de forma determinante la tesis central.",
    guideSeverityMediumTitle: "Media",
    guideSeverityMediumDesc: "Distorsión notable u omisión que debilita sensiblemente el peso del razonamiento.",
    guideSeverityHighTitle: "Alta",
    guideSeverityHighDesc: "Manipulación deliberada, falsedad grave o falacia que invalida el razonamiento.",

    guideTaxonomyHeading: "Repertorio de falacias y sesgos",
    guideTaxonomyIntro:
      "Consulte las definiciones completas de las categorías de falacias, sesgos y hechos catalogadas por Rhetorix:",

    youtubeSectionTitle: "Vídeos y YouTube",
    youtubeAnalyzeChunkBtn: "⚡ Analizar (15 min)",
    youtubeAnalyzeFullBtn: "⚡ Analizar todo el vídeo",
    youtubeAnalyzingChunkStatus: (start, end) => `⏳ Analizando fragmento (${start} - ${end})...`,
    youtubeAnalyzingFullStatus: "⏳ Analizando el vídeo completo...",
    youtubeChunkReadyBtn: "⚡ Analizar todo el vídeo",
    youtubeNoTranscriptError: "No hay transcripción disponible para este vídeo.",
    youtubeChunkLabel: (current, total, start, end) => `Tramo ${current}/${total} (${start} - ${end})`,
    youtubeChunkMinutesLabel: "Duración del tramo de análisis (minutos)",
    youtubeMinDisplayLabel: "Duración mínima del aviso (segundos)",
    youtubePauseModeLabel: "Comportamiento de pausa automática",
    youtubePauseModeNone: "No pausar el vídeo",
    youtubePauseModeStart: "Pausar antes del pasaje",
    youtubePauseModeAfter: "Pausar después del pasaje",
    youtubeAutoResumeLabel: "Reanudación automática tras pausa (cuenta atrás)",
    youtubeAutoResumeDurationLabel: "Tiempo antes de reanudar automáticamente (segundos)",
    youtubeTimelineMarkersLabel: "Mostrar marcadores y zonas analizadas en la barra de YouTube",
    youtubeTimeBadge: (time) => `▶ ${time}`,

    tokenUsageLabel: "Tokens:",
    tokenIn: (n) => `${n} entrada`,
    tokenOut: (n) => `${n} salida`,
    tokenTotal: (n) => `(${n} total)`,
    tokenCached: "0 tokens (en caché)",
    tokenIdle: "— (en espera de análisis)",
    tabTokens: "Consumo y cuotas",
    tokensSectionTitle: "Consumo de tokens",
    tokensTabIntro: "Medición precisa y local de los tokens de entrada y salida consumidos durante sus análisis.",
    tokensPeriodLabel: "Período actual",
    tokensAllTimeLabel: "Total acumulado",
    tokensMonthlyResetLabel: "Reinicio mensual",
    tokensResetDisabled: "Desactivado (acumulación continua)",
    tokensResetDayOption: (day) => `Día ${day} de cada mes`,
    tokensResetBtn: "Restablecer contador (puesta a cero)",
    tokensResetSuccess: "Contador de período restablecido.",
    monthlyResetHint: "El contador de período se restablece automáticamente en la fecha seleccionada.",
    quotasHelpHeading: "Verificar sus cuotas según el proveedor",

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
    retryingStatus: "Anbieter überlastet oder nicht erreichbar: neuer Versuch…",
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
    clickbaitHeading: "Diskrepanz Titel / Inhalt",
    blindSpotHeading: "Blinder Fleck / Zentrale Auslassung",
    cacheNote: (date) => `Analyse vom ${date} (Cache).`,
    staleCacheNote: (date) => `Analyse vom ${date} (Cache), mit anderen Einstellungen oder einer älteren Version der Analyse erstellt: möglicherweise veraltet. Mit „Erneut analysieren“ aktualisieren.`,
    partialNote: (n) => `Teilanalyse: ${n} ${n > 1 ? "Passagen konnten" : "Passage konnte"} nicht analysiert werden. Mit „Erneut analysieren“ erneut versuchen.`,
    partialShort: (n) => `${n} ${n > 1 ? "Passagen" : "Passage"} nicht analysiert`,
    emptyResults: "Keine auffälligen rhetorischen Mittel festgestellt.",
    unlocatedQuote: "Zitat auf der Seite nicht gefunden.",
    factCheckLabel: "Faktencheck:",
    sourcesLabel: "Quellen:",
    privacyNotice: "Der Artikeltext wird an den konfigurierten LLM-Anbieter gesendet.",
    filterAll: "Alle",
    displayModes: {
      both: "Hover-Blasen & Panel auf Abruf",
      inline: "Nur Hover-Blasen",
      sidepanel: "Nur Seitenleiste",
    },
    inlineModeNotice: "Hover-Blasen-Modus aktiv. Bewegen Sie den Mauszeiger über hervorgehobenen Text auf der Seite, um Analysen anzuzeigen.",
    closeSidebarBtn: "Panel schließen",
    switchBothBtn: "Zu Blasen & Panel auf Abruf wechseln",
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

    brandSubtitle: "Kritisches Denken & Rhetorik",
    activePageLabel: "Aktive Seite",
    analysisResultsHeading: "Analyseergebnisse",
    openPanelDetails: "Detail-Seitenleiste öffnen",
    inlineModeTip: "Fahren Sie mit der Maus über hervorgehobene Textstellen, um Erklärungen und Quellen anzuzeigen.",

    optionsTitle: "Rhetorix — Optionen",
    displayModeLabel: "Anzeigemodus",
    displayModeHint: "Wählen Sie, ob Anmerkungen als Hover-Blasen mit Panel auf Abruf, nur als Hover-Blasen oder nur in der Seitenleiste angezeigt werden.",
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
    chromeAiOption: "Chrome Built-in AI (lokales Gemini Nano, ohne Schlüssel)",
    chromeAiHint: "Läuft zu 100% lokal mit Gemini Nano. Kein API-Schlüssel oder Konto erforderlich, kostenlos und privat.",
    apiKeyPlaceholderOllama: "Optional für lokales Ollama / LM Studio",
    refreshModelsBtn: "🔄 Modelle aktualisieren",
    refreshingModels: "Verfügbare Modelle werden abgerufen…",
    modelsFound: (count) => `${count} Modell(e) verfügbar.`,
    modelHint: "Wählen Sie ein Modell aus der Liste oder wechseln Sie zur freien Eingabe.",
    toggleCustomModelBtn: "✍️ Freie Eingabe",
    toggleSelectModelBtn: "📋 Aus Liste wählen",

    tabSettings: "Einstellungen",
    tabGuide: "Funktionen & Farbkarte",
    guideTitle: "Rhetorix — Funktionen & Leitfaden",
    guideIntro:
      "Rhetorix ist ein Assistent für kritisches Denken, der Artikel, Leitartikel und Online-Reden analysiert. Er deckt argumentative Mängel auf, beleuchtet manipulative Taktiken und gleicht Behauptungen mit belegten Fakten ab.",
    guideCapabilitiesHeading: "Funktionen des Werkzeugs",
    guideCap1Title: "Rhetorische & kognitive Analyse",
    guideCap1Desc:
      "Erkennt logische Fehlschlüsse und Verzerrungen mit fundierter Kritik und präzisen Textzitaten.",
    guideCap2Title: "Faktencheck & Websuche",
    guideCap2Desc:
      "Isoliert prüfbare Aussagen und gleicht sie in Echtzeit über integrierte Websuchwerkzeuge ab.",
    guideCap3Title: "Saubere Artikelextraktion",
    guideCap3Desc:
      "Extrahiert den Kerntext mit Mozilla Readability, befreit von Werbebannern, Menüs und Störfaktoren.",
    guideCap4Title: "Intelligente Aufteilung (Chunking)",
    guideCap4Desc:
      "Bewältigt kurze Artikel ebenso wie umfangreiche Dossiers durch abschnittsweise Segmentierung und Gesamtsynthese.",
    guideCap5Title: "Flexible Leseansicht",
    guideCap5Desc:
      "Ergebnisse in der interaktiven Seitenleiste, als Tooltips direkt beim Textüberfahren oder kombiniert anzeigen.",
    guideCap6Title: "Datenschutz ohne Drittanbieterserver",
    guideCap6Desc:
      "Kein Rhetorix-Zentralserver: Anfragen gehen direkt an den gewählten KI-Anbieter oder laufen 100% lokal.",

    guideColorsHeading: "Farbkarte und Texthervorhebung",
    guideColorsIntro:
      "Die Hervorhebungsfarben im Artikeltext entsprechen exakt den Karten, Badges und Filtern der Seitenleiste:",
    guideColorSophismTitle: "Fehlschlüsse",
    guideColorSophismDesc:
      "Logische Fehler, irreführende Begründungen oder manipulative Taktiken (Strohmann, Ad hominem, falsches Dilemma usw.).",
    guideColorSophismSample:
      "„Wenn wir diese Notmaßnahme nicht unverzüglich beschließen, wird unsere Wirtschaft bis Monatsende kollabieren.“",
    guideColorBiasTitle: "Kognitive & redaktionelle Verzerrungen",
    guideColorBiasDesc:
      "Tendenziöses Framing, emotional aufgeladene Sprache, Auslassung von Kontext oder einseitige Auswahl von Fakten.",
    guideColorBiasSample:
      "„Die sogenannten Experten haben erneut versucht, ihre rückständige Sichtweise ohne jede Mitsprache durchzusetzen.“",
    guideColorFactualTitle: "Faktenbehauptungen",
    guideColorFactualDesc:
      "Aussagen über messbare Fakten, Zahlen, historische Daten oder zugeschriebene Zitate.",
    guideColorFactualSample:
      "„Die Arbeitslosenquote ist laut Statistischem Bundesamt im zweiten Halbjahr um 1,2% gesunken.“",
    guideColorActiveTitle: "Aktive Auswahl / Fokus",
    guideColorActiveDesc:
      "Goldgelbe Hervorhebung des Zitats zur aktuell in der Seitenleiste angeklickten oder überfahrenen Karte.",
    guideColorActiveSample:
      "„Aktuell in der Seitenleiste ausgewähltes oder überfahrenes Textzitat“",

    guideFactCheckHeading: "Faktencheck-Status",
    guideFactCheckIntro:
      "Bei aktivierter Websuche wird jede Tatsachenbehauptung mit verlässlichen Quellen abgeglichen:",
    guideFactSupportedTitle: "Bestätigt",
    guideFactSupportedDesc: "Die Behauptung ist durch übereinstimmende und verlässliche Quellen belegt.",
    guideFactRefutedTitle: "Widerlegt",
    guideFactRefutedDesc: "Die Behauptung wird durch nachweisbare Fakten und Daten eindeutig widerlegt.",
    guideFactMisleadingTitle: "Irreführend",
    guideFactMisleadingDesc:
      "Enthält einen wahren Kern, ist jedoch verzerrt, übertrieben oder aus dem Zusammenhang gerissen.",
    guideFactUnverifiedTitle: "Nicht verifiziert",
    guideFactUnverifiedDesc:
      "Die Quellenlage reicht für ein Urteil nicht aus oder die Websuche ist deaktiviert.",

    guideSeverityHeading: "Schweregrade",
    guideSeverityIntro:
      "Jeder erkannte Mangel wird nach seiner Auswirkung auf die logische Stichhaltigkeit bewertet:",
    guideSeverityLowTitle: "Gering",
    guideSeverityLowDesc: "Geringfügige Verzerrung oder unglückliche Formulierung ohne Einfluss auf die Kernthese.",
    guideSeverityMediumTitle: "Mittel",
    guideSeverityMediumDesc: "Spürbare Verzerrung oder Auslassung, welche die Argumentation deutlich schwächt.",
    guideSeverityHighTitle: "Hoch",
    guideSeverityHighDesc: "Gezielte Manipulation, grobe Falschinformation oder Fehlschluss, der die These entkräftet.",

    guideTaxonomyHeading: "Katalog der Fehlschlüsse & Verzerrungen",
    guideTaxonomyIntro:
      "Detaillierte Definitionen aller Kategorien von Fehlschlüssen und Verzerrungen:",

    youtubeSectionTitle: "Videos & YouTube",
    youtubeAnalyzeChunkBtn: "⚡ Analysieren (15 Min.)",
    youtubeAnalyzeFullBtn: "⚡ Gesamtes Video analysieren",
    youtubeAnalyzingChunkStatus: (start, end) => `⏳ Abschnitt (${start} - ${end}) wird analysiert...`,
    youtubeAnalyzingFullStatus: "⏳ Gesamtes Video wird analysiert...",
    youtubeChunkReadyBtn: "⚡ Gesamtes Video analysieren",
    youtubeNoTranscriptError: "Kein Transkript für dieses Video verfügbar.",
    youtubeChunkLabel: (current, total, start, end) => `Abschnitt ${current}/${total} (${start} - ${end})`,
    youtubeChunkMinutesLabel: "Abschnittsdauer (Minuten)",
    youtubeMinDisplayLabel: "Mindestanzeigedauer des Hinweises (Sekunden)",
    youtubePauseModeLabel: "Automatisches Pausenverhalten",
    youtubePauseModeNone: "Wiedergabe nicht anhalten",
    youtubePauseModeStart: "Vor dem Abschnitt pausieren",
    youtubePauseModeAfter: "Nach dem Abschnitt pausieren",
    youtubeAutoResumeLabel: "Automatische Fortsetzung nach Pause (Countdown)",
    youtubeAutoResumeDurationLabel: "Verzögerung vor automatischer Fortsetzung (Sekunden)",
    youtubeTimelineMarkersLabel: "Markierungen und analysierte Zonen auf YouTube-Leiste anzeigen",
    youtubeTimeBadge: (time) => `▶ ${time}`,

    tokenUsageLabel: "Tokens:",
    tokenIn: (n) => `${n} in`,
    tokenOut: (n) => `${n} out`,
    tokenTotal: (n) => `(${n} gesamt)`,
    tokenCached: "0 Tokens (Cache)",
    tokenIdle: "— (wartet auf Analyse)",
    tabTokens: "Token-Verbrauch & Kontingente",
    tokensSectionTitle: "Token-Verbrauch",
    tokensTabIntro: "Präzise lokale Messung der bei Ihren Analysen verbrauchten Eingabe- und Ausgabe-Tokens.",
    tokensPeriodLabel: "Aktueller Zeitraum",
    tokensAllTimeLabel: "Gesamtverbrauch",
    tokensMonthlyResetLabel: "Monatliches Zurücksetzen",
    tokensResetDisabled: "Deaktiviert (fortlaufende Erfassung)",
    tokensResetDayOption: (day) => `Am ${day}. jedes Monats`,
    tokensResetBtn: "Zähler zurücksetzen (Nullstellung)",
    tokensResetSuccess: "Zähler für aktuellen Zeitraum zurückgesetzt.",
    monthlyResetHint: "Der Zähler für den Zeitraum wird am gewählten Datum automatisch zurückgesetzt.",
    quotasHelpHeading: "Kontingente je nach Anbieter prüfen",

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
    retryingStatus: "Fornitore sovraccarico o non disponibile: nuovo tentativo…",
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
    clickbaitHeading: "Discrepanza titolo / contenuto",
    blindSpotHeading: "Punto cieco / Omissione chiave",
    cacheNote: (date) => `Analisi del ${date} (cache).`,
    staleCacheNote: (date) => `Analisi del ${date} (cache), prodotta con altre impostazioni o una versione precedente del motore: forse obsoleta. Usa «Rianalizza» per aggiornarla.`,
    partialNote: (n) => `Analisi parziale: ${n} ${n > 1 ? "passaggi non sono stati analizzati" : "passaggio non è stato analizzato"}. Usa «Rianalizza» per riprovare.`,
    partialShort: (n) => `${n} ${n > 1 ? "passaggi non analizzati" : "passaggio non analizzato"}`,
    emptyResults: "Nessun artificio retorico rilevante individuato.",
    unlocatedQuote: "Citazione non trovata nella pagina.",
    factCheckLabel: "Verifica:",
    sourcesLabel: "Fonti:",
    privacyNotice: "Il testo dell'articolo viene inviato al fornitore LLM configurato.",
    filterAll: "Tutti",
    displayModes: {
      both: "Fumetti e pannello su richiesta",
      inline: "Solo fumetti al passaggio del mouse",
      sidepanel: "Solo pannello laterale",
    },
    inlineModeNotice: "Modalità fumetti attiva. Passa il cursore sul testo evidenziato nella pagina per visualizzare le analyses.",
    closeSidebarBtn: "Chiudi pannello",
    switchBothBtn: "Passa a fumetti e pannello su richiesta",
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

    brandSubtitle: "Pensiero critico e retorica",
    activePageLabel: "Pagina attiva",
    analysisResultsHeading: "Risultati dell'analisi",
    openPanelDetails: "Apri il pannello dettagliato",
    inlineModeTip: "Passa il mouse sui passaggi evidenziati nella pagina per visualizzare spiegazioni e fonti.",

    optionsTitle: "Rhetorix — Opzioni",
    displayModeLabel: "Modalità di visualizzazione",
    displayModeHint: "Scegli se visualizzare le annotazioni come fumetti con pannello su richiesta, solo fumetti, o solo nel pannello laterale.",
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
    chromeAiOption: "Chrome Built-in AI (Gemini Nano locale, senza chiave)",
    chromeAiHint: "Esecuzione 100% locale con Gemini Nano. Nessuna chiave API né account richiesti, gratuito e privato.",
    apiKeyPlaceholderOllama: "Opzionale per Ollama / LM Studio locale",
    refreshModelsBtn: "🔄 Aggiorna modelli",
    refreshingModels: "Recupero modelli disponibili…",
    modelsFound: (count) => `${count} modello/i disponibile/i.`,
    modelHint: "Seleziona un modello dall'elenco o passa all'inserimento libero.",
    toggleCustomModelBtn: "✍️ Inserimento libero",
    toggleSelectModelBtn: "📋 Scegli dall'elenco",

    tabSettings: "Impostazioni",
    tabGuide: "Funzionalità e Guida colori",
    guideTitle: "Rhetorix — Funzionalità e Guida",
    guideIntro:
      "Rhetorix è un assistente per il pensiero critico ideato per analizzare articoli di stampa, editoriali e discorsi online. Individua fallacie logiche, evidenzia le tecniche di persuasione e confronta le affermazioni con fatti accertati.",
    guideCapabilitiesHeading: "Funzionalità dello strumento",
    guideCap1Title: "Analisi retorica e cognitiva",
    guideCap1Desc:
      "Rileva fallacie logiche e bias di inquadramento con spiegazioni critiche e citazioni testuali esatte.",
    guideCap2Title: "Fact-checking e ricerca web",
    guideCap2Desc:
      "Isola le affermazioni verificabili e le confronta in tempo reale grazie agli strumenti di ricerca web integrati.",
    guideCap3Title: "Estrazione pulita del testo",
    guideCap3Desc:
      "Estrae il corpo dell'articolo con Mozilla Readability, ripulito da pubblicità, banner e menu.",
    guideCap4Title: "Suddivisione intelligente (Chunking)",
    guideCap4Desc:
      "Elabora con fluidità articoli brevi e lunghi reportage mediante partizionamento per paragrafi e sintesi consolidata.",
    guideCap5Title: "Visualizzazione personalizzata",
    guideCap5Desc:
      "Consulta i risultati nel pannello laterale, nei tooltip al passaggio del mouse o in entrambe le modalità.",
    guideCap6Title: "Privacy senza server intermediari",
    guideCap6Desc:
      "Nessun server centrale Rhetorix: le richieste vanno direttamente al fornitore configurato o girano al 100% in locale.",

    guideColorsHeading: "Guida colori ed evidenziazione",
    guideColorsIntro:
      "I colori di evidenziazione nel testo corrispondono esattamente alle schede, badge e filtri del pannello laterale:",
    guideColorSophismTitle: "Fallacie",
    guideColorSophismDesc:
      "Errori di logica, ragionamenti ingannevoli o manipolazioni argomentative (uomo di paglia, ad hominem, falso dilemma, ecc.).",
    guideColorSophismSample:
      "«Se non adottiamo immediatamente questo provvedimento d'urgenza, la nostra economia crollerà entro fine mese.»",
    guideColorBiasTitle: "Bias cognitivi ed editoriali",
    guideColorBiasDesc:
      "Inquadramenti orientati, linguaggio emotivo, omissioni di contesto o selezione partigiana dei fatti.",
    guideColorBiasSample:
      "«I cosiddetti esperti hanno tentato ancora una volta di imporre la loro visione retrograda senza alcun confronto.»",
    guideColorFactualTitle: "Affermazioni di fatto",
    guideColorFactualDesc:
      "Affermazioni riguardanti fatti misurabili, numeri, date storiche o citazioni attribuite verificabili.",
    guideColorFactualSample:
      "«Il tasso di disoccupazione nazionale è diminuito dell'1,2% nel secondo semestre secondo i dati ufficiali.»",
    guideColorActiveTitle: "Selezione attiva / Focus",
    guideColorActiveDesc:
      "Evidenziazione dorata che individua nella pagina la citazione corrispondente alla scheda selezionata nel pannello.",
    guideColorActiveSample:
      "«Estratto attualmente selezionato o puntato con il cursore nel pannello laterale»",

    guideFactCheckHeading: "Esiti del fact-checking",
    guideFactCheckIntro:
      "Quando la ricerca web è attiva, ogni affermazione di fatto viene confrontata con fonti autorevoli:",
    guideFactSupportedTitle: "Confermata",
    guideFactSupportedDesc: "L'affermazione è verificata e supportata da fonti indipendenti e concordanti.",
    guideFactRefutedTitle: "Smentita",
    guideFactRefutedDesc: "L'affermazione è contraddetta o smentita dai fatti e dai dati accertati.",
    guideFactMisleadingTitle: "Fuorviante",
    guideFactMisleadingDesc:
      "Contiene un fondo di verità ma è distorta, esagerata o decontestualizzata.",
    guideFactUnverifiedTitle: "Non verificata",
    guideFactUnverifiedDesc:
      "Le fonti consultate sono insufficienti per concludere o la ricerca web è disattivata.",

    guideSeverityHeading: "Livelli di gravità",
    guideSeverityIntro:
      "Ogni anomalia rilevata è valutata in base al suo impatto sull'onestà e la validità dell'argomentazione:",
    guideSeverityLowTitle: "Bassa",
    guideSeverityLowDesc: "Bias marginale o formulazione imprecisa senza impatto determinante sulla tesi centrale.",
    guideSeverityMediumTitle: "Media",
    guideSeverityMediumDesc: "Distorsione sensibile o omissione che indebolisce nettamente la portata del ragionamento.",
    guideSeverityHighTitle: "Alta",
    guideSeverityHighDesc: "Manipolazione palese, falsità grave o fallacia che invalida la tesi sostenuta.",

    guideTaxonomyHeading: "Repertorio delle fallacie e dei bias",
    guideTaxonomyIntro:
      "Consulta le definizioni complete delle categorie censite da Rhetorix:",

    youtubeSectionTitle: "Video & YouTube",
    youtubeAnalyzeChunkBtn: "⚡ Analizza (15 min)",
    youtubeAnalyzeFullBtn: "⚡ Analizza tutto il video",
    youtubeAnalyzingChunkStatus: (start, end) => `⏳ Analisi della sezione (${start} - ${end}) in corso...`,
    youtubeAnalyzingFullStatus: "⏳ Analisi dell'intero video in corso...",
    youtubeChunkReadyBtn: "⚡ Analizza tutto il video",
    youtubeNoTranscriptError: "Nessuna trascrizione disponibile per questo video.",
    youtubeChunkLabel: (current, total, start, end) => `Tranche ${current}/${total} (${start} - ${end})`,
    youtubeChunkMinutesLabel: "Durata della tranche di analisi (minuti)",
    youtubeMinDisplayLabel: "Durata minima della notifica (secondi)",
    youtubePauseModeLabel: "Comportamento di pausa automatica",
    youtubePauseModeNone: "Non interrompere il video",
    youtubePauseModeStart: "Metti in pausa prima del passaggio",
    youtubePauseModeAfter: "Metti in pausa dopo il passaggio",
    youtubeAutoResumeLabel: "Ripresa automatica dopo la pausa (conto alla rovescia)",
    youtubeAutoResumeDurationLabel: "Attesa prima della ripresa automatica (secondi)",
    youtubeTimelineMarkersLabel: "Mostra marcatori e zone analizzate sulla barra di YouTube",
    youtubeTimeBadge: (time) => `▶ ${time}`,

    tokenUsageLabel: "Token:",
    tokenIn: (n) => `${n} in`,
    tokenOut: (n) => `${n} out`,
    tokenTotal: (n) => `(${n} totale)`,
    tokenCached: "0 token (cache)",
    tokenIdle: "— (in attesa di analisi)",
    tabTokens: "Consumo e quote",
    tokensSectionTitle: "Consumo di token",
    tokensTabIntro: "Misurazione precisa e locale dei token di input e output consumati durante le analisi.",
    tokensPeriodLabel: "Periodo corrente",
    tokensAllTimeLabel: "Totale complessivo",
    tokensMonthlyResetLabel: "Ripristino mensile",
    tokensResetDisabled: "Disattivato (accumulo continuo)",
    tokensResetDayOption: (day) => `Il ${day} di ogni mese`,
    tokensResetBtn: "Azzera contatore (reset)",
    tokensResetSuccess: "Contatore del periodo azzerato.",
    monthlyResetHint: "Il contatore del periodo si azzera automaticamente alla data selezionata.",
    quotasHelpHeading: "Controlla le tue quote in base al provider",

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
