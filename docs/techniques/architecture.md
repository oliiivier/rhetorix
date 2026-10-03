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
┌─────────────── sidepanel.html / .js ──────────────┐
│ Déclenchement, cartes d'annotations, filtres,     │
│ affichage progressif (streaming), synchronisation │
└───────────────────────┬───────────────────────────┘
                        │
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
                                          (service worker : ouverture du panneau sur clic de l'icône)
```

Le PRD ne mentionne pas de script de fond. Il en faut un, minimal (`src/background.ts`), pour ouvrir le panneau au clic sur l'icône : `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` sous Chromium, `sidebarAction.toggle()` sous Firefox (voir §9).

## 2. Manifest

Le manifest est généré par `build.mjs` pour chaque cible (§9). Permissions communes : `activeTab`, `scripting`, `storage`, plus `sidePanel` sous Chromium.

Points à noter :

- **`host_permissions` vers l'endpoint LLM.** Une page d'extension ne contourne CORS que pour les hôtes déclarés. Comme l'endpoint est configurable, utiliser `optional_host_permissions` et demander la permission depuis la page d'options (`permissions.request`) au moment de l'enregistrement.
- **Script de fond** : `service_worker` sous Chromium, `scripts` sous Firefox (voir §9).
- **Aucun code distant.** Readability.js doit être embarqué dans le paquet.

## 3. Flux d'analyse

1. Clic sur l'icône : le panneau s'ouvre et `activeTab` est accordé pour l'onglet courant.
2. « Analyser la page » : le panneau injecte le content script (`chrome.scripting.executeScript`), puis lui envoie `{type: "extract"}` (`chrome.tabs.sendMessage`).
3. Le content script exécute `new Readability(document.cloneNode(true)).parse()` et renvoie `{ok: true, article: {title, paragraphs, lang}}`.
4. Le panneau appelle le LLM en streaming via `ProgressiveJsonParser` (`src/streaming-json.ts`). Le résumé est affiché et mis à jour progressivement. Chaque annotation est extraite dès complétion de ses accolades, validée unitairement (`validateAnnotation`), assainie selon la politique D3 (`enforceAnnotationSourcePolicy`) et affichée immédiatement sous forme de carte dans le panneau, avec incrémentation en temps réel des compteurs de filtres et préfixage des identifiants en cas de découpage.
5. Une fois l'analyse terminée, le panneau envoie `{type: "highlight", annotations: [{id, exact_quote, category}]}` au content script.
6. Le content script localise chaque citation (§4), crée les `Range`, alimente les highlights et répond avec la liste des ids **non localisés**. Le panneau les affiche en mode dégradé (carte sans lien vers la page).

## 4. Localisation des citations

Readability travaille sur un clone et produit du texte normalisé. Les citations doivent donc être recherchées dans le **DOM vivant** :

- construire un index texte de la page par `TreeWalker` sur les nœuds `Text` visibles, avec une table de correspondance offset → (nœud, offset local) ;
- normaliser des deux côtés : espaces multiples, espaces insécables, guillemets et apostrophes typographiques, tirets ;
- une citation peut couvrir plusieurs nœuds (`<em>`, liens) : le `Range` part du nœud de début et s'arrête au nœud de fin ;
- si la correspondance exacte échoue, prévoir un repli (recherche approximative, ou correspondance sur le début et la fin de la citation), sinon marquer l'annotation comme non localisée.

## 5. Surlignage et interaction

**Un `Highlight` par style.** Un nom de highlight correspond à une seule règle `::highlight()`. Le nom unique `rhetorix-highlight` du PRD ne permet pas de distinguer les couleurs par catégorie. Il faut prévoir `rhetorix-sophism`, `rhetorix-bias`, `rhetorix-factual`, ainsi qu'un `rhetorix-active` pour la citation sélectionnée.

**Les highlights ne reçoivent pas d'événements.** Ils ne créent pas d'éléments DOM, donc un clic ou un survol sur une citation surlignée ne peut pas être capté directement. Il faut :

1. écouter `click` sur `document` (phase de capture) pour activer la carte dans le panneau latéral ;
2. écouter `pointermove` sur `document` (throttlé via `requestAnimationFrame`) pour détecter le survol des zones surlignées (`caretAt` / `isPointInRange`) ;
3. dans l'autre sens, un clic sur une carte envoie `{type: "focus", id}` : le content script appelle `scrollIntoView` sur l'élément parent du `Range` et active le highlight.

**Modes d'affichage : panneau latéral, bulles en ligne (inline) ou combiné.**
L'utilisateur peut choisir son mode d'affichage (`displayMode: "sidepanel" | "inline" | "both"`) dans les options ou via un sélecteur direct dans la barre d'outils du panneau :
- **Mode panneau latéral (`sidepanel`)** : les cartes d'annotations s'affichent uniquement dans le panneau latéral ;
- **Mode bulles en ligne (`inline`)** : au survol d'un passage surligné, une bulle flottante colorée apparaît à proximité immédiate de la citation dans la page ;
- **Mode combiné (`both`, par défaut)** : le panneau latéral et les bulles au survol sont tous les deux actifs simultanément.

**Isolation des bulles flottantes en Shadow DOM.**
Afin d'éviter tout conflit de styles avec la page hôte (ex. Wikipedia, Le Monde, NYTimes), la bulle est encapsulée dans un hôte `<div id="rhetorix-popover-host">` rattaché avec un Shadow Root ouvert (`attachShadow({ mode: "open" })`).
- Le style CSS est strictement isolé ;
- Le positionnement est calculé dynamiquement (`position: fixed`) au-dessus ou en-dessous du `Range`, sans débordement de l'écran ;
- La bordure gauche et le badge reprennent la couleur de la catégorie (rouge sophisme, orange biais, bleu allégation) ;
- La bulle reste accessible au survol (permettant la sélection de texte ou le clic sur les liens de sources factuelles) ;
- Sécurité stricte : zéro `innerHTML`, manipulation exclusive via l'API DOM (`createElement`, `textContent`, `setAttribute`).

## 6. Messages

| Type | Émetteur → destinataire | Charge utile |
|---|---|---|
| `extract` | panneau → content | — |
| `extract:result` | content → panneau (réponse) | `{ok: true, article: {title, paragraphs, lang}}` ou `{ok: false, error, errorCode}` |
| `highlight` | panneau → content | `{annotations: HighlightItem[], displayMode?: DisplayMode, lang?: string}` |
| `set-display-mode` | panneau → content | `{displayMode: DisplayMode}` |
| `highlight:result` | content → panneau (réponse) | `{unlocated: string[]}` |
| `focus` | panneau → content | `{id}` |
| `annotation-clicked` | content → panneau | `{id}` |
| `clear` | panneau → content | — |

Le panneau est partagé entre les onglets. Il associe ses résultats à un `tabId` et réagit à `chrome.tabs.onActivated` et `chrome.tabs.onUpdated` en restaurant l'état sauvegardé ou en réinitialisant la vue.

## 7. Appel LLM

Trois adaptateurs (décision D2) implémentent la même interface :

```ts
interface LlmProvider {
  supportsWebSearch(config: Config): boolean;
  analyze(input: AnalyzeInput, config: Config, signal: AbortSignal): Promise<ProviderResult>;
  consolidateSummary?(
    title: string,
    summaries: string[],
    language: string,
    config: Config,
    signal: AbortSignal,
    onProgressText?: (text: string) => void,
  ): Promise<string>;
}
// ProviderResult = { raw: unknown; searchedUrls?: Set<string> }
```

L'orchestration (`src/analyze.ts`) enchaîne : découpage, streaming des morceaux, `validateAnalysis`, `enforceSourcePolicy`, consolidation éventuelle et fusion.

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
- **Longueur (D6).** Au-delà d'une limite configurable (8 000 tokens par défaut, soit ~6 000 mots), le texte est découpé en morceaux sur des frontières de paragraphes. Les morceaux sont analysés en parallèle, deux à la fois, puis fusionnés : ids renumérotés et citations en double retirées. Le `summary` est consolidé par un appel dédié `consolidateSummary` (avec streaming textuel), ou repli gracieux sur la concaténation en cas d'erreur.
- **Filtres de catégories.** Des filtres interactifs par catégorie avec compteurs en temps réel permettent d'isoler rapidement les sophismes, biais ou allégations.
- **Banc d'essai CLI (`scripts/test-live-provider.mjs`).** Exécutable via `npm run test:live`, ce banc d'essai permet de vérifier les requêtes en streaming, le découpage et les sources sur les API réelles sans lancer le navigateur.

## 8. Stockage

- `storage.local` pour la configuration et la clé API. Ne pas utiliser `storage.sync`, qui ferait remonter la clé dans le compte du navigateur.

### Cache des analyses (D7)

- **Clé** : URL normalisée (sans fragment ni paramètres de suivi `utm_*`, `fbclid`…).
- **Valeur** : `{ analysis, textHash, provider, model, lang, createdAt }`.
- **Validité** : l'entrée n'est utilisée que si le `textHash` (SHA-256 du texte extrait) est identique. Si l'article a changé, on relance l'analyse. Changer de provider, de modèle ou de langue invalide aussi l'entrée.
- **Volume** : `storage.local` est limité à 10 Mo sans la permission `unlimitedStorage`. Garder un index LRU, borner le nombre d'entrées (par exemple 200) et purger les plus anciennes.
- **Interface** : indiquer « analyse du <date> (cache) » et proposer un bouton « Ré-analyser ». La page d'options permet de vider le cache.

## 9. Compatibilité Chromium et Firefox (D8)

Le même code source produit deux paquets (`npm run build`) :

| | `dist/chrome` | `dist/firefox` |
|---|---|---|
| Version minimale | Chromium 128 (`caretPositionFromPoint`) | Firefox 142 (`data_collection_permissions` ; CSS Custom Highlight API dès 140) |
| Panneau | `side_panel` + permission `sidePanel` | `sidebar_action` |
| Ouverture au clic sur l'icône | `sidePanel.setPanelBehavior` | `action.onClicked` → `sidebarAction.toggle()`, appelé sans `await` préalable : il exige le geste utilisateur |
| Script de fond | `background.service_worker` | `background.scripts` (Firefox n'accepte pas de service worker d'extension) |
| Spécifique | — | `browser_specific_settings.gecko` : identifiant, version minimale, `data_collection_permissions` |

Règles pour le code :

- **Passer par `ext`** (`src/ext.ts`), qui vaut `browser` sous Firefox et `chrome` ailleurs. Seules les API communes aux deux navigateurs sont utilisées. Une API propre à un navigateur doit être détectée à l'exécution (voir `background.ts`).
- **`permissions.request` doit être appelé avant tout `await`** dans le gestionnaire d'événement : Firefox perd sinon le geste utilisateur et refuse la demande.
- **`activeTab`** ne s'obtient qu'au clic sur l'icône. Sous Firefox, le panneau peut aussi être ouvert depuis le menu des barres latérales, sans ce clic : l'injection échoue alors, et le panneau demande à l'utilisateur de cliquer sur l'icône.
- **Pas de minification** : la revue d'addons.mozilla.org exige un code lisible ou les sources.
- **Lint Firefox** : `npx web-ext lint -s dist/firefox`. Les deux avertissements `innerHTML` restants viennent de Readability, qui travaille sur une copie de la page.
