# FieldSpark AI

AI-operated customer continuity and lead-to-cash software for service businesses.

FieldSpark AI is the product of **PC Doctor AI**, a new business unit operated by
PC Doctor, Ecuador. It is being built for the Build with Gemini XPRIZE 2026 and
uses Gemini on Vertex AI plus Google Cloud.

> Current state: deployed staging foundation. The repository contains a working
> demo, auditable agent events, infrastructure as code, 20 synthetic test
> contacts, and verified evidence of a real Gemini staging call. It does **not**
> claim production revenue or real customer activity.

## What the product does

FieldSpark gives each service business a configurable AI operating playbook:

- captures requests from WhatsApp, forms, audio, photos, or spreadsheets;
- classifies intent, urgency, service, and missing information;
- proposes the next best action and a scoped response;
- queues sensitive actions for human approval;
- follows opportunities through delivery, invoicing, and payment;
- records every material AI and human decision in an auditable event log.

The first two playbooks are:

1. **Photography Studio** — contact reactivation, campaign follow-up, session
   continuity, and a billing queue.
2. **IAPRO S.A.S.** — consulting intake, classification across 18 service
   families, discovery questions, scope generation, proposal preparation, and
   follow-up.

No photo archive migration is included in the initial release. Customer media
remains in the studio's local storage; a cloud gallery is explicitly Phase 2.

## Repository map

```text
apps/web                 React/Vite executive dashboard and agent control room
apps/api                 Fastify API, Gemini adapter, audit event log
packages/contracts       Shared TypeScript contracts and event taxonomy
infrastructure/terraform Google Cloud foundation
infrastructure/evolution Evolution API deployment blueprint
docs                     Product, architecture, compliance, playbooks, runbooks
product evidence         Redacted evidence index and collection templates
```

## Run locally

Requirements: Node.js 22+, npm 10+, and optionally Google Cloud CLI for a real
Vertex AI call.

```bash
npm install
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:8080`
- Health: `http://localhost:8080/health`

The default is safe demo mode. It uses synthetic records, blocks outbound
messages, blocks invoicing, and does not call Gemini.

Copy `.env.example` values into your local environment only when needed. Never
commit credentials.

## Test contacts

The versioned seed contains 10 photography-studio contacts and 10 IAPRO
contacts. Every record is visibly synthetic, uses an `example.invalid` email,
has an unroutable test phone, and sets `outboundAllowed=false`.

- `GET /v1/demo/contacts` — JSON list; filter with `tenantId` or `playbook`.
- `GET /v1/demo/contacts.csv` — Excel-compatible export.
- `POST /v1/demo/contacts/seed` — idempotent Firestore seed; admin key required.
- `GET /v1/demo/contacts/seed-status` — persisted counts; admin key required.

These records may exercise import, segmentation, follow-up, approval, and
billing-review flows. They must never be represented as real customers.

## Verify

```bash
npm run typecheck
npm test
npm run build
```

## Make the first real Gemini call

1. Create or select a dedicated Google Cloud project.
2. Enable Vertex AI and authenticate with Application Default Credentials.
3. Set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and
   `GOOGLE_GENAI_USE_VERTEXAI=true`.
4. Set `DEMO_MODE=false` and a strong `API_ADMIN_KEY`.
5. Run the API and call `POST /v1/gemini/verify` with `x-admin-key`.
6. Export the returned redacted event and corresponding Cloud Logging entry to
   `product evidence/api-usage/`.

Full instructions are in [the deployment runbook](docs/deployment-runbook.md).

## Safety boundary

The following are disabled by default and require Rafael's explicit approval:

- contacting real customers;
- sending WhatsApp messages;
- issuing invoices or collecting payments;
- publishing unredacted customer evidence;
- submitting the final Devpost entry.

See [AGENTS.md](AGENTS.md) for permanent implementation rules and
[docs/source-of-truth.md](docs/source-of-truth.md) for the authoritative project
context.
