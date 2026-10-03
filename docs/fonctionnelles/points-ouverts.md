# Points ouverts — analyse du PRD

Ambiguïtés, risques et décisions relevés à la lecture de la [spécification](specification.md). Les décisions prises sont consignées ci-dessous ; leur mise en œuvre est décrite dans l'[architecture](../techniques/architecture.md).

## Décisions prises (2026-10-03)

| # | Sujet | Décision | Conséquences |
|---|---|---|---|
| D1 | Stack | **TypeScript + esbuild** | Les sources sont dans `src/`, le build produit `dist/`, qui est le dossier chargé dans le navigateur. Le schéma JSON et les messages sont typés |
| D2 | Providers LLM | **Compatible OpenAI, Anthropic, Google Gemini** | Trois adaptateurs derrière une interface commune (voir architecture §7). « Compatible OpenAI » couvre aussi Mistral, OpenRouter, Ollama, LM Studio… |
| D3 | Vérification factuelle | **Outil de recherche web du provider quand il existe. Sinon, `status: "unverified"` et aucune URL** | Seules les URL renvoyées par la recherche web sont affichées. Si le provider ou le modèle n'a pas cet outil, `sources` est vidé côté client |
| D4 | Labels | **Liste fermée par catégorie, plus `"autre"`** | L'énumération est fixée dans le schéma et le prompt. La liste exacte reste à rédiger (voir ci-dessous) |
| D5 | Langue | **Langue de l'interface** (navigateur par défaut, réglable dans les options) | `exact_quote` reste toujours dans la langue de l'article |
| D6 | Articles longs | **Limite configurable, puis découpage par paragraphes** | Plusieurs appels, puis fusion des annotations avec renumérotation des ids et un `summary` consolidé |
| D7 | Persistance | **Cache par URL dans `storage.local`** | Gérer la clé, l'invalidation et le volume (voir architecture §8) |
| D8 | Navigateurs | **Chromium (≥ 128) et Firefox (≥ 140)** | Deux paquets générés : `dist/chrome` (`side_panel`, service worker) et `dist/firefox` (`sidebar_action`, script de fond). Voir architecture §9 |

## Reste à préciser

- **Recherche web et sortie structurée** : vérifier pour chaque provider qu'on peut combiner l'outil de recherche web et la sortie JSON contrainte. Selon les modèles, Gemini restreint la combinaison du grounding Google Search avec un `responseSchema`. Si c'est impossible, prévoir deux passes : une analyse structurée, puis une vérification avec recherche.
- **Compatible OpenAI et recherche web** : la plupart des endpoints compatibles n'ont pas d'outil de recherche web. Ils sont donc en mode `unverified` par défaut.
- **Limite de découpage (D6)** : la valeur par défaut est de 12 000 tokens. À ajuster selon les coûts constatés.
- **Streaming** : l'adaptateur Anthropic reçoit la réponse en flux, mais rien ne s'affiche avant la fin de l'analyse. Les deux autres adaptateurs ne sont pas en flux. L'affichage progressif des cartes reste à faire.
- **Identifiant Firefox** : `rhetorix@rhetorix.local` est provisoire. Il faudra le remplacer avant publication sur addons.mozilla.org.

## Éléments traités

- **Internationalisation & Traduction de la taxonomie (D4 / D5)** : module `src/i18n.ts` et traductions complètes de la taxonomie (`src/taxonomy.ts`) pour les 5 langues supportées (fr, en, es, de, it). L'interface du panneau latéral et de la page d'options s'adapte dynamiquement en temps réel, et le prompt système injecte les définitions dans la langue cible.
- **Icônes de l'extension** : créées en SVG (`src/icons/icon.svg`) et déclinées en PNG (16, 32, 48, 128 px), déclarées dans les manifests Chromium et Firefox.
- **Résumé consolidé (D6)** : implémenté via `consolidateSummary` sur les 3 providers (Anthropic, Gemini, OpenAI-compatible) avec repli gracieux sur les résumés partiels concaténés en cas d'erreur.
- **Filtrage des cartes par catégorie** : filtres interactifs par catégorie avec compteurs ajoutés dans le panneau latéral (`sidepanel.html` / `sidepanel.ts`).
- **Ollama et serveurs locaux** : consigne `OLLAMA_ORIGINS` intégrée directement dans la page d'options sous le champ endpoint.
- **Compatibilité Firefox / AMO** : `strict_min_version` fixée à 142.0 pour la compatibilité avec `data_collection_permissions`, avertissement `web-ext lint` résolu.

## Écarts entre le PRD et la plateforme

- **Un seul highlight nommé** (`rhetorix-highlight`) ne permet pas plusieurs couleurs. Il faut un highlight par catégorie (voir architecture §5).
- **Clic sur une citation surlignée** : la CSS Custom Highlight API n'émet pas d'événements. Il faut un hit-test manuel (voir architecture §5).
- **Pas de script de fond dans le PRD**, alors qu'il en faut un pour ouvrir le panneau au clic sur l'icône (implémenté dans `src/background.ts`).
- **`activeTab` seul** : la permission ne vaut que pour l'onglet où l'icône a été cliquée. Si l'utilisateur change d'onglet avec le panneau ouvert, l'injection échoue. Il faut soit redemander un clic sur l'icône, soit ajouter des `host_permissions` larges, ce qui a un coût en confiance et en revue sur le Chrome Web Store.
- **Appel LLM depuis le panneau** : il faut des `host_permissions` vers l'endpoint configuré (voir architecture §2).
- **« JSON validé » et streaming** : les deux se combinent mal. Il faut préciser ce qui s'affiche pendant le flux.

## Risques produit

- **Citations non exactes.** Le LLM paraphrase ou corrige la typographie. Il faut normaliser, prévoir un repli approximatif et afficher en mode dégradé les annotations non localisées.
- **Hallucination des sources** : D3 l'atténue, mais il faut garder un test qui vérifie qu'aucune URL ne s'affiche hors recherche web.
- **Neutralité.** Qualifier un texte de biaisé est sensible. Il faut un prompt système qui exige une justification, un ton descriptif, et qui permette de ne rien signaler.
- **Confidentialité.** Le contenu de la page part chez un tiers. Le dire explicitement dans l'interface et dans la fiche du Store.
- **Pages non compatibles** : paywalls, SPA, PDF, pages `chrome://`. Readability peut renvoyer `null`. Il faut un message d'erreur clair.

## Hors périmètre (à confirmer)

- Safari et Firefox pour Android.
- Analyse de vidéos ou de transcriptions.
- Compte utilisateur, backend propre, historique partagé.
