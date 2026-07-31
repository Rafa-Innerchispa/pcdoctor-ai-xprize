import { describe, expect, it } from "vitest";
import { estimateGeminiCostUsd } from "./gemini.js";

describe("Gemini cost measurement", () => {
  it("estimates Gemini 2.5 Flash cost from billable tokens", () => {
    expect(
      estimateGeminiCostUsd({
        inputTokens: 1_000,
        outputTokens: 500,
        inputUsdPerMillion: 0.3,
        outputUsdPerMillion: 2.5,
      }),
    ).toBe(0.00155);
  });

  it("keeps sub-cent request costs precise for unit economics", () => {
    expect(
      estimateGeminiCostUsd({
        inputTokens: 321,
        outputTokens: 123,
        inputUsdPerMillion: 0.3,
        outputUsdPerMillion: 2.5,
      }),
    ).toBe(0.0004038);
  });
});
