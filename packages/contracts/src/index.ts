import { z } from "zod";

export * from "./synthetic-contacts.js";

export const eventNames = [
  "customer_created",
  "contact_import_completed",
  "case_created",
  "media_received",
  "gemini_analysis_completed",
  "inspection_plan_generated",
  "inspection_completed",
  "findings_structured",
  "technical_recommendation_generated",
  "quote_generated",
  "human_approval_requested",
  "human_approval_completed",
  "quote_sent",
  "customer_followup_sent",
  "quote_accepted",
  "service_scheduled",
  "technician_assigned",
  "service_completed",
  "delivery_report_generated",
  "invoice_created",
  "payment_received",
  "agent_error",
  "agent_retry",
  "agent_decision_completed",
] as const;

export const actorTypes = ["agent", "human", "system", "customer"] as const;
export const eventStatuses = ["pending", "completed", "failed", "blocked"] as const;

export const auditEventSchema = z.object({
  timestamp: z.string().datetime(),
  eventId: z.string().uuid(),
  eventName: z.enum(eventNames),
  tenantId: z.string().min(1),
  customerId: z.string().min(1).nullable(),
  caseId: z.string().min(1).nullable(),
  agentId: z.string().min(1),
  actorType: z.enum(actorTypes),
  action: z.string().min(1),
  inputSummary: z.string(),
  decision: z.string(),
  result: z.string(),
  model: z.string().nullable(),
  requestReference: z.string().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  humanApproval: z.enum(["not_required", "required", "approved", "rejected"]),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(eventStatuses),
  error: z.string().nullable(),
  evidenceVersion: z.literal("1.0"),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const analyzeCaseRequestSchema = z.object({
  tenantId: z.string().min(2).max(80),
  customerId: z.string().min(2).max(80),
  caseId: z.string().min(2).max(80),
  playbook: z.enum(["photography_studio", "iapro"]),
  message: z.string().min(5).max(12_000),
  channel: z.enum(["whatsapp", "form", "audio_transcript", "spreadsheet"]),
});

export type AnalyzeCaseRequest = z.infer<typeof analyzeCaseRequestSchema>;

export const caseAnalysisSchema = z.object({
  summary: z.string(),
  intent: z.string(),
  urgency: z.enum(["low", "medium", "high"]),
  serviceFamily: z.string(),
  missingInformation: z.array(z.string()),
  nextBestAction: z.string(),
  draftReply: z.string(),
  requiresHumanApproval: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type CaseAnalysis = z.infer<typeof caseAnalysisSchema>;
