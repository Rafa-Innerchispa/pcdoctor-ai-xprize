# ADR-012: Multimodal inspection-to-quote vertical slice

Date: 2026-07-31

## Context

Rafael authorized a complete initial PC Doctor field-service flow that accepts
voice, photos, PDF, Word, or text; asks for missing technical information;
prepares a sober technical report; and produces an itemized quote with
configurable VAT. The capability must remain reusable for IAPRO and managed
properties without turning FieldSpark into a generic data-entry CRM.

## Decision

FieldSpark adds a tenant-isolated inspection-to-quote vertical slice:

- Gemini structures multimodal inspection evidence and explicitly separates
  observations, uncertainty, missing measurements, recommendations, and
  provisional catalog items;
- a human validates safety-critical findings, quantities, unit prices, scope,
  and commercial terms;
- VAT, quote validity, payment terms, warranty text, and branding are tenant
  settings, with the current Ecuador general VAT rate used only as an editable
  default;
- quote totals are calculated deterministically by the API, never by the
  language model;
- email and WhatsApp actions create approval-bound delivery drafts only;
- test evidence binaries remain session-local until the approved private Cloud
  Storage evidence vault is connected; structured records persist in the
  selected operational store;
- monthly inspection and per-inspection media limits are visible and enforced.

## Consequences

- The first proof can exercise the differentiating AI workflow without
  enabling autonomous pricing, outbound communication, or tax invoicing.
- A production pilot still requires private evidence storage, malware/content
  controls, approved channel adapters, retention rules, and a real multimodal
  cost benchmark.
- Reports are printable HTML/PDF layouts; a server-generated immutable PDF and
  electronic signature remain later hardening work.

