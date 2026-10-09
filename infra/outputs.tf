# Valeurs à reporter dans les variables de l'environnement GitHub chrome-web-store.

output "GCP_WIF_PROVIDER" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "CWS_SERVICE_ACCOUNT" {
  description = "À ajouter aussi dans le Developer Dashboard du Chrome Web Store, section Account."
  value       = google_service_account.cws_publisher.email
}
