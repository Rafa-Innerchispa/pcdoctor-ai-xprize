import { GoogleGenAI } from "@google/genai";
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

export class GeminiService {
  constructor(private readonly config: AppConfig) {}

  async analyze(input: AnalyzeCaseRequest): Promise<{
    analysis: CaseAnalysis;
    requestReference: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
  }> {
    if (!this.config.GOOGLE_CLOUD_PROJECT) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI.");
    }

    const ai = new GoogleGenAI({
      vertexai: true,
      project: this.config.GOOGLE_CLOUD_PROJECT,
      location: this.config.GOOGLE_CLOUD_LOCATION,
      apiVersion: "v1",
    });

    const response = await ai.models.generateContent({
      model: this.config.GEMINI_MODEL,
      contents: JSON.stringify({
        playbook: input.playbook,
        channel: input.channel,
        customerMessage: input.message,
      }),
      config: {
        responseMimeType: "application/json",
        systemInstruction:
          "You are FieldSpark's intake agent for Ecuadorian service SMBs. " +
          "Return JSON only with: summary, intent, urgency (low|medium|high), " +
          "serviceFamily, missingInformation (string array), nextBestAction, " +
          "draftReply, requiresHumanApproval (boolean), confidence (0..1). " +
          "Never invent customer facts, prices, legal conclusions, or completed actions. " +
          "All outbound drafts require human review.",
        temperature: 0.2,
      },
    });

    const analysis = caseAnalysisSchema.parse(parseJsonResponse(response.text ?? "{}"));
    const metadata = response.usageMetadata;

    return {
      analysis,
      requestReference: response.responseId ?? null,
      inputTokens: metadata?.promptTokenCount ?? null,
      outputTokens: metadata?.candidatesTokenCount ?? null,
    };
  }
}
