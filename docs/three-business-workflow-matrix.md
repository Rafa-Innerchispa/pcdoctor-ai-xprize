# Four-business workflow matrix

FieldSpark uses one tenant-safe case engine with a different operational
playbook for each company. Shared controls are implemented once; business
language and required evidence change by playbook.

| Control point | PC Doctor | IAPRO S.A.S. | Photography studio | SERVIFRAN |
|---|---|---|---|---|
| Intake | Request, device, site, media | Problem, organization, objective | Session, date, occasion | Community, reporter, source, evidence |
| Ecuador identity | Cédula/RUC checksum; optional authorized registry | RUC and legal name before proposal | Billing identity before collection | Owner, resident, supplier, or counterparty |
| Discovery | Inspection and diagnosis | Process, volume, cost, risk, owners | Attendees, location, style, deliverables | Safety, coexistence, maintenance, finance, governance |
| Commercial document | Parts, labor, alternatives, warranty | Scope, milestones, assumptions, ROI | Package, extras, deposit, conditions | Alternatives, supplier, budget, authority, deadline |
| Approval | Internal review and customer acceptance | Internal review and customer acceptance | Booking and deposit approval | Administrator, board, or assembly according to authority |
| Delivery | Technician assignment, repair, test, handoff | Project milestones and deliverables | Session, selection and delivery | Assignment, execution, evidence, verification |
| Billing | Prepare billable detail; no automatic issue | Prepare milestone billing | Remind what remains billable | Prepare expense/billable item; no automatic payment |
| Continuity | Warranty and preventive follow-up | KPI review and next improvement | Consented promotion and anniversary follow-up | Inspection, warranty, commitment, and portfolio risk |

## Reuse declaration

The Ecuador checksum rules, authorized-registry boundary, token cache, timeout
pattern, and customer deduplication concepts were adapted from the pre-existing
PC Doctor QuoteOps work on server `1.4`. FieldSpark has a separate TypeScript
implementation, configuration, persistence boundary, permissions, and tests.
No source-tree copy or production database write was performed.

The server-side public SRI catalog adapter was reviewed but not copied into the
runtime path because it downloads a complete provincial ZIP for a single
lookup. FieldSpark instead performs an immediate local checksum and supports an
optional authorized provider configured through Secret Manager.

## Safety invariants

- A case cannot skip identity, discovery, quote approval, service, or billing
  preparation.
- A collaborator without `quotes.approve` cannot approve a quote.
- A customer can only list cases linked to that customer's user ID.
- Looking up a case through another tenant returns no data.
- Outbound messages and electronic invoice issuance remain false in every
  tested journey.
- Synthetic journeys never call clients or an external tax provider.
