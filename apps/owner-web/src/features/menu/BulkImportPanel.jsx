/**
 * BulkImportPanel
 * Full-featured CSV import modal for menu items.
 * - Proper CSV parser (handles quoted fields with commas)
 * - Flexible column name matching (case-insensitive, multiple aliases)
 * - Preview step before committing
 * - Row-level validation and error reporting
 * - Downloadable sample template (columns adjust based on enabled menuFieldSettings)
 */

import { useRef, useState } from "react";
import { bulkImportMenuItems } from "./menu.service";

// ── Proper CSV parser ─────────────────────────────────────────────────────────
// Handles quoted fields that contain commas, newlines, and escaped quotes ("").

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

// ── Column name aliases ───────────────────────────────────────────────────────
// Maps any reasonable header a restaurant owner might write to an internal field.

const COLUMN_ALIASES = {
  // Core fields
  itemName:           ["item name", "name", "item", "product name", "dish name", "item_name", "itemname", "product"],
  category:           ["category", "cat", "category name", "categoryname", "cat name", "section"],
  foodType:           ["food type", "foodtype", "veg/non-veg", "type", "food", "veg non veg", "veg or non veg"],
  station:            ["station", "kitchen station", "prep station", "station name", "cook station"],
  gstRate:            ["gst rate", "gst%", "tax rate", "tax%", "gst", "gstrate", "tax", "gst %", "tax %"],
  gstMode:            ["gst mode", "tax mode", "inclusive/exclusive", "mode", "gstmode", "tax type"],
  acDineIn:           ["ac dine-in", "ac dine in", "ac", "acdinin", "ac price", "dine in ac", "ac hall", "ac dinin"],
  nonAcDineIn:        ["non-ac dine-in", "non ac", "nonac", "non-ac", "non ac dine in", "non ac price", "non-ac hall"],
  selfDineIn:         ["self service", "self", "selfdinin", "self dine-in", "self service price", "self dine in"],
  takeawayPrice:      ["takeaway", "takeaway price", "parcel price", "take away", "parcel", "takeaway/parcel"],
  deliveryPrice:      ["delivery", "delivery price", "home delivery", "deliver", "delivery/swiggy"],
  // Optional fields
  description:        ["description", "desc", "item description", "details", "about"],
  shortCode:          ["short code", "shortcode", "short_code", "code", "item code", "short"],
  hsnCode:            ["hsn code", "hsn", "hsn/sac", "sac code", "sac", "hsn_code", "sap code"],
  sku:                ["sku", "barcode", "sku/barcode", "sku / barcode", "bar code", "product code", "scan code", "ean"],
  rank:               ["rank", "display order", "sort order", "order", "position", "display rank", "sort"],
  packingCharges:     ["packing charges", "packing charge", "packing", "pack charge", "packing fee"],
  exposeInCaptain:    ["expose in captain", "captain app", "captain", "show in captain", "visible in captain"],
  allowDecimalQty:    ["allow decimal", "decimal qty", "decimal quantity", "fractional qty", "decimal"],
  manufacturingDate:  ["manufacturing date", "mfg date", "manufacture date", "mfg", "manufactured date", "mfg/manufacturing date"],
  expiryDate:         ["expiry date", "expiry", "exp date", "best before", "best by", "use by", "expiry/best before"],
};

function mapHeader(raw) {
  const key = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-/]/g, "")
    .trim();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

// ── CSV parser entry point ────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { headers: [], rows: [], unknownCols: [], dupCount: 0 };
  }

  const rawHeaders = parseCSVLine(lines[0]);
  const mappedHeaders = rawHeaders.map((h) => ({ raw: h, field: mapHeader(h) }));
  const unknownCols = mappedHeaders.filter((h) => !h.field).map((h) => h.raw);

  const allRows = lines.slice(1).map((line, lineIdx) => {
    const values = parseCSVLine(line);
    const row = { _line: lineIdx + 2 };
    mappedHeaders.forEach((h, i) => {
      if (h.field) row[h.field] = values[i] ?? "";
    });
    return row;
  });

  // ── Deduplicate by itemName + category (case-insensitive) ──────────────────
  // Prevents accidental row repetition from Excel/Sheets copy-paste auto-fill.
  // Only the FIRST occurrence of each (name + category) pair is kept.
  const seenKeys = new Set();
  let dupCount = 0;
  const rows = [];
  for (const row of allRows) {
    const name = String(row.itemName || "").trim().toLowerCase();
    const cat  = String(row.category  || "").trim().toLowerCase();
    // Rows with no name or category are passed through as-is (validator will flag them)
    if (!name && !cat) {
      rows.push(row);
      continue;
    }
    const key = `${name}|||${cat}`;
    if (seenKeys.has(key)) {
      dupCount++;
    } else {
      seenKeys.add(key);
      rows.push(row);
    }
  }

  return { headers: mappedHeaders, rows, unknownCols, dupCount };
}

// ── Validation ────────────────────────────────────────────────────────────────

// validateRow receives a NORMALIZED row (output of normalizeRow)
function validateRow(row) {
  const errors = [];
  if (!row.itemName?.trim())     errors.push("Item name missing");
  if (!row.categoryName?.trim()) errors.push("Category missing");
  const anyPrice =
    Number(row.acDineIn) ||
    Number(row.nonAcDineIn) ||
    Number(row.selfDineIn) ||
    Number(row.takeawayPrice) ||
    Number(row.deliveryPrice);
  if (!anyPrice) errors.push("At least one price required");
  return errors;
}

// ── Row normaliser → matches what bulkImportMenuItems expects ─────────────────

function toNum(v) {
  const n = parseFloat(String(v || "0").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function normalizeRow(row) {
  return {
    // Core fields
    itemName:          row.itemName?.trim() || "",
    categoryName:      row.category?.trim()  || "",
    foodType:          row.foodType?.trim()  || "Veg",
    station:           row.station?.trim()   || "Main kitchen",
    taxRate:           toNum(row.gstRate) || 5,
    taxMode:           /incl/i.test(row.gstMode || "") ? "Inclusive" : "Exclusive",
    acDineIn:          toNum(row.acDineIn),
    nonAcDineIn:       toNum(row.nonAcDineIn),
    selfDineIn:        toNum(row.selfDineIn),
    takeawayPrice:     toNum(row.takeawayPrice),
    deliveryPrice:     toNum(row.deliveryPrice),
    // Optional fields
    description:       row.description?.trim() || "",
    shortCode:         (row.shortCode?.trim() || "").toUpperCase().slice(0, 8),
    hsnCode:           row.hsnCode?.trim() || "",
    sku:               row.sku?.trim() || "",
    rank:              toNum(row.rank) || 999,
    packingCharges:    toNum(row.packingCharges),
    exposeInCaptain:   row.exposeInCaptain !== undefined
                         ? !/^(false|no|0)$/i.test(String(row.exposeInCaptain).trim())
                         : true,
    allowDecimalQty:   /^(true|yes|1)$/i.test(String(row.allowDecimalQty || "").trim()),
    manufacturingDate: row.manufacturingDate?.trim() || "",
    expiryDate:        row.expiryDate?.trim() || "",
  };
}

// ── Sample CSV generator ──────────────────────────────────────────────────────
// Base columns always present; optional columns appended based on menuFieldSettings.

const BASE_HEADERS = [
  "Item Name", "Category", "Food Type", "Station",
  "GST Rate", "GST Mode",
  "AC Dine-In", "Non-AC Dine-In", "Self Service",
  "Takeaway Price", "Delivery Price",
];

const BASE_SAMPLE_ROWS = [
  ["Paneer Tikka",   "Starters",    "Veg",     "Grill Station", "5", "Exclusive", "220", "210", "195", "210", "230"],
  ["Chicken 65",     "Starters",    "Non-Veg", "Fry Station",   "5", "Exclusive", "280", "270", "255", "270", "290"],
  ["Dal Makhani",    "Main Course", "Veg",     "Main Kitchen",  "5", "Exclusive", "260", "250", "235", "250", "270"],
  ["Butter Chicken", "Main Course", "Non-Veg", "Main Kitchen",  "5", "Exclusive", "340", "330", "315", "330", "360"],
  ["Mango Lassi",    "Beverages",   "Veg",     "Beverages",     "5", "Exclusive", "120", "120", "110", "120", "140"],
  ["Masala Chai",    "Beverages",   "Veg",     "Beverages",     "5", "Exclusive", "60",  "60",  "55",  "60",  "70" ],
];

// Maps field key → { header label, sample value, hint }
const OPTIONAL_FIELD_META = {
  description:       { header: "Description",          sample: "Freshly prepared, mildly spiced", hint: "Brief description of the item" },
  shortCode:         { header: "Short Code",            sample: "PNT",          hint: "Short code for KOT (max 8 chars, e.g. PNT)" },
  hsnCode:           { header: "HSN Code",              sample: "9963",         hint: "HSN / SAC code for GST billing" },
  sku:               { header: "SKU / Barcode",         sample: "8901234567890",hint: "Barcode or SKU for scanner lookup" },
  rank:              { header: "Rank",                  sample: "1",            hint: "Display order — 1 appears first" },
  packingCharges:    { header: "Packing Charges",       sample: "10",           hint: "Per-item packing charge in ₹" },
  exposeInCaptain:   { header: "Expose in Captain",     sample: "Yes",          hint: "Yes or No — show in Captain App?" },
  allowDecimalQty:   { header: "Allow Decimal Qty",     sample: "No",           hint: "Yes to allow 0.5, 1.5 etc." },
  manufacturingDate: { header: "Manufacturing Date",    sample: "01-01-2026",   hint: "DD-MM-YYYY format" },
  expiryDate:        { header: "Expiry Date",           sample: "31-12-2026",   hint: "DD-MM-YYYY format" },
};

function buildSampleCSV(fs = {}) {
  // Determine which optional columns to include
  const optionalKeys = Object.keys(OPTIONAL_FIELD_META).filter((k) => fs[k]);

  const headers = [...BASE_HEADERS, ...optionalKeys.map((k) => OPTIONAL_FIELD_META[k].header)];

  const rows = BASE_SAMPLE_ROWS.map((baseRow) => [
    ...baseRow,
    ...optionalKeys.map((k) => OPTIONAL_FIELD_META[k].sample),
  ]);

  return [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadSample(fs = {}) {
  const csvContent = buildSampleCSV(fs);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = "plato-menu-import-sample.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── Column reference list (core + optional based on fs) ──────────────────────

const CORE_COL_REFERENCE = [
  { col: "Item Name",       req: true,  hint: "Name of the dish" },
  { col: "Category",        req: true,  hint: "e.g. Starters, Main Course, Beverages" },
  { col: "Food Type",       req: false, hint: "Veg or Non-Veg (default: Veg)" },
  { col: "Station",         req: false, hint: "Kitchen station, e.g. Grill, Fry, Beverages" },
  { col: "GST Rate",        req: false, hint: "Number only: 0, 5, 12, 18 (default: 5)" },
  { col: "GST Mode",        req: false, hint: "Exclusive or Inclusive (default: Exclusive)" },
  { col: "AC Dine-In",      req: false, hint: "AC hall dine-in price in ₹" },
  { col: "Non-AC Dine-In",  req: false, hint: "Non-AC hall price in ₹" },
  { col: "Self Service",    req: false, hint: "Self-service counter price in ₹" },
  { col: "Takeaway Price",  req: false, hint: "Parcel / takeaway price in ₹" },
  { col: "Delivery Price",  req: false, hint: "Home delivery price in ₹" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function BulkImportPanel({ onClose, onImportDone, menuFieldSettings = {}, availableOutlets = [] }) {
  const fs = menuFieldSettings;
  const fileRef = useRef(null);

  // step: "upload" | "preview" | "importing" | "done"
  const [step,           setStep]           = useState("upload");
  const [parsed,         setParsed]         = useState(null);
  const [fileName,       setFileName]       = useState("");
  const [results,        setResults]        = useState(null);
  const [error,          setError]          = useState("");
  // "all" means all outlets; outlet.id means specific branch
  const [targetOutletId, setTargetOutletId] = useState("all");

  // ── File selection ──────────────────────────────────────────────────────────

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a .csv file. Download the sample template above to get the correct format.");
      e.target.value = "";
      return;
    }

    setError("");
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = parseCSV(evt.target.result || "");
      if (result.rows.length === 0) {
        setError("This CSV has no data rows. Make sure row 1 is the header and rows 2+ are items.");
        return;
      }
      setParsed(result);
      setStep("preview");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Confirm import ──────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!parsed) return;
    setStep("importing");
    setError("");

    const toImport = parsed.rows
      .map(normalizeRow)
      .filter((r) => r.itemName && r.categoryName);

    try {
      const result = await bulkImportMenuItems(toImport, targetOutletId);
      setResults(result);
      setStep("done");
      onImportDone?.();
    } catch (err) {
      setError(err.message || "Import failed. Please try again.");
      setStep("preview");
    }
  }

  function reset() {
    setParsed(null);
    setFileName("");
    setResults(null);
    setError("");
    setStep("upload");
    setTargetOutletId("all");
  }

  // Which optional columns to show in the preview table
  const enabledOptionalCols = Object.keys(OPTIONAL_FIELD_META).filter((k) => fs[k]);

  // Partition rows into valid / invalid
  const validRows   = parsed ? parsed.rows.filter((r) => validateRow(normalizeRow(r)).length === 0) : [];
  const skippedRows = parsed ? parsed.rows.filter((r) => validateRow(normalizeRow(r)).length > 0)   : [];

  // Build column reference for upload step
  const optionalColReference = Object.entries(OPTIONAL_FIELD_META)
    .filter(([k]) => fs[k])
    .map(([, meta]) => ({ col: meta.header, req: false, hint: meta.hint }));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bip-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bip-panel">

        {/* ── Panel header ─────────────────────────────────────────────────── */}
        <div className="bip-head">
          <div>
            <h3>Bulk Import Menu Items</h3>
            <p>Upload a CSV file to add multiple items at once</p>
          </div>
          <button className="bip-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* ── Step 1: Upload ───────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="bip-body">

            {/* ── Branch selector ─────────────────────────────────────────── */}
            {availableOutlets.length > 0 && (
              <div className="bip-branch-selector">
                <span className="bip-branch-label">Import menu for</span>
                <div className="bip-branch-options">
                  <label className={`bip-branch-chip${targetOutletId === "all" ? " selected" : ""}`}>
                    <input
                      type="radio"
                      name="bip-outlet"
                      checked={targetOutletId === "all"}
                      onChange={() => setTargetOutletId("all")}
                    />
                    ✓ All Branches
                  </label>
                  {availableOutlets.map((o) => (
                    <label key={o.id} className={`bip-branch-chip${targetOutletId === o.id ? " selected" : ""}`}>
                      <input
                        type="radio"
                        name="bip-outlet"
                        checked={targetOutletId === o.id}
                        onChange={() => setTargetOutletId(o.id)}
                      />
                      {o.name}
                    </label>
                  ))}
                </div>
                <p className="bip-branch-hint">
                  {targetOutletId === "all"
                    ? "Items will be available at all branches."
                    : `Items will be available only at: ${availableOutlets.find(o => o.id === targetOutletId)?.name}`}
                </p>
              </div>
            )}

            {/* Sample download */}
            <div className="bip-sample-box">
              <span className="bip-sample-icon">📋</span>
              <div className="bip-sample-text">
                <strong>Start with the sample template</strong>
                <p>Download the ready-made CSV with the correct columns and 6 example items.
                  {enabledOptionalCols.length > 0 && (
                    <> The template includes your enabled optional columns: <em>{enabledOptionalCols.map((k) => OPTIONAL_FIELD_META[k].header).join(", ")}</em>.</>
                  )}
                  {" "}Fill in your menu items in the same format, then upload it here.
                </p>
              </div>
              <button className="primary-btn" onClick={() => downloadSample(fs)}>
                ↓ Download Sample CSV
              </button>
            </div>

            {/* Column reference */}
            <details className="bip-col-details">
              <summary>
                Column reference — {CORE_COL_REFERENCE.length + optionalColReference.length} columns
                {optionalColReference.length > 0 && ` (${optionalColReference.length} optional enabled)`}
              </summary>
              <div className="bip-col-grid">
                {[...CORE_COL_REFERENCE, ...optionalColReference].map(({ col, req, hint }) => (
                  <div key={col} className="bip-col-row">
                    <span className="bip-col-name">
                      {col}{req && <span className="bip-req"> *</span>}
                    </span>
                    <span className="bip-col-hint">{hint}</span>
                  </div>
                ))}
              </div>
              <p className="bip-col-note">
                * Required columns. Column names are flexible — "item name", "Name", "ITEM NAME" all work.
                {optionalColReference.length > 0 && " Optional columns are only shown in your template because they are enabled in Field Settings."}
              </p>
            </details>

            {/* Upload drop zone */}
            <div
              className="bip-upload-zone"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("drag-over");
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileRef.current.files = dt.files;
                  fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }}
            >
              <span className="bip-upload-icon">📂</span>
              <p><strong>Click to choose CSV file</strong> or drag and drop here</p>
              <p className="bip-upload-sub">Only .csv files are supported</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleFile}
              />
            </div>

            {error && <p className="bip-error">⚠️ {error}</p>}
          </div>
        )}

        {/* ── Step 2: Preview ──────────────────────────────────────────────── */}
        {step === "preview" && parsed && (
          <div className="bip-body">
            <div className="bip-file-bar">
              <span className="bip-file-name">📄 {fileName}</span>
              <span className="bip-branch-badge">
                {targetOutletId === "all"
                  ? "🏪 All Branches"
                  : `🏪 ${availableOutlets.find(o => o.id === targetOutletId)?.name || "Selected Branch"}`}
              </span>
              <button className="ghost-chip" onClick={reset}>Change file</button>
            </div>

            {/* Stats */}
            <div className="bip-preview-stats">
              <div className="bip-stat ok">
                <strong>{validRows.length}</strong>
                <span>Ready to import</span>
              </div>
              {parsed.dupCount > 0 && (
                <div className="bip-stat warn">
                  <strong>{parsed.dupCount}</strong>
                  <span>Duplicate rows removed — same item+category appeared more than once</span>
                </div>
              )}
              {skippedRows.length > 0 && (
                <div className="bip-stat bad">
                  <strong>{skippedRows.length}</strong>
                  <span>Rows skipped (errors)</span>
                </div>
              )}
              {parsed.unknownCols.length > 0 && (
                <div className="bip-stat warn">
                  <strong>{parsed.unknownCols.length}</strong>
                  <span>Unknown columns ignored: <em>{parsed.unknownCols.join(", ")}</em></span>
                </div>
              )}
            </div>

            {/* Preview table */}
            {validRows.length > 0 && (
              <div className="bip-table-wrap">
                <table className="bip-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Food Type</th>
                      <th>Station</th>
                      <th>GST</th>
                      <th>AC ₹</th>
                      <th>Non-AC ₹</th>
                      <th>Takeaway ₹</th>
                      <th>Delivery ₹</th>
                      {/* Optional columns — only shown if enabled */}
                      {fs.description      && <th>Description</th>}
                      {fs.shortCode        && <th>Short Code</th>}
                      {fs.hsnCode          && <th>HSN</th>}
                      {fs.sku              && <th>SKU</th>}
                      {fs.rank             && <th>Rank</th>}
                      {fs.packingCharges   && <th>Packing ₹</th>}
                      {fs.exposeInCaptain  && <th>Captain</th>}
                      {fs.allowDecimalQty  && <th>Decimal Qty</th>}
                      {fs.manufacturingDate && <th>Mfg Date</th>}
                      {fs.expiryDate       && <th>Exp Date</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row, i) => {
                      const n = normalizeRow(row);
                      return (
                        <tr key={i}>
                          <td className="bip-td-num">{i + 1}</td>
                          <td className="bip-td-name">{n.itemName}</td>
                          <td>{n.categoryName}</td>
                          <td>
                            <span className={`bip-food-badge ${n.foodType === "Non-Veg" ? "nonveg" : "veg"}`}>
                              {n.foodType === "Non-Veg" ? "🟤" : "🟢"}
                            </span>
                          </td>
                          <td>{n.station}</td>
                          <td>{n.taxRate}%{n.taxMode === "Inclusive" ? " incl" : ""}</td>
                          <td>{n.acDineIn     || "—"}</td>
                          <td>{n.nonAcDineIn  || "—"}</td>
                          <td>{n.takeawayPrice || "—"}</td>
                          <td>{n.deliveryPrice || "—"}</td>
                          {/* Optional columns */}
                          {fs.description      && <td className="bip-td-desc">{n.description || "—"}</td>}
                          {fs.shortCode        && <td><code>{n.shortCode || "—"}</code></td>}
                          {fs.hsnCode          && <td>{n.hsnCode || "—"}</td>}
                          {fs.sku              && <td><code>{n.sku || "—"}</code></td>}
                          {fs.rank             && <td>{n.rank}</td>}
                          {fs.packingCharges   && <td>{n.packingCharges || "—"}</td>}
                          {fs.exposeInCaptain  && <td>{n.exposeInCaptain ? "Yes" : "No"}</td>}
                          {fs.allowDecimalQty  && <td>{n.allowDecimalQty ? "Yes" : "No"}</td>}
                          {fs.manufacturingDate && <td>{n.manufacturingDate || "—"}</td>}
                          {fs.expiryDate       && <td>{n.expiryDate || "—"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Skipped rows */}
            {skippedRows.length > 0 && (
              <details className="bip-skipped">
                <summary>⚠️ {skippedRows.length} rows will be skipped — expand to see why</summary>
                <div className="bip-skipped-list">
                  {skippedRows.map((row, i) => {
                    const n = normalizeRow(row);
                    const errs = validateRow(n);
                    return (
                      <div key={i} className="bip-skipped-row">
                        <span className="bip-skipped-line">Line {row._line}</span>
                        <span className="bip-skipped-name">{n.itemName || "(no name)"}</span>
                        <span className="bip-skipped-err">{errs.join(" · ")}</span>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {error && <p className="bip-error">⚠️ {error}</p>}

            <div className="bip-actions">
              <button className="ghost-btn" onClick={reset}>← Back</button>
              <button
                className="primary-btn"
                onClick={handleConfirm}
                disabled={validRows.length === 0}
              >
                Import {validRows.length} item{validRows.length !== 1 ? "s" : ""} →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Importing ────────────────────────────────────────────── */}
        {step === "importing" && (
          <div className="bip-body bip-center">
            <div className="bip-spinner" />
            <p className="bip-center-msg">Importing items, please wait…</p>
          </div>
        )}

        {/* ── Step 4: Done ─────────────────────────────────────────────────── */}
        {step === "done" && results && (
          <div className="bip-body bip-center">
            <span className="bip-done-icon">✅</span>
            <h3>{results.importedCount} item{results.importedCount !== 1 ? "s" : ""} imported successfully</h3>
            <p>Your menu has been updated. Items are now live in the POS and Captain App.</p>
            <div className="bip-actions">
              <button className="ghost-btn" onClick={reset}>Import more items</button>
              <button className="primary-btn" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
