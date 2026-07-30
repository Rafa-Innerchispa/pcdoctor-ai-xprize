import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { AuthVerifier } from "./auth.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("FieldSpark API", () => {
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
    expect(ownerSession.json()).toMatchObject({
      user: { email: "rafagye@gmail.com", profileComplete: false },
      memberships: [
        {
          tenant: { id: "pcdoctor-ec", displayName: "PC Doctor" },
          membership: { role: "platform_owner", status: "active" },
        },
      ],
    });

    const completedProfile = await app.inject({
      method: "PUT",
      url: "/v1/profile",
      headers: { authorization: "Bearer owner" },
      payload: {
        displayName: "Rafael López",
        phone: "+593990000000",
        taxId: "0912345678",
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
});
