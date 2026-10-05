# Architecture technique de Rhetorix

Vue d'ensemble des composants, du flux de données et des choix d'implémentation pour la v0.1.

## 1. Composants

```
┌────────────── Page web (DOM vivant) ──────────────┐
│                                                   │
│   Texte avec surlignages (CSS Custom Highlight)   │
│                                                   │
└───────────────────────┬───────────────────────────┘
                        │
       injection à la   │   messages :
       demande          │   - extract / extract:result
                        │   - highlight / focus / annotation-clicked
                        │
┌─────────────── content-script.js ─────────────────┐
│ Readability.js, indexation du texte,              │
│ calcul des Range, détection des clics sur citation│
└───────────────────────┬───────────────────────────┘
                        │
┌─────────────── background.js (runner.ts) ─────────┐     ┌──────── sidepanel.html / .js ────────┐
│ Pilote l'analyse par onglet (D9) : injection,     │◄───►│ Vue : cartes, filtres, affichage     │
│ extraction, cache, LLM, surlignage ; publie l'état│ msg │ progressif, synchronisation          │
└───────────────────────┬───────────────────────────┘     └──────────────────────────────────────┘
                        │       (mobile, sans panneau : bulles au toucher et message bref dans la page)
                        ├───────────────────────────────┐
                        │ appelle                       │ lit / écrit
                        ▼                               ▼
     ┌───────────────────────────────────┐    ┌───────────────────┐
     │            src/analyze.ts         │    │  cache (D7)       │
     │  découpage D6, validation D3      │    │  storage.local    │
     └──────────────────┬────────────────┘    └───────────────────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  anthropic   │ │  openai-     │ │    gemini    │
│   provider   │ │  compatible  │ │   provider   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ api.anthropic│ │ endpoint     │ │ generativelan│
│ .com         │ │ configuré    │ │ guage.google │
└──────────────┘ └──────────────┘ └──────────────┘
                                                 ▲
                                                 │ lit
┌──────── options.html / options.js ────────┐    │
│ provider, endpoint, modèle, clé API, cache│────┴── chrome.storage.local
└───────────────────────────────────────────┘
```

Le PRD ne mentionne pas de script de fond. Il en faut un (`src/background.ts`) pour deux rôles :

- **ouvrir le panneau au clic sur l'icône** : `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` sous Chromium, `sidebarAction.toggle()` sous Firefox desktop ; sous Firefox Android, qui n'a ni l'un ni l'autre, le clic lance directement l'analyse (§9) ;
- **piloter les analyses (D9)** : `src/runner.ts` garde l'état de chaque onglet et le publie au panneau. L'analyse continue si le panneau est fermé ou si l'utilisateur change d'onglet.

## 2. Manifest

Le manifest est généré par `build.mjs` pour chaque cible (§9). Permissions communes : `activeTab`, `scripting`, `storage`, plus `sidePanel` sous Chromium.

Points à noter :

- **`host_permissions` vers l'endpoint LLM.** Une page d'extension ne contourne CORS que pour les hôtes déclarés. Comme l'endpoint est configurable, utiliser `optional_host_permissions` et demander la permission depuis la page d'options (`permissions.request`) au moment de l'enregistrement.
- **Script de fond** : `service_worker` sous Chromium, `scripts` sous Firefox (voir §9).
- **Aucun code distant.** Readability.js doit être embarqué dans le paquet.

## 3. Flux d'analyse

1. Clic sur l'icône : le panneau s'ouvre et `activeTab` est accordé pour l'onglet courant.
2. « Analyser la page » : le panneau demande la permission vers l'API du provider (avant tout `await`), puis envoie `{type: "analyze-tab", tabId, force}` au script de fond. **Toute la suite se déroule dans le script de fond** (`src/runner.ts`), qui publie l'état de l'onglet (`run-update`) à chaque étape ; le panneau ne fait que l'afficher. Le script de fond injecte le content script (`scripting.executeScript`), puis lui envoie `{type: "extract"}` (`tabs.sendMessage`).
3. Le content script exécute `new Readability(document.cloneNode(true)).parse()` et renvoie `{ok: true, article: {title, paragraphs, lang, publishedTime?, byline?, siteName?}}`. Les métadonnées de publication sont transmises au modèle, qui juge les allégations à la date de publication (C1).
4. Le script de fond appelle le LLM en streaming via `ProgressiveJsonParser` (`src/streaming-json.ts`). Le résumé est affiché et mis à jour progressivement. Chaque annotation est extraite dès complétion de ses accolades, validée unitairement (`validateAnnotation`), assainie selon la politique D3 (`enforceAnnotationSourcePolicy`) et publiée immédiatement ; le panneau l'affiche sous forme de carte, avec incrémentation en temps réel des compteurs de filtres et préfixage des identifiants en cas de découpage.
5. Une fois l'analyse terminée, le script de fond envoie `{type: "highlight", annotations: [{id, exact_quote, category}]}` au content script.
6. Le content script localise chaque citation (§4), crée les `Range`, alimente les highlights et répond avec la liste des ids **non localisés**. Le panneau les affiche en mode dégradé (carte sans lien vers la page).

**Durée de vie du script de fond.** Le service worker (Chromium) comme le script de fond non persistant (Firefox) sont suspendus après une trentaine de secondes sans activité d'API. Pendant une analyse, `runner.ts` appelle `runtime.getPlatformInfo()` toutes les 20 s pour le maintenir actif. S'il est malgré tout suspendu entre deux analyses, l'état en mémoire est perdu, mais le panneau garde ses propres résultats et le cache (D7) rend une nouvelle analyse immédiate.

## 4. Localisation des citations

Readability travaille sur un clone et produit du texte normalisé. Les citations doivent donc être recherchées dans le **DOM vivant** :

- construire un index texte de la page par `TreeWalker` sur les nœuds `Text` visibles, avec une table de correspondance offset → (nœud, offset local) ;
- normaliser des deux côtés : espaces multiples, espaces insécables, guillemets et apostrophes typographiques, tirets ;
- une citation peut couvrir plusieurs nœuds (`<em>`, liens) : le `Range` part du nœud de début et s'arrête au nœud de fin ;
- si la correspondance exacte échoue, prévoir un repli (recherche approximative, ou correspondance sur le début et la fin de la citation), sinon marquer l'annotation comme non localisée.

## 5. Surlignage et interaction

**Un `Highlight` par style.** Un nom de highlight correspond à une seule règle `::highlight()`. Le nom unique `rhetorix-highlight` du PRD ne permet pas de distinguer les couleurs par catégorie. Il faut prévoir `rhetorix-sophism`, `rhetorix-bias`, `rhetorix-factual`, ainsi qu'un `rhetorix-active` pour la citation sélectionnée, `rhetorix-document` pour le titre qui porte les annotations d'ensemble (D12) et `rhetorix-contested` pour les annotations contestées (D15), qui quittent le surlignage de leur catégorie.

**Annotations d'ensemble (D12).** Sans citation, elles ne sont pas localisées : `highlight` reçoit le titre de l'article et le content script en cherche la plage (un `<h1>` dont le texte correspond au titre extrait, sinon la première occurrence du titre, sinon le seul `<h1>` de la page). Il répond `titleLocated` ; le titre surligné ouvre au survol ou au toucher une bulle qui liste ces annotations, et le clic sur leur carte y fait défiler la page. Sur YouTube, `youtube-highlight` transmet ces annotations au content script de la vidéo, qui surligne le titre affiché sous le lecteur (`ytd-watch-metadata h1`) ; `highlights.css` y est aussi injecté.

**Les highlights ne reçoivent pas d'événements.** Ils ne créent pas d'éléments DOM, donc un clic ou un survol sur une citation surlignée ne peut pas être capté directement. Il faut :

1. écouter `click` sur `document` (phase de capture) : il active la carte dans le panneau et ouvre la bulle de la citation. C'est aussi le chemin du **toucher** sur mobile (D9) ; un toucher hors des citations et de la bulle la referme ;
2. écouter `pointermove` sur `document` (throttlé via `requestAnimationFrame`), **pour la souris seulement**, pour détecter le survol des zones surlignées (`caretAt` / `isPointInRange`). Au doigt, `pointermove` accompagne le défilement et `pointerleave` suit chaque toucher : les deux sont ignorés ;
3. dans l'autre sens, un clic sur une carte envoie `{type: "focus", id}` : le content script appelle `scrollIntoView` sur l'élément parent du `Range` et active le highlight.

**Modes d'affichage : panneau latéral, bulles en ligne (inline) ou combiné.**
L'utilisateur peut choisir son mode d'affichage (`displayMode: "sidepanel" | "inline" | "both"`) dans les options ou via un sélecteur direct dans la barre d'outils du panneau :
- **Mode panneau latéral (`sidepanel`)** : les cartes d'annotations s'affichent uniquement dans le panneau latéral ;
- **Mode bulles en ligne (`inline`)** : au survol d'un passage surligné, une bulle flottante colorée apparaît à proximité immédiate de la citation dans la page ;
- **Mode combiné (`both`, par défaut)** : le panneau latéral et les bulles au survol sont tous les deux actifs simultanément.

**Isolation des bulles flottantes en Shadow DOM.**
Afin d'éviter tout conflit de styles avec la page hôte (ex. Wikipedia, Le Monde, NYTimes), la bulle est encapsulée dans un hôte `<div id="rhetorix-popover-host">` rattaché avec un Shadow Root ouvert (`attachShadow({ mode: "open" })`). Elle est implémentée par `AnnotationPopover` ([annotation-popover.ts](../../src/annotation-popover.ts)), partagé par le content script des articles et celui de YouTube, qui porte aussi le message bref.
- Le style CSS est strictement isolé ;
- Le positionnement est calculé dynamiquement (`position: fixed`) au-dessus ou en-dessous du `Range`, sans débordement de l'écran ;
- La bordure gauche et le badge reprennent la couleur de la catégorie (rouge sophisme, orange biais, bleu allégation) ;
- La bulle reste accessible au survol (permettant la sélection de texte ou le clic sur les liens de sources factuelles) ;
- Elle affiche la confiance (Q3) et les actions « Vérifier en ligne » (D14, allégation non vérifiée, si le provider le permet) et « Contester » (D15), qui passent par le script de fond comme celles du panneau : elles fonctionnent donc aussi sans panneau, sur mobile ;
- Sécurité stricte : zéro `innerHTML`, manipulation exclusive via l'API DOM (`createElement`, `textContent`, `setAttribute`).

## 6. Messages

Types dans `src/messages.ts`.

| Type | Émetteur → destinataire | Charge utile |
|---|---|---|
| `analyze-tab` | panneau → fond | `{tabId, force}` |
| `cancel` | panneau → fond | `{tabId}` |
| `get-state` | panneau → fond | `{tabId}`, réponse : `RunSnapshot` ou `null` |
| `run-update` | fond → panneau | `{snapshot: RunSnapshot}` : statut, phase, avancement, résumé, annotations, non localisées, erreur, titre localisé, vérifications à la demande possibles, en cours et en échec |
| `extract` | fond → content | réponse : `{ok: true, article: {title, paragraphs, lang}}` ou `{ok: false, error, errorCode}` |
| `highlight` | fond → content | `{annotations: HighlightItem[], displayMode?, lang?, title?, canVerify?}`, réponse : `{unlocated: string[], titleLocated?: boolean}` ; les annotations d'ensemble ne figurent pas dans `unlocated` |
| `update-annotation` | fond → content | `{annotation, verifying?, error?}` : vérification à la demande en cours ou terminée (D14) |
| `verify-annotation` | panneau ou content → fond | `{tabId?, id}` : vérification en ligne d'une allégation (D14) ; sans `tabId`, l'onglet de l'expéditeur |
| `contest-annotation` | panneau ou content → fond | `{tabId?, id, contested}` : contestation ou retrait (D15) |
| `youtube-highlight` | fond → content YouTube | `{annotations: VideoAnnotation[], analyzedRanges, lang?, documentAnnotations?}` |
| `toast` | fond → content | `{text, isError?, durationMs?}` : message bref dans la page, sur mobile |
| `set-display-mode` | panneau → content | `{displayMode: DisplayMode}` |
| `focus` | panneau → content | `{id}` |
| `annotation-clicked` | content → panneau | `{id}` |
| `clear` | panneau → content | — |

Si le script de fond a perdu l'état de l'onglet (service worker arrêté), `verify-annotation` et `contest-annotation` le rechargent d'abord depuis le cache (`loadCachedRun`).

Le panneau est partagé entre les onglets. Il garde les résultats terminés par `tabId` et, au changement d'onglet (`tabs.onActivated`), affiche l'état mémorisé ou le demande au script de fond (`get-state`) ; une analyse peut donc se poursuivre dans un onglet pendant qu'on en consulte un autre. Le rechargement ou la fermeture d'un onglet (`tabs.onUpdated`, `tabs.onRemoved`) annule son analyse.

## 7. Appel LLM

Trois adaptateurs (décision D2) implémentent la même interface :

```ts
interface LlmProvider {
  supportsWebSearch(config: Config): boolean;
  // Recherche web activable pour un seul appel complete (D14), quel que soit le réglage.
  searchesOnDemand(config: Config): boolean;
  analyze(input: AnalyzeInput, config: Config, signal: AbortSignal): Promise<ProviderResult>;
  // Appel textuel : consolidation, cartographie, relecture, vérification à la demande.
  complete(request: CompletionRequest, config: Config, signal: AbortSignal, callbacks?: CompletionCallbacks): Promise<string>;
}
// ProviderResult = { raw: unknown; searchedUrls?: Set<string>; usage?: TokenUsage }
// CompletionRequest = { system; user; json?; maxTokens?; webSearch? }
// CompletionCallbacks = { onText?; onUsage?; onRetry?; onSource? } : onSource reçoit chaque URL renvoyée par la recherche
```

L'orchestration (`src/analyze.ts`) enchaîne les passes suivantes. Celles marquées « approfondi » ne sont faites qu'avec le réglage « Analyse : approfondie » (D10) ; une passe secondaire en échec est ignorée, sans faire échouer l'analyse.

| Passe | Quand | Appel |
|---|---|---|
| Cartographie (B1) | approfondi, article découpé | `complete` sur l'article entier, ou son début et sa fin s'il dépasse le budget (100 000 tokens pour Anthropic et Gemini, la taille de morceau sinon) : thèse, arguments, positions attribuées, engagements. Le plan est joint à chaque morceau |
| Analyse | toujours | `analyze` par morceau, deux à la fois, puis `validateAnalysis`, `enforceSourcePolicy` et fusion |
| Consolidation (B2) | article découpé | `complete` en JSON : `summary`, `clickbait_gap` et `blind_spot` jugés sur l'ensemble à partir des constats de chaque morceau ; repli sur la fusion |
| Relecture (Q2) | approfondi, au moins une annotation | `complete` en JSON : chaque annotation avec la définition de son étiquette et le paragraphe qui contient sa citation (ou la mention d'une annotation d'ensemble) ; les annotations écartées sont retirées |
| Vérification (C2, D14) | à la demande, après l'analyse | `complete` avec `webSearch` sur une allégation : citation, paragraphe, titre et métadonnées de publication ([verify.ts](../../src/verify.ts)). Réponse `{status, context, sources}` soumise à D3 avec les URL reçues par `onSource`. Anthropic : outil `web_search`, reprise de `pause_turn` ; Gemini : `googleSearch`, sans mode JSON ; compatible OpenAI : `citations`. Pas avec Chrome Built-in AI |

| Adaptateur | Sortie structurée | Recherche web (D3) |
|---|---|---|
| Compatible OpenAI (OpenAI, Mistral, OpenRouter, Ollama…) | `response_format: json_schema` (strict) via SSE | Support des citations (`chunk.citations` pour Perplexity, OpenRouter...) avec `webSearch` activé. Si absent ou sans recherche : mode `unverified`. Clé facultative pour Ollama local |
| Anthropic (SDK officiel, `dangerouslyAllowBrowser`) | Outil strict `submit_analysis` dont l'`input_schema` est le schéma d'analyse, avec `tool_choice: auto`. Streaming via `streamEvent` | Outil serveur `web_search_20260209`. Les URL des blocs `web_search_tool_result` sont capturées dès `content_block_start` pour être disponibles pendant le flux. `pause_turn` est repris automatiquement |
| Google Gemini | `responseJsonSchema` via `streamGenerateContent?alt=sse` | Outil `googleSearch` (Grounding Google Search). Les URLs des `groundingChunks` sont extraites dans le flux SSE et validées via la politique D3. Clé API gratuite disponible via Google AI Studio |
| Chrome Built-in AI (Gemini Nano) | `session.promptStreaming` (Prompt API locale) | Exécution 100% locale sur la machine (Chrome 128+). Zéro clé API, zéro compte, aucune permission réseau externe requise. Mode `unverified` (D3) |

Modèle Anthropic par défaut : `claude-opus-5-5`, avec `effort: high` et `fallbacks: "default"` (reprise côté serveur après un refus) sur les modèles qui l'acceptent.

Quand `supportsWebSearch` est faux, le client force `fact_check.status = "unverified"` et `sources = []`, quoi que le modèle ait renvoyé.

- **Streaming et affichage progressif.** Les adaptateurs fonctionnent en streaming (SSE pour OpenAI et Gemini via `parseSseJson`, `streamEvent` pour Anthropic, `promptStreaming` pour Chrome AI). Le panneau affiche les cartes d'annotations et le résumé au fur et à mesure sans attendre la fin du flux complet grâce à `ProgressiveJsonParser` (`src/streaming-json.ts`).
- **Internationalisation (`src/i18n.ts`).** L'interface et les messages d'erreurs (extraction et providers) sont traduits dans les 5 langues supportées (fr, en, es, de, it).
- **Langue (D5).** Le prompt impose la langue de l'interface pour `summary`, `rhetoric_critique` et `context`, mais `exact_quote` reste recopié tel quel depuis l'article.
- **Labels (D4).** `label` est une énumération fermée de 31 labels traduits par catégorie, plus `"autre"`.
- **Longueur (D6).** Au-delà d'une limite configurable (8 000 tokens par défaut, soit ~6 000 mots), le texte est découpé en morceaux sur des frontières de paragraphes. Les morceaux sont analysés en parallèle, deux à la fois (`mapSettled`), puis fusionnés : ids renumérotés et doublons retirés (`dedupeAnnotations` : citation identique, ou citations de même catégorie dont l'une contient l'autre ou qui se recouvrent sur au moins 60 % de la plus courte ; la plus sévère est gardée). Les éléments globaux sont ensuite consolidés (passe B2 ci-dessus), avec affichage progressif du résumé ; en cas d'échec, le résumé est la concaténation des résumés partiels, le décalage titre / contenu le premier non vide et les angles morts leur réunion.
- **Échecs partiels (A3).** L'échec d'un morceau n'interrompt pas les autres. Si au moins un morceau a abouti, l'analyse est publiée comme partielle (`RunSnapshot.skipped` : début des passages non analysés) et n'est pas mise en cache, pour être retentée. En cas d'erreur ou d'annulation, les annotations déjà reçues restent affichées et surlignées.
- **Nouvelles tentatives (A4).** `postJson` retente les statuts 429, 500, 502, 503 et 529 : 3 essais au plus, délai de 2 s puis 4 s, ou celui de `Retry-After` (au-delà de 60 s, quota épuisé : pas de nouvel essai). L'attente est interrompue par l'annulation et signalée dans le message d'avancement (`RunSnapshot.retrying`). Le SDK Anthropic applique sa propre politique, réglée sur le même nombre d'essais (`maxRetries`).
- **Filtres de catégories.** Des filtres interactifs par catégorie avec compteurs en temps réel permettent d'isoler rapidement les sophismes, biais ou allégations.
- **Banc d'essai CLI (`scripts/test-live-provider.mjs`).** Exécutable via `npm run test:live`, ce banc d'essai permet de vérifier les requêtes en streaming, le découpage et les sources sur les API réelles sans lancer le navigateur.

## 8. Stockage

- `storage.local` pour la configuration et la clé API. Ne pas utiliser `storage.sync`, qui ferait remonter la clé dans le compte du navigateur.

### Cache des analyses (D7)

- **Clé** : URL normalisée (sans fragment ni paramètres de suivi `utm_*`, `fbclid`…).
- **Valeur** : `{ analysis, textHash, provider, model, lang, engineVersion, webSearch, maxChunkTokens, createdAt, title, meta }`. Le titre et les métadonnées de publication servent à ancrer les annotations d'ensemble (D12) et à contextualiser une vérification à la demande (D14) après un réaffichage depuis le cache.
- **Vérification à la demande (D14)** : son résultat remplace le `fact_check` de l'annotation dans l'entrée (`updateCachedFactCheck`), y compris dans les annotations alignées d'une vidéo, sans changer l'empreinte.
- **Empreinte** : le `textHash` (SHA-256 du texte extrait) et les réglages du moteur (`analysisSettings`, [engine-settings.ts](../../src/engine-settings.ts)) : provider, modèle, langue, version du moteur (`ENGINE_VERSION`, incrémentée à chaque modification du prompt, du schéma, de la taxonomie ou des passes d'analyse), recherche web effectivement utilisée et taille des morceaux. Les entrées antérieures à ces champs ne sont jamais conformes.
- **Analyse lancée** : l'entrée n'est réutilisée que si l'empreinte est identique (`getCached`). Sinon, l'analyse est relancée.
- **Réaffichage à l'ouverture du panneau (D11)** : `loadCachedRun` affiche l'entrée de l'URL sans ré-extraire la page (`getCachedByUrl`). Si ses réglages diffèrent des réglages courants, l'analyse est marquée « peut-être obsolète » (`RunSnapshot.stale`) et le panneau invite à la ré-analyser. Le texte n'est pas revérifié à ce stade : une modification de l'article n'est détectée qu'à l'analyse suivante.
- **Volume** : `storage.local` est limité à 10 Mo sans la permission `unlimitedStorage`. Garder un index LRU, borner le nombre d'entrées (par exemple 200) et purger les plus anciennes.
- **Interface** : indiquer « analyse du <date> (cache) » et proposer un bouton « Ré-analyser ». La page d'options permet de vider le cache.

### Annotations contestées (D15)

- **Clé** `contested` : liste d'au plus 200 entrées `{ key, url, pageTitle, contestedAt, reportedAt?, annotation, engine }` ([contested.ts](../../src/contested.ts)). `key` identifie l'annotation par page (sans fragment), étiquette et citation ; `engine` reprend les réglages qui ont produit l'analyse.
- **Écriture** par le script de fond (`contestRunAnnotation`), **lecture** par le panneau, les content scripts et les options, qui suivent `storage.onChanged`.
- **Signalement** : la page d'options construit l'URL `https://github.com/oliiivier/rhetorix/issues/new?title=…&body=…` (`issueUrl`, corps raccourci pour rester sous 7 500 caractères) et l'ouvre dans un onglet. Aucune requête n'est envoyée par l'extension.

## 9. Compatibilité Chromium et Firefox (D8, D9)

Le même code source produit deux paquets (`npm run build`). Le paquet Firefox sert aussi à Firefox pour Android :

| | `dist/chrome` | `dist/firefox` (desktop) | `dist/firefox` (Android, D9) |
|---|---|---|---|
| Version minimale | Chromium 128 (`caretPositionFromPoint`) | Firefox 142 (`data_collection_permissions` ; CSS Custom Highlight API dès 140) | Firefox 142 (`gecko_android`) |
| Panneau | `side_panel` + permission `sidePanel` | `sidebar_action` | Aucun : bulles au toucher et message bref dans la page |
| Clic sur l'icône | `sidePanel.setPanelBehavior` | `action.onClicked` → `sidebarAction.toggle()`, appelé sans `await` préalable : il exige le geste utilisateur | `action.onClicked` → demande de permission (sans `await` préalable, d'où la configuration gardée en mémoire), puis analyse immédiate avec `displayMode: "inline"` imposé |
| Script de fond | `background.service_worker` | `background.scripts` (Firefox n'accepte pas de service worker d'extension) | idem desktop |
| Spécifique | — | `browser_specific_settings.gecko` : identifiant, version minimale, `data_collection_permissions` | `browser_specific_settings.gecko_android` |

Le mode est détecté à l'exécution dans `background.ts` : `sidePanel` présent → Chromium ; sinon `sidebarAction` présent → Firefox desktop ; sinon → mobile.

Règles pour le code :

- **Passer par `ext`** (`src/ext.ts`), qui vaut `browser` sous Firefox et `chrome` ailleurs. Seules les API communes aux deux navigateurs sont utilisées. Une API propre à un navigateur doit être détectée à l'exécution (voir `background.ts`).
- **`permissions.request` doit être appelé avant tout `await`** dans le gestionnaire d'événement : Firefox perd sinon le geste utilisateur et refuse la demande.
- **`activeTab`** ne s'obtient qu'au clic sur l'icône. Sous Firefox, le panneau peut aussi être ouvert depuis le menu des barres latérales, sans ce clic : l'injection échoue alors, et le panneau demande à l'utilisateur de cliquer sur l'icône.
- **Pas de minification** : la revue d'addons.mozilla.org exige un code lisible ou les sources.
- **Lint Firefox** : `npm run lint:firefox` (`web-ext lint -s dist/firefox`). Deux avertissements `UNSAFE_VAR_ASSIGNMENT` sont attendus (voir ci-dessous).

### Avertissements `innerHTML` de Readability

`web-ext lint` signale deux affectations à `innerHTML` dans `content-script.js`. Elles proviennent de `@mozilla/readability`, embarqué par esbuild, et non du code de Rhetorix :

| Code de Readability | Rôle | Origine du HTML |
|---|---|---|
| `page.innerHTML = pageCacheHtml` | Restaure le HTML sauvegardé avant de relancer l'extraction avec des critères assouplis | HTML de la page, sauvegardé par Readability |
| `tmp.innerHTML = noscript.innerHTML` | Récupère les images à chargement différé placées dans des `<noscript>` | Contenu `<noscript>` de la page |

Ces affectations sont sans risque :

- Readability travaille sur une copie de la page (`document.cloneNode(true)`, `src/content-script.ts`) : ce document n'est pas affiché, ses scripts ne s'exécutent pas et la page visible n'est jamais modifiée ;
- le HTML réinjecté vient de la page elle-même ; aucune réponse du LLM ni donnée externe n'y passe ;
- le code de Rhetorix n'utilise pas `innerHTML` (voir CLAUDE.md, « Sécurité et Shadow DOM »).

Readability n'est pas modifié, pour pouvoir le mettre à jour simplement. Lors d'une soumission sur addons.mozilla.org, joindre aux notes destinées aux relecteurs :

> The two `UNSAFE_VAR_ASSIGNMENT` (innerHTML) warnings in `content-script.js` come from the bundled, unmodified `@mozilla/readability` library (the engine of Firefox Reader View). Readability runs on a detached clone of the page (`document.cloneNode(true)`), so no script executes and the live page is never modified; the HTML it re-assigns is the page's own markup, never LLM output or remote data. The extension's own code never uses innerHTML: all LLM and page content is inserted with `textContent` and DOM nodes.
