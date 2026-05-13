import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

/**
 * AdvanceOrderModal — create OR edit an advance booking.
 *
 * Props
 *   outlet      {id, name}   — connected outlet
 *   menuItems   [{id, name, price, categoryName}]  — loaded menu
 *   editOrder   object|null  — if set, modal opens in edit mode
 *   onClose     ()
 *   onSaved     (order)
 */
export function AdvanceOrderModal({ outlet, menuItems = [], editOrder = null, onClose, onSaved }) {
  const outletId   = outlet?.id   || "unknown";
  const outletName = outlet?.name || "This Outlet";
  const isEdit     = !!editOrder;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name,           setName]           = useState(editOrder?.customerName  || "");
  const [phone,          setPhone]          = useState(editOrder?.phone         || "");
  const [guests,         setGuests]         = useState(String(editOrder?.guests || 2));
  const [date,           setDate]           = useState(editOrder?.date          || defaultDate);
  const [time,           setTime]           = useState(editOrder?.time          || "13:00");
  const [note,           setNote]           = useState(editOrder?.note          || "");
  const [orderType,      setOrderType]      = useState(editOrder?.orderType      || "dine-in");
  const [orderItems,     setOrderItems]     = useState(editOrder?.items         || []);
  const [advAmt,         setAdvAmt]         = useState(String(editOrder?.advanceAmount || ""));
  const [advMethod,      setAdvMethod]      = useState(editOrder?.advanceMethod || "");
  const [advRef,         setAdvRef]         = useState(editOrder?.advanceRef    || "");

  // ── Item picker state ───────────────────────────────────────────────────────
  const [itemSearch,     setItemSearch]     = useState("");
  const [showItemPicker, setShowItemPicker] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [errors,   setErrors]   = useState({});
  const [saving,   setSaving]   = useState(false);
  const searchRef  = useRef(null);

  useEffect(() => {
    if (showItemPicker) setTimeout(() => searchRef.current?.focus(), 50);
  }, [showItemPicker]);

  // ── Filtered menu for picker ────────────────────────────────────────────────
  const filteredMenu = menuItems.filter((m) =>
    !itemSearch || m.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  // ── Item management ─────────────────────────────────────────────────────────
  function addItem(menuItem) {
    setOrderItems((prev) => {
      const existing = prev.findIndex((i) => i.menuItemId === menuItem.id);
      if (existing !== -1) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return updated;
      }
      return [...prev, {
        menuItemId: menuItem.id,
        name:       menuItem.name,
        price:      menuItem.price || menuItem.basePrice || 0,
        quantity:   1,
      }];
    });
    setItemSearch("");
  }

  function updateQty(menuItemId, delta) {
    setOrderItems((prev) => {
      const updated = prev
        .map((i) => i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0);
      return updated;
    });
  }

  function removeItem(menuItemId) {
    setOrderItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const itemsTotal  = orderItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const advanceAmt  = Number(advAmt) || 0;
  const balanceDue  = Math.max(0, itemsTotal - advanceAmt);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!name.trim())  e.name  = "Required";
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) e.phone = "Valid 10-digit number required";
    if (!date)         e.date  = "Required";
    return e;
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    setSaving(true);
    try {
      const payload = {
        outletId,
        customerName:  name.trim(),
        phone:         phone.trim(),
        guests:        Number(guests) || 1,
        date,
        time,
        note:          note.trim(),
        orderType,
        items:         orderItems,
        advanceAmount: advanceAmt,
        advanceMethod: advMethod,
        advanceRef:    advRef.trim(),
      };

      let saved;
      if (isEdit) {
        const res = await api.patch(`/advance-orders/${editOrder.id}`, payload);
        saved = res.order;
      } else {
        const res = await api.post("/advance-orders", payload);
        saved = res.order;
      }

      onSaved?.(saved);
      onClose();
    } catch (err) {
      setErrors({ general: err.message || "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const fmtPrice = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  return (
    <div className="adv-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adv-modal adv-modal-wide">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="adv-head">
          <div>
            <h3>{isEdit ? "✏️ Edit Advance Order" : "📅 New Advance Order"}</h3>
            <p>{isEdit ? `Editing booking for ${editOrder.customerName}` : `New booking at ${outletName}`}</p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="adv-body adv-body-scroll">

          {errors.general && (
            <div className="adv-error-banner">{errors.general}</div>
          )}

          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="adv-two-col">
            <div className="adv-col-left">

              {/* Customer Info */}
              <div className="adv-section-label">Customer Details</div>
              <div className="adv-row-2">
                <div className="adv-field">
                  <label>Name <span className="adv-req">*</span></label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    className={errors.name ? "error" : ""}
                    onChange={(e) => { setName(e.target.value); setErrors((v) => ({ ...v, name: "" })); }}
                  />
                  {errors.name && <span className="adv-err">{errors.name}</span>}
                </div>
                <div className="adv-field">
                  <label>Phone <span className="adv-req">*</span></label>
                  <input
                    type="tel"
                    placeholder="10-digit number"
                    value={phone}
                    maxLength={10}
                    className={errors.phone ? "error" : ""}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "")); setErrors((v) => ({ ...v, phone: "" })); }}
                  />
                  {errors.phone && <span className="adv-err">{errors.phone}</span>}
                </div>
              </div>

              {/* Booking Details */}
              <div className="adv-section-label">Booking Details</div>

              {/* Order Type */}
              <div className="adv-order-type-row">
                {[
                  { id: "dine-in",  icon: "🪑", label: "Dine-In"  },
                  { id: "takeaway", icon: "🛍️", label: "Takeaway" },
                  { id: "delivery", icon: "🛵", label: "Delivery" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`adv-otype-btn${orderType === t.id ? " active" : ""}`}
                    onClick={() => setOrderType(t.id)}
                  >
                    <span className="adv-otype-icon">{t.icon}</span>
                    <span className="adv-otype-label">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="adv-row-3">
                <div className="adv-field">
                  <label>Date <span className="adv-req">*</span></label>
                  <input
                    type="date"
                    value={date}
                    min={new Date().toISOString().slice(0, 10)}
                    className={errors.date ? "error" : ""}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  {date && <span className="adv-hint">{fmtDate(date)}</span>}
                  {errors.date && <span className="adv-err">{errors.date}</span>}
                </div>
                <div className="adv-field">
                  <label>Arrival Time</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <div className="adv-field">
                  <label>Guests (Pax)</label>
                  <input
                    type="number" min="1" max="500" value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                  />
                </div>
              </div>

              {/* Special Instructions */}
              <div className="adv-field">
                <label>Special Instructions</label>
                <textarea
                  placeholder="Dietary needs, occasion, seating preference, allergies…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Advance Payment */}
              <div className="adv-section-label">Advance Payment <span className="adv-optional">(optional)</span></div>
              <div className="adv-row-2">
                <div className="adv-field">
                  <label>Amount Collected (₹)</label>
                  <input
                    type="number" min="0" placeholder="0"
                    value={advAmt}
                    onChange={(e) => setAdvAmt(e.target.value)}
                  />
                </div>
                <div className="adv-field">
                  <label>Payment Mode</label>
                  <select value={advMethod} onChange={(e) => setAdvMethod(e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="upi">UPI</option>
                  </select>
                </div>
              </div>
              {advMethod && advMethod !== "cash" && (
                <div className="adv-field">
                  <label>Reference / UTR</label>
                  <input
                    type="text" placeholder="Transaction reference"
                    value={advRef}
                    onChange={(e) => setAdvRef(e.target.value)}
                  />
                </div>
              )}

              {/* Summary strip */}
              {orderItems.length > 0 && (
                <div className="adv-summary-strip">
                  <div className="adv-sum-row">
                    <span>Items Total</span>
                    <strong>{fmtPrice(itemsTotal)}</strong>
                  </div>
                  {advanceAmt > 0 && (
                    <div className="adv-sum-row adv-sum-advance">
                      <span>Advance Paid</span>
                      <strong>− {fmtPrice(advanceAmt)}</strong>
                    </div>
                  )}
                  {advanceAmt > 0 && (
                    <div className="adv-sum-row adv-sum-balance">
                      <span>Balance Due on Arrival</span>
                      <strong>{fmtPrice(balanceDue)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Right column — Item picker ──────────────────────────────── */}
            <div className="adv-col-right">
              <div className="adv-section-label">
                Pre-Order Items
                <span className="adv-optional"> — optional, add what the customer wants</span>
              </div>

              {/* Item search */}
              <div className="adv-item-search-wrap">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  ref={searchRef}
                  type="search"
                  className="adv-item-search"
                  placeholder="Search menu to add items…"
                  value={itemSearch}
                  onChange={(e) => { setItemSearch(e.target.value); setShowItemPicker(true); }}
                  onFocus={() => setShowItemPicker(true)}
                />
              </div>

              {/* Dropdown suggestions */}
              {showItemPicker && itemSearch && filteredMenu.length > 0 && (
                <div className="adv-item-dropdown">
                  {filteredMenu.slice(0, 10).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="adv-item-suggestion"
                      onMouseDown={() => { addItem(m); setShowItemPicker(false); }}
                    >
                      <span className="adv-sug-name">{m.name}</span>
                      <span className="adv-sug-price">₹{m.price || m.basePrice || 0}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected items list */}
              {orderItems.length === 0 ? (
                <div className="adv-items-empty">
                  <p>No items added yet.</p>
                  <p>Search above to pre-order menu items for this booking.</p>
                </div>
              ) : (
                <div className="adv-items-list">
                  {orderItems.map((item) => (
                    <div key={item.menuItemId} className="adv-item-row">
                      <div className="adv-item-row-name">
                        <span className="adv-ir-name">{item.name}</span>
                        <span className="adv-ir-price">₹{item.price} × {item.quantity} = {fmtPrice(item.price * item.quantity)}</span>
                      </div>
                      <div className="adv-item-row-controls">
                        <button type="button" className="adv-qty-btn" onClick={() => updateQty(item.menuItemId, -1)}>−</button>
                        <span className="adv-qty-val">{item.quantity}</span>
                        <button type="button" className="adv-qty-btn" onClick={() => updateQty(item.menuItemId, +1)}>+</button>
                        <button type="button" className="adv-remove-btn" onClick={() => removeItem(item.menuItemId)}>✕</button>
                      </div>
                    </div>
                  ))}
                  <div className="adv-items-total">
                    <span>Total</span>
                    <strong>{fmtPrice(itemsTotal)}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="adv-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="adv-save-btn"
            disabled={!name || !phone || saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : isEdit ? "✓ Save Changes" : "📅 Book Advance Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
