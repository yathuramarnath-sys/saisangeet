/**
 * DiscountRulesPage — owner creates named discount rules that appear
 * as tappable buttons in the POS. Cashier selects which rule to apply
 * per order — rules are NEVER auto-applied.
 *
 * Simple model:
 *   - Name + type (% or flat ₹) + value + optional notes
 *   - Active / Paused toggle
 *   - Delete
 *   - NO cashier/manager level — owner activates, cashier applies
 * v2
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

function fmtRule(rule) {
  return rule.discountType === "flat"
    ? `₹${Number(rule.value).toFixed(0)} off`
    : `${rule.value}% off`;
}

const EMPTY_FORM = { name: "", discountType: "percentage", value: "", notes: "" };

export function DiscountRulesPage() {
  const [rules,   setRules]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [msg,     setMsg]     = useState({ text: "", ok: true });

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: "", ok: true }), 3000);
  };

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/settings/discounts");
      setRules(res?.rules || []);
    } catch {
      // backend unreachable — show empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  /* ── Create ─────────────────────────────────────────────── */
  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim() || form.value === "") return;
    setSaving(true);
    try {
      const payload = {
        name:             form.name.trim(),
        discountType:     form.discountType,
        value:            Number(form.value),
        discountScope:    "order",
        notes:            form.notes.trim(),
        isActive:         true,
        outletScope:      "All Outlets",
        appliesToRole:    "All Billing Roles",
        requiresApproval: false,
        timeWindow:       "Always on",
      };
      const newRule = await api.post("/settings/discounts", payload);
      setRules(prev => [newRule, ...prev]);
      setForm(EMPTY_FORM);
      flash(`"${newRule.name}" created`);
    } catch {
      flash("Failed to create. Please try again.", false);
    } finally {
      setSaving(false);
    }
  }

  /* ── Toggle active ──────────────────────────────────────── */
  async function toggleActive(rule) {
    const next = rule.isActive === false ? true : false; // toggle
    try {
      await api.patch(`/settings/discounts/${rule.id}`, { isActive: next });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: next } : r));
      flash(`"${rule.name}" ${next ? "activated" : "paused"}`);
    } catch {
      flash("Update failed. Try again.", false);
    }
  }

  /* ── Delete ─────────────────────────────────────────────── */
  async function handleDelete(rule) {
    if (!window.confirm(`Delete "${rule.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/settings/discounts/${rule.id}`);
      setRules(prev => prev.filter(r => r.id !== rule.id));
      flash(`"${rule.name}" deleted`);
    } catch {
      flash("Delete failed. Try again.", false);
    }
  }

  const activeCount = rules.filter(r => r.isActive !== false).length;
  const pausedCount = rules.length - activeCount;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Pricing Controls</p>
          <h2>Discount Rules</h2>
        </div>
        <div className="topbar-actions">
          <button className="topbar-btn" onClick={loadRules}>↺ Refresh</button>
        </div>
      </header>

      {/* Stats */}
      <div className="shift-stats-row">
        <div className="shift-stat">
          <strong>{rules.length}</strong>
          <span>Total Rules</span>
        </div>
        <div className="shift-stat">
          <strong>{activeCount}</strong>
          <span>Active in POS</span>
        </div>
        <div className={`shift-stat${pausedCount > 0 ? " bad" : ""}`}>
          <strong>{pausedCount}</strong>
          <span>Paused</span>
        </div>
      </div>

      {/* Flash message */}
      {msg.text && (
        <div style={{
          margin: "0 24px 16px",
          padding: "10px 16px",
          background: msg.ok ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${msg.ok ? "#6ee7b7" : "#fca5a5"}`,
          color: msg.ok ? "#065f46" : "#991b1b",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
        }}>
          {msg.ok ? "✓" : "⚠"} {msg.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, padding: "0 24px 40px", alignItems: "start" }}>

        {/* ── Create form ── */}
        <div>
          <div className="credit-customer-card">
            <div className="credit-customer-head">
              <strong className="credit-customer-name">➕ Add Discount Rule</strong>
            </div>
            <form className="simple-form" style={{ padding: "16px" }} onSubmit={handleCreate}>
              <label>
                Rule name
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Staff Discount, Regular Customer 10%"
                  required
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Discount type
                  <select
                    value={form.discountType}
                    onChange={e => setForm(p => ({ ...p, discountType: e.target.value }))}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount (₹)</option>
                  </select>
                </label>
                <label>
                  Value
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                    placeholder={form.discountType === "percentage" ? "e.g. 10" : "e.g. 50"}
                    required
                  />
                </label>
              </div>

              <label>
                Notes <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="e.g. Only for staff members"
                />
              </label>

              <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: 4 }}>
                {saving ? "Saving…" : "Add Rule"}
              </button>
            </form>
          </div>

          {/* How it works */}
          <div style={{
            marginTop: 12,
            padding: "12px 16px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 10,
            fontSize: 13,
            color: "#1e40af",
            lineHeight: 1.6,
          }}>
            <strong>💡 How it works</strong><br />
            Active rules appear as buttons in the POS cashier screen.
            The cashier manually picks which rule to apply per customer —
            rules are <strong>never auto-applied</strong>.
            Pause a rule to temporarily hide it from POS without deleting it.
          </div>
        </div>

        {/* ── Rules list ── */}
        <div>
          {loading ? (
            <div className="shift-empty" style={{ padding: "48px 16px" }}>Loading rules…</div>
          ) : rules.length === 0 ? (
            <div className="shift-empty" style={{ padding: "48px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏷️</div>
              No discount rules yet.<br />
              <span style={{ fontSize: 13, color: "#9ca3af" }}>Create your first rule using the form →</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rules.map(rule => {
                const isActive = rule.isActive !== false;
                return (
                  <div key={rule.id} style={{
                    border: `1.5px solid ${isActive ? "#e5e7eb" : "#f3f4f6"}`,
                    borderRadius: 12,
                    padding: "14px 16px",
                    background: isActive ? "#fff" : "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    opacity: isActive ? 1 : 0.65,
                  }}>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                        <strong style={{ fontSize: 15, color: "#111827" }}>{rule.name}</strong>
                        <span style={{
                          padding: "2px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 700,
                          background: isActive ? "#dcfce7" : "#f3f4f6",
                          color: isActive ? "#166534" : "#6b7280",
                        }}>
                          {isActive ? "● Active" : "○ Paused"}
                        </span>
                        <span style={{
                          padding: "2px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 700,
                          background: "#ede9fe",
                          color: "#6d28d9",
                        }}>
                          {fmtRule(rule)}
                        </span>
                      </div>
                      {rule.notes && (
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{rule.notes}</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        className="shift-filter-tab"
                        onClick={() => toggleActive(rule)}
                        style={{ fontWeight: 600 }}
                      >
                        {isActive ? "Pause" : "Activate"}
                      </button>
                      <button
                        className="shift-filter-tab"
                        style={{ color: "#dc2626", borderColor: "#fecaca", background: "#fff5f5" }}
                        onClick={() => handleDelete(rule)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
