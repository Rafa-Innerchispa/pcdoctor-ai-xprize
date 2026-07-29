# IAPRO S.A.S. playbook

Status: company/service information captured; commercial acceptance and real
usage not yet recorded in this repository.

## Business

IAPRO integrates administration, finance, operations, process engineering,
automation, technology, risk, security, and training for organizations in
Ecuador and Latin America.

## Eighteen service families

1. Gestión administrativa integral
2. Optimización financiera
3. Automatización de procesos
4. Ingeniería de procesos
5. Gestión operativa
6. Gestión de mantenimiento
7. Ingeniería técnica
8. Gestión de riesgos
9. Valoración de automatización
10. Consultoría tecnológica
11. Protección de datos
12. Seguridad integral
13. Gestión de cartera
14. Manuales organizacionales
15. Gestión de proyectos
16. Auditoría operativa
17. Inteligencia empresarial
18. Capacitación empresarial

## Workflow

```mermaid
flowchart LR
  I["Document, audio, photo or message"] --> C["Gemini classification"]
  C --> Q["Discovery questions"]
  Q --> D["Diagnostic hypothesis"]
  D --> S["Scope and deliverables"]
  S --> A["Human technical/price approval"]
  A --> P["Proposal draft"]
  P --> F["Follow-up"]
  F --> K["Kickoff / billing queue"]
```

## Classification output

- primary and secondary service family;
- sector;
- problem statement;
- urgency;
- stakeholders;
- missing information;
- operational/financial/risk hypothesis;
- recommended discovery method;
- next best action;
- confidence and ambiguity.

## Guardrails

- do not claim legal, privacy, engineering, safety, or financial compliance;
- do not provide a signed technical conclusion without qualified review;
- do not calculate or promise final ROI from incomplete information;
- do not disclose other tenants' methods or data;
- no proposal leaves the system without human scope and price approval.

## Success metrics

- request-to-classification time;
- discovery completeness;
- opportunities assigned to the correct service family;
- proposal preparation time;
- proposal acceptance and cycle time;
- scope edits by consultants;
- revenue and margin by service family.
