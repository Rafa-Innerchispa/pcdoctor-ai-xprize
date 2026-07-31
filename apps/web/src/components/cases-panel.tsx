import type {
  BusinessCase,
  CaseTransitionRequest,
  Membership,
  PlaybookDefinition,
  Tenant,
} from "@fieldspark/contracts";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createBusinessCase,
  loadBusinessCases,
  loadPlaybooks,
  transitionBusinessCase,
} from "../api";
import { InspectionWorkspace } from "./inspection-workspace";

const statusLabels: Record<BusinessCase["status"], string> = {
  open: "En preparación",
  waiting_approval: "Esperando aprobación",
  active: "En ejecución",
  billing_review: "Revisión de cobro",
  completed: "Cerrado",
};

function nextAction(
  businessCase: BusinessCase,
): CaseTransitionRequest["action"] | null {
  if (businessCase.currentStage === "intake") return "complete_intake";
  if (businessCase.currentStage === "identity") return "validate_identity";
  if (businessCase.currentStage === "discovery") return "complete_discovery";
  if (businessCase.currentStage === "quote") return "prepare_quote";
  if (businessCase.currentStage === "approval") return "approve_quote";
  if (businessCase.currentStage === "service") return "complete_service";
  if (businessCase.currentStage === "billing") {
    return businessCase.billingPrepared ? "close_case" : "prepare_billing";
  }
  return null;
}

const actionLabels: Record<
  NonNullable<ReturnType<typeof nextAction>>,
  string
> = {
  complete_intake: "Completar ingreso",
  validate_identity: "Validar identidad",
  complete_discovery: "Completar levantamiento",
  prepare_quote: "Preparar cotización",
  approve_quote: "Aprobar cotización",
  reject_quote: "Devolver cotización",
  complete_service: "Completar ejecución",
  prepare_billing: "Preparar cobro",
  close_case: "Cerrar expediente",
};

export function CasesPanel({
  tenant,
  actor,
}: {
  tenant: Tenant;
  actor: Membership;
}) {
  const canManage =
    actor.role !== "customer" && actor.permissions.includes("cases.manage");
  const canApprove =
    actor.role === "platform_owner" ||
    actor.permissions.includes("quotes.approve");
  const [cases, setCases] = useState<BusinessCase[]>([]);
  const [playbook, setPlaybook] = useState<PlaybookDefinition | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [identityLookup, setIdentityLookup] = useState<
    "local" | "authorized"
  >("local");

  async function reload(preferredId?: string) {
    const [caseResult, playbookResult] = await Promise.all([
      loadBusinessCases(tenant.id),
      loadPlaybooks(),
    ]);
    setCases(caseResult.cases);
    setPlaybook(
      playbookResult.playbooks.find((item) => item.id === tenant.playbook) ??
        null,
    );
    setSelectedId(
      preferredId ||
        (currentCase?.tenantId === tenant.id ? currentCase.id : "") ||
        caseResult.cases[0]?.id ||
        "",
    );
  }

  useEffect(() => {
    setNotice("");
    setSelectedId("");
    void reload().catch(() =>
      setNotice("No fue posible cargar los expedientes."),
    );
  }, [tenant.id]);

  const currentCase = useMemo(
    () => cases.find((item) => item.id === selectedId) ?? cases[0],
    [cases, selectedId],
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setNotice("");
    const form = new FormData(formElement);
    try {
      const result = await createBusinessCase(tenant.id, {
        customerId: `customer-${crypto.randomUUID()}`,
        customerName: String(form.get("customerName") ?? ""),
        customerIdentifier: String(form.get("customerIdentifier") ?? ""),
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        synthetic: form.get("synthetic") === "on",
      });
      setShowCreate(false);
      setNotice("Expediente creado. Ningún mensaje ni factura fue emitido.");
      formElement.reset();
      await reload(result.case.id);
    } catch {
      setNotice("Revisa los datos obligatorios del expediente.");
    } finally {
      setBusy(false);
    }
  }

  async function advance(action?: CaseTransitionRequest["action"]) {
    if (!currentCase || busy) return;
    const selectedAction = action ?? nextAction(currentCase);
    if (!selectedAction) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await transitionBusinessCase(
        tenant.id,
        currentCase.id,
        {
          action: selectedAction,
          identityLookup,
          quoteAmountUsd:
            selectedAction === "prepare_quote"
              ? Number(quoteAmount)
              : undefined,
          note: "",
        },
      );
      setCases((current) =>
        current.map((item) =>
          item.id === result.case.id ? result.case : item,
        ),
      );
      setQuoteAmount("");
      setNotice(
        selectedAction === "validate_identity"
          ? result.case.identityValidation?.registryVerified
            ? "RUC validado y razón social recuperada."
            : "Identificación validada localmente."
          : "Etapa actualizada y registrada en la auditoría.",
      );
    } catch {
      setNotice(
        selectedAction === "validate_identity"
          ? "La cédula/RUC no es válida o la consulta autorizada no está configurada."
          : "No se pudo avanzar: revisa la etapa, el valor y tus permisos.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="case-layout">
      <section className="workspace-panel case-list-panel">
        <div className="module-heading">
          <div>
            <span>EXPEDIENTES</span>
            <h2>{tenant.displayName}</h2>
          </div>
          {canManage ? (
            <button
              className="compact-button"
              onClick={() => setShowCreate((value) => !value)}
            >
              {showCreate ? "Cancelar" : "Nuevo"}
            </button>
          ) : null}
        </div>
        {showCreate ? (
          <form className="case-create-form" onSubmit={(event) => void create(event)}>
            <label>
              Cliente
              <input name="customerName" minLength={2} required />
            </label>
            <label>
              Cédula o RUC
              <input
                name="customerIdentifier"
                inputMode="numeric"
                minLength={10}
                maxLength={13}
                required
              />
            </label>
            <label>
              Solicitud
              <input name="title" minLength={3} required />
            </label>
            <label>
              Detalle
              <textarea name="description" minLength={3} required />
            </label>
            <label className="test-mode-check">
              <input name="synthetic" type="checkbox" defaultChecked />
              Datos de prueba; bloquear contactos y facturas
            </label>
            <button className="primary-button" disabled={busy}>
              Crear expediente
            </button>
          </form>
        ) : null}
        <div className="case-list">
          {cases.map((item) => (
            <button
              key={item.id}
              className={currentCase?.id === item.id ? "active" : ""}
              onClick={() => setSelectedId(item.id)}
            >
              <span>{item.customerName}</span>
              <strong>{item.title}</strong>
              <small>{statusLabels[item.status]}</small>
            </button>
          ))}
          {!cases.length && !showCreate ? (
            <p className="empty-case-copy">
              {actor.role === "customer"
                ? "Todavía no tienes expedientes compartidos."
                : "Crea el primer expediente de prueba para recorrer el flujo."}
            </p>
          ) : null}
        </div>
      </section>

      <section className="workspace-panel case-detail-panel">
        {!currentCase || !playbook ? (
          <div className="empty-case-detail">
            <span>FLUJO OPERATIVO</span>
            <h2>El historial aparecerá aquí.</h2>
            <p>
              Cada avance queda separado por empresa y registrado en la
              auditoría.
            </p>
          </div>
        ) : (
          <>
            <div className="case-detail-heading">
              <div>
                <span>{currentCase.synthetic ? "PRUEBA CONTROLADA" : "EXPEDIENTE REAL"}</span>
                <h2>{currentCase.title}</h2>
                <p>{currentCase.customerName}</p>
              </div>
              <strong>{statusLabels[currentCase.status]}</strong>
            </div>
            <div className="workflow-track">
              {playbook.steps.map((step, index) => {
                const currentIndex = playbook.steps.findIndex(
                  (item) => item.stage === currentCase.currentStage,
                );
                const completed =
                  currentCase.currentStage === "completed" ||
                  index < currentIndex;
                const active = step.stage === currentCase.currentStage;
                return (
                  <article
                    key={step.stage}
                    className={`${completed ? "complete" : ""} ${active ? "active" : ""}`}
                  >
                    <i>{completed ? "✓" : String(index + 1).padStart(2, "0")}</i>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.objective}</small>
                    </div>
                  </article>
                );
              })}
            </div>
            {(tenant.playbook === "pcdoctor" ||
              tenant.playbook === "condominium_management" ||
              tenant.playbook === "iapro") &&
            currentCase.currentStage !== "intake" ? (
              <InspectionWorkspace
                tenant={tenant}
                actor={actor}
                businessCase={currentCase}
              />
            ) : null}
            <div className="case-controls">
              {currentCase.currentStage === "identity" ? (
                <label>
                  Tipo de validación
                  <select
                    value={identityLookup}
                    onChange={(event) =>
                      setIdentityLookup(
                        event.target.value as "local" | "authorized",
                      )
                    }
                  >
                    <option value="local">Validación ecuatoriana local</option>
                    <option value="authorized">Consulta tributaria autorizada</option>
                  </select>
                </label>
              ) : null}
              {currentCase.currentStage === "quote" ? (
                <label>
                  Valor de la cotización (USD)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quoteAmount}
                    onChange={(event) => setQuoteAmount(event.target.value)}
                  />
                </label>
              ) : null}
              {canManage && nextAction(currentCase) ? (
                <div className="case-action-row">
                  {currentCase.currentStage === "approval" && canApprove ? (
                    <button
                      className="secondary-action"
                      disabled={busy}
                      onClick={() => void advance("reject_quote")}
                    >
                      Devolver
                    </button>
                  ) : null}
                  {currentCase.currentStage !== "approval" || canApprove ? (
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        (currentCase.currentStage === "quote" &&
                          (!quoteAmount || Number(quoteAmount) < 0))
                      }
                      onClick={() => void advance()}
                    >
                      {actionLabels[nextAction(currentCase)!]}
                    </button>
                  ) : (
                    <p>La cotización espera a una persona con permiso de aprobación.</p>
                  )}
                </div>
              ) : null}
              <p className="safety-note">
                Mensajes salientes: bloqueados · Factura emitida: no
              </p>
              {notice ? <p className="form-message">{notice}</p> : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
