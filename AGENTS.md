# FieldSpark AI repository instructions

These instructions apply to every contributor and coding agent.

## Source of truth

Read these files before changing product behavior:

1. `docs/source-of-truth.md`
2. `docs/product-scope.md`
3. `docs/architecture.md`
4. `docs/compliance-matrix.md`
5. the relevant file under `docs/playbooks/`

Do not silently overwrite a closed decision. Add an ADR under `docs/adr/` and
update `docs/decision-log.md`.

## Non-negotiable safety rules

- Never fabricate revenue, users, Gemini calls, logs, testimonials, invoices,
  payments, dates, or customer evidence.
- Never commit credentials, tokens, WhatsApp sessions, customer identifiers,
  raw audio, private photos, bank records, or unredacted evidence.
- Keep `DEMO_MODE=true`, `OUTBOUND_ENABLED=false`, and
  `INVOICING_ENABLED=false` unless Rafael explicitly approves a controlled
  environment change.
- No customer contact, invoice issuance, payment action, final Devpost
  submission, or accounting change without Rafael's explicit approval.
- Human approval is mandatory for pricing, customer-facing proposals,
  outbound campaigns, invoicing, and high-impact recommendations.
- Public evidence must be redacted and copied only to tracked public folders.
  Private evidence stays in the ignored `product evidence/private/` directory
  or an approved encrypted store.

## Engineering rules

- Use Node.js 22+ and npm workspaces.
- Preserve tenant isolation on every business record and audit event.
- Every material agent action must emit the canonical event schema from
  `@fieldspark/contracts`.
- Prefer structured logs to free-form console output.
- Use Application Default Credentials on Google Cloud; never embed service
  account JSON.
- Keep provider integration behind adapters so demo mode remains deterministic.
- All outbound integrations must be idempotent, retry-aware, and disabled by
  default.

## Required verification

Before publishing a change:

```bash
npm run typecheck
npm test
npm run build
npm run check:secrets
```

Update documentation and the evidence manifest when a change affects
architecture, compliance, metrics, deployment, or the demo flow.
