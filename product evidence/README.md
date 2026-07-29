# Product evidence

This directory is the evidence index for FieldSpark AI.

Only **redacted, judge-safe** artifacts may be committed. Originals containing
customer data, bank details, tax identifiers, signatures, phone numbers,
credentials, raw media, or confidential contracts belong in `private/`, which
is ignored by Git.

## Evidence standard

Every artifact must have a row in `manifest.csv` with:

- stable evidence ID;
- capture timestamp and environment;
- source system;
- claim supported;
- customer consent status;
- redaction reviewer;
- SHA-256 hash of the reviewed artifact;
- related commit/deployment/model/request reference;
- public/private status.

Screenshots of demo data must visibly say **synthetic**. A demo event cannot be
used as proof of production Gemini usage, customers, or revenue.

## Directories

- `agent-logs/` — redacted application audit events.
- `api-usage/` — real Gemini request references and usage metadata.
- `billing-evidence-redacted/` — judge-safe invoice/payment copies.
- `cloud-logs/` — redacted Cloud Logging exports.
- `customer-workflows/` — consented before/after process evidence.
- `financial/` — P&L and reconciliation templates/exports.
- `screenshots/` — labelled UI and cloud screenshots.
- `testimonials/` — approved customer statements.
- `private/` — local/encrypted originals, never tracked.
- `raw/` — transient unreviewed exports, never tracked.

## Review gate

An artifact moves from private/raw to a tracked folder only after:

1. source authenticity is checked;
2. customer consent is checked;
3. secrets and identifiers are redacted;
4. environment and timestamp are visible;
5. hash and manifest entry are created;
6. a second person reviews high-risk financial/customer evidence.
