# Security, privacy, and consent

## Data minimization

Only collect information required to progress a case. The foundation redacts
emails, Ecuadorian identifier-like numbers, and phone numbers from public audit
summaries. Production needs stronger structured-field redaction and tests.

## Customer consent

Before importing or contacting a real contact:

- identify the tenant's lawful basis and customer consent status;
- record source and collection date;
- respect opt-out and suppression lists;
- avoid promotional messaging without documented permission;
- approve message copy and frequency;
- retain evidence of consent privately.

Before sharing a customer's identity or activity with judges, obtain written,
specific permission. Prefer redacted evidence even with permission.

## Secret handling

- GitHub contains templates only.
- Cloud Run receives secrets from Secret Manager.
- GitHub Actions uses Workload Identity Federation.
- Evolution credentials and sessions stay on encrypted persistent disks.
- No credential is pasted into screenshots or evidence.

## Incident minimum

Stop outbound operations, rotate affected credentials, preserve relevant audit
logs, identify tenants and records affected, notify Rafael, and document the
timeline. Legal notification duties must be assessed with qualified Ecuadorian
counsel.
