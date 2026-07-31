# Competition compliance matrix

This is an internal working matrix, not legal advice. Revalidate every row
against the official rules immediately before submission.

| Requirement | Implementation/evidence | State |
|---|---|---|
| new project/business after 2026-05-19 | PC Doctor AI decision record and repository history | in progress |
| small organization | employee-count attestation | evidence needed |
| Google Cloud product | Cloud Run, Firestore, Logging, Secret Manager | designed |
| Gemini API call in deployed app | `/v1/gemini/verify` on Cloud Run | real Vertex call verified; prepaid adapter measurement in progress |
| AI operates key decisions | intake/continuity/scoping decision events | demo complete, production needed |
| real users/customers | consented pilot usage | needed |
| real revenue | invoice, payment, bank evidence, P&L | needed; never fabricate |
| repository | this repository and commit history | complete |
| product evidence | exact tracked folder and manifest | foundation complete |
| public demo video under 3 minutes | script and shot list | production needed |
| English narrative | submission draft | needed |
| free judge access | test user and runbook | needed |
| costs and P&L | token/cost audit events, `/v1/ai/usage`, and cloud export | measurement deployed in progress |

## Claims policy

Use these labels:

- **implemented:** code exists and automated checks pass;
- **deployed:** named Google Cloud revision and URL exist;
- **verified:** dated evidence and reproduction steps exist;
- **production:** consented real user completed the action;
- **paid:** valid invoice/payment/bank evidence exists.

Never substitute one label for another.
