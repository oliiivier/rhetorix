# Publication automatique sur le Chrome Web Store depuis GitHub Actions, sans clé :
# le workflow échange son jeton OIDC contre un jeton du compte de service (Workload
# Identity Federation). Voir docs/techniques/publication.md.
#
# Le compte de service n'a aucun rôle IAM sur le projet : son droit de publier vient
# uniquement de son ajout dans le Developer Dashboard du store (étape manuelle).

resource "google_project_service" "apis" {
  for_each = toset([
    "chromewebstore.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com", # jeton d'accès du compte de service
    "sts.googleapis.com",            # échange du jeton OIDC de GitHub
  ])
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "cws_publisher" {
  account_id   = "cws-publisher"
  display_name = "Publication Chrome Web Store (GitHub Actions)"
  depends_on   = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository"    = "assertion.repository"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
    "attribute.environment"   = "assertion.environment"
  }

  # Seul un job de l'environnement protégé, lancé par un tag v* de ce dépôt (identifié
  # par son numéro, pas seulement par son nom), obtient un jeton.
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository == '${var.github_repository}'",
    "assertion.ref.startsWith('refs/tags/v')",
    "assertion.environment == '${var.github_environment}'",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.cws_publisher.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}
