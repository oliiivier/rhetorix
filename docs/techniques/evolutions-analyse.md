# Évolutions du moteur d'analyse

État des lieux du moteur d'analyse (extraction, découpage, appels LLM, fusion, cache) au 2026-10-04, et pistes d'amélioration. Ce document sert de base de réflexion. Les orientations retenues le 2026-10-05 (D10 à D13) sont consignées dans [points-ouverts.md](../fonctionnelles/points-ouverts.md) et rappelées en §4 ; les pistes qui modifient le contrat du schéma (spec §3) devront encore y être reportées, ainsi que dans `schema.ts` et `prompt.ts`, au moment de leur mise en œuvre.

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
- **C2. Vérification en deux temps.** La passe d'analyse repère les allégations sans les vérifier. Une seconde passe, avec la recherche web, vérifie les plus importantes dans un budget explicite, en commençant par les plus sévères. Les allégations non vérifiées faute de budget sont marquées comme telles (nouveau motif dans `fact_check`, donc modification du contrat). Cette passe peut tourner après l'affichage des annotations rhétoriques, qui apparaissent ainsi plus tôt.

### Lot Q : qualité mesurée

- **Q1. Corpus d'évaluation (D13).** Une vingtaine d'articles figés (texte et titre), variés en sujet, langue et orientation, dont quelques articles réputés bien argumentés, annotés à la main. Les textes intégraux restent hors dépôt, dans un dossier local ignoré par git ; le dépôt ne contient que le script, l'URL et le titre de chaque article, et les annotations attendues (citations courtes). Un script, sur le modèle de `scripts/test-live-provider.mjs`, lance le moteur et mesure : précision et rappel par catégorie (correspondance par chevauchement de citation), taux de citations localisées, stabilité sur plusieurs exécutions, nombre d'annotations sur les articles témoins. Non exécuté par `npm test`, car il appelle un vrai provider.
- **Q2. Passe de relecture.** Un appel reçoit les annotations et leur contexte, et écarte celles qui ne sont pas justifiées par le texte. Réservée au mode « approfondi » (D10) ; son effet est à mesurer avec Q1.
- **Q3. Grille de sévérité.** Définir dans le prompt ce que recouvrent `high`, `medium` et `low` (par exemple : le procédé porte sur la thèse principale, sur un argument secondaire, ou relève du style). Ajouter éventuellement un champ `confidence` (modifie le contrat).
- **Q4. Signalement par l'utilisateur.** Un bouton « annotation contestable » sur chaque carte, enregistré localement, pour alimenter le corpus. Aucun envoi à un tiers sans décision explicite (confidentialité).

## 3. Ordre proposé

1. Lot A : corrige des défauts visibles sans toucher au contrat. A1 et A2 en premier, car le cache masque les effets de toute autre évolution du moteur.
2. Q1 (corpus) avant les lots B et C, pour mesurer leur effet plutôt que de l'estimer.
3. B1 et B2, puis C1 : ils répondent aux limites les plus structurelles.
4. Le réglage « rapide / approfondi » (D10) avec le premier appel supplémentaire, puis C2, Q2 et B3 selon les résultats mesurés.

## 4. Orientations retenues (2026-10-05)

| # | Question | Décision |
|---|---|---|
| D10 | Coût des appels supplémentaires (B1, C2, Q2) | Réglage **« rapide / approfondi »** dans les options. Le mode rapide conserve le comportement actuel ; le mode approfondi active les appels supplémentaires |
| D11 | Analyse en cache peut-être obsolète au rechargement (A2) | **Affichage immédiat avec avertissement** « peut-être obsolète » et bouton « Ré-analyser », sans ré-extraction |
| D12 | Annotations sans citation (B3) | **Acceptées, ancrées sur le titre** : section dédiée du panneau sur desktop ; sur mobile, bulle au toucher du titre et rappel dans le message bref |
| D13 | Emplacement du corpus d'évaluation (Q1) | **Textes intégraux hors dépôt** ; seuls le script, les références des articles et les annotations attendues sont versionnés |

Reste à préciser : le libellé et la valeur par défaut du réglage D10, et le comportement de D12 sur les vidéos YouTube, qui n'ont pas de titre surlignable dans la transcription.
