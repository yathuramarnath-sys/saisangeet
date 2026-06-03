export function StatCard({ label, value, icon, color }) {
  return (
    <div className="stat-card">
      <span className="stat-icon" style={{ background: color + "18", color }}>
        {icon}
      </span>
      <div>
        <p className="stat-value">{value}</p>
        <p className="stat-label">{label}</p>
      </div>
    </div>
  );
}
