# Pre-existing asset inventory

This inventory distinguishes historical assets from hackathon work.

| Asset | Approximate origin | Owner | Prior use | FieldSpark reuse | New adaptation |
|---|---|---|---|---|---|
| PC Doctor field-service knowledge | pre-2026 | PC Doctor | CCTV, alarms, fire, networks, support | domain vocabulary and operational review | encoded playbook and audit controls |
| Local servers | pre-2026 | PC Doctor | internal workloads | development/integration only | no production dependency |
| n8n flows | pre-2026 | PC Doctor | generic automation | reference patterns where reliable | tenant-safe, evidenced workflows |
| QuoteOps Ecuador identity boundary | pre-2026 | PC Doctor | cédula/RUC checksum, authorized registry adapter, customer reconciliation | adapted pattern, independently implemented | local checksum, optional secret-backed registry lookup, tenant-safe case identity |
| Inspection/cotation forms | pre-2026 | PC Doctor | service operations | discovery field reference | AI-normalized intake and approvals |
| RalphiIA / Maestro / QuoteOps / FounderOS | pre-2026 | PC Doctor | internal orchestration concepts | optional generic components | explicit adapter, no legacy claims |
| Evolution API deployment | pre-2026 | PC Doctor | WhatsApp integration testing | deployment knowledge | cloud-isolated, multi-tenant controls |
| Docker patterns | pre-2026 | PC Doctor | application packaging | build foundation | dedicated images and CI |
| Contacts and market knowledge | pre-2026 | PC Doctor | business relationships | lawful pilot acquisition | consent, new offer and new pricing |

New work includes PC Doctor AI, FieldSpark AI, this repository, its frontend and
API, the dedicated Google Cloud project, Gemini adapter, product playbooks,
event taxonomy, evidence system, pilot pricing, P&L, and competition materials.

Each reused code component must be added to this table with its original
repository, license, last pre-hackathon commit, and new FieldSpark commit before
it is merged.
