import type { AnalyzeCaseRequest, CaseAnalysis } from "@fieldspark/contracts";

export const overview = {
  generatedAt: "2026-07-29T00:00:00.000Z",
  synthetic: true,
  metrics: {
    contacts: 20,
    estimatedPilotContacts: 2000,
    activeOpportunities: 38,
    continuityCoverage: 87,
    agentDecisions: 142,
    pendingApprovals: 3,
  },
  playbooks: [
    {
      id: "photography_studio",
      name: "Estudio fotográfico",
      stage: "Discovery complete",
      objective: "Reactivate contacts, preserve follow-up, and surface billable work.",
    },
    {
      id: "iapro",
      name: "IAPRO S.A.S.",
      stage: "Discovery complete",
      objective: "Turn unstructured requests into scoped consulting opportunities.",
    },
  ],
};

export function buildDemoAnalysis(input: AnalyzeCaseRequest): CaseAnalysis {
  if (input.playbook === "photography_studio") {
    return {
      summary: "Cliente solicita información sobre una sesión y necesita seguimiento.",
      intent: "booking_followup",
      urgency: "medium",
      serviceFamily: "photography_session",
      missingInformation: ["Tipo de sesión", "Fecha preferida", "Presupuesto aproximado"],
      nextBestAction: "Solicitar los tres datos faltantes y crear una oportunidad.",
      draftReply:
        "Gracias por escribirnos. Para recomendarte la sesión adecuada, ¿qué tipo de sesión buscas, para qué fecha y qué rango de inversión tienes previsto?",
      requiresHumanApproval: true,
      confidence: 0.91,
    };
  }

  return {
    summary: "Organización solicita optimización de un proceso operativo no documentado.",
    intent: "consulting_discovery",
    urgency: "medium",
    serviceFamily: "process_engineering",
    missingInformation: [
      "Proceso actual",
      "Volumen mensual",
      "Personas involucradas",
      "Costo o impacto del problema",
    ],
    nextBestAction: "Abrir diagnóstico y enviar cuestionario de descubrimiento.",
    draftReply:
      "Podemos comenzar con un diagnóstico del proceso. Para delimitarlo necesitamos conocer el flujo actual, su volumen, las áreas involucradas y el impacto que genera.",
    requiresHumanApproval: true,
    confidence: 0.88,
  };
}
