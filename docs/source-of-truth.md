# Source of truth

Last updated: 2026-07-29

Decision owner: Rafael

Implementation owner: PC Doctor

Status: foundation

## Identity

- Participating and invoicing entity: **PC Doctor, Ecuador**.
- New business unit: **PC Doctor AI**.
- Product: **FieldSpark AI**.
- Program: Build with Gemini XPRIZE 2026.
- Primary category: Small Business Services.
- Deadline recorded by the team: 2026-08-17 13:00 PDT.

PC Doctor predates the competition. The submitted business is the new,
AI-native PC Doctor AI unit and its FieldSpark AI product. Historical PC Doctor
revenue, activity, and customers must not be presented as FieldSpark activity.

## Product decision

FieldSpark AI is an AI-operated customer continuity and lead-to-cash system for
service SMBs. It is not a generic CRM. It supplies:

- a shared, auditable agent runtime;
- tenant-specific business playbooks;
- a next-action queue;
- human approval controls;
- commercial and operational evidence.

The initial customers under evaluation are independent businesses:

1. IAPRO S.A.S., operated by Andrés. Friendship with Rafael is disclosed, but
   there is no common ownership, control, prior service, or shared commercial
   operation according to information supplied as of this date.
2. A photography studio with approximately 2,000 WhatsApp contacts and
   spreadsheet-based operating information.
3. SERVIFRAN - Servicios Inmobiliarios, identified in authorized internal
   sources as a Guayaquil lead for administration of buildings and
   urbanizations. Legal name, RUC, contact channels, managed communities, and
   commercial acceptance remain unconfirmed.

No customer is counted as active, paying, or contracted until documentary
evidence exists.

## Closed scope

Initial release:

- optional consent-gated contact import from CSV, TSV, or delimited text, with
  a supported path to start from an empty workspace;
- intake from normalized message or transcript;
- customer and opportunity continuity;
- Gemini classification and next-action recommendation;
- consulting and photography playbooks;
- human approval inbox;
- event log;
- billing work queue, not tax invoice issuance;
- SERVIFRAN managed-property portfolio, critical-system inventory, issues,
  commitments, and grounded brief;
- guarded multimodal technical inspection drafts from voice, photos, PDF, Word,
  or text;
- sober printable technical reports and itemized quote drafts with tenant-level
  branding, configurable VAT, and deterministic totals;
- approval-bound email and WhatsApp delivery drafts, without automatic send;
- executive dashboard and evidence mode;
- Google Cloud deployment blueprint.

Phase 2:

- customer gallery;
- controlled delivery of current/final photo galleries;
- optional on-premise connector;
- direct Ecuadorian electronic invoicing;
- deeper WhatsApp campaign execution.

Explicitly excluded from the initial release:

- migration of the studio's approximately 8 TB media archive;
- storage of the full photo/video archive in the subscription;
- autonomous pricing;
- unapproved customer messaging;
- automatic tax invoicing;
- fabricated demonstrations represented as production.

## Commercial hypothesis

The current working prices, subject to written customer acceptance:

| Customer | Implementation | Monthly subscription | Excluded variable costs |
|---|---:|---:|---|
| Photography studio | USD 300 | USD 69 | WhatsApp/Meta usage, gallery storage, electronic invoicing |
| IAPRO S.A.S. | USD 400 | USD 99 | WhatsApp/Meta usage, custom integrations, document storage |

Potential initial contracted value: USD 868. This is a projection, not revenue.

## Technical decision

- Canonical source: `Rafa-Innerchispa/pcdoctor-ai-xprize`.
- Local development and testing are allowed.
- Production runtime must be Google Cloud, not an unreliable local server.
- Web and API deploy to Cloud Run.
- Gemini is called server-side through a provider adapter using `@google/genai`.
  Controlled staging uses the Gemini Developer API prepaid plan so usage stops
  when prepaid funds or the project cap are exhausted. Vertex AI through
  Application Default Credentials remains supported for later production use
  when its billing source is explicitly approved.
- Firestore stores operational records and audit events.
- Evolution API, PostgreSQL, and Redis run on a dedicated Compute Engine VM when
  approved; local Evolution instances are not production dependencies.
- Studio photos remain on its local servers in Phase 1.

## Evidence rule

The distinction between `synthetic`, `staging`, and `production` must be visible
in every screenshot, log, dataset, and narrative. Evidence is real only when its
source, timestamp, consent, and redaction status are recorded in
`product evidence/manifest.csv`.

Any change to entity, ownership, product name, pricing, architecture, evidence
policy, or scope requires a new ADR and a decision-log entry.
