import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import * as mammoth from "mammoth";
import { z } from "zod";
import {
  caseAnalysisSchema,
  inspectionAnalysisSchema,
  type AnalyzeCaseRequest,
  type CaseAnalysis,
  type InspectionAnalysis,
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

const inspectionAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "technicalContext",
    "findings",
    "measurements",
    "recommendedActions",
    "suggestedItems",
    "missingInformation",
    "safetyLimitations",
    "confidence",
  ],
  properties: {
    executiveSummary: { type: "string" },
    technicalContext: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "detail", "severity"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: {
            type: "string",
            enum: ["observation", "attention", "critical"],
          },
        },
      },
    },
    measurements: { type: "array", items: { type: "string" } },
    recommendedActions: { type: "array", items: { type: "string" } },
    suggestedItems: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "quantity", "unit"],
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
        },
      },
    },
    missingInformation: { type: "array", items: { type: "string" } },
    safetyLimitations: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

const inspectionModelOutputSchema = z.object({
  executiveSummary: z.string(),
  technicalContext: z.string(),
  findings: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      severity: z.enum(["observation", "attention", "critical"]),
    }),
  ),
  measurements: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  suggestedItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unit: z.string(),
    }),
  ),
  missingInformation: z.array(z.string()),
  safetyLimitations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

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

  async analyzeInspection(input: {
    systemType: string;
    title: string;
    siteName: string;
    narrative: string;
    evidence: Array<{
      id: string;
      kind: string;
      fileName: string;
      mimeType: string;
      dataBase64: string;
    }>;
  }): Promise<{
    analysis: InspectionAnalysis;
    requestReference: string | null;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }> {
    if (this.config.GEMINI_PROVIDER === "developer" && !this.config.GEMINI_API_KEY) {
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
    const mediaParts = await Promise.all(
      input.evidence.map(async (item) => {
        if (
          item.mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          const extracted = await mammoth.extractRawText({
            buffer: Buffer.from(item.dataBase64, "base64"),
          });
          return {
            text: `Documento Word ${item.id} (${item.fileName}):\n${extracted.value}`,
          };
        }
        if (item.mimeType.startsWith("text/")) {
          return {
            text: `Documento de texto ${item.id} (${item.fileName}):\n${Buffer.from(item.dataBase64, "base64").toString("utf8")}`,
          };
        }
        return {
          inlineData: { mimeType: item.mimeType, data: item.dataBase64 },
        };
      }),
    );
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [
      {
        text: JSON.stringify({
          systemType: input.systemType,
          title: input.title,
          siteName: input.siteName,
          technicianNarrative: input.narrative,
          evidenceIndex: input.evidence.map(({ id, kind, fileName, mimeType }) => ({
            id,
            kind,
            fileName,
            mimeType,
          })),
        }),
      },
      ...mediaParts,
    ];
    const response = await ai.models.generateContent({
      model: this.config.GEMINI_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: inspectionAnalysisJsonSchema,
        systemInstruction:
          "You are FieldSpark's technical inspection assistant. Analyze only the supplied narration and evidence. " +
          "Separate observed facts from hypotheses, never declare a safety-critical system compliant from photos alone, " +
          "ask for missing measurements, and propose catalog items without inventing prices or availability. " +
          "Use evidence IDs exactly as supplied. Return only the required JSON object in Spanish.",
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
    const modelOutput = inspectionModelOutputSchema.parse(
      parseJsonResponse(response.text ?? "{}"),
    );
    const analysis = inspectionAnalysisSchema.parse({
      ...modelOutput,
      findings: modelOutput.findings.map((finding) => ({
        ...finding,
        evidenceIds: [],
        confidence: modelOutput.confidence,
      })),
      suggestedItems: modelOutput.suggestedItems.map((item) => ({
        ...item,
        code: "",
        rationale: "Sugerencia preliminar derivada del análisis; confirmar catálogo y cantidad.",
        catalogMatch: "verify",
      })),
    });
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens =
      (response.usageMetadata?.candidatesTokenCount ?? 0) +
      (response.usageMetadata?.thoughtsTokenCount ?? 0);
    return {
      analysis,
      requestReference: response.responseId ?? null,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateGeminiCostUsd({
        inputTokens,
        outputTokens,
        inputUsdPerMillion: this.config.GEMINI_INPUT_USD_PER_MILLION,
        outputUsdPerMillion: this.config.GEMINI_OUTPUT_USD_PER_MILLION,
      }),
    };
  }
}
