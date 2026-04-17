import { useEffect, useState } from "react";
import { discountsSeedData } from "./discounts.seed";
import {
  createDiscountRule,
  deleteDiscountRule,
  updateDiscountRule,
  updateDiscountApprovalPolicy
} from "./discounts.service";

// ── Offline storage ──────────────────────────────────────────
const LOCAL_RULES_KEY = "pos_local_discount_rules";
const LOCAL_POLICY_KEY = "pos_local_discount_policy";

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function saveLocal(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) { /* ignore */ }
}

// ── Helpers ──────────────────────────────────────────────────
const OUTLETS = ["All Outlets", "Indiranagar", "Koramangala", "HSR Layout", "Whitefield"];
const BILLING_ROLES = ["Cashier", "Manager", "All Billing Roles"];

function buildMeta(rule) {
  const typeStr = rule.discountType === "flat" ? `Flat ₹${rule.value} off` : `${rule.value}% off`;
  return [
    `${typeStr} · ${rule.discountScope === "item" ? "Item level" : "Order level"}`,
    `Outlet: ${rule.outletScope || "All Outlets"}`,
    `Role: ${rule.appliesToRole || "Cashier"}`,
    `Time: ${rule.timeWindow || "Always on"}`,
    rule.requiresApproval ? "Approval required" : "No approval needed"
  ];
}

function normalizeRule(rule) {
  return {
    id: rule.id || `rule-${Date.now()}`,
    name: rule.name || "",
    discountType: rule.discountType || "percentage",
    discountScope: rule.discountScope || "order",
    value: rule.value ?? 0,
    outletScope: rule.outletScope || "All Outlets",
    appliesToRole: rule.appliesToRole || "Cashier",
    requiresApproval: Boolean(rule.requiresApproval),
    timeWindow: rule.timeWindow || "Always on",
    notes: rule.notes || "",
    isActive: rule.isActive !== false,
    meta: buildMeta(rule),
    status: rule.isActive === false ? "Paused" : "Active"
  };
}

function statusClass(status) {
  return ["Review", "Paused", "Escalated", "Sensitive"].includes(status) ? "warning" : "online";
}

const emptyForm = {
  name: "", discountType: "percentage", discountScope: "order",
  value: "", outletScope: "All Outlets", appliesToRole: "Cashier",
  requiresApproval: false, timeWindow: "Always on", notes: ""
};

// ── Component ────────────────────────────────────────────────
export function DiscountRulesPage() {
  const [rules, setRules] = useState([]);
  const [policy, setPolicy] = useState([]);
  const [activity] = useState(discountsSeedData.activity);
  const [alerts, setAlerts] = useState(discountsSeedData.alerts);
  const [loading, setLoading] = useState(true);

  // Create form
  const [form, setForm] = useState(emptyForm);
  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyForm);
  // Approval policy drafts
  const [policyDrafts, setPolicyDrafts] = useState({});
  // Guardrail settings
  const [guardrails, setGuardrails] = useState({ cashierLimit: 5, managerLimit: 15, reasonRequired: true, ruleStacking: false });

  const [msg, setMsg] = useState("");

  // ── Load ──────────────────────────────────────────────────
  useEffect(() => {
    const localRules = loadLocal(LOCAL_RULES_KEY, null);
    const localPolicy = loadLocal(LOCAL_POLICY_KEY, null);
    const seedRules = (localRules || discountsSeedData.rules).map(normalizeRule);
    const seedPolicy = localPolicy || discountsSeedData.approvalPolicy;
    setRules(seedRules);
    setPolicy(seedPolicy);
    initPolicyDrafts(seedPolicy);
    setLoading(false);
  }, []);

  function initPolicyDrafts(pol) {
    const drafts = {};
    pol.forEach((row) => {
      drafts[row.id] = {
        manualDiscountLimit: String(row.manualDiscountLimit ?? 0),
        orderVoid: row.orderVoid || "Not allowed",
        billDelete: row.billDelete || "Not allowed",
        approvalRoute: row.approvalRoute || ""
      };
    });
    setPolicyDrafts(drafts);
  }

  function flash(text) { setMsg(text); setTimeout(() => setMsg(""), 3000); }

  // ── Rule CRUD ─────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const newRule = normalizeRule({ ...form, id: `rule-${Date.now()}`, value: Number(form.value || 0) });
    try { await createDiscountRule({ ...form, value: Number(form.value || 0) }); } catch (_) { /* offline */ }
    const updated = [newRule, ...rules];
    setRules(updated);
    saveLocal(LOCAL_RULES_KEY, updated);
    setForm(emptyForm);
    flash(`"${newRule.name}" created.`);
  }

  function startEdit(rule) {
    setEditingId(rule.id);
    setEditDraft({
      name: rule.name, discountType: rule.discountType, discountScope: rule.discountScope,
      value: String(rule.value), outletScope: rule.outletScope, appliesToRole: rule.appliesToRole,
      requiresApproval: rule.requiresApproval, timeWindow: rule.timeWindow, notes: rule.notes
    });
  }

  async function handleSaveEdit(ruleId) {
    const payload = { ...editDraft, value: Number(editDraft.value || 0) };
    try { await updateDiscountRule(ruleId, payload); } catch (_) { /* offline */ }
    const updated = rules.map((r) => r.id === ruleId ? normalizeRule({ ...r, ...payload }) : r);
    setRules(updated);
    saveLocal(LOCAL_RULES_KEY, updated);
    setEditingId(null);
    flash("Rule updated.");
  }

  async function handleTogglePause(rule) {
    const nextActive = !rule.isActive;
    try { await updateDiscountRule(rule.id, { isActive: nextActive }); } catch (_) { /* offline */ }
    const updated = rules.map((r) =>
      r.id === rule.id ? normalizeRule({ ...r, isActive: nextActive }) : r
    );
    setRules(updated);
    saveLocal(LOCAL_RULES_KEY, updated);
    flash(nextActive ? `"${rule.name}" resumed.` : `"${rule.name}" paused.`);
  }

  async function handleDelete(rule) {
    if (!window.confirm(`Delete "${rule.name}"? This cannot be undone.`)) return;
    try { await deleteDiscountRule(rule.id); } catch (_) { /* offline */ }
    const updated = rules.filter((r) => r.id !== rule.id);
    setRules(updated);
    saveLocal(LOCAL_RULES_KEY, updated);
    if (editingId === rule.id) setEditingId(null);
    flash(`"${rule.name}" deleted.`);
    // Rebuild alerts
    const paused = updated.filter((r) => !r.isActive).length;
    if (paused > 0) setAlerts([{ id: "paused", title: `${paused} rule(s) paused`, description: "Review whether to resume them." }]);
    else setAlerts(discountsSeedData.alerts);
  }

  // ── Approval Policy ───────────────────────────────────────
  async function savePolicy(rowId) {
    const draft = policyDrafts[rowId];
    const updated = policy.map((row) =>
      row.id === rowId ? { ...row, ...draft, manualDiscountLimit: Number(draft.manualDiscountLimit || 0) } : row
    );
    try { await updateDiscountApprovalPolicy(rowId, draft); } catch (_) { /* offline */ }
    setPolicy(updated);
    saveLocal(LOCAL_POLICY_KEY, updated);
    flash("Policy saved.");
  }

  // ── Guardrails ────────────────────────────────────────────
  function handleSaveGuardrails(e) {
    e.preventDefault();
    flash("Guardrails saved.");
  }

  // ── Export ────────────────────────────────────────────────
  function exportRules() {
    const rows = [
      ["Rule Name", "Type", "Value", "Scope", "Outlet", "Role", "Approval", "Time", "Status"],
      ...rules.map((r) => [r.name, r.discountType, r.value, r.discountScope, r.outletScope, r.appliesToRole, r.requiresApproval ? "Yes" : "No", r.timeWindow, r.status])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "discount-rules.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const activeCount = rules.filter((r) => r.isActive).length;
  const pausedCount = rules.filter((r) => !r.isActive).length;

  // ── Inline edit form (reusable for create and edit) ──────
  function RuleFields({ draft, setDraft }) {
    return (
      <>
        <label>Rule name
          <input type="text" value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} required />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>Discount type
            <select value={draft.discountType} onChange={(e) => setDraft((p) => ({ ...p, discountType: e.target.value }))}>
              <option value="percentage">Percentage (%)</option>
              <option value="flat">Flat Amount (₹)</option>
            </select>
          </label>
          <label>Value
            <input type="number" min="0" value={draft.value}
              onChange={(e) => setDraft((p) => ({ ...p, value: e.target.value }))} required />
          </label>
          <label>Scope
            <select value={draft.discountScope} onChange={(e) => setDraft((p) => ({ ...p, discountScope: e.target.value }))}>
              <option value="order">Order level</option>
              <option value="item">Item level</option>
            </select>
          </label>
          <label>Billing role
            <select value={draft.appliesToRole} onChange={(e) => setDraft((p) => ({ ...p, appliesToRole: e.target.value }))}>
              {BILLING_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>Outlet scope
            <select value={draft.outletScope} onChange={(e) => setDraft((p) => ({ ...p, outletScope: e.target.value }))}>
              {OUTLETS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label>Time window
            <input type="text" value={draft.timeWindow} placeholder="e.g. 12 PM to 3 PM"
              onChange={(e) => setDraft((p) => ({ ...p, timeWindow: e.target.value }))} />
          </label>
        </div>
        <label>Notes
          <input type="text" value={draft.notes} placeholder="Optional note"
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontWeight: 600 }}>
          <input type="checkbox" checked={draft.requiresApproval}
            onChange={(e) => setDraft((p) => ({ ...p, requiresApproval: e.target.checked }))}
            style={{ width: "18px", height: "18px", cursor: "pointer" }} />
          Approval required before applying
        </label>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Pricing Controls</p>
          <h2>Discount Rules</h2>
        </div>
        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={exportRules}>Export</button>
        </div>
      </header>

      {/* Stats */}
      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Active Rules</span>
          <strong>{activeCount}</strong>
          <p>Live discount policies</p>
        </article>
        <article className={`metric-card ${pausedCount > 0 ? "warning" : ""}`}>
          <span className="metric-label">Paused</span>
          <strong>{pausedCount}</strong>
          <p>Temporarily disabled</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cashier Max</span>
          <strong>{guardrails.cashierLimit}%</strong>
          <p>Above this → Manager approval</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Manager Max</span>
          <strong>{guardrails.managerLimit}%</strong>
          <p>Above this → Owner approval</p>
        </article>
      </section>

      {msg && (
        <div style={{ margin: "0 0 1rem", padding: "0.75rem 1rem", background: "#e8f5e9", color: "#1a7a3a", borderRadius: "8px", fontWeight: 500 }}>
          {msg}
        </div>
      )}

      <section className="dashboard-grid discounts-layout">

        {/* ── CREATE RULE FORM ── */}
        <article className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Quick Create</p><h3>New Rule</h3></div>
          </div>
          <form className="simple-form" onSubmit={handleCreate}>
            <RuleFields draft={form} setDraft={setForm} />
            <button type="submit" className="primary-btn full-width" style={{ marginTop: "0.5rem" }}>
              Save Rule
            </button>
          </form>
        </article>

        {/* ── ACTIVE RULES LIST ── */}
        <article className="panel panel-wide">
          <div className="panel-head">
            <div><p className="eyebrow">Rule Library</p><h3>Active Discount Policies</h3></div>
            <span style={{ fontSize: "0.85rem", color: "#888" }}>{rules.length} rules</span>
          </div>

          {loading ? <div className="panel-empty">Loading...</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {rules.length === 0 && <div className="panel-empty">No rules yet. Create one on the left.</div>}
              {rules.map((rule) => (
                <div key={rule.id} style={{
                  border: `1.5px solid ${rule.isActive ? "var(--line)" : "#e5c87a"}`,
                  borderRadius: "14px", padding: "14px 16px",
                  background: rule.isActive ? "var(--surface)" : "#fffbf0"
                }}>
                  {editingId === rule.id ? (
                    /* EDIT MODE */
                    <div className="simple-form">
                      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Editing: {rule.name}</p>
                      <RuleFields draft={editDraft} setDraft={setEditDraft} />
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button type="button" className="primary-btn" style={{ flex: 1 }} onClick={() => handleSaveEdit(rule.id)}>
                          Save Changes
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* VIEW MODE */
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <strong style={{ fontSize: "1rem" }}>{rule.name}</strong>
                        <span className={`status ${statusClass(rule.status)}`}>{rule.status}</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                        {rule.meta.map((m) => (
                          <span key={m} style={{
                            fontSize: "0.78rem", padding: "3px 10px",
                            background: "#f0f0ec", borderRadius: "999px", color: "#555"
                          }}>{m}</span>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="button" className="ghost-chip" onClick={() => startEdit(rule)}>Edit</button>
                        <button type="button" className="ghost-chip" onClick={() => handleTogglePause(rule)}>
                          {rule.isActive ? "Pause" : "Resume"}
                        </button>
                        <button type="button" className="ghost-chip"
                          style={{ color: "#c0392b", borderColor: "#f5c6c2" }}
                          onClick={() => handleDelete(rule)}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>

        {/* ── APPROVAL POLICY ── */}
        <article className="panel panel-wide">
          <div className="panel-head">
            <div><p className="eyebrow">Approval Policy</p><h3>Cashier &amp; Manager Limits</h3></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {policy.map((row) => {
              const d = policyDrafts[row.id] || {};
              return (
                <div key={row.id} style={{
                  border: "1.5px solid var(--line)", borderRadius: "14px",
                  padding: "16px", background: "var(--surface)"
                }}>
                  <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>{row.role}</p>
                  <div className="simple-form">
                    <label>
                      Manual discount limit (%)
                      <input type="number" min="0" max="100"
                        value={d.manualDiscountLimit || ""}
                        onChange={(e) => setPolicyDrafts((p) => ({ ...p, [row.id]: { ...p[row.id], manualDiscountLimit: e.target.value } }))} />
                    </label>
                    <label>
                      Order void
                      <select value={d.orderVoid || "Not allowed"}
                        onChange={(e) => setPolicyDrafts((p) => ({ ...p, [row.id]: { ...p[row.id], orderVoid: e.target.value } }))}>
                        <option>Not allowed</option>
                        <option>Allowed with note</option>
                        <option>Allowed</option>
                      </select>
                    </label>
                    <label>
                      Bill delete
                      <select value={d.billDelete || "Not allowed"}
                        onChange={(e) => setPolicyDrafts((p) => ({ ...p, [row.id]: { ...p[row.id], billDelete: e.target.value } }))}>
                        <option>Not allowed</option>
                        <option>Allowed with reason</option>
                        <option>Allowed</option>
                      </select>
                    </label>
                    <label>
                      Approval route
                      <input type="text" value={d.approvalRoute || ""}
                        placeholder="e.g. Escalate to Manager"
                        onChange={(e) => setPolicyDrafts((p) => ({ ...p, [row.id]: { ...p[row.id], approvalRoute: e.target.value } }))} />
                    </label>
                    <button type="button" className="secondary-btn full-width" onClick={() => savePolicy(row.id)}>
                      Save {row.role} Policy
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {/* ── GUARDRAILS ── */}
        <article className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Guardrails</p><h3>Discount Limits</h3></div>
          </div>
          <form className="simple-form" onSubmit={handleSaveGuardrails}>
            <label>Cashier max (%)
              <input type="number" min="0" max="100" value={guardrails.cashierLimit}
                onChange={(e) => setGuardrails((p) => ({ ...p, cashierLimit: e.target.value }))} />
            </label>
            <label>Manager max (%)
              <input type="number" min="0" max="100" value={guardrails.managerLimit}
                onChange={(e) => setGuardrails((p) => ({ ...p, managerLimit: e.target.value }))} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
              <input type="checkbox" checked={guardrails.reasonRequired}
                onChange={(e) => setGuardrails((p) => ({ ...p, reasonRequired: e.target.checked }))}
                style={{ width: "16px", height: "16px" }} />
              Reason required for manual discount
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
              <input type="checkbox" checked={guardrails.ruleStacking}
                onChange={(e) => setGuardrails((p) => ({ ...p, ruleStacking: e.target.checked }))}
                style={{ width: "16px", height: "16px" }} />
              Allow rule stacking
            </label>
            <button type="submit" className="secondary-btn full-width">Save Guardrails</button>
          </form>
        </article>

        {/* ── ACTIVITY ── */}
        <article className="panel panel-wide">
          <div className="panel-head">
            <div><p className="eyebrow">Discount Activity</p><h3>Recent Overrides</h3></div>
          </div>
          <div className="staff-table">
            <div className="staff-row staff-head" style={{ gridTemplateColumns: "1fr 1fr 2fr 1fr 1fr" }}>
              <span>Time</span><span>User</span><span>Action</span><span>Amount</span><span>Status</span>
            </div>
            {activity.length === 0 ? (
              <div className="panel-empty">No activity yet.</div>
            ) : activity.map((item) => (
              <div key={item.id} className="staff-row" style={{ gridTemplateColumns: "1fr 1fr 2fr 1fr 1fr" }}>
                <span>{item.time}</span>
                <span>{item.user}</span>
                <span>{item.action}</span>
                <span>{item.amount}</span>
                <span className={`status ${statusClass(item.status)}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </article>

        {/* ── ALERTS ── */}
        <article className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Attention</p><h3>Discount Alerts</h3></div>
          </div>
          <div className="alert-list">
            {alerts.map((a) => (
              <div key={a.id} className="alert-item">
                <strong>{a.title}</strong>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        </article>

      </section>
    </>
  );
}
