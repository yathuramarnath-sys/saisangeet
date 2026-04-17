import { useEffect, useMemo, useRef, useState } from "react";

import {
  createOutlet,
  createOutletLinkCode,
  fetchOutletPageData,
  linkOutletDevice,
  updateOutlet
} from "./outlets.service";

const workAreaOptions = ["AC", "Non-AC", "Self Service", "Cloud Kitchen", "Only Takeaway"];
const serviceOptions = ["Dine-in", "Takeaway", "Delivery"];

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
  if (!openingTime || !closingTime) {
    return "Business hours pending";
  }

  return `${openingTime} - ${closingTime}`;
}

function splitTimings(hours) {
  if (!hours || !hours.includes(" - ")) {
    return { openingTime: "09:00", closingTime: "23:00" };
  }

  const [openingTime, closingTime] = hours.split(" - ");
  return { openingTime: openingTime || "09:00", closingTime: closingTime || "23:00" };
}

function buildEditDraft(outlet) {
  const { openingTime, closingTime } = splitTimings(outlet.hours);

  return {
    name: outlet.name,
    code: outlet.code,
    city: outlet.city,
    state: outlet.state,
    gstin: outlet.gstin,
    defaultTaxProfileId: outlet.defaultTaxProfileId || "",
    receiptTemplateId: outlet.receiptTemplateId || "",
    reportEmail: outlet.reportEmail || "",
    openingTime,
    closingTime,
    workAreas: outlet.workAreas || [],
    tables: outlet.tables || [],
    services: outlet.services || [],
    deviceName: "",
    deviceType: "POS Terminal",
    linkCode: ""
  };
}

function buildCreateDraft(pageData) {
  return {
    name: "Electronic City",
    code: "BLR-05",
    city: "Bengaluru",
    state: "Karnataka",
    gstin: "29ABCDE1234F1Z5",
    openingTime: "09:00",
    closingTime: "23:00",
    reportEmail: "ecity-reports@saisangeet.in",
    defaultTaxProfileId: pageData.taxProfiles?.[0]?.id || "tax-5",
    receiptTemplateId: pageData.receiptTemplates?.[0]?.id || "",
    workAreas: ["AC", "Non-AC", "Self Service"],
    tables: [buildEmptyTableRow("AC")],
    services: ["Dine-in", "Takeaway"]
  };
}

function toggleSelection(values, item) {
  return values.includes(item) ? values.filter((value) => value !== item) : [...values, item];
}

function sanitizeTables(tables = []) {
  return tables
    .map((table) => ({
      id: table.id || `table-${Date.now()}`,
      workArea: table.workArea || "AC",
      name: String(table.name || "").trim(),
      seats: Number(table.seats || 0)
    }))
    .filter((table) => table.name && table.seats > 0)
    .map((table) => ({
      ...table,
      seatLabels: Array.from({ length: Number(table.seats) }, (_, index) => `${table.name}S${index + 1}`)
    }));
}

function buildSeatPreview(table) {
  const seatCount = Number(table.seats || 0);

  if (!table.name) {
    return "Enter table name first";
  }

  if (seatCount <= 0) {
    return "Add seat count";
  }

  return Array.from({ length: seatCount }, (_, index) => `${table.name}S${index + 1}`).join(", ");
}

function buildCompactSeatPreview(table) {
  const seatCount = Number(table.seats || 0);

  if (!table.name || seatCount <= 0) {
    return "Seat preview pending";
  }

  const previewSeats = Array.from({ length: Math.min(seatCount, 4) }, (_, index) => `${table.name}S${index + 1}`);
  return seatCount > 4 ? `${previewSeats.join(", ")} ... +${seatCount - 4} more` : previewSeats.join(", ");
}

export function OutletsPage() {
  const [pageData, setPageData] = useState({
    outlets: [],
    taxProfiles: [],
    receiptTemplates: [],
    devices: []
  });
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  const [editingOutletId, setEditingOutletId] = useState("");
  const [editDraft, setEditDraft] = useState(null);
  const [createDraft, setCreateDraft] = useState(buildCreateDraft({ taxProfiles: [], receiptTemplates: [] }));
  const formRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchOutletPageData();

      if (!cancelled) {
        setPageData(result);
        setCreateDraft(buildCreateDraft(result));
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadOutlets() {
    const result = await fetchOutletPageData();
    setPageData(result);
    setCreateDraft((current) => ({
      ...buildCreateDraft(result),
      ...current,
      defaultTaxProfileId: result.taxProfiles.some((profile) => profile.id === current.defaultTaxProfileId)
        ? current.defaultTaxProfileId
        : buildCreateDraft(result).defaultTaxProfileId,
      receiptTemplateId: result.receiptTemplates.some((template) => template.id === current.receiptTemplateId)
        ? current.receiptTemplateId
        : buildCreateDraft(result).receiptTemplateId
    }));
    setLoading(false);
    return result;
  }

  const outlets = pageData.outlets;
  const outletCount = outlets.length;
  const deviceCount = outlets.reduce((total, outlet) => total + outlet.devicesLinked, 0);
  const reviewCount = outlets.filter((outlet) => outlet.status === "Review").length;
  const dineInEnabled = outlets.filter((outlet) => outlet.services.includes("Dine-in")).length;
  const deliveryEnabled = outlets.filter((outlet) => outlet.services.includes("Delivery")).length;
  const needsSetup = outlets.filter((outlet) => !outlet.defaultTaxProfileId || !outlet.receiptTemplateId || !outlet.reportEmail).length;
  const receiptReady = outlets.filter((outlet) => outlet.receiptTemplateId).length;

  const activeOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === editingOutletId) || null,
    [outlets, editingOutletId]
  );
  const activeOutletDevices = useMemo(
    () => pageData.devices.filter((device) => device.outletName === activeOutlet?.name),
    [pageData.devices, activeOutlet]
  );

  function startEditingOutlet(outlet) {
    setEditingOutletId(outlet.id);
    setEditDraft(buildEditDraft(outlet));
    setStatusError("");
    setStatusMessage("");
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditingOutlet() {
    setEditingOutletId("");
    setEditDraft(null);
  }

  async function handleCreateOutlet(event) {
    event.preventDefault();

    if (!createDraft.workAreas.length) {
      setStatusError("Select at least one work area.");
      return;
    }

    if (!createDraft.services.length) {
      setStatusError("Select at least one service mode.");
      return;
    }

    try {
      setStatusError("");
      setStatusMessage("");
      await createOutlet({
        name: createDraft.name,
        code: createDraft.code,
        city: createDraft.city,
        state: createDraft.state,
        gstin: createDraft.gstin,
        defaultTaxProfileId: createDraft.defaultTaxProfileId,
        receiptTemplateId: createDraft.receiptTemplateId,
        reportEmail: createDraft.reportEmail,
        workAreas: createDraft.workAreas,
        tables: sanitizeTables(createDraft.tables),
        services: createDraft.services,
        hours: joinTimings(createDraft.openingTime, createDraft.closingTime)
      });

      const result = await reloadOutlets();
      setCreateDraft(buildCreateDraft(result));
      setStatusMessage(`Outlet ${createDraft.name} created and added to owner setup.`);
    } catch (error) {
      setStatusError(error.message || "Unable to create outlet.");
    }
  }

  async function handleSaveOutlet(event) {
    event.preventDefault();

    if (!editingOutletId || !editDraft) {
      return;
    }

    try {
      setStatusError("");
      setStatusMessage("");
      await updateOutlet(editingOutletId, {
        name: editDraft.name,
        code: editDraft.code,
        city: editDraft.city,
        state: editDraft.state,
        gstin: editDraft.gstin,
        defaultTaxProfileId: editDraft.defaultTaxProfileId,
        receiptTemplateId: editDraft.receiptTemplateId,
        reportEmail: editDraft.reportEmail,
        workAreas: editDraft.workAreas,
        tables: sanitizeTables(editDraft.tables),
        services: editDraft.services,
        hours: joinTimings(editDraft.openingTime, editDraft.closingTime)
      });

      const result = await reloadOutlets();
      const refreshedOutlet = result.outlets.find((outlet) => outlet.id === editingOutletId);
      if (refreshedOutlet) {
        setEditDraft((current) => ({
          ...buildEditDraft(refreshedOutlet),
          deviceName: current?.deviceName || "",
          deviceType: current?.deviceType || "POS Terminal",
          linkCode: current?.linkCode || ""
        }));
      }
      setStatusMessage(`Outlet ${editDraft.name} updated successfully.`);
    } catch (error) {
      setStatusError(error.message || "Unable to update outlet.");
    }
  }

  async function handleGenerateLinkCode(outlet) {
    try {
      setStatusError("");
      setStatusMessage("");
      const result = await createOutletLinkCode({ outletCode: outlet.code });
      setEditingOutletId(outlet.id);
      setEditDraft((current) => ({
        ...(current && editingOutletId === outlet.id ? current : buildEditDraft(outlet)),
        linkCode: result.linkCode
      }));
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatusMessage(`Device link code for ${outlet.name}: ${result.linkCode}`);
    } catch (error) {
      setStatusError(error.message || "Unable to generate outlet device link code.");
    }
  }

  async function handleLinkDevice() {
    if (!activeOutlet || !editDraft?.deviceName || !editDraft?.linkCode) {
      setStatusError("Generate a link code and enter device name before linking.");
      return;
    }

    try {
      setStatusError("");
      setStatusMessage("");
      await linkOutletDevice({
        deviceName: editDraft.deviceName,
        deviceType: editDraft.deviceType,
        outletName: activeOutlet.name,
        linkCode: editDraft.linkCode
      });
      const result = await reloadOutlets();
      const updatedOutlet = result.outlets.find((outlet) => outlet.id === activeOutlet.id);
      if (updatedOutlet) {
        setEditDraft(buildEditDraft(updatedOutlet));
        setEditingOutletId(updatedOutlet.id);
      }
      setStatusMessage("Device linked to outlet.");
    } catch (error) {
      setStatusError(error.message || "Unable to link device.");
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Locations</p>
          <h2>Outlets</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Manage Outlet
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Create Outlet
          </button>
        </div>
      </header>

      <section className="hero-panel outlet-hero">
        <div>
          <p className="hero-label">Location-first setup</p>
          <h3>Configure shops before POS devices and staff go live</h3>
          <p className="hero-copy">
            Each outlet now supports floor work areas, timings, report email delivery, receipt selection, and direct device linking.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Live outlets</span>
            <strong>{outletCount}</strong>
          </div>
          <div>
            <span>Devices linked</span>
            <strong>{deviceCount}</strong>
          </div>
          <div>
            <span>Pending setup</span>
            <strong className="negative">{reviewCount}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Dine-in enabled</span>
          <strong>{dineInEnabled}/{outletCount || 0}</strong>
          <p>Outlets currently configured for dine-in service</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Delivery enabled</span>
          <strong>{deliveryEnabled}/{outletCount || 0}</strong>
          <p>Outlets currently configured for delivery service</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Needs setup</span>
          <strong>{needsSetup}</strong>
          <p>Outlets still missing GST, receipt, or report email setup</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Receipt ready</span>
          <strong>{receiptReady}/{outletCount || 0}</strong>
          <p>Outlets with receipt templates already assigned</p>
        </article>
      </section>

      <section className="dashboard-grid outlets-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Location Directory</p>
              <h3>Outlet Overview</h3>
            </div>
          </div>

          {loading ? (
            <div className="panel-empty">Loading outlets...</div>
          ) : (
            <div className="outlet-cards">
              {outlets.map((outlet) => (
                <div key={outlet.id} className="location-card">
                  <div className="location-card-head">
                    <div>
                      <strong>{outlet.name}</strong>
                      <span>
                        {outlet.city} • {outlet.code}
                      </span>
                    </div>
                    <span className={`status ${statusClass(outlet.status)}`}>{outlet.status}</span>
                  </div>

                  <div className="location-meta">
                    <span>Hours: {outlet.hours}</span>
                    <span>Work areas: {outlet.workAreas.join(", ") || "Not set"}</span>
                    <span>Devices: {outlet.devicesLinked} linked</span>
                    <span>Tables: {outlet.tableCount}</span>
                    <span>Default tax: {outlet.defaultTax}</span>
                    <span>Receipt: {outlet.receiptTemplateName}</span>
                    <span>Reports: {outlet.reportEmail || "Report email pending"}</span>
                  </div>

                  <div className="location-actions">
                    <button type="button" className="ghost-chip" onClick={() => startEditingOutlet(outlet)}>
                      Edit
                    </button>
                    <button type="button" className="ghost-chip" onClick={() => handleGenerateLinkCode(outlet)}>
                      Link device
                    </button>
                    <button type="button" className="ghost-chip" onClick={() => startEditingOutlet(outlet)}>
                      Receipt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article ref={formRef} className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Outlet</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreateOutlet}>
            <label>
              Outlet name
              <input
                type="text"
                name="name"
                value={createDraft.name}
                onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Outlet code
              <input
                type="text"
                name="code"
                value={createDraft.code}
                onChange={(event) => setCreateDraft((current) => ({ ...current, code: event.target.value }))}
                required
              />
            </label>
            <label>
              City
              <input
                type="text"
                name="city"
                value={createDraft.city}
                onChange={(event) => setCreateDraft((current) => ({ ...current, city: event.target.value }))}
                required
              />
            </label>
            <label>
              State
              <input
                type="text"
                name="state"
                value={createDraft.state}
                onChange={(event) => setCreateDraft((current) => ({ ...current, state: event.target.value }))}
                required
              />
            </label>
            <label>
              GSTIN
              <input
                type="text"
                name="gstin"
                value={createDraft.gstin}
                onChange={(event) => setCreateDraft((current) => ({ ...current, gstin: event.target.value }))}
              />
            </label>
            <label>
              Opening time
              <input
                type="time"
                name="openingTime"
                value={createDraft.openingTime}
                onChange={(event) => setCreateDraft((current) => ({ ...current, openingTime: event.target.value }))}
              />
            </label>
            <label>
              Closing time
              <input
                type="time"
                name="closingTime"
                value={createDraft.closingTime}
                onChange={(event) => setCreateDraft((current) => ({ ...current, closingTime: event.target.value }))}
              />
            </label>
            <label>
              Report email
              <input
                type="email"
                name="reportEmail"
                value={createDraft.reportEmail}
                onChange={(event) => setCreateDraft((current) => ({ ...current, reportEmail: event.target.value }))}
              />
            </label>
            <label>
              Default GST
              <select
                name="defaultTaxProfileId"
                value={createDraft.defaultTaxProfileId}
                onChange={(event) => setCreateDraft((current) => ({ ...current, defaultTaxProfileId: event.target.value }))}
              >
                {pageData.taxProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Receipt template
              <select
                name="receiptTemplateId"
                value={createDraft.receiptTemplateId}
                onChange={(event) => setCreateDraft((current) => ({ ...current, receiptTemplateId: event.target.value }))}
              >
                {pageData.receiptTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mini-stack">
              <strong>Work areas</strong>
              {workAreaOptions.map((option) => (
                <label key={`work-area-${option}`} className="mini-card">
                  <span>{option}</span>
                  <input
                    type="checkbox"
                    name="workAreas"
                    value={option}
                    checked={createDraft.workAreas.includes(option)}
                    onChange={() =>
                      setCreateDraft((current) => ({ ...current, workAreas: toggleSelection(current.workAreas, option) }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="mini-stack">
              <div className="mini-card">
                <strong>Create tables</strong>
                <span>Add multiple tables here and save once for the outlet.</span>
              </div>
              {createDraft.tables.map((table, index) => (
                <div key={table.id} className="mini-card">
                  <strong>Table {index + 1}</strong>
                  <label>
                    Work area
                    <select
                      value={table.workArea}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          tables: current.tables.map((item) =>
                            item.id === table.id ? { ...item, workArea: event.target.value } : item
                          )
                        }))
                      }
                    >
                      {createDraft.workAreas.map((workArea) => (
                        <option key={`${table.id}-${workArea}`} value={workArea}>
                          {workArea}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Table name
                    <input
                      type="text"
                      value={table.name}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          tables: current.tables.map((item) =>
                            item.id === table.id ? { ...item, name: event.target.value } : item
                          )
                        }))
                      }
                      placeholder={`T${index + 1}`}
                    />
                  </label>
                  <label>
                    Seats
                    <input
                      type="number"
                      min="1"
                      value={table.seats}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          tables: current.tables.map((item) =>
                            item.id === table.id ? { ...item, seats: event.target.value } : item
                          )
                        }))
                      }
                    />
                  </label>
                  <span>Seat preview: {buildSeatPreview(table)}</span>
                  <button
                    type="button"
                    className="ghost-chip"
                    onClick={() =>
                      setCreateDraft((current) => ({
                        ...current,
                        tables:
                          current.tables.length > 1
                            ? current.tables.filter((item) => item.id !== table.id)
                            : [buildEmptyTableRow(current.workAreas[0] || "AC")]
                      }))
                    }
                  >
                    Remove Table
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost-btn"
                onClick={() =>
                  setCreateDraft((current) => ({
                    ...current,
                    tables: [...current.tables, buildEmptyTableRow(current.workAreas[0] || "AC")]
                  }))
                }
              >
                Add Table
              </button>
              <div className="mini-card">
                <strong>Created table summary</strong>
                <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  {createDraft.tables
                    .filter((table) => table.name)
                    .map((table) => (
                      <div
                        key={`summary-${table.id}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "8px",
                          padding: "8px 0",
                          borderBottom: "1px solid rgba(15, 23, 42, 0.08)"
                        }}
                      >
                        <span>{table.workArea}</span>
                        <strong>{table.name}</strong>
                        <span>{buildCompactSeatPreview(table)}</span>
                      </div>
                    ))}
                  {!createDraft.tables.some((table) => table.name) ? <span>No tables added yet</span> : null}
                </div>
              </div>
            </div>
            <div className="mini-stack">
              <strong>Service modes</strong>
              {serviceOptions.map((service) => (
                <label key={`service-${service}`} className="mini-card">
                  <span>{service}</span>
                  <input
                    type="checkbox"
                    name="services"
                    value={service}
                    checked={createDraft.services.includes(service)}
                    onChange={() =>
                      setCreateDraft((current) => ({ ...current, services: toggleSelection(current.services, service) }))
                    }
                  />
                </label>
              ))}
            </div>
            {statusMessage ? <p>{statusMessage}</p> : null}
            {statusError ? <p>{statusError}</p> : null}
            <button type="submit" className="primary-btn full-width">
              Save Outlet
            </button>
          </form>
        </article>

        <article ref={editorRef} className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Outlet Actions</p>
              <h3>{activeOutlet ? `${activeOutlet.name} Setup` : "Select an outlet"}</h3>
            </div>
            {editingOutletId ? (
              <button type="button" className="ghost-btn" onClick={cancelEditingOutlet}>
                Cancel
              </button>
            ) : null}
          </div>

          {activeOutlet && editDraft ? (
            <form className="simple-form" onSubmit={handleSaveOutlet}>
              <label>
                Outlet name
                <input
                  type="text"
                  value={editDraft.name}
                  onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Outlet code
                <input
                  type="text"
                  value={editDraft.code}
                  onChange={(event) => setEditDraft((current) => ({ ...current, code: event.target.value }))}
                />
              </label>
              <label>
                City
                <input
                  type="text"
                  value={editDraft.city}
                  onChange={(event) => setEditDraft((current) => ({ ...current, city: event.target.value }))}
                />
              </label>
              <label>
                State
                <input
                  type="text"
                  value={editDraft.state}
                  onChange={(event) => setEditDraft((current) => ({ ...current, state: event.target.value }))}
                />
              </label>
              <label>
                GSTIN
                <input
                  type="text"
                  value={editDraft.gstin}
                  onChange={(event) => setEditDraft((current) => ({ ...current, gstin: event.target.value }))}
                />
              </label>
              <label>
                Opening time
                <input
                  type="time"
                  value={editDraft.openingTime}
                  onChange={(event) => setEditDraft((current) => ({ ...current, openingTime: event.target.value }))}
                />
              </label>
              <label>
                Closing time
                <input
                  type="time"
                  value={editDraft.closingTime}
                  onChange={(event) => setEditDraft((current) => ({ ...current, closingTime: event.target.value }))}
                />
              </label>
              <label>
                Report email
                <input
                  type="email"
                  value={editDraft.reportEmail}
                  onChange={(event) => setEditDraft((current) => ({ ...current, reportEmail: event.target.value }))}
                />
              </label>
              <label>
                Default GST
                <select
                  value={editDraft.defaultTaxProfileId}
                  onChange={(event) => setEditDraft((current) => ({ ...current, defaultTaxProfileId: event.target.value }))}
                >
                  {pageData.taxProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Receipt template
                <select
                  value={editDraft.receiptTemplateId}
                  onChange={(event) => setEditDraft((current) => ({ ...current, receiptTemplateId: event.target.value }))}
                >
                  {pageData.receiptTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mini-stack">
                <strong>Work areas</strong>
                {workAreaOptions.map((option) => (
                  <label key={`edit-work-area-${option}`} className="mini-card">
                    <span>{option}</span>
                    <input
                      type="checkbox"
                      checked={editDraft.workAreas.includes(option)}
                      onChange={() =>
                        setEditDraft((current) => ({ ...current, workAreas: toggleSelection(current.workAreas, option) }))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="mini-stack">
                <div className="mini-card">
                  <strong>Tables and seats</strong>
                  <span>Use one box to manage all tables for this outlet.</span>
                </div>
                {editDraft.tables.length ? (
                  editDraft.tables.map((table, index) => (
                    <div key={table.id} className="mini-card">
                      <strong>Table {index + 1}</strong>
                      <label>
                        Work area
                        <select
                          value={table.workArea}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              tables: current.tables.map((item) =>
                                item.id === table.id ? { ...item, workArea: event.target.value } : item
                              )
                            }))
                          }
                        >
                          {editDraft.workAreas.map((workArea) => (
                            <option key={`${table.id}-${workArea}`} value={workArea}>
                              {workArea}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Table name
                        <input
                          type="text"
                          value={table.name}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              tables: current.tables.map((item) =>
                                item.id === table.id ? { ...item, name: event.target.value } : item
                              )
                            }))
                          }
                        />
                      </label>
                      <label>
                        Seats
                        <input
                          type="number"
                          min="1"
                          value={table.seats}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              tables: current.tables.map((item) =>
                                item.id === table.id ? { ...item, seats: event.target.value } : item
                              )
                            }))
                          }
                        />
                      </label>
                      <span>Seat preview: {buildSeatPreview(table)}</span>
                      <button
                        type="button"
                        className="ghost-chip"
                        onClick={() =>
                          setEditDraft((current) => ({
                            ...current,
                            tables:
                              current.tables.length > 1
                                ? current.tables.filter((item) => item.id !== table.id)
                                : []
                          }))
                        }
                      >
                        Remove Table
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="mini-card">
                    <span>No tables added yet</span>
                    <strong>Add tables below</strong>
                  </div>
                )}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() =>
                    setEditDraft((current) => ({
                      ...current,
                      tables: [...current.tables, buildEmptyTableRow(current.workAreas[0] || "AC")]
                    }))
                  }
                >
                  Add Table
                </button>
                <div className="mini-card">
                  <strong>Saved table summary</strong>
                  <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    {editDraft.tables
                      .filter((table) => table.name)
                      .map((table) => (
                        <div
                          key={`edit-summary-${table.id}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "8px",
                            padding: "8px 0",
                            borderBottom: "1px solid rgba(15, 23, 42, 0.08)"
                          }}
                        >
                          <span>{table.workArea}</span>
                          <strong>{table.name}</strong>
                          <span>{buildCompactSeatPreview(table)}</span>
                        </div>
                      ))}
                    {!editDraft.tables.some((table) => table.name) ? <span>No tables saved yet</span> : null}
                  </div>
                </div>
              </div>

              <div className="mini-stack">
                <strong>Service modes</strong>
                {["Dine-in", "Takeaway", "Delivery"].map((service) => (
                  <label key={`edit-service-${service}`} className="mini-card">
                    <span>{service}</span>
                    <input
                      type="checkbox"
                      checked={editDraft.services.includes(service)}
                      onChange={() =>
                        setEditDraft((current) => ({ ...current, services: toggleSelection(current.services, service) }))
                      }
                    />
                  </label>
                ))}
              </div>

              <button type="submit" className="primary-btn full-width">
                Save Outlet Changes
              </button>
              {statusMessage ? <p>{statusMessage}</p> : null}
              {statusError ? <p>{statusError}</p> : null}

              <div className="mini-stack">
                <div className="mini-card">
                  <span>Receipt assigned</span>
                  <strong>
                    {pageData.receiptTemplates.find((template) => template.id === editDraft.receiptTemplateId)?.name ||
                      "Receipt pending"}
                  </strong>
                </div>
                <div className="mini-card">
                  <span>Linked devices</span>
                  <strong>{activeOutlet.devicesLinked}</strong>
                </div>
              </div>

              <div className="mini-stack">
                <strong>Available receipt templates</strong>
                {pageData.receiptTemplates.map((template) => (
                  <label key={`receipt-choice-${template.id}`} className="mini-card">
                    <span>{template.name}</span>
                    <span>{template.outletName || "All Outlets"}</span>
                    <input
                      type="radio"
                      name="receiptChoice"
                      checked={editDraft.receiptTemplateId === template.id}
                      onChange={() => setEditDraft((current) => ({ ...current, receiptTemplateId: template.id }))}
                    />
                  </label>
                ))}
              </div>

              <div className="mini-stack">
                <strong>Devices for this outlet</strong>
                {activeOutletDevices.length ? (
                  activeOutletDevices.map((device) => (
                    <div key={device.id} className="mini-card">
                      <span>{device.deviceName || device.name}</span>
                      <strong>{device.deviceType || device.type}</strong>
                      <span>{device.status}</span>
                    </div>
                  ))
                ) : (
                  <div className="mini-card">
                    <span>No devices linked yet</span>
                    <strong>Generate a link code to add one</strong>
                  </div>
                )}
              </div>

              <label>
                Device name
                <input
                  type="text"
                  value={editDraft.deviceName}
                  onChange={(event) => setEditDraft((current) => ({ ...current, deviceName: event.target.value }))}
                  placeholder="Front Counter POS"
                />
              </label>
              <label>
                Device type
                <select
                  value={editDraft.deviceType}
                  onChange={(event) => setEditDraft((current) => ({ ...current, deviceType: event.target.value }))}
                >
                  <option>POS Terminal</option>
                  <option>Kitchen Printer</option>
                  <option>Kitchen Display</option>
                  <option>Payment Device</option>
                </select>
              </label>
              <label>
                Link code
                <input type="text" value={editDraft.linkCode} readOnly placeholder="Generate link code first" />
              </label>
              <div className="entity-actions">
                <button type="button" className="ghost-btn" onClick={() => handleGenerateLinkCode(activeOutlet)}>
                  Generate link code
                </button>
                <button type="button" className="secondary-btn" onClick={handleLinkDevice}>
                  Link device now
                </button>
              </div>
            </form>
          ) : (
            <div className="panel-empty">Choose an outlet from the overview card to edit setup, link devices, or assign receipt logic.</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Default Controls</p>
              <h3>Service Modes</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Dine-in</span>
              <strong>{dineInEnabled} outlets enabled</strong>
            </div>
            <div className="mini-card">
              <span>Takeaway</span>
              <strong>{outlets.filter((outlet) => outlet.services.includes("Takeaway")).length} outlets enabled</strong>
            </div>
            <div className="mini-card">
              <span>Delivery</span>
              <strong>{deliveryEnabled} outlets enabled</strong>
            </div>
            <div className="mini-card">
              <span>Auto report mail</span>
              <strong>{outlets.filter((outlet) => outlet.reportEmail).length} outlets configured</strong>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
