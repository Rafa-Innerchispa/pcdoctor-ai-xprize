import { randomUUID, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  analyzeCaseRequestSchema,
  auditEventSchema,
  businessCaseCreateSchema,
  businessCaseSchema,
  caseTransitionRequestSchema,
  customerContactImportRequestSchema,
  customerContactSchema,
  deliveryDraftCreateSchema,
  deliveryDraftSchema,
  ecIdentityValidationRequestSchema,
  invitationCreateSchema,
  invitationSchema,
  inspectionAnalyzeRequestSchema,
  inspectionRecordSchema,
  memberUpdateSchema,
  membershipSchema,
  managedPropertyCreateSchema,
  managedPropertySchema,
  profileUpdateSchema,
  propertyCommitmentCreateSchema,
  propertyCommitmentSchema,
  propertyIssueCreateSchema,
  propertyIssueSchema,
  propertyPortfolioBriefSchema,
  propertySystemCreateSchema,
  propertySystemSchema,
  quoteDraftCreateSchema,
  tenantOperationalSettingsSchema,
  tenantOperationalSettingsUpdateSchema,
  demoDraftUpdateSchema,
  demoWorkflowSchema,
  syntheticContacts,
  userProfileSchema,
  type AnalyzeCaseRequest,
  type AuditEvent,
  type BusinessCase,
  type CustomerContact,
  type DemoWorkflow,
  type FieldSparkPermission,
  type SyntheticContact,
} from "@fieldspark/contracts";
import Fastify, {
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  createAuthVerifier,
  type AuthenticatedIdentity,
  type AuthVerifier,
} from "./auth.js";
import { contactsToCsv } from "./contact-csv.js";
import { createContactStore } from "./contact-store.js";
import { createCustomerStore } from "./customer-store.js";
import { createCaseStore } from "./case-store.js";
import {
  playbookDefinitions,
  transitionCase,
} from "./case-workflows.js";
import { loadConfig, type AppConfig } from "./config.js";
import { buildDemoAnalysis, overview } from "./demo.js";
import { createEventStore } from "./event-store.js";
import {
  AuthorizedTaxRegistry,
  buildLocalIdentityValidation,
  EcuadorIdentityError,
  validateEcuadorIdentifier,
} from "./ecuador-identity.js";
import { GeminiService } from "./gemini.js";
import {
  bootstrapSession,
  canManageMembers,
  findActiveMembership,
  invitationId,
  membershipId,
} from "./identity-service.js";
import { createIdentityStore } from "./identity-store.js";
import { createPortfolioStore } from "./portfolio-store.js";
import { createOperationsStore } from "./operations-store.js";
import {
  buildQuoteDocument,
  buildSyntheticInspectionAnalysis,
} from "./inspection-workflow.js";
import { redactSensitiveText } from "./redact.js";
import { createWorkflowStore } from "./workflow-store.js";

function safeKeyMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireAdmin(request: FastifyRequest, config: AppConfig): boolean {
  const provided = request.headers["x-admin-key"];
  return (
    typeof provided === "string" &&
    config.API_ADMIN_KEY.length >= 24 &&
    safeKeyMatch(provided, config.API_ADMIN_KEY)
  );
}

export async function buildApp(
  overrides: Partial<Record<keyof AppConfig, unknown>> = {},
  dependencies: { authVerifier?: AuthVerifier | null } = {},
) {
  const config = loadConfig(overrides);
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "req.headers.x-admin-key"],
    },
    requestIdHeader: "x-request-id",
    bodyLimit: 25_000_000,
  });
  const eventStore = createEventStore(config);
  const contactStore = createContactStore(config);
  const customerStore = createCustomerStore(config);
  const caseStore = createCaseStore(config);
  const workflowStore = createWorkflowStore(config);
  const identityStore = createIdentityStore(config);
  const portfolioStore = createPortfolioStore(config);
  const operationsStore = createOperationsStore(config);
  const authVerifier =
    dependencies.authVerifier === undefined
      ? createAuthVerifier(config)
      : dependencies.authVerifier;
  const requestIdentities = new WeakMap<FastifyRequest, AuthenticatedIdentity>();
  const gemini = new GeminiService(config);
  const taxRegistry = new AuthorizedTaxRegistry(config);

  await app.register(cors, {
    origin: config.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["content-type", "authorization", "x-admin-key"],
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  const publicRoutes = new Set([
    "/health",
    "/healthz",
    "/v1/public/config",
  ]);

  app.addHook("preHandler", async (request, reply) => {
    if (
      request.method === "OPTIONS" ||
      publicRoutes.has(request.routeOptions.url ?? request.url)
    ) {
      return;
    }
    if (requireAdmin(request, config)) {
      requestIdentities.set(request, {
        uid: "system-admin",
        email: config.BOOTSTRAP_OWNER_EMAIL.toLowerCase(),
        emailVerified: true,
        displayName: "System administrator",
        photoUrl: null,
      });
      return;
    }
    if (!config.AUTH_ENABLED) {
      requestIdentities.set(request, {
        uid: "local-owner",
        email: config.BOOTSTRAP_OWNER_EMAIL.toLowerCase(),
        emailVerified: true,
        displayName: "Rafael",
        photoUrl: null,
      });
      return;
    }
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ") || !authVerifier) {
      return reply.code(401).send({ error: "authentication_required" });
    }
    try {
      const identity = await authVerifier.verify(authorization.slice(7));
      requestIdentities.set(request, identity);
    } catch (error) {
      request.log.warn({ err: error }, "identity token rejected");
      return reply.code(401).send({ error: "invalid_identity_token" });
    }
  });

  function requireIdentity(request: FastifyRequest) {
    const identity = requestIdentities.get(request);
    if (!identity) throw new Error("authenticated_identity_missing");
    return identity;
  }

  const healthResponse = async () => ({
    status: "ok",
    service: "fieldspark-api",
    demoMode: config.DEMO_MODE,
    outboundEnabled: config.OUTBOUND_ENABLED,
    invoicingEnabled: config.INVOICING_ENABLED,
  });

  app.get("/health", healthResponse);
  app.get("/healthz", healthResponse);

  app.get("/v1/public/config", async () => ({
    auth: {
      enabled: config.AUTH_ENABLED,
      firebase: config.AUTH_ENABLED
        ? {
            apiKey: config.FIREBASE_WEB_API_KEY,
            authDomain: config.FIREBASE_AUTH_DOMAIN,
            projectId: config.GOOGLE_CLOUD_PROJECT,
            appId: config.FIREBASE_APP_ID,
          }
        : null,
    },
  }));

  app.get("/v1/session", async (request) =>
    bootstrapSession(requireIdentity(request), config, identityStore),
  );

  app.post("/v1/session/bootstrap", async (request) =>
    bootstrapSession(requireIdentity(request), config, identityStore),
  );

  app.put("/v1/profile", async (request, reply) => {
    const identity = requireIdentity(request);
    const parsed = profileUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_profile",
        details: parsed.error.flatten(),
      });
    }
    try {
      const identifier = validateEcuadorIdentifier(parsed.data.taxId);
      if (
        parsed.data.personType === "company" &&
        identifier.identifierType !== "ruc"
      ) {
        return reply.code(400).send({
          error: "company_ruc_required",
          message: "Para una empresa se requiere un RUC ecuatoriano válido.",
        });
      }
    } catch (error) {
      if (error instanceof EcuadorIdentityError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
        });
      }
      throw error;
    }
    await bootstrapSession(identity, config, identityStore);
    const existing = await identityStore.getUser(identity.uid);
    if (!existing) {
      return reply.code(409).send({ error: "profile_bootstrap_required" });
    }
    const now = new Date().toISOString();
    await identityStore.upsertUser(
      userProfileSchema.parse({
        ...existing,
        ...parsed.data,
        profileComplete: true,
        status: "active",
        updatedAt: now,
      }),
    );
    return bootstrapSession(identity, config, identityStore);
  });

  function routeParam(request: FastifyRequest, name: string) {
    const params =
      typeof request.params === "object" && request.params
        ? (request.params as Record<string, unknown>)
        : {};
    return typeof params[name] === "string" ? params[name] : "";
  }

  function queryParam(request: FastifyRequest, name: string) {
    const query =
      typeof request.query === "object" && request.query
        ? (request.query as Record<string, unknown>)
        : {};
    return typeof query[name] === "string" ? query[name] : "";
  }

  async function tenantMembership(
    request: FastifyRequest,
    tenantId: string,
  ) {
    const identity = requireIdentity(request);
    return findActiveMembership(identityStore, tenantId, identity.uid);
  }

  function hasPermission(
    membership: NonNullable<
      Awaited<ReturnType<typeof findActiveMembership>>
    >,
    permission: FieldSparkPermission,
  ) {
    return (
      membership.role === "platform_owner" ||
      membership.permissions.includes(permission)
    );
  }

  function canAccessProperty(
    membership: NonNullable<
      Awaited<ReturnType<typeof findActiveMembership>>
    >,
    identity: AuthenticatedIdentity,
    property: Awaited<ReturnType<typeof portfolioStore.getProperty>>,
  ) {
    if (!property) return false;
    return (
      membership.role === "platform_owner" ||
      membership.role === "administrator" ||
      property.administratorUserId === identity.uid ||
      property.createdBy === identity.uid
    );
  }

  async function appendPortfolioEvent(
    request: FastifyRequest,
    tenantId: string,
    eventName:
      | "managed_property_created"
      | "property_system_created"
      | "property_issue_created"
      | "property_commitment_created",
    action: string,
    inputSummary: string,
    result: string,
  ) {
    const identity = requireIdentity(request);
    const event = auditEventSchema.parse({
      timestamp: new Date().toISOString(),
      eventId: randomUUID(),
      eventName,
      tenantId,
      customerId: null,
      caseId: null,
      agentId: identity.uid,
      actorType: "human",
      action,
      inputSummary,
      decision: "Registrar y mantener la acción dentro del entorno autorizado.",
      result,
      model: null,
      requestReference: request.id,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      humanApproval: "not_required",
      durationMs: 0,
      status: "completed",
      error: null,
      evidenceVersion: "1.0",
    });
    await eventStore.append(event);
    request.log.info({ auditEvent: event }, "portfolio event completed");
    return event;
  }

  app.get("/v1/playbooks", async () => ({
    playbooks: Object.values(playbookDefinitions),
  }));

  app.get("/v1/tenants/:tenantId/properties", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "portfolio.view")) {
      return reply.code(403).send({ error: "portfolio_view_forbidden" });
    }
    const properties = await portfolioStore.listProperties(tenantId);
    return {
      properties: properties.filter((property) =>
        canAccessProperty(membership, identity, property),
      ),
    };
  });

  app.post("/v1/tenants/:tenantId/properties", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "portfolio.manage")) {
      return reply.code(403).send({ error: "portfolio_management_forbidden" });
    }
    const tenant = await identityStore.getTenant(tenantId);
    if (!tenant) return reply.code(404).send({ error: "tenant_not_found" });
    if (tenant.playbook !== "condominium_management") {
      return reply.code(409).send({ error: "portfolio_playbook_required" });
    }
    const parsed = managedPropertyCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_managed_property",
        details: parsed.error.flatten(),
      });
    }
    const now = new Date().toISOString();
    const property = managedPropertySchema.parse({
      ...parsed.data,
      id: randomUUID(),
      tenantId,
      status: "onboarding",
      createdBy: identity.uid,
      createdAt: now,
      updatedAt: now,
    });
    await portfolioStore.upsertProperty(property);
    const event = await appendPortfolioEvent(
      request,
      tenantId,
      "managed_property_created",
      "create_managed_property",
      property.name,
      "Propiedad creada en incorporación, sin comunicaciones externas.",
    );
    return reply.code(201).send({ property, event });
  });

  async function resolvePropertyAccess(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "portfolio.view")) {
      reply.code(403).send({ error: "portfolio_view_forbidden" });
      return null;
    }
    const property = await portfolioStore.getProperty(
      routeParam(request, "propertyId"),
    );
    if (
      !property ||
      property.tenantId !== tenantId ||
      !canAccessProperty(membership, identity, property)
    ) {
      reply.code(404).send({ error: "managed_property_not_found" });
      return null;
    }
    return { identity, tenantId, membership, property };
  }

  app.get(
    "/v1/tenants/:tenantId/properties/:propertyId",
    async (request, reply) => {
      const access = await resolvePropertyAccess(request, reply);
      if (!access) return;
      const [systems, issues, commitments] = await Promise.all([
        portfolioStore.listSystems(access.tenantId, access.property.id),
        portfolioStore.listIssues(access.tenantId, access.property.id),
        portfolioStore.listCommitments(access.tenantId, access.property.id),
      ]);
      return { property: access.property, systems, issues, commitments };
    },
  );

  app.post(
    "/v1/tenants/:tenantId/properties/:propertyId/systems",
    async (request, reply) => {
      const access = await resolvePropertyAccess(request, reply);
      if (!access) return;
      if (!hasPermission(access.membership, "portfolio.manage")) {
        return reply
          .code(403)
          .send({ error: "portfolio_management_forbidden" });
      }
      const parsed = propertySystemCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_property_system",
          details: parsed.error.flatten(),
        });
      }
      const now = new Date().toISOString();
      const system = propertySystemSchema.parse({
        ...parsed.data,
        id: randomUUID(),
        tenantId: access.tenantId,
        propertyId: access.property.id,
        createdBy: access.identity.uid,
        createdAt: now,
        updatedAt: now,
      });
      await portfolioStore.upsertSystem(system);
      const event = await appendPortfolioEvent(
        request,
        access.tenantId,
        "property_system_created",
        "create_property_system",
        `${access.property.name}: ${system.name}`,
        "Sistema incorporado al inventario operativo.",
      );
      return reply.code(201).send({ system, event });
    },
  );

  app.post(
    "/v1/tenants/:tenantId/properties/:propertyId/issues",
    async (request, reply) => {
      const access = await resolvePropertyAccess(request, reply);
      if (!access) return;
      if (!hasPermission(access.membership, "portfolio.manage")) {
        return reply
          .code(403)
          .send({ error: "portfolio_management_forbidden" });
      }
      const parsed = propertyIssueCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_property_issue",
          details: parsed.error.flatten(),
        });
      }
      const now = new Date().toISOString();
      const issue = propertyIssueSchema.parse({
        ...parsed.data,
        id: randomUUID(),
        tenantId: access.tenantId,
        propertyId: access.property.id,
        status: "reported",
        createdBy: access.identity.uid,
        createdAt: now,
        updatedAt: now,
      });
      await portfolioStore.upsertIssue(issue);
      const event = await appendPortfolioEvent(
        request,
        access.tenantId,
        "property_issue_created",
        "create_property_issue",
        `${access.property.name}: ${issue.title}`,
        "Novedad registrada y pendiente de clasificación operativa.",
      );
      return reply.code(201).send({ issue, event });
    },
  );

  app.post(
    "/v1/tenants/:tenantId/portfolio/commitments",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "portfolio.manage")) {
        return reply
          .code(403)
          .send({ error: "portfolio_management_forbidden" });
      }
      const parsed = propertyCommitmentCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_property_commitment",
          details: parsed.error.flatten(),
        });
      }
      if (parsed.data.propertyId) {
        const property = await portfolioStore.getProperty(
          parsed.data.propertyId,
        );
        if (
          !property ||
          property.tenantId !== tenantId ||
          !canAccessProperty(membership, identity, property)
        ) {
          return reply
            .code(404)
            .send({ error: "managed_property_not_found" });
        }
      }
      const now = new Date().toISOString();
      const commitment = propertyCommitmentSchema.parse({
        ...parsed.data,
        id: randomUUID(),
        tenantId,
        status: "scheduled",
        createdBy: identity.uid,
        createdAt: now,
        updatedAt: now,
      });
      await portfolioStore.upsertCommitment(commitment);
      const event = await appendPortfolioEvent(
        request,
        tenantId,
        "property_commitment_created",
        "create_property_commitment",
        commitment.title,
        "Compromiso registrado sin enviar notificaciones externas.",
      );
      return reply.code(201).send({ commitment, event });
    },
  );

  app.get(
    "/v1/tenants/:tenantId/portfolio/brief",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "portfolio.view")) {
        return reply.code(403).send({ error: "portfolio_view_forbidden" });
      }
      const requestedPropertyId = queryParam(request, "propertyId");
      const allProperties = await portfolioStore.listProperties(tenantId);
      const visibleProperties = allProperties.filter((property) =>
        canAccessProperty(membership, identity, property),
      );
      const property = requestedPropertyId
        ? visibleProperties.find((value) => value.id === requestedPropertyId)
        : null;
      if (requestedPropertyId && !property) {
        return reply
          .code(404)
          .send({ error: "managed_property_not_found" });
      }
      const visibleIds = new Set(visibleProperties.map((value) => value.id));
      const [allSystems, allIssues, allCommitments] = await Promise.all([
        portfolioStore.listSystems(tenantId, property?.id),
        portfolioStore.listIssues(tenantId, property?.id),
        portfolioStore.listCommitments(tenantId, property?.id),
      ]);
      const systems = allSystems.filter((value) =>
        visibleIds.has(value.propertyId),
      );
      const issues = allIssues.filter((value) =>
        visibleIds.has(value.propertyId),
      );
      const commitments = allCommitments.filter(
        (value) =>
          value.propertyId === null || visibleIds.has(value.propertyId),
      );
      const now = Date.now();
      const brief = propertyPortfolioBriefSchema.parse({
        generatedAt: new Date(now).toISOString(),
        tenantId,
        property: property ?? null,
        properties: property ? [property] : visibleProperties,
        totals: {
          properties: property ? 1 : visibleProperties.length,
          openIssues: issues.filter((value) => value.status !== "closed").length,
          criticalIssues: issues.filter(
            (value) =>
              value.status !== "closed" && value.priority === "critical",
          ).length,
          systemsRequiringAttention: systems.filter((value) =>
            ["attention", "critical"].includes(value.condition),
          ).length,
          upcomingCommitments: commitments.filter((value) => {
            const nextDate = value.startsAt ?? value.dueAt;
            return (
              value.status === "scheduled" &&
              Boolean(nextDate) &&
              new Date(nextDate!).getTime() >= now
            );
          }).length,
        },
        issues,
        systems,
        commitments,
        grounded: true,
        outboundAllowed: false,
      });
      return { brief };
    },
  );

  app.post("/v1/identity/validate", async (request, reply) => {
    const parsed = ecIdentityValidationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_identity_validation_request",
        details: parsed.error.flatten(),
      });
    }
    if (parsed.data.lookup === "authorized" && !requireAdmin(request, config)) {
      const identity = requireIdentity(request);
      const memberships = (await identityStore.listMemberships()).filter(
        (membership) =>
          membership.userId === identity.uid &&
          membership.status === "active",
      );
      const canUseRegistry = memberships.some(
        (membership) =>
          membership.role === "platform_owner" ||
          membership.permissions.includes("customers.manage"),
      );
      if (!canUseRegistry) {
        return reply
          .code(403)
          .send({ error: "authorized_registry_lookup_forbidden" });
      }
    }
    try {
      const validation =
        parsed.data.lookup === "authorized"
          ? await taxRegistry.validate(parsed.data.identifier)
          : buildLocalIdentityValidation(parsed.data.identifier);
      return {
        validation,
        registryConfigured: taxRegistry.configured,
      };
    } catch (error) {
      if (error instanceof EcuadorIdentityError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
          registryConfigured: taxRegistry.configured,
        });
      }
      throw error;
    }
  });

  async function appendCaseEvent(
    request: FastifyRequest,
    businessCase: BusinessCase,
    values: Pick<
      AuditEvent,
      | "eventName"
      | "actorType"
      | "action"
      | "inputSummary"
      | "decision"
      | "result"
      | "humanApproval"
    >,
  ) {
    const identity = requireIdentity(request);
    const event = auditEventSchema.parse({
      timestamp: new Date().toISOString(),
      eventId: randomUUID(),
      ...values,
      tenantId: businessCase.tenantId,
      customerId: businessCase.customerId,
      caseId: businessCase.id,
      agentId: identity.uid,
      model: null,
      requestReference: request.id,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      durationMs: 0,
      status: "completed",
      error: null,
      evidenceVersion: "1.0",
    });
    await eventStore.append(event);
    request.log.info({ auditEvent: event }, "business case event completed");
    return event;
  }

  function customerKeys(customer: {
    taxId: string;
    phone: string;
    email: string;
  }) {
    return [
      customer.taxId ? `tax:${customer.taxId.replace(/\D/g, "")}` : "",
      customer.phone ? `phone:${customer.phone.replace(/\D/g, "")}` : "",
      customer.email ? `email:${customer.email.trim().toLowerCase()}` : "",
    ].filter((value) => !value.endsWith(":"));
  }

  app.get("/v1/tenants/:tenantId/customers", async (request, reply) => {
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "customers.view")) {
      return reply.code(403).send({ error: "customer_view_forbidden" });
    }
    const customers = await customerStore.list(tenantId);
    return { customers, total: customers.length };
  });

  app.post(
    "/v1/tenants/:tenantId/customers/import",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "customers.manage")) {
        return reply.code(403).send({ error: "customer_import_forbidden" });
      }
      const parsed = customerContactImportRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_customer_import",
          details: parsed.error.flatten(),
        });
      }

      const existing = await customerStore.list(tenantId);
      const knownKeys = new Set(existing.flatMap(customerKeys));
      const now = new Date().toISOString();
      const customers: CustomerContact[] = [];
      let duplicates = 0;
      for (const row of parsed.data.rows) {
        const keys = customerKeys(row);
        if (keys.some((key) => knownKeys.has(key))) {
          duplicates += 1;
          continue;
        }
        keys.forEach((key) => knownKeys.add(key));
        customers.push(
          customerContactSchema.parse({
            ...row,
            id: randomUUID(),
            tenantId,
            source: "spreadsheet",
            sourceFileName: parsed.data.fileName,
            synthetic: parsed.data.synthetic,
            consentStatus: parsed.data.synthetic
              ? "not_applicable_synthetic"
              : "confirmed",
            outboundAllowed: false,
            createdBy: identity.uid,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      await customerStore.upsertMany(customers);

      const event = auditEventSchema.parse({
        timestamp: now,
        eventId: randomUUID(),
        eventName: "contact_import_completed",
        tenantId,
        customerId: null,
        caseId: null,
        agentId: identity.uid,
        actorType: "human",
        action: "import_customer_contacts",
        inputSummary: `${parsed.data.rows.length} filas desde ${redactSensitiveText(parsed.data.fileName).slice(0, 120)}; ${parsed.data.synthetic ? "datos de prueba" : "autorización confirmada"}`,
        decision: "Guardar en el entorno aislado de la empresa y mantener todo contacto saliente bloqueado.",
        result: `${customers.length} contactos importados; ${duplicates} duplicados omitidos.`,
        model: null,
        requestReference: request.id,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        humanApproval: "approved",
        durationMs: 0,
        status: "completed",
        error: null,
        evidenceVersion: "1.0",
      });
      await eventStore.append(event);
      request.log.info(
        { auditEvent: event },
        "customer contact import completed",
      );
      return reply.code(201).send({
        imported: customers.length,
        duplicates,
        total: existing.length + customers.length,
        outboundAllowed: false,
        customers,
      });
    },
  );

  app.get("/v1/tenants/:tenantId/cases", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "cases.view")) {
      return reply.code(403).send({ error: "case_view_forbidden" });
    }
    const cases = await caseStore.list(tenantId);
    return {
      cases:
        membership.role === "customer"
          ? cases.filter(
              (businessCase) =>
                businessCase.customerUserId === identity.uid,
            )
          : cases,
    };
  });

  app.post("/v1/tenants/:tenantId/cases", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "cases.manage")) {
      return reply.code(403).send({ error: "case_management_forbidden" });
    }
    const tenant = await identityStore.getTenant(tenantId);
    if (!tenant) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const parsed = businessCaseCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_case",
        details: parsed.error.flatten(),
      });
    }
    const now = new Date().toISOString();
    const businessCase = businessCaseSchema.parse({
      ...parsed.data,
      id: randomUUID(),
      tenantId,
      playbook: tenant.playbook,
      customerIdentifier: parsed.data.customerIdentifier.replace(/\D/g, ""),
      currentStage: "intake",
      status: "open",
      identityValidation: null,
      quoteAmountUsd: null,
      quoteApproval: "not_requested",
      billingPrepared: false,
      invoiceIssued: false,
      outboundAllowed: false,
      createdBy: identity.uid,
      createdAt: now,
      updatedAt: now,
    });
    await caseStore.upsert(businessCase);
    const event = await appendCaseEvent(request, businessCase, {
      eventName: "case_created",
      actorType: "human",
      action: "create_business_case",
      inputSummary: businessCase.title,
      decision: `Aplicar el flujo ${tenant.playbook}.`,
      result: "Expediente creado sin ejecutar envíos ni facturación.",
      humanApproval: "not_required",
    });
    return reply.code(201).send({ case: businessCase, event });
  });

  app.get(
    "/v1/tenants/:tenantId/cases/:caseId",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "cases.view")) {
        return reply.code(403).send({ error: "case_view_forbidden" });
      }
      const businessCase = await caseStore.get(routeParam(request, "caseId"));
      if (!businessCase || businessCase.tenantId !== tenantId) {
        return reply.code(404).send({ error: "case_not_found" });
      }
      if (
        membership.role === "customer" &&
        businessCase.customerUserId !== identity.uid
      ) {
        return reply.code(404).send({ error: "case_not_found" });
      }
      return {
        case: businessCase,
        playbook: playbookDefinitions[businessCase.playbook],
      };
    },
  );

  app.post(
    "/v1/tenants/:tenantId/cases/:caseId/transitions",
    async (request, reply) => {
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "cases.manage")) {
        return reply.code(403).send({ error: "case_management_forbidden" });
      }
      const parsed = caseTransitionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_case_transition_request",
          details: parsed.error.flatten(),
        });
      }
      if (
        ["approve_quote", "reject_quote"].includes(parsed.data.action) &&
        !hasPermission(membership, "quotes.approve")
      ) {
        return reply.code(403).send({ error: "quote_approval_forbidden" });
      }
      if (
        parsed.data.action === "prepare_billing" &&
        !hasPermission(membership, "billing.prepare")
      ) {
        return reply.code(403).send({ error: "billing_preparation_forbidden" });
      }
      const current = await caseStore.get(routeParam(request, "caseId"));
      if (!current || current.tenantId !== tenantId) {
        return reply.code(404).send({ error: "case_not_found" });
      }
      try {
        const identityValidation =
          parsed.data.action === "validate_identity"
            ? parsed.data.identityLookup === "authorized"
              ? await taxRegistry.validate(current.customerIdentifier)
              : buildLocalIdentityValidation(current.customerIdentifier)
            : undefined;
        const updated = transitionCase(current, {
          ...parsed.data,
          identityValidation,
        });
        await caseStore.upsert(updated);
        const event = await appendCaseEvent(request, updated, {
          eventName:
            parsed.data.action === "validate_identity"
              ? "identity_validation_completed"
              : "workflow_transition_completed",
          actorType: "human",
          action: parsed.data.action,
          inputSummary: parsed.data.note || current.title,
          decision: `${current.currentStage} → ${updated.currentStage}`,
          result: `Expediente actualizado a ${updated.status}.`,
          humanApproval:
            parsed.data.action === "approve_quote"
              ? "approved"
              : parsed.data.action === "reject_quote"
                ? "rejected"
                : parsed.data.action === "prepare_quote"
                  ? "required"
                  : "not_required",
        });
        return { case: updated, event };
      } catch (error) {
        if (error instanceof EcuadorIdentityError) {
          return reply.code(error.statusCode).send({
            error: error.code,
            message: error.message,
          });
        }
        const code =
          error instanceof Error ? error.message : "case_transition_failed";
        if (
          [
            "invalid_case_transition",
            "identity_validation_required",
            "quote_amount_required",
            "billing_preparation_required",
          ].includes(code)
        ) {
          return reply.code(409).send({ error: code });
        }
        throw error;
      }
    },
  );

  app.get("/v1/tenants/:tenantId/members", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const actorMembership = await findActiveMembership(
      identityStore,
      tenantId,
      identity.uid,
    );
    if (!actorMembership || !canManageMembers(actorMembership)) {
      return reply.code(403).send({ error: "member_management_forbidden" });
    }
    const memberships = (await identityStore.listMemberships()).filter(
      (membership) => membership.tenantId === tenantId,
    );
    const members = [];
    for (const membership of memberships) {
      const user = await identityStore.getUser(membership.userId);
      members.push({
        membership,
        user: user
          ? {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoUrl: user.photoUrl,
              status: user.status,
            }
          : null,
      });
    }
    return { members };
  });

  app.get("/v1/tenants/:tenantId/invitations", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const actorMembership = await findActiveMembership(
      identityStore,
      tenantId,
      identity.uid,
    );
    if (!actorMembership || !canManageMembers(actorMembership)) {
      return reply.code(403).send({ error: "member_management_forbidden" });
    }
    return {
      invitations: (await identityStore.listInvitations()).filter(
        (invitation) => invitation.tenantId === tenantId,
      ),
    };
  });

  app.post("/v1/tenants/:tenantId/invitations", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const actorMembership = await findActiveMembership(
      identityStore,
      tenantId,
      identity.uid,
    );
    if (!actorMembership || !canManageMembers(actorMembership)) {
      return reply.code(403).send({ error: "member_management_forbidden" });
    }
    const parsed = invitationCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_invitation",
        details: parsed.error.flatten(),
      });
    }
    const now = new Date().toISOString();
    const email = parsed.data.email.toLowerCase();
    const invitation = invitationSchema.parse({
      id: invitationId(tenantId, email),
      tenantId,
      email,
      role: parsed.data.role,
      permissions: parsed.data.permissions,
      status: "pending",
      invitedBy: identity.uid,
      acceptedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    await identityStore.upsertInvitation(invitation);
    return reply.code(201).send({ invitation });
  });

  app.patch(
    "/v1/tenants/:tenantId/members/:userId",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const userId = routeParam(request, "userId");
      const actorMembership = await findActiveMembership(
        identityStore,
        tenantId,
        identity.uid,
      );
      if (!actorMembership || !canManageMembers(actorMembership)) {
        return reply.code(403).send({ error: "member_management_forbidden" });
      }
      const parsed = memberUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_member_update",
          details: parsed.error.flatten(),
        });
      }
      const id = membershipId(tenantId, userId);
      const existing = await identityStore.getMembership(id);
      if (!existing) {
        return reply.code(404).send({ error: "membership_not_found" });
      }
      if (
        existing.role === "platform_owner" &&
        actorMembership.role !== "platform_owner"
      ) {
        return reply.code(403).send({ error: "platform_owner_protected" });
      }
      const membership = membershipSchema.parse({
        ...existing,
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      });
      await identityStore.upsertMembership(membership);
      return { membership };
    },
  );

  async function getOperationalSettings(tenantId: string, userId: string) {
    const existing = await operationsStore.getSettings(tenantId);
    if (existing) return existing;
    const tenant = await identityStore.getTenant(tenantId);
    if (!tenant) return undefined;
    const settings = tenantOperationalSettingsSchema.parse({
      tenantId,
      defaultTaxRatePct: 15,
      currency: "USD",
      quoteValidityDays: 15,
      paymentTerms: "Forma de pago sujeta a aprobación comercial.",
      warrantyTerms: "Garantía aplicable según equipos, alcance y condiciones aprobadas.",
      branding: {
        legalName: tenant.legalName,
        taxId: "",
        address: "",
        email: "",
        phone: "",
        primaryColor: "#183d34",
        logoDataUrl: "",
      },
      monthlyLimits: {
        inspections: 20,
        photosPerInspection: 20,
        audioMinutesPerInspection: 15,
        documentPagesPerInspection: 25,
        supplierSearchesPerInspection: 2,
        evidenceStorageMb: 512,
      },
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    });
    await operationsStore.upsertSettings(settings);
    return settings;
  }

  app.get("/v1/tenants/:tenantId/operational-settings", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "quotes.view")) {
      return reply.code(403).send({ error: "settings_view_forbidden" });
    }
    const settings = await getOperationalSettings(tenantId, identity.uid);
    if (!settings) return reply.code(404).send({ error: "tenant_not_found" });
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const inspections = (await operationsStore.listInspections(tenantId)).filter(
      (inspection) => inspection.createdAt.startsWith(monthPrefix),
    );
    return {
      settings,
      usage: {
        month: monthPrefix,
        inspections: inspections.length,
        inspectionLimit: settings.monthlyLimits.inspections,
      },
    };
  });

  app.put("/v1/tenants/:tenantId/operational-settings", async (request, reply) => {
    const identity = requireIdentity(request);
    const tenantId = routeParam(request, "tenantId");
    const membership = await tenantMembership(request, tenantId);
    if (!membership || !hasPermission(membership, "tenant.manage")) {
      return reply.code(403).send({ error: "settings_management_forbidden" });
    }
    const parsed = tenantOperationalSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_operational_settings",
        details: parsed.error.flatten(),
      });
    }
    const settings = tenantOperationalSettingsSchema.parse({
      ...parsed.data,
      tenantId,
      updatedBy: identity.uid,
      updatedAt: new Date().toISOString(),
    });
    await operationsStore.upsertSettings(settings);
    return { settings };
  });

  app.get(
    "/v1/tenants/:tenantId/cases/:caseId/inspections",
    async (request, reply) => {
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "cases.view")) {
        return reply.code(403).send({ error: "inspection_view_forbidden" });
      }
      const businessCase = await caseStore.get(routeParam(request, "caseId"));
      if (!businessCase || businessCase.tenantId !== tenantId) {
        return reply.code(404).send({ error: "case_not_found" });
      }
      return {
        inspections: await operationsStore.listInspections(
          tenantId,
          businessCase.id,
        ),
        quotes: await operationsStore.listQuotes(tenantId, businessCase.id),
      };
    },
  );

  app.post(
    "/v1/tenants/:tenantId/cases/:caseId/inspections/analyze",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "cases.manage")) {
        return reply.code(403).send({ error: "inspection_management_forbidden" });
      }
      const businessCase = await caseStore.get(routeParam(request, "caseId"));
      if (!businessCase || businessCase.tenantId !== tenantId) {
        return reply.code(404).send({ error: "case_not_found" });
      }
      const parsed = inspectionAnalyzeRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_inspection_request",
          details: parsed.error.flatten(),
        });
      }
      const settings = await getOperationalSettings(tenantId, identity.uid);
      if (!settings) return reply.code(404).send({ error: "tenant_not_found" });
      const photoCount = parsed.data.evidence.filter(
        (item) => item.kind === "photo",
      ).length;
      if (photoCount > settings.monthlyLimits.photosPerInspection) {
        return reply.code(429).send({ error: "inspection_photo_limit_exceeded" });
      }
      const monthPrefix = new Date().toISOString().slice(0, 7);
      const monthlyCount = (await operationsStore.listInspections(tenantId)).filter(
        (inspection) => inspection.createdAt.startsWith(monthPrefix),
      ).length;
      if (monthlyCount >= settings.monthlyLimits.inspections) {
        return reply.code(429).send({ error: "monthly_inspection_limit_reached" });
      }
      const startedAt = Date.now();
      try {
        const result = config.DEMO_MODE
          ? {
              analysis: buildSyntheticInspectionAnalysis({
                systemType: parsed.data.systemType,
                narrative: parsed.data.narrative,
                evidenceIds: parsed.data.evidence.map((item) => item.id),
              }),
              requestReference: `demo-inspection-${randomUUID()}`,
              inputTokens: null,
              outputTokens: null,
              estimatedCostUsd: null,
            }
          : await gemini.analyzeInspection(parsed.data);
        const now = new Date().toISOString();
        const inspection = inspectionRecordSchema.parse({
          id: randomUUID(),
          tenantId,
          caseId: businessCase.id,
          systemType: parsed.data.systemType,
          title: parsed.data.title,
          siteName: parsed.data.siteName,
          narrative: parsed.data.narrative,
          evidence: parsed.data.evidence.map(({ dataBase64: _data, ...metadata }) => metadata),
          analysis: result.analysis,
          status: "draft",
          synthetic: parsed.data.synthetic || config.DEMO_MODE,
          createdBy: identity.uid,
          createdAt: now,
          updatedAt: now,
        });
        await operationsStore.upsertInspection(inspection);
        const event = auditEventSchema.parse({
          timestamp: now,
          eventId: randomUUID(),
          eventName: config.DEMO_MODE
            ? "findings_structured"
            : "gemini_analysis_completed",
          tenantId,
          customerId: businessCase.customerId,
          caseId: businessCase.id,
          agentId: "inspection-agent-v1",
          actorType: "agent",
          action: "analyze_multimodal_inspection",
          inputSummary: redactSensitiveText(parsed.data.narrative).slice(0, 500),
          decision: result.analysis.recommendedActions[0] ?? "Solicitar revisión técnica.",
          result: result.analysis.executiveSummary,
          model: config.DEMO_MODE ? "deterministic-demo" : config.GEMINI_MODEL,
          requestReference: result.requestReference,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: result.estimatedCostUsd,
          humanApproval: "required",
          durationMs: Date.now() - startedAt,
          status: "completed",
          error: null,
          evidenceVersion: "1.0",
        });
        await eventStore.append(event);
        return reply.code(201).send({ inspection, event });
      } catch (error) {
        request.log.error({ err: error }, "inspection analysis failed");
        return reply.code(502).send({ error: "inspection_analysis_failed" });
      }
    },
  );

  app.post(
    "/v1/tenants/:tenantId/cases/:caseId/quotes",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "quotes.manage")) {
        return reply.code(403).send({ error: "quote_management_forbidden" });
      }
      const businessCase = await caseStore.get(routeParam(request, "caseId"));
      if (!businessCase || businessCase.tenantId !== tenantId) {
        return reply.code(404).send({ error: "case_not_found" });
      }
      const parsed = quoteDraftCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_quote", details: parsed.error.flatten() });
      }
      const inspection = await operationsStore.getInspection(parsed.data.inspectionId);
      if (!inspection || inspection.tenantId !== tenantId || inspection.caseId !== businessCase.id) {
        return reply.code(404).send({ error: "inspection_not_found" });
      }
      const settings = await getOperationalSettings(tenantId, identity.uid);
      if (!settings) return reply.code(404).send({ error: "tenant_not_found" });
      const existing = await operationsStore.listQuotes(tenantId);
      const now = new Date().toISOString();
      const quote = buildQuoteDocument({
        id: randomUUID(),
        sequence: existing.length + 1,
        tenantId,
        caseId: businessCase.id,
        inspectionId: inspection.id,
        customerName: businessCase.customerName,
        customerIdentifier: businessCase.customerIdentifier,
        createdBy: identity.uid,
        now,
        settings,
        draft: parsed.data,
      });
      await operationsStore.upsertQuote(quote);
      await appendCaseEvent(request, businessCase, {
        eventName: "quote_generated",
        actorType: "human",
        action: "prepare_itemized_quote",
        inputSummary: `${quote.items.length} líneas; IVA ${quote.taxRatePct}%`,
        decision: "Solicitar aprobación humana antes de compartir.",
        result: `${quote.quoteNumber} preparada por USD ${quote.totalUsd.toFixed(2)}.`,
        humanApproval: "required",
      });
      return reply.code(201).send({ quote, settings });
    },
  );

  app.post(
    "/v1/tenants/:tenantId/cases/:caseId/delivery-drafts",
    async (request, reply) => {
      const identity = requireIdentity(request);
      const tenantId = routeParam(request, "tenantId");
      const membership = await tenantMembership(request, tenantId);
      if (!membership || !hasPermission(membership, "messages.prepare")) {
        return reply.code(403).send({ error: "message_preparation_forbidden" });
      }
      const businessCase = await caseStore.get(routeParam(request, "caseId"));
      if (!businessCase || businessCase.tenantId !== tenantId) {
        return reply.code(404).send({ error: "case_not_found" });
      }
      const parsed = deliveryDraftCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_delivery_draft", details: parsed.error.flatten() });
      }
      const quote = await operationsStore.getQuote(parsed.data.quoteId);
      if (!quote || quote.tenantId !== tenantId || quote.caseId !== businessCase.id) {
        return reply.code(404).send({ error: "quote_not_found" });
      }
      const draft = deliveryDraftSchema.parse({
        ...parsed.data,
        id: randomUUID(),
        tenantId,
        caseId: businessCase.id,
        status: "awaiting_approval",
        sent: false,
        createdBy: identity.uid,
        createdAt: new Date().toISOString(),
      });
      await operationsStore.upsertDeliveryDraft(draft);
      await appendCaseEvent(request, businessCase, {
        eventName: "human_approval_requested",
        actorType: "human",
        action: `prepare_${draft.channel}_draft`,
        inputSummary: `${draft.channel}: ${draft.recipient}`,
        decision: "Mantener el mensaje bloqueado hasta aprobación y habilitación del canal.",
        result: "Borrador preparado; no se realizó ningún envío.",
        humanApproval: "required",
      });
      return reply.code(201).send({ draft, outboundEnabled: config.OUTBOUND_ENABLED });
    },
  );

  app.get("/v1/demo/overview", async () => overview);

  function filterSyntheticContacts(
    request: FastifyRequest,
  ): readonly SyntheticContact[] {
    const query =
      typeof request.query === "object" && request.query ? request.query : {};
    const tenantId =
      "tenantId" in query && typeof query.tenantId === "string"
        ? query.tenantId
        : undefined;
    const playbook =
      "playbook" in query && typeof query.playbook === "string"
        ? query.playbook
        : undefined;
    return syntheticContacts.filter(
      (contact) =>
        (!tenantId || contact.tenantId === tenantId) &&
        (!playbook || contact.playbook === playbook),
    );
  }

  app.get("/v1/demo/contacts", async (request) => {
    const contacts = filterSyntheticContacts(request);
    return {
      synthetic: true,
      outboundAllowed: false,
      total: contacts.length,
      contacts,
    };
  });

  app.get("/v1/demo/contacts.csv", async (request, reply) => {
    const contacts = filterSyntheticContacts(request);
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header(
        "content-disposition",
        'attachment; filename="fieldspark-synthetic-contacts.csv"',
      )
      .send(contactsToCsv(contacts));
  });

  function findSyntheticContact(request: FastifyRequest) {
    const params =
      typeof request.params === "object" && request.params
        ? (request.params as Record<string, unknown>)
        : {};
    const contactId =
      typeof params.contactId === "string" ? params.contactId : "";
    return syntheticContacts.find((contact) => contact.id === contactId);
  }

  function defaultWorkflow(contact: SyntheticContact): DemoWorkflow {
    const analysis =
      contact.status === "approval_required" ||
      contact.status === "billing_review"
        ? buildDemoAnalysis({
            tenantId: contact.tenantId,
            customerId: contact.id,
            caseId: `demo-case-${contact.id}`,
            playbook: contact.playbook,
            channel: contact.channel === "email" ? "form" : contact.channel,
            message: `${contact.opportunity}. ${contact.nextAction}`,
          })
        : null;
    const status =
      contact.status === "approval_required"
        ? "awaiting_approval"
        : contact.status === "billing_review"
          ? "billing_review"
          : "new";
    return demoWorkflowSchema.parse({
      id: `demo-case-${contact.id}`,
      contactId: contact.id,
      tenantId: contact.tenantId,
      playbook: contact.playbook,
      status,
      synthetic: true,
      outboundAllowed: false,
      invoiceIssued: false,
      approvalStatus:
        status === "awaiting_approval"
          ? "pending"
          : status === "billing_review"
            ? "approved"
            : "not_requested",
      billingStatus:
        status === "billing_review" ? "ready_for_review" : "none",
      analysis,
      draftReply: analysis?.draftReply ?? "",
      createdAt: contact.lastInteractionAt,
      updatedAt: contact.lastInteractionAt,
    });
  }

  async function getWorkflow(contact: SyntheticContact) {
    return (await workflowStore.get(contact.id)) ?? defaultWorkflow(contact);
  }

  async function appendWorkflowEvent(
    request: FastifyRequest,
    workflow: DemoWorkflow,
    values: Pick<
      AuditEvent,
      | "eventName"
      | "actorType"
      | "action"
      | "inputSummary"
      | "decision"
      | "result"
      | "humanApproval"
    >,
  ) {
    const event = auditEventSchema.parse({
      timestamp: new Date().toISOString(),
      eventId: randomUUID(),
      ...values,
      tenantId: workflow.tenantId,
      customerId: workflow.contactId,
      caseId: workflow.id,
      agentId:
        values.actorType === "human"
          ? "demo-reviewer"
          : "continuity-agent-v1",
      model:
        values.actorType === "agent" ? "deterministic-safe-demo" : null,
      requestReference: `demo-workflow-${randomUUID()}`,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: 0,
      durationMs: 0,
      status: "completed",
      error: null,
      evidenceVersion: "1.0",
    });
    await eventStore.append(event);
    request.log.info({ auditEvent: event }, "demo workflow event completed");
    return event;
  }

  app.get("/v1/demo/workflows", async () => {
    const stored = new Map(
      (await workflowStore.list()).map((workflow) => [
        workflow.contactId,
        workflow,
      ]),
    );
    const workflows = syntheticContacts.map(
      (contact) => stored.get(contact.id) ?? defaultWorkflow(contact),
    );
    return {
      synthetic: true,
      outboundAllowed: false,
      invoiceIssued: false,
      total: workflows.length,
      workflows,
    };
  });

  app.get("/v1/demo/workflows/:contactId", async (request, reply) => {
    const contact = findSyntheticContact(request);
    if (!contact) {
      return reply.code(404).send({ error: "synthetic_contact_not_found" });
    }
    return {
      synthetic: true,
      outboundAllowed: false,
      invoiceIssued: false,
      workflow: await getWorkflow(contact),
    };
  });

  app.post(
    "/v1/demo/workflows/:contactId/analyze",
    async (request, reply) => {
      const contact = findSyntheticContact(request);
      if (!contact) {
        return reply.code(404).send({ error: "synthetic_contact_not_found" });
      }
      const previous = await getWorkflow(contact);
      const analysis = buildDemoAnalysis({
        tenantId: contact.tenantId,
        customerId: contact.id,
        caseId: previous.id,
        playbook: contact.playbook,
        channel: contact.channel === "email" ? "form" : contact.channel,
        message: `${contact.opportunity}. ${contact.nextAction}`,
      });
      const now = new Date().toISOString();
      const workflow = demoWorkflowSchema.parse({
        ...previous,
        status: "awaiting_approval",
        approvalStatus: "pending",
        billingStatus: "none",
        analysis,
        draftReply: analysis.draftReply,
        updatedAt: now,
      });
      await workflowStore.upsert(workflow);
      const event = await appendWorkflowEvent(request, workflow, {
        eventName: "agent_decision_completed",
        actorType: "agent",
        action: "analyze_synthetic_opportunity",
        inputSummary: `${contact.opportunity}. ${contact.nextAction}`,
        decision: analysis.nextBestAction,
        result: "Borrador preparado para revisión humana; ningún envío ejecutado.",
        humanApproval: "required",
      });
      return {
        synthetic: true,
        outboundAllowed: false,
        invoiceIssued: false,
        workflow,
        event,
      };
    },
  );

  app.post(
    "/v1/demo/workflows/:contactId/draft",
    async (request, reply) => {
      const contact = findSyntheticContact(request);
      if (!contact) {
        return reply.code(404).send({ error: "synthetic_contact_not_found" });
      }
      const parsed = demoDraftUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "invalid_draft", details: parsed.error.flatten() });
      }
      const previous = await getWorkflow(contact);
      if (!previous.analysis || previous.status !== "awaiting_approval") {
        return reply.code(409).send({ error: "analysis_required" });
      }
      const workflow = demoWorkflowSchema.parse({
        ...previous,
        analysis: { ...previous.analysis, draftReply: parsed.data.draftReply },
        draftReply: parsed.data.draftReply,
        updatedAt: new Date().toISOString(),
      });
      await workflowStore.upsert(workflow);
      const event = await appendWorkflowEvent(request, workflow, {
        eventName: "human_approval_requested",
        actorType: "human",
        action: "edit_synthetic_draft",
        inputSummary: "El revisor actualizó el borrador sintético.",
        decision: "Mantener el caso en espera de aprobación.",
        result: "Borrador guardado; ningún envío ejecutado.",
        humanApproval: "required",
      });
      return {
        synthetic: true,
        outboundAllowed: false,
        invoiceIssued: false,
        workflow,
        event,
      };
    },
  );

  app.post(
    "/v1/demo/workflows/:contactId/approve",
    async (request, reply) => {
      const contact = findSyntheticContact(request);
      if (!contact) {
        return reply.code(404).send({ error: "synthetic_contact_not_found" });
      }
      const previous = await getWorkflow(contact);
      if (!previous.analysis || previous.status !== "awaiting_approval") {
        return reply.code(409).send({ error: "analysis_required" });
      }
      const workflow = demoWorkflowSchema.parse({
        ...previous,
        status: "approved",
        approvalStatus: "approved",
        updatedAt: new Date().toISOString(),
      });
      await workflowStore.upsert(workflow);
      const event = await appendWorkflowEvent(request, workflow, {
        eventName: "human_approval_completed",
        actorType: "human",
        action: "approve_synthetic_draft",
        inputSummary: "Borrador sintético revisado.",
        decision: "Aprobar la propuesta sin enviarla.",
        result: "Aprobación registrada; outbound permanece bloqueado.",
        humanApproval: "approved",
      });
      return {
        synthetic: true,
        outboundAllowed: false,
        invoiceIssued: false,
        workflow,
        event,
      };
    },
  );

  app.post(
    "/v1/demo/workflows/:contactId/reject",
    async (request, reply) => {
      const contact = findSyntheticContact(request);
      if (!contact) {
        return reply.code(404).send({ error: "synthetic_contact_not_found" });
      }
      const previous = await getWorkflow(contact);
      if (!previous.analysis || previous.status !== "awaiting_approval") {
        return reply.code(409).send({ error: "analysis_required" });
      }
      const workflow = demoWorkflowSchema.parse({
        ...previous,
        status: "rejected",
        approvalStatus: "rejected",
        updatedAt: new Date().toISOString(),
      });
      await workflowStore.upsert(workflow);
      const event = await appendWorkflowEvent(request, workflow, {
        eventName: "human_approval_completed",
        actorType: "human",
        action: "reject_synthetic_draft",
        inputSummary: "Borrador sintético revisado.",
        decision: "Rechazar y devolver el caso para un nuevo análisis.",
        result: "Rechazo registrado; ningún envío ejecutado.",
        humanApproval: "rejected",
      });
      return {
        synthetic: true,
        outboundAllowed: false,
        invoiceIssued: false,
        workflow,
        event,
      };
    },
  );

  app.post(
    "/v1/demo/workflows/:contactId/billing-review",
    async (request, reply) => {
      const contact = findSyntheticContact(request);
      if (!contact) {
        return reply.code(404).send({ error: "synthetic_contact_not_found" });
      }
      const previous = await getWorkflow(contact);
      if (previous.status !== "approved") {
        return reply.code(409).send({ error: "approval_required" });
      }
      const workflow = demoWorkflowSchema.parse({
        ...previous,
        status: "billing_review",
        billingStatus: "ready_for_review",
        updatedAt: new Date().toISOString(),
      });
      await workflowStore.upsert(workflow);
      const event = await appendWorkflowEvent(request, workflow, {
        eventName: "billing_item_prepared",
        actorType: "agent",
        action: "prepare_synthetic_billing_item",
        inputSummary: `${contact.opportunity}: USD ${contact.estimatedValueUsd}`,
        decision: "Preparar un ítem para revisión administrativa.",
        result: "Ítem en cola; no se creó factura electrónica.",
        humanApproval: "required",
      });
      return {
        synthetic: true,
        outboundAllowed: false,
        invoiceIssued: false,
        workflow,
        event,
      };
    },
  );

  app.get("/v1/demo/contacts/seed-status", async (request, reply) => {
    if (!requireAdmin(request, config)) {
      return reply.code(401).send({ error: "admin_key_required" });
    }
    const stored = await contactStore.list();
    return {
      synthetic: true,
      outboundAllowed: false,
      stored: stored.length,
      tenants: {
        studio: stored.filter((contact) => contact.tenantId === "studio-demo")
          .length,
        iapro: stored.filter((contact) => contact.tenantId === "iapro-demo")
          .length,
      },
    };
  });

  app.post("/v1/demo/contacts/seed", async (request, reply) => {
    if (!requireAdmin(request, config)) {
      return reply.code(401).send({ error: "admin_key_required" });
    }
    const startedAt = Date.now();
    const stored = await contactStore.upsertMany(syntheticContacts);
    const event: AuditEvent = auditEventSchema.parse({
      timestamp: new Date().toISOString(),
      eventId: randomUUID(),
      eventName: "contact_import_completed",
      tenantId: "synthetic-seed",
      customerId: null,
      caseId: null,
      agentId: "seed-agent-v1",
      actorType: "system",
      action: "seed_synthetic_contacts",
      inputSummary: `${syntheticContacts.length} synthetic contacts from the versioned seed`,
      decision: "Persist test-only contacts with outbound delivery blocked",
      result: `${stored} synthetic contacts available in the contact store`,
      model: null,
      requestReference: null,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      humanApproval: "not_required",
      durationMs: Date.now() - startedAt,
      status: "completed",
      error: null,
      evidenceVersion: "1.0",
    });
    await eventStore.append(event);
    request.log.info({ auditEvent: event }, "synthetic contact seed completed");
    return {
      synthetic: true,
      seeded: syntheticContacts.length,
      stored,
      outboundAllowed: false,
      tenants: { studio: 10, iapro: 10 },
      event,
    };
  });

  app.get("/v1/events", async (request, reply) => {
    if (!requireAdmin(request, config)) {
      return reply.code(401).send({ error: "admin_key_required" });
    }
    const tenantId =
      typeof request.query === "object" &&
      request.query &&
      "tenantId" in request.query &&
      typeof request.query.tenantId === "string"
        ? request.query.tenantId
        : undefined;
    return { events: await eventStore.list(tenantId) };
  });

  app.get("/v1/ai/usage", async (request, reply) => {
    if (!requireAdmin(request, config)) {
      return reply.code(401).send({ error: "admin_key_required" });
    }
    const tenantId =
      typeof request.query === "object" &&
      request.query &&
      "tenantId" in request.query &&
      typeof request.query.tenantId === "string"
        ? request.query.tenantId
        : undefined;
    const events = (await eventStore.list(tenantId)).filter(
      (event) => event.eventName === "gemini_analysis_completed",
    );
    const byTenant = new Map<
      string,
      {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        estimatedCostUsd: number;
        durationMs: number;
      }
    >();
    for (const event of events) {
      const aggregate = byTenant.get(event.tenantId) ?? {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        durationMs: 0,
      };
      aggregate.requests += 1;
      aggregate.inputTokens += event.inputTokens ?? 0;
      aggregate.outputTokens += event.outputTokens ?? 0;
      aggregate.estimatedCostUsd += event.estimatedCostUsd ?? 0;
      aggregate.durationMs += event.durationMs;
      byTenant.set(event.tenantId, aggregate);
    }
    const tenants = [...byTenant.entries()].map(([id, aggregate]) => ({
      tenantId: id,
      requests: aggregate.requests,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      estimatedCostUsd: Number(aggregate.estimatedCostUsd.toFixed(8)),
      averageDurationMs:
        aggregate.requests === 0
          ? 0
          : Math.round(aggregate.durationMs / aggregate.requests),
    }));
    return {
      provider: config.GEMINI_PROVIDER,
      model: config.GEMINI_MODEL,
      pricingUsdPerMillionTokens: {
        input: config.GEMINI_INPUT_USD_PER_MILLION,
        output: config.GEMINI_OUTPUT_USD_PER_MILLION,
      },
      maxOutputTokensPerRequest: config.GEMINI_MAX_OUTPUT_TOKENS,
      thinkingLevelPerRequest: config.GEMINI_THINKING_LEVEL,
      sourceEventWindow: 100,
      totals: {
        requests: tenants.reduce((sum, tenant) => sum + tenant.requests, 0),
        inputTokens: tenants.reduce(
          (sum, tenant) => sum + tenant.inputTokens,
          0,
        ),
        outputTokens: tenants.reduce(
          (sum, tenant) => sum + tenant.outputTokens,
          0,
        ),
        estimatedCostUsd: Number(
          tenants
            .reduce((sum, tenant) => sum + tenant.estimatedCostUsd, 0)
            .toFixed(8),
        ),
      },
      tenants,
    };
  });

  app.post("/v1/cases/analyze", async (request, reply) => {
    if (!config.DEMO_MODE && !requireAdmin(request, config)) {
      return reply.code(401).send({ error: "admin_key_required" });
    }

    const parsed = analyzeCaseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }

    const startedAt = Date.now();
    try {
      const result = config.DEMO_MODE
        ? {
            analysis: buildDemoAnalysis(parsed.data),
            requestReference: `demo-${randomUUID()}`,
            inputTokens: null,
            outputTokens: null,
            estimatedCostUsd: null,
          }
        : await gemini.analyze(parsed.data);

      const event: AuditEvent = auditEventSchema.parse({
        timestamp: new Date().toISOString(),
        eventId: randomUUID(),
        eventName: config.DEMO_MODE
          ? "agent_decision_completed"
          : "gemini_analysis_completed",
        tenantId: parsed.data.tenantId,
        customerId: parsed.data.customerId,
        caseId: parsed.data.caseId,
        agentId: "intake-agent-v1",
        actorType: "agent",
        action: "analyze_customer_request",
        inputSummary: redactSensitiveText(parsed.data.message).slice(0, 500),
        decision: result.analysis.nextBestAction,
        result: result.analysis.summary,
        model: config.DEMO_MODE ? "deterministic-demo" : config.GEMINI_MODEL,
        requestReference: result.requestReference,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        humanApproval: result.analysis.requiresHumanApproval
          ? "required"
          : "not_required",
        durationMs: Date.now() - startedAt,
        status: "completed",
        error: null,
        evidenceVersion: "1.0",
      });

      await eventStore.append(event);
      request.log.info({ auditEvent: event }, "agent decision completed");
      return { synthetic: config.DEMO_MODE, analysis: result.analysis, event };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      request.log.error({ err: error }, "agent decision failed");
      return reply.code(502).send({ error: "analysis_failed", message });
    }
  });

  app.post("/v1/gemini/verify", async (request, reply) => {
    if (config.DEMO_MODE) {
      return reply.code(409).send({
        error: "demo_mode_enabled",
        message: "Set DEMO_MODE=false to execute and evidence a real Gemini call.",
      });
    }
    if (!requireAdmin(request, config)) {
      return reply.code(401).send({ error: "admin_key_required" });
    }

    const payload: AnalyzeCaseRequest = {
      tenantId: "pcdoctor-ai",
      customerId: "verification-customer",
      caseId: `verification-${Date.now()}`,
      playbook: "iapro",
      channel: "form",
      message:
        "A small service company needs to document its maintenance process. " +
        "Classify the request and identify the minimum discovery questions.",
    };

    return app.inject({
      method: "POST",
      url: "/v1/cases/analyze",
      headers: { "x-admin-key": config.API_ADMIN_KEY },
      payload,
    }).then((response) => {
      reply.code(response.statusCode);
      return response.json();
    });
  });

  return app;
}
