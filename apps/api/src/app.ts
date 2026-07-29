import { randomUUID, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  analyzeCaseRequestSchema,
  auditEventSchema,
  demoDraftUpdateSchema,
  demoWorkflowSchema,
  syntheticContacts,
  type AnalyzeCaseRequest,
  type AuditEvent,
  type DemoWorkflow,
  type SyntheticContact,
} from "@fieldspark/contracts";
import Fastify, { type FastifyRequest } from "fastify";
import { contactsToCsv } from "./contact-csv.js";
import { createContactStore } from "./contact-store.js";
import { loadConfig, type AppConfig } from "./config.js";
import { buildDemoAnalysis, overview } from "./demo.js";
import { createEventStore } from "./event-store.js";
import { GeminiService } from "./gemini.js";
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
) {
  const config = loadConfig(overrides);
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "req.headers.x-admin-key"],
    },
    requestIdHeader: "x-request-id",
  });
  const eventStore = createEventStore(config);
  const contactStore = createContactStore(config);
  const workflowStore = createWorkflowStore(config);
  const gemini = new GeminiService(config);

  await app.register(cors, {
    origin: config.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST"],
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  const healthResponse = async () => ({
    status: "ok",
    service: "fieldspark-api",
    demoMode: config.DEMO_MODE,
    outboundEnabled: config.OUTBOUND_ENABLED,
    invoicingEnabled: config.INVOICING_ENABLED,
  });

  app.get("/health", healthResponse);
  app.get("/healthz", healthResponse);

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
        estimatedCostUsd: null,
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
