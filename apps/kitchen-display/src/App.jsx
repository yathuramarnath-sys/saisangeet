import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "./lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedLabel(createdAt) {
  if (!createdAt) return "0s";
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function urgencyClass(createdAt) {
  if (!createdAt) return "";
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs > 600) return "urgent";
  if (secs > 300) return "warning";
  return "";
}

// ─── KOT Card ─────────────────────────────────────────────────────────────────

function KotCard({ ticket, onAdvance }) {
  const [elapsed, setElapsed] = useState(elapsedLabel(ticket.createdAt));

  useEffect(() => {
    const id = setInterval(() => setElapsed(elapsedLabel(ticket.createdAt)), 10000);
    return () => clearInterval(id);
  }, [ticket.createdAt]);

  const urgency = urgencyClass(ticket.createdAt);
  const nextLabel = ticket.status === "new" ? "Start Cooking" : ticket.status === "preparing" ? "Mark Ready" : null;

  return (
    <div className={`kot-card status-${ticket.status}${urgency ? ` ${urgency}` : ""}`}>
      <div className="kot-card-head">
        <div className="kot-head-left">
          <span className="kot-number">KOT {ticket.kotNumber || ticket.id?.slice(-3)}</span>
          {ticket.station && <span className="kot-station">{ticket.station}</span>}
        </div>
        <div className="kot-head-right">
          <span className={`kot-timer${urgency ? ` ${urgency}` : ""}`}>{elapsed}</span>
          <span className="kot-table">T{ticket.tableNumber}</span>
        </div>
      </div>

      <div className="kot-items">
        {(ticket.items || []).map((item, idx) => (
          <div key={item.id || idx} className="kot-item">
            <span className="kot-item-qty">{item.quantity}×</span>
            <div className="kot-item-info">
              <span className="kot-item-name">{item.name}</span>
              {item.note && <span className="kot-item-note">{item.note}</span>}
            </div>
          </div>
        ))}
      </div>

      {nextLabel && (
        <button
          className={`kot-action-btn action-${ticket.status}`}
          onClick={() => onAdvance(ticket.id, ticket.status)}
        >
          {nextLabel}
        </button>
      )}

      {ticket.status === "ready" && (
        <div className="kot-ready-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Ready to serve
        </div>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KotColumn({ label, tickets, onAdvance, colorKey }) {
  return (
    <div className="kds-column">
      <div className={`kds-col-head col-${colorKey}`}>
        <span>{label}</span>
        <span className="kds-col-count">{tickets.length}</span>
      </div>
      <div className="kds-col-body">
        {tickets.length === 0 && (
          <div className="kds-empty">
            {label === "New" ? "Waiting for orders…" : "Nothing here"}
          </div>
        )}
        {tickets.map((t) => (
          <KotCard key={t.id} ticket={t} onAdvance={onAdvance} />
        ))}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const [tickets, setTickets] = useState([]);
  const [outlet, setOutlet] = useState(null);
  const [station, setStation] = useState("All");
  const [stations, setStations] = useState(["All"]);
  const socketRef = useRef(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        const outlets = await api.get("/outlets");
        const target = outlets[0];
        if (!target) throw new Error("No outlet");
        setOutlet(target);

        const kots = await api.get(`/operations/kots?outletId=${target.id}`).catch(() => []);
        if (kots.length) {
          setTickets(kots);
          setStations(["All", ...new Set(kots.map((k) => k.station).filter(Boolean))]);
        }

        const socket = io("http://localhost:4000", { query: { outletId: target.id } });
        socketRef.current = socket;

        socket.on("kot:new", (kot) => {
          setTickets((prev) => {
            if (prev.find((t) => t.id === kot.id)) return prev;
            return [{ ...kot, status: "new", createdAt: new Date().toISOString() }, ...prev];
          });
          if (kot.station) {
            setStations((prev) => prev.includes(kot.station) ? prev : [...prev, kot.station]);
          }
        });

        socket.on("kot:status", ({ id, status }) => {
          setTickets((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
        });

      } catch (err) {
        // Demo fallback
        const now = Date.now();
        setTickets([
          { id: "d1", kotNumber: "001", tableNumber: "3", station: "Hot", status: "new",
            createdAt: new Date(now - 90000).toISOString(),
            items: [{ id: "i1", name: "Paneer Butter Masala", quantity: 2, note: "Less spicy" }, { id: "i2", name: "Butter Naan", quantity: 3 }] },
          { id: "d2", kotNumber: "002", tableNumber: "7", station: "Beverages", status: "preparing",
            createdAt: new Date(now - 240000).toISOString(),
            items: [{ id: "i3", name: "Masala Chai", quantity: 2 }, { id: "i4", name: "Cold Coffee", quantity: 1, note: "No sugar" }] },
          { id: "d3", kotNumber: "003", tableNumber: "1", station: "Hot", status: "new",
            createdAt: new Date(now - 420000).toISOString(),
            items: [{ id: "i5", name: "Dal Makhani", quantity: 1 }, { id: "i6", name: "Jeera Rice", quantity: 2 }] },
          { id: "d4", kotNumber: "004", tableNumber: "5", station: "Hot", status: "ready",
            createdAt: new Date(now - 600000).toISOString(),
            items: [{ id: "i7", name: "Chicken Tikka", quantity: 1 }] }
        ]);
        setStations(["All", "Hot", "Beverages"]);
      }
    }

    bootstrap();
    return () => socketRef.current?.disconnect();
  }, []);

  async function handleAdvance(id, currentStatus) {
    const nextStatus = currentStatus === "new" ? "preparing" : "ready";
    setTickets((prev) => prev.map((t) => t.id === id ? { ...t, status: nextStatus } : t));
    socketRef.current?.emit("kot:status", { id, status: nextStatus });
    try {
      await api.patch(`/operations/kots/${id}/status`, { status: nextStatus });
    } catch (_) {}
  }

  const filtered = station === "All" ? tickets : tickets.filter((t) => t.station === station);
  const newTickets       = filtered.filter((t) => t.status === "new");
  const preparingTickets = filtered.filter((t) => t.status === "preparing");
  const readyTickets     = filtered.filter((t) => t.status === "ready");

  return (
    <div className="kds-shell">
      <header className="kds-header">
        <div className="kds-header-left">
          <div className="kds-brand-mark">K</div>
          <div>
            <strong>Kitchen Display</strong>
            <p>{outlet?.name || "Restaurant OS"}</p>
          </div>
        </div>

        {stations.length > 1 && (
          <div className="kds-stations">
            {stations.map((s) => (
              <button
                key={s}
                className={`kds-station-btn${station === s ? " active" : ""}`}
                onClick={() => setStation(s)}
              >{s}</button>
            ))}
          </div>
        )}

        <div className="kds-live">
          <span className="kds-live-dot" />
          Live
        </div>
      </header>

      <div className="kds-columns">
        <KotColumn label="New" tickets={newTickets} onAdvance={handleAdvance} colorKey="new" />
        <KotColumn label="Preparing" tickets={preparingTickets} onAdvance={handleAdvance} colorKey="preparing" />
        <KotColumn label="Ready" tickets={readyTickets} onAdvance={handleAdvance} colorKey="ready" />
      </div>
    </div>
  );
}
