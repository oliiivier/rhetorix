# CLAUDE.md

Rhetorix est une extension Manifest V3 pour Chromium et Firefox (desktop et Android). Elle surligne dans un article les sophismes, biais et allégations factuelles détectés par un LLM, et les détaille dans un panneau latéral ou, sur mobile, dans des bulles.

## Commandes

```sh
npm run build       # dist/chrome et dist/firefox
npm run watch
npm test            # vitest, modules purs (test/)
npm run typecheck   # tsc --noEmit
npx web-ext lint -s dist/firefox
npm run corpus:fetch  # textes du corpus d'évaluation (eval/corpus)
npm run corpus:eval -- -p <provider>  # évaluation du moteur sur le corpus (appelle le provider)
```

Après une modification, lancer `typecheck`, `test` et `build`.

## Documentation de référence

- [docs/fonctionnelles/specification.md](docs/fonctionnelles/specification.md) : le PRD, qui fait foi pour le comportement ;
- [docs/fonctionnelles/spec-youtube.md](docs/fonctionnelles/spec-youtube.md) : spécifications fonctionnelles pour le module YouTube et la synchronisation vidéo ;
- [docs/techniques/architecture.md](docs/techniques/architecture.md) : composants, messages, providers, cache, compatibilité des navigateurs ;
- [docs/techniques/architecture-youtube.md](docs/techniques/architecture-youtube.md) : architecture technique du module YouTube et synchronisation vidéo ;
- [docs/techniques/evolutions-analyse.md](docs/techniques/evolutions-analyse.md) : limites actuelles du moteur d'analyse, pistes d'évolution et orientations retenues (D10 à D16) ;
- [docs/implementation/youtube.md](docs/implementation/youtube.md) : plan d'implémentation par jalons du module YouTube ;
- [docs/fonctionnelles/points-ouverts.md](docs/fonctionnelles/points-ouverts.md) : les décisions prises (D1 à D16) et les points restant à préciser. Ne pas trancher implicitement un point ouvert : demander, ou documenter le choix fait.

## Conventions

- La documentation, les textes d'interface et les commentaires sont en français.
- **API d'extension** : toujours passer par `ext` (`src/ext.ts`), jamais par `chrome.*` directement. Une API propre à un navigateur doit être détectée à l'exécution. Le manifest est généré par cible dans `build.mjs` : ne pas créer de `manifest.json` à la main.
- **`permissions.request`** doit être appelé avant tout `await` dans le gestionnaire d'événement, sinon Firefox refuse la demande.
- **L'analyse est pilotée par le script de fond** (`src/runner.ts`, D9). Le panneau n'en est qu'une vue : il n'appelle pas le LLM et ne fait que lancer, annuler et afficher l'état publié (`run-update`). Tout comportement doit aussi fonctionner sans panneau (Firefox Android).
- **Interactions dans la page** : le survol ne concerne que la souris (`pointerType === "mouse"`) ; toute information accessible au survol doit l'être aussi au toucher.
- Le schéma JSON du LLM (`src/schema.ts`, spec §3) est un contrat. Toute modification se reporte dans la spec, dans la validation et dans le prompt (`src/prompt.ts`).
- Les labels proviennent exclusivement de `src/taxonomy.ts`. Toute nouvelle étiquette ajoutée dans `src/taxonomy.ts` doit obligatoirement être traduite et documentée dans les 5 langues (`fr`, `en`, `es`, `de`, `it` dans `TAXONOMY_TRANSLATIONS` ; la suite de tests unitaires l'impose).
- **Internationalisation (D5)** : tout texte d'interface (panneau latéral, options, messages de statut et d'erreur d'extraction ou de provider) passe impérativement par `src/i18n.ts` (`UiStrings`) et doit être décliné dans les 5 langues supportées.
- **Sources (D3)** : aucune URL n'est affichée si elle ne provient pas de l'outil de recherche web du provider (`enforceSourcePolicy` et `enforceAnnotationSourcePolicy`). Seule exception (D16) : le lien `doi.org` d'une étude dont le DOI a été confirmé par Crossref.
- **Sécurité et Shadow DOM** : le contenu issu du LLM ou de la page (panneau et bulles en ligne dans leur Shadow Root) est inséré avec `textContent` et les nœuds DOM, jamais avec `innerHTML`.
- MV3 interdit le code distant : les dépendances sont embarquées par esbuild. Ne pas minifier, car la revue Firefox exige un code lisible.
- La clé API va dans `storage.local`, jamais dans `sync`, et ne doit pas être journalisée.
- Le surlignage passe par la CSS Custom Highlight API sans modifier le texte du DOM hôte ; les bulles en ligne sont encapsulées dans un hôte Shadow DOM.

## Tester manuellement

Charger `dist/chrome` (`chrome://extensions`, mode développeur) ou `dist/firefox` (`about:debugging`, module temporaire), puis analyser quelques pages variées : article classique, citations contenant du balisage, page sans contenu exploitable, article long (découpage).

Sur Firefox Android (`npx web-ext run -s dist/firefox -t firefox-android`), vérifier en plus : analyse lancée par l'icône, message bref d'avancement, bulle au toucher d'une citation et fermeture au toucher ailleurs, analyse longue (le script de fond ne doit pas être suspendu).
