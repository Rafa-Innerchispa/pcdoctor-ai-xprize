import {
  businessCaseSchema,
  playbookDefinitionSchema,
  type BusinessCase,
  type CaseTransitionRequest,
  type PlaybookDefinition,
} from "@fieldspark/contracts";

const commonStages = [
  "intake",
  "identity",
  "discovery",
  "quote",
  "approval",
  "service",
  "billing",
  "completed",
] as const;

function define(
  id: PlaybookDefinition["id"],
  name: string,
  labels: readonly [string, string, string, string, string, string, string, string],
  objectives: readonly [string, string, string, string, string, string, string, string],
) {
  return playbookDefinitionSchema.parse({
    id,
    name,
    steps: commonStages.map((stage, index) => ({
      stage,
      label: labels[index],
      objective: objectives[index],
    })),
  });
}

export const playbookDefinitions: Record<
  PlaybookDefinition["id"],
  PlaybookDefinition
> = {
  pcdoctor: define(
    "pcdoctor",
    "PC Doctor",
    [
      "Ingreso",
      "Cliente",
      "Diagnóstico",
      "Cotización",
      "Aprobación",
      "Servicio técnico",
      "Facturación",
      "Cerrado",
    ],
    [
      "Registrar solicitud, equipo, sede y evidencia recibida.",
      "Validar cliente y datos tributarios sin duplicarlo.",
      "Inspeccionar, documentar hallazgos y definir la solución.",
      "Preparar repuestos, mano de obra, alternativas y vigencia.",
      "Obtener aprobación humana y aceptación del cliente.",
      "Asignar técnico, ejecutar, probar y registrar la entrega.",
      "Preparar el detalle facturable para revisión administrativa.",
      "Cerrar con historial, garantía y próxima acción.",
    ],
  ),
  iapro: define(
    "iapro",
    "IAPRO S.A.S.",
    [
      "Ingreso",
      "Cliente",
      "Descubrimiento",
      "Propuesta",
      "Aprobación",
      "Proyecto",
      "Facturación",
      "Cerrado",
    ],
    [
      "Registrar problema, organización, canal y objetivo inicial.",
      "Validar identidad y razón social del prospecto.",
      "Levantar proceso actual, volumen, impacto, riesgos y responsables.",
      "Preparar alcance, entregables, cronograma, supuestos y precio.",
      "Obtener revisión interna y aceptación del cliente.",
      "Gestionar hitos, responsables, evidencias y entregables.",
      "Preparar hitos facturables sin emitir automáticamente.",
      "Cerrar con resultados, indicadores y seguimiento.",
    ],
  ),
  photography_studio: define(
    "photography_studio",
    "Estudio fotográfico",
    [
      "Ingreso",
      "Cliente",
      "Necesidad",
      "Cotización",
      "Reserva",
      "Producción",
      "Facturación",
      "Cerrado",
    ],
    [
      "Capturar tipo de sesión, fecha, canal y preferencia.",
      "Validar datos del cliente requeridos para facturación.",
      "Completar ocasión, asistentes, locación, estilo y entregables.",
      "Preparar paquete, adicionales, anticipo y condiciones.",
      "Registrar aprobación, reserva y anticipo.",
      "Planificar sesión, selección y entrega; la galería queda en fase dos.",
      "Recordar y preparar lo pendiente de facturar.",
      "Cerrar con entrega, saldo y próxima campaña consentida.",
    ],
  ),
};

const nextStageByAction = {
  complete_intake: { from: "intake", to: "identity" },
  validate_identity: { from: "identity", to: "discovery" },
  complete_discovery: { from: "discovery", to: "quote" },
  prepare_quote: { from: "quote", to: "approval" },
  approve_quote: { from: "approval", to: "service" },
  complete_service: { from: "service", to: "billing" },
  prepare_billing: { from: "billing", to: "billing" },
  close_case: { from: "billing", to: "completed" },
} as const;

export function transitionCase(
  current: BusinessCase,
  request: CaseTransitionRequest & {
    identityValidation?: BusinessCase["identityValidation"];
  },
): BusinessCase {
  if (request.action === "reject_quote") {
    if (current.currentStage !== "approval") {
      throw new Error("invalid_case_transition");
    }
    return businessCaseSchema.parse({
      ...current,
      currentStage: "quote",
      status: "open",
      quoteApproval: "rejected",
      updatedAt: new Date().toISOString(),
    });
  }

  const transition = nextStageByAction[request.action];
  if (current.currentStage !== transition.from) {
    throw new Error("invalid_case_transition");
  }
  if (request.action === "validate_identity") {
    if (!request.identityValidation?.locallyValid) {
      throw new Error("identity_validation_required");
    }
  }
  if (request.action === "prepare_quote") {
    if (request.quoteAmountUsd === undefined) {
      throw new Error("quote_amount_required");
    }
  }
  if (request.action === "close_case" && !current.billingPrepared) {
    throw new Error("billing_preparation_required");
  }

  const status =
    request.action === "prepare_quote"
      ? "waiting_approval"
      : request.action === "approve_quote"
        ? "active"
        : request.action === "complete_service" ||
            request.action === "prepare_billing"
          ? "billing_review"
          : request.action === "close_case"
            ? "completed"
            : "open";

  return businessCaseSchema.parse({
    ...current,
    currentStage: transition.to,
    status,
    identityValidation:
      request.action === "validate_identity"
        ? request.identityValidation
        : current.identityValidation,
    customerIdentifier:
      request.action === "validate_identity" && request.identityValidation
        ? request.identityValidation.identifier
        : current.customerIdentifier,
    customerName:
      request.action === "validate_identity" &&
      request.identityValidation?.legalName
        ? request.identityValidation.legalName
        : current.customerName,
    quoteAmountUsd:
      request.action === "prepare_quote"
        ? request.quoteAmountUsd
        : current.quoteAmountUsd,
    quoteApproval:
      request.action === "prepare_quote"
        ? "pending"
        : request.action === "approve_quote"
          ? "approved"
          : current.quoteApproval,
    billingPrepared:
      request.action === "prepare_billing" || current.billingPrepared,
    updatedAt: new Date().toISOString(),
  });
}
