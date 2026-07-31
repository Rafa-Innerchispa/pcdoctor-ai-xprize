import type {
  ManagedProperty,
  Membership,
  PropertyPortfolioBrief,
} from "@fieldspark/contracts";
import { useEffect, useState, type FormEvent } from "react";
import {
  createManagedProperty,
  createPropertyCommitment,
  createPropertyIssue,
  createPropertySystem,
  loadManagedProperties,
  loadPropertyPortfolioBrief,
} from "../api";

const propertyTypeLabels = {
  condominium: "Condominio",
  urbanization: "Urbanización",
  residential_building: "Edificio residencial",
  mixed_use: "Uso mixto",
  commercial_complex: "Complejo comercial",
} as const;

const conditionLabels = {
  unknown: "Sin verificar",
  operational: "Operativo",
  attention: "Requiere atención",
  critical: "Crítico",
} as const;

export function PortfolioPanel({
  tenantId,
  actor,
}: {
  tenantId: string;
  actor: Membership;
}) {
  const canManage =
    actor.role === "platform_owner" ||
    actor.permissions.includes("portfolio.manage");
  const [properties, setProperties] = useState<ManagedProperty[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [brief, setBrief] = useState<PropertyPortfolioBrief | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [quickAction, setQuickAction] = useState<
    "system" | "issue" | "commitment" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function reload(nextSelectedId = selectedId) {
    const [propertyResult, briefResult] = await Promise.all([
      loadManagedProperties(tenantId),
      loadPropertyPortfolioBrief(tenantId, nextSelectedId || undefined),
    ]);
    setProperties(propertyResult.properties);
    setBrief(briefResult.brief);
  }

  useEffect(() => {
    setSelectedId("");
    void reload("");
  }, [tenantId]);

  useEffect(() => {
    if (selectedId) void reload(selectedId);
  }, [selectedId]);

  async function createProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await createManagedProperty(tenantId, {
        name: String(form.get("name") ?? ""),
        propertyType: String(
          form.get("propertyType") ?? "urbanization",
        ) as "urbanization",
        city: String(form.get("city") ?? ""),
        address: String(form.get("address") ?? ""),
        unitCount: Number(form.get("unitCount")) || null,
        administratorName: String(form.get("administratorName") ?? ""),
        administratorUserId: null,
        synthetic: true,
      });
      setShowCreate(false);
      setSelectedId(result.property.id);
      setMessage("Espacio de prueba creado. No se enviaron comunicaciones.");
    } catch {
      setMessage("No se pudo crear el espacio. Revisa los datos.");
    } finally {
      setBusy(false);
    }
  }

  async function submitQuickAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !quickAction) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (quickAction === "system") {
        await createPropertySystem(tenantId, selectedId, {
          systemType: String(
            form.get("systemType") ?? "electric_fence",
          ) as "electric_fence",
          name: String(form.get("title") ?? ""),
          condition: String(
            form.get("condition") ?? "unknown",
          ) as "unknown",
          inventoryCount: Number(form.get("inventoryCount")) || 1,
          notes: String(form.get("notes") ?? ""),
          synthetic: true,
        });
      } else if (quickAction === "issue") {
        await createPropertyIssue(tenantId, selectedId, {
          category: String(form.get("category") ?? "maintenance") as "maintenance",
          title: String(form.get("title") ?? ""),
          description: String(form.get("notes") ?? ""),
          priority: String(form.get("priority") ?? "medium") as "medium",
          source: "manual",
          synthetic: true,
        });
      } else {
        const startsAt = String(form.get("startsAt") ?? "");
        await createPropertyCommitment(tenantId, {
          propertyId: selectedId,
          commitmentType: String(
            form.get("commitmentType") ?? "meeting",
          ) as "meeting",
          title: String(form.get("title") ?? ""),
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          dueAt: null,
          reminderAt: null,
          ownerUserId: null,
          notes: String(form.get("notes") ?? ""),
          synthetic: true,
        });
      }
      setQuickAction(null);
      setMessage("Registro de prueba guardado y agregado al brief central.");
      await reload(selectedId);
    } catch {
      setMessage("No se pudo guardar el registro. Revisa los datos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portfolio-layout">
      <section className="workspace-panel portfolio-list-panel">
        <div className="module-heading">
          <div>
            <span>PORTAFOLIO CENTRAL</span>
            <h2>Comunidades administradas</h2>
          </div>
          {canManage ? (
            <button
              className="compact-button"
              onClick={() => setShowCreate((value) => !value)}
            >
              {showCreate ? "Cancelar" : "Agregar"}
            </button>
          ) : null}
        </div>
        {showCreate ? (
          <form
            className="portfolio-form"
            onSubmit={(event) => void createProperty(event)}
          >
            <label>
              Nombre
              <input name="name" placeholder="Ej. Villa Blanca" required />
            </label>
            <div>
              <label>
                Tipo
                <select name="propertyType" defaultValue="urbanization">
                  {Object.entries(propertyTypeLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidades
                <input name="unitCount" type="number" min="0" />
              </label>
            </div>
            <div>
              <label>
                Ciudad
                <input name="city" defaultValue="Guayaquil" required />
              </label>
              <label>
                Administrador responsable
                <input name="administratorName" />
              </label>
            </div>
            <label>
              Dirección o referencia
              <input name="address" required />
            </label>
            <button className="primary-button" disabled={busy}>
              Crear entorno de prueba
            </button>
          </form>
        ) : null}
        <div className="property-list">
          <button
            className={!selectedId ? "active" : ""}
            onClick={() => setSelectedId("")}
          >
            <span className="property-monogram">↗</span>
            <span>
              <strong>Todo SERVIFRAN</strong>
              <small>Vista ejecutiva consolidada</small>
            </span>
          </button>
          {properties.map((property) => (
            <button
              className={selectedId === property.id ? "active" : ""}
              key={property.id}
              onClick={() => setSelectedId(property.id)}
            >
              <span className="property-monogram">
                {property.name.slice(0, 2)}
              </span>
              <span>
                <strong>{property.name}</strong>
                <small>
                  {propertyTypeLabels[property.propertyType]} ·{" "}
                  {property.administratorName || "Administrador por asignar"}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="portfolio-main">
        <section className="portfolio-hero">
          <div>
            <span>ASISTENTE CON MEMORIA OPERATIVA</span>
            <h1>{brief?.property?.name ?? "Control de todo el portafolio."}</h1>
            <p>
              Sistemas críticos, novedades y compromisos reunidos en un brief
              verificable. La IA responderá desde estos datos, no desde
              suposiciones.
            </p>
          </div>
          <div className="portfolio-grounded">
            <i />
            <span>
              <strong>Fuente conectada</strong>
              <small>Sin envíos automáticos</small>
            </span>
          </div>
        </section>

        <section className="metric-grid portfolio-metrics">
          {[
            ["Comunidades", brief?.totals.properties ?? 0],
            ["Novedades abiertas", brief?.totals.openIssues ?? 0],
            ["Sistemas en atención", brief?.totals.systemsRequiringAttention ?? 0],
            ["Próximos compromisos", brief?.totals.upcomingCommitments ?? 0],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>Datos del entorno seleccionado</small>
            </article>
          ))}
        </section>

        {selectedId && canManage ? (
          <section className="portfolio-action-bar">
            <span>Registrar en esta comunidad</span>
            <div>
              <button onClick={() => setQuickAction("system")}>
                Sistema o activo
              </button>
              <button onClick={() => setQuickAction("issue")}>Novedad</button>
              <button onClick={() => setQuickAction("commitment")}>
                Reunión o tarea
              </button>
            </div>
          </section>
        ) : null}

        {quickAction ? (
          <form
            className="workspace-panel portfolio-quick-form"
            onSubmit={(event) => void submitQuickAction(event)}
          >
            <div className="module-heading">
              <div>
                <span>NUEVO REGISTRO</span>
                <h2>
                  {quickAction === "system"
                    ? "Sistema o activo"
                    : quickAction === "issue"
                      ? "Novedad"
                      : "Compromiso"}
                </h2>
              </div>
              <button
                type="button"
                className="compact-button"
                onClick={() => setQuickAction(null)}
              >
                Cerrar
              </button>
            </div>
            <label>
              Título
              <input
                name="title"
                placeholder={
                  quickAction === "system"
                    ? "Ej. Cerco eléctrico perimetral"
                    : quickAction === "issue"
                      ? "Ej. Sector norte sin señal"
                      : "Ej. Reunión con el directorio"
                }
                required
              />
            </label>
            {quickAction === "system" ? (
              <div>
                <label>
                  Tipo
                  <select name="systemType">
                    <option value="electric_fence">Cerco eléctrico</option>
                    <option value="fire_detection">Detección de incendios</option>
                    <option value="fire_suppression">Extinción de incendios</option>
                    <option value="cctv">Cámaras</option>
                    <option value="access_control">Control de acceso</option>
                    <option value="elevators">Ascensores</option>
                    <option value="pumps">Bombas</option>
                    <option value="generator">Generador</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
                <label>
                  Estado
                  <select name="condition">
                    {Object.entries(conditionLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cantidad
                  <input name="inventoryCount" type="number" min="0" defaultValue="1" />
                </label>
              </div>
            ) : quickAction === "issue" ? (
              <div>
                <label>
                  Categoría
                  <select name="category">
                    <option value="security">Seguridad</option>
                    <option value="fire_safety">Seguridad contra incendios</option>
                    <option value="coexistence">Convivencia</option>
                    <option value="maintenance">Mantenimiento</option>
                    <option value="collections">Cobranzas</option>
                    <option value="governance">Gobierno y asambleas</option>
                    <option value="supplier">Proveedor</option>
                    <option value="emergency">Emergencia</option>
                  </select>
                </label>
                <label>
                  Prioridad
                  <select name="priority">
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                    <option value="low">Baja</option>
                  </select>
                </label>
              </div>
            ) : (
              <div>
                <label>
                  Tipo
                  <select name="commitmentType">
                    <option value="meeting">Reunión</option>
                    <option value="assembly">Asamblea</option>
                    <option value="inspection">Inspección</option>
                    <option value="task">Tarea</option>
                    <option value="deadline">Vencimiento</option>
                    <option value="payment">Pago</option>
                  </select>
                </label>
                <label>
                  Fecha y hora
                  <input name="startsAt" type="datetime-local" />
                </label>
              </div>
            )}
            <label>
              Detalle
              <textarea name="notes" required={quickAction === "issue"} />
            </label>
            <button className="primary-button" disabled={busy}>
              Guardar en el brief
            </button>
          </form>
        ) : null}

        <section className="portfolio-feed">
          <article className="workspace-panel">
            <div className="module-heading">
              <div>
                <span>RIESGOS Y NOVEDADES</span>
                <h2>Lo que requiere seguimiento</h2>
              </div>
              <strong>{brief?.issues.length ?? 0}</strong>
            </div>
            <div className="portfolio-records">
              {brief?.issues.length ? (
                brief.issues.map((issue) => (
                  <div key={issue.id}>
                    <i className={`priority-dot ${issue.priority}`} />
                    <span>
                      <strong>{issue.title}</strong>
                      <small>
                        {issue.category.replaceAll("_", " ")} · {issue.status}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <p>No hay novedades registradas todavía.</p>
              )}
            </div>
          </article>
          <article className="workspace-panel">
            <div className="module-heading">
              <div>
                <span>AGENDA CENTRAL</span>
                <h2>Reuniones y compromisos</h2>
              </div>
              <strong>{brief?.commitments.length ?? 0}</strong>
            </div>
            <div className="portfolio-records">
              {brief?.commitments.length ? (
                brief.commitments.map((commitment) => (
                  <div key={commitment.id}>
                    <i className="date-dot" />
                    <span>
                      <strong>{commitment.title}</strong>
                      <small>
                        {commitment.startsAt
                          ? new Intl.DateTimeFormat("es-EC", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(commitment.startsAt))
                          : "Fecha por definir"}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <p>No hay compromisos registrados todavía.</p>
              )}
            </div>
          </article>
        </section>
        {message ? <p className="portfolio-message">{message}</p> : null}
      </div>
    </div>
  );
}
