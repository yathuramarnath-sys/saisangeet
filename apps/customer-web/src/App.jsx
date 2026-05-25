import { useEffect, useState, useCallback } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1";

function get(url) { return fetch(API + url).then(r => r.json()); }
function post(url, body) {
  return fetch(API + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Request failed");
    return data;
  });
}

// ── URL params ────────────────────────────────────────────────────────────────
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    outletId:   p.get("o")  || "",
    tableId:    p.get("t")  || "",
    tableLabel: p.get("tl") || p.get("t") || "",
    tenantId:   p.get("tid") || "",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return `₹${Number(n || 0).toFixed(0)}`; }

function VegDot({ isVeg }) {
  if (isVeg === undefined) return null;
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: 2,
      border: `2px solid ${isVeg ? "#16a34a" : "#dc2626"}`,
      flexShrink: 0, marginRight: 4,
    }}>
      <span style={{
        display: "block", width: 4, height: 4, borderRadius: "50%", margin: 1,
        background: isVeg ? "#16a34a" : "#dc2626",
      }} />
    </span>
  );
}

// ── Step 1: Customer Info ─────────────────────────────────────────────────────
function StepInfo({ outletName, tableLabel, onNext }) {
  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [err,   setErr]   = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim())             { setErr("Please enter your name"); return; }
    if (phone && !/^\d{10}$/.test(phone)) { setErr("Enter a valid 10-digit mobile number"); return; }
    onNext(name.trim(), phone.trim());
  }

  return (
    <div className="cw-step">
      <div className="cw-welcome">
        <div className="cw-logo">🍽</div>
        <h1 className="cw-outlet">{outletName || "Restaurant"}</h1>
        <div className="cw-table-badge">Table {tableLabel}</div>
        <p className="cw-subtitle">Enter your details to start ordering</p>
      </div>
      <form className="cw-info-form" onSubmit={handleSubmit}>
        <label>
          Your name *
          <input type="text" placeholder="e.g. Ravi Kumar" value={name}
            onChange={e => { setName(e.target.value); setErr(""); }} autoFocus />
        </label>
        <label>
          Mobile number <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
          <input type="tel" placeholder="10-digit mobile" value={phone} maxLength={10}
            onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setErr(""); }} />
        </label>
        {err && <p className="cw-error">{err}</p>}
        <button type="submit" className="cw-primary-btn">View Menu →</button>
      </form>
    </div>
  );
}

// ── Step 2: Menu ──────────────────────────────────────────────────────────────
function StepMenu({ categories, items, cart, onAdd, onRemove, onCheckout }) {
  const [activeCat, setActiveCat] = useState(categories[0]?.name || "");
  const [search,    setSearch]    = useState("");

  const catItems = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items.filter(i => i.category === activeCat || i.categoryName === activeCat);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  function qtyOf(id) { return cart.find(i => i.id === id)?.quantity || 0; }

  return (
    <div className="cw-menu-wrap">
      {/* Search */}
      <div className="cw-search-bar">
        <span className="cw-search-icon">🔍</span>
        <input type="text" placeholder="Search menu…" value={search}
          onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch("")} className="cw-search-clear">✕</button>}
      </div>

      {/* Category pills */}
      {!search && (
        <div className="cw-cat-row">
          {categories.map(c => (
            <button key={c.id || c.name}
              className={`cw-cat-pill${activeCat === c.name ? " active" : ""}`}
              onClick={() => setActiveCat(c.name)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="cw-item-list">
        {catItems.length === 0 && (
          <div className="cw-empty">No items found</div>
        )}
        {catItems.map(item => {
          const qty = qtyOf(item.id);
          const price = Number(item.basePrice || item.price || 0);
          return (
            <div key={item.id} className="cw-item-row">
              <div className="cw-item-info">
                <div className="cw-item-name">
                  <VegDot isVeg={item.isVeg} />
                  {item.name}
                </div>
                {item.description && <p className="cw-item-desc">{item.description}</p>}
                <div className="cw-item-price">{fmt(price)}</div>
              </div>
              <div className="cw-qty-ctrl">
                {qty > 0 ? (
                  <>
                    <button className="cw-qty-btn minus" onClick={() => onRemove(item)}>−</button>
                    <span className="cw-qty-val">{qty}</span>
                    <button className="cw-qty-btn plus" onClick={() => onAdd(item)}>+</button>
                  </>
                ) : (
                  <button className="cw-add-btn" onClick={() => onAdd(item)}>Add</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div className="cw-cart-bar" onClick={onCheckout}>
          <span className="cw-cart-count">{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
          <span className="cw-cart-label">View Cart</span>
          <span className="cw-cart-total">{fmt(cartTotal)}</span>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Cart ──────────────────────────────────────────────────────────────
function StepCart({ cart, customerName, tableLabel, onAdd, onRemove, onConfirm, submitting }) {
  const [notes, setNotes] = useState("");
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="cw-step">
      <div className="cw-cart-header">
        <h2>Your Order</h2>
        <span className="cw-table-badge">Table {tableLabel}</span>
      </div>

      <div className="cw-cart-list">
        {cart.map(item => (
          <div key={item.id} className="cw-cart-row">
            <div className="cw-cart-info">
              <span className="cw-cart-name">{item.name}</span>
              <span className="cw-cart-price">{fmt(item.price * item.quantity)}</span>
            </div>
            <div className="cw-qty-ctrl small">
              <button className="cw-qty-btn minus" onClick={() => onRemove(item)}>−</button>
              <span className="cw-qty-val">{item.quantity}</span>
              <button className="cw-qty-btn plus" onClick={() => onAdd(item)}>+</button>
            </div>
          </div>
        ))}
      </div>

      <div className="cw-cart-total-row">
        <span>Total</span>
        <strong>{fmt(total)}</strong>
      </div>

      <label className="cw-notes-label">
        Special instructions <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
        <textarea rows={2} placeholder="e.g. No onions, extra spicy…" value={notes}
          onChange={e => setNotes(e.target.value)} />
      </label>

      <button className="cw-primary-btn" onClick={() => onConfirm(notes)} disabled={submitting}>
        {submitting ? "Placing order…" : "Confirm Order"}
      </button>
    </div>
  );
}

// ── Step 4: Post-Order Actions ────────────────────────────────────────────────
function StepActions({ customerName, tableLabel, outletId, tableId, tenantId, onAddMore }) {
  const [billStatus,   setBillStatus]   = useState("idle");   // idle | sending | done
  const [waiterStatus, setWaiterStatus] = useState("idle");
  const [toast,        setToast]        = useState("");

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleRequestBill() {
    setBillStatus("sending");
    try {
      await post("/public/bill-request", { outletId, tableId, tableLabel, tenantId, customerName });
      setBillStatus("done");
      showToast("✅ Bill request sent! Our staff will bring it shortly.");
    } catch {
      setBillStatus("idle");
      showToast("⚠️ Could not send request. Please ask staff directly.");
    }
  }

  async function handleCallWaiter() {
    setWaiterStatus("sending");
    try {
      await post("/public/call-waiter", { outletId, tableId, tableLabel, tenantId, customerName });
      setWaiterStatus("done");
      showToast("✅ Waiter notified! Someone will be with you shortly.");
    } catch {
      setWaiterStatus("idle");
      showToast("⚠️ Could not send request. Please wave to our staff.");
    }
  }

  return (
    <div className="cw-step cw-actions-step">
      {/* Toast */}
      {toast && <div className="cw-toast">{toast}</div>}

      <div className="cw-confirmed-top">
        <div className="cw-confirm-icon">✅</div>
        <h2>Order Placed!</h2>
        <p>Hi <strong>{customerName}</strong>, your order has been sent to the kitchen.</p>
        <div className="cw-table-badge" style={{ marginTop: 8 }}>Table {tableLabel}</div>
      </div>

      <div className="cw-action-cards">

        {/* Add more items */}
        <button className="cw-action-card cw-action-menu" onClick={onAddMore}>
          <span className="cw-action-icon">🍛</span>
          <div>
            <div className="cw-action-title">Order More</div>
            <div className="cw-action-sub">Add items for next round</div>
          </div>
          <span className="cw-action-arrow">→</span>
        </button>

        {/* Request bill */}
        <button
          className={`cw-action-card cw-action-bill${billStatus === "done" ? " done" : ""}`}
          onClick={handleRequestBill}
          disabled={billStatus !== "idle"}
        >
          <span className="cw-action-icon">🧾</span>
          <div>
            <div className="cw-action-title">
              {billStatus === "done" ? "Bill Requested ✓" : "Request Bill"}
            </div>
            <div className="cw-action-sub">
              {billStatus === "sending" ? "Sending…" : "Get your bill at the table"}
            </div>
          </div>
          {billStatus === "idle" && <span className="cw-action-arrow">→</span>}
        </button>

        {/* Call waiter */}
        <button
          className={`cw-action-card cw-action-waiter${waiterStatus === "done" ? " done" : ""}`}
          onClick={handleCallWaiter}
          disabled={waiterStatus !== "idle"}
        >
          <span className="cw-action-icon">🛎️</span>
          <div>
            <div className="cw-action-title">
              {waiterStatus === "done" ? "Waiter Called ✓" : "Call Waiter"}
            </div>
            <div className="cw-action-sub">
              {waiterStatus === "sending" ? "Sending…" : "Need assistance at your table"}
            </div>
          </div>
          {waiterStatus === "idle" && <span className="cw-action-arrow">→</span>}
        </button>

      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export function App() {
  const params = getParams();
  const [step,         setStep]        = useState("loading");
  const [outlet,       setOutlet]      = useState(null);
  const [categories,   setCategories]  = useState([]);
  const [menuItems,    setMenuItems]   = useState([]);
  const [cart,         setCart]        = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone,setCustomerPhone] = useState("");
  const [submitting,   setSubmitting]  = useState(false);
  const [errorMsg,     setErrorMsg]    = useState("");
  // tenantId resolved from outlet response (more reliable than URL param)
  const [resolvedTenantId, setResolvedTenantId] = useState(params.tenantId || "");

  useEffect(() => {
    if (!params.outletId || !params.tableId) {
      setErrorMsg("Invalid QR code — missing outlet or table information.");
      setStep("error");
      return;
    }
    const tid = params.tenantId ? `&tenantId=${params.tenantId}` : "";
    Promise.all([
      get(`/public/outlet?outletId=${params.outletId}${tid}`),
      get(`/public/menu?outletId=${params.outletId}${tid}`),
    ]).then(([outletData, menuData]) => {
      if (outletData?.error) throw new Error(outletData.error);
      setOutlet(outletData);
      // Use tenantId returned by backend (most reliable)
      if (outletData?.tenantId) setResolvedTenantId(outletData.tenantId);
      setCategories(menuData.categories || []);
      setMenuItems(menuData.items || []);
      setStep("info");
    }).catch(err => {
      setErrorMsg(err.message || "Could not load menu. Please try again.");
      setStep("error");
    });
  }, []);

  function handleInfoNext(name, phone) {
    setCustomerName(name);
    setCustomerPhone(phone);
    setStep("menu");
  }

  const addToCart = useCallback((item) => {
    const price = Number(item.basePrice || item.price || 0);
    setCart(prev => {
      const existing = prev.findIndex(c => c.id === item.id);
      if (existing >= 0) {
        return prev.map((c, i) => i === existing ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { id: item.id, name: item.name, price, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((item) => {
    setCart(prev => {
      const existing = prev.findIndex(c => c.id === item.id);
      if (existing < 0) return prev;
      if (prev[existing].quantity <= 1) return prev.filter((_, i) => i !== existing);
      return prev.map((c, i) => i === existing ? { ...c, quantity: c.quantity - 1 } : c);
    });
  }, []);

  async function handleConfirm(notes) {
    setSubmitting(true);
    try {
      const orderItems = cart.map(i => ({
        id:       i.id,
        name:     i.name,
        price:    i.price,
        quantity: i.quantity,
        notes:    notes || "",
      }));
      await post("/operations/customer-order", {
        tenantId:      resolvedTenantId || outlet?.tenantId || "default",
        outletId:      params.outletId,
        tableId:       params.tableId,
        tableLabel:    params.tableLabel,
        customerName,
        customerPhone,
        items:         orderItems,
      });
      setCart([]); // clear cart for next order
      setStep("actions");
    } catch (err) {
      alert(err.message || "Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="cw-splash">
        <div className="cw-spinner" />
        <p>Loading menu…</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="cw-splash">
        <div className="cw-error-icon">⚠️</div>
        <p className="cw-error">{errorMsg}</p>
        <p style={{ fontSize: "0.82rem", color: "#9ca3af", marginTop: 8 }}>
          Please scan the QR code on your table again.
        </p>
      </div>
    );
  }

  return (
    <div className="cw-app">
      {/* Header */}
      <div className="cw-header">
        <span className="cw-header-outlet">{outlet?.name || ""}</span>
        {step === "menu" && (
          <button className="cw-cart-icon-btn" onClick={() => cart.length && setStep("cart")}>
            🛒 {cart.length > 0 && <span className="cw-cart-icon-badge">{cart.reduce((s,i) => s+i.quantity, 0)}</span>}
          </button>
        )}
        {step === "cart" && (
          <button className="cw-back-btn" onClick={() => setStep("menu")}>← Menu</button>
        )}
        {step === "actions" && (
          <button className="cw-back-btn" onClick={() => setStep("menu")}>+ Order More</button>
        )}
      </div>

      {step === "info" && (
        <StepInfo
          outletName={outlet?.name}
          tableLabel={params.tableLabel}
          onNext={handleInfoNext}
        />
      )}
      {step === "menu" && (
        <StepMenu
          categories={categories}
          items={menuItems}
          cart={cart}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onCheckout={() => setStep("cart")}
        />
      )}
      {step === "cart" && (
        <StepCart
          cart={cart}
          customerName={customerName}
          tableLabel={params.tableLabel}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onConfirm={handleConfirm}
          submitting={submitting}
        />
      )}
      {step === "actions" && (
        <StepActions
          customerName={customerName}
          tableLabel={params.tableLabel}
          outletId={params.outletId}
          tableId={params.tableId}
          tenantId={resolvedTenantId}
          onAddMore={() => setStep("menu")}
        />
      )}
    </div>
  );
}
