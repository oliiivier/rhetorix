# Architecture technique — Rhetorix

Ce document traduit le [PRD](../fonctionnelles/specification.md) en architecture MV3 et recense les contraintes de la plateforme qui conditionnent l'implémentation. Les choix non encore tranchés sont listés dans [points-ouverts.md](../fonctionnelles/points-ouverts.md).

## 1. Composants

```
┌──────────────── Onglet (page de l'article) ────────────────┐     ┌──────── Panneau latéral ────────┐
│ content-script.js                                          │     │ sidepanel.html / sidepanel.js    │
│  - extraction : Readability sur un clone du document       │◄───►│  - état : idle / loading /       │
│  - localisation des exact_quote → Range DOM                │ msg │    streaming / done / error      │
│  - CSS.highlights (un Highlight par catégorie)             │     │  - appel LLM (fetch + streaming) │
│  - hit-test des clics → id d'annotation                    │     │  - validation du JSON            │
└────────────────────────────────────────────────────────────┘     │  - rendu des cartes              │
                                                                   └──────────────┬───────────────────┘
┌──────── options.html / options.js ────────┐                                     │ lit
│ provider, endpoint, modèle, clé API       │──── chrome.storage.local ───────────┘
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
3. Le content script exécute `new Readability(document.cloneNode(true)).parse()` et renvoie `{title, textContent, lang}`.
4. Le panneau appelle le LLM en streaming. Le flux sert au retour visuel (progression, `summary` dès qu'il est complet). Les annotations ne sont exploitées qu'une fois le JSON complet **et validé** contre le schéma.
5. Le panneau envoie `{type: "highlight", annotations: [{id, exact_quote, category}]}` au content script.
6. Le content script localise chaque citation (§4), crée les `Range`, alimente les highlights et répond avec la liste des ids **non localisés**. Le panneau les affiche en mode dégradé (carte sans lien vers la page).

## 4. Localisation des citations

Readability travaille sur un clone et produit du texte normalisé. Les citations doivent donc être recherchées dans le **DOM vivant** :

- construire un index texte de la page par `TreeWalker` sur les nœuds `Text` visibles, avec une table de correspondance offset → (nœud, offset local) ;
- normaliser des deux côtés : espaces multiples, espaces insécables, guillemets et apostrophes typographiques, tirets ;
- une citation peut couvrir plusieurs nœuds (`<em>`, liens) : le `Range` part du nœud de début et s'arrête au nœud de fin ;
- si la correspondance exacte échoue, prévoir un repli (recherche approximative, ou correspondance sur le début et la fin de la citation), sinon marquer l'annotation comme non localisée.

## 5. Surlignage et interaction

**Un `Highlight` par style.** Un nom de highlight correspond à une seule règle `::highlight()`. Le nom unique `rhetorix-highlight` du PRD ne permet pas de distinguer les couleurs par catégorie. Il faut prévoir `rhetorix-sophism`, `rhetorix-bias`, `rhetorix-factual`, ainsi qu'un `rhetorix-active` pour la citation sélectionnée.

**Les highlights ne reçoivent pas d'événements.** Ils ne créent pas d'éléments DOM, donc un clic sur une citation surlignée ne peut pas être capté directement. Il faut :

1. écouter `click` sur `document` (phase de capture) ;
2. obtenir la position du caret au point cliqué (`document.caretPositionFromPoint`, ou `caretRangeFromPoint` en repli) ;
3. tester l'appartenance de ce point aux `Range` connus (`range.comparePoint` / `isPointInRange`) ;
4. envoyer `{type: "annotation-clicked", id}` au panneau.

Dans l'autre sens, un clic sur une carte envoie `{type: "focus", id}` : le content script appelle `scrollIntoView` sur l'élément parent du `Range` (ou utilise `range.getBoundingClientRect()` avec `window.scrollTo`), puis place le `Range` dans `rhetorix-active`.

La CSS des highlights est injectée par le content script. `::highlight()` n'accepte qu'un sous-ensemble de propriétés : couleur, fond et décoration de texte.

## 6. Messages

| Type | Émetteur → destinataire | Charge utile |
|---|---|---|
| `extract` | panneau → content | — |
| `extract:result` | content → panneau (réponse) | `{title, textContent, lang}` ou `{error}` |
| `highlight` | panneau → content | `{annotations: [{id, exact_quote, category}]}` |
| `highlight:result` | content → panneau (réponse) | `{unlocated: string[]}` |
| `focus` | panneau → content | `{id}` |
| `annotation-clicked` | content → panneau | `{id}` |
| `clear` | panneau → content | — |

Le panneau est partagé entre les onglets. Il doit associer ses résultats à un `tabId` et réagir à `chrome.tabs.onActivated` et `chrome.tabs.onUpdated`, par exemple en réinitialisant l'état ou en conservant un cache par onglet.

## 7. Appel LLM

Trois adaptateurs (décision D2) implémentent la même interface :

```ts
interface LlmProvider {
  supportsWebSearch(config: Config): boolean;
  analyze(input: AnalyzeInput, config: Config, signal: AbortSignal): Promise<ProviderResult>;
}
// ProviderResult = { raw: unknown; searchedUrls?: Set<string> }
```

L'orchestration (`src/analyze.ts`) enchaîne : découpage, appel par morceau, `validateAnalysis`, `enforceSourcePolicy`, puis fusion.

| Adaptateur | Sortie structurée | Recherche web (D3) |
|---|---|---|
| Compatible OpenAI (OpenAI, Mistral, OpenRouter, Ollama…) | `response_format: json_schema` (strict) | En général absente : mode `unverified` |
| Anthropic (SDK officiel, `dangerouslyAllowBrowser`) | Outil strict `submit_analysis` dont l'`input_schema` est le schéma d'analyse, avec `tool_choice: auto` et une consigne dans le prompt, car les modèles récents refusent le choix forcé d'un outil | Outil serveur `web_search_20260209`. Les URL des blocs `web_search_tool_result` forment la liste blanche des sources. `pause_turn` est repris automatiquement |
| Google Gemini | `responseJsonSchema` | Pas encore branchée : mode `unverified`. Le grounding Google Search reste à intégrer (combinaison avec le schéma, rattachement des sources aux annotations) |

Modèle Anthropic par défaut : `claude-opus-5-5`, avec `effort: high` et `fallbacks: "default"` (reprise côté serveur après un refus) sur les modèles qui l'acceptent.

Quand `supportsWebSearch` est faux, le client force `fact_check.status = "unverified"` et `sources = []`, quoi que le modèle ait renvoyé.

- **Langue (D5).** Le prompt impose la langue de l'interface pour `summary`, `rhetoric_critique` et `context`, mais `exact_quote` reste recopié tel quel depuis l'article.
- **Labels (D4).** `label` est une énumération fermée par catégorie, plus `"autre"`.
- **Sortie structurée.** Utiliser le mécanisme natif du provider quand il existe (JSON schema / tool use), et valider côté client dans tous les cas, car `exact_quote` et les énumérations doivent être vérifiés.
- **Streaming.** L'adaptateur Anthropic reçoit la réponse en flux (`messages.stream` puis `finalMessage`), ce qui évite les délais d'expiration sur les réponses longues. L'affichage progressif des cartes reste à faire.
- **Appel direct depuis le navigateur.** Le SDK Anthropic l'autorise avec `dangerouslyAllowBrowser: true`. La recherche web doit en outre être activée pour l'organisation dans la console Anthropic.
- **Longueur (D6).** Au-delà d'une limite configurable (12 000 tokens par défaut), le texte est découpé en morceaux sur des frontières de paragraphes. Les morceaux sont analysés en parallèle, deux à la fois, puis fusionnés : ids renumérotés et citations en double retirées. Le `summary` est pour l'instant la concaténation des résumés partiels.

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
| Version minimale | Chromium 128 (`caretPositionFromPoint`) | Firefox 140 (CSS Custom Highlight API) |
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
