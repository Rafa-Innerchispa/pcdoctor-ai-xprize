import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  caseAnalysisSchema,
  type AnalyzeCaseRequest,
  type CaseAnalysis,
} from "@fieldspark/contracts";
import type { AppConfig } from "./config.js";

function parseJsonResponse(text: string): unknown {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(cleaned);
}

const caseAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "intent",
    "urgency",
    "serviceFamily",
    "missingInformation",
    "nextBestAction",
    "draftReply",
    "requiresHumanApproval",
    "confidence",
  ],
  properties: {
    summary: { type: "string" },
    intent: { type: "string" },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
    serviceFamily: { type: "string" },
    missingInformation: {
      type: "array",
      items: { type: "string" },
    },
    nextBestAction: { type: "string" },
    draftReply: { type: "string" },
    requiresHumanApproval: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export function estimateGeminiCostUsd({
  inputTokens,
  outputTokens,
  inputUsdPerMillion,
  outputUsdPerMillion,
}: {
  inputTokens: number;
  outputTokens: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}): number {
  const cost =
    (inputTokens * inputUsdPerMillion +
      outputTokens * outputUsdPerMillion) /
    1_000_000;
  return Number(cost.toFixed(8));
}

export class GeminiService {
  constructor(private readonly config: AppConfig) {}

  async analyze(input: AnalyzeCaseRequest): Promise<{
    analysis: CaseAnalysis;
    requestReference: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsd: number | null;
  }> {
    if (
      this.config.GEMINI_PROVIDER === "vertex" &&
      !this.config.GOOGLE_CLOUD_PROJECT
    ) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI.");
    }
    if (
      this.config.GEMINI_PROVIDER === "developer" &&
      !this.config.GEMINI_API_KEY
    ) {
      throw new Error("GEMINI_API_KEY is required for Gemini Developer API.");
    }

    const ai =
      this.config.GEMINI_PROVIDER === "developer"
        ? new GoogleGenAI({ apiKey: this.config.GEMINI_API_KEY })
        : new GoogleGenAI({
            vertexai: true,
            project: this.config.GOOGLE_CLOUD_PROJECT,
            location: this.config.GOOGLE_CLOUD_LOCATION,
            apiVersion: "v1",
          });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let requestReference: string | null = null;
    let lastValidationError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await ai.models.generateContent({
        model: this.config.GEMINI_MODEL,
        contents: JSON.stringify({
          playbook: input.playbook,
          channel: input.channel,
          customerMessage: input.message,
          retryReason:
            attempt === 0
              ? null
              : "The previous response did not satisfy the required JSON schema.",
        }),
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: caseAnalysisJsonSchema,
          systemInstruction:
            "You are FieldSpark's intake agent for Ecuadorian service SMBs. " +
            "Return only the JSON object required by the response schema. " +
            "Never invent customer facts, prices, legal conclusions, or completed actions. " +
            "All outbound drafts require human review.",
          maxOutputTokens: this.config.GEMINI_MAX_OUTPUT_TOKENS,
          thinkingConfig: {
            thinkingLevel: {
              minimal: ThinkingLevel.MINIMAL,
              low: ThinkingLevel.LOW,
              medium: ThinkingLevel.MEDIUM,
              high: ThinkingLevel.HIGH,
            }[this.config.GEMINI_THINKING_LEVEL],
          },
        },
      });

      requestReference = response.responseId ?? requestReference;
      const metadata = response.usageMetadata;
      totalInputTokens += metadata?.promptTokenCount ?? 0;
      totalOutputTokens +=
        (metadata?.candidatesTokenCount ?? 0) +
        (metadata?.thoughtsTokenCount ?? 0);

      try {
        const analysis = caseAnalysisSchema.parse(
          parseJsonResponse(response.text ?? "{}"),
        );
        return {
          analysis,
          requestReference,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          estimatedCostUsd: estimateGeminiCostUsd({
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            inputUsdPerMillion: this.config.GEMINI_INPUT_USD_PER_MILLION,
            outputUsdPerMillion: this.config.GEMINI_OUTPUT_USD_PER_MILLION,
          }),
        };
      } catch (error) {
        lastValidationError = error;
      }
    }

    throw lastValidationError ?? new Error("gemini_response_validation_failed");
  }
}
