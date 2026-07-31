import type {
  BusinessCase,
  InspectionRecord,
  Membership,
  QuoteDocument,
  Tenant,
  TenantOperationalSettings,
} from "@fieldspark/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  analyzeInspection,
  createDeliveryDraft,
  createItemizedQuote,
  loadCaseOperations,
  loadOperationalSettings,
  updateOperationalSettings,
} from "../api";

type DraftLine = {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceUsd: number;
};

const systemOptions = [
  ["electric_fence", "Cerco eléctrico"],
  ["cctv", "Videovigilancia / CCTV"],
  ["access_control", "Control de acceso"],
  ["fire_detection", "Detección de incendios"],
  ["fire_suppression", "Supresión de incendios"],
  ["alarms", "Alarmas"],
  ["gates", "Puertas y portones"],
  ["intercom", "Intercomunicación"],
  ["other", "Otro sistema"],
] as const;

function asMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function fileKind(file: File): "photo" | "audio" | "document" | "text" {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("text/")) return "text";
  return "document";
}

async function filePayload(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function QuoteDocumentView({
  quote,
  settings,
}: {
  quote: QuoteDocument;
  settings: TenantOperationalSettings;
}) {
  return (
    <article className="print-document quote-document">
      <header className="document-header">
        <div className="document-brand">
          {settings.branding.logoDataUrl ? (
            <img src={settings.branding.logoDataUrl} alt="Logo de la empresa" />
          ) : (
            <span>{settings.branding.legalName.slice(0, 2) || "FS"}</span>
          )}
          <div>
            <strong>{settings.branding.legalName}</strong>
            <small>{settings.branding.taxId ? `RUC ${settings.branding.taxId}` : "Identidad tributaria pendiente"}</small>
          </div>
        </div>
        <div className="document-number">
          <span>COTIZACIÓN</span>
          <strong>{quote.quoteNumber}</strong>
          <small>{new Date(quote.createdAt).toLocaleDateString("es-EC")}</small>
        </div>
      </header>
      <section className="document-recipient">
        <div><small>CLIENTE</small><strong>{quote.customerName}</strong></div>
        <div><small>IDENTIFICACIÓN</small><strong>{quote.customerIdentifier || "Pendiente"}</strong></div>
        <div><small>VIGENCIA</small><strong>{quote.validityDays} días</strong></div>
      </section>
      <section className="document-narrative">
        <span>PROPUESTA TÉCNICA Y ECONÓMICA</span>
        <h1>{quote.proposalTitle}</h1>
        <p>{quote.executiveSummary}</p>
        <h2>Solución propuesta</h2>
        <p>{quote.technicalProposal}</p>
        <div className="document-columns">
          <div><h3>Alcance</h3><ul>{quote.scope.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><h3>Consideraciones</h3><ul>{quote.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
      </section>
      <table className="quote-table">
        <thead><tr><th>Código</th><th>Descripción</th><th>Cant.</th><th>Unidad</th><th>V. unitario</th><th>Subtotal</th></tr></thead>
        <tbody>{quote.items.map((item, index) => <tr key={`${item.description}-${index}`}><td>{item.code || "—"}</td><td>{item.description}</td><td>{item.quantity}</td><td>{item.unit}</td><td>{asMoney(item.unitPriceUsd)}</td><td>{asMoney(item.subtotalUsd)}</td></tr>)}</tbody>
      </table>
      <section className="quote-totals">
        <div><span>Subtotal</span><strong>{asMoney(quote.subtotalUsd)}</strong></div>
        <div><span>IVA ({quote.taxRatePct}%)</span><strong>{asMoney(quote.taxAmountUsd)}</strong></div>
        <div className="grand-total"><span>Total con IVA</span><strong>{asMoney(quote.totalUsd)}</strong></div>
      </section>
      <footer className="document-footer">
        <p>{settings.paymentTerms}</p>
        <p>{settings.warrantyTerms}</p>
        <small>{[settings.branding.address, settings.branding.phone, settings.branding.email].filter(Boolean).join(" · ")}</small>
      </footer>
    </article>
  );
}

export function InspectionWorkspace({
  tenant,
  actor,
  businessCase,
}: {
  tenant: Tenant;
  actor: Membership;
  businessCase: BusinessCase;
}) {
  const canManage = actor.role !== "customer" && actor.permissions.includes("cases.manage");
  const canConfigure = actor.role === "platform_owner" || actor.permissions.includes("tenant.manage");
  const [settings, setSettings] = useState<TenantOperationalSettings | null>(null);
  const [usage, setUsage] = useState({ inspections: 0, inspectionLimit: 0 });
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteDocument[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<InspectionRecord | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<QuoteDocument | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [narrative, setNarrative] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function reload() {
    const [settingsResult, operations] = await Promise.all([
      loadOperationalSettings(tenant.id),
      loadCaseOperations(tenant.id, businessCase.id),
    ]);
    setSettings(settingsResult.settings);
    setUsage(settingsResult.usage);
    setInspections(operations.inspections);
    setQuotes(operations.quotes);
    setSelectedInspection(operations.inspections.at(-1) ?? null);
    setSelectedQuote(operations.quotes.at(-1) ?? null);
  }

  useEffect(() => {
    setFiles([]);
    setPreviewUrls([]);
    setNarrative("");
    void reload().catch(() => setNotice("No fue posible cargar el módulo de inspección."));
  }, [tenant.id, businessCase.id]);

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setFiles((current) => [...current, new File([blob], `inspeccion-${Date.now()}.webm`, { type: blob.type })]);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setNotice("El navegador no permitió acceder al micrófono.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function selectFiles(next: FileList | null) {
    if (!next) return;
    const accepted = [...next].filter((file) => file.size <= 8_000_000);
    setFiles(accepted);
    setPreviewUrls(accepted.filter((file) => file.type.startsWith("image/")).map((file) => URL.createObjectURL(file)));
  }

  async function submitInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("Procesando voz, fotografías y documentos…");
    const form = new FormData(event.currentTarget);
    try {
      const evidence = await Promise.all(files.map(async (file) => ({
        id: crypto.randomUUID(),
        kind: fileKind(file),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        dataBase64: await filePayload(file),
      })));
      const result = await analyzeInspection(tenant.id, businessCase.id, {
        systemType: String(form.get("systemType")),
        title: String(form.get("title")),
        siteName: String(form.get("siteName")),
        narrative,
        evidence,
        synthetic: businessCase.synthetic,
      });
      setSelectedInspection(result.inspection);
      setInspections((current) => [...current, result.inspection]);
      setLines(result.inspection.analysis.suggestedItems.map((item) => ({
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceUsd: 0,
      })));
      setUsage((current) => ({ ...current, inspections: current.inspections + 1 }));
      setNotice("Borrador técnico creado. Revisa hechos, preguntas, cantidades y precios.");
    } catch {
      setNotice("No se pudo analizar la inspección. Revisa tamaño, formato y límites mensuales.");
    } finally {
      setBusy(false);
    }
  }

  function updateLine(index: number, field: keyof DraftLine, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? {
      ...line,
      [field]: field === "quantity" || field === "unitPriceUsd" ? Number(value) : value,
    } : line));
  }

  async function submitQuote() {
    if (!selectedInspection) return;
    setBusy(true);
    try {
      const result = await createItemizedQuote(tenant.id, businessCase.id, {
        inspectionId: selectedInspection.id,
        proposalTitle: `Intervención propuesta — ${selectedInspection.title}`,
        executiveSummary: selectedInspection.analysis.executiveSummary,
        technicalProposal: selectedInspection.analysis.recommendedActions.join(" "),
        scope: selectedInspection.analysis.recommendedActions,
        exclusions: selectedInspection.analysis.safetyLimitations,
        items: lines,
        taxRatePct: settings?.defaultTaxRatePct,
        validityDays: settings?.quoteValidityDays,
      });
      setSelectedQuote(result.quote);
      setQuotes((current) => [...current, result.quote]);
      setNotice("Cotización preparada para aprobación. No se envió al cliente.");
    } catch {
      setNotice("Agrega al menos una línea válida y confirma cantidades y precios.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const form = new FormData(event.currentTarget);
    const logo = form.get("logo") as File | null;
    let logoDataUrl = settings.branding.logoDataUrl;
    if (logo?.size) {
      logoDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(logo);
      });
    }
    const result = await updateOperationalSettings(tenant.id, {
      ...settings,
      defaultTaxRatePct: Number(form.get("taxRate")),
      quoteValidityDays: Number(form.get("validityDays")),
      branding: { ...settings.branding, logoDataUrl },
    });
    setSettings(result.settings);
    setNotice("Parámetros comerciales y marca actualizados.");
  }

  async function prepareDelivery(channel: "email" | "whatsapp") {
    if (!selectedQuote) return;
    const recipient = window.prompt(channel === "email" ? "Correo del destinatario" : "Número de WhatsApp");
    if (!recipient) return;
    await createDeliveryDraft(tenant.id, businessCase.id, {
      quoteId: selectedQuote.id,
      channel,
      recipient,
      subject: channel === "email" ? `${selectedQuote.quoteNumber} — ${selectedQuote.proposalTitle}` : "",
      message: `Estimado/a ${selectedQuote.customerName}, hemos preparado la propuesta ${selectedQuote.quoteNumber} por ${asMoney(selectedQuote.totalUsd)}. Este borrador requiere aprobación antes de enviarse.`,
    });
    setNotice(`Borrador para ${channel === "email" ? "correo" : "WhatsApp"} preparado. El envío continúa bloqueado.`);
  }

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPriceUsd, 0), [lines]);

  return (
    <section className="inspection-workspace">
      <div className="inspection-toolbar">
        <div><span>INSPECCIÓN INTELIGENTE</span><h3>Evidencia → informe → cotización</h3></div>
        <strong>{usage.inspections} / {usage.inspectionLimit} este mes</strong>
      </div>
      {canConfigure && settings ? (
        <details className="settings-drawer">
          <summary>Marca, IVA y parámetros</summary>
          <form onSubmit={(event) => void saveSettings(event)}>
            <label>IVA predeterminado (%)<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={settings.defaultTaxRatePct} /></label>
            <label>Vigencia de cotización<input name="validityDays" type="number" min="1" max="365" defaultValue={settings.quoteValidityDays} /></label>
            <label>Logo de la empresa<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label>
            <button className="compact-button">Guardar parámetros</button>
          </form>
        </details>
      ) : null}
      {canManage ? (
        <form className="inspection-capture" onSubmit={(event) => void submitInspection(event)}>
          <div className="capture-grid">
            <label>Sistema<select name="systemType" defaultValue="electric_fence">{systemOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Lugar inspeccionado<input name="siteName" defaultValue={businessCase.customerName} required /></label>
            <label className="wide-field">Título del informe<input name="title" defaultValue="Inspección técnica de cerco eléctrico" required /></label>
          </div>
          <label className="narration-field">Narración del técnico<textarea value={narrative} onChange={(event) => setNarrative(event.target.value)} placeholder="Cuéntale a Gemini qué revisaste, qué mediste y qué encontraste…" /></label>
          <div className="evidence-actions">
            <button type="button" className={recording ? "recording" : ""} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? "Detener grabación" : "Hablar de la inspección"}</button>
            <label>Agregar fotos, audio, PDF, Word o texto<input type="file" multiple accept="image/*,audio/*,.pdf,.docx,.txt,.csv" onChange={(event) => selectFiles(event.target.files)} /></label>
            <span>{files.length} archivos · máximo 8 MB por archivo</span>
          </div>
          {previewUrls.length ? <div className="evidence-preview">{previewUrls.map((url) => <img src={url} alt="Evidencia seleccionada" key={url} />)}</div> : null}
          <button className="primary-button" disabled={busy || (!narrative.trim() && !files.length)}>Analizar y preparar informe</button>
        </form>
      ) : null}
      {selectedInspection ? (
        <div className="inspection-results">
          <article className="technical-report print-document">
            <span>INFORME TÉCNICO · BORRADOR PARA REVISIÓN</span>
            <h1>{selectedInspection.title}</h1>
            <p className="report-lead">{selectedInspection.analysis.executiveSummary}</p>
            <h2>Contexto técnico</h2><p>{selectedInspection.analysis.technicalContext}</p>
            {previewUrls.length ? <div className="report-photo-grid">{previewUrls.map((url, index) => <figure key={url}><img src={url} alt={`Evidencia ${index + 1}`} /><figcaption>Evidencia {String(index + 1).padStart(2, "0")}</figcaption></figure>)}</div> : null}
            <h2>Hallazgos</h2>{selectedInspection.analysis.findings.map((finding) => <section className={`finding ${finding.severity}`} key={finding.title}><strong>{finding.title}</strong><p>{finding.detail}</p><small>Confianza {Math.round(finding.confidence * 100)}% · requiere validación humana</small></section>)}
            <div className="report-columns"><div><h2>Acciones recomendadas</h2><ol>{selectedInspection.analysis.recommendedActions.map((item) => <li key={item}>{item}</li>)}</ol></div><div><h2>Información que Gemini necesita</h2><ul>{selectedInspection.analysis.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
            <footer>{selectedInspection.analysis.safetyLimitations.join(" ")}</footer>
          </article>
          <section className="quote-builder">
            <div className="module-heading"><div><span>PROPUESTA ECONÓMICA</span><h2>Materiales y servicios</h2></div><button className="compact-button" onClick={() => window.print()}>Vista PDF / imprimir</button></div>
            <div className="line-editor">{lines.map((line, index) => <div className="line-row" key={index}><input value={line.code} placeholder="Código" onChange={(event) => updateLine(index, "code", event.target.value)} /><input value={line.description} placeholder="Descripción" onChange={(event) => updateLine(index, "description", event.target.value)} /><input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /><input value={line.unit} onChange={(event) => updateLine(index, "unit", event.target.value)} /><input type="number" min="0" step="0.01" value={line.unitPriceUsd} onChange={(event) => updateLine(index, "unitPriceUsd", event.target.value)} /></div>)}</div>
            <button className="text-button" onClick={() => setLines((current) => [...current, { code: "", description: "", quantity: 1, unit: "unidad", unitPriceUsd: 0 }])}>+ Agregar línea</button>
            <div className="quote-live-total"><span>Subtotal {asMoney(subtotal)}</span><span>IVA {settings?.defaultTaxRatePct ?? 0}%</span><strong>Total estimado {asMoney(subtotal * (1 + (settings?.defaultTaxRatePct ?? 0) / 100))}</strong></div>
            <button className="primary-button" disabled={busy || !lines.length} onClick={() => void submitQuote()}>Preparar cotización para aprobación</button>
          </section>
        </div>
      ) : null}
      {selectedQuote && settings ? (
        <section className="quote-preview-shell">
          <div className="delivery-actions"><button onClick={() => window.print()}>Descargar / imprimir PDF</button><button onClick={() => void prepareDelivery("email")}>Preparar correo</button><button onClick={() => void prepareDelivery("whatsapp")}>Preparar WhatsApp</button></div>
          <QuoteDocumentView quote={selectedQuote} settings={settings} />
        </section>
      ) : null}
      {notice ? <p className="portfolio-message">{notice}</p> : null}
      {inspections.length || quotes.length ? <small className="history-note">Historial: {inspections.length} inspecciones · {quotes.length} cotizaciones en este expediente.</small> : null}
    </section>
  );
}
