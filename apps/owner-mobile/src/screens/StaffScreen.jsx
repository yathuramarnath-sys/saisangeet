import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function StaffScreen() {
  const [users, setUsers]     = useState([]);
  const [shifts, setShifts]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/users").catch(() => []),
      api.get("/shifts/summary").catch(() => ({})),
    ]).then(([usersData, shiftData]) => {
      setUsers(Array.isArray(usersData) ? usersData : usersData?.users || []);
      setShifts(Array.isArray(shiftData) ? shiftData : shiftData?.shifts || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Floor staff only (no passwordHash = not web login accounts)
  const floorStaff = users.filter(u => u.isActive !== false && !u.passwordHash);

  function getInitials(name) {
    return (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function getRole(u) {
    return (Array.isArray(u.roles) ? u.roles[0] : u.role) || "Staff";
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Staff</h2>
        <span className="badge-count">{floorStaff.length} active</span>
      </div>

      {loading ? (
        <div className="loading-state">Loading staff…</div>
      ) : floorStaff.length === 0 ? (
        <div className="empty-state">
          <p>No floor staff added yet.</p>
          <p>Add staff from the Owner Console → Staff page.</p>
        </div>
      ) : (
        <div className="staff-list">
          {floorStaff.map(u => {
            const initials = getInitials(u.fullName || u.name);
            const role     = getRole(u);
            const outlet   = u.outletName || "All Outlets";
            const hasPin   = !!(u.pin && u.pin !== "0000");

            return (
              <div className="staff-card" key={u.id}>
                <div className="staff-avatar" data-role={role.toLowerCase()}>
                  {initials}
                </div>
                <div className="staff-info">
                  <p className="staff-name">{u.fullName || u.name}</p>
                  <p className="staff-role">{role} · {outlet}</p>
                </div>
                <div className="staff-meta">
                  {u.canApplyDiscount && (
                    <span className="staff-badge disc">Discount</span>
                  )}
                  {hasPin && (
                    <span className="staff-badge pin">PIN ✓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
