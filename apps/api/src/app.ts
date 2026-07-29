import { randomUUID, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  analyzeCaseRequestSchema,
  auditEventSchema,
  syntheticContacts,
  type AnalyzeCaseRequest,
  type AuditEvent,
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
