/**
 * ItemForm — shared form for Add Item and Edit Item (inline accordion).
 *
 * Pricing model:
 *   basePrice           → default dine-in price for ALL areas
 *   areaOverrides       → { "Rooftop": "200" } — only areas that differ from base
 *   onlinePrice         → Zomato / Swiggy price
 *   takeawayPackingCharge / deliveryPackingCharge → ₹ added per item on top of basePrice
 *
 * Removed: taxMode, entryStyle, takeawayPrice, deliveryPrice,
 *          takeawayParcelChargeType/Value, deliveryParcelChargeType/Value
 */

export function ItemForm({
  mode = "create",
  draft,
  onChange,
  onSubmit,
  onCancel,
  menuFieldSettings  = {},
  availableCategoryNames = [],
  availableStationNames  = [],
  availableOutlets       = [],
  availableAreas         = [],   // dynamic work areas from Table Setup
  saveMessage = "",
  saveError   = "",
}) {
  const isEdit = mode === "edit";
  const fs     = menuFieldSettings;
  const f      = (key, val) => onChange(key, val);

  const sectionStyle = {
    borderTop: "1px solid #f3f4f6",
    paddingTop: 14,
    marginTop: 14,
  };
  const sectionTitle = {
    fontSize: 12,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 10,
  };
  const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
  const grid3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 };

  return (
    <form className="simple-form" onSubmit={onSubmit}>

      {/* ── Section 1: Basic Info ──────────────────────────────────────── */}
      <div style={grid2}>
        <label>
          Item name *
          <input
            type="text"
            value={draft.itemName || ""}
            onChange={e => f("itemName", e.target.value)}
            placeholder="e.g. Paneer Butter Masala"
            required
          />
        </label>
        <label>
          Category *
          <input
            type="text"
            list="item-form-category-options"
            value={draft.categoryName || ""}
            onChange={e => f("categoryName", e.target.value)}
            placeholder="Choose or type a category"
            required
          />
          <datalist id="item-form-category-options">
            {availableCategoryNames.map(c => <option key={c} value={c} />)}
          </datalist>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isEdit ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12 }}>
        <label>
          Food type
          <select value={draft.foodType || "Veg"} onChange={e => f("foodType", e.target.value)}>
            <option>Veg</option>
            <option>Non-Veg</option>
            <option>Egg</option>
          </select>
        </label>
        <label>
          Sold by
          <select value={draft.unit || ""} onChange={e => f("unit", e.target.value)}>
            <option value="">— Per piece —</option>
            <option value="KG">KG — per kilogram</option>
            <option value="LTR">LTR — per litre</option>
            <option value="G">G — per gram</option>
            <option value="ML">ML — per millilitre</option>
          </select>
        </label>
        {isEdit && (
          <label>
            Kitchen station
            <select value={draft.station || ""} onChange={e => f("station", e.target.value)}>
              <option value="">— Not assigned —</option>
              {availableStationNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* ── Section 2: Pricing ────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <p style={sectionTitle}>💰 Pricing</p>

        <div style={grid2}>
          <label>
            Base dine-in price (₹) *
            <input
              type="number" min="0" step="0.01"
              value={draft.basePrice ?? "0"}
              onChange={e => f("basePrice", e.target.value)}
              placeholder="0"
              required
            />
          </label>
          <label>
            Online price (₹)
            <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 11, marginLeft: 4 }}>
              Zomato / Swiggy
            </span>
            <input
              type="number" min="0" step="0.01"
              value={draft.onlinePrice ?? "0"}
              onChange={e => f("onlinePrice", e.target.value)}
              placeholder="0 = same as base"
            />
          </label>
        </div>

        {/* Area overrides — only if restaurant has multiple work areas */}
        {availableAreas.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 8px" }}>
              Area price overrides — leave 0 to use base price above
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(availableAreas.length, 3)}, 1fr)`,
              gap: 10,
            }}>
              {availableAreas.map(area => (
                <label key={area}>
                  {area} (₹)
                  <input
                    type="number" min="0" step="0.01"
                    value={draft.areaOverrides?.[area] ?? "0"}
                    onChange={e => f("areaOverrides", {
                      ...(draft.areaOverrides || {}),
                      [area]: e.target.value,
                    })}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: Packing Charges ───────────────────────────────── */}
      <div style={sectionStyle}>
        <p style={sectionTitle}>📦 Packing Charges (added on top of base price)</p>
        <div style={grid2}>
          <label>
            Takeaway packing charge (₹ / item)
            <input
              type="number" min="0" step="0.01"
              value={draft.takeawayPackingCharge ?? "0"}
              onChange={e => f("takeawayPackingCharge", e.target.value)}
            />
          </label>
          <label>
            Delivery packing charge (₹ / item)
            <input
              type="number" min="0" step="0.01"
              value={draft.deliveryPackingCharge ?? "0"}
              onChange={e => f("deliveryPackingCharge", e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* ── Section 4: Tax & Availability ────────────────────────────── */}
      <div style={sectionStyle}>
        <p style={sectionTitle}>🧾 Tax &amp; Availability</p>
        <div style={grid2}>
          <label>
            GST rate
            <select
              value={String(draft.taxRate ?? "5")}
              onChange={e => f("taxRate", e.target.value)}
            >
              <option value="0">0% — Exempt items</option>
              <option value="5">5% — Most food items</option>
              <option value="12">12%</option>
              <option value="18">18% — AC restaurants</option>
              <option value="28">28%</option>
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label>
              Available from
              <input type="time"
                value={draft.availableFrom || ""}
                onChange={e => f("availableFrom", e.target.value)}
              />
            </label>
            <label>
              To
              <input type="time"
                value={draft.availableTo || ""}
                onChange={e => f("availableTo", e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      {/* ── Section 5: Optional Fields ───────────────────────────────── */}
      {(fs.description || fs.shortCode || fs.hsnCode || fs.sku ||
        fs.rank || fs.exposeInCaptain || fs.allowDecimalQty ||
        fs.manufacturingDate || fs.expiryDate) && (
        <div style={sectionStyle}>
          <p style={sectionTitle}>⚙️ Optional Fields</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {fs.description && (
              <label>
                Description
                <textarea rows={2}
                  value={draft.description || ""}
                  onChange={e => f("description", e.target.value)}
                  placeholder="Brief item description…"
                />
              </label>
            )}
            <div style={grid2}>
              {fs.shortCode && (
                <label>
                  Short code (KOT)
                  <input type="text" maxLength={8}
                    value={draft.shortCode || ""}
                    onChange={e => f("shortCode", e.target.value.toUpperCase())}
                    placeholder="e.g. PBM"
                  />
                </label>
              )}
              {fs.hsnCode && (
                <label>
                  HSN / SAC code
                  <input type="text"
                    value={draft.hsnCode || ""}
                    onChange={e => f("hsnCode", e.target.value)}
                    placeholder="e.g. 9963"
                  />
                </label>
              )}
              {fs.sku && (
                <label>
                  SKU / Barcode
                  <input type="text"
                    value={draft.sku || ""}
                    onChange={e => f("sku", e.target.value)}
                    placeholder="Scan or type"
                  />
                </label>
              )}
              {fs.rank && (
                <label>
                  Rank (display order)
                  <input type="number" min="1"
                    value={draft.rank ?? "999"}
                    onChange={e => f("rank", e.target.value)}
                    placeholder="1 = first"
                  />
                </label>
              )}
              {fs.exposeInCaptain && (
                <label>
                  Visible in Captain App
                  <select
                    value={String(draft.exposeInCaptain ?? "true")}
                    onChange={e => f("exposeInCaptain", e.target.value === "true")}
                  >
                    <option value="true">Yes — show in Captain App</option>
                    <option value="false">No — hide from Captain App</option>
                  </select>
                </label>
              )}
              {fs.allowDecimalQty && (
                <label>
                  Decimal quantity
                  <select
                    value={String(draft.allowDecimalQty ?? "false")}
                    onChange={e => f("allowDecimalQty", e.target.value === "true")}
                  >
                    <option value="false">No — whole numbers only</option>
                    <option value="true">Yes — allow 0.5, 1.5 etc.</option>
                  </select>
                </label>
              )}
              {fs.manufacturingDate && (
                <label>
                  Manufacturing date
                  <input type="date"
                    value={draft.manufacturingDate || ""}
                    onChange={e => f("manufacturingDate", e.target.value)}
                  />
                </label>
              )}
              {fs.expiryDate && (
                <label>
                  Expiry date
                  <input type="date"
                    value={draft.expiryDate || ""}
                    onChange={e => f("expiryDate", e.target.value)}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Outlet availability (create mode only) ───────────────────── */}
      {!isEdit && availableOutlets.length > 0 && (
        <div style={sectionStyle}>
          <div className="menu-outlet-avail">
            <span className="menu-outlet-avail-label">Available at branches</span>
            <div className="menu-outlet-avail-options">
              <label className={`menu-outlet-chip${!(draft.selectedOutlets?.length) ? " selected" : ""}`}>
                <input
                  type="radio" name="outletScope"
                  checked={!(draft.selectedOutlets?.length)}
                  onChange={() => f("selectedOutlets", [])}
                />
                <span>✓ All branches</span>
              </label>
              {availableOutlets.map(outlet => {
                const checked = (draft.selectedOutlets || []).includes(outlet.name);
                return (
                  <label key={outlet.id || outlet.name}
                    className={`menu-outlet-chip${checked ? " selected" : ""}`}>
                    <input
                      type="checkbox" checked={checked}
                      onChange={e => {
                        const cur = draft.selectedOutlets || [];
                        f("selectedOutlets", e.target.checked
                          ? [...cur, outlet.name]
                          : cur.filter(n => n !== outlet.name));
                      }}
                    />
                    <span>{outlet.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback + Actions ───────────────────────────────────────── */}
      {saveMessage && <p className="form-success">{saveMessage}</p>}
      {saveError   && <p className="form-error">{saveError}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="submit" className="btn-primary" style={{ flex: 1 }}>
          {isEdit ? "Save Changes" : "Save Item"}
        </button>
        {isEdit && (
          <button type="button" className="shift-filter-tab" onClick={onCancel}
            style={{ fontWeight: 600 }}>
            Cancel
          </button>
        )}
      </div>

    </form>
  );
}
