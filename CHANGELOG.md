# Journal des modifications

Les changements notables de Rhetorix, par version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation, [Semantic Versioning](https://semver.org/lang/fr/). Les références entre parenthèses (D10, B3…) renvoient aux [décisions](docs/fonctionnelles/points-ouverts.md) et aux [pistes d'évolution du moteur](docs/techniques/evolutions-analyse.md).

## [0.1.2] — 2026-10-05

### Ajouté

- **Annotations sur l'ensemble de l'article** (B3, D12) : les défauts de structure de l'argumentation, sans passage précis (conclusion sans lien avec les prémisses, contradiction entre sections…), sont regroupés dans une section du panneau et accessibles depuis le titre surligné de l'article, ou de la vidéo sur YouTube.
- **Confiance** (Q3) : chaque annotation indique l'assurance du modèle que le procédé est présent et bien nommé, en plus de sa gravité.
- **Vérification en ligne à la demande** (C2, D14) : une allégation restée non vérifiée peut être vérifiée depuis sa carte ou sa bulle, avec la recherche web activée pour ce seul appel, même si elle est désactivée dans les options. Le résultat est gardé en cache.
- **Contester une annotation** (Q4, D15) : elle est repliée et enregistrée dans le navigateur. Les options listent les annotations contestées et permettent d'ouvrir un ticket GitHub prérempli, que l'utilisateur relit et publie lui-même ; l'adresse de la page est facultative.
- **Études scientifiques citées** (C3, D16) : niveau de preuve (méta-analyse, essai contrôlé, étude observationnelle, animale ou in vitro, prépublication) et fidélité de l'article à l'étude. Si l'étude a un DOI, sa notice est vérifiée auprès de Crossref : revue, année, prépublication, article rétracté, avis de réserve de l'éditeur.
- **Financeurs et déclarations d'intérêts des auteurs** (D17), cités tels quels depuis Crossref ou, pour une étude biomédicale, PubMed. Faute de déclaration, rien n'est conclu sur l'absence de conflit d'intérêts.

### Modifié

- Le moteur d'analyse passe en version 8 : les analyses en cache antérieures sont réaffichées avec la mention « peut-être obsolète ».
- Sur Firefox pour Android, l'accès à `api.crossref.org` et `eutils.ncbi.nlm.nih.gov` est demandé avec celui du fournisseur.
- La politique de confidentialité mentionne Crossref, PubMed et les annotations contestées.
- L'archive des sources pour AMO porte le numéro de version (`rhetorix-sources-<version>.zip`).

## [0.1.1] — 2026-10-05

### Ajouté

- **Réglage « Analyse : rapide / approfondie »** (D10). Le mode approfondi établit d'abord le plan d'un article long, pour repérer les procédés qui s'étendent sur plusieurs sections (B1), puis relit les annotations pour écarter celles que le texte ne justifie pas (Q2).
- **Éléments globaux jugés sur l'ensemble** de l'article découpé : résumé, décalage titre / contenu et angle mort (B2).
- **Contexte de publication** : date, auteur et site sont transmis au modèle, qui juge les allégations à la date de publication (C1).
- **Grille de gravité** explicite dans le prompt (Q3).
- **Analyse partielle** : l'échec d'un morceau n'annule plus les autres, et les annotations reçues restent affichées après une erreur ou une annulation (A3).
- **Nouvelles tentatives** automatiques en cas de quota par minute ou de surcharge du fournisseur (A4).
- **Corpus d'évaluation** et script de mesure du moteur (`npm run corpus:eval`, Q1, D13).

### Modifié

- **Cache** : l'empreinte inclut la version du moteur, la recherche web et la taille des morceaux (A1). Une analyse produite avec d'autres réglages est réaffichée avec la mention « peut-être obsolète » et le bouton « Ré-analyser » (A2, D11).
- Les annotations dont les citations se recouvrent sont dédoublonnées (A5).
- Consignes de couverture et de sélection plus précises dans le prompt.

## [0.1.0] — 2026-10-04

Première version publiée.

### Ajouté

- Surlignage dans la page, par la CSS Custom Highlight API, des sophismes, biais et allégations factuelles détectés par un LLM, avec une couleur par catégorie.
- Taxonomie fermée de 39 étiquettes, avec gravité, critique rhétorique, résumé de la posture argumentative, décalage titre / contenu et angle mort.
- Vérification factuelle par la recherche web du fournisseur ; seules les URL issues de la recherche sont affichées (D3).
- Fournisseurs : Anthropic, Google Gemini, endpoints compatibles OpenAI (dont Ollama en local) et Chrome Built-in AI (Gemini Nano).
- Panneau latéral avec cartes, filtres par catégorie et synchronisation avec la page ; bulles au survol ou au toucher, en Shadow DOM ; trois modes d'affichage.
- Streaming : annotations et résumé affichés au fil de la réponse.
- Découpage des articles longs par paragraphes et consolidation du résumé (D6).
- Vidéos YouTube : analyse de la transcription par tranches ou en entier, bulles synchronisées sur le lecteur, pause automatique, marqueurs sur la barre de lecture.
- Firefox pour Android : analyse lancée par l'icône, message bref d'avancement et bulles au toucher (D9).
- Cache des analyses par URL et suivi de la consommation de tokens.
- Interface et analyses en cinq langues : français, anglais, espagnol, allemand, italien.
- Politique de confidentialité, licence MIT, paquets Chrome et Firefox.

[0.1.2]: https://github.com/oliiivier/rhetorix/compare/60ade13...2bbac96
[0.1.1]: https://github.com/oliiivier/rhetorix/compare/278219c...60ade13
[0.1.0]: https://github.com/oliiivier/rhetorix/tree/278219c
