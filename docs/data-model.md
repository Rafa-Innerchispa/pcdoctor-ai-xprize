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

### Managed property

Condominium, urbanization, building, or complex administered within one
tenant. It records type, city, address, unit count, onboarding state, assigned
administrator, and synthetic/real status.

### Property system

Critical-system or asset group linked to one managed property: type, name,
condition, quantity, last and next inspection, notes, and evidence references.
Unknown condition remains explicit.

### Property issue

Security, fire safety, coexistence, maintenance, utilities, finance,
collections, governance, supplier, emergency, or other novelty. It records
source, priority, status, owner, due date, and the property boundary.

### Property commitment

Meeting, assembly, inspection, task, deadline, or payment reminder linked to a
property or the authorized tenant-wide portfolio.

## Tenant boundary

No query may return data without a tenant predicate except a platform-owner
administrative query protected by a separate authorization path. Cross-tenant
analytics must use aggregated, de-identified records.

Within the SERVIFRAN tenant, platform/tenant administrators can see the
portfolio. A collaborator can see only a property assigned to or created by
that user. Property-level resident scoping is a later schema addition and is
not simulated by exposing all resident data.
