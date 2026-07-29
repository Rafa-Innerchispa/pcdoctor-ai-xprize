# ADR-003: Dedicated Google Cloud project

Status: accepted — 2026-07-28

Use a separate GCP project, provisionally `pcdoctor-ai-xprize-2026`, to isolate
costs, IAM, logs, Gemini usage, evidence, and teardown. The actual project ID
must be confirmed because GCP IDs are globally unique.
