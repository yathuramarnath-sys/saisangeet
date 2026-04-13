import { useEffect, useState } from "react";

import { fetchStaffData } from "./staff.service";
import { subscribeRestaurantState, updatePermissionPolicies } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";

function statusClass(status) {
  return status === "Approval pending" ? "warning" : "online";
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
    alerts: []
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdatedPermission, setLastUpdatedPermission] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchStaffData();

      if (!cancelled) {
        setStaffData(result);
        setLoading(false);
      }
    }

    load();

    const unsubscribe = subscribeRestaurantState(async () => {
      const result = await fetchStaffData();

      if (!cancelled) {
        setStaffData(result);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const totalStaff = staffData.staff.length || 28;
  const totalRoles = staffData.roles.length || 5;
  const pendingApprovals =
    staffData.staff.filter((member) => member.status === "Approval pending").length || 2;

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

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Team Access</p>
          <h2>Staff & Roles</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Export Staff
          </button>
          <button type="button" className="primary-btn">
            Add Staff
          </button>
        </div>
      </header>

      <section className="hero-panel staff-hero">
        <div>
          <p className="hero-label">Role-based control</p>
          <h3>Give every staff member only the access they need</h3>
          <p className="hero-copy">
            Owners can create cashier, captain, waiter, manager, and kitchen roles with clear
            permissions for billing, KOT, table movement, discounts, and approvals.
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
          <strong>3</strong>
          <p>Can take orders, send KOT, move tables</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Waiters</span>
          <strong>8</strong>
          <p>Can add orders and kitchen instructions</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Managers with approvals</span>
          <strong>4</strong>
          <p>Discount and void approval enabled</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">PIN login enabled</span>
          <strong>100%</strong>
          <p>All floor staff can use fast POS login</p>
        </article>
      </section>

      <section className="dashboard-grid staff-layout">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Roles</p>
              <h3>Role Library</h3>
            </div>
            <button type="button" className="ghost-btn">
              Create role
            </button>
          </div>

          <div className="role-stack">
            {staffData.roles.map((role) => (
              <div key={role.id} className={`role-card ${role.active ? "active-role" : ""}`}>
                <strong>{role.name}</strong>
                <span>{role.summary}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Permission Design</p>
              <h3>Captain Role Permissions</h3>
            </div>
            <button type="button" className="ghost-btn">
              Edit permissions
            </button>
          </div>

          <div className="permission-grid">
            {staffData.permissions.map((permission) => (
              <div
                key={permission.id}
                className={`permission-item ${permission.disabled ? "disabled" : "enabled"}`}
              >
                <strong>{permission.name}</strong>
                <span>{permission.status}</span>
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
            <button type="button" className="ghost-btn">
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
            <button type="button" className="ghost-btn">
              Save policy
            </button>
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

          <form className="simple-form">
            <label>
              Full name
              <input type="text" defaultValue="Karthik" />
            </label>
            <label>
              Mobile number
              <input type="text" defaultValue="9876543210" />
            </label>
            <label>
              Outlet
              <select defaultValue="Indiranagar">
                <option>Indiranagar</option>
                <option>Koramangala</option>
              </select>
            </label>
            <label>
              Role
              <select defaultValue="Captain">
                <option>Captain</option>
                <option>Waiter</option>
                <option>Cashier</option>
              </select>
            </label>
            <label>
              PIN
              <input type="text" defaultValue="1234" />
            </label>
            <button type="button" className="primary-btn full-width">
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
            <button type="button" className="ghost-btn">
              Manage staff
            </button>
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
              </div>
              {staffData.staff.map((member) => (
                <div key={member.id} className="staff-row">
                  <span>{member.name}</span>
                  <span>{member.role}</span>
                  <span>{member.outlet}</span>
                  <span>{member.login}</span>
                  <span className={`status ${statusClass(member.status)}`}>{member.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Table Setup Access</p>
              <h3>Cashier Can Create Tables</h3>
            </div>
            <button type="button" className="ghost-btn">
              Edit access
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
                <span className="status online">{item.status}</span>
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
              <strong>PIN enabled</strong>
            </div>
            <div className="mini-card">
              <span>Manager login</span>
              <strong>Password required</strong>
            </div>
            <div className="mini-card">
              <span>Session timeout</span>
              <strong>20 minutes</strong>
            </div>
            <div className="mini-card">
              <span>Discount approval</span>
              <strong>Manager required</strong>
            </div>
            <div className="mini-card">
              <span>Table creation</span>
              <strong>Cashier allowed</strong>
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
