import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

// Read-only snapshot from Plato Attendance (separate app), fetched through the
// DineXPOS server: one day's staff attendance + salary cost, and last month's
// salary total (January's total shows from 1 February).

function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

function dayLabel(dateStr, today) {
  if (dateStr === today) return "Today";
  if (dateStr === shiftDay(today, -1)) return "Yesterday";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function time12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h % 24 < 12 ? "AM" : "PM"}`;
}

const GROUPS = [
  { key: "present", label: "Present", color: "#16a34a", bg: "#f0fdf4", icon: "✅" },
  { key: "working", label: "At work now", color: "#2563eb", bg: "#eff6ff", icon: "🟢" },
  { key: "halfDay", label: "Half day", color: "#ca8a04", bg: "#fefce8", icon: "🌗" },
  { key: "absent", label: "Absent", color: "#e11d48", bg: "#fff1f2", icon: "❌" },
  { key: "notYet", label: "Not in yet", color: "#6b7280", bg: "#f3f4f6", icon: "⏳" }
];

export function AttendanceScreen() {
  const [data, setData] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [outlet, setOutlet] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [date, setDate] = useState(null); // null = today (as the server sees it)
  const [open, setOpen] = useState(null); // expanded status list
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (outlet) params.set("outletId", outlet.id);
      const qs = params.toString();
      const [sum, outletData] = await Promise.all([
        api.get(`/attendance/summary${qs ? `?${qs}` : ""}`),
        api.get("/outlets").catch(() => [])
      ]);
      setData(sum);
      setOutlets(Array.isArray(outletData) ? outletData : outletData?.outlets || []);
      setError("");
    } catch (err) {
      setError(err.message || "Attendance is not available right now.");
    } finally {
      setLoading(false);
    }
  }, [date, outlet]);

  useEffect(() => {
    load();
    // Today refreshes itself; past days don't change.
    if (date) return undefined;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load, date]);

  const d = data?.day;
  const lm = data?.lastMonth;
  const shown = data?.date;
  const today = data?.today;

  return (
    <div className="screen">
      <div className="live-header">
        <div>
          <p className="live-date">{data?.businessName || "Plato Attendance"}</p>
          <h2 className="live-heading">Attendance</h2>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          <span className={loading ? "spin" : ""}>↻</span>
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Outlet + day */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 8, alignItems: "center" }}>
        <button className="outlet-filter-btn" onClick={() => setShowPicker(true)}>
          <span className="of-dot" />
          <span className="of-label">{outlet ? outlet.name : "All Outlets"}</span>
          <span className="of-arrow">▾</span>
        </button>
        {shown && (
          <div className="att-daynav">
            <button onClick={() => setDate(shiftDay(shown, -1))} aria-label="Previous day">‹</button>
            <span>{dayLabel(shown, today)}</span>
            <button onClick={() => setDate(shiftDay(shown, 1) >= today ? null : shiftDay(shown, 1))} disabled={shown >= today} aria-label="Next day">›</button>
          </div>
        )}
      </div>
      {data && outlet && !data.outletLinked && (
        <p className="att-note">This outlet is not linked in Attendance yet — showing all branches. Open Attendance once from the Owner Console to link it.</p>
      )}

      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Outlet</h3>
              <button onClick={() => setShowPicker(false)}>✕</button>
            </div>
            <button className={`outlet-option ${!outlet ? "active" : ""}`} onClick={() => { setOutlet(null); setShowPicker(false); }}>
              All Outlets
            </button>
            {outlets.map((o) => (
              <button
                key={o.id}
                className={`outlet-option ${outlet?.id === o.id ? "active" : ""}`}
                onClick={() => { setOutlet(o); setShowPicker(false); }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="loading-state">Loading attendance…</div>
      ) : d ? (
        <>
          {/* Day's salary cost */}
          <div className="hero-card">
            <p className="hero-label">Salary cost · {dayLabel(shown, today)}</p>
            <p className="hero-value">{fmt(d.salaryCost)}</p>
            <p className="hero-sub">
              {d.present + d.working + d.halfDay} of {d.total} staff worked
              {d.extraDuty > 0 ? ` · + ${fmt(d.extraDuty)} extra duty` : ""}
            </p>
          </div>

          {/* Counts */}
          <div className="kpi-grid">
            {GROUPS.filter((g) => g.key !== "working" || d.working > 0)
              .filter((g) => g.key !== "notYet" || d.notYet > 0)
              .map((g) => (
                <button key={g.key} className="kpi-card att-kpi" onClick={() => setOpen(open === g.key ? null : g.key)}>
                  <span className="kpi-icon" style={{ background: g.bg, color: g.color }}>{g.icon}</span>
                  <p className="kpi-val">{d[g.key]}</p>
                  <p className="kpi-label">{g.label}</p>
                  <p className="kpi-sub">{open === g.key ? "Hide names ▴" : "Show names ▾"}</p>
                </button>
              ))}
            <button className="kpi-card att-kpi" onClick={() => setOpen(open === "late" ? null : "late")}>
              <span className="kpi-icon" style={{ background: "#fff7ed", color: "#ea580c" }}>⏰</span>
              <p className="kpi-val">{d.late}</p>
              <p className="kpi-label">Late arrivals</p>
              <p className="kpi-sub">{open === "late" ? "Hide names ▴" : "Show names ▾"}</p>
            </button>
          </div>
          {d.missedPunch > 0 && (
            <p className="att-note">⚠️ {d.missedPunch} with a missed punch — the manager fixes these in Attendance → Month-end check.</p>
          )}

          {/* Names for the tapped group */}
          {open && (
            <div className="section-card" style={{ margin: "0 16px 16px" }}>
              <h3 className="section-title">
                {open === "late" ? "Late arrivals" : GROUPS.find((g) => g.key === open).label} · {dayLabel(shown, today)}
              </h3>
              {(open === "late" ? d.lateList : d.lists[open]).length === 0 ? (
                <p className="section-desc">No one.</p>
              ) : (
                (open === "late" ? d.lateList : d.lists[open]).map((p) => (
                  <div className="item-row" key={`${p.code}-${p.name}`}>
                    <div className="item-info">
                      <p className="item-name">{p.name}</p>
                      <p className="item-qty">
                        {p.code}
                        {p.section ? ` · ${p.section}` : ""}
                        {p.setByHand ? " · marked by hand" : ""}
                      </p>
                    </div>
                    <p className="item-rev" style={{ fontSize: 13 }}>
                      {open === "late" ? `${p.lateMin} min late` : p.in ? `In ${time12(p.in)}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Last month's salary */}
          {lm && (
            <div className="section-card" style={{ margin: "0 16px 16px" }}>
              <h3 className="section-title">💰 Salary · {monthLabel(lm.month)}</h3>
              <p className="section-desc">{lm.locked ? "Locked (paid) in Attendance" : "Not locked yet — may still change"} · {lm.employees} staff</p>
              <div className="item-row"><div className="item-info"><p className="item-name">Salary (days worked + bonus days)</p></div><p className="item-rev">{fmt(lm.basicSalary + lm.bonus)}</p></div>
              {lm.extraDuty > 0 && <div className="item-row"><div className="item-info"><p className="item-name">Extra duty / OT</p></div><p className="item-rev">{fmt(lm.extraDuty)}</p></div>}
              {lm.advances > 0 && <div className="item-row"><div className="item-info"><p className="item-name">Advances recovered</p></div><p className="item-rev">− {fmt(lm.advances)}</p></div>}
              {lm.otherDeductions > 0 && <div className="item-row"><div className="item-info"><p className="item-name">Other deductions</p></div><p className="item-rev">− {fmt(lm.otherDeductions)}</p></div>}
              <div className="item-row"><div className="item-info"><p className="item-name"><b>Net payable</b></p></div><p className="item-rev"><b>{fmt(lm.netPayable)}</b></p></div>
            </div>
          )}

          <p className="refresh-hint">Read-only view · details and changes in Plato Attendance</p>
        </>
      ) : null}
    </div>
  );
}
