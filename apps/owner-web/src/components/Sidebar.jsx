import { NavLink } from "react-router-dom";

import { navigation } from "../data/navigation";

export function Sidebar() {
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

      <div className="sidebar-card">
        <p className="sidebar-label">Platform Direction</p>
        <strong>Industry-ready owner web</strong>
        <span>Web control center for setup, reporting, and multi-outlet administration.</span>
      </div>
    </aside>
  );
}
