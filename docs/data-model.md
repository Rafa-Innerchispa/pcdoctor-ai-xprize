# Data model

Every business entity carries `tenantId`, `createdAt`, `updatedAt`, `source`, and
an explicit `environment`.

## Core records

### Tenant

`id`, legal name, display name, plan, playbook IDs, channels, time zone, consent
policy, feature flags, billing status.

### Customer and contact

Customer is the commercial account. Contact is a person or channel identity.
Phone, email, tax identifier, and consent fields are private and never copied
into public evidence.

### Case

`id`, tenant, customer, contact, channel, playbook, intent, service family,
urgency, status, owner, next action, due date, confidence, and approval state.

### Activity

Inbound or outbound interaction with direction, channel, normalized content,
media references, consent basis, and delivery status.

### Approval

Action type, proposed payload hash, requesting agent, reviewer, decision,
timestamp, reason, and expiry. Editing a payload invalidates its approval.

### Quote and billing item

Draft commercial scope and completed billable work. A billing item is not an
Ecuadorian tax invoice. Issuance remains outside Phase 1.

### Audit event

The canonical schema is enforced in `packages/contracts/src/index.ts`. Events
are append-only. Corrections create new events; they do not rewrite history.

## Tenant boundary

No query may return data without a tenant predicate except a platform-owner
administrative query protected by a separate authorization path. Cross-tenant
analytics must use aggregated, de-identified records.
