const TABS = [
  { id: "live",    icon: "⚡", label: "Live"    },
  { id: "sales",   icon: "📊", label: "Sales"   },
  { id: "staff",   icon: "👥", label: "Staff"   },
  { id: "alerts",  icon: "🔔", label: "Alerts"  },
  { id: "actions", icon: "⚙️", label: "More"    },
];

export function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`nav-item ${active === t.id ? "active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
