# Rhetorix

Extension de navigateur (Manifest V3) pour **Chromium** (Chrome, Brave, Edge) et **Firefox**, qui analyse un article de presse ou une interview avec un LLM :

- **dans la page**, les sophismes, biais et allégations factuelles sont surlignés (CSS Custom Highlight API, sans modifier le DOM) ;
- **dans le panneau latéral**, une carte par annotation détaille la critique rhétorique, une vérification factuelle et ses sources ;
- un clic sur une carte fait défiler la page jusqu'à la citation, et un clic sur une citation met la carte en avant.

Fournisseurs LLM pris en charge : Anthropic (avec recherche web pour la vérification des faits), endpoints compatibles OpenAI (OpenAI, Mistral, OpenRouter, Ollama…) et Google Gemini.

> **Statut : v0.1, en développement.** Voir les [points ouverts](docs/fonctionnelles/points-ouverts.md).

## Démarrage

Prérequis : Node.js ≥ 20.

```sh
npm install
npm run build      # génère dist/chrome et dist/firefox
npm run watch      # reconstruit à chaque modification
npm test           # tests unitaires (vitest)
npm run typecheck
```

### Charger l'extension

**Chromium (≥ 128)** : ouvrir `chrome://extensions`, activer le **mode développeur**, puis **Charger l'extension non empaquetée** et choisir `dist/chrome`.

**Firefox (≥ 140)** : ouvrir `about:debugging#/runtime/this-firefox`, puis **Charger un module complémentaire temporaire** et choisir `dist/firefox/manifest.json`. Autre possibilité : `npx web-ext run -s dist/firefox`.

Ensuite, ouvrir les options de l'extension, choisir le fournisseur, saisir la clé API et le modèle, puis enregistrer. Le navigateur demande alors l'autorisation d'accéder à l'API du fournisseur.

### Utilisation

1. Ouvrir un article, puis cliquer sur l'icône Rhetorix pour ouvrir le panneau.
2. Cliquer sur **Analyser la page**.

Une analyse est mise en cache par URL. **Ré-analyser** force un nouvel appel.

## Structure

```
build.mjs               # build esbuild + manifest par navigateur
src/
  background.ts         # ouverture du panneau (sidePanel / sidebarAction)
  content-script.ts     # extraction (Readability), surlignage, détection des clics
  sidepanel/            # panneau : déclenchement, cartes, synchronisation
  options/              # fournisseur, clé API, modèle, langue, cache
  providers/            # adaptateurs anthropic, openai-compatible, gemini
  analyze.ts            # orchestration : découpage, appels, validation, fusion
  schema.ts             # contrat JSON du LLM, validation, politique des sources
  taxonomy.ts           # liste fermée des sophismes, biais et allégations
  text-match.ts         # localisation des citations dans la page
  chunking.ts, cache.ts, config.ts, prompt.ts, messages.ts, ext.ts
test/                   # tests unitaires des modules purs
docs/
```

## Documentation

| Document | Contenu |
|---|---|
| [docs/fonctionnelles/specification.md](docs/fonctionnelles/specification.md) | PRD : vision, composants, schéma JSON attendu du LLM, parcours utilisateur |
| [docs/fonctionnelles/points-ouverts.md](docs/fonctionnelles/points-ouverts.md) | Décisions prises (D1 à D8), points restant à préciser, risques |
| [docs/techniques/architecture.md](docs/techniques/architecture.md) | Composants, flux de messages, providers, cache, compatibilité des navigateurs |
| [CLAUDE.md](CLAUDE.md) | Consignes pour les agents de code travaillant sur le dépôt |

## Confidentialité

Le texte de l'article analysé est envoyé au fournisseur LLM configuré par l'utilisateur, et à lui seul : Rhetorix n'a pas de serveur. La clé API est stockée localement dans le navigateur, sans synchronisation.
