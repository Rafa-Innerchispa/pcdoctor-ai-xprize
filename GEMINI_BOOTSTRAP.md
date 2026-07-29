# Gemini implementation brief

Gemini or another coding agent must read `AGENTS.md` and all documents referenced
there before changing code.

## Current assignment boundary

Improve one explicitly assigned issue at a time. Work on a feature branch. Do
not redesign the product, change the entity/pricing/scope, enable outbound
actions, add real customer data, issue invoices, create evidence, deploy to
production, or submit to Devpost.

## Foundation expectations

- preserve the npm monorepo;
- keep React/Vite and Fastify services separately deployable;
- use `@google/genai` server-side with Vertex AI;
- emit canonical audit events;
- keep deterministic demo mode;
- keep all safety flags false by default;
- add tests for every decision or integration boundary;
- document material decisions through ADRs;
- never commit credentials.

## Recommended first tasks

1. Add operator authentication and tenant RBAC.
2. Implement Firestore repositories for customers, cases, approvals, and
   billing items.
3. Implement payload-hash approvals and idempotency.
4. Connect the web dashboard to read-only API endpoints with graceful demo
   fallback.
5. Create a golden evaluation set using synthetic requests for both playbooks.

Each task must finish with `npm run check` and a concise evidence-oriented PR.
