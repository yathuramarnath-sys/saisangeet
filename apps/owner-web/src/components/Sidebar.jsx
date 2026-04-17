import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { navigation } from "../data/navigation";

export function Sidebar() {
  const { user, logout } = useAuth();

  const initials = user?.fullName
    ? user.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "O";

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">R</div>
        <div>
          <p className="eyebrow">Restaurant OS</p>
          <h1 className="brand-title">Owner Console</h1>
        </div>
      </div>

      <nav className="nav-list" aria-label="Owner navigation">
        {navigation.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <strong>{user?.fullName || "Owner"}</strong>
          <span>{user?.roles?.[0] || "Admin"}</span>
        </div>
        <button
          type="button"
          className="sidebar-logout"
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
