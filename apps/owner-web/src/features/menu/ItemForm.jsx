/**
 * ItemForm — shared controlled form for Add Item (Quick Create) and Edit Item.
 *
 * Props:
 *  mode                 "create" | "edit"
 *  draft                current field values object
 *  onChange             (key, value) => void
 *  onSubmit             (event) => void
 *  onCancel             () => void  (edit only)
 *  menuFieldSettings    { description, shortCode, hsnCode, sku, rank,
 *                         packingCharges, exposeInCaptain, allowDecimalQty,
 *                         manufacturingDate, expiryDate }
 *  availableCategoryNames  string[]
 *  availableStationNames   string[]
 *  availableOutlets        outlet[]   (create only)
 *  saveMessage          string
 *  saveError            string
 */

export function ItemForm({
  mode = "create",
  draft,
  onChange,
  onSubmit,
  onCancel,
  menuFieldSettings = {},
  availableCategoryNames = [],
  availableStationNames  = [],
  availableOutlets       = [],
  saveMessage = "",
  saveError   = "",
}) {
  const isEdit = mode === "edit";
  const fs = menuFieldSettings; // shorthand

  function field(key, value) {
    onChange(key, value);
  }

  return (
    <form className="simple-form" onSubmit={onSubmit}>

      {/* ── Core fields — always shown ─────────────────────────────────── */}
      <label>
        Item name
        <input
          type="text"
          name="itemName"
          value={draft.itemName || ""}
          onChange={(e) => field("itemName", e.target.value)}
          placeholder="e.g. Paneer Butter Masala"
          required
        />
      </label>

      <label>
        Category
        <input
          type="text"
          name="categoryName"
          list="item-form-category-options"
          value={draft.categoryName || ""}
          onChange={(e) => field("categoryName", e.target.value)}
          placeholder="Choose or type a category"
          required
        />
      </label>
      <datalist id="item-form-category-options">
        {availableCategoryNames.map((cat) => (
          <option key={cat} value={cat} />
        ))}
      </datalist>

      {isEdit && (
        <label>
          Kitchen station
          <select
            name="station"
            value={draft.station || ""}
            onChange={(e) => field("station", e.target.value)}
          >
            {availableStationNames.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      )}

      <label>
        Food type
        <select
          name="foodType"
          value={draft.foodType || "Veg"}
          onChange={(e) => field("foodType", e.target.value)}
        >
          <option>Veg</option>
          <option>Non-Veg</option>
        </select>
      </label>

      <label>
        Sold by (Unit)
        <select
          name="unit"
          value={draft.unit || ""}
          onChange={(e) => field("unit", e.target.value)}
        >
          <option value="">— Not set —</option>
          <option value="PCS">PCS — Per piece</option>
          <option value="KG">KG — Per kilogram</option>
          <option value="LTR">LTR — Per litre</option>
          <option value="G">G — Per gram</option>
          <option value="ML">ML — Per millilitre</option>
        </select>
      </label>

      <label>
        AC dine-in price
        <input type="number" name="acDineIn" min="0" step="0.01"
          value={draft.acDineIn ?? "0"}
          onChange={(e) => field("acDineIn", e.target.value)} required />
      </label>
      <label>
        Non-AC dine-in price
        <input type="number" name="nonAcDineIn" min="0" step="0.01"
          value={draft.nonAcDineIn ?? "0"}
          onChange={(e) => field("nonAcDineIn", e.target.value)} required />
      </label>
      <label>
        Self service dine-in price
        <input type="number" name="selfDineIn" min="0" step="0.01"
          value={draft.selfDineIn ?? "0"}
          onChange={(e) => field("selfDineIn", e.target.value)} required />
      </label>
      <label>
        Takeaway price
        <input type="number" name="takeawayPrice" min="0" step="0.01"
          value={draft.takeawayPrice ?? "0"}
          onChange={(e) => field("takeawayPrice", e.target.value)} required />
      </label>
      <label>
        Delivery price
        <input type="number" name="deliveryPrice" min="0" step="0.01"
          value={draft.deliveryPrice ?? "0"}
          onChange={(e) => field("deliveryPrice", e.target.value)} required />
      </label>

      <label>
        Tax mode
        <select name="taxMode"
          value={draft.taxMode || "Exclusive"}
          onChange={(e) => field("taxMode", e.target.value)}>
          <option>Inclusive</option>
          <option>Exclusive</option>
        </select>
      </label>
      <label>
        Tax rate (%)
        <input type="number" name="taxRate" min="0" step="0.01"
          value={draft.taxRate ?? "5"}
          onChange={(e) => field("taxRate", e.target.value)} required />
      </label>

      <label>
        Takeaway parcel charge
        <select name="takeawayParcelChargeType"
          value={draft.takeawayParcelChargeType || "None"}
          onChange={(e) => field("takeawayParcelChargeType", e.target.value)}>
          <option>None</option>
          <option>Fixed</option>
          <option>Percentage</option>
        </select>
      </label>
      <label>
        Takeaway parcel charge value
        <input type="number" name="takeawayParcelChargeValue" min="0"
          value={draft.takeawayParcelChargeValue ?? "0"}
          onChange={(e) => field("takeawayParcelChargeValue", e.target.value)} />
      </label>
      <label>
        Delivery parcel charge
        <select name="deliveryParcelChargeType"
          value={draft.deliveryParcelChargeType || "None"}
          onChange={(e) => field("deliveryParcelChargeType", e.target.value)}>
          <option>None</option>
          <option>Fixed</option>
          <option>Percentage</option>
        </select>
      </label>
      <label>
        Delivery parcel charge value
        <input type="number" name="deliveryParcelChargeValue" min="0"
          value={draft.deliveryParcelChargeValue ?? "0"}
          onChange={(e) => field("deliveryParcelChargeValue", e.target.value)} />
      </label>

      <label>
        Available from
        <input type="time" name="availableFrom"
          value={draft.availableFrom || ""}
          onChange={(e) => field("availableFrom", e.target.value)} />
      </label>
      <label>
        Available to
        <input type="time" name="availableTo"
          value={draft.availableTo || ""}
          onChange={(e) => field("availableTo", e.target.value)} />
      </label>

      <label>
        Track inventory
        <select name="trackInventory"
          value={draft.trackInventory || "Disabled"}
          onChange={(e) => field("trackInventory", e.target.value)}>
          <option>Enabled</option>
          <option>Disabled</option>
        </select>
      </label>
      <label>
        Entry style
        <select name="entryStyle"
          value={draft.entryStyle || "Optional later"}
          onChange={(e) => field("entryStyle", e.target.value)}>
          <option>Item wise</option>
          <option>Category wise</option>
          <option>Optional later</option>
        </select>
      </label>

      {/* ── Optional fields — shown only if owner enabled them ────────── */}
      {fs.description && (
        <label>
          Description
          <textarea
            name="description"
            rows={2}
            value={draft.description || ""}
            onChange={(e) => field("description", e.target.value)}
            placeholder="Brief description of the item…"
          />
        </label>
      )}

      {fs.shortCode && (
        <label>
          Short Code
          <input type="text" name="shortCode" maxLength={8}
            value={draft.shortCode || ""}
            onChange={(e) => field("shortCode", e.target.value.toUpperCase())}
            placeholder="e.g. PNT" />
        </label>
      )}

      {fs.hsnCode && (
        <label>
          HSN / SAC Code
          <input type="text" name="hsnCode"
            value={draft.hsnCode || ""}
            onChange={(e) => field("hsnCode", e.target.value)}
            placeholder="e.g. 9963" />
        </label>
      )}

      {fs.sku && (
        <label>
          SKU / Barcode
          <input type="text" name="sku"
            value={draft.sku || ""}
            onChange={(e) => field("sku", e.target.value)}
            placeholder="Scan or type barcode" />
        </label>
      )}

      {fs.rank && (
        <label>
          Rank (display order)
          <input type="number" name="rank" min="1"
            value={draft.rank ?? "999"}
            onChange={(e) => field("rank", e.target.value)}
            placeholder="1 = shown first" />
        </label>
      )}

      {fs.packingCharges && (
        <label>
          Packing charges (₹ per item)
          <input type="number" name="packingCharges" min="0" step="0.01"
            value={draft.packingCharges ?? "0"}
            onChange={(e) => field("packingCharges", e.target.value)} />
        </label>
      )}

      {fs.exposeInCaptain && (
        <label>
          Visible in Captain App
          <select name="exposeInCaptain"
            value={String(draft.exposeInCaptain ?? "true")}
            onChange={(e) => field("exposeInCaptain", e.target.value === "true")}>
            <option value="true">Yes — show in Captain App</option>
            <option value="false">No — hide from Captain App</option>
          </select>
        </label>
      )}

      {fs.allowDecimalQty && (
        <label>
          Allow decimal quantity
          <select name="allowDecimalQty"
            value={String(draft.allowDecimalQty ?? "false")}
            onChange={(e) => field("allowDecimalQty", e.target.value === "true")}>
            <option value="false">No — whole numbers only</option>
            <option value="true">Yes — allow 0.5, 1.5 etc.</option>
          </select>
        </label>
      )}

      {fs.manufacturingDate && (
        <label>
          Manufacturing date
          <input type="date" name="manufacturingDate"
            value={draft.manufacturingDate || ""}
            onChange={(e) => field("manufacturingDate", e.target.value)} />
        </label>
      )}

      {fs.expiryDate && (
        <label>
          Expiry date
          <input type="date" name="expiryDate"
            value={draft.expiryDate || ""}
            onChange={(e) => field("expiryDate", e.target.value)} />
        </label>
      )}

      {/* ── Outlet availability (create mode only) ────────────────────── */}
      {!isEdit && availableOutlets.length > 0 && (
        <div className="menu-outlet-avail">
          <span className="menu-outlet-avail-label">Available at outlets</span>
          <div className="menu-outlet-avail-options">
            <label className={`menu-outlet-chip${!(draft.selectedOutlets?.length) ? " selected" : ""}`}>
              <input
                type="radio"
                name="outletScope"
                checked={!(draft.selectedOutlets?.length)}
                onChange={() => field("selectedOutlets", [])}
              />
              <span>✓ All outlets</span>
            </label>
            {availableOutlets.map((outlet) => {
              const checked = (draft.selectedOutlets || []).includes(outlet.name);
              return (
                <label key={outlet.id || outlet.name} className={`menu-outlet-chip${checked ? " selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const cur  = draft.selectedOutlets || [];
                      const next = e.target.checked
                        ? [...cur, outlet.name]
                        : cur.filter((n) => n !== outlet.name);
                      field("selectedOutlets", next);
                    }}
                  />
                  <span>{outlet.name}</span>
                </label>
              );
            })}
          </div>
          <p className="menu-outlet-avail-hint">
            {!(draft.selectedOutlets?.length)
              ? "This item will be available at all outlets."
              : `Available at: ${(draft.selectedOutlets || []).join(", ") || "none selected"}`}
          </p>
        </div>
      )}

      {/* ── Feedback + Actions ────────────────────────────────────────── */}
      {saveMessage && <p className="form-success">{saveMessage}</p>}
      {saveError   && <p className="form-error">{saveError}</p>}

      <div className={isEdit ? "entity-actions" : ""}>
        <button type="submit" className={isEdit ? "primary-btn" : "primary-btn full-width"}>
          {isEdit ? "Save Changes" : "Save Item"}
        </button>
        {isEdit && (
          <button type="button" className="secondary-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

    </form>
  );
}
