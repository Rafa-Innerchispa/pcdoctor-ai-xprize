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
  "billing_item_prepared",
  "payment_received",
  "agent_error",
  "agent_retry",
  "agent_decision_completed",
  "user_registered",
  "tenant_created",
  "member_invited",
  "member_permissions_updated",
  "identity_validation_completed",
  "workflow_transition_completed",
  "managed_property_created",
  "property_system_created",
  "property_issue_created",
  "property_commitment_created",
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
  playbook: z.enum([
    "pcdoctor",
    "iapro",
    "photography_studio",
    "condominium_management",
  ]),
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

export const demoWorkflowStatuses = [
  "new",
  "awaiting_approval",
  "approved",
  "rejected",
  "billing_review",
] as const;

export const demoWorkflowSchema = z.object({
  id: z.string().min(3).max(100),
  contactId: z.string().min(3).max(80),
  tenantId: z.enum(["studio-demo", "iapro-demo"]),
  playbook: z.enum(["photography_studio", "iapro"]),
  status: z.enum(demoWorkflowStatuses),
  synthetic: z.literal(true),
  outboundAllowed: z.literal(false),
  invoiceIssued: z.literal(false),
  approvalStatus: z.enum(["not_requested", "pending", "approved", "rejected"]),
  billingStatus: z.enum(["none", "ready_for_review"]),
  analysis: caseAnalysisSchema.nullable(),
  draftReply: z.string().max(600),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type DemoWorkflow = z.infer<typeof demoWorkflowSchema>;

export const demoDraftUpdateSchema = z.object({
  draftReply: z.string().trim().min(5).max(600),
});

export const fieldSparkRoles = [
  "platform_owner",
  "administrator",
  "collaborator",
  "customer",
] as const;

export const fieldSparkPermissions = [
  "tenant.manage",
  "members.manage",
  "customers.view",
  "customers.manage",
  "cases.view",
  "cases.manage",
  "quotes.view",
  "quotes.manage",
  "quotes.approve",
  "services.view",
  "services.manage",
  "billing.view",
  "billing.prepare",
  "billing.issue",
  "messages.prepare",
  "messages.approve",
  "messages.send",
  "reports.view",
  "audit.view",
  "integrations.manage",
  "portfolio.view",
  "portfolio.manage",
] as const;

export const fieldSparkRoleSchema = z.enum(fieldSparkRoles);
export const fieldSparkPermissionSchema = z.enum(fieldSparkPermissions);
export type FieldSparkRole = z.infer<typeof fieldSparkRoleSchema>;
export type FieldSparkPermission = z.infer<typeof fieldSparkPermissionSchema>;

export const defaultPermissionsByRole: Record<
  FieldSparkRole,
  readonly FieldSparkPermission[]
> = {
  platform_owner: fieldSparkPermissions,
  administrator: fieldSparkPermissions.filter(
    (permission) => permission !== "billing.issue",
  ),
  collaborator: [
    "customers.view",
    "customers.manage",
    "cases.view",
    "cases.manage",
    "quotes.view",
    "quotes.manage",
    "services.view",
    "services.manage",
    "billing.view",
    "billing.prepare",
    "messages.prepare",
    "reports.view",
    "portfolio.view",
    "portfolio.manage",
  ],
  customer: [
    "cases.view",
    "quotes.view",
    "services.view",
    "billing.view",
  ],
};

export const tenantPlaybooks = [
  "pcdoctor",
  "iapro",
  "photography_studio",
  "condominium_management",
] as const;

export const tenantSchema = z.object({
  id: z.string().min(3).max(80),
  slug: z.string().regex(/^[a-z0-9-]{3,50}$/),
  legalName: z.string().min(2).max(180),
  displayName: z.string().min(2).max(120),
  playbook: z.enum(tenantPlaybooks),
  status: z.enum(["active", "suspended"]),
  environment: z.enum(["staging", "production"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Tenant = z.infer<typeof tenantSchema>;

export const userProfileSchema = z.object({
  uid: z.string().min(3).max(160),
  email: z.string().email(),
  emailVerified: z.boolean(),
  displayName: z.string().max(120),
  phone: z.string().max(20),
  taxId: z.string().max(13),
  personType: z.enum(["natural", "company"]).nullable(),
  legalName: z.string().max(180),
  photoUrl: z.string().url().nullable(),
  status: z.enum(["pending_profile", "pending_access", "active", "suspended"]),
  profileComplete: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const membershipSchema = z.object({
  id: z.string().min(3).max(260),
  tenantId: z.string().min(3).max(80),
  userId: z.string().min(3).max(160),
  role: fieldSparkRoleSchema,
  permissions: z.array(fieldSparkPermissionSchema),
  status: z.enum(["active", "suspended"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Membership = z.infer<typeof membershipSchema>;

export const invitationSchema = z.object({
  id: z.string().min(3).max(260),
  tenantId: z.string().min(3).max(80),
  email: z.string().email(),
  role: z.enum(["administrator", "collaborator", "customer"]),
  permissions: z.array(fieldSparkPermissionSchema),
  status: z.enum(["pending", "accepted", "revoked"]),
  invitedBy: z.string().min(3).max(160),
  acceptedBy: z.string().min(3).max(160).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Invitation = z.infer<typeof invitationSchema>;

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{8,15}$/),
    taxId: z
      .string()
      .trim()
      .regex(/^(\d{10}|\d{13})$/),
    personType: z.enum(["natural", "company"]),
    legalName: z.string().trim().max(180),
  })
  .superRefine((value, context) => {
    if (value.personType === "company" && value.legalName.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["legalName"],
        message: "La razón social es obligatoria para empresas.",
      });
    }
  });

export const invitationCreateSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["administrator", "collaborator", "customer"]),
  permissions: z.array(fieldSparkPermissionSchema).default([]),
});

export const memberUpdateSchema = z.object({
  role: z.enum(["administrator", "collaborator", "customer"]),
  permissions: z.array(fieldSparkPermissionSchema),
  status: z.enum(["active", "suspended"]),
});

export const customerContactImportRowSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    accountName: z.string().trim().max(160).default(""),
    phone: z.string().trim().max(30).default(""),
    email: z.union([z.string().trim().email(), z.literal("")]).default(""),
    taxId: z.string().trim().max(20).default(""),
    notes: z.string().trim().max(1_000).default(""),
  })
  .refine((row) => Boolean(row.phone || row.email), {
    message: "Cada contacto debe incluir teléfono o correo.",
    path: ["phone"],
  });

export const customerContactImportRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(180),
    synthetic: z.boolean().default(true),
    consentConfirmed: z.boolean().default(false),
    rows: z.array(customerContactImportRowSchema).min(1).max(2_000),
  })
  .refine((request) => request.synthetic || request.consentConfirmed, {
    message: "Confirma la autorización antes de importar datos reales.",
    path: ["consentConfirmed"],
  });

export const customerContactSchema = customerContactImportRowSchema.extend({
  id: z.string().uuid(),
  tenantId: z.string().min(3).max(80),
  source: z.literal("spreadsheet"),
  sourceFileName: z.string().min(1).max(180),
  synthetic: z.boolean(),
  consentStatus: z.enum(["confirmed", "not_applicable_synthetic"]),
  outboundAllowed: z.literal(false),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CustomerContact = z.infer<typeof customerContactSchema>;

export const sessionSchema = z.object({
  user: userProfileSchema,
  memberships: z.array(
    z.object({
      membership: membershipSchema,
      tenant: tenantSchema,
    }),
  ),
});

export type FieldSparkSession = z.infer<typeof sessionSchema>;

export const ecIdentifierTypes = ["cedula", "ruc"] as const;
export const ecIdentitySources = [
  "local_checksum",
  "authorized_registry",
] as const;

export const ecIdentityValidationRequestSchema = z.object({
  identifier: z.string().trim().min(10).max(20),
  lookup: z.enum(["local", "authorized"]).default("local"),
});

export const ecIdentityValidationSchema = z.object({
  identifier: z.string().regex(/^(\d{10}|\d{13})$/),
  identifierType: z.enum(ecIdentifierTypes),
  locallyValid: z.boolean(),
  registryVerified: z.boolean(),
  source: z.enum(ecIdentitySources),
  legalName: z.string().max(180),
  commercialName: z.string().max(180),
  activity: z.string().max(300),
  status: z.enum(["locally_valid", "verified", "not_found", "unavailable"]),
  verifiedAt: z.string().datetime(),
});

export type EcIdentityValidation = z.infer<
  typeof ecIdentityValidationSchema
>;

export const caseStages = [
  "intake",
  "identity",
  "discovery",
  "quote",
  "approval",
  "service",
  "billing",
  "completed",
] as const;

export const caseTransitionActions = [
  "complete_intake",
  "validate_identity",
  "complete_discovery",
  "prepare_quote",
  "approve_quote",
  "reject_quote",
  "complete_service",
  "prepare_billing",
  "close_case",
] as const;

export const businessCaseStatuses = [
  "open",
  "waiting_approval",
  "active",
  "billing_review",
  "completed",
] as const;

export const businessCaseSchema = z.object({
  id: z.string().min(3).max(100),
  tenantId: z.string().min(3).max(80),
  playbook: z.enum(tenantPlaybooks),
  customerId: z.string().min(3).max(100),
  customerUserId: z.string().min(3).max(160).nullable(),
  customerName: z.string().min(2).max(180),
  customerIdentifier: z.string().max(13),
  title: z.string().min(3).max(180),
  description: z.string().min(3).max(12_000),
  currentStage: z.enum(caseStages),
  status: z.enum(businessCaseStatuses),
  identityValidation: ecIdentityValidationSchema.nullable(),
  quoteAmountUsd: z.number().nonnegative().nullable(),
  quoteApproval: z.enum(["not_requested", "pending", "approved", "rejected"]),
  billingPrepared: z.boolean(),
  invoiceIssued: z.boolean(),
  outboundAllowed: z.boolean(),
  synthetic: z.boolean(),
  assignedTo: z.string().max(160).nullable(),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BusinessCase = z.infer<typeof businessCaseSchema>;

export const businessCaseCreateSchema = z.object({
  customerId: z.string().trim().min(3).max(100),
  customerUserId: z.string().trim().min(3).max(160).nullable().default(null),
  customerName: z.string().trim().min(2).max(180),
  customerIdentifier: z.string().trim().max(20).default(""),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(12_000),
  assignedTo: z.string().trim().min(3).max(160).nullable().default(null),
  synthetic: z.boolean().default(false),
});

export const caseTransitionRequestSchema = z.object({
  action: z.enum(caseTransitionActions),
  identityLookup: z.enum(["local", "authorized"]).default("local"),
  quoteAmountUsd: z.number().nonnegative().optional(),
  note: z.string().trim().max(1_000).default(""),
});

export type CaseTransitionRequest = z.infer<
  typeof caseTransitionRequestSchema
>;

export const playbookStepSchema = z.object({
  stage: z.enum(caseStages),
  label: z.string().min(2).max(80),
  objective: z.string().min(3).max(240),
});

export const playbookDefinitionSchema = z.object({
  id: z.enum(tenantPlaybooks),
  name: z.string().min(2).max(80),
  steps: z.array(playbookStepSchema).length(caseStages.length),
});

export type PlaybookDefinition = z.infer<
  typeof playbookDefinitionSchema
>;

export const managedPropertyTypes = [
  "condominium",
  "urbanization",
  "residential_building",
  "mixed_use",
  "commercial_complex",
] as const;

export const managedPropertyStatuses = [
  "onboarding",
  "active",
  "suspended",
] as const;

export const managedPropertySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(3).max(80),
  name: z.string().min(2).max(160),
  propertyType: z.enum(managedPropertyTypes),
  status: z.enum(managedPropertyStatuses),
  city: z.string().min(2).max(100),
  address: z.string().min(2).max(240),
  unitCount: z.number().int().nonnegative().nullable(),
  administratorName: z.string().max(160),
  administratorUserId: z.string().max(160).nullable(),
  synthetic: z.boolean(),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ManagedProperty = z.infer<typeof managedPropertySchema>;

export const managedPropertyCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  propertyType: z.enum(managedPropertyTypes),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(240),
  unitCount: z.number().int().nonnegative().nullable().default(null),
  administratorName: z.string().trim().max(160).default(""),
  administratorUserId: z.string().trim().min(3).max(160).nullable().default(null),
  synthetic: z.boolean().default(false),
});

export const propertySystemTypes = [
  "electric_fence",
  "fire_detection",
  "fire_suppression",
  "cctv",
  "access_control",
  "alarms",
  "elevators",
  "pumps",
  "generator",
  "water",
  "lighting",
  "gas",
  "gates",
  "intercom",
  "playground",
  "pool",
  "other",
] as const;

export const propertySystemConditions = [
  "unknown",
  "operational",
  "attention",
  "critical",
] as const;

export const propertySystemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(3).max(80),
  propertyId: z.string().uuid(),
  systemType: z.enum(propertySystemTypes),
  name: z.string().min(2).max(160),
  condition: z.enum(propertySystemConditions),
  inventoryCount: z.number().int().nonnegative(),
  lastInspectionAt: z.string().datetime().nullable(),
  nextInspectionAt: z.string().datetime().nullable(),
  notes: z.string().max(2_000),
  synthetic: z.boolean(),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PropertySystem = z.infer<typeof propertySystemSchema>;

export const propertySystemCreateSchema = z.object({
  systemType: z.enum(propertySystemTypes),
  name: z.string().trim().min(2).max(160),
  condition: z.enum(propertySystemConditions).default("unknown"),
  inventoryCount: z.number().int().nonnegative().default(1),
  lastInspectionAt: z.string().datetime().nullable().default(null),
  nextInspectionAt: z.string().datetime().nullable().default(null),
  notes: z.string().trim().max(2_000).default(""),
  synthetic: z.boolean().default(false),
});

export const propertyIssueCategories = [
  "security",
  "fire_safety",
  "coexistence",
  "maintenance",
  "infrastructure",
  "utilities",
  "finance",
  "collections",
  "legal",
  "governance",
  "communication",
  "staff",
  "supplier",
  "emergency",
  "other",
] as const;

export const propertyIssueSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(3).max(80),
  propertyId: z.string().uuid(),
  category: z.enum(propertyIssueCategories),
  title: z.string().min(3).max(180),
  description: z.string().min(3).max(8_000),
  priority: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["reported", "triaged", "in_progress", "waiting", "closed"]),
  source: z.enum(["manual", "audio", "email", "whatsapp", "meeting", "system"]),
  assignedTo: z.string().max(160).nullable(),
  dueAt: z.string().datetime().nullable(),
  synthetic: z.boolean(),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PropertyIssue = z.infer<typeof propertyIssueSchema>;

export const propertyIssueCreateSchema = z.object({
  category: z.enum(propertyIssueCategories),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(8_000),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  source: z
    .enum(["manual", "audio", "email", "whatsapp", "meeting", "system"])
    .default("manual"),
  assignedTo: z.string().trim().min(3).max(160).nullable().default(null),
  dueAt: z.string().datetime().nullable().default(null),
  synthetic: z.boolean().default(false),
});

export const propertyCommitmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(3).max(80),
  propertyId: z.string().uuid().nullable(),
  commitmentType: z.enum([
    "meeting",
    "task",
    "deadline",
    "assembly",
    "inspection",
    "payment",
  ]),
  title: z.string().min(3).max(180),
  startsAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
  reminderAt: z.string().datetime().nullable(),
  ownerUserId: z.string().max(160).nullable(),
  status: z.enum(["scheduled", "done", "cancelled"]),
  notes: z.string().max(2_000),
  synthetic: z.boolean(),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PropertyCommitment = z.infer<typeof propertyCommitmentSchema>;

export const propertyCommitmentCreateSchema = z.object({
  propertyId: z.string().uuid().nullable().default(null),
  commitmentType: z.enum([
    "meeting",
    "task",
    "deadline",
    "assembly",
    "inspection",
    "payment",
  ]),
  title: z.string().trim().min(3).max(180),
  startsAt: z.string().datetime().nullable().default(null),
  dueAt: z.string().datetime().nullable().default(null),
  reminderAt: z.string().datetime().nullable().default(null),
  ownerUserId: z.string().trim().min(3).max(160).nullable().default(null),
  notes: z.string().trim().max(2_000).default(""),
  synthetic: z.boolean().default(false),
});

export const propertyPortfolioBriefSchema = z.object({
  generatedAt: z.string().datetime(),
  tenantId: z.string().min(3).max(80),
  property: managedPropertySchema.nullable(),
  properties: z.array(managedPropertySchema),
  totals: z.object({
    properties: z.number().int().nonnegative(),
    openIssues: z.number().int().nonnegative(),
    criticalIssues: z.number().int().nonnegative(),
    systemsRequiringAttention: z.number().int().nonnegative(),
    upcomingCommitments: z.number().int().nonnegative(),
  }),
  issues: z.array(propertyIssueSchema),
  systems: z.array(propertySystemSchema),
  commitments: z.array(propertyCommitmentSchema),
  grounded: z.literal(true),
  outboundAllowed: z.literal(false),
});

export type PropertyPortfolioBrief = z.infer<
  typeof propertyPortfolioBriefSchema
>;

export const inspectionEvidenceKinds = [
  "photo",
  "audio",
  "document",
  "text",
] as const;

export const inspectionEvidenceInputSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(inspectionEvidenceKinds),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().nonnegative().max(8_000_000),
  dataBase64: z.string().max(11_000_000),
});

export const inspectionFindingSchema = z.object({
  title: z.string().min(3).max(180),
  detail: z.string().min(3).max(2_000),
  severity: z.enum(["observation", "attention", "critical"]),
  evidenceIds: z.array(z.string().uuid()).max(12),
  confidence: z.number().min(0).max(1),
});

export const inspectionSuggestedItemSchema = z.object({
  code: z.string().max(60),
  description: z.string().min(3).max(300),
  quantity: z.number().positive().max(100_000),
  unit: z.string().min(1).max(30),
  rationale: z.string().min(3).max(500),
  catalogMatch: z.enum(["existing", "new", "verify"]),
});

export const inspectionAnalysisSchema = z.object({
  executiveSummary: z.string().min(20).max(4_000),
  technicalContext: z.string().min(10).max(4_000),
  findings: z.array(inspectionFindingSchema).max(20),
  measurements: z.array(z.string().max(300)).max(20),
  recommendedActions: z.array(z.string().max(500)).max(20),
  suggestedItems: z.array(inspectionSuggestedItemSchema).max(30),
  missingInformation: z.array(z.string().max(300)).max(20),
  safetyLimitations: z.array(z.string().max(500)).max(12),
  confidence: z.number().min(0).max(1),
});

export type InspectionAnalysis = z.infer<typeof inspectionAnalysisSchema>;

export const inspectionAnalyzeRequestSchema = z
  .object({
    systemType: z.enum(propertySystemTypes),
    title: z.string().trim().min(3).max(180),
    siteName: z.string().trim().min(2).max(180),
    narrative: z.string().trim().max(20_000).default(""),
    evidence: z.array(inspectionEvidenceInputSchema).max(20).default([]),
    synthetic: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.narrative.length < 5 && value.evidence.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["narrative"],
        message: "Provide a narration or at least one evidence file.",
      });
    }
    const totalBytes = value.evidence.reduce(
      (sum, item) => sum + item.sizeBytes,
      0,
    );
    if (totalBytes > 16_000_000) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Evidence exceeds the 16 MB request limit.",
      });
    }
  });

export const inspectionRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(3).max(80),
  caseId: z.string().min(3).max(100),
  systemType: z.enum(propertySystemTypes),
  title: z.string().min(3).max(180),
  siteName: z.string().min(2).max(180),
  narrative: z.string().max(20_000),
  evidence: z.array(
    inspectionEvidenceInputSchema.omit({ dataBase64: true }),
  ),
  analysis: inspectionAnalysisSchema,
  status: z.enum(["draft", "reviewed"]),
  synthetic: z.boolean(),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type InspectionRecord = z.infer<typeof inspectionRecordSchema>;

export const tenantOperationalSettingsUpdateSchema = z.object({
  defaultTaxRatePct: z.number().min(0).max(100).default(15),
  currency: z.literal("USD").default("USD"),
  quoteValidityDays: z.number().int().min(1).max(365).default(15),
  paymentTerms: z.string().trim().max(1_000).default(""),
  warrantyTerms: z.string().trim().max(1_000).default(""),
  branding: z.object({
    legalName: z.string().trim().max(180).default(""),
    taxId: z.string().trim().max(20).default(""),
    address: z.string().trim().max(240).default(""),
    email: z.union([z.literal(""), z.string().email()]).default(""),
    phone: z.string().trim().max(30).default(""),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#183d34"),
    logoDataUrl: z
      .string()
      .max(500_000)
      .refine(
        (value) => value === "" || /^data:image\/(png|jpeg|webp);base64,/.test(value),
        "Logo must be a PNG, JPEG, or WEBP data URL.",
      )
      .default(""),
  }),
  monthlyLimits: z.object({
    inspections: z.number().int().min(1).max(10_000).default(20),
    photosPerInspection: z.number().int().min(1).max(100).default(20),
    audioMinutesPerInspection: z.number().int().min(1).max(600).default(15),
    documentPagesPerInspection: z.number().int().min(1).max(1_000).default(25),
    supplierSearchesPerInspection: z.number().int().min(0).max(100).default(2),
    evidenceStorageMb: z.number().int().min(10).max(1_000_000).default(512),
  }),
});

export const tenantOperationalSettingsSchema =
  tenantOperationalSettingsUpdateSchema.extend({
    tenantId: z.string().min(3).max(80),
    updatedBy: z.string().min(3).max(160),
    updatedAt: z.string().datetime(),
  });

export type TenantOperationalSettings = z.infer<
  typeof tenantOperationalSettingsSchema
>;

export const quoteLineInputSchema = z.object({
  code: z.string().trim().max(60).default(""),
  description: z.string().trim().min(3).max(500),
  quantity: z.number().positive().max(100_000),
  unit: z.string().trim().min(1).max(30),
  unitPriceUsd: z.number().nonnegative().max(100_000_000),
});

export const quoteLineSchema = quoteLineInputSchema.extend({
  subtotalUsd: z.number().nonnegative(),
});

export const quoteDraftCreateSchema = z.object({
  inspectionId: z.string().uuid(),
  proposalTitle: z.string().trim().min(3).max(180),
  executiveSummary: z.string().trim().min(20).max(8_000),
  technicalProposal: z.string().trim().min(20).max(8_000),
  scope: z.array(z.string().trim().min(3).max(500)).max(30),
  exclusions: z.array(z.string().trim().min(3).max(500)).max(20),
  items: z.array(quoteLineInputSchema).min(1).max(100),
  taxRatePct: z.number().min(0).max(100).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
});

export const quoteDocumentSchema = z.object({
  id: z.string().uuid(),
  quoteNumber: z.string().min(3).max(60),
  tenantId: z.string().min(3).max(80),
  caseId: z.string().min(3).max(100),
  inspectionId: z.string().uuid(),
  customerName: z.string().min(2).max(180),
  customerIdentifier: z.string().max(20),
  proposalTitle: z.string().min(3).max(180),
  executiveSummary: z.string().min(20).max(8_000),
  technicalProposal: z.string().min(20).max(8_000),
  scope: z.array(z.string().max(500)),
  exclusions: z.array(z.string().max(500)),
  items: z.array(quoteLineSchema),
  subtotalUsd: z.number().nonnegative(),
  taxRatePct: z.number().min(0).max(100),
  taxAmountUsd: z.number().nonnegative(),
  totalUsd: z.number().nonnegative(),
  currency: z.literal("USD"),
  validityDays: z.number().int().positive(),
  status: z.enum(["draft", "pending_approval", "approved"]),
  outboundAllowed: z.literal(false),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type QuoteDocument = z.infer<typeof quoteDocumentSchema>;

export const deliveryDraftCreateSchema = z.object({
  quoteId: z.string().uuid(),
  channel: z.enum(["email", "whatsapp"]),
  recipient: z.string().trim().min(3).max(180),
  subject: z.string().trim().max(180).default(""),
  message: z.string().trim().min(10).max(4_000),
});

export const deliveryDraftSchema = deliveryDraftCreateSchema.extend({
  id: z.string().uuid(),
  tenantId: z.string().min(3).max(80),
  caseId: z.string().min(3).max(100),
  status: z.literal("awaiting_approval"),
  sent: z.literal(false),
  createdBy: z.string().min(3).max(160),
  createdAt: z.string().datetime(),
});

export type DeliveryDraft = z.infer<typeof deliveryDraftSchema>;
