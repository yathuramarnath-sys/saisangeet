import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/AuthContext";

import {
  createOutlet,
  deleteOutlet,
  fetchOutletPageData,
  toggleOutletActive,
  updateOutlet
} from "./outlets.service";

const workAreaOptions = ["AC", "Non-AC", "Self Service", "Cloud Kitchen", "Only Takeaway"];
const serviceOptions  = ["Dine-in", "Takeaway", "Delivery"];

function buildEmptyTableRow(defaultWorkArea = "AC") {
  return {
    id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workArea: defaultWorkArea,
    name: "",
    seats: 4
  };
}

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

function joinTimings(openingTime, closingTime) {
  if (!openingTime || !closingTime) return "Business hours pending";
  return `${openingTime} - ${closingTime}`;
}

function splitTimings(hours) {
  if (!hours || !hours.includes(" - ")) return { openingTime: "09:00", closingTime: "23:00" };
  const [openingTime, closingTime] = hours.split(" - ");
  return { openingTime: openingTime || "09:00", closingTime: closingTime || "23:00" };
}

function buildEditDraft(outlet) {
  const { openingTime, closingTime } = splitTimings(outlet.hours);
  return {
    name:                outlet.name,
    city:                outlet.city,
    state:               outlet.state,
    phone:               outlet.phone        || "",
    addressLine1:        outlet.addressLine1 || "",
    addressLine2:        outlet.addressLine2 || "",
    gstin:               outlet.gstin,
    fssaiNo:             outlet.fssaiNo || "",
    upiId:               outlet.upiId   || "",
    defaultTaxProfileId: outlet.defaultTaxProfileId || "",
    receiptTemplateId:   outlet.receiptTemplateId || "",
    reportEmail:         outlet.reportEmail || "",
    openingTime,
    closingTime,
    workAreas: outlet.workAreas || [],
    tables:    outlet.tables    || [],
    services:  outlet.services  || []
  };
}

function buildCreateDraft(pageData) {
  return {
    name: "", city: "", state: "", gstin: "", fssaiNo: "",
    openingTime: "09:00", closingTime: "23:00", reportEmail: "",
    defaultTaxProfileId: pageData.taxProfiles?.[0]?.id  || "",
    receiptTemplateId:   pageData.receiptTemplates?.[0]?.id || "",
    workAreas: [], tables: [], services: ["Dine-in", "Takeaway"]
  };
}

function toggleSelection(values, item) {
  return values.includes(item) ? values.filter(v => v !== item) : [...values, item];
}

function sanitizeTables(tables = []) {
  return tables
    .map(t => ({ id: t.id || `table-${Date.now()}`, workArea: t.workArea || "AC", name: String(t.name || "").trim(), seats: Number(t.seats || 0) }))
    .filter(t => t.name && t.seats > 0)
    .map(t => ({ ...t, seatLabels: Array.from({ length: t.seats }, (_, i) => `${t.name}S${i + 1}`) }));
}

// ── Compact inline table editor ───────────────────────────────────────────────
function TableEditor({ tables, workAreas, onChange }) {
  const [editingId, setEditingId] = useState(null);

  function updateTable(id, patch) { onChange(tables.map(t => t.id === id ? { ...t, ...patch } : t)); }
  function removeTable(id) { onChange(tables.filter(t => t.id !== id)); if (editingId === id) setEditingId(null); }
  function addTable() { const r = buildEmptyTableRow(workAreas[0] || "AC"); onChange([...tables, r]); setEditingId(r.id); }
  function confirmEdit(id) {
    const t = tables.find(r => r.id === id);
    if (t && !String(t.name).trim()) onChange(tables.filter(r => r.id !== id));
    setEditingId(null);
  }

  return (
    <div className="tbl-editor">
      <div className="tbl-editor-head"><span>Area</span><span>Table name</span><span>Seats</span><span /></div>
      {tables.length === 0 && <p className="tbl-editor-empty">No tables yet — click Add Table below.</p>}
      {tables.map(t => editingId === t.id ? (
        <div key={t.id} className="tbl-editor-row tbl-editor-row--editing">
          <select value={t.workArea} onChange={e => updateTable(t.id, { workArea: e.target.value })}>
            {(workAreas.length ? workAreas : workAreaOptions).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="text" placeholder="e.g. T1" value={t.name} autoFocus
            onChange={e => updateTable(t.id, { name: e.target.value })}
            onKeyDown={e => e.key === "Enter" && confirmEdit(t.id)} />
          <input type="number" min="1" placeholder="4" value={t.seats}
            onChange={e => updateTable(t.id, { seats: e.target.value })}
            onKeyDown={e => e.key === "Enter" && confirmEdit(t.id)} />
          <div className="tbl-editor-row-actions">
            <button type="button" className="tbl-confirm-btn" onClick={() => confirmEdit(t.id)}>✓</button>
            <button type="button" className="tbl-remove-btn"  onClick={() => removeTable(t.id)}>✕</button>
          </div>
        </div>
      ) : (
        <div key={t.id} className="tbl-editor-row">
          <span className="tbl-area-pill">{t.workArea}</span>
          <strong>{t.name || <em style={{ color:"#9ca3af", fontWeight:400 }}>unnamed</em>}</strong>
          <span>{t.seats} seats</span>
          <div className="tbl-editor-row-actions">
            <button type="button" className="tbl-edit-btn"   onClick={() => setEditingId(t.id)}>Edit</button>
            <button type="button" className="tbl-remove-btn" onClick={() => removeTable(t.id)}>✕</button>
          </div>
        </div>
      ))}
      <button type="button" className="ghost-btn tbl-add-btn" onClick={addTable}>+ Add Table</button>
    </div>
  );
}

// ── Inline outlet edit form (renders inside the outlet card) ──────────────────
function OutletEditForm({ draft, setDraft, taxProfiles, receiptTemplates, onSave, onCancel, onQRCode, saving, statusMessage, statusError }) {
  const [customArea, setCustomArea] = useState("");
  const customAreas = draft.workAreas.filter(a => !workAreaOptions.includes(a));

  function addCustomArea() {
    const name = customArea.trim();
    if (!name || draft.workAreas.includes(name)) { setCustomArea(""); return; }
    setDraft(d => ({ ...d, workAreas: [...d.workAreas, name] }));
    setCustomArea("");
  }

  return (
    <form className="outlet-inline-form" onSubmit={onSave}>
      <div className="outlet-inline-grid">
        <label>Outlet name<input type="text" value={draft.name} required onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></label>
        <label>Phone <small style={{fontWeight:400,color:"#6b7280"}}>(printed on receipt)</small><input type="text" placeholder="e.g. 9876543210" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value.trim() }))} /></label>
        <label>Address Line 1 <small style={{fontWeight:400,color:"#6b7280"}}>(printed on receipt)</small><input type="text" placeholder="e.g. 130/2C1, Main Road" value={draft.addressLine1} onChange={e => setDraft(d => ({ ...d, addressLine1: e.target.value }))} /></label>
        <label>Address Line 2 <small style={{fontWeight:400,color:"#6b7280"}}>(optional)</small><input type="text" placeholder="e.g. Near Bus Stand" value={draft.addressLine2} onChange={e => setDraft(d => ({ ...d, addressLine2: e.target.value }))} /></label>
        <label>City<input type="text" value={draft.city} required onChange={e => setDraft(d => ({ ...d, city: e.target.value }))} /></label>
        <label>State<input type="text" value={draft.state} required onChange={e => setDraft(d => ({ ...d, state: e.target.value }))} /></label>
        <label>GSTIN
          <input
            type="text"
            value={draft.gstin}
            placeholder="e.g. 29ABCDE1234F1Z5"
            maxLength={15}
            onChange={e => setDraft(d => ({ ...d, gstin: e.target.value.toUpperCase().trim() }))}
            pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}"
            title="15-character GSTIN (e.g. 29ABCDE1234F1Z5)"
          />
          {draft.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(draft.gstin) && (
            <span style={{ color: "#ef4444", fontSize: 11, marginTop: 2, display: "block" }}>
              Invalid GSTIN — must be 15 chars (e.g. 29ABCDE1234F1Z5)
            </span>
          )}
        </label>
        <label>FSSAI No.<input type="text" placeholder="e.g. 10012345678901" value={draft.fssaiNo} onChange={e => setDraft(d => ({ ...d, fssaiNo: e.target.value }))} /></label>
        <label>UPI ID <small style={{fontWeight:400,color:"#6b7280"}}>(bill QR code)</small><input type="text" placeholder="e.g. restaurant@okhdfc" value={draft.upiId || ""} onChange={e => setDraft(d => ({ ...d, upiId: e.target.value.trim() }))} /></label>
        <label>Report email<input type="email" value={draft.reportEmail} onChange={e => setDraft(d => ({ ...d, reportEmail: e.target.value }))} /></label>
        <label>Opening<input type="time" value={draft.openingTime} onChange={e => setDraft(d => ({ ...d, openingTime: e.target.value }))} /></label>
        <label>Closing<input type="time" value={draft.closingTime} onChange={e => setDraft(d => ({ ...d, closingTime: e.target.value }))} /></label>
        <label>Default GST
          <select value={draft.defaultTaxProfileId} onChange={e => setDraft(d => ({ ...d, defaultTaxProfileId: e.target.value }))}>
            {taxProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Receipt template
          <select value={draft.receiptTemplateId} onChange={e => setDraft(d => ({ ...d, receiptTemplateId: e.target.value }))}>
            {receiptTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>

      {/* Work areas */}
      <div className="outlet-inline-section">
        <strong>Work areas</strong>
        <div className="outlet-check-row">
          {workAreaOptions.map(opt => (
            <label key={opt} className="mini-card">
              <span>{opt}</span>
              <input type="checkbox" checked={draft.workAreas.includes(opt)}
                onChange={() => setDraft(d => ({ ...d, workAreas: toggleSelection(d.workAreas, opt) }))} />
            </label>
          ))}
          {customAreas.map(opt => (
            <label key={opt} className="mini-card mini-card-custom">
              <span>{opt}</span>
              <button type="button" className="mini-card-remove"
                onClick={() => setDraft(d => ({ ...d, workAreas: d.workAreas.filter(a => a !== opt) }))}>✕</button>
            </label>
          ))}
        </div>
        <div className="outlet-custom-area-row">
          <input
            type="text"
            placeholder="e.g. Sweet Counter"
            value={customArea}
            onChange={e => setCustomArea(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomArea(); } }}
          />
          <button type="button" className="ghost-btn" onClick={addCustomArea}>+ Add custom area</button>
        </div>
      </div>

      {/* Tables */}
      <div className="outlet-inline-section">
        <strong>Tables</strong>
        <TableEditor tables={draft.tables} workAreas={draft.workAreas} onChange={tables => setDraft(d => ({ ...d, tables }))} />
      </div>

      {/* Service modes */}
      <div className="outlet-inline-section">
        <strong>Service modes</strong>
        <div className="outlet-check-row">
          {serviceOptions.map(svc => (
            <label key={svc} className="mini-card">
              <span>{svc}</span>
              <input type="checkbox" checked={draft.services.includes(svc)}
                onChange={() => setDraft(d => ({ ...d, services: toggleSelection(d.services, svc) }))} />
            </label>
          ))}
        </div>
      </div>

      {/* Waitlist turnover */}
      <div className="outlet-inline-section">
        <strong>Waitlist — Avg Table Turnover</strong>
        <p style={{ fontSize:"0.78rem", color:"var(--muted)", margin:"2px 0 8px" }}>
          Used to estimate walk-in wait time. Set per meal period (minutes).
        </p>
        <div className="outlet-turnover-row">
          {[{key:"breakfast",label:"Breakfast",ph:"20"},{key:"lunch",label:"Lunch",ph:"30"},{key:"snacks",label:"Snacks",ph:"25"},{key:"dinner",label:"Dinner",ph:"45"}].map(({key,label,ph}) => (
            <label key={key} style={{ display:"flex", flexDirection:"column", gap:3, fontSize:"0.8rem", color:"var(--muted)", fontWeight:600 }}>
              {label}
              <input type="number" min="5" max="120" placeholder={ph}
                value={draft[`turnover_${key}`] ?? ""}
                onChange={e => setDraft(d => ({ ...d, [`turnover_${key}`]: e.target.value }))}
                style={{ width:70, padding:"5px 8px", border:"1px solid var(--line-strong)", borderRadius:7, font:"inherit", fontSize:"0.88rem" }} />
            </label>
          ))}
        </div>
      </div>

      {statusMessage && <p className="form-success">{statusMessage}</p>}
      {statusError   && <p className="form-error">{statusError}</p>}

      <div className="outlet-inline-btns">
        <button type="submit" className="primary-btn" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
        {onQRCode && (
          <button type="button" className="ghost-chip ghost-chip-qr" onClick={onQRCode} style={{ marginLeft: "auto" }}>
            📱 QR Codes
          </button>
        )}
      </div>
    </form>
  );
}

// ── QR Code Modal ─────────────────────────────────────────────────────────────
const QR_BASE_URL = "https://order.dinexpos.in";

function buildQRUrl(outletId, tableId, tableLabel, tenantId) {
  const params = new URLSearchParams({ o: outletId, t: tableId, tl: tableLabel });
  if (tenantId) params.set("tid", tenantId);
  return `${QR_BASE_URL}?${params.toString()}`;
}

function qrImageUrl(text, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=10&ecc=M`;
}

function QRCodeModal({ outlet, tenantId, onClose }) {
  const tables = outlet.tables || [];

  function handlePrint() {
    window.print();
  }

  if (!tables.length) {
    return (
      <div className="qr-backdrop" onClick={onClose}>
        <div className="qr-modal" onClick={e => e.stopPropagation()}>
          <div className="qr-modal-header">
            <h3>QR Codes — {outlet.name}</h3>
            <button className="qr-close-btn" onClick={onClose}>✕</button>
          </div>
          <p style={{ padding: "24px", color: "#9ca3af", textAlign: "center" }}>
            No tables configured for this outlet.<br />Add tables in the Edit section first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="qr-backdrop" onClick={onClose}>
      <div className="qr-modal" onClick={e => e.stopPropagation()}>
        <div className="qr-modal-header">
          <h3>📱 QR Codes — {outlet.name}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary-btn" style={{ padding: "6px 16px", fontSize: "0.85rem" }} onClick={handlePrint}>
              🖨️ Print All
            </button>
            <button className="qr-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <p className="qr-modal-hint">
          Customers scan → view menu → order → Captain App receives the order
        </p>
        <div className="qr-grid">
          {tables.map(table => {
            const tableLabel = table.name || table.tableNumber || table.id;
            const qrUrl = buildQRUrl(outlet.id, table.id, tableLabel, tenantId);
            return (
              <div key={table.id} className="qr-card">
                <img
                  src={qrImageUrl(qrUrl)}
                  alt={`QR for Table ${tableLabel}`}
                  width={180}
                  height={180}
                  loading="lazy"
                />
                <div className="qr-card-label">{outlet.name}</div>
                <div className="qr-card-table">Table {tableLabel}</div>
                <div className="qr-card-area">{table.workArea || ""}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function OutletsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || null;

  const [pageData,      setPageData]      = useState({ outlets: [], taxProfiles: [], receiptTemplates: [], devices: [] });
  const [loading,       setLoading]       = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError,   setStatusError]   = useState("");
  const [editingOutletId, setEditingOutletId] = useState("");
  const [editDraft,     setEditDraft]     = useState(null);
  const [editSaving,    setEditSaving]    = useState(false);
  const [createDraft,   setCreateDraft]   = useState(buildCreateDraft({ taxProfiles: [], receiptTemplates: [] }));
  const [createSaving,  setCreateSaving]  = useState(false);
  const [qrOutlet,      setQrOutlet]      = useState(null); // outlet shown in QR modal
  const formRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchOutletPageData().then(result => {
      if (!cancelled) { setPageData(result); setCreateDraft(buildCreateDraft(result)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  async function reloadOutlets() {
    const result = await fetchOutletPageData();
    setPageData(result);
    setCreateDraft(c => ({
      ...buildCreateDraft(result),
      ...c,
      defaultTaxProfileId: result.taxProfiles.some(p => p.id === c.defaultTaxProfileId) ? c.defaultTaxProfileId : buildCreateDraft(result).defaultTaxProfileId,
      receiptTemplateId:   result.receiptTemplates.some(t => t.id === c.receiptTemplateId)   ? c.receiptTemplateId   : buildCreateDraft(result).receiptTemplateId,
    }));
    setLoading(false);
    return result;
  }

  const outlets      = pageData.outlets;
  const outletCount  = outlets.length;
  const deviceCount  = outlets.reduce((s, o) => s + o.devicesLinked, 0);
  const reviewCount  = outlets.filter(o => o.status === "Review").length;
  const dineInEnabled  = outlets.filter(o => o.services.includes("Dine-in")).length;
  const deliveryEnabled = outlets.filter(o => o.services.includes("Delivery")).length;
  const needsSetup   = outlets.filter(o => !o.defaultTaxProfileId || !o.receiptTemplateId || !o.reportEmail).length;
  const receiptReady = outlets.filter(o => o.receiptTemplateId).length;

  function startEditingOutlet(outlet) {
    setEditingOutletId(outlet.id);
    setEditDraft(buildEditDraft(outlet));
    setStatusError(""); setStatusMessage("");
  }

  function cancelEditingOutlet() { setEditingOutletId(""); setEditDraft(null); }

  async function handleCreateOutlet(event) {
    event.preventDefault();
    if (!createDraft.workAreas.length) { setStatusError("Select at least one work area."); return; }
    if (!createDraft.services.length)  { setStatusError("Select at least one service mode."); return; }
    if (createDraft.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(createDraft.gstin)) {
      setStatusError("Invalid GSTIN format. Use 15-char format e.g. 29ABCDE1234F1Z5"); return;
    }
    setCreateSaving(true); setStatusError(""); setStatusMessage("");
    try {
      await createOutlet({
        name: createDraft.name, city: createDraft.city, state: createDraft.state,
        gstin: createDraft.gstin, fssaiNo: createDraft.fssaiNo,
        defaultTaxProfileId: createDraft.defaultTaxProfileId,
        receiptTemplateId:   createDraft.receiptTemplateId,
        reportEmail:  createDraft.reportEmail,
        workAreas:    createDraft.workAreas,
        tables:       sanitizeTables(createDraft.tables),
        services:     createDraft.services,
        hours:        joinTimings(createDraft.openingTime, createDraft.closingTime)
      });
      const result = await reloadOutlets();
      setCreateDraft(buildCreateDraft(result));
      setStatusMessage(`Outlet "${createDraft.name}" created.`);
    } catch (err) {
      setStatusError(err.message || "Unable to create outlet.");
    } finally { setCreateSaving(false); }
  }

  async function handleSaveOutlet(event) {
    event.preventDefault();
    if (!editingOutletId || !editDraft) return;
    if (editDraft.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(editDraft.gstin)) {
      setStatusError("Invalid GSTIN format. Use 15-char format e.g. 29ABCDE1234F1Z5"); return;
    }
    setEditSaving(true); setStatusError(""); setStatusMessage("");
    try {
      await updateOutlet(editingOutletId, {
        name: editDraft.name, city: editDraft.city, state: editDraft.state,
        phone: editDraft.phone || "", addressLine1: editDraft.addressLine1 || "", addressLine2: editDraft.addressLine2 || "",
        gstin: editDraft.gstin, fssaiNo: editDraft.fssaiNo, upiId: editDraft.upiId || "",
        defaultTaxProfileId: editDraft.defaultTaxProfileId,
        receiptTemplateId:   editDraft.receiptTemplateId,
        reportEmail:  editDraft.reportEmail,
        workAreas:    editDraft.workAreas,
        tables:       sanitizeTables(editDraft.tables),
        services:     editDraft.services,
        hours:        joinTimings(editDraft.openingTime, editDraft.closingTime)
      });
      // Save waitlist turnover settings
      const patch = {};
      ["breakfast","lunch","snacks","dinner"].forEach(k => {
        const v = editDraft[`turnover_${k}`];
        if (v && Number(v) > 0) patch[k] = Number(v);
      });
      if (Object.keys(patch).length) {
        import("../../lib/api").then(({ api }) =>
          api.put("/operations/waitlist/settings", { outletId: editingOutletId, ...patch }).catch(() => {})
        );
      }
      await reloadOutlets();
      setStatusMessage(`"${editDraft.name}" updated.`);
      cancelEditingOutlet();
    } catch (err) {
      setStatusError(err.message || "Unable to update outlet.");
    } finally { setEditSaving(false); }
  }

  async function handleToggleOutletActive(outlet) {
    try {
      setStatusError("");
      await toggleOutletActive(outlet.id, !outlet.isActive);
      await reloadOutlets();
      setStatusMessage(`${outlet.name} ${outlet.isActive ? "disabled" : "enabled"}.`);
    } catch (err) { setStatusError(err.message || "Unable to update outlet status."); }
  }

  async function handleDeleteOutlet(outlet) {
    if (!window.confirm(`Remove "${outlet.name}"?\n\nThis cannot be undone.`)) return;
    try {
      setStatusError("");
      await deleteOutlet(outlet.id);
      if (editingOutletId === outlet.id) cancelEditingOutlet();
      await reloadOutlets();
      setStatusMessage(`${outlet.name} removed.`);
    } catch (err) { setStatusError(err.message || "Unable to remove outlet."); }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Locations</p>
          <h2>Outlets</h2>
        </div>
        <div className="topbar-actions">
          <button type="button" className="primary-btn"
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            + Create Outlet
          </button>
        </div>
      </header>

      <section className="hero-panel outlet-hero">
        <div>
          <p className="hero-label">Location-first setup</p>
          <h3>Configure shops before POS devices and staff go live</h3>
          <p className="hero-copy">Each outlet supports floor work areas, timings, receipt selection, and direct device linking.</p>
        </div>
        <div className="hero-stats">
          <div><span>Live outlets</span><strong>{outletCount}</strong></div>
          <div><span>Devices linked</span><strong>{deviceCount}</strong></div>
          <div><span>Pending setup</span><strong className="negative">{reviewCount}</strong></div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Dine-in enabled</span>
          <strong>{dineInEnabled}/{outletCount || 0}</strong>
          <p>Outlets configured for dine-in service</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Delivery enabled</span>
          <strong>{deliveryEnabled}/{outletCount || 0}</strong>
          <p>Outlets configured for delivery service</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Needs setup</span>
          <strong>{needsSetup}</strong>
          <p>Outlets missing GST, receipt, or report email</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Receipt ready</span>
          <strong>{receiptReady}/{outletCount || 0}</strong>
          <p>Outlets with receipt templates assigned</p>
        </article>
      </section>

      {(statusMessage || statusError) && (
        <div className={statusError ? "form-error" : "form-success"} style={{ margin:"0 0 16px", padding:"10px 16px", borderRadius:8 }}>
          {statusMessage || statusError}
        </div>
      )}

      <section className="dashboard-grid outlets-layout">

        {/* ── Outlet list with inline editing ─── */}
        <article className="panel panel-wide">
          <div className="panel-head">
            <div><p className="eyebrow">Location Directory</p><h3>Outlet Overview</h3></div>
          </div>

          {loading ? (
            <div className="panel-empty">Loading outlets…</div>
          ) : outlets.length === 0 ? (
            <div className="panel-empty">No outlets yet — create one using the form on the right.</div>
          ) : (
            <div className="outlet-cards">
              {outlets.map(outlet => (
                <div key={outlet.id} className={`location-card${outlet.isActive === false ? " outlet-inactive" : ""}${editingOutletId === outlet.id ? " outlet-editing" : ""}`}>

                  {/* Card header — always visible */}
                  <div className="location-card-head">
                    <div>
                      <strong>
                        {outlet.name}
                        {outlet.isActive === false && <span className="outlet-inactive-badge">Disabled</span>}
                      </strong>
                      <span>{outlet.city}</span>
                    </div>
                    <span className={`status ${statusClass(outlet.status)}`}>{outlet.status}</span>
                  </div>

                  {/* Meta info — only when NOT editing */}
                  {editingOutletId !== outlet.id && (
                    <div className="location-meta">
                      <span>Hours: {outlet.hours}</span>
                      <span>Work areas: {outlet.workAreas.join(", ") || "Not set"}</span>
                      <span>Devices: {outlet.devicesLinked} linked</span>
                      <span>Tables: {outlet.tableCount}</span>
                      <span>Default tax: {outlet.defaultTax}</span>
                      <span>Receipt: {outlet.receiptTemplateName}</span>
                      <span>Reports: {outlet.reportEmail || "Report email pending"}</span>
                    </div>
                  )}

                  {/* Inline edit form — expands inside card */}
                  {editingOutletId === outlet.id && editDraft && (
                    <OutletEditForm
                      draft={editDraft}
                      setDraft={setEditDraft}
                      taxProfiles={pageData.taxProfiles}
                      receiptTemplates={pageData.receiptTemplates}
                      onSave={handleSaveOutlet}
                      onCancel={cancelEditingOutlet}
                      onQRCode={() => setQrOutlet(outlet)}
                      saving={editSaving}
                      statusMessage={statusMessage}
                      statusError={statusError}
                    />
                  )}

                  {/* Action buttons — only when NOT editing */}
                  {editingOutletId !== outlet.id && (
                    <div className="location-actions">
                      <button type="button" className="ghost-chip" onClick={() => startEditingOutlet(outlet)}>Edit</button>
                      <button type="button" className="ghost-chip ghost-chip-qr"
                        onClick={() => setQrOutlet(outlet)}>
                        📱 QR Codes
                      </button>
                      <button type="button" className={`ghost-chip${outlet.isActive ? "" : " ghost-chip-active"}`}
                        onClick={() => handleToggleOutletActive(outlet)}>
                        {outlet.isActive ? "Disable" : "Enable"}
                      </button>
                      <button type="button" className="ghost-chip ghost-chip-danger"
                        onClick={() => handleDeleteOutlet(outlet)}>Remove</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>

        {/* ── Create Outlet form ─── */}
        <article ref={formRef} className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Quick Create</p><h3>New Outlet</h3></div>
          </div>

          <OutletEditForm
            draft={createDraft}
            setDraft={setCreateDraft}
            taxProfiles={pageData.taxProfiles}
            receiptTemplates={pageData.receiptTemplates}
            onSave={handleCreateOutlet}
            onCancel={() => setCreateDraft(buildCreateDraft(pageData))}
            saving={createSaving}
            statusMessage=""
            statusError=""
          />
        </article>

      </section>

      {/* QR Code Generator Modal */}
      {qrOutlet && (
        <QRCodeModal
          outlet={qrOutlet}
          tenantId={tenantId}
          onClose={() => setQrOutlet(null)}
        />
      )}
    </>
  );
}
