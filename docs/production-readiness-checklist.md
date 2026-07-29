# Production readiness checklist

## Identity and access

- [ ] Identity Platform/Firebase Auth configured
- [ ] roles and tenant membership enforced server-side
- [ ] admin key replaced by operator identity for routine use
- [ ] least-privilege service accounts reviewed
- [ ] break-glass account documented and tested

## Data

- [ ] data-processing terms accepted
- [ ] customer consent and suppression policy recorded
- [ ] Firestore indexes deployed
- [ ] backup, restore, retention, and deletion tests passed
- [ ] structured redaction tests expanded
- [ ] real data import reconciled and signed off

## Agents

- [ ] golden evaluation set approved
- [ ] precision/recall or task-specific quality threshold met
- [ ] prompt/model version recorded
- [ ] cost and latency limits configured
- [ ] fallbacks and retries tested
- [ ] human approval cannot be bypassed

## Integrations

- [ ] WhatsApp provider and terms approved
- [ ] idempotency and deduplication tested
- [ ] rate limits and opt-out handling verified
- [ ] invoicing remains disabled or separately certified

## Operations

- [ ] budget and anomaly alerts configured
- [ ] uptime, error, latency, and queue alerts configured
- [ ] incident contacts and escalation documented
- [ ] restore and Cloud Run rollback rehearsed
- [ ] customer support hours and SLA defined

## Evidence

- [ ] environment labels visible
- [ ] first real Gemini call captured
- [ ] customer consent for judging captured
- [ ] invoice/payment evidence reconciled
- [ ] public evidence redacted by two-person review
- [ ] judge account tested without privileged access
