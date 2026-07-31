import {
  defaultPermissionsByRole,
  fieldSparkPermissions,
  type FieldSparkPermission,
  type FieldSparkRole,
  type Membership,
} from "@fieldspark/contracts";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createInvitation,
  loadInvitations,
  loadTenantMembers,
  updateMember,
} from "./api";
import { useFieldSparkAuth } from "./auth-context";
import { CasesPanel } from "./components/cases-panel";
import { PortfolioPanel } from "./components/portfolio-panel";

const roleLabels: Record<FieldSparkRole, string> = {
  platform_owner: "Propietario",
  administrator: "Administrador",
  collaborator: "Colaborador",
  customer: "Cliente",
};

const permissionLabels: Record<FieldSparkPermission, string> = {
  "tenant.manage": "Configurar la organización",
  "members.manage": "Administrar equipo y accesos",
  "customers.view": "Ver clientes",
  "customers.manage": "Gestionar clientes",
  "cases.view": "Ver casos y solicitudes",
  "cases.manage": "Gestionar casos y solicitudes",
  "quotes.view": "Ver cotizaciones",
  "quotes.manage": "Preparar cotizaciones",
  "quotes.approve": "Aprobar cotizaciones",
  "services.view": "Ver servicios",
  "services.manage": "Gestionar servicios",
  "billing.view": "Ver facturación",
  "billing.prepare": "Preparar facturación",
  "billing.issue": "Emitir facturas",
  "messages.prepare": "Preparar mensajes",
  "messages.approve": "Aprobar mensajes",
  "messages.send": "Enviar mensajes",
  "reports.view": "Ver reportes",
  "audit.view": "Ver auditoría",
  "integrations.manage": "Administrar integraciones",
  "portfolio.view": "Ver comunidades y edificios",
  "portfolio.manage": "Gestionar comunidades y edificios",
};

const navByRole: Record<FieldSparkRole, string[]> = {
  platform_owner: [
    "Resumen",
    "Expedientes",
    "Clientes",
    "Cotizaciones",
    "Servicios",
    "Facturación",
    "Equipo",
    "Configuración",
  ],
  administrator: [
    "Resumen",
    "Expedientes",
    "Clientes",
    "Cotizaciones",
    "Servicios",
    "Facturación",
    "Equipo",
  ],
  collaborator: [
    "Resumen",
    "Expedientes",
    "Clientes",
    "Cotizaciones",
    "Servicios",
    "Tareas",
  ],
  customer: [
    "Mis expedientes",
    "Servicios",
    "Cotizaciones",
    "Facturas",
    "Consultas",
  ],
};

function navigationFor(role: FieldSparkRole, playbook: string) {
  const base = navByRole[role];
  if (playbook !== "condominium_management" || role === "customer") {
    return base;
  }
  return [base[0]!, "Portafolio", ...base.slice(1)];
}

function Brand() {
  return (
    <div className="product-brand">
      <span className="product-brand-mark" aria-hidden="true">
        F
      </span>
      <span>
        <strong>FieldSpark</strong>
        <small>CLIENT OPERATIONS</small>
      </span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-page">
      <section className="auth-card loading-card">
        <Brand />
        <span className="loading-ring" aria-label="Cargando" />
        <p>Preparando tu espacio de trabajo…</p>
      </section>
    </main>
  );
}

function WelcomeScreen() {
  const { signIn, error, loading } = useFieldSparkAuth();
  return (
    <main className="auth-page">
      <div className="auth-atmosphere auth-atmosphere-one" />
      <div className="auth-atmosphere auth-atmosphere-two" />
      <section className="welcome-shell">
        <div className="welcome-copy">
          <Brand />
          <p className="welcome-kicker">OPERACIONES QUE NO PIERDEN EL HILO</p>
          <h1>Convierte cada conversación en una siguiente acción.</h1>
          <p className="welcome-lead">
            Clientes, cotizaciones, servicios y seguimiento en un solo espacio,
            con inteligencia artificial y control humano.
          </p>
          <div className="welcome-proof">
            <span>01</span>
            <p>
              Cada empresa conserva sus datos, equipo y reglas en un entorno
              separado.
            </p>
          </div>
          <div className="welcome-proof">
            <span>02</span>
            <p>
              Ningún mensaje ni factura sale sin los permisos y aprobaciones
              definidos.
            </p>
          </div>
        </div>
        <div className="auth-card welcome-card">
          <span className="secure-pill">Acceso seguro</span>
          <h2>Bienvenido</h2>
          <p>
            Usa tu cuenta de Google. Si tu correo ya fue invitado, entrarás
            directamente a tu organización.
          </p>
          <button
            className="google-button"
            onClick={() => void signIn()}
            disabled={loading}
          >
            <span className="google-g">G</span>
            Ya tengo una cuenta
          </button>
          <button
            className="secondary-auth-button"
            onClick={() => void signIn()}
            disabled={loading}
          >
            Crear mi registro
          </button>
          {error ? <p className="form-error">{error}</p> : null}
          <p className="auth-note">
            Al continuar confirmas que usarás información real únicamente con
            autorización de tu organización.
          </p>
        </div>
      </section>
    </main>
  );
}

function OnboardingScreen() {
  const { session, firebaseUser, saveProfile, signOut, error } =
    useFieldSparkAuth();
  const [formError, setFormError] = useState("");
  const [personType, setPersonType] = useState<"natural" | "company">(
    "natural",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      await saveProfile({
        displayName: String(form.get("displayName") ?? ""),
        phone: String(form.get("phone") ?? "").replace(/[\s()-]/g, ""),
        taxId: String(form.get("taxId") ?? "").replace(/\D/g, ""),
        personType,
        legalName:
          personType === "company"
            ? String(form.get("legalName") ?? "")
            : "",
      });
    } catch {
      setFormError(
        "Revisa los datos. La cédula debe tener 10 dígitos, el RUC 13 y el teléfono entre 8 y 15.",
      );
    }
  }

  return (
    <main className="auth-page">
      <section className="onboarding-shell">
        <div className="onboarding-aside">
          <Brand />
          <span className="step-number">01 / 01</span>
          <h1>Completa tu perfil.</h1>
          <p>
            Estos datos identifican quién realiza cada acción y permiten
            mantener una trazabilidad confiable.
          </p>
          <button className="text-button" onClick={() => void signOut()}>
            Usar otra cuenta
          </button>
        </div>
        <form className="profile-form" onSubmit={(event) => void submit(event)}>
          <div className="form-heading">
            {firebaseUser?.photoURL ? (
              <img src={firebaseUser.photoURL} alt="" />
            ) : (
              <span>{(firebaseUser?.displayName || "U").slice(0, 1)}</span>
            )}
            <div>
              <small>CUENTA VERIFICADA</small>
              <strong>{firebaseUser?.email || session?.user.email}</strong>
            </div>
          </div>
          <label>
            Nombre completo
            <input
              name="displayName"
              defaultValue={
                session?.user.displayName || firebaseUser?.displayName || ""
              }
              minLength={2}
              required
            />
          </label>
          <div className="type-selector" aria-label="Tipo de persona">
            <button
              type="button"
              className={personType === "natural" ? "active" : ""}
              onClick={() => setPersonType("natural")}
            >
              Persona natural
            </button>
            <button
              type="button"
              className={personType === "company" ? "active" : ""}
              onClick={() => setPersonType("company")}
            >
              Empresa
            </button>
          </div>
          <div className="form-grid">
            <label>
              {personType === "company" ? "RUC" : "Cédula"}
              <input
                name="taxId"
                inputMode="numeric"
                placeholder={personType === "company" ? "13 dígitos" : "10 dígitos"}
                required
              />
            </label>
            <label>
              Teléfono
              <input
                name="phone"
                inputMode="tel"
                placeholder="+593 99 000 0000"
                required
              />
            </label>
          </div>
          {personType === "company" ? (
            <label>
              Razón social
              <input name="legalName" minLength={2} required />
            </label>
          ) : null}
          {formError || error ? (
            <p className="form-error">{formError || error}</p>
          ) : null}
          <button className="primary-button" type="submit">
            Guardar y continuar
          </button>
        </form>
      </section>
    </main>
  );
}

function PendingAccess() {
  const { session, signOut, refreshSession } = useFieldSparkAuth();
  return (
    <main className="auth-page">
      <section className="auth-card pending-card">
        <Brand />
        <span className="pending-icon">✓</span>
        <h1>Tu registro está listo.</h1>
        <p>
          <strong>{session?.user.email}</strong> todavía no tiene una
          organización asignada. El administrador debe invitar exactamente
          este correo.
        </p>
        <button
          className="primary-button"
          onClick={() => void refreshSession()}
        >
          Comprobar acceso
        </button>
        <button className="text-button" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}

function TeamPanel({
  tenantId,
  actor,
}: {
  tenantId: string;
  actor: Membership;
}) {
  type MemberRow = Awaited<ReturnType<typeof loadTenantMembers>>["members"][number];
  const canManage =
    actor.role === "platform_owner" ||
    actor.permissions.includes("members.manage");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<
    Awaited<ReturnType<typeof loadInvitations>>["invitations"]
  >([]);
  const [role, setRole] =
    useState<Exclude<FieldSparkRole, "platform_owner">>("collaborator");
  const [permissions, setPermissions] = useState<FieldSparkPermission[]>([
    ...defaultPermissionsByRole.collaborator,
  ]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!canManage) return;
    const [memberResult, invitationResult] = await Promise.all([
      loadTenantMembers(tenantId),
      loadInvitations(tenantId),
    ]);
    setMembers(memberResult.members);
    setInvitations(invitationResult.invitations);
  }

  useEffect(() => {
    void reload();
  }, [tenantId, canManage]);

  function selectRole(next: Exclude<FieldSparkRole, "platform_owner">) {
    setRole(next);
    setPermissions([...defaultPermissionsByRole[next]]);
  }

  function togglePermission(permission: FieldSparkPermission) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createInvitation(tenantId, { email, role, permissions });
      setEmail("");
      setMessage("Invitación registrada. El acceso se activará al iniciar sesión.");
      await reload();
    } catch {
      setMessage("No se pudo registrar la invitación.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(row: MemberRow) {
    if (row.membership.role === "platform_owner") return;
    setBusy(true);
    try {
      await updateMember(tenantId, row.membership.userId, {
        role: row.membership.role,
        permissions: row.membership.permissions,
        status:
          row.membership.status === "active" ? "suspended" : "active",
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <section className="workspace-panel empty-module">
        <span>ACCESO RESTRINGIDO</span>
        <h2>Administración del equipo</h2>
        <p>Tu perfil no tiene permiso para modificar usuarios.</p>
      </section>
    );
  }

  return (
    <div className="team-layout">
      <section className="workspace-panel">
        <div className="module-heading">
          <div>
            <span>EQUIPO ACTIVO</span>
            <h2>Personas con acceso</h2>
          </div>
          <strong>{members.length}</strong>
        </div>
        <div className="member-list">
          {members.map((row) => (
            <article className="member-row" key={row.membership.id}>
              <span className="member-avatar">
                {(row.user?.displayName || row.user?.email || "?").slice(0, 1)}
              </span>
              <div>
                <strong>{row.user?.displayName || "Registro pendiente"}</strong>
                <small>{row.user?.email || row.membership.userId}</small>
              </div>
              <span className="role-pill">
                {roleLabels[row.membership.role]}
              </span>
              <button
                className="status-button"
                disabled={
                  busy || row.membership.role === "platform_owner"
                }
                onClick={() => void changeStatus(row)}
              >
                {row.membership.status === "active" ? "Activo" : "Suspendido"}
              </button>
            </article>
          ))}
        </div>
        {invitations.filter((item) => item.status === "pending").length ? (
          <div className="pending-invitations">
            <span>INVITACIONES PENDIENTES</span>
            {invitations
              .filter((item) => item.status === "pending")
              .map((item) => (
                <p key={item.id}>
                  {item.email}
                  <small>{roleLabels[item.role]}</small>
                </p>
              ))}
          </div>
        ) : null}
      </section>
      <form className="workspace-panel invite-panel" onSubmit={(event) => void invite(event)}>
        <span>NUEVO ACCESO</span>
        <h2>Invitar una persona</h2>
        <label>
          Correo de Google
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="persona@empresa.com"
            required
          />
        </label>
        <label>
          Tipo de usuario
          <select
            value={role}
            onChange={(event) =>
              selectRole(
                event.target.value as Exclude<FieldSparkRole, "platform_owner">,
              )
            }
          >
            <option value="administrator">Administrador</option>
            <option value="collaborator">Colaborador</option>
            <option value="customer">Cliente</option>
          </select>
        </label>
        {role === "collaborator" ? (
          <fieldset className="permission-grid">
            <legend>Permisos específicos</legend>
            {fieldSparkPermissions
              .filter(
                (permission) =>
                  !["tenant.manage", "members.manage", "billing.issue"].includes(
                    permission,
                  ),
              )
              .map((permission) => (
                <label key={permission}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                  />
                  {permissionLabels[permission]}
                </label>
              ))}
          </fieldset>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
        <button className="primary-button" type="submit" disabled={busy}>
          Registrar invitación
        </button>
      </form>
    </div>
  );
}

function OverviewPanel({ role }: { role: FieldSparkRole }) {
  const isCustomer = role === "customer";
  const metrics = isCustomer
    ? [
        ["Servicios activos", "0", "Tus servicios aparecerán aquí"],
        ["Cotizaciones", "0", "Pendientes de revisión"],
        ["Facturas", "0", "Documentos disponibles"],
        ["Consultas", "0", "Solicitudes abiertas"],
      ]
    : [
        ["Clientes", "0", "Listos para importar"],
        ["Cotizaciones", "0", "En preparación"],
        ["Servicios activos", "0", "Sincronización pendiente"],
        ["Aprobaciones", "0", "Nada por revisar"],
      ];
  return (
    <>
      <section className="product-hero">
        <div>
          <span>ESPACIO OPERATIVO</span>
          <h1>
            {isCustomer
              ? "Todo tu historial, sin perseguir respuestas."
              : "El trabajo empieza con contexto, no desde cero."}
          </h1>
          <p>
            {isCustomer
              ? "Consulta servicios, cotizaciones y documentos compartidos por tu proveedor."
              : "Este entorno ya está protegido y listo para recibir los datos autorizados de la organización."}
          </p>
        </div>
        <div className="readiness-card">
          <span>ESTADO DEL ESPACIO</span>
          <strong>Base segura</strong>
          <p>Identidad, roles y separación de datos activados.</p>
        </div>
      </section>
      <section className="metric-grid">
        {metrics.map(([label, value, note]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="workspace-panel first-action">
        <div>
          <span>SIGUIENTE PASO</span>
          <h2>
            {isCustomer
              ? "Aún no hay información compartida contigo."
              : "Conecta la primera fuente de clientes."}
          </h2>
          <p>
            {isCustomer
              ? "Cuando tu proveedor publique un servicio o documento, aparecerá en este panel."
              : "La importación se hará primero en un entorno controlado, sin contactar automáticamente a ninguna persona."}
          </p>
        </div>
        {!isCustomer ? <button>Preparar importación</button> : null}
      </section>
    </>
  );
}

function PlaceholderModule({ title }: { title: string }) {
  return (
    <section className="workspace-panel empty-module">
      <span>MÓDULO PROTEGIDO</span>
      <h2>{title}</h2>
      <p>
        El acceso ya respeta tu rol. Los datos reales se incorporarán mediante
        una importación revisada y trazable.
      </p>
    </section>
  );
}

function TenantDashboard() {
  const { session, signOut } = useFieldSparkAuth();
  const [membershipIndex, setMembershipIndex] = useState(0);
  const current = (
    session!.memberships[membershipIndex] ?? session!.memberships[0]
  )!;
  const navigation = navigationFor(
    current.membership.role,
    current.tenant.playbook,
  );
  const [active, setActive] = useState(
    navigation[0]!,
  );
  const initials = (session!.user.displayName || session!.user.email)
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    setActive(navigation[0]!);
  }, [membershipIndex]);

  return (
    <div className="product-shell">
      <aside className="product-sidebar">
        <Brand />
        {session!.memberships.length > 1 ? (
          <select
            className="tenant-select"
            value={membershipIndex}
            onChange={(event) => setMembershipIndex(Number(event.target.value))}
          >
            {session!.memberships.map((entry, index) => (
              <option value={index} key={entry.tenant.id}>
                {entry.tenant.displayName}
              </option>
            ))}
          </select>
        ) : (
          <div className="tenant-badge">
            <span>{current.tenant.displayName.slice(0, 1)}</span>
            <div>
              <strong>{current.tenant.displayName}</strong>
              <small>Entorno {current.tenant.environment === "production" ? "real" : "de prueba"}</small>
            </div>
          </div>
        )}
        <nav className="product-nav">
          {navigation.map((item, index) => (
            <button
              key={item}
              className={active === item ? "active" : ""}
              onClick={() => setActive(item)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{initials}</span>
          <div>
            <strong>{session!.user.displayName}</strong>
            <small>{roleLabels[current.membership.role]}</small>
          </div>
          <button title="Cerrar sesión" onClick={() => void signOut()}>
            ↗
          </button>
        </div>
      </aside>
      <main className="product-workspace">
        <header className="product-topbar">
          <div>
            <small>{current.tenant.displayName.toUpperCase()}</small>
            <strong>{active}</strong>
          </div>
          <div className="protected-state">
            <i />
            Acceso protegido
          </div>
        </header>
        <div className="product-content">
          {active === "Resumen" ? (
            <OverviewPanel role={current.membership.role} />
          ) : active === "Portafolio" ? (
            <PortfolioPanel
              tenantId={current.tenant.id}
              actor={current.membership}
            />
          ) : active === "Expedientes" || active === "Mis expedientes" ? (
            <CasesPanel
              tenant={current.tenant}
              actor={current.membership}
            />
          ) : active === "Equipo" ? (
            <TeamPanel
              tenantId={current.tenant.id}
              actor={current.membership}
            />
          ) : (
            <PlaceholderModule title={active} />
          )}
        </div>
      </main>
    </div>
  );
}

export function App() {
  const { loading, authEnabled, firebaseUser, session } = useFieldSparkAuth();
  if (loading) return <LoadingScreen />;
  if (authEnabled && !firebaseUser) return <WelcomeScreen />;
  if (!session) return <LoadingScreen />;
  if (!session.user.profileComplete) return <OnboardingScreen />;
  if (session.memberships.length === 0) return <PendingAccess />;
  return <TenantDashboard />;
}
