# Product Requirements Document (PRD) — Rhetorix (Extension Manifest V3)

## 1. Vision du produit
Extension de navigateur pour Chromium (Chrome, Brave, Edge) et Firefox permettant d'analyser en temps réel un article de presse ou une interview. L'extension surligne les sophismes et biais dans le texte à gauche, et affiche un panneau latéral interactif à droite détaillant l'analyse rhétorique et les sources de vérification.

## 2. Architecture & Composants MV3
- `manifest.json` : Manifest V3 avec permissions `sidePanel`, `activeTab`, `scripting`, `storage`.
- `content-script.js` :
  - Extraction du texte principal via Readability.js.
  - Surlignage non invasif via la CSS Custom Highlight API.
  - Écouteurs de clic pour synchronisation bidirectionnelle (clic texte -> scroll sidepanel, et inversement).
- `sidepanel.html / sidepanel.js` :
  - Interface utilisateur (panneau latéral persistant).
  - Gestion des statuts (idle, chargement, affichage des cartes).
  - Envoi des requêtes au service d'analyse.
- `options.html / options.js` :
  - Configuration du provider LLM, de l'endpoint et de la clé API.
  - Profondeur d'analyse (D10) : « Analyse : rapide / approfondie ». Le mode approfondi ajoute la cartographie des articles découpés et la relecture des annotations.

## 3. Schéma de données attendu du LLM (Structured Output)
Le modèle doit obligatoirement retourner un objet JSON conforme à cette structure :

{
  "summary": "Bref résumé de la posture argumentative de l'article",
  "clickbait_gap": "Écart entre le titre et le contenu, ou chaîne vide",
  "blind_spot": "Point de vue, contre-argument ou consensus omis, ou chaîne vide",
  "annotations": [
    {
      "id": "ann-1",
      "exact_quote": "Citation exacte présente au mot près dans le texte, ou chaîne vide pour une annotation d'ensemble",
      "category": "sophism" | "bias" | "factual_claim",
      "label": "argument_autorite" | "homme_de_paille" | "faux_dilemme" | … | "autre",
      "severity": "high" | "medium" | "low",
      "confidence": "high" | "medium" | "low",
      "rhetoric_critique": "Explication de la faille de logique ou du procédé rhétorique.",
      "fact_check": {
        "status": "refuted" | "supported" | "misleading" | "unverified",
        "context": "Données réelles ou contre-exemples connus.",
        "evidence": {
          "kind": "meta_analysis" | "rct" | "observational" | "animal_in_vitro" | "preprint" | "unknown" | "none",
          "doi": "10.xxxx/… ou chaîne vide"
        },
        "sources": [
          { "title": "Nom de la source", "url": "https://..." }
        ]
      }
    }
  ]
}

`label` est un identifiant de la taxonomie fermée définie dans `src/taxonomy.ts` (décision D4) ; le nom affiché et la définition en sont dérivés.

`severity` suit une grille définie dans le prompt (piste Q3) : `high` si le procédé porte la thèse principale ou une allégation dont dépend l'argumentation, `medium` s'il soutient un argument secondaire, `low` s'il relève du ton ou d'une remarque en passant.

`confidence` (piste Q3) mesure l'assurance du modèle que le procédé est présent et bien nommé, indépendamment de sa gravité : `high` s'il est manifeste, `medium` si une autre lecture raisonnable existe, `low` si la lecture est discutable. Une valeur absente ou hors énumération est omise à la validation ; les analyses antérieures n'en ont pas.

`fact_check.evidence` (D16) décrit l'étude sur laquelle repose une allégation scientifique : son type (méta-analyse ou revue systématique, essai contrôlé randomisé, étude observationnelle, étude animale ou in vitro, prépublication, ou indéterminé) et son DOI s'il figure dans les résultats de recherche ou dans l'article. `kind: "none"` (allégation non scientifique) est retiré à la validation, comme une valeur hors énumération ; un DOI mal formé est retiré, et tout DOI l'est sans recherche web. Le client y ajoute `record`, la notice Crossref du DOI (titre, revue, année, type, prépublication, rétractation, avis de réserve) ; un DOI inconnu de Crossref est retiré.

Une annotation `sophism` ou `bias` peut avoir un `exact_quote` vide (D12) : elle porte sur la structure de l'ensemble de l'argumentation (conclusion sans lien avec les prémisses, contradiction entre sections éloignées…) et non sur un passage. Elle est ancrée sur le titre de l'article, ou sur celui de la vidéo pour YouTube. Une annotation `factual_claim` sans citation est rejetée.

Ce schéma est celui de chaque appel d'analyse, y compris par morceau pour un article découpé (D6). Les appels secondaires, sans sortie structurée stricte, répondent en JSON simple, analysé avec tolérance (repli en cas d'échec) :

- **consolidation** d'un article découpé (B2) : `{ "summary", "clickbait_gap", "blind_spot" }`, jugés sur l'ensemble de l'article à partir des constats de chaque morceau, qui remplacent ceux de la fusion ;
- **relecture** des annotations, en mode approfondi (Q2, D10) : `{ "rejected": [{ "id", "reason" }] }`, les annotations écartées ;
- **cartographie** d'un article découpé, en mode approfondi (B1, D10) : un plan en texte libre, joint à l'analyse de chaque morceau ;
- **vérification à la demande** d'une allégation restée « non vérifiée » (C2, D14), avec la recherche web activée pour ce seul appel : `{ "status", "context", "sources": [{ "title", "url" }], "evidence": { "kind", "doi" } }`, soumis à la même politique des sources (D3) ; le résultat remplace le `fact_check` de l'annotation.

## 4. Parcours utilisateur
1. L'utilisateur navigue sur un article et clique sur l'icône de l'extension.
2. Le `sidePanel` s'ouvre. Un bouton "Analyser la page" est disponible.
3. Clic sur "Analyser" :
   - Le `content-script` extrait les paragraphes textuels via Readability.
   - Le texte est transmis au `sidePanel`.
   - Le `sidePanel` appelle l'API LLM configurée (streaming activé).
4. Dès réception du JSON validé :
   - Le `content-script` crée des `TreeWalker` ou des `Range` DOM basés sur `exact_quote` et applique `CSS.highlights.set('rhetorix-highlight', ...)`.
   - Le `sidePanel` affiche les cartes correspondantes avec des badges de couleur (ex. rouge pour sophisme, orange pour biais, bleu pour allégation factuelle).
5. Interaction :
   - Clic sur une carte -> la page défile (`scrollIntoView`) jusqu'à la citation surlignée.
   - Clic sur une citation dans la page -> la carte correspondante est mise en avant dans le panneau latéral.
   - Les annotations d'ensemble (D12) occupent une section dédiée du panneau, « Sur l'ensemble de l'article ». Dans la page, le titre est surligné ; son survol ou son toucher ouvre une bulle qui les liste. Sur mobile, le message bref de fin d'analyse les rappelle et, si le titre n'a pas été trouvé dans la page, les affiche en entier.
   - Une allégation « non vérifiée » propose « Vérifier en ligne » dans sa carte et dans sa bulle quand le provider permet la recherche web (D14). Le résultat s'affiche à la place de la vérification et complète le cache.
   - Pour une allégation scientifique, la vérification indique le niveau de preuve et, si l'étude a été trouvée dans Crossref, un lien vers sa notice ; « Prépublication », « Article rétracté » ou « Avis de réserve de l'éditeur » sont visibles sans déplier la vérification (D16).
   - Chaque annotation propose « Contester » (D15) : la carte est repliée, le surlignage atténué et l'annotation enregistrée localement. Les options listent les annotations contestées, d'où l'utilisateur peut ouvrir un ticket GitHub prérempli après un avertissement, ou retirer la contestation.