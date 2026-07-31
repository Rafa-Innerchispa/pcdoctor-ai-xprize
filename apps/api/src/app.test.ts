import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import type { AuthVerifier } from "./auth.js";
import {
  isValidEcuadorCedula,
  isValidEcuadorRuc,
} from "./ecuador-identity.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});

describe("FieldSpark API", () => {
  it("validates Ecuadorian cedula and RUC checksums without network access", async () => {
    expect(isValidEcuadorCedula("0100000009")).toBe(true);
    expect(isValidEcuadorRuc("0100000009001")).toBe(true);
    expect(isValidEcuadorRuc("0190000001001")).toBe(true);
    expect(isValidEcuadorRuc("0160000000001")).toBe(true);
    expect(isValidEcuadorCedula("0100000008")).toBe(false);

    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);
    const session = await app.inject({ method: "GET", url: "/v1/session" });
    expect(session.statusCode).toBe(200);

    const valid = await app.inject({
      method: "POST",
      url: "/v1/identity/validate",
      payload: { identifier: "0100000009", lookup: "local" },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toMatchObject({
      registryConfigured: false,
      validation: {
        identifier: "0100000009",
        identifierType: "cedula",
        locallyValid: true,
        registryVerified: false,
        source: "local_checksum",
      },
    });

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/identity/validate",
      payload: { identifier: "0100000008", lookup: "local" },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error).toBe("invalid_ec_identifier");
  });

  it("uses the authorized RUC provider with bounded credentials and cache", async () => {
    let lookupAttempts = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith("/v1/deuna/creacion-token")) {
        return new Response(
          JSON.stringify({ data: { response: "opaque-test-token" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      lookupAttempts += 1;
      if (lookupAttempts === 1) {
        throw new TypeError("synthetic transient network failure");
      }
      return new Response(
        JSON.stringify({
          data: {
            main: [
              {
                numeroRuc: "0190000001001",
                razonSocial: "Empresa Sintética Verificada S.A.S.",
                nombreComercial: "Empresa Sintética",
                actividadContribuyente: "Pruebas controladas",
                identificacionLegal: "must-not-be-exposed",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp({
      NODE_ENV: "test",
      RUC_API_LIVE_ENABLED: "true",
      RUC_API_TOKEN_BASE_URL: "https://token.example.invalid",
      RUC_API_LOOKUP_BASE_URL: "https://registry.example.invalid",
      RUC_API_USERNAME: "synthetic-user",
      RUC_API_PASSWORD: "synthetic-password",
    });
    apps.push(app);
    await app.inject({ method: "GET", url: "/v1/session" });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/identity/validate",
        payload: { identifier: "0190000001001", lookup: "authorized" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().validation).toMatchObject({
        identifierType: "ruc",
        registryVerified: true,
        legalName: "Empresa Sintética Verificada S.A.S.",
        source: "authorized_registry",
      });
      expect(JSON.stringify(response.json())).not.toContain(
        "identificacionLegal",
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports safe defaults", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      demoMode: true,
      outboundEnabled: false,
      invoicingEnabled: false,
    });

    const compatibilityResponse = await app.inject({
      method: "GET",
      url: "/healthz",
    });
    expect(compatibilityResponse.statusCode).toBe(200);
  });

  it("produces a deterministic and redacted demo decision", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/cases/analyze",
      payload: {
        tenantId: "studio-demo",
        customerId: "customer-001",
        caseId: "case-001",
        playbook: "photography_studio",
        channel: "whatsapp",
        message: "Mi teléfono es 0991234567 y quiero una sesión familiar.",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.synthetic).toBe(true);
    expect(body.event.inputSummary).toContain("[REDACTED_PHONE]");
    expect(body.event.humanApproval).toBe("required");
  });

  it("serves test-only contacts and an Excel-compatible CSV", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/demo/contacts?playbook=photography_studio",
    });
    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json();
    expect(list.total).toBe(10);
    expect(list.synthetic).toBe(true);
    expect(list.outboundAllowed).toBe(false);
    expect(list.contacts).toHaveLength(10);
    expect(
      list.contacts.every(
        (contact: {
          email: string;
          phone: string;
          outboundAllowed: boolean;
        }) =>
          contact.email.endsWith("@example.invalid") &&
          contact.phone.startsWith("+593000000") &&
          !contact.outboundAllowed,
      ),
    ).toBe(true);

    const csvResponse = await app.inject({
      method: "GET",
      url: "/v1/demo/contacts.csv",
    });
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers["content-type"]).toContain("text/csv");
    expect(csvResponse.body.split("\r\n")).toHaveLength(21);
    expect(csvResponse.body).toContain("not_applicable_synthetic");
  });

  it("requires an admin key and seeds contacts idempotently", async () => {
    const adminKey = "synthetic-admin-key-1234567890";
    const app = await buildApp({
      NODE_ENV: "test",
      API_ADMIN_KEY: adminKey,
    });
    apps.push(app);

    const blocked = await app.inject({
      method: "POST",
      url: "/v1/demo/contacts/seed",
    });
    expect(blocked.statusCode).toBe(401);

    const firstSeed = await app.inject({
      method: "POST",
      url: "/v1/demo/contacts/seed",
      headers: { "x-admin-key": adminKey },
    });
    expect(firstSeed.statusCode).toBe(200);
    expect(firstSeed.json()).toMatchObject({
      synthetic: true,
      seeded: 20,
      stored: 20,
      outboundAllowed: false,
      tenants: { studio: 10, iapro: 10 },
    });

    const secondSeed = await app.inject({
      method: "POST",
      url: "/v1/demo/contacts/seed",
      headers: { "x-admin-key": adminKey },
    });
    expect(secondSeed.statusCode).toBe(200);
    expect(secondSeed.json().stored).toBe(20);

    const status = await app.inject({
      method: "GET",
      url: "/v1/demo/contacts/seed-status",
      headers: { "x-admin-key": adminKey },
    });
    expect(status.json()).toMatchObject({
      stored: 20,
      tenants: { studio: 10, iapro: 10 },
    });
  });

  it("runs a bounded synthetic workflow without outbound or invoicing", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);

    const initial = await app.inject({
      method: "GET",
      url: "/v1/demo/workflows/studio-test-001",
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().workflow.status).toBe("new");

    const analyzed = await app.inject({
      method: "POST",
      url: "/v1/demo/workflows/studio-test-001/analyze",
    });
    expect(analyzed.statusCode).toBe(200);
    expect(analyzed.json()).toMatchObject({
      synthetic: true,
      outboundAllowed: false,
      invoiceIssued: false,
      workflow: {
        status: "awaiting_approval",
        approvalStatus: "pending",
      },
    });

    const edited = await app.inject({
      method: "POST",
      url: "/v1/demo/workflows/studio-test-001/draft",
      payload: {
        draftReply:
          "Borrador sintético editado y listo para revisión antes de cualquier envío.",
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().workflow.draftReply).toContain("editado");

    const approved = await app.inject({
      method: "POST",
      url: "/v1/demo/workflows/studio-test-001/approve",
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      outboundAllowed: false,
      workflow: { status: "approved", approvalStatus: "approved" },
    });

    const billing = await app.inject({
      method: "POST",
      url: "/v1/demo/workflows/studio-test-001/billing-review",
    });
    expect(billing.statusCode).toBe(200);
    expect(billing.json()).toMatchObject({
      invoiceIssued: false,
      workflow: {
        status: "billing_review",
        billingStatus: "ready_for_review",
      },
    });
  });

  it("rejects unknown contacts and prevents billing without approval", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/demo/workflows/not-a-contact/analyze",
    });
    expect(unknown.statusCode).toBe(404);

    const prematureBilling = await app.inject({
      method: "POST",
      url: "/v1/demo/workflows/iapro-test-001/billing-review",
    });
    expect(prematureBilling.statusCode).toBe(409);
    expect(prematureBilling.json().error).toBe("approval_required");
  });

  it("blocks real Gemini verification while demo mode is enabled", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/gemini/verify",
    });
    expect(response.statusCode).toBe(409);
  });

  it.each([
    ["pcdoctor-ec", "pcdoctor"],
    ["iapro-ec", "iapro"],
    ["studio-pilot", "photography_studio"],
    ["servifran-pilot", "condominium_management"],
  ] as const)(
    "runs the complete guarded case journey for %s",
    async (tenantId, playbook) => {
      const app = await buildApp({ NODE_ENV: "test" });
      apps.push(app);
      const session = await app.inject({ method: "GET", url: "/v1/session" });
      expect(session.statusCode).toBe(200);
      expect(
        session
          .json()
          .memberships.some(
            (entry: { tenant: { id: string } }) =>
              entry.tenant.id === tenantId,
          ),
      ).toBe(true);

      const created = await app.inject({
        method: "POST",
        url: `/v1/tenants/${tenantId}/cases`,
        payload: {
          customerId: `customer-${tenantId}`,
          customerName: `Cliente ${tenantId}`,
          customerIdentifier: "0100000009",
          title: `Solicitud ${tenantId}`,
          description: "Expediente sintético para probar el recorrido completo.",
          synthetic: true,
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().case).toMatchObject({
        tenantId,
        playbook,
        currentStage: "intake",
        outboundAllowed: false,
        invoiceIssued: false,
      });
      const caseId = created.json().case.id as string;

      const actions = [
        { action: "complete_intake", stage: "identity" },
        { action: "validate_identity", stage: "discovery" },
        { action: "complete_discovery", stage: "quote" },
        {
          action: "prepare_quote",
          quoteAmountUsd: 250,
          stage: "approval",
        },
        { action: "approve_quote", stage: "service" },
        { action: "complete_service", stage: "billing" },
        { action: "prepare_billing", stage: "billing" },
        { action: "close_case", stage: "completed" },
      ] as const;

      for (const transition of actions) {
        const response = await app.inject({
          method: "POST",
          url: `/v1/tenants/${tenantId}/cases/${caseId}/transitions`,
          payload: transition,
        });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().case.currentStage).toBe(transition.stage);
        expect(response.json().case.invoiceIssued).toBe(false);
        expect(response.json().case.outboundAllowed).toBe(false);
      }

      const wrongTenant = await app.inject({
        method: "GET",
        url: `/v1/tenants/${
          tenantId === "pcdoctor-ec" ? "iapro-ec" : "pcdoctor-ec"
        }/cases/${caseId}`,
      });
      expect(wrongTenant.statusCode).toBe(404);
    },
  );

  it("builds an isolated SERVIFRAN portfolio brief from operational records", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);
    await app.inject({ method: "GET", url: "/v1/session" });

    const created = await app.inject({
      method: "POST",
      url: "/v1/tenants/servifran-pilot/properties",
      payload: {
        name: "Villa Blanca sintética",
        propertyType: "urbanization",
        city: "Guayaquil",
        address: "Dirección sintética",
        unitCount: 120,
        administratorName: "Administrador de prueba",
        synthetic: true,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().property).toMatchObject({
      tenantId: "servifran-pilot",
      name: "Villa Blanca sintética",
      status: "onboarding",
      synthetic: true,
    });
    const propertyId = created.json().property.id as string;

    const system = await app.inject({
      method: "POST",
      url: `/v1/tenants/servifran-pilot/properties/${propertyId}/systems`,
      payload: {
        systemType: "electric_fence",
        name: "Cerco eléctrico perimetral",
        condition: "attention",
        inventoryCount: 1,
        notes: "Registro sintético para probar inventario.",
        synthetic: true,
      },
    });
    expect(system.statusCode, system.body).toBe(201);

    const issue = await app.inject({
      method: "POST",
      url: `/v1/tenants/servifran-pilot/properties/${propertyId}/issues`,
      payload: {
        category: "security",
        title: "Sector norte requiere revisión",
        description: "Novedad sintética para verificar el flujo central.",
        priority: "critical",
        source: "audio",
        synthetic: true,
      },
    });
    expect(issue.statusCode, issue.body).toBe(201);

    const commitment = await app.inject({
      method: "POST",
      url: "/v1/tenants/servifran-pilot/portfolio/commitments",
      payload: {
        propertyId,
        commitmentType: "meeting",
        title: "Reunión sintética con el directorio",
        startsAt: "2099-08-01T14:00:00.000Z",
        notes: "Agenda de prueba.",
        synthetic: true,
      },
    });
    expect(commitment.statusCode, commitment.body).toBe(201);

    const brief = await app.inject({
      method: "GET",
      url: `/v1/tenants/servifran-pilot/portfolio/brief?propertyId=${propertyId}`,
    });
    expect(brief.statusCode, brief.body).toBe(200);
    expect(brief.json().brief).toMatchObject({
      tenantId: "servifran-pilot",
      grounded: true,
      outboundAllowed: false,
      totals: {
        properties: 1,
        openIssues: 1,
        criticalIssues: 1,
        systemsRequiringAttention: 1,
        upcomingCommitments: 1,
      },
    });

    const crossTenant = await app.inject({
      method: "GET",
      url: `/v1/tenants/pcdoctor-ec/properties/${propertyId}`,
    });
    expect(crossTenant.statusCode).toBe(404);
  });

  it("protects the product, bootstraps its owner and accepts invited users", async () => {
    const identities = {
      owner: {
        uid: "google-owner-001",
        email: "rafagye@gmail.com",
        emailVerified: true,
        displayName: "Rafael",
        photoUrl: null,
      },
      invited: {
        uid: "google-collaborator-001",
        email: "colaborador@example.com",
        emailVerified: true,
        displayName: "Colaborador",
        photoUrl: null,
      },
    } as const;
    const authVerifier: AuthVerifier = {
      async verify(token) {
        const identity = identities[token as keyof typeof identities];
        if (!identity) throw new Error("invalid token");
        return identity;
      },
    };
    const app = await buildApp(
      {
        NODE_ENV: "test",
        AUTH_ENABLED: "true",
        BOOTSTRAP_OWNER_EMAIL: "rafagye@gmail.com",
      },
      { authVerifier },
    );
    apps.push(app);

    const blocked = await app.inject({ method: "GET", url: "/v1/session" });
    expect(blocked.statusCode).toBe(401);

    const ownerSession = await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { authorization: "Bearer owner" },
    });
    expect(ownerSession.statusCode).toBe(200);
    expect(ownerSession.json().user).toMatchObject({
      email: "rafagye@gmail.com",
      profileComplete: false,
    });
    expect(ownerSession.json().memberships).toHaveLength(4);
    expect(ownerSession.json().memberships[0]).toMatchObject({
      tenant: { id: "pcdoctor-ec", displayName: "PC Doctor" },
      membership: { role: "platform_owner", status: "active" },
    });

    const completedProfile = await app.inject({
      method: "PUT",
      url: "/v1/profile",
      headers: { authorization: "Bearer owner" },
      payload: {
        displayName: "Rafael López",
        phone: "+593990000000",
        taxId: "0100000009",
        personType: "natural",
        legalName: "",
      },
    });
    expect(completedProfile.statusCode).toBe(200);
    expect(completedProfile.json().user).toMatchObject({
      profileComplete: true,
      status: "active",
    });

    const invitation = await app.inject({
      method: "POST",
      url: "/v1/tenants/pcdoctor-ec/invitations",
      headers: { authorization: "Bearer owner" },
      payload: {
        email: "colaborador@example.com",
        role: "collaborator",
        permissions: ["customers.view", "quotes.view"],
      },
    });
    expect(invitation.statusCode).toBe(201);

    const invitedSession = await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { authorization: "Bearer invited" },
    });
    expect(invitedSession.statusCode).toBe(200);
    expect(invitedSession.json().memberships[0].membership).toMatchObject({
      role: "collaborator",
      permissions: ["customers.view", "quotes.view"],
    });

    const forbidden = await app.inject({
      method: "GET",
      url: "/v1/tenants/pcdoctor-ec/members",
      headers: { authorization: "Bearer invited" },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("enforces collaborator approvals and customer case visibility", async () => {
    const identities = {
      owner: {
        uid: "owner-role-test",
        email: "rafagye@gmail.com",
        emailVerified: true,
        displayName: "Rafael",
        photoUrl: null,
      },
      collaborator: {
        uid: "collaborator-role-test",
        email: "operaciones@example.com",
        emailVerified: true,
        displayName: "Operaciones",
        photoUrl: null,
      },
      customer: {
        uid: "customer-role-test",
        email: "cliente@example.com",
        emailVerified: true,
        displayName: "Cliente",
        photoUrl: null,
      },
    } as const;
    const authVerifier: AuthVerifier = {
      async verify(token) {
        const identity = identities[token as keyof typeof identities];
        if (!identity) throw new Error("invalid token");
        return identity;
      },
    };
    const app = await buildApp(
      {
        NODE_ENV: "test",
        AUTH_ENABLED: "true",
        BOOTSTRAP_OWNER_EMAIL: "rafagye@gmail.com",
      },
      { authVerifier },
    );
    apps.push(app);
    await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { authorization: "Bearer owner" },
    });

    for (const invitation of [
      {
        email: "operaciones@example.com",
        role: "collaborator",
        permissions: [
          "cases.view",
          "cases.manage",
          "quotes.view",
          "quotes.manage",
        ],
      },
      {
        email: "cliente@example.com",
        role: "customer",
        permissions: ["cases.view", "quotes.view"],
      },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tenants/pcdoctor-ec/invitations",
        headers: { authorization: "Bearer owner" },
        payload: invitation,
      });
      expect(response.statusCode).toBe(201);
    }
    await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { authorization: "Bearer collaborator" },
    });
    await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { authorization: "Bearer customer" },
    });

    const visible = await app.inject({
      method: "POST",
      url: "/v1/tenants/pcdoctor-ec/cases",
      headers: { authorization: "Bearer owner" },
      payload: {
        customerId: "customer-visible",
        customerUserId: identities.customer.uid,
        customerName: "Cliente visible",
        customerIdentifier: "0100000009",
        title: "Caso visible",
        description: "Debe aparecer únicamente para el cliente vinculado.",
        synthetic: true,
      },
    });
    expect(visible.statusCode).toBe(201);
    const hidden = await app.inject({
      method: "POST",
      url: "/v1/tenants/pcdoctor-ec/cases",
      headers: { authorization: "Bearer owner" },
      payload: {
        customerId: "customer-hidden",
        customerName: "Otro cliente",
        customerIdentifier: "0100000009",
        title: "Caso oculto",
        description: "No debe aparecer en el portal del primer cliente.",
        synthetic: true,
      },
    });
    expect(hidden.statusCode).toBe(201);

    const customerCases = await app.inject({
      method: "GET",
      url: "/v1/tenants/pcdoctor-ec/cases",
      headers: { authorization: "Bearer customer" },
    });
    expect(customerCases.statusCode).toBe(200);
    expect(customerCases.json().cases).toHaveLength(1);
    expect(customerCases.json().cases[0].id).toBe(visible.json().case.id);

    const forbiddenRegistryLookup = await app.inject({
      method: "POST",
      url: "/v1/identity/validate",
      headers: { authorization: "Bearer customer" },
      payload: { identifier: "0190000001001", lookup: "authorized" },
    });
    expect(forbiddenRegistryLookup.statusCode).toBe(403);
    expect(forbiddenRegistryLookup.json().error).toBe(
      "authorized_registry_lookup_forbidden",
    );

    const collaboratorCase = await app.inject({
      method: "POST",
      url: "/v1/tenants/pcdoctor-ec/cases",
      headers: { authorization: "Bearer collaborator" },
      payload: {
        customerId: "customer-collab",
        customerName: "Cliente colaborador",
        customerIdentifier: "0100000009",
        title: "Caso operado",
        description: "El colaborador puede preparar, pero no aprobar.",
        synthetic: true,
      },
    });
    const caseId = collaboratorCase.json().case.id as string;
    for (const action of [
      "complete_intake",
      "validate_identity",
      "complete_discovery",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/transitions`,
        headers: { authorization: "Bearer collaborator" },
        payload: { action },
      });
      expect(response.statusCode).toBe(200);
    }
    const prepared = await app.inject({
      method: "POST",
      url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/transitions`,
      headers: { authorization: "Bearer collaborator" },
      payload: { action: "prepare_quote", quoteAmountUsd: 400 },
    });
    expect(prepared.statusCode).toBe(200);

    const forbiddenApproval = await app.inject({
      method: "POST",
      url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/transitions`,
      headers: { authorization: "Bearer collaborator" },
      payload: { action: "approve_quote" },
    });
    expect(forbiddenApproval.statusCode).toBe(403);
    expect(forbiddenApproval.json().error).toBe("quote_approval_forbidden");
  });

  it("runs the guarded inspection, configurable VAT, quote and delivery-draft flow", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);
    await app.inject({ method: "GET", url: "/v1/session" });

    const created = await app.inject({
      method: "POST",
      url: "/v1/tenants/pcdoctor-ec/cases",
      payload: {
        customerId: "customer-electric-fence",
        customerName: "Condominio sintético",
        customerIdentifier: "0100000009",
        title: "Inspección de cerco eléctrico",
        description: "Prueba controlada del recorrido multimodal.",
        synthetic: true,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const caseId = created.json().case.id as string;

    const defaults = await app.inject({
      method: "GET",
      url: "/v1/tenants/pcdoctor-ec/operational-settings",
    });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toMatchObject({
      settings: { defaultTaxRatePct: 15 },
      usage: { inspections: 0, inspectionLimit: 20 },
    });

    const configured = await app.inject({
      method: "PUT",
      url: "/v1/tenants/pcdoctor-ec/operational-settings",
      payload: {
        ...defaults.json().settings,
        defaultTaxRatePct: 12.5,
        monthlyLimits: {
          ...defaults.json().settings.monthlyLimits,
          inspections: 1,
        },
      },
    });
    expect(configured.statusCode, configured.body).toBe(200);
    expect(configured.json().settings.defaultTaxRatePct).toBe(12.5);

    const analyzed = await app.inject({
      method: "POST",
      url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/inspections/analyze`,
      payload: {
        systemType: "electric_fence",
        title: "Informe técnico de cerco eléctrico",
        siteName: "Condominio sintético",
        narrative:
          "Se observan aisladores deteriorados. Falta confirmar voltaje, puesta a tierra y cantidad definitiva.",
        evidence: [],
        synthetic: true,
      },
    });
    expect(analyzed.statusCode, analyzed.body).toBe(201);
    expect(analyzed.json().inspection).toMatchObject({
      tenantId: "pcdoctor-ec",
      caseId,
      systemType: "electric_fence",
      status: "draft",
      synthetic: true,
    });
    expect(
      analyzed.json().inspection.analysis.missingInformation.length,
    ).toBeGreaterThan(0);
    const inspectionId = analyzed.json().inspection.id as string;

    const limited = await app.inject({
      method: "POST",
      url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/inspections/analyze`,
      payload: {
        systemType: "electric_fence",
        title: "Segunda inspección",
        siteName: "Condominio sintético",
        narrative: "Esta segunda operación debe respetar el límite mensual.",
        evidence: [],
        synthetic: true,
      },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toBe("monthly_inspection_limit_reached");

    const quoted = await app.inject({
      method: "POST",
      url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/quotes`,
      payload: {
        inspectionId,
        proposalTitle: "Reparación del cerco eléctrico perimetral",
        executiveSummary:
          "Se propone corregir los elementos deteriorados y ejecutar las mediciones necesarias antes de la entrega.",
        technicalProposal:
          "La intervención contempla revisión, reemplazo de componentes confirmados, pruebas funcionales y entrega documentada.",
        scope: ["Reemplazar componentes confirmados por el técnico."],
        exclusions: ["No incluye trabajos no visibles durante la inspección inicial."],
        items: [
          {
            code: "AIS-01",
            description: "Aislador para cerco eléctrico",
            quantity: 10,
            unit: "unidad",
            unitPriceUsd: 2.5,
          },
          {
            code: "MO-01",
            description: "Mano de obra técnica y pruebas",
            quantity: 1,
            unit: "servicio",
            unitPriceUsd: 75,
          },
        ],
      },
    });
    expect(quoted.statusCode, quoted.body).toBe(201);
    expect(quoted.json().quote).toMatchObject({
      subtotalUsd: 100,
      taxRatePct: 12.5,
      taxAmountUsd: 12.5,
      totalUsd: 112.5,
      outboundAllowed: false,
      status: "pending_approval",
    });
    const quoteId = quoted.json().quote.id as string;

    const delivery = await app.inject({
      method: "POST",
      url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/delivery-drafts`,
      payload: {
        quoteId,
        channel: "whatsapp",
        recipient: "+593000000000",
        subject: "",
        message:
          "Borrador sintético de entrega de la cotización para revisión y aprobación humana.",
      },
    });
    expect(delivery.statusCode, delivery.body).toBe(201);
    expect(delivery.json()).toMatchObject({
      outboundEnabled: false,
      draft: { status: "awaiting_approval", sent: false },
    });

    const history = await app.inject({
      method: "GET",
      url: `/v1/tenants/pcdoctor-ec/cases/${caseId}/inspections`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().inspections).toHaveLength(1);
    expect(history.json().quotes).toHaveLength(1);
  });
});
