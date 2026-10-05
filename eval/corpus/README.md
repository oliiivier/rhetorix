# Corpus d'évaluation

Articles annotés à la main pour mesurer la qualité du moteur d'analyse : précision et rappel par catégorie, neutralité, vérification factuelle, contexte global des articles découpés. Voir la piste Q1 et la décision D13 dans [evolutions-analyse.md](../../docs/techniques/evolutions-analyse.md).

Le corpus ne sert pas aux tests unitaires : `npm test` vérifie seulement sa cohérence (`test/corpus.test.ts`). Le script d'évaluation, qui appellera un vrai provider, reste à écrire.

## Organisation

```
eval/corpus/
  articles/<id>.json   fiche : métadonnées, licence, annotations attendues (versionnée)
  texts/<id>.txt       texte librement redistribuable (versionné)
  .local/<id>.txt      texte non libre, récupéré localement (ignoré par git)
```

Le texte est stocké tel que l'extension l'extrait (Readability, un paragraphe par bloc, paragraphes séparés par une ligne vide), y compris le bruit éventuel de la page : bandeaux, mentions d'archives.

## Licences et stockage

| `kind` | Exemple | `license.redistributable` | Texte |
|---|---|---|---|
| `synthetic` | texte rédigé pour le corpus | `true` | `texts/`, sous la licence MIT du dépôt |
| `public_domain` | Zola (1898), discours d'un président américain | `true` | `texts/` |
| `open_license` | Wikinews (CC BY 4.0) | `true` | `texts/`, attribution dans `license.attribution` |
| `copyrighted` | tribune de presse | `false` | `.local/` uniquement |

Pour un texte non libre, le dépôt ne contient que la fiche : l'URL, le titre et des citations courtes, qui relèvent du droit de courte citation. Le texte se récupère localement :

```sh
npm run corpus:fetch            # récupère les textes absents
npm run corpus:fetch -- --check # compare les textes présents à leur empreinte
```

Si une page a changé en ligne, son empreinte ne correspond plus : le test ignore alors ses citations, et `--check` le signale. Il faut relire l'article et mettre à jour la fiche (`--set-hash <id>` enregistre la nouvelle empreinte).

Une licence « pas de modification » (CC BY-ND) est compatible avec `texts/`, puisque le texte est stocké sans modification. Par prudence, un texte sous licence « pas d'usage commercial » (NC), ou dont la licence est incertaine, est classé en `copyrighted`.

## Format d'une fiche

```jsonc
{
  "id": "synth-fr-nucleaire-pour",      // = nom du fichier
  "title": "…",                         // titre transmis au LLM
  "lang": "fr",                         // fr, en, es, de ou it
  "kind": "synthetic",                  // voir le tableau ci-dessus
  "genre": "tribune",                   // facultatif : tribune, actualité, discours…
  "orientation": "pro-nucléaire",       // facultatif : pour mesurer la neutralité
  "pair": "nucleaire",                  // facultatif : articles symétriques à comparer
  "control": true,                      // facultatif : article témoin, bien argumenté
  "purpose": "…",                       // ce que l'article permet de tester
  "source": { "url": "…", "author": "…", "publisher": "…", "published": "AAAA-MM-JJ" },
  "license": { "name": "…", "redistributable": true, "attribution": "…" },
  "text_sha256": "…",                   // SHA-256 des paragraphes joints par "\n\n"
  "eval": { "max_chunk_tokens": 400 },  // facultatif : réglages imposés pendant l'évaluation
  "document": { "clickbait_gap": "present", "blind_spot": "any" },  // present, absent ou any
  "limits": { "max_rhetorical": 1 },    // facultatif : nombre maximal d'annotations sophism + bias
  "expected": [
    {
      "quote": "…",                     // citation exacte, présente dans le texte
      "accept": ["sophism/faux_dilemme", "bias/cadrage"],  // labels acceptés, le premier est préféré
      "required": true,                 // true : compte dans le rappel ; false : toléré
      "fact_status": ["refuted", "misleading", "unverified"],  // statuts acceptés
      "note": "…",                      // justification, en particulier du statut factuel
      "sources": ["https://…"]          // sources de la vérification
    }
  ],
  "not_expected": [{ "quote": "…", "note": "…" }]  // passages qui ne doivent pas être annotés
}
```

Règles d'évaluation prévues :

- une annotation produite correspond à une annotation attendue si leurs citations se chevauchent ;
- **rappel** : part des annotations `required` retrouvées avec un label de `accept` ;
- **précision** : une annotation qui ne correspond à aucune annotation attendue, `required` ou non, est un faux positif probable, à relire ;
- **statut factuel** : si `fact_status` est donné, le statut produit doit en faire partie. `unverified` y figure dès que l'évaluation peut tourner sans recherche web ;
- **neutralité** : les articles d'une même `pair` doivent obtenir des résultats comparables.

## Contenu actuel

| Fiche | Langue | Ce qu'elle teste |
|---|---|---|
| `synth-fr-nucleaire-pour` / `-contre` | fr | Neutralité : mêmes procédés, thèses opposées |
| `synth-fr-controle-trains` | fr | Témoin : article nuancé, pas d'annotation rhétorique attendue |
| `synth-fr-30kmh-long` | fr | Homme de paille visible seulement entre deux morceaux ; titre alarmiste |
| `synth-en-four-day-week` | en | Procédés classiques, allégation fausse |
| `synth-es-suplemento` | es | Biais de la presse santé |
| `synth-de-windpark` | de | Langage chargé, pente glissante, tu quoque |
| `synth-it-mercato` | it | Appel à la tradition, inversion de la charge de la preuve |
| `pd-fr-zola-jaccuse` | fr | Rhétorique véhémente au service d'une thèse vraie ; texte long ; date (1898) |
| `pd-en-bush-2001-address` | en | Faux dilemme ; chiffres annoncés à chaud et surestimés |
| `cc-en-wikinews-fuel-standards` | en | Témoin : dépêche factuelle avec le bruit de la page |
| `cr-fr-contrepoints-secheresse` | fr | Presse d'opinion libérale, ton mesuré |
| `cr-fr-reporterre-soignants-pesticides` | fr | Presse d'opinion écologiste, ton militant |

## Vérification des faits

Les statuts factuels attendus ont été vérifiés le 2026-10-05. Les fiches font foi : chaque annotation y porte sa justification (`note`) et ses sources (`sources`). Ce tableau en est le récapitulatif ; le mettre à jour en même temps que les fiches.

### Affirmations fausses (statut attendu : `refuted`)

| Fiche | Affirmation | Réalité | Source |
|---|---|---|---|
| `synth-fr-nucleaire-pour` | Aucun accident nucléaire n'a fait de victime en Europe | Tchernobyl (Ukraine, 1986) | — |
| `synth-fr-nucleaire-contre` | Les renouvelables fournissent plus de la moitié de l'électricité française | 27,8 % en 2024, contre 67 % pour le nucléaire | [RTE](https://analysesetdonnees.rte-france.com/bilan-electrique-2024/production) |
| `synth-en-four-day-week` | Semaine légale de 32 h aux États-Unis depuis 1938 | 44 h en 1938, 42 h en 1939, 40 h en 1940 | [DOL](https://www.dol.gov/general/aboutdol/history/flsa1938) |
| `synth-es-suplemento` | L'OMS recommande la vitamine C à tous les adultes | Aucune recommandation générale ; déconseillée avec la vitamine E pendant la grossesse | [OMS eLENA](https://www.who.int/tools/elena/interventions/vitaminsec-pregnancy) |
| `synth-de-windpark` | Une éolienne tue des milliers d'oiseaux par an | 3 à 8 par éolienne et par an aux États-Unis ; moins de 20 dans les estimations les plus hautes | [PNNL](https://tethys.pnnl.gov/publications/estimates-bird-collision-mortality-wind-facilities-contiguous-united-states-america), [Nature](https://www.nature.com/articles/s41598-025-03407-8) |
| `synth-it-mercato` | Rome compte plus de 10 millions d'habitants | 2,75 millions (commune), 4,2 millions (ville métropolitaine) | [Wikipédia](https://en.wikipedia.org/wiki/Rome) |
| `pd-en-bush-2001-address` | Plus de 130 Israéliens et plus de 250 Indiens morts le 11 septembre | 5 Israéliens, 41 Indiens | [Brilliant Maps](https://brilliantmaps.com/9-11-victims/) |
| `pd-en-bush-2001-address` | Des centaines de Britanniques morts le 11 septembre | 67 Britanniques | [Brilliant Maps](https://brilliantmaps.com/9-11-victims/) |

### Affirmations exactes (statut attendu : `supported`, ou non contesté)

| Fiche | Affirmation | Précision | Source |
|---|---|---|---|
| `synth-fr-nucleaire-pour` | Le nucléaire fournit environ deux tiers de l'électricité française | 67 % en 2024 (361,7 TWh sur 539 TWh) | [RTE](https://analysesetdonnees.rte-france.com/bilan-electrique-2024/production) |
| `synth-fr-nucleaire-contre` | L'Allemagne a fermé ses trois derniers réacteurs en avril 2023 | Le 15 avril 2023 | [Clean Energy Wire](https://www.cleanenergywire.org/factsheets/qa-germanys-nuclear-exit-one-year-after) |
| `synth-fr-nucleaire-contre` | L'EPR de Flamanville a plus de dix ans de retard | Prévu en 2012, raccordé fin 2024 | — |
| `synth-fr-controle-trains` | La SNCF a été créée en 1938 | Société d'économie mixte en 1938, EPIC en 1983 : `misleading` toléré | [Wikipédia](https://fr.wikipedia.org/wiki/Soci%C3%A9t%C3%A9_nationale_des_chemins_de_fer_fran%C3%A7ais) |
| `synth-en-four-day-week` | Essais islandais de 2015 à 2019, environ 2 500 travailleurs | Environ 1 % de la population active | [Alda](https://en.alda.is/2021/07/04/going-public-icelands-journey-to-a-shorter-working-week/) |
| `synth-es-suplemento` | Vitamine C isolée en 1928 par Szent-Györgyi | Substance identifiée comme vitamine C en 1932 : `misleading` toléré | [Britannica](https://www.britannica.com/biography/Albert-Szent-Gyorgyi) |
| `synth-de-windpark` | Plus de la moitié de l'électricité allemande renouvelable en 2023 | 56 à 60 % selon le périmètre | [Fraunhofer ISE](https://www.ise.fraunhofer.de/en/press-media/press-releases/2024/public-electricity-generation-2023-renewable-energies-cover-the-majority-of-german-electricity-consumption-for-the-first-time.html) |
| `synth-it-mercato` | Colisée inauguré en 80 sous Titus | 80 ou 81 selon les sources | [Wikipédia](https://en.wikipedia.org/wiki/Inaugural_games_of_the_Colosseum) |
| `pd-fr-zola-jaccuse` | Dreyfus innocent | Arrêt de la Cour de cassation du 12 juillet 1906 | [Ministère de la Culture](http://www.dreyfus.culture.fr/fr/pedagogie/pedago-theme-19-arret-cassation-innocence-capitaine-dreyfus.htm) |
| `pd-fr-zola-jaccuse` | Articles 30 et 31 de la loi du 29 juillet 1881 | Diffamation envers les corps constitués et les fonctionnaires | [Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043748424) |
| `pd-en-bush-2001-address` | 40 milliards de dollars votés par le Congrès | P.L. 107-38, signée le 18 septembre 2001 | [Congress.gov](https://www.congress.gov/bill/107th-congress/house-bill/2888) |
| `cc-en-wikinews-fuel-standards` | Réserves de 36, 32 et 29 jours | Le diesel varie entre 32 et 34 jours selon les sources | [Macquarie University](https://lighthouse.mq.edu.au/article/2026/march-2026/could-australia-run-out-of-petrol) |
| `cr-fr-contrepoints-secheresse` | Incendie des Landes de 1949 : 52 000 ha, 82 morts | Chiffres exacts | [Wikipédia](https://fr.wikipedia.org/wiki/Incendie_de_la_for%C3%AAt_des_Landes_de_1949) |
| `cr-fr-reporterre-soignants-pesticides` | Selon l'INCa, les cancers professionnels sont sous-reconnus | Moins de 1 800 reconnus par an pour plusieurs dizaines de milliers estimés | [INCa](https://www.cancer.fr/professionnels-de-sante/prevention-et-depistages/prevention/expositions-professionnelles) |

### Limites

- Le bilan du 11 septembre par nationalité provient d'une source secondaire ; une source primaire serait préférable.
- Les chiffres d'actualité (réserves australiennes, parts de production électrique) peuvent être révisés : les sources indiquent la valeur retenue à la date de vérification.

## Annoter

Les annotations actuelles ont été rédigées par Claude et restent à relire. Les statuts factuels ont été vérifiés le 2026-10-05 ; chaque vérification est justifiée dans `note` et sourcée dans `sources`. Pour les textes réels, seuls les procédés évidents sont `required` ; les cas discutables sont `required: false`, pour ne pas compter comme faux positif une annotation défendable. Les textes synthétiques ont une vérité de référence certaine, puisque leurs défauts ont été posés volontairement.

Pour ajouter un article :

1. créer la fiche `articles/<id>.json` (préfixe `synth-`, `pd-`, `cc-` ou `cr-` selon `kind`) ;
2. rédiger le texte dans `texts/`, ou lancer `npm run corpus:fetch -- <id>` ;
3. relire le texte extrait, annoter, puis `npm run corpus:fetch -- --set-hash <id>` ;
4. `npm test` vérifie la fiche, la règle de stockage et la présence des citations.
