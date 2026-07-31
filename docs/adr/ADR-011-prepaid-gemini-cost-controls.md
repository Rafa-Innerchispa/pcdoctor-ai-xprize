# ADR-011: Prepaid Gemini cost controls

Status: accepted — 2026-07-30

## Context

FieldSpark needs real Gemini usage evidence and per-tenant unit economics before
PC Doctor can set sustainable subscription prices. The available Google Cloud
promotion is restricted to GenAI App Builder usage and is not evidenced as
covering ordinary Vertex AI model calls. Rafael requires controlled testing
without an open-ended monthly charge.

## Decision

The Gemini integration remains behind `@google/genai` and supports two
server-side providers:

- `vertex`: Vertex AI with Application Default Credentials;
- `developer`: Gemini Developer API with a service-restricted API key stored in
  Secret Manager.

GCP staging uses the Developer API under the existing prepaid AI Studio billing
account. Automatic reload stays disabled. The FieldSpark project has a USD 5
monthly spend cap. Routine intake uses the stable `gemini-3.5-flash-lite`
model, at most 1,024 output tokens, and minimal thinking. The previous
`gemini-2.5-flash` model is not available to newly imported Gemini API
projects.

Each successful call records input tokens, billable output tokens, estimated
list-price cost, latency, model, tenant, and request reference. The protected
`GET /v1/ai/usage` endpoint aggregates those measurements by tenant.

## Consequences

- Gemini stops when the prepaid balance or project cap is exhausted, subject to
  Google's documented billing-processing delay.
- The measured API cost can be separated by customer and included in unit
  economics.
- The API key never reaches the browser or repository.
- Vertex AI remains available for later production use, but changing providers
  or funding sources requires an explicit billing review.
- Promotional credits are reported separately from gross list-price usage.
