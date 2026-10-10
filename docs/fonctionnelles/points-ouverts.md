# Points ouverts — analyse du PRD

Ambiguïtés, risques et décisions relevés à la lecture de la [spécification](specification.md). Les décisions prises sont consignées ci-dessous ; leur mise en œuvre est décrite dans l'[architecture](../techniques/architecture.md).

## Décisions prises (2026-10-03)

| # | Sujet | Décision | Conséquences |
|---|---|---|---|
| D1 | Stack | **TypeScript + esbuild** | Les sources sont dans `src/`, le build produit `dist/`, qui est le dossier chargé dans le navigateur. Le schéma JSON et les messages sont typés |
| D2 | Providers LLM | **Compatible OpenAI, Anthropic, Google Gemini, Mistral** | Adaptateurs derrière une interface commune (voir architecture §7). « Compatible OpenAI » couvre OpenAI, OpenRouter, Ollama, LM Studio… avec un endpoint saisi. Mistral est un provider à part entière (2026-10-09) : même API, mais adresse fixe, ce qui épargne la saisie de l'endpoint et garantit que la clé ne part que vers `api.mistral.ai` |
| D3 | Vérification factuelle | **Outil de recherche web du provider quand il existe. Sinon, `status: "unverified"` et aucune URL** | Seules les URL renvoyées par la recherche web sont affichées. Si le provider ou le modèle n'a pas cet outil, `sources` est vidé côté client |
| D4 | Labels | **Liste fermée par catégorie, plus `"autre"`** | 31 labels prédéfinis, documentés et traduits en 5 langues dans `src/taxonomy.ts` |
| D5 | Langue | **Langue de l'interface** (navigateur par défaut, réglable dans les options) | `exact_quote` reste toujours dans la langue de l'article |
| D6 | Articles longs | **Limite configurable, puis découpage par paragraphes** | Plusieurs appels, puis fusion des annotations avec renumérotation des ids et un `summary` consolidé |
| D7 | Persistance | **Cache par URL dans `storage.local`** | Gérer la clé, l'invalidation et le volume (voir architecture §8) |
| D8 | Navigateurs | **Chromium (≥ 128) et Firefox (≥ 142)** | Deux paquets générés : `dist/chrome` (`side_panel`, service worker) et `dist/firefox` (`sidebar_action`, script de fond, `data_collection_permissions`). Voir architecture §9 |
| D9 | Mobile | **Firefox pour Android (≥ 142)**, même paquet que Firefox desktop. **L'analyse est pilotée par le script de fond partout** ; sur mobile, le toucher de l'icône lance l'analyse immédiatement et le résultat s'affiche en **bulles au toucher** seulement | Le panneau devient une vue de l'état publié par le script de fond (architecture §3). Sur mobile : pas de résumé ni de liste, les annotations non localisées ne sont pas visibles ; l'avancement passe par un message bref dans la page. Safari iOS reste hors périmètre |

## Décisions prises (2026-10-05)

Orientations pour l'évolution du moteur d'analyse, détaillées dans [evolutions-analyse.md](../techniques/evolutions-analyse.md). D10 à D17 sont mises en œuvre.

| # | Sujet | Décision | Conséquences |
|---|---|---|---|
| D10 | Coût de l'analyse | **Réglage « rapide / approfondi »** | Le mode rapide fait une passe d'analyse par morceau. Le mode approfondi y ajoute la cartographie préalable des articles découpés et la relecture des annotations. Un seul réglage, « rapide » par défaut, libellé « Analyse : rapide / approfondie » avec une aide qui annonce le surcoût (jusqu'à 2 appels supplémentaires). La vérification factuelle séparée ne dépend pas de ce réglage : elle se fait à la demande (D14). Textes d'interface en 5 langues. Le défaut sera réexaminé au vu du corpus d'évaluation |
| D11 | Cache au rechargement | **Affichage immédiat avec avertissement** | Une analyse en cache dont la configuration ne correspond plus (provider, modèle, langue, version du moteur…) est affichée avec la mention « peut-être obsolète » et le bouton « Ré-analyser ». Le texte n'est pas ré-extrait au rechargement. Corrige l'écart actuel avec l'architecture §8 |
| D12 | Annotations sans citation | **Acceptées, ancrées sur le titre** ; pour YouTube, sur le **titre de la vidéo** affiché sous le lecteur (précisé le 2026-10-05) | Pour les défauts de structure de l'argumentation (`sophism` et `bias` seulement), `exact_quote` vide (spec §3). Section dédiée dans le panneau. Le titre est surligné ; son survol ou son toucher ouvre une bulle qui les liste. Sur mobile, rappel dans le message bref ; si le titre n'est pas trouvé dans la page, le message bref les affiche en entier et reste jusqu'au toucher |
| D13 | Corpus d'évaluation | **Stockage selon la licence** (précisé le 2026-10-05) | Corpus de préférence libre : textes rédigés pour l'occasion, domaine public, licences ouvertes, versionnés dans `eval/corpus/texts/`. Les textes non libres, utiles pour la représentativité (presse d'opinion), restent dans `eval/corpus/.local/`, ignoré par git, et se récupèrent par `npm run corpus:fetch`. Les fiches (références, licence, annotations attendues) sont toujours versionnées. Voir [eval/corpus](../../eval/corpus/README.md) |
| D14 | Vérification factuelle séparée (C2) | **À la demande, allégation par allégation** (2026-10-05) | Une allégation « non vérifiée » propose « Vérifier en ligne » dans sa carte et dans sa bulle. L'appel active la recherche web pour lui seul, même si le réglage de recherche web est désactivé (quota gratuit Gemini), et applique la politique des sources (D3). Le résultat remplace la vérification dans l'affichage et complète l'entrée du cache. Proposé avec Anthropic et Gemini, et avec un endpoint compatible OpenAI si la recherche web y est activée ; pas avec Chrome Built-in AI |
| D15 | Signalement d'une annotation (Q4) | **Contestation locale, signalement par ticket GitHub prérempli** (2026-10-05) | « Contester » replie l'annotation (carte repliée, surlignage atténué, bulle réduite) et l'enregistre dans `storage.local` avec les réglages du moteur. Les options listent les annotations contestées : « Signaler sur GitHub… » affiche un avertissement (vérifier l'absence d'information personnelle dans le texte cité), une case pour inclure ou non l'adresse de la page (page privée ou interne) et un commentaire facultatif, puis ouvre l'URL de création du ticket dans un onglet. Aucun appel d'API : l'utilisateur publie lui-même le ticket |
| D16 | Citations scientifiques | **Niveau de preuve et notice Crossref** (2026-10-05) | Pour une allégation qui repose sur une étude, le modèle identifie l'étude, juge la fidélité de l'article (conclusion amplifiée, corrélation présentée comme causalité, résultat animal ou in vitro appliqué à l'humain, petit échantillon, étude isolée contre le consensus) et renseigne `fact_check.evidence` : type d'étude et DOI (spec §3). Si l'étude a un DOI, sa notice est demandée à Crossref (API publique sans clé ; OpenAlex écarté, faute de clé prévue) : revue, année, prépublication, rétractation, avis de réserve. Automatique quand la recherche web est utilisée ; sinon lors d'une vérification à la demande (D14). Pas de note de qualité des revues : seulement des signalements factuels. Exception à D3 : le lien `doi.org` est affiché pour un DOI confirmé par Crossref. Sans recherche web, aucun DOI n'est gardé |
| D17 | Conflits d'intérêts des auteurs d'une étude | **Déclarations publiées seulement** : financeurs et déclarations d'intérêts déposés dans Crossref, puis PubMed si pertinent (2026-10-05) | Lus dans la notice Crossref déjà demandée (D16) : `funder` et, quand l'éditeur l'a rempli, la mention de conflits d'intérêts du champ `assertion`. Sans déclaration Crossref, la déclaration `CoiStatement` de PubMed (API E-utilities, sans clé) est cherchée par le DOI : seules les études biomédicales y sont indexées, ce qui fait office de critère de pertinence ; pas pour une prépublication. Jamais d'information sur les conflits d'intérêts venant du modèle. Affichage cité tel quel, sans conclusion ; faute de déclaration : « aucune déclaration trouvée », jamais « pas de conflit d'intérêts » |

## Reste à préciser

- **Évolutions du moteur d'analyse** : les pistes restantes (dimensionnement des morceaux et de la concurrence, intertitres) sont recensées dans [evolutions-analyse.md](../techniques/evolutions-analyse.md) §5.
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
- **Résumé consolidé (D6)** : implémenté via l'appel textuel `complete` des providers, qui consolide aussi le décalage titre / contenu et l'angle mort (piste B2), avec affichage progressif du résumé et repli sur la fusion des résultats partiels en cas d'erreur.
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
