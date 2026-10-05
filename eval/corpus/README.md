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
      "note": "…"
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

## Annoter

Les annotations actuelles ont été rédigées par Claude, puis à relire. Pour les textes réels, seuls les procédés évidents sont `required` ; les cas discutables sont `required: false`, pour ne pas compter comme faux positif une annotation défendable. Les textes synthétiques ont une vérité de référence certaine, puisque leurs défauts ont été posés volontairement.

Pour ajouter un article :

1. créer la fiche `articles/<id>.json` (préfixe `synth-`, `pd-`, `cc-` ou `cr-` selon `kind`) ;
2. rédiger le texte dans `texts/`, ou lancer `npm run corpus:fetch -- <id>` ;
3. relire le texte extrait, annoter, puis `npm run corpus:fetch -- --set-hash <id>` ;
4. `npm test` vérifie la fiche, la règle de stockage et la présence des citations.
