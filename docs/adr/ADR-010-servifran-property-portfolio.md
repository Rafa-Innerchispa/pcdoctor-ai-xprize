# ADR-010: SERVIFRAN portfolio with isolated community workspaces

Date: 2026-07-30

Status: accepted

## Context

SERVIFRAN is recorded in the authorized PC Doctor and Notion sources as a
Guayaquil lead that administers buildings and urbanizations. The internal
project note proposed modular, white-label systems deployed per urbanization.
Rafael additionally requires SERVIFRAN management to have one central place for
cross-property questions, meetings, risks, communications, and follow-up.

The legal identity, RUC, contact email, contracted properties, and commercial
acceptance have not been confirmed for FieldSpark. No person is created as a
user from an address-book match alone.

## Decision

Add SERVIFRAN as a fourth, staging-only tenant with the
`condominium_management` playbook.

Model the product as two simultaneous boundaries:

1. each condominium, building, or urbanization is a managed-property workspace
   with its assigned administrator, systems, issues, commitments, and records;
2. authorized SERVIFRAN administrators receive a grounded portfolio brief
   across the properties they are allowed to see.

Property administrators are collaborators. Platform owners and tenant
administrators can see the complete SERVIFRAN portfolio; collaborators only see
properties assigned to or created by them. Tenant isolation remains mandatory.

Email, WhatsApp, invoicing, payments, sanctions, access-control actuation, and
emergency dispatch remain disabled until their own controlled workflows,
permissions, consent, and human approvals exist.

## Consequences

- The shared case engine gains a fourth business playbook.
- Firestore gains managed properties, property systems, property issues, and
  property commitments.
- The web gains a portfolio control surface and safe synthetic-data forms.
- The portfolio brief is deterministic and grounded. Gemini may consume it
  later, but the initial endpoint does not fabricate narrative answers.
- SERVIFRAN is not counted as a customer, user, contract, or revenue source
  until real evidence exists.

## Reconciliation with the earlier modular proposal

Central control does not require one shared resident database. The product
keeps logical property workspaces separate and composes only authorized data
into the executive brief. This preserves the modular, replicable deployment
idea while supplying the requested central assistant.
