import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

const DEFAULTS = {
  defaultOrderType: "dine-in",
  sectionNames: { "dine-in": "Dine-In", takeaway: "Takeaway", delivery: "Delivery" },
  personsRequired: false,
  newItemPosition: "bottom",
  defaultPettyCash: 0,
};

export function PosSettingsPage() {
  const [config,  setConfig]  = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState({ text: "", ok: true });

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: "", ok: true }), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/settings/pos-config");
      setConfig({ ...DEFAULTS, ...res });
    } catch {
      // backend unreachable — use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await api.put("/settings/pos-config", config);
      setConfig({ ...DEFAULTS, ...res });
      flash("POS settings saved.");
    } catch {
      flash("Failed to save — please try again.", false);
    } finally {
      setSaving(false);
    }
  }

  function set(key, val) {
    setConfig(prev => ({ ...prev, [key]: val }));
  }

  function setSectionName(mode, val) {
    setConfig(prev => ({
      ...prev,
      sectionNames: { ...prev.sectionNames, [mode]: val },
    }));
  }

  if (loading) {
    return (
      <div className="flex col" style={{ gap: 18, padding: "28px 0" }}>
        <div className="topbar flex align-center justify-between">
          <div>
            <h2 style={{ margin: 0 }}>POS Configuration</h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.875rem" }}>
              Controls default behaviour of the POS and Captain apps.
            </p>
          </div>
        </div>
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  const ORDER_TYPES = [
    { id: "dine-in",  label: "Dine-In" },
    { id: "takeaway", label: "Takeaway" },
    { id: "delivery", label: "Delivery" },
  ];

  return (
    <div className="flex col" style={{ gap: 18, padding: "28px 0" }}>
      {/* Header */}
      <div className="topbar flex align-center justify-between">
        <div>
          <h2 style={{ margin: 0 }}>POS Configuration</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.875rem" }}>
            Controls default behaviour of the POS and Captain apps.
          </p>
        </div>
        <button
          className="primary-btn"
          style={{ padding: "0 28px" }}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {msg.text && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            fontSize: "0.875rem",
            fontWeight: 600,
            background: msg.ok ? "var(--success-soft)" : "#fef2f2",
            color: msg.ok ? "#065f46" : "#991b1b",
            border: `1px solid ${msg.ok ? "#a7f3d0" : "#fca5a5"}`,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Default Order Type */}
      <div className="panel" style={{ borderRadius: 20, padding: "22px 24px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Default Order Type</h3>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.875rem" }}>
          Which service tab the POS opens on after login.
        </p>
        <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
          {ORDER_TYPES.map(({ id, label }) => (
            <label
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 12,
                border: `1.5px solid ${config.defaultOrderType === id ? "var(--accent)" : "var(--line-strong)"}`,
                background: config.defaultOrderType === id ? "var(--accent-soft)" : "var(--surface)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
              }}
            >
              <input
                type="radio"
                name="defaultOrderType"
                value={id}
                checked={config.defaultOrderType === id}
                onChange={() => set("defaultOrderType", id)}
                style={{ accentColor: "var(--accent)" }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Section / Tab Names */}
      <div className="panel" style={{ borderRadius: 20, padding: "22px 24px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Service Tab Labels</h3>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.875rem" }}>
          Rename the service mode tabs shown in the POS to match your restaurant terminology.
        </p>
        <div className="flex col" style={{ gap: 12 }}>
          {ORDER_TYPES.map(({ id }) => (
            <div key={id} className="flex align-center" style={{ gap: 14 }}>
              <span style={{ width: 90, fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {id.replace("-", " ")}
              </span>
              <input
                type="text"
                value={config.sectionNames?.[id] ?? ""}
                onChange={e => setSectionName(id, e.target.value)}
                placeholder={`Label for ${id}`}
                style={{
                  flex: 1,
                  maxWidth: 280,
                  padding: "9px 14px",
                  borderRadius: 10,
                  border: "1.5px solid var(--line-strong)",
                  background: "var(--surface-strong)",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  color: "var(--text)",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Cart & Order Behaviour */}
      <div className="panel" style={{ borderRadius: 20, padding: "22px 24px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Cart & Order Behaviour</h3>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.875rem" }}>
          How items are added to the order and how shifts start.
        </p>
        <div className="flex col" style={{ gap: 18 }}>

          {/* New item position */}
          <div>
            <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: "0.9rem" }}>New item appears at</p>
            <div className="flex" style={{ gap: 10 }}>
              {[
                { val: "bottom", label: "Bottom of cart" },
                { val: "top",    label: "Top of cart" },
              ].map(({ val, label }) => (
                <label
                  key={val}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 18px",
                    borderRadius: 12,
                    border: `1.5px solid ${config.newItemPosition === val ? "var(--accent)" : "var(--line-strong)"}`,
                    background: config.newItemPosition === val ? "var(--accent-soft)" : "var(--surface)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                  }}
                >
                  <input
                    type="radio"
                    name="newItemPosition"
                    value={val}
                    checked={config.newItemPosition === val}
                    onChange={() => set("newItemPosition", val)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Default petty cash */}
          <div className="flex align-center" style={{ gap: 14 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: "0.9rem" }}>Default opening petty cash (₹)</p>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.8rem" }}>Pre-filled amount in the "Open Shift" dialog.</p>
            </div>
            <input
              type="number"
              min={0}
              step={50}
              value={config.defaultPettyCash ?? 0}
              onChange={e => set("defaultPettyCash", Number(e.target.value))}
              style={{
                width: 110,
                padding: "9px 14px",
                borderRadius: 10,
                border: "1.5px solid var(--line-strong)",
                background: "var(--surface-strong)",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "var(--text)",
                textAlign: "right",
                marginLeft: "auto",
              }}
            />
          </div>

          {/* Persons required */}
          <label className="mini-card flex align-center justify-between" style={{ borderRadius: 14, padding: "14px 18px", cursor: "pointer" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem" }}>Require number of persons</p>
              <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "0.8rem" }}>
                Prompt captain/cashier to enter cover count when opening a table.
              </p>
            </div>
            <input
              type="checkbox"
              checked={!!config.personsRequired}
              onChange={e => set("personsRequired", e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--accent)", flexShrink: 0 }}
            />
          </label>
        </div>
      </div>

      {/* Save button at bottom too */}
      <div className="flex justify-end">
        <button
          className="primary-btn"
          style={{ padding: "0 28px" }}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
