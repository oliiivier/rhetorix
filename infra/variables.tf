variable "project_id" {
  description = "Projet Google Cloud qui porte l'API Chrome Web Store et le compte de service."
  type        = string
}

variable "github_repository" {
  description = "Dépôt GitHub autorisé à publier, au format propriétaire/nom."
  type        = string
  default     = "oliiivier/rhetorix"
}

variable "github_repository_id" {
  description = "Identifiant numérique du dépôt (gh api repos/OWNER/REPO --jq .id) : un dépôt recréé sous le même nom n'a pas le même."
  type        = string
  default     = "1402736763"
}

variable "github_environment" {
  description = "Environnement GitHub protégé dont le job de publication dépend."
  type        = string
  default     = "chrome-web-store"
}
