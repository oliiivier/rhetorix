# CLAUDE.md

Rhetorix est une extension Manifest V3 pour Chromium et Firefox. Elle surligne dans un article les sophismes, biais et allégations factuelles détectés par un LLM, et les détaille dans un panneau latéral.

## Commandes

```sh
npm run build       # dist/chrome et dist/firefox
npm run watch
npm test            # vitest, modules purs (test/)
npm run typecheck   # tsc --noEmit
npx web-ext lint -s dist/firefox
```

Après une modification, lancer `typecheck`, `test` et `build`.

## Documentation de référence

- [docs/fonctionnelles/specification.md](docs/fonctionnelles/specification.md) : le PRD, qui fait foi pour le comportement ;
- [docs/techniques/architecture.md](docs/techniques/architecture.md) : composants, messages, providers, cache, compatibilité des navigateurs ;
- [docs/fonctionnelles/points-ouverts.md](docs/fonctionnelles/points-ouverts.md) : les décisions prises (D1 à D8) et les points restant à préciser. Ne pas trancher implicitement un point ouvert : demander, ou documenter le choix fait.

## Conventions

- La documentation, les textes d'interface et les commentaires sont en français.
- **API d'extension** : toujours passer par `ext` (`src/ext.ts`), jamais par `chrome.*` directement. Une API propre à un navigateur doit être détectée à l'exécution. Le manifest est généré par cible dans `build.mjs` : ne pas créer de `manifest.json` à la main.
- **`permissions.request`** doit être appelé avant tout `await` dans le gestionnaire d'événement, sinon Firefox refuse la demande.
- Le schéma JSON du LLM (`src/schema.ts`, spec §3) est un contrat. Toute modification se reporte dans la spec, dans la validation et dans le prompt (`src/prompt.ts`).
- Les labels proviennent exclusivement de `src/taxonomy.ts`. Toute nouvelle étiquette ajoutée dans `src/taxonomy.ts` doit obligatoirement être traduite et documentée dans les 5 langues (`fr`, `en`, `es`, `de`, `it` dans `TAXONOMY_TRANSLATIONS` ; la suite de tests unitaires l'impose).
- **Internationalisation (D5)** : tout texte d'interface (panneau latéral, options, messages de statut et d'erreur d'extraction ou de provider) passe impérativement par `src/i18n.ts` (`UiStrings`) et doit être décliné dans les 5 langues supportées.
- **Sources (D3)** : aucune URL n'est affichée si elle ne provient pas de l'outil de recherche web du provider (`enforceSourcePolicy` et `enforceAnnotationSourcePolicy`).
- **Sécurité du panneau** : le contenu issu du LLM ou de la page est inséré avec `textContent`, jamais avec `innerHTML`.
- MV3 interdit le code distant : les dépendances sont embarquées par esbuild. Ne pas minifier, car la revue Firefox exige un code lisible.
- La clé API va dans `storage.local`, jamais dans `sync`, et ne doit pas être journalisée.
- Le surlignage passe uniquement par la CSS Custom Highlight API : ne pas modifier le DOM de la page hôte.

## Tester manuellement

Charger `dist/chrome` (`chrome://extensions`, mode développeur) ou `dist/firefox` (`about:debugging`, module temporaire), puis analyser quelques pages variées : article classique, citations contenant du balisage, page sans contenu exploitable, article long (découpage).
