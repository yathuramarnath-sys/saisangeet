import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "./lib/api";

// ─── Audio alert (triple beep for new KOT) ───────────────────────────────────

function playNewKotAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((delay) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type            = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.16);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  } catch (_) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedLabel(createdAt) {
  if (!createdAt) return "0:00";
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function urgencyLevel(createdAt) {
  if (!createdAt) return 0;
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs > 600) return 2; // red / urgent
  if (secs > 300) return 1; // amber / warning
  return 0;
}

// ─── Source config ────────────────────────────────────────────────────────────

const SOURCE = {
  pos:     { label: "POS",     color: "#60a5fa", bg: "rgba(96,165,250,0.14)"  },
  captain: { label: "Captain", color: "#fbbf24", bg: "rgba(251,191,36,0.14)"  },
  online:  { label: "Online",  color: "#a78bfa", bg: "rgba(167,139,250,0.14)" },
};

// ─── Demo tickets (all 3 sources) ────────────────────────────────────────────

function makeDemoTickets() {
  const now = Date.now();
  return [
    {
      id: "d1", kotNumber: "001", tableNumber: "3", areaName: "AC Hall 1",
      station: "Hot", source: "pos", status: "new",
      createdAt: new Date(now - 95000).toISOString(), doneItems: [],
      items: [
        { id: "d1-1", name: "Paneer Butter Masala", quantity: 2, note: "Less spicy" },
        { id: "d1-2", name: "Butter Naan",          quantity: 3 },
      ],
    },
    {
      id: "d2", kotNumber: "002", tableNumber: "7", areaName: "Family Hall",
      station: "Beverages", source: "captain", status: "preparing",
      createdAt: new Date(now - 245000).toISOString(), doneItems: ["d2-1"],
      items: [
        { id: "d2-1", name: "Masala Chai",  quantity: 2 },
        { id: "d2-2", name: "Cold Coffee",  quantity: 1, note: "No sugar" },
      ],
    },
    {
      id: "d3", kotNumber: "003", tableNumber: "—", areaName: "Swiggy",
      station: "Hot", source: "online", status: "new",
      createdAt: new Date(now - 425000).toISOString(), doneItems: [],
      items: [
        { id: "d3-1", name: "Dal Makhani", quantity: 1 },
        { id: "d3-2", name: "Jeera Rice",  quantity: 2 },
        { id: "d3-3", name: "Raita",       quantity: 1, note: "No onion" },
      ],
    },
    {
      id: "d4", kotNumber: "004", tableNumber: "5", areaName: "AC Hall 1",
      station: "Hot", source: "captain", status: "ready",
      createdAt: new Date(now - 610000).toISOString(), doneItems: ["d4-1", "d4-2"],
      items: [
        { id: "d4-1", name: "Chicken Tikka",  quantity: 1 },
        { id: "d4-2", name: "Roomali Roti",   quantity: 2 },
      ],
    },
    {
      id: "d5", kotNumber: "005", tableNumber: "2", areaName: "Family Hall",
      station: "Grill", source: "pos", status: "preparing",
      createdAt: new Date(now - 185000).toISOString(), doneItems: [],
      items: [
        { id: "d5-1", name: "Veg Seekh Kebab",   quantity: 2, note: "Extra mint chutney" },
        { id: "d5-2", name: "Tandoori Roti",      quantity: 4 },
      ],
    },
    {
      id: "d6", kotNumber: "006", tableNumber: "—", areaName: "Zomato",
      station: "Beverages", source: "online", status: "new",
      createdAt: new Date(now - 60000).toISOString(), doneItems: [],
      items: [
        { id: "d6-1", name: "Mango Lassi",   quantity: 2 },
        { id: "d6-2", name: "Sweet Lassi",   quantity: 1 },
      ],
    },
  ];
}

// ─── KOT Card ─────────────────────────────────────────────────────────────────

function KotCard({ ticket, onAdvance, onBump, onToggleItem }) {
  const [elapsed, setElapsed] = useState(() => elapsedLabel(ticket.createdAt));
  const [urgency, setUrgency] = useState(() => urgencyLevel(ticket.createdAt));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(elapsedLabel(ticket.createdAt));
      setUrgency(urgencyLevel(ticket.createdAt));
    }, 1000);
    return () => clearInterval(id);
  }, [ticket.createdAt]);

  const src       = SOURCE[ticket.source] || SOURCE.pos;
  const doneItems = ticket.doneItems || [];
  const allDone   = ticket.items.length > 0 && doneItems.length >= ticket.items.length;
  const urgClass  = urgency === 2 ? " urgent" : urgency === 1 ? " warning" : "";

  return (
    <div className={`kot-card status-${ticket.status}${urgClass}`}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="kot-card-head">
        <div className="kot-head-left">
          <div className="kot-head-row">
            <span className="kot-number">#{ticket.kotNumber || ticket.id?.slice(-4)}</span>
            <span className="kot-src-badge" style={{ color: src.color, background: src.bg }}>
              {src.label}
            </span>
          </div>
          {ticket.station && <span className="kot-station">{ticket.station}</span>}
        </div>
        <div className="kot-head-right">
          <span className={`kot-timer${urgency === 2 ? " urgent" : urgency === 1 ? " warning" : ""}`}>
            ⏱ {elapsed}
          </span>
          <div className="kot-table-row">
            <span className="kot-table">T{ticket.tableNumber}</span>
            {ticket.areaName && (
              <span className="kot-area">{ticket.areaName}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Items ──────────────────────────────────────────────────── */}
      <div className="kot-items">
        {(ticket.items || []).map((item) => {
          const done = doneItems.includes(item.id);
          return (
            <button
              key={item.id}
              className={`kot-item${done ? " done" : ""}${ticket.status !== "ready" ? " tappable" : ""}`}
              onClick={() => ticket.status !== "ready" && onToggleItem(ticket.id, item.id)}
            >
              <span className={`kot-check${done ? " checked" : ""}`}>
                {done ? "✓" : "○"}
              </span>
              <span className="kot-item-qty">{item.quantity}×</span>
              <div className="kot-item-body">
                <span className="kot-item-name">{item.name}</span>
                {item.note && (
                  <span className="kot-item-note">⚠ {item.note}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Action footer ──────────────────────────────────────────── */}
      <div className="kot-foot">
        {ticket.status === "new" && (
          <button className="kot-action start" onClick={() => onAdvance(ticket.id, "new")}>
            Start Cooking
          </button>
        )}
        {ticket.status === "preparing" && (
          <button
            className={`kot-action ready${allDone ? " all-done" : ""}`}
            onClick={() => onAdvance(ticket.id, "preparing")}
          >
            {allDone ? "✓ All Done — Mark Ready" : "Mark Ready"}
          </button>
        )}
        {ticket.status === "ready" && (
          <button className="kot-action bump" onClick={() => onBump(ticket.id)}>
            ✓ BUMP — Served
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KdsColumn({ label, colorKey, emptyMsg, tickets, onAdvance, onBump, onToggleItem }) {
  return (
    <div className="kds-column">
      <div className={`kds-col-head col-${colorKey}`}>
        <span>{label}</span>
        <span className="kds-col-badge">{tickets.length}</span>
      </div>
      <div className="kds-col-body">
        {tickets.length === 0 && (
          <div className="kds-empty">{emptyMsg}</div>
        )}
        {tickets.map((t) => (
          <KotCard
            key={t.id}
            ticket={t}
            onAdvance={onAdvance}
            onBump={onBump}
            onToggleItem={onToggleItem}
          />
        ))}
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export function App() {
  const [tickets,     setTickets]     = useState([]);
  const [outlet,      setOutlet]      = useState(null);
  const [station,     setStation]     = useState("All");
  const [stations,    setStations]    = useState(["All"]);
  const [servedCount, setServedCount] = useState(0);
  const socketRef    = useRef(null);
  const audioReady   = useRef(false);

  // Unlock Web Audio on first tap (browser requirement)
  function unlockAudio() { audioReady.current = true; }

  useEffect(() => {
    async function bootstrap() {
      try {
        const outlets = await api.get("/outlets");
        const target  = outlets[0];
        if (!target) throw new Error("no outlet");
        setOutlet(target);

        const kots = await api.get(`/operations/kots?outletId=${target.id}`).catch(() => []);
        if (kots.length) {
          setTickets(kots.map((k) => ({ ...k, doneItems: [] })));
          setStations(["All", ...new Set(kots.map((k) => k.station).filter(Boolean))]);
        } else {
          throw new Error("empty"); // fall to demo
        }

        const socket = io("http://localhost:4000", { query: { outletId: target.id } });
        socketRef.current = socket;

        // New KOT from any source (POS / Captain / Online)
        socket.on("kot:new", (kot) => {
          setTickets((prev) => {
            if (prev.find((t) => t.id === kot.id)) return prev;
            return [
              { ...kot, status: "new", createdAt: new Date().toISOString(), doneItems: [] },
              ...prev,
            ];
          });
          setStations((prev) =>
            kot.station && !prev.includes(kot.station) ? [...prev, kot.station] : prev
          );
          if (audioReady.current) playNewKotAlert();
        });

        socket.on("kot:status", ({ id, status }) => {
          setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
        });

      } catch (_) {
        // Demo fallback — shows all 3 sources
        setTickets(makeDemoTickets());
        setStations(["All", "Hot", "Beverages", "Grill"]);
      }
    }

    bootstrap();
    return () => socketRef.current?.disconnect();
  }, []);

  async function handleAdvance(id, cur) {
    const next = cur === "new" ? "preparing" : "ready";
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: next } : t)));
    socketRef.current?.emit("kot:status", { id, status: next });
    try { await api.patch(`/operations/kots/${id}/status`, { status: next }); } catch (_) {}
  }

  function handleBump(id) {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setServedCount((n) => n + 1);
    socketRef.current?.emit("kot:bumped", { id });
  }

  function handleToggleItem(ticketId, itemId) {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t;
        const done = t.doneItems || [];
        const next = done.includes(itemId)
          ? done.filter((x) => x !== itemId)
          : [...done, itemId];
        return { ...t, doneItems: next };
      })
    );
  }

  const base  = station === "All" ? tickets : tickets.filter((t) => t.station === station);
  const newT  = base.filter((t) => t.status === "new");
  const prepT = base.filter((t) => t.status === "preparing");
  const readT = base.filter((t) => t.status === "ready");

  return (
    <div className="kds-shell" onClick={unlockAudio}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="kds-header">
        <div className="kds-header-left">
          <div className="kds-brand-mark">KDS</div>
          <div>
            <strong>Kitchen Display</strong>
            <p>{outlet?.name || "Restaurant OS"}</p>
          </div>
        </div>

        {/* Source legend */}
        <div className="kds-source-legend">
          {Object.entries(SOURCE).map(([key, cfg]) => (
            <span
              key={key}
              className="kds-src-pill"
              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}33` }}
            >
              {cfg.label}
            </span>
          ))}
        </div>

        {/* Station tabs */}
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

        <div className="kds-header-right">
          {servedCount > 0 && (
            <div className="kds-served-pill">{servedCount} bumped</div>
          )}
          <div className="kds-live">
            <span className="kds-live-dot" />
            <span>{newT.length + prepT.length + readT.length} active</span>
          </div>
        </div>
      </header>

      {/* ── Columns ───────────────────────────────────────────────── */}
      <div className="kds-columns">
        <KdsColumn
          label="New Orders"   colorKey="new"
          emptyMsg="Waiting for orders…"
          tickets={newT}
          onAdvance={handleAdvance} onBump={handleBump} onToggleItem={handleToggleItem}
        />
        <KdsColumn
          label="Preparing"    colorKey="preparing"
          emptyMsg="Nothing cooking right now"
          tickets={prepT}
          onAdvance={handleAdvance} onBump={handleBump} onToggleItem={handleToggleItem}
        />
        <KdsColumn
          label="Ready to Serve" colorKey="ready"
          emptyMsg="No items ready yet"
          tickets={readT}
          onAdvance={handleAdvance} onBump={handleBump} onToggleItem={handleToggleItem}
        />
      </div>
    </div>
  );
}
