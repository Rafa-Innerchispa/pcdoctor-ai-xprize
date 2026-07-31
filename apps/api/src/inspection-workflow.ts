import {
  inspectionAnalysisSchema,
  quoteDocumentSchema,
  type InspectionAnalysis,
  type QuoteDocument,
  type TenantOperationalSettings,
} from "@fieldspark/contracts";

export function buildSyntheticInspectionAnalysis(input: {
  systemType: string;
  narrative: string;
  evidenceIds: string[];
}): InspectionAnalysis {
  const electricFence = input.systemType === "electric_fence";
  return inspectionAnalysisSchema.parse({
    executiveSummary: electricFence
      ? "La inspección preliminar del cerco eléctrico identifica elementos que requieren verificación técnica antes de definir la reparación. El resultado organiza la evidencia y prepara una propuesta, pero no certifica la seguridad ni la operatividad del sistema."
      : "La inspección preliminar organiza los hallazgos narrados y la evidencia recibida. Se requiere validación técnica antes de aprobar alcance, materiales o condiciones de seguridad.",
    technicalContext:
      input.narrative ||
      "Recorrido sintético creado para comprobar el flujo multimodal sin datos de clientes.",
    findings: [
      {
        title: "Condición pendiente de medición",
        detail: electricFence
          ? "La evidencia disponible no contiene una lectura verificable de voltaje ni una prueba documentada de puesta a tierra."
          : "La evidencia debe complementarse con mediciones y comprobaciones del técnico responsable.",
        severity: "attention",
        evidenceIds: input.evidenceIds.slice(0, 3),
        confidence: 0.82,
      },
    ],
    measurements: [],
    recommendedActions: electricFence
      ? [
          "Medir voltaje de salida y en los puntos más alejados del perímetro.",
          "Revisar energizador, batería de respaldo, puesta a tierra, aisladores y continuidad del conductor.",
          "Confirmar longitud, número de líneas y sectores afectados antes de cotizar cantidades definitivas.",
        ]
      : ["Realizar verificación técnica y documentar mediciones antes de cotizar."],
    suggestedItems: electricFence
      ? [
          {
            code: "",
            description: "Aislador para cerco eléctrico, modelo por confirmar",
            quantity: 1,
            unit: "unidad",
            rationale: "Ítem provisional sujeto al conteo de aisladores defectuosos.",
            catalogMatch: "verify",
          },
          {
            code: "",
            description: "Cable de alta tensión para cerco eléctrico",
            quantity: 1,
            unit: "metro",
            rationale: "Cantidad provisional hasta medir el tramo afectado.",
            catalogMatch: "verify",
          },
        ]
      : [],
    missingInformation: electricFence
      ? [
          "¿Qué voltaje se midió en el energizador y al final del perímetro?",
          "¿Cuál es la marca y modelo del energizador?",
          "¿Cuántos aisladores o metros de conductor requieren reemplazo?",
          "¿La batería y la puesta a tierra fueron probadas?",
        ]
      : ["¿Qué mediciones y pruebas funcionales realizó el técnico?"],
    safetyLimitations: [
      "Este borrador no sustituye la inspección, medición ni firma de un técnico calificado.",
      "Las cantidades y precios deben ser confirmados por una persona autorizada.",
    ],
    confidence: 0.78,
  });
}

function money(value: number) {
  return Number(value.toFixed(2));
}

export function buildQuoteDocument(input: {
  id: string;
  sequence: number;
  tenantId: string;
  caseId: string;
  inspectionId: string;
  customerName: string;
  customerIdentifier: string;
  createdBy: string;
  now: string;
  settings: TenantOperationalSettings;
  draft: {
    proposalTitle: string;
    executiveSummary: string;
    technicalProposal: string;
    scope: string[];
    exclusions: string[];
    items: Array<{
      code: string;
      description: string;
      quantity: number;
      unit: string;
      unitPriceUsd: number;
    }>;
    taxRatePct?: number;
    validityDays?: number;
  };
}): QuoteDocument {
  const items = input.draft.items.map((item) => ({
    ...item,
    subtotalUsd: money(item.quantity * item.unitPriceUsd),
  }));
  const subtotalUsd = money(
    items.reduce((sum, item) => sum + item.subtotalUsd, 0),
  );
  const taxRatePct = input.draft.taxRatePct ?? input.settings.defaultTaxRatePct;
  const taxAmountUsd = money(subtotalUsd * (taxRatePct / 100));
  return quoteDocumentSchema.parse({
    id: input.id,
    quoteNumber: `COT-${new Date(input.now).getUTCFullYear()}-${String(input.sequence).padStart(4, "0")}`,
    tenantId: input.tenantId,
    caseId: input.caseId,
    inspectionId: input.inspectionId,
    customerName: input.customerName,
    customerIdentifier: input.customerIdentifier,
    proposalTitle: input.draft.proposalTitle,
    executiveSummary: input.draft.executiveSummary,
    technicalProposal: input.draft.technicalProposal,
    scope: input.draft.scope,
    exclusions: input.draft.exclusions,
    items,
    subtotalUsd,
    taxRatePct,
    taxAmountUsd,
    totalUsd: money(subtotalUsd + taxAmountUsd),
    currency: "USD",
    validityDays: input.draft.validityDays ?? input.settings.quoteValidityDays,
    status: "pending_approval",
    outboundAllowed: false,
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  });
}
