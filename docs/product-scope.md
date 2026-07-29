# Product scope

## Product promise

FieldSpark protects continuity between the first customer request and collected
revenue. It observes an opportunity, determines the next best action, prepares
the work, asks for human judgment where appropriate, and records the outcome.

## Why this is not another CRM

A CRM stores records and asks a person to decide what to do. FieldSpark uses
tenant playbooks and agents to:

- interpret unstructured requests;
- detect missing context;
- decide which workflow should start;
- prepare a response, scope, or billing item;
- monitor deadlines and stalled opportunities;
- escalate only the decisions requiring human judgment;
- emit evidence for each decision.

The CRM-shaped screens are the control surface, not the product's intelligence.

## Phase 1 capabilities

| Capability | AI responsibility | Human responsibility |
|---|---|---|
| Intake | classify intent, urgency, service and gaps | correct unusual classifications |
| Discovery | select questions from the tenant playbook | approve sensitive questions |
| Continuity | detect stale opportunities and propose next action | approve outbound contact |
| Scoping | organize findings and draft scope | validate commitments and pricing |
| Billing queue | identify completed billable work | issue legal invoice |
| Evidence | log model, decision, latency and approval state | confirm/redact exports |

## Acceptance criteria

The foundation is accepted when:

- the demo UI builds and runs;
- API tests pass;
- default mode is synthetic and blocks outbound/invoicing;
- one controlled endpoint can make a real Gemini-on-Vertex call;
- the call produces a redacted audit event;
- Terraform describes the required Google Cloud resources;
- CI validates the repository;
- evidence directories and templates exist;
- no secrets or private customer data are tracked.

Production readiness additionally requires completed items in
`docs/production-readiness-checklist.md`.
