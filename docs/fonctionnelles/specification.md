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
      "exact_quote": "Citation exacte présente au mot près dans le texte",
      "category": "sophism" | "bias" | "factual_claim",
      "label": "argument_autorite" | "homme_de_paille" | "faux_dilemme" | … | "autre",
      "severity": "high" | "medium" | "low",
      "rhetoric_critique": "Explication de la faille de logique ou du procédé rhétorique.",
      "fact_check": {
        "status": "refuted" | "supported" | "misleading" | "unverified",
        "context": "Données réelles ou contre-exemples connus.",
        "sources": [
          { "title": "Nom de la source", "url": "https://..." }
        ]
      }
    }
  ]
}

`label` est un identifiant de la taxonomie fermée définie dans `src/taxonomy.ts` (décision D4) ; le nom affiché et la définition en sont dérivés.

`severity` suit une grille définie dans le prompt (piste Q3) : `high` si le procédé porte la thèse principale ou une allégation dont dépend l'argumentation, `medium` s'il soutient un argument secondaire, `low` s'il relève du ton ou d'une remarque en passant.

Ce schéma est celui de chaque appel d'analyse, y compris par morceau pour un article découpé (D6). Les appels secondaires, sans sortie structurée stricte, répondent en JSON simple, analysé avec tolérance (repli en cas d'échec) :

- **consolidation** d'un article découpé (B2) : `{ "summary", "clickbait_gap", "blind_spot" }`, jugés sur l'ensemble de l'article à partir des constats de chaque morceau, qui remplacent ceux de la fusion ;
- **relecture** des annotations, en mode approfondi (Q2, D10) : `{ "rejected": [{ "id", "reason" }] }`, les annotations écartées ;
- **cartographie** d'un article découpé, en mode approfondi (B1, D10) : un plan en texte libre, joint à l'analyse de chaque morceau.

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