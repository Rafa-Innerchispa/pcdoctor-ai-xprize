variable "project_id" {
  description = "Existing Google Cloud project ID dedicated to FieldSpark."
  type        = string
}

variable "region" {
  description = "Primary Cloud Run and Artifact Registry region."
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "Firestore database location."
  type        = string
  default     = "nam5"
}

variable "evidence_bucket_location" {
  description = "Cloud Storage location for private product evidence."
  type        = string
  default     = "US"
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to deploy."
  type        = string
  default     = "Rafa-Innerchispa/pcdoctor-ai-xprize"
}

variable "billing_account_id" {
  description = "Optional billing account ID for a budget. Keep out of committed tfvars."
  type        = string
  default     = ""
  sensitive   = true
}

variable "monthly_budget_usd" {
  description = "Monthly budget threshold."
  type        = number
  default     = 25
}
