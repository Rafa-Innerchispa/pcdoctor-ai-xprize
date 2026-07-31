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
