# Points ouverts — analyse du PRD

Ambiguïtés, risques et décisions relevés à la lecture de la [spécification](specification.md). Les décisions prises sont consignées ci-dessous ; leur mise en œuvre est décrite dans l'[architecture](../techniques/architecture.md).

## Décisions prises (2026-10-03)

| # | Sujet | Décision | Conséquences |
|---|---|---|---|
| D1 | Stack | **TypeScript + esbuild** | Les sources sont dans `src/`, le build produit `dist/`, qui est le dossier chargé dans le navigateur. Le schéma JSON et les messages sont typés |
| D2 | Providers LLM | **Compatible OpenAI, Anthropic, Google Gemini** | Trois adaptateurs derrière une interface commune (voir architecture §7). « Compatible OpenAI » couvre aussi Mistral, OpenRouter, Ollama, LM Studio… |
| D3 | Vérification factuelle | **Outil de recherche web du provider quand il existe. Sinon, `status: "unverified"` et aucune URL** | Seules les URL renvoyées par la recherche web sont affichées. Si le provider ou le modèle n'a pas cet outil, `sources` est vidé côté client |
| D4 | Labels | **Liste fermée par catégorie, plus `"autre"`** | 31 labels prédéfinis, documentés et traduits en 5 langues dans `src/taxonomy.ts` |
| D5 | Langue | **Langue de l'interface** (navigateur par défaut, réglable dans les options) | `exact_quote` reste toujours dans la langue de l'article |
| D6 | Articles longs | **Limite configurable, puis découpage par paragraphes** | Plusieurs appels, puis fusion des annotations avec renumérotation des ids et un `summary` consolidé |
| D7 | Persistance | **Cache par URL dans `storage.local`** | Gérer la clé, l'invalidation et le volume (voir architecture §8) |
| D8 | Navigateurs | **Chromium (≥ 128) et Firefox (≥ 142)** | Deux paquets générés : `dist/chrome` (`side_panel`, service worker) et `dist/firefox` (`sidebar_action`, script de fond, `data_collection_permissions`). Voir architecture §9 |
| D9 | Mobile | **Firefox pour Android (≥ 142)**, même paquet que Firefox desktop. **L'analyse est pilotée par le script de fond partout** ; sur mobile, le toucher de l'icône lance l'analyse immédiatement et le résultat s'affiche en **bulles au toucher** seulement | Le panneau devient une vue de l'état publié par le script de fond (architecture §3). Sur mobile : pas de résumé ni de liste, les annotations non localisées ne sont pas visibles ; l'avancement passe par un message bref dans la page. Safari iOS reste hors périmètre |

## Reste à préciser

- **Identifiant Firefox** : `rhetorix@rhetorix.local` est provisoire. Il faudra le remplacer avant publication définitive sur addons.mozilla.org.
- **Firefox pour Android (D9), à tester sur un appareil réel** (`npx web-ext run -t firefox-android`) :
  - le script de fond est maintenu actif pendant l'analyse par un appel d'API toutes les 20 s ; il faut vérifier que Firefox Android ne le suspend pas pendant un appel LLM long ;
  - l'octroi d'`activeTab` et la demande de permission depuis `action.onClicked` ;
  - si l'injection du content script échoue, aucun message ne peut s'afficher dans la page.
- **Chrome Built-in AI et script de fond** : la Prompt API n'est documentée que pour les fenêtres, pas pour les workers ; il faut vérifier qu'elle est exposée dans le service worker d'extension, sinon passer par un document hors écran. Par ailleurs, `chrome-ai.ts` cherche l'ancien global `ai.languageModel`, remplacé par `LanguageModel` dans les versions récentes de Chrome.

## Éléments traités

- **Options d'onboarding sans clé et accès simplifié** :
  - **Chrome Built-in AI (Gemini Nano)** : intégration de la Prompt API Chromium locale (`src/providers/chrome-ai.ts`), fonctionnant à 100% en local sur GPU/NPU sans clé API, sans coût et sans compte.
  - **Ollama local en 1 clic** : bouton de pré-remplissage automatique des options pour Ollama local (`http://localhost:11434/v1`, modèle `mistral`, clé facultative).
  - **Génération directe de clés gratuites** : bouton direct vers Google AI Studio pour obtenir une clé Gemini sans carte bancaire en un clic.
- **Recherche web Gemini (Google Search grounding) & Compatible OpenAI (citations)** : l'outil `googleSearch` de Gemini est pleinement supporté et ses `groundingChunks` sont extraits du flux SSE pour valider les sources (D3). Pour les endpoints compatibles OpenAI (Perplexity `sonar`, OpenRouter `:online`), les citations `chunk.citations` sont capturées en streaming.
- **Banc d'essai CLI (`scripts/test-live-provider.mjs`)** : script de test direct en ligne de commande (`npm run test:live`) permettant de vérifier le streaming, le fact-checking et la conformité D3 sur de vraies clés d'API sans passer par l'interface du navigateur.
- **Ajustement de la limite de découpage (D6)** : valeur par défaut ramenée à 8 000 tokens (~6 000 mots) pour optimiser le temps de réponse et paralléliser l'analyse des longs articles par tranches traitées par 2 workers concurrents.
- **Streaming et affichage progressif (D2 / D6)** : implémenté via `src/streaming-json.ts` (`ProgressiveJsonParser`) sur les 3 fournisseurs (Anthropic, Gemini, OpenAI-compatible). Le résumé se met à jour en temps réel et les cartes d'annotations apparaissent dynamiquement au fil de l'eau dès validation unitaire, avec application immédiate de la politique D3 et préfixage des identifiants lors du découpage.
- **Internationalisation complète & Traduction de la taxonomie (D4 / D5)** : module `src/i18n.ts` et traductions complètes de la taxonomie (`src/taxonomy.ts`) pour les 5 langues supportées (fr, en, es, de, it). Panneau latéral, options et messages d'erreurs (extraction et providers) s'adaptent dynamiquement en temps réel.
- **Icônes de l'extension** : créées en SVG (`src/icons/icon.svg`) et déclinées en PNG (16, 32, 48, 128 px), déclarées dans les manifests Chromium et Firefox.
- **Résumé consolidé (D6)** : implémenté via `consolidateSummary` sur les 3 providers avec streaming textuel et repli gracieux sur les résumés partiels concaténés en cas d'erreur.
- **Filtrage des cartes par catégorie** : filtres interactifs par catégorie avec compteurs incrémentés en temps réel ajoutés dans le panneau latéral (`sidepanel.html` / `sidepanel.ts`).
- **Ollama et serveurs locaux** : consigne `OLLAMA_ORIGINS` intégrée directement dans la page d'options sous le champ endpoint avec préservation du balisage `<code>`.
- **Compatibilité Firefox / AMO** : `strict_min_version` fixée à 142.0 pour la conformité avec `data_collection_permissions`, avertissement `web-ext lint` résolu.

## Écarts entre le PRD et la plateforme

- **Un seul highlight nommé** (`rhetorix-highlight`) ne permet pas plusieurs couleurs. Il faut un highlight par catégorie (voir architecture §5).
- **Clic sur une citation surlignée** : la CSS Custom Highlight API n'émet pas d'événements. Il faut un hit-test manuel (voir architecture §5).
- **Pas de script de fond dans le PRD**, alors qu'il en faut un pour ouvrir le panneau au clic sur l'icône (implémenté dans `src/background.ts`).
- **`activeTab` seul** : la permission ne vaut que pour l'onglet où l'icône a été cliquée. Si l'utilisateur change d'onglet avec le panneau ouvert, l'injection échoue. Il faut soit redemander un clic sur l'icône, soit ajouter des `host_permissions` larges, ce qui a un coût en confiance et en revue sur le Chrome Web Store.
- **Appel LLM depuis le script de fond** : il faut des `host_permissions` vers l'endpoint configuré (voir architecture §2).
- **« JSON validé » et streaming** : résolu. Le parseur progressif extrait et valide individuellement chaque annotation du flux dès fermeture de ses accolades (`validateAnnotation`), et transmet le résumé au fur et à mesure sans compromettre l'intégrité du schéma.

## Risques produit

- **Citations non exactes.** Le LLM paraphrase ou corrige la typographie. Il faut normaliser, prévoir un repli approximatif et afficher en mode dégradé les annotations non localisées.
- **Hallucination des sources** : D3 l'atténue, garantie en streaming et en sortie finale par `enforceAnnotationSourcePolicy` et `enforceSourcePolicy`.
- **Neutralité.** Qualifier un texte de biaisé est sensible. Il faut un prompt système qui exige une justification, un ton descriptif, et qui permette de ne rien signaler.
- **Confidentialité.** Le contenu de la page part chez un tiers. Le dire explicitement dans l'interface et dans la fiche du Store.
- **Pages non compatibles** : paywalls, SPA, PDF, pages `chrome://`. Readability peut renvoyer `null`. Des codes d'erreur traduits (`no_article`, `empty_article`) sont affichés.

## Hors périmètre (à confirmer)

- Safari (macOS et iOS) : il exige un emballage en application Xcode et une publication sur l'App Store.
- Chrome pour Android et iOS : pas d'extensions.
- Analyse de vidéos ou de transcriptions.
- Compte utilisateur, backend propre, historique partagé.
