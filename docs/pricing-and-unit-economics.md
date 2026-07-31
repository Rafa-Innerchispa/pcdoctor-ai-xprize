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

### Initial synthetic result — 2026-07-30

The first controlled prepaid sample completed 15 metered requests across the
four staging tenants:

| Tenant | Requests | Estimated Gemini cost | Projected per 1,000 similar requests |
|---|---:|---:|---:|
| PC Doctor | 5 | USD 0.0027329 | USD 0.54658 |
| IAPRO | 5 | USD 0.0030659 | USD 0.61318 |
| Photography studio | 3 | USD 0.0013946 | USD 0.46487 |
| SERVIFRAN | 2 | USD 0.0008382 | USD 0.41910 |
| **Total / blended** | **15** | **USD 0.0080316** | **USD 0.53544** |

Average latency was approximately 0.95–1.15 seconds. This sample covers short
structured intake only. Audio transcription, long documents, multimodal
inspection, search grounding, and agentic loops require separate benchmarks
before they are included in a subscription.

### Initial technical-inspection result — 2026-07-31

A deployed acceptance test sent a synthetic electric-fence narrative through
the production-configured inspection endpoint. Gemini produced two findings
and four missing-information questions from 165 input and 354 output tokens.
The estimated list-price AI cost was **USD 0.0009345** for that call. The
server then calculated a two-line synthetic quote at USD 100.00 subtotal,
USD 15.00 VAT, and USD 115.00 total without giving Gemini control over prices
or tax calculations.

At the same measured profile, 1,000 text-only inspection analyses would have
an estimated Gemini list-price cost of approximately **USD 0.9345**. This is
not a photo, audio, long-document, internet-search, storage, messaging, or
support benchmark; each of those components must be measured separately
before setting final subscription allowances.

## Guardrails

- Promotional credits must not justify a price that becomes unprofitable after
  expiry.
- Storage-heavy gallery pricing requires a separate capacity model.
- No forecast is recorded as revenue.
- Revenue is recognized only according to PC Doctor's accounting policy and
  supported by real documents.
