import type { CustomerContact, Membership, Tenant } from "@fieldspark/contracts";
import { useEffect, useMemo, useState } from "react";
import { importCustomers, loadCustomers } from "../api";

type ImportRow = Pick<
  CustomerContact,
  "displayName" | "accountName" | "phone" | "email" | "taxId" | "notes"
>;

const template = [
  "nombre,empresa,telefono,correo,cedula_ruc,notas",
  "Cliente de prueba,Empresa de prueba,+593000000000,cliente@example.invalid,,Fila sintética",
].join("\r\n");

function normalizedHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseContactFile(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) throw new Error("El archivo no contiene contactos.");
  const firstLine = lines[0]!;
  const delimiter = [",", ";", "\t"].sort(
    (left, right) => firstLine.split(right).length - firstLine.split(left).length,
  )[0]!;
  const headers = splitDelimitedLine(firstLine, delimiter).map(normalizedHeader);
  const aliases: Record<keyof ImportRow, string[]> = {
    displayName: ["nombre", "nombre_completo", "cliente", "contacto"],
    accountName: ["empresa", "compania", "cuenta", "organizacion"],
    phone: ["telefono", "celular", "movil", "whatsapp"],
    email: ["correo", "correo_electronico", "email", "e_mail"],
    taxId: ["cedula_ruc", "cedula", "ruc", "identificacion", "tax_id"],
    notes: ["notas", "observaciones", "detalle", "comentarios"],
  };
  const positions = Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [
      field,
      headers.findIndex((header) => names.includes(header)),
    ]),
  ) as Record<keyof ImportRow, number>;
  if (positions.displayName < 0) {
    throw new Error("Falta una columna llamada nombre, cliente o contacto.");
  }
  if (positions.phone < 0 && positions.email < 0) {
    throw new Error("Falta una columna de teléfono, WhatsApp o correo.");
  }

  const rows: ImportRow[] = [];
  let rejected = 0;
  for (const line of lines.slice(1)) {
    const cells = splitDelimitedLine(line, delimiter);
    const value = (field: keyof ImportRow) =>
      positions[field] >= 0 ? (cells[positions[field]] ?? "").trim() : "";
    const row: ImportRow = {
      displayName: value("displayName"),
      accountName: value("accountName"),
      phone: value("phone"),
      email: value("email").toLowerCase(),
      taxId: value("taxId"),
      notes: value("notes"),
    };
    const emailLooksValid = !row.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email);
    if (row.displayName.length < 2 || (!row.phone && !row.email) || !emailLooksValid) {
      rejected += 1;
      continue;
    }
    rows.push(row);
  }
  return { rows, rejected };
}

export function CustomersPanel({
  tenant,
  actor,
  onStartWithoutImport,
}: {
  tenant: Tenant;
  actor: Membership;
  onStartWithoutImport: () => void;
}) {
  const canManage =
    actor.role !== "customer" && actor.permissions.includes("customers.manage");
  const [customers, setCustomers] = useState<CustomerContact[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [rejected, setRejected] = useState(0);
  const [synthetic, setSynthetic] = useState(true);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadCustomers(tenant.id)
      .then((result) => setCustomers(result.customers))
      .catch(() => setError("No pudimos cargar los clientes de este espacio."));
  }, [tenant.id]);

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  async function selectFile(file: File | undefined) {
    setError("");
    setNotice("");
    setRows([]);
    setFileName("");
    if (!file) return;
    if (file.size > 5_000_000) {
      setError("El archivo supera 5 MB. Divídelo en varios archivos CSV.");
      return;
    }
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      setError("Por ahora importa CSV, TSV o TXT. Desde Excel usa Guardar como CSV UTF-8.");
      return;
    }
    try {
      const parsed = parseContactFile(await file.text());
      setRows(parsed.rows);
      setRejected(parsed.rejected);
      setFileName(file.name);
      if (!parsed.rows.length) setError("No encontramos filas válidas para importar.");
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "No pudimos leer el archivo.",
      );
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla-clientes-fieldspark.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submitImport() {
    if (!rows.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await importCustomers(tenant.id, {
        fileName,
        synthetic,
        consentConfirmed,
        rows,
      });
      setCustomers((current) => [...result.customers, ...current]);
      setRows([]);
      setFileName("");
      setNotice(
        `${result.imported} contactos importados; ${result.duplicates} duplicados omitidos. Ningún contacto fue notificado.`,
      );
    } catch {
      setError("No se completó la importación. Revisa el formato y la autorización.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="customers-workspace">
      <div className="module-heading customer-heading">
        <div><span>CLIENTES</span><h2>{customers.length} contactos en {tenant.displayName}</h2></div>
        <strong>Envíos automáticos bloqueados</strong>
      </div>

      {canManage ? (
        <div className="onboarding-choice-grid">
          <article className="workspace-panel onboarding-choice featured">
            <span>OPCIÓN 1</span>
            <h2>Empezar desde cero</h2>
            <p>No necesitas importar nada. Crea un expediente y registra manualmente al primer cliente o inspección.</p>
            <button className="primary-button" onClick={onStartWithoutImport}>Crear mi primer expediente</button>
          </article>
          <article className="workspace-panel onboarding-choice">
            <span>OPCIÓN 2</span>
            <h2>Importar una lista</h2>
            <p>Admite CSV, TSV o TXT de hasta 2.000 filas. En Excel elige “Guardar como CSV UTF-8”.</p>
            <button className="text-button" type="button" onClick={downloadTemplate}>Descargar plantilla CSV</button>
          </article>
        </div>
      ) : null}

      {canManage ? (
        <section className="workspace-panel import-panel">
          <div className="module-heading">
            <div><span>IMPORTACIÓN CONTROLADA</span><h2>Revisar antes de guardar</h2></div>
          </div>
          <label className="import-file-picker">
            Seleccionar CSV, TSV o TXT
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(event) => void selectFile(event.target.files?.[0])} />
          </label>
          <p className="field-help">Columnas reconocidas: nombre, empresa, teléfono/WhatsApp, correo, cédula/RUC y notas. Solo nombre y un teléfono o correo son obligatorios.</p>

          {preview.length ? (
            <div className="import-preview">
              <div className="import-summary"><strong>{rows.length} filas listas</strong><span>{rejected} filas omitidas por datos incompletos</span></div>
              <div className="import-table-wrap">
                <table><thead><tr><th>Nombre</th><th>Empresa</th><th>Teléfono</th><th>Correo</th></tr></thead>
                  <tbody>{preview.map((row, index) => <tr key={`${row.email}-${row.phone}-${index}`}><td>{row.displayName}</td><td>{row.accountName || "—"}</td><td>{row.phone || "—"}</td><td>{row.email || "—"}</td></tr>)}</tbody>
                </table>
              </div>
              <label className="test-mode-check"><input type="checkbox" checked={synthetic} onChange={(event) => setSynthetic(event.target.checked)} />Datos de prueba; bloquear contacto y facturación</label>
              {!synthetic ? <label className="test-mode-check consent-check"><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />Confirmo que la empresa está autorizada para almacenar y gestionar estos datos.</label> : null}
              <button className="primary-button" disabled={busy || (!synthetic && !consentConfirmed)} onClick={() => void submitImport()}>{busy ? "Importando…" : `Importar ${rows.length} contactos`}</button>
            </div>
          ) : null}
          {notice ? <p className="form-message success-message">{notice}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </section>
      ) : null}

      {!customers.length ? (
        <section className="workspace-panel empty-module"><span>SIN CONTACTOS</span><h2>No hay nada que importar obligatoriamente.</h2><p>Puedes trabajar desde cero y agregar cada cliente cuando aparezca una oportunidad real.</p></section>
      ) : (
        <section className="workspace-panel customer-list"><span>REGISTROS AISLADOS</span><h2>Últimos contactos</h2>{customers.slice(0, 12).map((customer) => <article key={customer.id}><div><strong>{customer.displayName}</strong><small>{customer.accountName || customer.email || customer.phone}</small></div><span>{customer.synthetic ? "PRUEBA" : "AUTORIZADO"}</span></article>)}</section>
      )}
    </section>
  );
}
