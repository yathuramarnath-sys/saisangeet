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
import { subscribeRestaurantState, updatePermissionPolicies } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";

function statusClass(status) {
  return status === "Inactive" ? "warning" : "online";
}

function buildDefaultStaffDraft(staffData) {
  return {
    fullName: "",
    mobileNumber: "",
    outletName: staffData.outlets?.[0]?.name || "Indiranagar",
    role: staffData.roles?.[0]?.name || "Captain",
    pin: "1234"
  };
}

export function StaffPage() {
  const [staffData, setStaffData] = useState({
    roles: [],
    permissions: [],
    accessMatrix: [],
    permissionEditor: [],
    financialControls: [],
    staff: [],
    tableAccess: [],
    alerts: [],
    outlets: [],
    policyValues: {
      cashierDiscountLimitPercent: 5,
      cashierVoidLimitAmount: 200
    }
  });
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [lastUpdatedPermission, setLastUpdatedPermission] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [editingRoleId, setEditingRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [rolePermissionCodes, setRolePermissionCodes] = useState([]);
  const [editingStaffId, setEditingStaffId] = useState("");
  const [staffDraft, setStaffDraft] = useState(buildDefaultStaffDraft({ roles: [], outlets: [] }));
  const [editStaffDraft, setEditStaffDraft] = useState(null);
  const [financialDraft, setFinancialDraft] = useState({
    cashierDiscountLimitPercent: 5,
    cashierVoidLimitAmount: 200
  });
  const staffFormRef = useRef(null);
  const roleFormRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchStaffData();

      if (cancelled) {
        return;
      }

      setStaffData(result);
      setFinancialDraft(result.policyValues);
      setStaffDraft(buildDefaultStaffDraft(result));
      setSelectedRoleId((current) => current || result.roles[0]?.id || "");
      setLoading(false);
    }

    load();

    const unsubscribe = subscribeRestaurantState(async () => {
      const result = await fetchStaffData();

      if (cancelled) {
        return;
      }

      setStaffData(result);
      setFinancialDraft(result.policyValues);
      setSelectedRoleId((current) => current || result.roles[0]?.id || "");
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function reloadStaff() {
    const result = await fetchStaffData();
    setStaffData(result);
    setFinancialDraft(result.policyValues);
    setStaffDraft((current) => ({
      ...current,
      outletName: result.outlets.some((outlet) => outlet.name === current.outletName)
        ? current.outletName
        : result.outlets[0]?.name || "",
      role: result.roles.some((role) => role.name === current.role) ? current.role : result.roles[0]?.name || ""
    }));
    setSelectedRoleId((current) => (result.roles.some((role) => role.id === current) ? current : result.roles[0]?.id || ""));
    setLoading(false);
    return result;
  }

  const totalStaff = staffData.staff.length;
  const totalRoles = staffData.roles.length;
  const pendingApprovals = staffData.staff.filter((member) => member.status !== "Active").length;
  const captainsCount = staffData.staff.filter((member) => member.role === "Captain" && member.status === "Active").length;
  const waitersCount = staffData.staff.filter((member) => member.role === "Waiter" && member.status === "Active").length;
  const managersWithApprovals = staffData.roles.filter(
    (role) => role.name === "Manager" && role.permissions.includes("operations.discount.approve")
  ).length;
  const pinLoginPercent = totalStaff ? Math.round((staffData.staff.filter((member) => member.login === "PIN").length / totalStaff) * 100) : 0;

  const selectedRole = useMemo(
    () => staffData.roles.find((role) => role.id === selectedRoleId) || staffData.roles[0] || null,
    [staffData.roles, selectedRoleId]
  );

  const visiblePermissions = useMemo(
    () =>
      staffData.permissions.map((permission) => {
        const enabled = selectedRole?.permissions?.includes(permission.code);

        return {
          ...permission,
          status: enabled ? "Enabled" : "Disabled",
          disabled: !enabled
        };
      }),
    [staffData.permissions, selectedRole]
  );

  const groupedRoleFormPermissions = useMemo(() => {
    return staffData.permissions.reduce((groups, permission) => {
      const groupKey = permission.workflowArea || "Operations";
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(permission);
      return groups;
    }, {});
  }, [staffData.permissions]);

  const groupedVisiblePermissions = useMemo(() => {
    return visiblePermissions.reduce((groups, permission) => {
      const groupKey = permission.workflowArea || "Operations";
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(permission);
      return groups;
    }, {});
  }, [visiblePermissions]);

  function resetRoleForm() {
    setEditingRoleId("");
    setRoleName("");
    setRoleDescription("");
    setRolePermissionCodes([]);
  }

  function startEditingRole(role) {
    setEditingRoleId(role.id);
    setSelectedRoleId(role.id);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    setRolePermissionCodes(role.permissions || []);
    setFormError("");
    setFormMessage("");
    roleFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleDeleteRole(role) {
    if (!window.confirm(`Delete role ${role.name}? Staff with this role will lose that assignment.`)) {
      return;
    }

    try {
      setFormError("");
      setFormMessage("");
      await deleteStaffRole(role.id);
      resetRoleForm();
      await reloadStaff();
      setFormMessage("Role deleted.");
    } catch (error) {
      setFormError(error.message || "Unable to delete role.");
    }
  }

  function toggleRolePermission(code) {
    setRolePermissionCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    );
  }

  async function handleCreateOrUpdateRole(event) {
    event.preventDefault();

    if (!roleName.trim()) {
      setFormError("Role name is required.");
      return;
    }

    const payload = {
      name: roleName.trim(),
      description: roleDescription.trim() || `${roleName.trim()} role created from owner dashboard`,
      permissions: rolePermissionCodes
    };

    try {
      setFormError("");
      setFormMessage("");

      if (editingRoleId) {
        await updateStaffRole(editingRoleId, payload);
        setFormMessage(`${payload.name} role updated.`);
      } else {
        await createStaffRole(payload);
        setFormMessage(`${payload.name} role created.`);
      }

      resetRoleForm();
      const result = await reloadStaff();
      const matchingRole = result.roles.find((role) => role.name === payload.name);
      if (matchingRole) {
        setSelectedRoleId(matchingRole.id);
      }
    } catch (error) {
      setFormError(error.message || "Unable to save role.");
    }
  }

  async function handleCreateStaff(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      setFormError("");
      setFormMessage("");
      await createStaffMember({
        fullName: formData.get("fullName"),
        mobileNumber: formData.get("mobileNumber"),
        outletName: formData.get("outletName"),
        roles: [formData.get("role")],
        pin: formData.get("pin")
      });

      const result = await reloadStaff();
      setStaffDraft(buildDefaultStaffDraft(result));
      event.currentTarget.reset();
      setFormMessage("Staff member created.");
    } catch (error) {
      setFormError(error.message || "Unable to create staff member.");
    }
  }

  function startEditingStaff(member) {
    setEditingStaffId(member.id);
    setEditStaffDraft({
      fullName: member.name,
      mobileNumber: member.mobileNumber || "",
      outletName: member.outlet,
      role: member.role,
      pin: member.pin || "",
      isActive: member.status === "Active"
    });
    setFormError("");
    setFormMessage("");
  }

  function cancelEditingStaff() {
    setEditingStaffId("");
    setEditStaffDraft(null);
  }

  async function handleSaveStaffEdit(event) {
    event.preventDefault();

    if (!editingStaffId || !editStaffDraft?.fullName?.trim()) {
      setFormError("Staff name is required.");
      return;
    }

    try {
      setFormError("");
      setFormMessage("");
      await updateStaffMember(editingStaffId, {
        fullName: editStaffDraft.fullName.trim(),
        mobileNumber: editStaffDraft.mobileNumber,
        outletName: editStaffDraft.outletName,
        roles: [editStaffDraft.role],
        pin: editStaffDraft.pin,
        isActive: editStaffDraft.isActive
      });
      await reloadStaff();
      cancelEditingStaff();
      setFormMessage("Staff member updated.");
    } catch (error) {
      setFormError(error.message || "Unable to update staff member.");
    }
  }

  async function handleDeleteStaff(member) {
    if (!window.confirm(`Delete staff member ${member.name}?`)) {
      return;
    }

    try {
      setFormError("");
      setFormMessage("");
      await deleteStaffMember(member.id);
      if (editingStaffId === member.id) {
        cancelEditingStaff();
      }
      await reloadStaff();
      setFormMessage("Staff member deleted.");
    } catch (error) {
      setFormError(error.message || "Unable to delete staff member.");
    }
  }

  async function toggleStaffActive(member) {
    try {
      setFormError("");
      setFormMessage("");
      await updateStaffMember(member.id, {
        fullName: member.name,
        mobileNumber: member.mobileNumber || "",
        outletName: member.outlet,
        roles: [member.role],
        pin: member.pin || "",
        isActive: member.status !== "Active"
      });
      await reloadStaff();
      setFormMessage(member.status === "Active" ? "Staff member deactivated." : "Staff member activated.");
    } catch (error) {
      setFormError(error.message || "Unable to update staff status.");
    }
  }

  function togglePermissionEditorItem(itemId) {
    updatePermissionPolicies((current) => ({
      ...current,
      [itemId]: !current[itemId]
    }));

    setStaffData((current) => {
      const nextEditor = current.permissionEditor.map((item) =>
        item.id === itemId ? { ...item, enabled: !item.enabled } : item
      );
      const changedItem = nextEditor.find((item) => item.id === itemId);
      setLastUpdatedPermission(
        changedItem ? `${changedItem.role}: ${changedItem.label} ${changedItem.enabled ? "enabled" : "disabled"}` : ""
      );

      return {
        ...current,
        permissionEditor: nextEditor
      };
    });
  }

  function handleSaveFinancialControls() {
    updatePermissionPolicies((current) => ({
      ...current,
      "cashier-discount-limit-percent": Number(financialDraft.cashierDiscountLimitPercent || 0),
      "cashier-void-limit-amount": Number(financialDraft.cashierVoidLimitAmount || 0)
    }));
    setFormError("");
    setFormMessage("Financial control policy updated.");
  }

  function toggleCashierTableSetup() {
    togglePermissionEditorItem("cashier-table-setup");
  }

  function handleExportStaff() {
    const rows = [
      ["Name", "Role", "Outlet", "Mobile", "Login", "Status"],
      ...staffData.staff.map((member) => [
        member.name,
        member.role,
        member.outlet,
        member.mobileNumber || "",
        member.login,
        member.status
      ])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "staff-directory.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportMatrix() {
    const rows = [
      ["Role", "Outlet Scope", "Closing Day", "Discount", "Void", "Reports", "Table Control"],
      ...staffData.accessMatrix.map((item) => [
        item.role,
        item.outletScope,
        item.closeDay,
        item.discountOverride,
        item.voidApproval,
        item.reports,
        item.tableControl
      ])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "role-access-matrix.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Team Access</p>
          <h2>Staff & Roles</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={handleExportStaff}>
            Export Staff
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => staffFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Add Staff
          </button>
        </div>
      </header>

      <section className="hero-panel staff-hero">
        <div>
          <p className="hero-label">Role-based control</p>
          <h3>Give every staff member only the access they need</h3>
          <p className="hero-copy">
            Owner setup now controls real role creation, permission assignment, staff outlet mapping, and live access rules.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Total staff</span>
            <strong>{totalStaff}</strong>
          </div>
          <div>
            <span>Roles active</span>
            <strong>{totalRoles}</strong>
          </div>
          <div>
            <span>Pending approvals</span>
            <strong className="negative">{pendingApprovals}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Captains</span>
          <strong>{captainsCount}</strong>
          <p>Active captain accounts ready for order taking and KOT send</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Waiters</span>
          <strong>{waitersCount}</strong>
          <p>Active waiter accounts ready for table service and bill request</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Managers with approvals</span>
          <strong>{managersWithApprovals}</strong>
          <p>Managers who currently have approval permissions assigned</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">PIN login enabled</span>
          <strong>{pinLoginPercent}%</strong>
          <p>Share of staff accounts currently configured with PIN login</p>
        </article>
      </section>

      <section className="dashboard-grid staff-layout">
        <article ref={staffFormRef} className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Roles</p>
              <h3>Role Library</h3>
            </div>
            <div className="entity-actions">
              {editingRoleId ? (
                <button type="button" className="ghost-btn" onClick={resetRoleForm}>
                  Cancel Edit
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-btn"
                onClick={() => roleFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Create role
              </button>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreateOrUpdateRole} ref={roleFormRef}>
            <label>
              Role name
              <input
                type="text"
                value={roleName}
                onChange={(event) => setRoleName(event.target.value)}
                placeholder="Cashier"
              />
            </label>
            <label>
              Role description
              <input
                type="text"
                value={roleDescription}
                onChange={(event) => setRoleDescription(event.target.value)}
                placeholder="Can bill, collect payment, and print invoices"
              />
            </label>
            <div className="mini-stack">
              {Object.entries(groupedRoleFormPermissions).map(([groupName, permissions]) => (
                <div key={groupName} className="mini-card">
                  <strong>{groupName}</strong>
                  <div className="mini-stack">
                    {permissions.map((permission) => (
                      <label key={permission.id} className="mini-card">
                        <span>{permission.name}</span>
                        <span>{permission.description}</span>
                        <input
                          type="checkbox"
                          checked={rolePermissionCodes.includes(permission.code)}
                          onChange={() => toggleRolePermission(permission.code)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button type="submit" className="secondary-btn full-width">
              {editingRoleId ? "Update Role" : "Save Role"}
            </button>
          </form>

          <div className="role-stack">
            {staffData.roles.map((role) => (
              <div key={role.id} className={`role-card ${selectedRole?.id === role.id ? "active-role" : ""}`}>
                <strong>{role.name}</strong>
                <span>{role.summary}</span>
                <div className="entity-actions">
                  <button type="button" className="ghost-chip" onClick={() => setSelectedRoleId(role.id)}>
                    View
                  </button>
                  <button type="button" className="ghost-chip" onClick={() => startEditingRole(role)}>
                    Edit
                  </button>
                  <button type="button" className="ghost-chip" onClick={() => handleDeleteRole(role)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Permission Design</p>
              <h3>{selectedRole ? `${selectedRole.name} Role Permissions` : "Role Permissions"}</h3>
            </div>
          </div>

          <div className="category-tabs" aria-label="Role selector">
            {staffData.roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={selectedRole?.id === role.id ? "tab-active" : ""}
                onClick={() => setSelectedRoleId(role.id)}
              >
                {role.name}
              </button>
            ))}
          </div>

          <div className="mini-stack">
            {Object.entries(groupedVisiblePermissions).map(([groupName, permissions]) => (
              <div key={groupName} className="mini-card">
                <strong>{groupName}</strong>
                <div className="permission-grid">
                  {permissions.map((permission) => (
                    <div
                      key={permission.id}
                      className={`permission-item ${permission.disabled ? "disabled" : "enabled"}`}
                    >
                      <strong>{permission.name}</strong>
                      <span>{permission.status}</span>
                      <span>{permission.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Permission Visibility</p>
              <h3>Role Access Matrix</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={handleExportMatrix}>
              Export matrix
            </button>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Role</span>
              <span>Outlet scope</span>
              <span>Closing day</span>
              <span>Discount</span>
              <span>Void</span>
              <span>Reports</span>
              <span>Table control</span>
            </div>
            {staffData.accessMatrix.map((item) => (
              <div key={item.id} className="staff-row">
                <span>{item.role}</span>
                <span>{item.outletScope}</span>
                <span>{item.closeDay}</span>
                <span>{item.discountOverride}</span>
                <span>{item.voidApproval}</span>
                <span>{item.reports}</span>
                <span>{item.tableControl}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Permission Editor</p>
              <h3>Role Permission Editor</h3>
            </div>
          </div>

          <div className="mini-stack">
            {staffData.permissionEditor.map((item) => (
              <div key={item.id} className="mini-card">
                <span>{item.role} • {item.label}</span>
                <strong>{item.enabled ? "Enabled" : "Disabled"}</strong>
                <span>{item.detail}</span>
                <button
                  type="button"
                  className={item.enabled ? "secondary-btn" : "primary-btn"}
                  onClick={() => togglePermissionEditorItem(item.id)}
                >
                  {item.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>

          <div className="panel-empty">
            {lastUpdatedPermission || "Choose a role permission to enable or disable for daily operations."}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Financial Control</p>
              <h3>Discount Approval Rule</h3>
            </div>
          </div>

          <form
            className="simple-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveFinancialControls();
            }}
          >
            <label>
              Cashier discount limit (%)
              <input
                type="number"
                min="0"
                step="0.01"
                value={financialDraft.cashierDiscountLimitPercent}
                onChange={(event) =>
                  setFinancialDraft((current) => ({
                    ...current,
                    cashierDiscountLimitPercent: event.target.value
                  }))
                }
              />
            </label>
            <label>
              Cashier void limit (Rs)
              <input
                type="number"
                min="0"
                step="1"
                value={financialDraft.cashierVoidLimitAmount}
                onChange={(event) =>
                  setFinancialDraft((current) => ({
                    ...current,
                    cashierVoidLimitAmount: event.target.value
                  }))
                }
              />
            </label>
            <button type="submit" className="secondary-btn full-width">
              Save Financial Rules
            </button>
          </form>

          <div className="mini-stack">
            {staffData.financialControls.map((item) => (
              <div key={item.id} className="mini-card">
                <span>{item.title}</span>
                <strong>{item.value}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Staff</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreateStaff}>
            <label>
              Full name
              <input
                type="text"
                name="fullName"
                value={staffDraft.fullName}
                onChange={(event) => setStaffDraft((current) => ({ ...current, fullName: event.target.value }))}
                required
              />
            </label>
            <label>
              Mobile number
              <input
                type="text"
                name="mobileNumber"
                value={staffDraft.mobileNumber}
                onChange={(event) => setStaffDraft((current) => ({ ...current, mobileNumber: event.target.value }))}
              />
            </label>
            <label>
              Outlet
              <select
                name="outletName"
                value={staffDraft.outletName}
                onChange={(event) => setStaffDraft((current) => ({ ...current, outletName: event.target.value }))}
              >
                {staffData.outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.name}>
                    {outlet.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select
                name="role"
                value={staffDraft.role}
                onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value }))}
              >
                {staffData.roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              PIN
              <input
                type="text"
                name="pin"
                value={staffDraft.pin}
                onChange={(event) => setStaffDraft((current) => ({ ...current, pin: event.target.value }))}
              />
            </label>
            {formMessage ? <p>{formMessage}</p> : null}
            {formError ? <p>{formError}</p> : null}
            <button type="submit" className="primary-btn full-width">
              Create Staff
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Team Directory</p>
              <h3>Outlet Staff</h3>
            </div>
          </div>

          {loading ? (
            <div className="panel-empty">Loading staff members...</div>
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
                <div key={member.id} className="staff-row">
                  <span>{member.name}</span>
                  <span>{member.role}</span>
                  <span>{member.outlet}</span>
                  <span>{member.login}</span>
                  <span className={`status ${statusClass(member.status)}`}>{member.status}</span>
                  <span className="entity-actions">
                    <button type="button" className="ghost-chip" onClick={() => startEditingStaff(member)}>
                      Edit
                    </button>
                    <button type="button" className="ghost-chip" onClick={() => toggleStaffActive(member)}>
                      {member.status === "Active" ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" className="ghost-chip" onClick={() => handleDeleteStaff(member)}>
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {editingStaffId && editStaffDraft ? (
            <form className="simple-form" onSubmit={handleSaveStaffEdit}>
              <label>
                Full name
                <input
                  type="text"
                  value={editStaffDraft.fullName}
                  onChange={(event) =>
                    setEditStaffDraft((current) => ({ ...current, fullName: event.target.value }))
                  }
                />
              </label>
              <label>
                Mobile number
                <input
                  type="text"
                  value={editStaffDraft.mobileNumber}
                  onChange={(event) =>
                    setEditStaffDraft((current) => ({ ...current, mobileNumber: event.target.value }))
                  }
                />
              </label>
              <label>
                Outlet
                <select
                  value={editStaffDraft.outletName}
                  onChange={(event) =>
                    setEditStaffDraft((current) => ({ ...current, outletName: event.target.value }))
                  }
                >
                  {staffData.outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.name}>
                      {outlet.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select
                  value={editStaffDraft.role}
                  onChange={(event) => setEditStaffDraft((current) => ({ ...current, role: event.target.value }))}
                >
                  {staffData.roles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                PIN
                <input
                  type="text"
                  value={editStaffDraft.pin}
                  onChange={(event) => setEditStaffDraft((current) => ({ ...current, pin: event.target.value }))}
                />
              </label>
              <label>
                Status
                <select
                  value={editStaffDraft.isActive ? "Active" : "Inactive"}
                  onChange={(event) =>
                    setEditStaffDraft((current) => ({
                      ...current,
                      isActive: event.target.value === "Active"
                    }))
                  }
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
              <div className="entity-actions">
                <button type="submit" className="primary-btn">
                  Save Staff
                </button>
                <button type="button" className="ghost-btn" onClick={cancelEditingStaff}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Table Setup Access</p>
              <h3>Cashier Can Create Tables</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={toggleCashierTableSetup}>
              {staffData.permissionEditor.find((item) => item.id === "cashier-table-setup")?.enabled ? "Disable access" : "Enable access"}
            </button>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Area</span>
              <span>Table</span>
              <span>Seats</span>
              <span>Created By</span>
              <span>Status</span>
            </div>
            {staffData.tableAccess.map((item) => (
              <div key={item.id} className="staff-row">
                <span>{item.area}</span>
                <span>{item.table}</span>
                <span>{item.seats}</span>
                <span>{item.createdBy}</span>
                <span className={`status ${item.status === "Blocked" ? "warning" : "online"}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Security Rules</p>
              <h3>Login Policy</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>POS floor login</span>
              <strong>{pinLoginPercent}% PIN enabled</strong>
            </div>
            <div className="mini-card">
              <span>Manager login</span>
              <strong>{managersWithApprovals > 0 ? "Approval ready" : "Needs review"}</strong>
            </div>
            <div className="mini-card">
              <span>Discount approval</span>
              <strong>Above {financialDraft.cashierDiscountLimitPercent}% goes to manager / owner</strong>
            </div>
            <div className="mini-card">
              <span>Void approval</span>
              <strong>Above Rs {financialDraft.cashierVoidLimitAmount} needs approval</strong>
            </div>
            <div className="mini-card">
              <span>Table creation</span>
              <strong>
                {staffData.permissionEditor.find((item) => item.id === "cashier-table-setup")?.enabled
                  ? "Cashier allowed"
                  : "Owner only"}
              </strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Access Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {staffData.alerts.map((alert) => (
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
