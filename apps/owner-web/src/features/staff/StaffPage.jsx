import { useEffect, useMemo, useRef, useState } from "react";
import {
  createStaffMember,
  createStaffRole,
  deleteStaffMember,
  deleteStaffRole,
  fetchStaffData,
  updateStaffMember,
  updateStaffRole
} from "./staff.service";

// All operational permissions shown in the Permission Design panel
const PERMISSION_CATALOG = [
  { code: "operations.kot.send",       name: "Send KOT",          group: "Operations",  desc: "Captain/Waiter can fire orders to kitchen" },
  { code: "operations.bill.request",   name: "Request Bill",      group: "Operations",  desc: "Trigger bill request to cashier after service" },
  { code: "operations.table.move",     name: "Move Table",        group: "Operations",  desc: "Shift guests between tables before billing" },
  { code: "operations.bill.split",     name: "Split Bill",        group: "Operations",  desc: "Divide bill equally among guests" },
  { code: "operations.bill.edit",      name: "Edit Bill",         group: "Operations",  desc: "Modify bill lines before settlement" },
  { code: "operations.bill.cancel",    name: "Cancel Bill",       group: "Operations",  desc: "Void or cancel a bill with approval" },
  { code: "operations.discount.approve", name: "Approve Discount", group: "Operations", desc: "Approve discounts above cashier limit" },
  { code: "operations.table.create",   name: "Create Tables",     group: "Operations",  desc: "Add tables during floor setup" },
  { code: "reports.view",              name: "View Reports",      group: "Reports",     desc: "Access outlet and shift reports" },
  { code: "users.manage",              name: "Manage Staff",      group: "Management",  desc: "Create and update staff accounts" },
  { code: "floor.area.manage",         name: "Area Setup",        group: "Management",  desc: "Create or update AC, Non-AC, service areas" }
];

const LOCAL_STAFF_KEY = "pos_local_staff";
const LOCAL_ROLES_KEY = "pos_local_roles";

function loadLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveLocal(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) { /* ignore */ }
}

function buildDefaultDraft(data) {
  // Default to Cashier (never Owner) — Owner is the first role in the list but
  // it gets a passwordHash on signup and is excluded from the POS staff grid.
  const defaultRole =
    data.roles?.find((r) => r.name === "Cashier")?.name ||
    data.roles?.find((r) => r.name !== "Owner")?.name ||
    "Cashier";
  return {
    fullName: "",
    mobileNumber: "",
    outletName: data.outlets?.[0]?.name || "Indiranagar",
    role: defaultRole,
    pin: ""
  };
}

function statusClass(status) {
  return status === "Active" ? "online" : "warning";
}

// ────────────────────────────────────────────────────────────
// Toggle Switch component
// ────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange }) {
  return (
    <span
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      style={{
        display: "inline-block", width: "40px", height: "22px", borderRadius: "11px",
        background: enabled ? "#1a7a3a" : "#ccc", position: "relative",
        transition: "background 0.2s", cursor: "pointer", flexShrink: 0
      }}
    >
      <span style={{
        position: "absolute", top: "4px",
        left: enabled ? "21px" : "4px",
        width: "14px", height: "14px", borderRadius: "50%",
        background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
      }} />
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────
export function StaffPage() {
  const [staffData, setStaffData] = useState({
    roles: [], permissions: [], accessMatrix: [], permissionEditor: [],
    financialControls: [], staff: [], tableAccess: [], alerts: [],
    outlets: [], policyValues: { cashierDiscountLimitPercent: 5, cashierVoidLimitAmount: 200 }
  });
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState("");

  // Permission toggles: { roleId: [code, ...] }
  const [localPerms, setLocalPerms] = useState({});
  const [permsDirty, setPermsDirty] = useState(false);
  const [permsSaveMsg, setPermsSaveMsg] = useState("");

  // Role form
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");

  // Staff form
  const [staffDraft, setStaffDraft] = useState(buildDefaultDraft({ roles: [], outlets: [] }));
  const [editingStaffId, setEditingStaffId] = useState("");
  const [editStaffDraft, setEditStaffDraft] = useState(null);

  const [financialDraft, setFinancialDraft] = useState({
    cashierDiscountLimitPercent: 5,
    cashierVoidLimitAmount: 200
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const addStaffRef = useRef(null);

  // ── Load ────────────────────────────────────────────────
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function load() {
    setLoading(true);
    const result = await fetchStaffData();

    // Merge with offline local overrides
    const localRoles = loadLocal(LOCAL_ROLES_KEY);
    const localStaff = loadLocal(LOCAL_STAFF_KEY);
    const mergedRoles = localRoles || result.roles;
    const mergedStaff = localStaff || result.staff;
    const merged = { ...result, roles: mergedRoles, staff: mergedStaff };

    setStaffData(merged);
    setFinancialDraft(merged.policyValues);
    setStaffDraft(buildDefaultDraft(merged));
    setSelectedRoleId((cur) => cur || mergedRoles[0]?.id || "");

    // Init local permission map
    const permsMap = {};
    mergedRoles.forEach((r) => { permsMap[r.id] = [...(r.permissions || [])]; });
    setLocalPerms(permsMap);

    setLoading(false);
  }

  function showMsg(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }
  function showErr(text) {
    setError(text);
    setTimeout(() => setError(""), 4000);
  }

  // ── Selected role ────────────────────────────────────────
  const selectedRole = useMemo(
    () => staffData.roles.find((r) => r.id === selectedRoleId) || staffData.roles[0] || null,
    [staffData.roles, selectedRoleId]
  );

  const currentPerms = localPerms[selectedRoleId] || [];

  // ── Permission toggles ───────────────────────────────────
  function togglePerm(code) {
    setLocalPerms((prev) => {
      const cur = prev[selectedRoleId] || [];
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
      return { ...prev, [selectedRoleId]: next };
    });
    setPermsDirty(true);
    setPermsSaveMsg("");
  }

  async function handleSavePermissions() {
    const perms = localPerms[selectedRoleId] || [];
    const role = staffData.roles.find((r) => r.id === selectedRoleId);
    if (!role) return;
    try {
      await updateStaffRole(selectedRoleId, {
        name: role.name,
        description: role.summary || "",
        permissions: perms
      });
    } catch (_) { /* offline — update locally */ }
    const updated = staffData.roles.map((r) =>
      r.id === selectedRoleId ? { ...r, permissions: perms } : r
    );
    setStaffData((p) => ({ ...p, roles: updated }));
    saveLocal(LOCAL_ROLES_KEY, updated);
    setPermsDirty(false);
    setPermsSaveMsg(`${role.name} permissions saved ✓`);
    setTimeout(() => setPermsSaveMsg(""), 3000);
  }

  // ── Role CRUD ────────────────────────────────────────────
  function openNewRole() {
    setEditingRoleId(""); setRoleName(""); setRoleDesc(""); setShowRoleForm(true);
  }
  function openEditRole(role) {
    setEditingRoleId(role.id); setRoleName(role.name);
    setRoleDesc(role.summary || role.description || ""); setShowRoleForm(true);
  }
  function cancelRoleForm() {
    setShowRoleForm(false); setEditingRoleId(""); setRoleName(""); setRoleDesc("");
  }

  async function handleSaveRole(e) {
    e.preventDefault();
    if (!roleName.trim()) { showErr("Role name is required."); return; }
    const payload = {
      name: roleName.trim(),
      description: roleDesc.trim() || `${roleName.trim()} role`,
      permissions: editingRoleId ? (localPerms[editingRoleId] || []) : []
    };
    let updatedRoles;
    if (editingRoleId) {
      try { await updateStaffRole(editingRoleId, payload); } catch (_) { /* offline */ }
      updatedRoles = staffData.roles.map((r) =>
        r.id === editingRoleId
          ? { ...r, name: payload.name, summary: payload.description, description: payload.description }
          : r
      );
      showMsg("Role updated.");
    } else {
      const newRole = {
        id: `role-${Date.now()}`, name: payload.name,
        summary: payload.description, description: payload.description,
        permissions: [], active: true
      };
      try { await createStaffRole(payload); } catch (_) { /* offline */ }
      updatedRoles = [...staffData.roles, newRole];
      setLocalPerms((p) => ({ ...p, [newRole.id]: [] }));
      setSelectedRoleId(newRole.id);
      showMsg("Role created.");
    }
    setStaffData((p) => ({ ...p, roles: updatedRoles }));
    saveLocal(LOCAL_ROLES_KEY, updatedRoles);
    cancelRoleForm();
  }

  async function handleDeleteRole(role) {
    if (!window.confirm(`Delete role "${role.name}"? Staff with this role will lose their assignment.`)) return;
    try { await deleteStaffRole(role.id); } catch (_) { /* offline */ }
    const updatedRoles = staffData.roles.filter((r) => r.id !== role.id);
    setStaffData((p) => ({ ...p, roles: updatedRoles }));
    saveLocal(LOCAL_ROLES_KEY, updatedRoles);
    if (selectedRoleId === role.id) setSelectedRoleId(updatedRoles[0]?.id || "");
    showMsg("Role deleted.");
  }

  // ── Staff CRUD ────────────────────────────────────────────
  async function handleCreateStaff(e) {
    e.preventDefault();
    setError("");
    if (!staffDraft.fullName.trim()) { showErr("Full name is required."); return; }
    const newMember = {
      id: `staff-${Date.now()}`,
      name: staffDraft.fullName.trim(),
      role: staffDraft.role,
      outlet: staffDraft.outletName,
      login: staffDraft.pin ? "PIN" : "Password",
      status: "Active",
      pin: staffDraft.pin,
      mobileNumber: staffDraft.mobileNumber
    };
    try {
      await createStaffMember({
        fullName: staffDraft.fullName.trim(),
        mobileNumber: staffDraft.mobileNumber,
        outletName: staffDraft.outletName,
        roles: [staffDraft.role],
        pin: staffDraft.pin
      });
    } catch (_) { /* offline — add to local state */ }
    const updatedStaff = [...staffData.staff, newMember];
    setStaffData((p) => ({ ...p, staff: updatedStaff }));
    saveLocal(LOCAL_STAFF_KEY, updatedStaff);
    setStaffDraft(buildDefaultDraft(staffData));
    showMsg(`${newMember.name} added successfully.`);
  }

  function startEditStaff(member) {
    setEditingStaffId(member.id);
    setEditStaffDraft({
      fullName: member.name, mobileNumber: member.mobileNumber || "",
      outletName: member.outlet, role: member.role,
      pin: member.pin || "", isActive: member.status === "Active"
    });
    setError("");
  }
  function cancelEditStaff() { setEditingStaffId(""); setEditStaffDraft(null); }

  async function handleSaveStaff(e) {
    e.preventDefault();
    if (!editStaffDraft?.fullName?.trim()) { showErr("Name is required."); return; }
    const updated = {
      ...staffData.staff.find((m) => m.id === editingStaffId),
      name: editStaffDraft.fullName.trim(),
      mobileNumber: editStaffDraft.mobileNumber,
      outlet: editStaffDraft.outletName,
      role: editStaffDraft.role,
      pin: editStaffDraft.pin,
      login: editStaffDraft.pin ? "PIN" : "Password",
      status: editStaffDraft.isActive ? "Active" : "Inactive"
    };
    try {
      await updateStaffMember(editingStaffId, {
        fullName: updated.name, mobileNumber: updated.mobileNumber,
        outletName: updated.outlet, roles: [updated.role],
        pin: updated.pin, isActive: updated.status === "Active"
      });
    } catch (_) { /* offline */ }
    const updatedStaff = staffData.staff.map((m) => m.id === editingStaffId ? updated : m);
    setStaffData((p) => ({ ...p, staff: updatedStaff }));
    saveLocal(LOCAL_STAFF_KEY, updatedStaff);
    cancelEditStaff();
    showMsg("Staff updated.");
  }

  async function handleDeleteStaff(member) {
    if (!window.confirm(`Delete ${member.name}?`)) return;
    try { await deleteStaffMember(member.id); } catch (_) { /* offline */ }
    const updatedStaff = staffData.staff.filter((m) => m.id !== member.id);
    setStaffData((p) => ({ ...p, staff: updatedStaff }));
    saveLocal(LOCAL_STAFF_KEY, updatedStaff);
    if (editingStaffId === member.id) cancelEditStaff();
    showMsg("Staff deleted.");
  }

  async function handleToggleActive(member) {
    const isActive = member.status !== "Active";
    const updated = { ...member, status: isActive ? "Active" : "Inactive" };
    try {
      await updateStaffMember(member.id, {
        fullName: member.name, mobileNumber: member.mobileNumber || "",
        outletName: member.outlet, roles: [member.role],
        pin: member.pin || "", isActive
      });
    } catch (_) { /* offline */ }
    const updatedStaff = staffData.staff.map((m) => m.id === member.id ? updated : m);
    setStaffData((p) => ({ ...p, staff: updatedStaff }));
    saveLocal(LOCAL_STAFF_KEY, updatedStaff);
    showMsg(isActive ? `${member.name} activated.` : `${member.name} deactivated.`);
  }

  // ── Financial controls ───────────────────────────────────
  function handleSaveFinancials(e) {
    e.preventDefault();
    showMsg("Approval limits saved.");
  }

  // ── Export ───────────────────────────────────────────────
  function handleExportStaff() {
    const rows = [
      ["Name", "Role", "Outlet", "Mobile", "Login", "Status"],
      ...staffData.staff.map((m) => [m.name, m.role, m.outlet, m.mobileNumber || "", m.login, m.status])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "staff.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Computed stats ───────────────────────────────────────
  const totalStaff = staffData.staff.length;
  const activeStaff = staffData.staff.filter((m) => m.status === "Active").length;
  const pendingCount = staffData.staff.filter((m) => m.status !== "Active").length;
  const pinPercent = totalStaff
    ? Math.round((staffData.staff.filter((m) => m.login === "PIN").length / totalStaff) * 100)
    : 0;

  // Group permissions for display
  const permGroups = PERMISSION_CATALOG.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {});

  // Outlet options (fallback if API down)
  const outletOptions = staffData.outlets.length > 0
    ? staffData.outlets.map((o) => o.name)
    : ["Indiranagar", "Koramangala", "HSR Layout"];

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "#666" }}>
        Loading staff data...
      </div>
    );
  }

  return (
    <>
      {/* ── HEADER ── */}
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Team Access</p>
          <h2>Staff &amp; Roles</h2>
        </div>
        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={handleExportStaff}>
            Export Staff
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => addStaffRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            + Add Staff
          </button>
        </div>
      </header>

      {/* ── STATS ── */}
      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Total Staff</span>
          <strong>{totalStaff}</strong>
          <p>Across all outlets</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Active</span>
          <strong>{activeStaff}</strong>
          <p>Currently enabled for login</p>
        </article>
        <article className={`metric-card ${pendingCount > 0 ? "warning" : ""}`}>
          <span className="metric-label">Inactive / Pending</span>
          <strong className={pendingCount > 0 ? "negative" : ""}>{pendingCount}</strong>
          <p>Accounts needing review</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">PIN Login</span>
          <strong>{pinPercent}%</strong>
          <p>Staff with PIN configured</p>
        </article>
      </section>

      {/* ── MESSAGES ── */}
      {message && (
        <div style={{ margin: "0 0 1rem", padding: "0.75rem 1rem", background: "#e8f5e9", color: "#1a7a3a", borderRadius: "8px", fontWeight: 500 }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ margin: "0 0 1rem", padding: "0.75rem 1rem", background: "#fdecea", color: "#c0392b", borderRadius: "8px", fontWeight: 500 }}>
          {error}
        </div>
      )}

      <section className="dashboard-grid staff-layout">

        {/* ── LEFT: ROLE LIBRARY ── */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Roles</p>
              <h3>Role Library</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={openNewRole}>
              + New Role
            </button>
          </div>

          {/* Inline role form */}
          {showRoleForm && (
            <form
              className="simple-form"
              onSubmit={handleSaveRole}
              style={{
                marginBottom: "1rem", padding: "1rem",
                background: "#f8f8f6", borderRadius: "8px",
                border: "1.5px solid #e0ddd6"
              }}
            >
              <label>
                Role name
                <input
                  type="text" value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Supervisor"
                  autoFocus required
                />
              </label>
              <label>
                Description
                <input
                  type="text" value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  placeholder="What can this role do?"
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="submit" className="primary-btn" style={{ flex: 1 }}>
                  {editingRoleId ? "Update Role" : "Create Role"}
                </button>
                <button type="button" className="ghost-btn" onClick={cancelRoleForm}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Role cards */}
          <div className="role-stack">
            {staffData.roles.map((role) => {
              const permCount = (localPerms[role.id] || role.permissions || []).length;
              const isSelected = selectedRole?.id === role.id;
              return (
                <div
                  key={role.id}
                  className={`role-card ${isSelected ? "active-role" : ""}`}
                  onClick={() => { setSelectedRoleId(role.id); setPermsDirty(false); setPermsSaveMsg(""); }}
                  style={{ cursor: "pointer" }}
                >
                  <div className="role-card-header">
                    <strong>{role.name}</strong>
                    <div
                      className="entity-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button type="button" className="ghost-chip" onClick={() => openEditRole(role)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-chip" onClick={() => handleDeleteRole(role)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <span style={{ fontSize: "0.82rem", color: "#666", display: "block", margin: "0.2rem 0" }}>
                    {role.summary}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: isSelected ? "#1a7a3a" : "#999" }}>
                    {permCount} permission{permCount !== 1 ? "s" : ""} enabled
                  </span>
                </div>
              );
            })}
          </div>
        </article>

        {/* ── RIGHT: PERMISSION DESIGN ── */}
        <article className="panel staff-perm-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Permission Design</p>
              <h3>
                {selectedRole ? `${selectedRole.name} — Permissions` : "Select a Role"}
              </h3>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              {permsSaveMsg && (
                <span style={{ color: "#1a7a3a", fontSize: "0.85rem", fontWeight: 500 }}>
                  {permsSaveMsg}
                </span>
              )}
              {permsDirty && (
                <button type="button" className="primary-btn" onClick={handleSavePermissions}>
                  Save Permissions
                </button>
              )}
            </div>
          </div>

          {/* Role tabs */}
          <div className="category-tabs" aria-label="Role selector">
            {staffData.roles.map((role) => (
              <button
                key={role.id} type="button"
                className={selectedRole?.id === role.id ? "tab-active" : ""}
                onClick={() => { setSelectedRoleId(role.id); setPermsDirty(false); setPermsSaveMsg(""); }}
              >
                {role.name}
              </button>
            ))}
          </div>

          {selectedRole ? (
            Object.entries(permGroups).map(([group, perms]) => (
              <div key={group} style={{ marginBottom: "1.5rem" }}>
                <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>{group}</p>
                <div className="permission-grid">
                  {perms.map((p) => {
                    const enabled = currentPerms.includes(p.code);
                    return (
                      <div
                        key={p.code}
                        className={`permission-item ${enabled ? "enabled" : "disabled"}`}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => togglePerm(p.code)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                          <strong style={{ fontSize: "0.88rem" }}>{p.name}</strong>
                          <Toggle enabled={enabled} onChange={() => togglePerm(p.code)} />
                        </div>
                        <span style={{ fontSize: "0.75rem", color: enabled ? "#1a7a3a" : "#999", marginTop: "0.2rem", display: "block" }}>
                          {p.desc}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="panel-empty">Select a role from the left to manage permissions.</div>
          )}
        </article>

        {/* ── ADD STAFF FORM ── */}
        <article className="panel panel-wide" ref={addStaffRef}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Add</p>
              <h3>New Staff Member</h3>
            </div>
          </div>
          <form className="simple-form" onSubmit={handleCreateStaff}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <label>
                Full name *
                <input
                  type="text" value={staffDraft.fullName}
                  onChange={(e) => setStaffDraft((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="Karthik" required
                />
              </label>
              <label>
                Mobile number
                <input
                  type="text" value={staffDraft.mobileNumber}
                  onChange={(e) => setStaffDraft((p) => ({ ...p, mobileNumber: e.target.value }))}
                  placeholder="9876543210"
                />
              </label>
              <label>
                PIN (4 digits)
                <input
                  type="text" maxLength={4} value={staffDraft.pin}
                  onChange={(e) => setStaffDraft((p) => ({ ...p, pin: e.target.value }))}
                  placeholder="1234"
                />
              </label>
              <label>
                Outlet
                <select
                  value={staffDraft.outletName}
                  onChange={(e) => setStaffDraft((p) => ({ ...p, outletName: e.target.value }))}
                >
                  {outletOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select
                  value={staffDraft.role}
                  onChange={(e) => setStaffDraft((p) => ({ ...p, role: e.target.value }))}
                >
                  {staffData.roles.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="primary-btn" style={{ marginTop: "1rem" }}>
              Add Staff Member
            </button>
          </form>
        </article>

        {/* ── STAFF DIRECTORY ── */}
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Team Directory</p>
              <h3>All Staff</h3>
            </div>
            <span style={{ fontSize: "0.85rem", color: "#888" }}>{totalStaff} members</span>
          </div>

          {staffData.staff.length === 0 ? (
            <div className="panel-empty">No staff yet — add one using the form above.</div>
          ) : (
            <div className="staff-table">
              <div className="staff-row staff-head">
                <span>Name</span>
                <span>Role</span>
                <span>Outlet</span>
                <span>Login</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {staffData.staff.map((member) => (
                <div key={member.id}>
                  <div className="staff-row">
                    <span style={{ fontWeight: editingStaffId === member.id ? 600 : 400 }}>
                      {member.name}
                    </span>
                    <span>{member.role}</span>
                    <span>{member.outlet}</span>
                    <span>{member.login}</span>
                    <span className={`status ${statusClass(member.status)}`}>{member.status}</span>
                    <span className="entity-actions">
                      <button type="button" className="ghost-chip" onClick={() => startEditStaff(member)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-chip" onClick={() => handleToggleActive(member)}>
                        {member.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" className="ghost-chip" onClick={() => handleDeleteStaff(member)}>
                        Delete
                      </button>
                    </span>
                  </div>

                  {/* Inline edit form */}
                  {editingStaffId === member.id && editStaffDraft && (
                    <div style={{
                      gridColumn: "1 / -1", padding: "1rem",
                      background: "#f4f3ef", borderRadius: "8px",
                      margin: "0.25rem 0", border: "1.5px solid #e0ddd6"
                    }}>
                      <form className="simple-form" onSubmit={handleSaveStaff}>
                        <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Editing {member.name}</p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                          <label>
                            Full name
                            <input
                              type="text" value={editStaffDraft.fullName}
                              onChange={(e) => setEditStaffDraft((p) => ({ ...p, fullName: e.target.value }))}
                              required
                            />
                          </label>
                          <label>
                            Mobile
                            <input
                              type="text" value={editStaffDraft.mobileNumber}
                              onChange={(e) => setEditStaffDraft((p) => ({ ...p, mobileNumber: e.target.value }))}
                            />
                          </label>
                          <label>
                            PIN
                            <input
                              type="text" maxLength={4} value={editStaffDraft.pin}
                              onChange={(e) => setEditStaffDraft((p) => ({ ...p, pin: e.target.value }))}
                            />
                          </label>
                          <label>
                            Outlet
                            <select
                              value={editStaffDraft.outletName}
                              onChange={(e) => setEditStaffDraft((p) => ({ ...p, outletName: e.target.value }))}
                            >
                              {outletOptions.map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Role
                            <select
                              value={editStaffDraft.role}
                              onChange={(e) => setEditStaffDraft((p) => ({ ...p, role: e.target.value }))}
                            >
                              {staffData.roles.map((r) => (
                                <option key={r.id} value={r.name}>{r.name}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Status
                            <select
                              value={editStaffDraft.isActive ? "Active" : "Inactive"}
                              onChange={(e) => setEditStaffDraft((p) => ({ ...p, isActive: e.target.value === "Active" }))}
                            >
                              <option>Active</option>
                              <option>Inactive</option>
                            </select>
                          </label>
                        </div>
                        <div className="entity-actions" style={{ marginTop: "0.75rem" }}>
                          <button type="submit" className="primary-btn">Save Changes</button>
                          <button type="button" className="ghost-btn" onClick={cancelEditStaff}>Cancel</button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>

        {/* ── FINANCIAL CONTROLS ── */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Financial Control</p>
              <h3>Approval Limits</h3>
            </div>
          </div>
          <form className="simple-form" onSubmit={handleSaveFinancials}>
            <label>
              Cashier discount limit (%)
              <input
                type="number" min="0" max="100" step="0.5"
                value={financialDraft.cashierDiscountLimitPercent}
                onChange={(e) => setFinancialDraft((p) => ({ ...p, cashierDiscountLimitPercent: e.target.value }))}
              />
            </label>
            <label>
              Cashier void limit (₹)
              <input
                type="number" min="0" step="1"
                value={financialDraft.cashierVoidLimitAmount}
                onChange={(e) => setFinancialDraft((p) => ({ ...p, cashierVoidLimitAmount: e.target.value }))}
              />
            </label>
            <button type="submit" className="secondary-btn full-width">Save Limits</button>
          </form>
          <div className="mini-stack" style={{ marginTop: "1rem" }}>
            <div className="mini-card">
              <span>Discount above {financialDraft.cashierDiscountLimitPercent}%</span>
              <strong>→ Manager / Owner approval</strong>
            </div>
            <div className="mini-card">
              <span>Void above ₹{financialDraft.cashierVoidLimitAmount}</span>
              <strong>→ OTP approval required</strong>
            </div>
          </div>
        </article>

        {/* ── LOGIN POLICY ── */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Security</p>
              <h3>Login Policy</h3>
            </div>
          </div>
          <div className="mini-stack">
            <div className="mini-card">
              <span>POS floor login</span>
              <strong>{pinPercent}% PIN enabled</strong>
            </div>
            <div className="mini-card">
              <span>Discount approval</span>
              <strong>Above {financialDraft.cashierDiscountLimitPercent}% → Manager</strong>
            </div>
            <div className="mini-card">
              <span>Void approval</span>
              <strong>Above ₹{financialDraft.cashierVoidLimitAmount} → OTP</strong>
            </div>
            <div className="mini-card">
              <span>Inactive staff login</span>
              <strong>Blocked on all devices</strong>
            </div>
          </div>
        </article>

        {/* ── ACCESS ALERTS ── */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Access Alerts</h3>
            </div>
          </div>
          <div className="alert-list">
            {staffData.alerts.length === 0 ? (
              <div className="panel-empty">No access issues right now.</div>
            ) : (
              staffData.alerts.map((a) => (
                <div key={a.id} className="alert-item">
                  <strong>{a.title}</strong>
                  <span>{a.description}</span>
                </div>
              ))
            )}
          </div>
        </article>

      </section>
    </>
  );
}
