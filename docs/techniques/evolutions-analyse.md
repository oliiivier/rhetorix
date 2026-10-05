# Évolutions du moteur d'analyse

État des lieux du moteur d'analyse (extraction, découpage, appels LLM, fusion, cache) au 2026-10-04, et pistes d'amélioration. Ce document sert de base de réflexion. Les orientations retenues le 2026-10-05 (D10 à D15) sont consignées dans [points-ouverts.md](../fonctionnelles/points-ouverts.md) et rappelées en §4, l'état de mise en œuvre en §5.

Rappel du flux actuel (voir [architecture](architecture.md) §3 et §7) : `runner.ts` extrait l'article par Readability, `analyze.ts` le découpe par paragraphes (`chunkParagraphs`, 8 000 tokens par défaut), analyse les morceaux avec 2 appels simultanés, valide chaque réponse, applique la politique des sources (D3), fusionne (`mergeAnalyses`) puis consolide le résumé par un appel dédié.

## 1. Constats

### 1.1 Le découpage fait perdre la vue d'ensemble (D6)

- **Chaque morceau est analysé isolément.** `userPrompt` ([prompt.ts](../../src/prompt.ts)) ne transmet que le titre, l'extrait et sa position (« part 2 of 4 »). Le modèle ignore la thèse de l'article et ce qui précède ou suit. Les procédés qui s'étendent sur plusieurs sections lui échappent : homme de paille posé dans une section et réfuté dans une autre, conclusion sans lien avec des prémisses énoncées plus haut, contradiction interne.
- **Les éléments globaux sont jugés localement.** `clickbait_gap` compare le titre au contenu : chaque morceau en produit un, et `mergeAnalyses` ([chunking.ts](../../src/chunking.ts)) retient le premier non vide. `blind_spot` est jugé morceau par morceau puis concaténé ; un angle mort traité dans un autre morceau est signalé à tort. Seul `summary` est consolidé.
- **Le dédoublonnage est littéral.** Deux annotations ne sont fusionnées que si `exact_quote` est identique, à la casse près. Les citations qui se chevauchent, ou une même allégation reprise dans deux morceaux, apparaissent deux fois.
- **L'ancrage par citation borne ce qui peut être signalé.** `exact_quote` est limité à environ 300 caractères et doit désigner un passage précis. Un défaut qui porte sur la structure de l'argumentation n'a pas d'ancrage naturel et n'est pas signalé, ou l'est par une citation arbitraire.

### 1.2 Robustesse

- **Un échec partiel annule toute l'analyse.** `mapLimit` attend tous les morceaux avec `Promise.all` : une erreur sur un seul fait échouer l'ensemble. Dans `runAnalysis` ([runner.ts](../../src/runner.ts)), le bloc `catch` vide alors `snapshot.annotations`, y compris celles déjà affichées en streaming. Une annulation a le même effet.
- **Aucune nouvelle tentative.** `postJson` ([http.ts](../../src/providers/http.ts)) transforme tout statut non 2xx en erreur définitive. Les 429 (quota gratuit Gemini, deux appels simultanés) et les 5xx passagers interrompent l'analyse.
- **Le dimensionnement est approximatif.** `estimateTokens` compte 4 caractères par token, ce qui sous-estime les langues à mots longs et le texte riche en chiffres. La concurrence est fixée à 2 quel que soit le provider. La fenêtre de contexte de Gemini Nano (`chrome-ai`) n'a pas été comparée aux 8 000 tokens par défaut.

### 1.3 Vérification factuelle (D3)

- **Détection et vérification partagent le même appel.** Le modèle doit à la fois repérer les procédés rhétoriques et lancer ses recherches, avec un budget limité (`max_uses: 8` par morceau chez Anthropic). Rien ne hiérarchise les allégations : sur un article dense en chiffres, une partie reste `unverified` sans que l'utilisateur sache si c'est faute de budget ou faute de résultat.
- **Le modèle ignore le contexte de publication.** L'extraction ([content-script.ts](../../src/content-script.ts), `extract`) ne transmet que le titre, la langue et les paragraphes. Sans date de publication, une affirmation exacte au moment où elle a été écrite peut être jugée à l'aune des faits actuels. L'auteur et le site, que Readability fournit (`byline`, `siteName`, `publishedTime`), ne sont pas non plus transmis.

### 1.4 Cache (D7)

- **L'empreinte est incomplète.** `matchesFingerprint` ([cache.ts](../../src/cache.ts)) compare le texte, le provider, le modèle et la langue. Une modification du prompt, de la taxonomie, de l'activation de la recherche web ou de la taille des morceaux n'invalide pas l'entrée : l'ancienne analyse continue d'être servie.
- **L'empreinte est ignorée au rechargement.** `loadCachedRun` passe par `getCachedByUrl`, qui renvoie l'entrée de l'URL sans vérifier l'empreinte. Après une modification de l'article ou un changement de modèle ou de langue, l'ancienne analyse est réaffichée, ce qui contredit l'architecture §8 (« l'entrée n'est utilisée que si le `textHash` est identique »).

### 1.5 Qualité et calibrage

- **Aucune mesure de pertinence.** Les tests unitaires couvrent la mécanique (validation, fusion, localisation), pas la justesse des annotations. Il n'existe pas de corpus de référence permettant de mesurer la précision, le rappel, la stabilité d'une exécution à l'autre ou l'équité selon l'orientation politique de l'article.
- **Une seule passe, sans relecture.** Toute annotation produite et conforme au schéma est affichée. Les faux positifs sont le principal risque pour la crédibilité de l'outil (voir « Neutralité » dans les risques produit).
- **La sévérité n'a pas de critères.** Le prompt la définit comme « le degré de distorsion pour le lecteur », sans grille. Aucune annotation ne porte de niveau de confiance, et l'utilisateur ne peut pas signaler une annotation erronée.

### 1.6 Extraction

- Readability est la seule méthode. Ses limites connues (paywalls, SPA, PDF) sont déjà documentées.
- Le chapeau et les intertitres sont traités comme des paragraphes ordinaires, alors qu'un intertitre trompeur est un cas de `clickbait_gap` local.

## 2. Pistes

Les pistes sont regroupées par lot, du plus simple au plus structurant. Pour chacune : ce qui change, et ce qu'elle impose côté contrat ou décisions.

### Lot A : correctifs sans changement de contrat

| Piste | Mise en œuvre | Impact |
|---|---|---|
| A1. Versionner l'empreinte du cache | Ajouter à `CacheFingerprint` un `engineVersion` (constante incrémentée à chaque modification du prompt, du schéma ou de la taxonomie), `webSearch` et `maxChunkTokens` | Invalide le cache existant une fois ; mettre à jour l'architecture §8 |
| A2. Signaler une analyse en cache peut-être obsolète (D11) | `loadCachedRun` affiche toujours l'entrée trouvée, sans ré-extraire. Il compare la partie configuration de l'empreinte (provider, modèle, langue, `engineVersion`, `webSearch`, `maxChunkTokens`) à la configuration courante ; si elle diffère, l'analyse est marquée « peut-être obsolète » avec le bouton « Ré-analyser ». Le texte n'est pas revérifié : une analyse lancée explicitement repasse par `getCached`, qui contrôle le `textHash` | Nouveau champ dans `RunSnapshot`, nouveaux textes d'interface (5 langues), mise à jour de l'architecture §8 |
| A3. Conserver les résultats partiels | Remplacer `Promise.all` par une collecte tolérante aux échecs ; publier les morceaux réussis avec un statut « analyse partielle » et la liste des passages non analysés. Ne plus vider `snapshot.annotations` en cas d'erreur ou d'annulation | Nouveau statut dans `RunSnapshot` et nouveaux textes d'interface dans `i18n.ts` (5 langues) |
| A4. Nouvelles tentatives | Dans `postJson`, retenter les 429, 500, 502, 503 et 529 avec un délai croissant (en respectant `Retry-After`), 3 essais au plus, interrompus par le `signal` | Allonge la durée d'une analyse ; le message d'avancement doit l'indiquer |
| A5. Dédoublonnage par chevauchement | Après localisation, fusionner les annotations de même catégorie dont les citations se recouvrent largement (garder la plus sévère) | Pur, testable dans `chunking.ts` ou `text-match.ts` |

### Lot B : contexte global pour l'analyse découpée (révision de D6)

Les appels supplémentaires de ce lot, du lot C et de la relecture Q2 ne sont faits qu'en mode « approfondi » (D10) ; le mode « rapide » conserve le comportement actuel.

- **B1. Passe préalable de cartographie.** Pour un article découpé, un premier appel court produit un plan : thèse, principaux arguments, positions citées. Ce plan est joint à chaque morceau, ce qui permet de repérer les procédés qui s'étendent sur plusieurs sections. Coût : un appel supplémentaire sur l'article entier, ou sur ses premiers et derniers paragraphes si l'article dépasse la fenêtre.
- **B2. Éléments globaux consolidés.** `clickbait_gap` et `blind_spot` sont retirés des appels par morceau et produits par l'appel de consolidation, qui reçoit le titre, le plan et les résumés partiels. Le schéma par morceau et le schéma de consolidation divergent alors : à reporter dans la spec §3.
- **B3. Annotations globales (D12).** Autoriser des annotations sans citation pour les défauts de structure, ancrées sur le titre de l'article. Sur desktop, elles occupent une section dédiée du panneau, distincte des annotations non localisées (échec de localisation). Sur mobile (D9), elles sont accessibles en touchant le titre surligné et rappelées dans le message bref de fin d'analyse ; si le titre n'est pas localisable dans la page, le message bref reste le seul accès. Modifie le contrat (spec §3, `schema.ts`, `prompt.ts`).

### Lot C : vérification factuelle séparée (révision de D3)

- **C1. Métadonnées de publication.** Transmettre `publishedTime`, `byline` et `siteName` dans le prompt, avec la consigne d'évaluer les allégations à la date de publication et de signaler ce qui a changé depuis. Ajout au type `Extracted` et au prompt.
- **C2. Vérification séparée, à la demande (D14).** Une allégation restée « non vérifiée » (recherche web désactivée, budget de recherche épuisé, résultat non concluant) peut être vérifiée en ligne depuis sa carte ou sa bulle : un appel `complete` avec la recherche web activée pour lui seul (`verify.ts`, `verifyPrompt`), soumis à la politique des sources. Le résultat remplace la vérification et complète le cache. L'utilisateur choisit ainsi les allégations qui valent un appel, sans budget fixé à l'avance ni motif supplémentaire dans le contrat.

### Lot Q : qualité mesurée

- **Q1. Corpus d'évaluation (D13).** Une vingtaine d'articles figés (texte et titre), variés en sujet, langue et orientation, dont quelques articles réputés bien argumentés, annotés à la main. Les textes libres (rédigés pour le corpus, domaine public, licences ouvertes) sont versionnés ; les textes non libres restent hors dépôt, dans un dossier local ignoré par git, et le dépôt n'en contient que l'URL, le titre et les annotations attendues (citations courtes). Le corpus initial est dans [eval/corpus](../../eval/corpus/README.md). Un script, sur le modèle de `scripts/test-live-provider.mjs`, lance le moteur et mesure : précision et rappel par catégorie (correspondance par chevauchement de citation), taux de citations localisées, stabilité sur plusieurs exécutions, nombre d'annotations sur les articles témoins. Non exécuté par `npm test`, car il appelle un vrai provider.
- **Q2. Passe de relecture.** Un appel reçoit les annotations et leur contexte, et écarte celles qui ne sont pas justifiées par le texte. Réservée au mode « approfondi » (D10) ; son effet est à mesurer avec Q1.
- **Q3. Grille de sévérité et confiance.** Le prompt définit ce que recouvrent `high`, `medium` et `low` pour la sévérité, et un champ `confidence` (même échelle) indique l'assurance du modèle que le procédé est présent et bien nommé (spec §3). Le panneau et les bulles l'affichent.
- **Q4. Signalement par l'utilisateur (D15).** Un bouton « Contester » sur chaque carte et chaque bulle replie l'annotation et l'enregistre localement (`contested.ts`). Les options listent les annotations contestées ; l'utilisateur peut ouvrir un ticket GitHub prérempli, après un avertissement et avec l'adresse de la page facultative, pour alimenter le corpus. Aucun envoi à un tiers sans son action.

## 3. Ordre proposé

1. Lot A : corrige des défauts visibles sans toucher au contrat. A1 et A2 en premier, car le cache masque les effets de toute autre évolution du moteur.
2. Q1 (corpus) avant les lots B et C, pour mesurer leur effet plutôt que de l'estimer.
3. B1 et B2, puis C1 : ils répondent aux limites les plus structurelles.
4. Le réglage « rapide / approfondi » (D10) avec le premier appel supplémentaire, puis Q2, B3, C2, Q3 et Q4.

## 4. Orientations retenues (2026-10-05)

| # | Question | Décision |
|---|---|---|
| D10 | Coût des appels supplémentaires (B1, Q2) | Réglage **« rapide / approfondi »** dans les options. Le mode rapide fait une passe par morceau ; le mode approfondi ajoute la cartographie et la relecture. Un **seul réglage** global, **« rapide » par défaut**, libellé « Analyse : rapide / approfondie » avec une aide qui annonce le surcoût (jusqu'à 2 appels supplémentaires, plus lent, plus fiable). Le défaut pourra passer à « approfondi » si le corpus (Q1) montre un gain net |
| D11 | Analyse en cache peut-être obsolète au rechargement (A2) | **Affichage immédiat avec avertissement** « peut-être obsolète » et bouton « Ré-analyser », sans ré-extraction |
| D12 | Annotations sans citation (B3) | **Acceptées, ancrées sur le titre** (de la vidéo pour YouTube) : section dédiée du panneau sur desktop ; bulle au survol ou au toucher du titre ; sur mobile, rappel dans le message bref |
| D13 | Emplacement du corpus d'évaluation (Q1) | **Stockage selon la licence** : textes libres versionnés, textes non libres hors dépôt ; les fiches (références, annotations attendues) sont toujours versionnées |
| D14 | Vérification factuelle séparée (C2) | **À la demande**, allégation par allégation, recherche web activée pour ce seul appel ; le résultat complète le cache |
| D15 | Signalement par l'utilisateur (Q4) | **Contestation locale**, puis ticket GitHub prérempli ouvert dans un onglet, après avertissement, adresse de la page facultative |

## 5. État de mise en œuvre (2026-10-05)

`ENGINE_VERSION` vaut 6 : les analyses en cache antérieures sont réaffichées avec l'avertissement « peut-être obsolète » (D11) et refaites à la demande.

| Piste | État | Écarts et remarques |
|---|---|---|
| A1 | Fait | L'empreinte comprend aussi la profondeur d'analyse (D10). La recherche web retenue est celle effectivement utilisée (réglage et provider) |
| A2 | Fait | `RunSnapshot.stale`, note du panneau. Une entrée antérieure à A1 est toujours signalée |
| A3 | Fait | `mapSettled` ; une analyse partielle n'est pas mise en cache. Après une erreur ou une annulation, les annotations reçues restent surlignées |
| A4 | Fait | Pour Anthropic, les nouvelles tentatives sont celles du SDK (`maxRetries`), qui ne les signale pas : le message d'avancement ne l'indique que pour Gemini et les endpoints compatibles OpenAI |
| A5 | Fait | Le dédoublonnage compare les citations normalisées au moment de la fusion, et non les plages localisées dans la page : il s'applique aussi sur mobile et sans content script |
| B1 | Fait | Le plan est rédigé en anglais (usage interne) et limité à 250 mots |
| B2 | Fait, autrement | Les champs `clickbait_gap` et `blind_spot` restent dans le schéma par morceau, que partagent les sorties structurées strictes des providers : ils servent d'indices à la consolidation, qui les confirme ou les écarte au vu de l'ensemble. La consolidation est faite dans les deux modes, car elle remplace l'appel de consolidation du résumé qui existait déjà |
| B3 | Fait | `exact_quote` vide, pour `sophism` et `bias` seulement. Les annotations d'ensemble sont dédoublonnées par étiquette et soumises à la relecture. Le titre est localisé par un `<h1>` qui lui correspond, sinon par sa première occurrence, sinon par le seul `<h1>` de la page. Sur YouTube, titre de la vidéo sous le lecteur. Le score du corpus les liste à part, hors précision |
| C1 | Fait | Date, auteur et site transmis avec la date de l'analyse. Rien pour YouTube, dont l'extraction ne fournit pas ces métadonnées |
| C2 | Fait, autrement | À la demande (D14) plutôt qu'en seconde passe budgétée : pas de modification du contrat d'analyse. Le provider déclare la capacité (`searchesOnDemand`) ; Anthropic utilise l'outil `web_search` dans `complete`, Gemini le grounding Google Search sans mode JSON, un endpoint compatible OpenAI ses citations |
| Q1 | Fait | `npm run corpus:eval`. Premières mesures en §6 ; les annotations attendues restent à relire |
| Q2 | Fait | Une relecture en échec garde toutes les annotations. Elle reçoit la définition de chaque étiquette ; effet mesuré en §6 |
| Q3 | Fait | Grille de sévérité et champ `confidence` ; la confiance n'est pas encore utilisée par la relecture ni par le score du corpus |
| Q4 | Fait | Liste bornée à 200 entrées. Les fiches du corpus ne sont pas alimentées automatiquement : le ticket sert de point d'entrée |

Non traités : le dimensionnement (§1.2 : estimation des tokens, concurrence par provider, fenêtre de Gemini Nano) et le traitement particulier des intertitres (§1.6).

Prochaine étape : relire les fiches du corpus signalées en §6, puis refaire les mesures avec la version 6 du moteur (annotations d'ensemble, confiance), sur 3 passes et sur un autre provider, avant de trancher le défaut de D10.

## 6. Mesures sur le corpus (2026-10-05)

Moteur en version 5, Gemini 3.8 Flash, recherche web activée, 13 articles (dont les 2 textes non libres), deux passes par mode : les écarts de quelques points restent dans le bruit. Instantané à remplacer à la prochaine mesure.

| Indicateur | Rapide | Approfondi |
|---|---|---|
| Rappel `sophism` | 88 % | 94 % |
| Rappel `bias` | 72 % | 78 % |
| Rappel `factual_claim` | 88 % | 88 % |
| Précision | 75 % | 79 % |
| Annotations rhétoriques sur les témoins | 0,3 | 0,3 |
| *J'accuse* (rappel) | 3/6 | 5/6 |
| Coût d'une passe complète | ~0,06 $ | ~0,08 $ |

Dans les deux modes, citations localisées, statuts factuels et éléments globaux sont à 100 %, et les articles symétriques sur le nucléaire reçoivent le même nombre d'annotations à une près. Les coûts sont estimés aux tarifs de Gemini Flash, hors tokens de raisonnement, que le provider ne compte pas.

Fiches à relire, car plusieurs « faux positifs » semblent tenir au corpus plutôt qu'au moteur :

- `pd-fr-zola-jaccuse` : « l'esprit le plus fumeux, le plus compliqué » et « quel coup de balai » sont des procédés défendables absents des attentes ;
- `cr-fr-reporterre-soignants-pesticides` : « permis de tuer » figure deux fois dans le texte, et l'attente ne couvre qu'une occurrence ;
- `cr-fr-contrepoints-secheresse` : la limite de 2 annotations rhétoriques est souvent dépassée de peu.
