output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "github_deploy_service_account" {
  value = google_service_account.github_deployer.email
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "evidence_bucket" {
  value = google_storage_bucket.evidence.name
}
