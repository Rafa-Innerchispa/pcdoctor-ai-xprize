import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

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

  it("blocks real Gemini verification while demo mode is enabled", async () => {
    const app = await buildApp({ NODE_ENV: "test" });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/gemini/verify",
    });
    expect(response.statusCode).toBe(409);
  });
});
