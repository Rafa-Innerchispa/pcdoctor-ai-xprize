"use client";

import {
  syntheticContacts,
  type DemoWorkflow,
  type SyntheticContact,
} from "@fieldspark/contracts";
import { useEffect, useMemo, useState } from "react";
import { loadDemoState, runWorkflowAction, saveDraft } from "../api";
import {
  ApprovalIcon,
  ArrowIcon,
  GridIcon,
  PulseIcon,
  SearchIcon,
  SparkIcon,
  UsersIcon,
} from "./icons";

type PlaybookKey = "studio" | "iapro";
type ApiStatus = "connecting" | "online" | "offline";

const playbooks = {
  studio: {
    eyebrow: "CUSTOMER CONTINUITY",
    title: "Cada conversación merece una siguiente acción.",
    description:
      "FieldSpark mantiene vivos los vínculos del estudio, encuentra oportunidades dormidas y prepara el trabajo facturable sin perder la sensibilidad humana.",
    agents: [
      ["Intake", "Clasifica intención", "Activo"],
      ["Continuity", "Prepara seguimiento", "Activo"],
      ["Billing", "Espera aprobación humana", "Seguro"],
    ],
  },
  iapro: {
    eyebrow: "CONSULTING INTAKE",
    title: "De una solicitud difusa a un alcance defendible.",
    description:
      "FieldSpark clasifica la necesidad, formula las preguntas faltantes y entrega a IAPRO una oportunidad lista para revisión.",
    agents: [
      ["Intake", "Extrae el problema operativo", "Activo"],
      ["Scoping", "Estructura el diagnóstico", "Activo"],
      ["Proposal", "Espera precio humano", "Seguro"],
    ],
  },
} as const;

const money = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const priorityLabel = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
} as const;

const statusLabel: Record<DemoWorkflow["status"], string> = {
  new: "Sin analizar",
  awaiting_approval: "Por aprobar",
  approved: "Aprobado",
  rejected: "Devuelto",
  billing_review: "Revisar cobro",
};

function workflowMap(workflows: DemoWorkflow[]) {
  return Object.fromEntries(
    workflows.map((workflow) => [workflow.contactId, workflow]),
  );
}

export function ControlRoom() {
  const [active, setActive] = useState<PlaybookKey>("studio");
  const [contacts, setContacts] =
    useState<readonly SyntheticContact[]>(syntheticContacts);
  const [workflows, setWorkflows] = useState<Record<string, DemoWorkflow>>({});
  const [selectedContact, setSelectedContact] = useState(0);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("connecting");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const content = playbooks[active];

  useEffect(() => {
    let mounted = true;
    loadDemoState()
      .then((state) => {
        if (!mounted) return;
        setContacts(state.contacts);
        setWorkflows(workflowMap(state.workflows));
        setApiStatus("online");
      })
      .catch(() => {
        if (!mounted) return;
        setApiStatus("offline");
        setNotice(
          "La interfaz está visible, pero la API no respondió. Los datos locales siguen disponibles.",
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  const activeContacts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("es");
    return contacts.filter((contact) => {
      const belongs =
        active === "studio"
          ? contact.playbook === "photography_studio"
          : contact.playbook === "iapro";
      return (
        belongs &&
        (!needle ||
          `${contact.displayName} ${contact.accountName} ${contact.opportunity}`
            .toLocaleLowerCase("es")
            .includes(needle))
      );
    });
  }, [active, contacts, search]);

  const selected = activeContacts[selectedContact] ?? activeContacts[0];
  const selectedWorkflow = selected ? workflows[selected.id] : undefined;
  const pendingApprovals = Object.values(workflows).filter(
    (workflow) => workflow.status === "awaiting_approval",
  ).length;
  const decisions = Object.values(workflows).filter(
    (workflow) => workflow.analysis,
  ).length;
  const billingItems = Object.values(workflows).filter(
    (workflow) => workflow.status === "billing_review",
  ).length;
  const totalPipelineUsd = contacts.reduce(
    (total, contact) => total + contact.estimatedValueUsd,
    0,
  );
  const confidence = selectedWorkflow?.analysis?.confidence
    ? `${Math.round(selectedWorkflow.analysis.confidence * 100)}%`
    : "—";
  const nowLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("es-EC", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    [],
  );

  useEffect(() => {
    setSelectedContact(0);
  }, [active, search]);

  useEffect(() => {
    setEditing(false);
    setDraft(selectedWorkflow?.draftReply ?? "");
  }, [selected?.id, selectedWorkflow?.updatedAt]);

  function updateWorkflow(workflow: DemoWorkflow) {
    setWorkflows((current) => ({
      ...current,
      [workflow.contactId]: workflow,
    }));
  }

  async function execute(
    action: "analyze" | "approve" | "reject" | "billing-review",
  ) {
    if (!selected || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await runWorkflowAction(selected.id, action);
      updateWorkflow(response.workflow);
      setNotice(
        action === "analyze"
          ? "Análisis terminado. El borrador quedó esperando revisión humana."
          : action === "approve"
            ? "Aprobación registrada. No se envió ningún mensaje."
            : action === "reject"
              ? "El caso fue devuelto para un nuevo análisis."
              : "Ítem preparado para revisión. No se emitió ninguna factura.",
      );
    } catch {
      setNotice("No se pudo completar la acción. Intenta nuevamente.");
      setApiStatus("offline");
    } finally {
      setBusy(false);
    }
  }

  async function persistDraft() {
    if (!selected || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await saveDraft(selected.id, draft);
      updateWorkflow(response.workflow);
      setEditing(false);
      setNotice("Borrador actualizado y guardado en la nube.");
    } catch {
      setNotice("El borrador debe tener entre 5 y 600 caracteres.");
    } finally {
      setBusy(false);
    }
  }

  if (!selected) {
    return (
      <main className="empty-state">
        <strong>No encontramos contactos con esa búsqueda.</strong>
        <button type="button" onClick={() => setSearch("")}>
          Limpiar búsqueda
        </button>
      </main>
    );
  }

  const workflowStatus = selectedWorkflow?.status ?? "new";
  const suggestedAction =
    selectedWorkflow?.analysis?.nextBestAction ?? selected.nextAction;
  const timelineAnalyzed = Boolean(selectedWorkflow?.analysis);
  const timelineApproved =
    workflowStatus === "approved" || workflowStatus === "billing_review";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <PulseIcon />
          </span>
          <div>
            <strong>FieldSpark</strong>
            <small>PC DOCTOR AI</small>
          </div>
        </div>

        <nav aria-label="Navegación principal">
          <a className="nav-item active" href="#overview">
            <GridIcon />
            Overview
          </a>
          <a className="nav-item" href="#customers">
            <UsersIcon />
            Customers
          </a>
          <a className="nav-item" href="#agents">
            <SparkIcon />
            Agent room
          </a>
          <a className="nav-item" href="#approvals">
            <ApprovalIcon />
            Approvals<span>{pendingApprovals}</span>
          </a>
        </nav>

        <div className="sidebar-foot">
          <div className="safety-indicator">
            <i />
            <div>
              <strong>Safe demo</strong>
              <small>Envíos y facturas bloqueados</small>
            </div>
          </div>
          <button type="button" className="profile">
            <span>RA</span>
            <div>
              <strong>Rafael</strong>
              <small>Owner</small>
            </div>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="search">
            <SearchIcon />
            <input
              aria-label="Buscar contactos"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar clientes, casos u oportunidades"
              value={search}
            />
          </label>
          <div className="top-actions">
            <span className={`api-state ${apiStatus}`}>
              {apiStatus === "online"
                ? "Nube conectada"
                : apiStatus === "connecting"
                  ? "Conectando"
                  : "Sin conexión"}
            </span>
            <span className="synthetic">Datos sintéticos</span>
            <time>{nowLabel}</time>
          </div>
        </header>

        <div className="content" id="overview">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span />
                {content.eyebrow}
              </div>
              <h1>{content.title}</h1>
              <p>{content.description}</p>
              <div
                className="playbook-switch"
                aria-label="Seleccionar playbook"
              >
                <button
                  className={active === "studio" ? "active" : ""}
                  onClick={() => setActive("studio")}
                  type="button"
                >
                  Estudio fotográfico
                </button>
                <button
                  className={active === "iapro" ? "active" : ""}
                  onClick={() => setActive("iapro")}
                  type="button"
                >
                  IAPRO
                </button>
              </div>
            </div>
            <div className="orbit-card">
              <div className="orbit">
                <span className="orbit-ring ring-one" />
                <span className="orbit-ring ring-two" />
                <span className="core">
                  <SparkIcon />
                </span>
                <i className="node node-a" />
                <i className="node node-b" />
                <i className="node node-c" />
              </div>
              <div className="orbit-copy">
                <small>AGENT COVERAGE</small>
                <strong>87%</strong>
                <span>de oportunidades con siguiente acción</span>
              </div>
            </div>
          </section>

          <section className="metrics" aria-label="Métricas de demostración">
            <article>
              <small>Contactos de prueba</small>
              <strong>{contacts.length}</strong>
              <span className="trend">10 Estudio · 10 IAPRO</span>
            </article>
            <article>
              <small>Pipeline sintético</small>
              <strong>{money.format(totalPipelineUsd)}</strong>
              <span className="trend">Sin valor comercial real</span>
            </article>
            <article>
              <small>Casos analizados</small>
              <strong>{decisions}</strong>
              <span>Persistidos y auditables</span>
            </article>
            <article>
              <small>Revisión humana</small>
              <strong>{pendingApprovals}</strong>
              <span className="attention">{billingItems} ítems de cobro</span>
            </article>
          </section>

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")}>
                Cerrar
              </button>
            </div>
          )}

          <section className="dashboard-grid">
            <article className="panel focus-panel" id="approvals">
              <div className="panel-heading">
                <div>
                  <small>CASO EN FOCO · SINTÉTICO</small>
                  <h2>{selected.opportunity}</h2>
                </div>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (!timelineAnalyzed) void execute("analyze");
                  }}
                  type="button"
                >
                  {timelineAnalyzed ? "Caso abierto" : "Analizar caso"}{" "}
                  <ArrowIcon />
                </button>
              </div>
              <div className="case-person">
                <span className="avatar">
                  {selected.displayName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{selected.displayName}</strong>
                  <small>
                    {selected.channel} · {selected.accountName}
                  </small>
                </div>
                <div className="case-value">
                  <small>VALOR DE PRUEBA</small>
                  <strong>{money.format(selected.estimatedValueUsd)}</strong>
                </div>
              </div>
              <div className="decision-card">
                <div className="decision-top">
                  <span>
                    <SparkIcon />
                    Decisión sugerida
                  </span>
                  <small>{confidence} confianza</small>
                </div>
                <p>{suggestedAction}</p>

                {editing ? (
                  <div className="draft-editor">
                    <label htmlFor="draft-reply">Borrador para revisión</label>
                    <textarea
                      id="draft-reply"
                      maxLength={600}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={4}
                      value={draft}
                    />
                    <div>
                      <small>{draft.length}/600</small>
                      <button
                        className="ghost"
                        onClick={() => setEditing(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button
                        className="approve"
                        disabled={busy}
                        onClick={() => void persistDraft()}
                        type="button"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  selectedWorkflow?.draftReply && (
                    <blockquote className="draft-preview">
                      “{selectedWorkflow.draftReply}”
                    </blockquote>
                  )
                )}

                <div className="approval-row">
                  <span className={`workflow-status ${workflowStatus}`}>
                    {statusLabel[workflowStatus]}
                  </span>
                  <div>
                    {!timelineAnalyzed && (
                      <button
                        className="approve"
                        disabled={busy}
                        onClick={() => void execute("analyze")}
                        type="button"
                      >
                        {busy ? "Analizando…" : "Analizar"}
                      </button>
                    )}
                    {workflowStatus === "awaiting_approval" && !editing && (
                      <>
                        <button
                          className="ghost"
                          disabled={busy}
                          onClick={() => setEditing(true)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="reject"
                          disabled={busy}
                          onClick={() => void execute("reject")}
                          type="button"
                        >
                          Devolver
                        </button>
                        <button
                          className="approve"
                          disabled={busy}
                          onClick={() => void execute("approve")}
                          type="button"
                        >
                          Aprobar
                        </button>
                      </>
                    )}
                    {workflowStatus === "approved" && (
                      <button
                        className="approve"
                        disabled={busy}
                        onClick={() => void execute("billing-review")}
                        type="button"
                      >
                        Preparar cobro
                      </button>
                    )}
                    {workflowStatus === "rejected" && (
                      <button
                        className="approve"
                        disabled={busy}
                        onClick={() => void execute("analyze")}
                        type="button"
                      >
                        Volver a analizar
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="timeline">
                <div className="timeline-step complete">
                  <i />
                  <span>Solicitud recibida</span>
                  <small>Registrada</small>
                </div>
                <div
                  className={`timeline-step ${timelineAnalyzed ? "complete" : "current"}`}
                >
                  <i />
                  <span>Intención clasificada</span>
                  <small>{timelineAnalyzed ? "Completa" : "Pendiente"}</small>
                </div>
                <div
                  className={`timeline-step ${timelineApproved ? "complete" : timelineAnalyzed ? "current" : ""}`}
                >
                  <i />
                  <span>Revisión humana</span>
                  <small>{timelineApproved ? "Aprobada" : "Pendiente"}</small>
                </div>
                <div
                  className={`timeline-step ${workflowStatus === "billing_review" ? "complete" : ""}`}
                >
                  <i />
                  <span>Cola de facturación</span>
                  <small>
                    {workflowStatus === "billing_review"
                      ? "Lista para revisar"
                      : "Sin emitir"}
                  </small>
                </div>
              </div>
            </article>

            <article className="panel agent-panel" id="agents">
              <div className="panel-heading">
                <div>
                  <small>AGENT CONTROL ROOM</small>
                  <h2>Flujo operativo</h2>
                </div>
                <span className={`live ${apiStatus}`}>
                  <i />
                  {apiStatus === "online" ? "LIVE" : "CHECK"}
                </span>
              </div>
              <div className="agent-list">
                {content.agents.map(([name, action, time], index) => (
                  <div className="agent-row" key={name}>
                    <span className={`agent-symbol tone-${index}`}>
                      <SparkIcon />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <small>{action}</small>
                    </div>
                    <time>{time}</time>
                  </div>
                ))}
              </div>
              <div className="guardrail">
                <ApprovalIcon />
                <div>
                  <strong>Guardrails activos</strong>
                  <span>
                    Precios, envíos y facturación requieren aprobación. Esta
                    demo nunca contacta personas reales.
                  </span>
                </div>
              </div>
            </article>

            <article className="panel contacts-panel" id="customers">
              <div className="panel-heading">
                <div>
                  <small>CONTINUIDAD · DATOS SINTÉTICOS</small>
                  <h2>{activeContacts.length} contactos listos para probar</h2>
                </div>
                <span className="synthetic">Envíos bloqueados</span>
              </div>
              <div className="contact-table">
                {activeContacts.map((contact, index) => {
                  const workflow = workflows[contact.id];
                  return (
                    <button
                      type="button"
                      className={
                        selectedContact === index
                          ? "contact-row selected"
                          : "contact-row"
                      }
                      onClick={() => setSelectedContact(index)}
                      key={contact.id}
                    >
                      <span className="mini-avatar">
                        {contact.displayName.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <strong>{contact.displayName}</strong>
                        <small>{contact.opportunity}</small>
                      </span>
                      <span>
                        <small>SIGUIENTE ACCIÓN</small>
                        <strong>{contact.nextAction}</strong>
                      </span>
                      <span>
                        <small>ESTADO DEL CASO</small>
                        <strong>
                          {statusLabel[workflow?.status ?? "new"]}
                        </strong>
                      </span>
                      <span
                        className={`priority ${priorityLabel[
                          contact.priority
                        ].toLowerCase()}`}
                      >
                        {priorityLabel[contact.priority]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
