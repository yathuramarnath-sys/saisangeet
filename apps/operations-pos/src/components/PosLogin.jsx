const CASHIERS = [
  { name: "Ravi",    color: "#FF5733", role: "Head Cashier"  },
  { name: "Priya",   color: "#27AE60", role: "Cashier"       },
  { name: "Arjun",   color: "#2980B9", role: "Cashier"       },
  { name: "Ramesh",  color: "#8E44AD", role: "Cashier"       },
  { name: "Karthik", color: "#E67E22", role: "Cashier"       },
  { name: "Sunita",  color: "#C0392B", role: "Cashier"       },
];

export function PosLogin({ outletName, onLogin }) {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long"
  });
  const time = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true
  });

  return (
    <div className="poslogin-screen">

      {/* Header */}
      <div className="poslogin-header">
        <div className="poslogin-logo">🍽</div>
        <h1 className="poslogin-title">{outletName || "Restaurant OS"}</h1>
        <p className="poslogin-meta">{today} &nbsp;·&nbsp; {time}</p>
      </div>

      {/* Prompt */}
      <h2 className="poslogin-heading">Who's serving today?</h2>
      <p className="poslogin-sub">Select your name to start</p>

      {/* Staff grid */}
      <div className="poslogin-grid">
        {CASHIERS.map((staff) => (
          <button
            key={staff.name}
            type="button"
            className="poslogin-staff-btn"
            onClick={() => onLogin(staff.name)}
          >
            <div
              className="poslogin-avatar"
              style={{ background: staff.color }}
            >
              {staff.name[0]}
            </div>
            <span className="poslogin-name">{staff.name}</span>
            <span className="poslogin-role">{staff.role}</span>
          </button>
        ))}
      </div>

      <p className="poslogin-footer">Restaurant OS · POS Terminal</p>
    </div>
  );
}
