# Publication sur le Chrome Web Store et addons.mozilla.org

Pousser un tag `v*` publie la version sur les deux stores : le workflow [`release.yml`](../../.github/workflows/release.yml) construit et teste l'extension, puis deux jobs, chacun soumis à une approbation, envoient les paquets au Chrome Web Store et à addons.mozilla.org (AMO) et les soumettent à la revue. Chaque store met la version en ligne dès que sa revue l'approuve.

## 1. Fonctionnement

### Chrome Web Store

| Étape | Où | Détail |
|---|---|---|
| Contrôles | job `build` | le tag doit valoir `v` + la version de `package.json` ; `typecheck`, `test`, `package:chrome` |
| Approbation | environnement GitHub `chrome-web-store` | relecture obligatoire avant le job de publication |
| Authentification | Workload Identity Federation | le jeton OIDC du job est échangé contre un jeton du compte de service `cws-publisher`, de portée `chromewebstore` |
| Envoi et soumission | [`scripts/publish-chrome.mjs`](../../scripts/publish-chrome.mjs) | API Chrome Web Store v2 : `upload`, `fetchStatus` si l'envoi est asynchrone, puis `publish` |

Aucun secret n'est stocké : ni clé de compte de service, ni refresh token. Le compte de service n'a aucun rôle IAM sur le projet ; son droit de publier vient uniquement de son ajout dans le Developer Dashboard.

### addons.mozilla.org

| Étape | Où | Détail |
|---|---|---|
| Approbation | environnement GitHub `amo` | relecture obligatoire avant le job `amo` |
| Paquet | job `amo` | `package:firefox` (paquet et archive des sources), `lint:firefox` |
| Soumission | `web-ext sign --channel listed` | avec l'archive des sources (`--upload-source-code`), exigée car le code est assemblé par esbuild ; sans attendre l'approbation (`--approval-timeout 0`) |

AMO n'offre pas de fédération d'identité : les clés d'API (JWT) sont des secrets de l'environnement `amo`, lisibles par ce seul job, une fois approuvé. Elles permettent de publier sur le compte AMO : les régénérer dans le Developer Hub au moindre doute.

## 2. Sécurité

Le code de publication est public ; la sécurité repose sur trois verrous, pas sur sa confidentialité.

- **Condition de confiance** (`infra/main.tf`) : Google ne délivre un jeton qu'à un job de ce dépôt, identifié par son numéro (`repository_id`) et pas seulement par son nom, lancé par un tag `v*` et rattaché à l'environnement `chrome-web-store`. Une pull request, une branche ou un fork n'obtient rien.
- **Côté GitHub** : un ruleset réserve la création, la modification et la suppression des tags `v*` aux administrateurs du dépôt, et les environnements `chrome-web-store` et `amo` exigent une approbation et n'acceptent que les tags `v*`.
- **Côté stores** : chaque version passe la revue de Google ou de Mozilla ; retirer le compte de service du Dashboard, ou révoquer les clés d'API AMO, coupe l'accès.

L'état Terraform (`infra/*.tfstate`) et les valeurs locales (`infra/terraform.tfvars`) ne sont pas versionnés.

## 3. Mise en place

L'extension doit déjà exister sur chaque store : la première publication (fiche, confidentialité, justification des permissions) se fait à la main.

### Chrome Web Store

1. **Google Cloud**, dans un projet existant :
   ```sh
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # renseigner project_id
   terraform init
   terraform apply
   ```
   Les sorties donnent `GCP_WIF_PROVIDER` et `CWS_SERVICE_ACCOUNT`.
2. **Developer Dashboard** du Chrome Web Store, section **Account** : ajouter l'e-mail `CWS_SERVICE_ACCOUNT` (un seul compte de service par éditeur) et relever l'identifiant d'éditeur.
3. **Variables de l'environnement GitHub `chrome-web-store`** :
   ```sh
   gh variable set GCP_WIF_PROVIDER    --env chrome-web-store --body "$(terraform -chdir=infra output -raw GCP_WIF_PROVIDER)"
   gh variable set CWS_SERVICE_ACCOUNT --env chrome-web-store --body "$(terraform -chdir=infra output -raw CWS_SERVICE_ACCOUNT)"
   gh variable set CWS_PUBLISHER_ID    --env chrome-web-store --body "<identifiant d'éditeur>"
   gh variable set CWS_EXTENSION_ID    --env chrome-web-store --body "<identifiant de l'extension>"
   ```

### addons.mozilla.org

1. **Developer Hub**, page « Manage API Keys » : générer un émetteur JWT et un secret JWT.
2. **Secrets de l'environnement GitHub `amo`** (la valeur est demandée sans écho) :
   ```sh
   gh secret set AMO_EMETTEUR_JWT --env amo
   gh secret set AMO_SECRET_JWT   --env amo
   ```

## 4. Publier une version

1. Monter la version (`package.json`, `package-lock.json`) et dater sa section du [CHANGELOG](../../CHANGELOG.md), puis committer.
2. `git tag vX.Y.Z && git push origin main vX.Y.Z`.
3. Approuver les déploiements `chrome-web-store` et `amo` dans l'onglet Actions du dépôt.
4. Suivre les revues dans le Developer Dashboard de Chrome et le Developer Hub d'AMO.
