import { useEffect, useMemo, useState } from "react";

import {
  createDiscountRule,
  deleteDiscountRule,
  fetchDiscountData,
  updateDiscountApprovalPolicy,
  updateDiscountDefaults,
  updateDiscountRule
} from "./discounts.service";

function statusClass(status) {
  return ["Review", "Sensitive", "Escalated", "Paused"].includes(status) ? "warning" : "online";
}

function buildRuleDraft(rule) {
  return {
    name: rule.name || "",
    discountType: rule.discountType || "percentage",
    discountScope: rule.discountScope || "order",
    value: String(rule.value ?? ""),
    outletScope: rule.outletScope || "All Outlets",
    appliesToRole: rule.appliesToRole || "Cashier",
    requiresApproval: Boolean(rule.requiresApproval),
    timeWindow: rule.timeWindow || "Always on",
    notes: rule.notes || "",
    isActive: rule.isActive ?? true
  };
}

const emptyRuleForm = {
  name: "",
  discountType: "percentage",
  discountScope: "order",
  value: "",
  outletScope: "All Outlets",
  appliesToRole: "Cashier",
  requiresApproval: false,
  timeWindow: "Always on",
  notes: "",
  isActive: true
};

export function DiscountRulesPage() {
  const [discountData, setDiscountData] = useState({
    rules: [],
    approvalPolicy: [],
    defaults: {},
    activity: [],
    alerts: [],
    summary: null
  });
  const [loading, setLoading] = useState(true);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyRuleForm);
  const [approvalDrafts, setApprovalDrafts] = useState({});
  const [defaultsDraft, setDefaultsDraft] = useState({
    cashierLimitPercent: 5,
    managerLimitPercent: 15,
    reasonRequired: true,
    auditLogEnabled: true,
    allowRuleStacking: false
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    const result = await fetchDiscountData();
    setDiscountData(result);
    setApprovalDrafts(
      Object.fromEntries(
        (result.approvalPolicy || []).map((row) => [
          row.id,
          {
            manualDiscountLimit: String(row.manualDiscountLimit ?? 0),
            orderVoid: row.orderVoid || "Not allowed",
            billDelete: row.billDelete || "Not allowed",
            approvalRoute: row.approvalRoute || ""
          }
        ])
      )
    );
    setDefaultsDraft({
      cashierLimitPercent: result.defaults?.cashierLimitPercent ?? 5,
      managerLimitPercent: result.defaults?.managerLimitPercent ?? 15,
      reasonRequired: result.defaults?.reasonRequired ?? true,
      auditLogEnabled: result.defaults?.auditLogEnabled ?? true,
      allowRuleStacking: result.defaults?.allowRuleStacking ?? false
    });
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchDiscountData();

      if (cancelled) {
        return;
      }

      setDiscountData(result);
      setApprovalDrafts(
        Object.fromEntries(
          (result.approvalPolicy || []).map((row) => [
            row.id,
            {
              manualDiscountLimit: String(row.manualDiscountLimit ?? 0),
              orderVoid: row.orderVoid || "Not allowed",
              billDelete: row.billDelete || "Not allowed",
              approvalRoute: row.approvalRoute || ""
            }
          ])
        )
      );
      setDefaultsDraft({
        cashierLimitPercent: result.defaults?.cashierLimitPercent ?? 5,
        managerLimitPercent: result.defaults?.managerLimitPercent ?? 15,
        reasonRequired: result.defaults?.reasonRequired ?? true,
        auditLogEnabled: result.defaults?.auditLogEnabled ?? true,
        allowRuleStacking: result.defaults?.allowRuleStacking ?? false
      });
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeRuleCount = useMemo(
    () => discountData.rules.filter((rule) => rule.isActive !== false).length,
    [discountData.rules]
  );
  const pausedRuleCount = useMemo(
    () => discountData.rules.filter((rule) => rule.isActive === false).length,
    [discountData.rules]
  );
  const pendingApprovals = discountData.summary?.totals?.discountApprovalsPending || 0;

  async function handleCreateRule(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const createdRule = await createDiscountRule({
        ...ruleForm,
        value: Number(ruleForm.value || 0)
      });
      setDiscountData((current) => ({
        ...current,
        rules: [createdRule, ...current.rules]
      }));
      setRuleForm(emptyRuleForm);
      setMessage(`${createdRule.name} created and added to active discount policies.`);
      await loadData();
    } catch (_error) {
      setMessage("Could not create the discount rule.");
    } finally {
      setSaving(false);
    }
  }

  function startRuleEdit(rule) {
    setEditingRuleId(rule.id);
    setEditDraft(buildRuleDraft(rule));
    setMessage("");
  }

  async function saveRuleEdit(ruleId) {
    setSaving(true);
    setMessage("");

    try {
      await updateDiscountRule(ruleId, {
        ...editDraft,
        value: Number(editDraft.value || 0)
      });
      setEditingRuleId(null);
      setMessage("Discount rule updated.");
      await loadData();
    } catch (_error) {
      setMessage("Could not update the discount rule.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRulePause(rule) {
    setSaving(true);
    setMessage("");

    try {
      await updateDiscountRule(rule.id, { isActive: !rule.isActive });
      setMessage(rule.isActive ? `${rule.name} paused.` : `${rule.name} resumed.`);
      await loadData();
    } catch (_error) {
      setMessage("Could not change the rule status.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRule(rule) {
    setSaving(true);
    setMessage("");

    try {
      await deleteDiscountRule(rule.id);
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
      }
      setMessage(`${rule.name} deleted.`);
      await loadData();
    } catch (_error) {
      setMessage("Could not delete the discount rule.");
    } finally {
      setSaving(false);
    }
  }

  async function saveApprovalPolicy(row) {
    setSaving(true);
    setMessage("");

    try {
      await updateDiscountApprovalPolicy(row.id, {
        manualDiscountLimit: Number(approvalDrafts[row.id]?.manualDiscountLimit || 0),
        orderVoid: approvalDrafts[row.id]?.orderVoid || "Not allowed",
        billDelete: approvalDrafts[row.id]?.billDelete || "Not allowed",
        approvalRoute: approvalDrafts[row.id]?.approvalRoute || ""
      });
      setMessage(`${row.role} approval policy updated.`);
      await loadData();
    } catch (_error) {
      setMessage("Could not update approval policy.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDefaults(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      await updateDiscountDefaults({
        cashierLimitPercent: Number(defaultsDraft.cashierLimitPercent || 0),
        managerLimitPercent: Number(defaultsDraft.managerLimitPercent || 0),
        reasonRequired: defaultsDraft.reasonRequired,
        auditLogEnabled: defaultsDraft.auditLogEnabled,
        allowRuleStacking: defaultsDraft.allowRuleStacking
      });
      setMessage("Rule defaults updated.");
      await loadData();
    } catch (_error) {
      setMessage("Could not update rule defaults.");
    } finally {
      setSaving(false);
    }
  }

  function exportRules() {
    const rows = [
      ["Rule Name", "Type", "Scope", "Value", "Outlet", "Role", "Approval", "Time Window", "Status"],
      ...discountData.rules.map((rule) => [
        rule.name,
        rule.discountType,
        rule.discountScope,
        rule.value,
        rule.outletScope,
        rule.appliesToRole,
        rule.requiresApproval ? "Required" : "Not required",
        rule.timeWindow,
        rule.isActive === false ? "Paused" : "Active"
      ])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "discount-rules.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Pricing Controls</p>
          <h2>Discount Rules</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={exportRules}>
            Export Rules
          </button>
          <button type="button" className="primary-btn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Create Rule
          </button>
        </div>
      </header>

      <section className="hero-panel discounts-hero">
        <div>
          <p className="hero-label">Controlled flexibility</p>
          <h3>Discount rules now follow the real billing workflow</h3>
          <p className="hero-copy">
            Create discount rules for billing roles, edit them from the active policy list, pause them, delete them,
            and keep approval limits synced with live cashier controls.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Active rules</span>
            <strong>{activeRuleCount}</strong>
          </div>
          <div>
            <span>Paused rules</span>
            <strong>{pausedRuleCount}</strong>
          </div>
          <div>
            <span>Pending approvals</span>
            <strong className={pendingApprovals > 0 ? "negative" : ""}>{pendingApprovals}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Order-level rules</span>
          <strong>{discountData.rules.filter((rule) => rule.discountScope === "order").length}</strong>
          <p>Bill level promotions for cashier and manager billing flows</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Item-level rules</span>
          <strong>{discountData.rules.filter((rule) => rule.discountScope === "item").length}</strong>
          <p>Used when only selected items should receive a discount</p>
        </article>
        <article className={`metric-card ${pendingApprovals > 0 ? "warning" : ""}`}>
          <span className="metric-label">Overrides today</span>
          <strong>{pendingApprovals}</strong>
          <p>Live discount requests that still need manager or owner action</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cashier max discount</span>
          <strong>{defaultsDraft.cashierLimitPercent}%</strong>
          <p>Anything above this goes to the configured approval route</p>
        </article>
      </section>

      {message ? <div className="mobile-banner">{message}</div> : null}

      <section className="dashboard-grid discounts-layout">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Rule</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreateRule}>
            <label>
              Rule name
              <input
                type="text"
                value={ruleForm.name}
                onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Discount type
              <select
                value={ruleForm.discountType}
                onChange={(event) => setRuleForm((current) => ({ ...current, discountType: event.target.value }))}
              >
                <option value="percentage">Percentage</option>
                <option value="flat">Flat Amount</option>
              </select>
            </label>
            <label>
              Scope
              <select
                value={ruleForm.discountScope}
                onChange={(event) => setRuleForm((current) => ({ ...current, discountScope: event.target.value }))}
              >
                <option value="order">Order</option>
                <option value="item">Item</option>
              </select>
            </label>
            <label>
              Value
              <input
                type="number"
                min="0"
                value={ruleForm.value}
                onChange={(event) => setRuleForm((current) => ({ ...current, value: event.target.value }))}
                required
              />
            </label>
            <label>
              Outlet scope
              <input
                type="text"
                value={ruleForm.outletScope}
                onChange={(event) => setRuleForm((current) => ({ ...current, outletScope: event.target.value }))}
              />
            </label>
            <label>
              Billing role
              <select
                value={ruleForm.appliesToRole}
                onChange={(event) => setRuleForm((current) => ({ ...current, appliesToRole: event.target.value }))}
              >
                <option value="Cashier">Cashier</option>
                <option value="Manager">Manager</option>
                <option value="Owner">Owner</option>
                <option value="All Billing Roles">All Billing Roles</option>
              </select>
            </label>
            <label>
              Time window
              <input
                type="text"
                value={ruleForm.timeWindow}
                onChange={(event) => setRuleForm((current) => ({ ...current, timeWindow: event.target.value }))}
                placeholder="10:00 AM - 4:00 PM"
              />
            </label>
            <label>
              Notes
              <input
                type="text"
                value={ruleForm.notes}
                onChange={(event) => setRuleForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional billing note"
              />
            </label>
            <label className="toggle-row">
              <span>Approval required</span>
              <input
                type="checkbox"
                checked={ruleForm.requiresApproval}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    requiresApproval: event.target.checked
                  }))
                }
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              Save Rule
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Rule Library</p>
              <h3>Active Discount Policies</h3>
            </div>
          </div>

          {loading ? (
            <div className="panel-empty">Loading discount rules...</div>
          ) : (
            <div className="integration-grid">
              {discountData.rules.map((rule) => (
                <div key={rule.id} className={`integration-card ${rule.review ? "review" : ""}`}>
                  <div className="integration-card-head">
                    <strong>{rule.name}</strong>
                    <span className={`status ${statusClass(rule.status)}`}>{rule.status}</span>
                  </div>

                  {editingRuleId === rule.id ? (
                    <div className="simple-form">
                      <label>
                        Rule name
                        <input
                          type="text"
                          value={editDraft.name}
                          onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}
                        />
                      </label>
                      <label>
                        Discount type
                        <select
                          value={editDraft.discountType}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, discountType: event.target.value }))
                          }
                        >
                          <option value="percentage">Percentage</option>
                          <option value="flat">Flat Amount</option>
                        </select>
                      </label>
                      <label>
                        Scope
                        <select
                          value={editDraft.discountScope}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, discountScope: event.target.value }))
                          }
                        >
                          <option value="order">Order</option>
                          <option value="item">Item</option>
                        </select>
                      </label>
                      <label>
                        Value
                        <input
                          type="number"
                          min="0"
                          value={editDraft.value}
                          onChange={(event) => setEditDraft((current) => ({ ...current, value: event.target.value }))}
                        />
                      </label>
                      <label>
                        Outlet scope
                        <input
                          type="text"
                          value={editDraft.outletScope}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, outletScope: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Billing role
                        <select
                          value={editDraft.appliesToRole}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, appliesToRole: event.target.value }))
                          }
                        >
                          <option value="Cashier">Cashier</option>
                          <option value="Manager">Manager</option>
                          <option value="Owner">Owner</option>
                          <option value="All Billing Roles">All Billing Roles</option>
                        </select>
                      </label>
                      <label>
                        Time window
                        <input
                          type="text"
                          value={editDraft.timeWindow}
                          onChange={(event) =>
                            setEditDraft((current) => ({ ...current, timeWindow: event.target.value }))
                          }
                        />
                      </label>
                      <label className="toggle-row">
                        <span>Approval required</span>
                        <input
                          type="checkbox"
                          checked={editDraft.requiresApproval}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              requiresApproval: event.target.checked
                            }))
                          }
                        />
                      </label>
                      <label>
                        Notes
                        <input
                          type="text"
                          value={editDraft.notes}
                          onChange={(event) => setEditDraft((current) => ({ ...current, notes: event.target.value }))}
                        />
                      </label>

                      <div className="location-actions">
                        <button type="button" className="primary-btn" onClick={() => saveRuleEdit(rule.id)} disabled={saving}>
                          Save
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => setEditingRuleId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="integration-meta">
                        {rule.meta.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                      <div className="location-actions">
                        <button type="button" className="ghost-chip" onClick={() => startRuleEdit(rule)}>
                          Edit
                        </button>
                        <button type="button" className="ghost-chip" onClick={() => toggleRulePause(rule)}>
                          {rule.isActive === false ? "Resume" : "Pause"}
                        </button>
                        <button type="button" className="ghost-chip" onClick={() => handleDeleteRule(rule)}>
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Approval Policy</p>
              <h3>Editable Approval Policies</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Role</span>
              <span>Manual Discount %</span>
              <span>Order Void</span>
              <span>Bill Delete</span>
              <span>Approval Route</span>
              <span>Action</span>
            </div>
            {discountData.approvalPolicy.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.role}</span>
                <span>
                  <input
                    type="number"
                    min="0"
                    value={approvalDrafts[row.id]?.manualDiscountLimit || ""}
                    onChange={(event) =>
                      setApprovalDrafts((current) => ({
                        ...current,
                        [row.id]: {
                          ...current[row.id],
                          manualDiscountLimit: event.target.value
                        }
                      }))
                    }
                  />
                </span>
                <span>
                  <input
                    type="text"
                    value={approvalDrafts[row.id]?.orderVoid || ""}
                    onChange={(event) =>
                      setApprovalDrafts((current) => ({
                        ...current,
                        [row.id]: {
                          ...current[row.id],
                          orderVoid: event.target.value
                        }
                      }))
                    }
                  />
                </span>
                <span>
                  <input
                    type="text"
                    value={approvalDrafts[row.id]?.billDelete || ""}
                    onChange={(event) =>
                      setApprovalDrafts((current) => ({
                        ...current,
                        [row.id]: {
                          ...current[row.id],
                          billDelete: event.target.value
                        }
                      }))
                    }
                  />
                </span>
                <span>
                  <input
                    type="text"
                    value={approvalDrafts[row.id]?.approvalRoute || ""}
                    onChange={(event) =>
                      setApprovalDrafts((current) => ({
                        ...current,
                        [row.id]: {
                          ...current[row.id],
                          approvalRoute: event.target.value
                        }
                      }))
                    }
                  />
                </span>
                <span>
                  <button type="button" className="ghost-chip" onClick={() => saveApprovalPolicy(row)} disabled={saving}>
                    Save
                  </button>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Rule Defaults</p>
              <h3>Guardrails</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={saveDefaults}>
            <label>
              Cashier limit (%)
              <input
                type="number"
                min="0"
                value={defaultsDraft.cashierLimitPercent}
                onChange={(event) =>
                  setDefaultsDraft((current) => ({
                    ...current,
                    cashierLimitPercent: event.target.value
                  }))
                }
              />
            </label>
            <label>
              Manager limit (%)
              <input
                type="number"
                min="0"
                value={defaultsDraft.managerLimitPercent}
                onChange={(event) =>
                  setDefaultsDraft((current) => ({
                    ...current,
                    managerLimitPercent: event.target.value
                  }))
                }
              />
            </label>
            <label className="toggle-row">
              <span>Reason required</span>
              <input
                type="checkbox"
                checked={defaultsDraft.reasonRequired}
                onChange={(event) =>
                  setDefaultsDraft((current) => ({
                    ...current,
                    reasonRequired: event.target.checked
                  }))
                }
              />
            </label>
            <label className="toggle-row">
              <span>Audit log enabled</span>
              <input
                type="checkbox"
                checked={defaultsDraft.auditLogEnabled}
                onChange={(event) =>
                  setDefaultsDraft((current) => ({
                    ...current,
                    auditLogEnabled: event.target.checked
                  }))
                }
              />
            </label>
            <label className="toggle-row">
              <span>Allow rule stacking</span>
              <input
                type="checkbox"
                checked={defaultsDraft.allowRuleStacking}
                onChange={(event) =>
                  setDefaultsDraft((current) => ({
                    ...current,
                    allowRuleStacking: event.target.checked
                  }))
                }
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              Save Defaults
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Discount Activity</p>
              <h3>Recent Overrides and Usage</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Time</span>
              <span>User</span>
              <span>Action</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {discountData.activity.length === 0 ? (
              <div className="panel-empty">No live discount activity yet.</div>
            ) : (
              discountData.activity.map((item) => (
                <div key={item.id} className="staff-row">
                  <span>{item.time}</span>
                  <span>{item.user}</span>
                  <span>{item.action}</span>
                  <span>{item.amount}</span>
                  <span className={`status ${statusClass(item.status)}`}>{item.status}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Discount Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {discountData.alerts.map((alert) => (
              <div key={alert.id} className="alert-item">
                <strong>{alert.title}</strong>
                <span>{alert.description}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
