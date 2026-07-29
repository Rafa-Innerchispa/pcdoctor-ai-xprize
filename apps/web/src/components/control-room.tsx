"use client";

import { syntheticContacts } from "@fieldspark/contracts";
import { useEffect, useMemo, useState } from "react";
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

const playbooks = {
  studio: {
    eyebrow: "CUSTOMER CONTINUITY",
    title: "Cada conversación merece una siguiente acción.",
    description:
      "FieldSpark mantiene vivos los vínculos del estudio, encuentra oportunidades dormidas y prepara el trabajo facturable sin perder la sensibilidad humana.",
    confidence: "91%",
    agents: [
      ["Intake", "Clasificó intención", "12 s"],
      ["Continuity", "Detectó seguimiento vencido", "1 min"],
      ["Billing", "Preparó ítem facturable", "3 min"],
    ],
  },
  iapro: {
    eyebrow: "CONSULTING INTAKE",
    title: "De una solicitud difusa a un alcance defendible.",
    description:
      "FieldSpark clasifica la necesidad entre 18 líneas de servicio, formula las preguntas faltantes y entrega a IAPRO una oportunidad lista para revisión.",
    confidence: "88%",
    agents: [
      ["Intake", "Extrajo problema operativo", "9 s"],
      ["Scoping", "Generó diagnóstico inicial", "34 s"],
      ["Proposal", "Esperando precio humano", "Ahora"],
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

const totalPipelineUsd = syntheticContacts.reduce(
  (total, contact) => total + contact.estimatedValueUsd,
  0,
);

export function ControlRoom() {
  const [active, setActive] = useState<PlaybookKey>("studio");
  const [selectedContact, setSelectedContact] = useState(0);
  const content = playbooks[active];
  const activeContacts = useMemo(
    () =>
      syntheticContacts.filter((contact) =>
        active === "studio"
          ? contact.playbook === "photography_studio"
          : contact.playbook === "iapro",
      ),
    [active],
  );
  const selected = activeContacts[selectedContact] ?? activeContacts[0];
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
  }, [active]);

  if (!selected) {
    return null;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><PulseIcon /></span>
          <div>
            <strong>FieldSpark</strong>
            <small>PC DOCTOR AI</small>
          </div>
        </div>

        <nav aria-label="Navegación principal">
          <a className="nav-item active" href="#overview"><GridIcon />Overview</a>
          <a className="nav-item" href="#customers"><UsersIcon />Customers</a>
          <a className="nav-item" href="#agents"><SparkIcon />Agent room</a>
          <a className="nav-item" href="#approvals"><ApprovalIcon />Approvals<span>3</span></a>
        </nav>

        <div className="sidebar-foot">
          <div className="safety-indicator">
            <i />
            <div><strong>Safe demo</strong><small>Outbound bloqueado</small></div>
          </div>
          <button type="button" className="profile">
            <span>RA</span>
            <div><strong>Rafael</strong><small>Owner</small></div>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="search"><SearchIcon /><span>Buscar clientes, casos o decisiones</span><kbd>⌘ K</kbd></div>
          <div className="top-actions">
            <span className="synthetic">Datos sintéticos</span>
            <time>{nowLabel}</time>
          </div>
        </header>

        <div className="content" id="overview">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><span />{content.eyebrow}</div>
              <h1>{content.title}</h1>
              <p>{content.description}</p>
              <div className="playbook-switch" aria-label="Seleccionar playbook">
                <button className={active === "studio" ? "active" : ""} onClick={() => setActive("studio")} type="button">
                  Estudio fotográfico
                </button>
                <button className={active === "iapro" ? "active" : ""} onClick={() => setActive("iapro")} type="button">
                  IAPRO
                </button>
              </div>
            </div>
            <div className="orbit-card">
              <div className="orbit">
                <span className="orbit-ring ring-one" />
                <span className="orbit-ring ring-two" />
                <span className="core"><SparkIcon /></span>
                <i className="node node-a" /><i className="node node-b" /><i className="node node-c" />
              </div>
              <div className="orbit-copy"><small>AGENT COVERAGE</small><strong>87%</strong><span>de oportunidades con siguiente acción</span></div>
            </div>
          </section>

          <section className="metrics" aria-label="Métricas de demostración">
            <article><small>Contactos de prueba</small><strong>{syntheticContacts.length}</strong><span className="trend">10 Estudio · 10 IAPRO</span></article>
            <article><small>Pipeline sintético</small><strong>{money.format(totalPipelineUsd)}</strong><span className="trend">Sin valor comercial real</span></article>
            <article><small>Decisiones de agentes</small><strong>142</strong><span>100% auditadas</span></article>
            <article><small>Revisión humana</small><strong>3</strong><span className="attention">Requieren atención</span></article>
          </section>

          <section className="dashboard-grid">
            <article className="panel focus-panel">
              <div className="panel-heading">
                <div><small>CASO EN FOCO · SINTÉTICO</small><h2>{selected.opportunity}</h2></div>
                <button type="button">Abrir caso <ArrowIcon /></button>
              </div>
              <div className="case-person">
                <span className="avatar">{selected.displayName.slice(0, 2).toUpperCase()}</span>
                <div><strong>{selected.displayName}</strong><small>{selected.channel} · {selected.accountName}</small></div>
                <div className="case-value"><small>VALOR DE PRUEBA</small><strong>{money.format(selected.estimatedValueUsd)}</strong></div>
              </div>
              <div className="decision-card">
                <div className="decision-top"><span><SparkIcon />Decisión sugerida</span><small>{content.confidence} confianza</small></div>
                <p>{selected.nextAction}</p>
                <div className="approval-row">
                  <span>Requiere revisión humana antes del envío</span>
                  <div><button type="button" className="ghost">Editar</button><button type="button" className="approve">Aprobar</button></div>
                </div>
              </div>
              <div className="timeline">
                <div className="timeline-step complete"><i /><span>Solicitud recibida</span><small>09:12</small></div>
                <div className="timeline-step complete"><i /><span>Intención clasificada</span><small>09:12</small></div>
                <div className="timeline-step current"><i /><span>Respuesta lista para revisión</span><small>Ahora</small></div>
                <div className="timeline-step"><i /><span>Seguimiento programado</span><small>+24 h</small></div>
              </div>
            </article>

            <article className="panel agent-panel" id="agents">
              <div className="panel-heading"><div><small>AGENT CONTROL ROOM</small><h2>Trabajando ahora</h2></div><span className="live"><i />LIVE</span></div>
              <div className="agent-list">
                {content.agents.map(([name, action, time], index) => (
                  <div className="agent-row" key={name}>
                    <span className={`agent-symbol tone-${index}`}><SparkIcon /></span>
                    <div><strong>{name}</strong><small>{action}</small></div>
                    <time>{time}</time>
                  </div>
                ))}
              </div>
              <div className="guardrail"><ApprovalIcon /><div><strong>Guardrails activos</strong><span>Precios, envíos y facturación requieren aprobación.</span></div></div>
            </article>

            <article className="panel contacts-panel" id="customers">
              <div className="panel-heading">
                <div><small>CONTINUIDAD · DATOS SINTÉTICOS</small><h2>{activeContacts.length} contactos listos para probar</h2></div>
                <span className="synthetic">Envíos bloqueados</span>
              </div>
              <div className="contact-table">
                {activeContacts.map((contact, index) => (
                  <button
                    type="button"
                    className={selectedContact === index ? "contact-row selected" : "contact-row"}
                    onClick={() => setSelectedContact(index)}
                    key={contact.id}
                  >
                    <span className="mini-avatar">{contact.displayName.slice(0, 2).toUpperCase()}</span>
                    <span><strong>{contact.displayName}</strong><small>{contact.opportunity}</small></span>
                    <span><small>SIGUIENTE ACCIÓN</small><strong>{contact.nextAction}</strong></span>
                    <span><small>VALOR DE PRUEBA</small><strong>{money.format(contact.estimatedValueUsd)}</strong></span>
                    <span className={`priority ${priorityLabel[contact.priority].toLowerCase()}`}>{priorityLabel[contact.priority]}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
