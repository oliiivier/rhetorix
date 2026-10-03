# Product Requirements Document (PRD) — Rhetorix (Extension Manifest V3)

## 1. Vision du produit
Extension de navigateur pour Chromium (Chrome, Brave, Edge) permettant d'analyser en temps réel un article de presse ou une interview. L'extension surligne les sophismes et biais dans le texte à gauche, et affiche un panneau latéral interactif à droite détaillant l'analyse rhétorique et les sources de vérification.

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

## 3. Schéma de données attendu du LLM (Structured Output)
Le modèle doit obligatoirement retourner un objet JSON conforme à cette structure :

{
  "summary": "Bref résumé de la posture argumentative de l'article",
  "annotations": [
    {
      "id": "ann-1",
      "exact_quote": "Citation exacte présente au mot près dans le texte",
      "category": "sophism" | "bias" | "factual_claim",
      "label": "Argument d'autorité" | "Homme de paille" | "Faux dilemme" | etc.,
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