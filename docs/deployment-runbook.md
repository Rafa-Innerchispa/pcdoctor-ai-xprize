# Deployment runbook

## 1. Prerequisites

- Google Cloud billing account and exact promotional-credit terms;
- globally unique project ID;
- `gcloud`, Docker, Terraform, Node.js 22+, and npm;
- Rafael's approval for spend and production changes;
- GitHub repository variables/secrets listed below.

## 2. Local verification

```bash
npm install
npm run check
```

Run safely:

```bash
npm run dev
```

Default flags block external actions.

## 3. Google Cloud foundation

```bash
gcloud auth application-default login
gcloud projects create YOUR_PROJECT_ID
gcloud billing projects link YOUR_PROJECT_ID --billing-account YOUR_BILLING_ACCOUNT
cd infrastructure/terraform
terraform init
terraform plan -var="project_id=YOUR_PROJECT_ID" -var="github_repository=Rafa-Innerchispa/pcdoctor-ai-xprize"
terraform apply
```

Review the plan before applying. Project creation and billing linkage may be
performed outside Terraform to avoid accidental project lifecycle changes.

## 4. Secrets

Generate the admin key locally and add a Secret Manager version:

```bash
openssl rand -base64 36
printf '%s' 'VALUE_FROM_PREVIOUS_COMMAND' | gcloud secrets versions add fieldspark-api-admin-key --data-file=-
```

Never paste the key into a tracked file or terminal recording.

## 5. GitHub deployment variables

Repository variables:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

The manual workflow builds immutable images in Artifact Registry and deploys
them to Cloud Run.

## 6. First Gemini evidence call

Authenticate, retrieve the API URL, and use the admin key without writing it to
disk:

```bash
gcloud auth application-default login
gcloud run services proxy fieldspark-api --region YOUR_REGION --port 8080
curl -X POST http://localhost:8080/v1/gemini/verify -H "x-admin-key: $API_ADMIN_KEY"
```

Verify:

- response says `synthetic: false`;
- event name is `gemini_analysis_completed`;
- model and request reference are present;
- a matching structured entry exists in Cloud Logging;
- no secret or personal data is visible.

Export a redacted record and register it in the evidence manifest.

## 7. Promotion

Staging remains outbound-blocked. Production starts in shadow mode. Enabling
WhatsApp or invoicing requires a separate approved change, idempotency tests,
rollback procedure, customer consent, and monitoring.

## 8. Rollback

Cloud Run revisions are immutable. Route traffic to the last known-good revision
and set safety flags to false. Do not delete failed-revision logs; preserve them
as operational evidence.
