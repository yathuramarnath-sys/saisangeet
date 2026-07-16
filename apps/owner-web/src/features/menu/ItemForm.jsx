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
  nextScalePlu           = null, // auto-assign next PLU for weight scale items
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
  const grid2 = "item-form-grid2";
  const grid3 = "item-form-grid3";

  return (
    <form className="simple-form" onSubmit={onSubmit}>

      {/* ── Section 1: Basic Info ──────────────────────────────────────── */}
      <div className={grid2}>
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
          <select value={draft.unit || ""} onChange={e => {
            const newUnit = e.target.value;
            f("unit", newUnit);
            // Auto-assign Scale PLU when switching to a weight unit and none set yet
            if (["KG", "G"].includes(newUnit) && !draft.scalePlu && nextScalePlu !== null) {
              f("scalePlu", String(nextScalePlu));
            }
            // Clear Scale PLU when switching away from weight unit
            if (!["KG", "G"].includes(newUnit) && draft.scalePlu) {
              f("scalePlu", "");
            }
            // Weight/volume units always need decimal qty support
            if (["KG", "G", "LTR", "ML"].includes(newUnit)) {
              f("allowDecimalQty", true);
            } else {
              f("allowDecimalQty", false);
            }
          }}>
            <option value="">— Per piece —</option>
            <option value="KG">KG — per kilogram</option>
            <option value="LTR">LTR — per litre</option>
            <option value="G">G — per gram</option>
            <option value="ML">ML — per millilitre</option>
          </select>
        </label>
        {/* Scale PLU — shown only for weight (KG/G) items */}
        {["KG", "G"].includes(draft.unit) && (
          <label>
            Scale PLU
            <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 11, marginLeft: 4 }}>
              5-digit code for weighing scale
            </span>
            <input
              type="number" min="1" step="1"
              value={draft.scalePlu || ""}
              onChange={e => f("scalePlu", e.target.value)}
              placeholder="Auto-assigned"
            />
          </label>
        )}
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

        <div className={grid2}>
          <label>
            Base dine-in price (₹) *
            <input
              type="number" min="0" step="0.01"
              value={draft.basePrice ?? "0"}
              onChange={e => f("basePrice", e.target.value)}
              placeholder="0"
              required
            />
            {(Number(draft.basePrice) === 0 || draft.basePrice === "" || draft.basePrice === "0") && (
              <span style={{ color: "#f59e0b", fontSize: 11, marginTop: 2, display: "block" }}>
                ⚠ Price is ₹0 — item will sell for free on POS
              </span>
            )}
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
            <div className="item-form-grid3">
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

        {/* Area availability — restrict which work areas can sell this item */}
        {availableAreas.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 8px" }}>
              Available in areas — choose which counters can sell this item
            </p>
            <div className="menu-outlet-avail-options">
              <label className={`menu-outlet-chip${!(draft.selectedAreas?.length) ? " selected" : ""}`}>
                <input type="radio" name="itemAreaScope" checked={!(draft.selectedAreas?.length)}
                  onChange={() => f("selectedAreas", [])} />
                <span>✓ All areas</span>
              </label>
              {availableAreas.map(area => {
                const checked = (draft.selectedAreas || []).includes(area);
                return (
                  <label key={area} className={`menu-outlet-chip${checked ? " selected" : ""}`}>
                    <input type="checkbox" checked={checked}
                      onChange={e => {
                        const cur = draft.selectedAreas || [];
                        f("selectedAreas", e.target.checked ? [...cur, area] : cur.filter(a => a !== area));
                      }} />
                    <span>{area}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: Packing Charges ───────────────────────────────── */}
      <div style={sectionStyle}>
        <p style={sectionTitle}>📦 Packing Charges (added on top of base price)</p>
        <div className={grid2}>
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
        <div className={grid2}>
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

      {/* ── Section 4b: Low stock alert threshold ─────────────────── */}
      <div style={sectionStyle}>
        <p style={sectionTitle}>📦 Stock Alert</p>
        <label>
          Low stock alert level
          <input
            type="number"
            min="0"
            placeholder="e.g. 10 — POS shows 'Low' badge below this count. Leave 0 to disable."
            value={draft.lowStockLevel ?? ""}
            onChange={e => f("lowStockLevel", e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
        <p style={{ margin:"4px 0 0", fontSize:"0.78rem", color:"#6b7280" }}>
          Cashier sees an orange "Low" badge on this item when stock falls to or below this number.
          Set to 0 to disable the alert.
        </p>
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
            <div className={grid2}>
              {fs.shortCode && (
                <label>
                  Short code (KOT)
                  <input type="text" maxLength={8}
                    value={draft.shortCode || ""}
                    onChange={e => f("shortCode", e.target.value.toUpperCase())}
                    placeholder="e.g. PBM"
                  />
                  <p style={{ margin:"4px 0 0", fontSize:"0.78rem", color:"#6b7280" }}>
                    Short abbreviation printed on the kitchen ticket (KOT) instead of the full name.
                  </p>
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
                  Item # (SKU / Barcode)
                  <input type="text"
                    value={draft.sku || ""}
                    onChange={e => f("sku", e.target.value)}
                    placeholder="Scan or type"
                  />
                  <p style={{ margin:"4px 0 0", fontSize:"0.78rem", color:"#6b7280" }}>
                    The number staff type or scan at billing to find this item. Auto-assigned if left blank.
                  </p>
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
                  <p style={{ margin:"4px 0 0", fontSize:"0.78rem", color:"#6b7280" }}>
                    Sort order within the category on the POS grid and Captain App — lower shows first. Not used for billing search.
                  </p>
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
