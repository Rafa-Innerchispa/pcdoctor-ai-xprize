# Pricing and unit economics

## Pilot offers

| Offer | Setup | Monthly | Included |
|---|---:|---:|---|
| Studio Continuity | USD 300 | USD 69 | contact import, continuity dashboard, follow-up drafts, billing queue |
| IAPRO Opportunity Desk | USD 400 | USD 99 | 18-service intake, discovery, scope drafts, proposal follow-up |

Excluded: Meta/WhatsApp charges, exceptional onboarding/cleanup, gallery
storage, archive transfer, electronic invoicing provider costs, taxes, and
custom integrations.

## Cost model

Monthly COGS must record:

- Cloud Run CPU/memory/request cost;
- Compute Engine Evolution VM and persistent disk;
- Firestore reads/writes/storage;
- Gemini input and output tokens, provider, model, and any applied credits;
- Artifact Registry and network egress;
- Meta/WhatsApp conversation charges;
- support and onboarding time;
- third-party invoicing or lookup APIs.

Credits reduce cash expenditure but do not make the service permanently free.
Report both gross cloud usage and credits applied when evidence is available.

## Controlled Gemini benchmark

Staging records the following for every completed real request:

- tenant and model;
- input and billable output tokens;
- estimated list-price cost;
- response latency;
- request reference and approval state.

The protected `GET /v1/ai/usage` endpoint aggregates the latest audit-event
window by tenant. For Gemini 3.5 Flash-Lite, the configured July 2026 list
prices are USD 0.30 per million input tokens and USD 2.50 per million output
tokens.

The first pricing sample must not become the subscription price by itself.
Estimate monthly AI COGS as:

`requests per month × measured average Gemini cost per request`

Then add Cloud Run, Firestore, messaging, storage, support, payment processing,
tax, and a safety margin. Keep gross usage visible even when prepaid or
promotional credits reduce the current cash expense.

## Guardrails

- Promotional credits must not justify a price that becomes unprofitable after
  expiry.
- Storage-heavy gallery pricing requires a separate capacity model.
- No forecast is recorded as revenue.
- Revenue is recognized only according to PC Doctor's accounting policy and
  supported by real documents.
