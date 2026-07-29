# Google Cloud foundation

This module enables APIs and provisions Artifact Registry, Firestore, a private
versioned evidence bucket, BigQuery dataset, secrets without secret versions,
least-privilege service accounts, GitHub Workload Identity Federation, and an
optional budget.

It intentionally does not create the project, link billing, add secret values,
or deploy Cloud Run images. Those steps require explicit billing/secret
decisions and are performed by the deployment runbook.

```bash
terraform init \
  -backend-config="bucket=YOUR_PROJECT_ID-tfstate" \
  -backend-config="prefix=foundation"
terraform fmt -check
terraform validate
terraform plan -var="project_id=YOUR_PROJECT_ID"
```

Create the private, versioned state bucket before `terraform init`. The Google
provider charges administrative requests to `project_id`, so local and CI
credentials do not silently depend on an unrelated quota project.

Never commit `terraform.tfvars`, state, plans, or billing account identifiers.
