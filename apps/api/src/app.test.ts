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
