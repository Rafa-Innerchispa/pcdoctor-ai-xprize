# AI-native operations

## Agent roster

| Agent | Observes | Decides | Produces | Guardrail |
|---|---|---|---|---|
| Intake | new message/transcript | intent, urgency, playbook | normalized case | cannot promise price |
| Discovery | case gaps | minimum questions | discovery checklist | human review for sensitive data |
| Continuity | time and activity history | next best action | follow-up draft/task | outbound blocked by default |
| Scoping | discovery answers | service family and scope | statement-of-work draft | human validates commitments |
| Proposal | approved scope | proposal structure | commercial draft | price approval mandatory |
| Billing | completed work | billable candidate | billing queue item | cannot issue tax invoice |
| Evidence | events and logs | evidence eligibility | redacted manifest entry | human confirms redaction |

## Autonomy levels

- **L0 observe:** read and summarize.
- **L1 recommend:** create next action; no external side effect.
- **L2 prepare:** create draft or queue item; human approves.
- **L3 execute bounded:** execute approved idempotent action.
- **L4 autonomous:** not enabled for Phase 1.

The foundation operates at L1–L2. A later production change may enable L3 for
specific low-risk actions after written acceptance criteria and rollback tests.

## Evaluation metrics

- percentage of opportunities with a next action;
- median time from inbound request to classified case;
- follow-up SLA adherence;
- approval acceptance/edit/rejection rates;
- lead reactivation and conversion;
- billable work captured;
- human minutes saved;
- agent error and retry rates;
- real Gemini calls with complete evidence;
- gross margin after cloud and messaging costs.
