import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

function elapsed(joinedAt) {
  const mins = Math.floor((Date.now() - new Date(joinedAt).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min";
  return `${mins} mins`;
}

function WaitBadge({ est }) {
  if (!est) return null;
  const label = est.min != null
    ? `~${est.min}–${est.max} min`
    : `~${est.mins || "?"} min`;
  return <span className="wl-wait-badge">{label}</span>;
}

export function WaitlistPanel({ outlet, orders, onClose, onSeatParty }) {
  const [queue,     setQueue]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState({ name: "", phone: "", partySize: "2" });
  const [adding,    setAdding]    = useState(false);
  const [error,     setError]     = useState("");
  const nameRef = useRef(null);

  const outletId = outlet?.id;

  async function loadQueue() {
    if (!outletId) return;
    try {
      const data = await api.get(`/operations/waitlist?outletId=${outletId}`);
      setQueue(Array.isArray(data) ? data : []);
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => {
    loadQueue();
    const t = setInterval(loadQueue, 30000); // refresh every 30s for live wait timer
    return () => clearInterval(t);
  }, [outletId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (adding) setTimeout(() => nameRef.current?.focus(), 50);
  }, [adding]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Enter customer name"); return; }
    if (!form.partySize || Number(form.partySize) < 1) { setError("Enter party size"); return; }

    // Build occupied tables from live orders
    const occupiedTables = Object.values(orders || {})
      .filter(o => o?.items?.length && !o?.isClosed)
      .map(o => ({
        seats:     o.seats || 4,
        startedAt: o.createdAt || o.updatedAt || new Date().toISOString(),
      }));

    setError("");
    try {
      const entry = await api.post("/operations/waitlist", {
        outletId,
        outletName:    outlet?.name,
        name:          form.name.trim(),
        phone:         form.phone.trim(),
        partySize:     Number(form.partySize),
        occupiedTables,
      });
      setQueue(q => [...q, entry]);
      setForm({ name: "", phone: "", partySize: "2" });
      setAdding(false);
    } catch (err) {
      setError(err.message || "Could not add to waitlist");
    }
  }

  async function handleSeat(entry) {
    try {
      await api.patch(`/operations/waitlist/${entry.id}/seat`, {
        assignedTableId:    null,
        assignedTableLabel: null,
      });
      setQueue(q => q.filter(e => e.id !== entry.id));
      onSeatParty?.(entry);
    } catch (_) {}
  }

  async function handleNoShow(entry) {
    try {
      await api.patch(`/operations/waitlist/${entry.id}/no-show`, {});
      setQueue(q => q.filter(e => e.id !== entry.id));
    } catch (_) {}
  }

  async function handleCancel(entry) {
    try {
      await api.patch(`/operations/waitlist/${entry.id}/cancel`, {});
      setQueue(q => q.filter(e => e.id !== entry.id));
    } catch (_) {}
  }

  return (
    <div className="wl-overlay" onClick={onClose}>
      <div className="wl-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="wl-header">
          <div>
            <p className="wl-eyebrow">Table Waitlist</p>
            <h3 className="wl-title">
              {queue.length === 0 ? "No one waiting" : `${queue.length} ${queue.length === 1 ? "party" : "parties"} waiting`}
            </h3>
          </div>
          <button className="wl-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Queue list */}
        <div className="wl-list">
          {loading && <p className="wl-empty">Loading…</p>}
          {!loading && queue.length === 0 && (
            <div className="wl-empty">
              <span>🪑</span>
              <p>Waitlist is empty right now</p>
            </div>
          )}
          {queue.map(entry => (
            <div key={entry.id} className="wl-row">
              <div className="wl-queue-num">#{entry.queueNumber}</div>
              <div className="wl-info">
                <strong className="wl-name">{entry.name}</strong>
                <span className="wl-meta">
                  {entry.partySize} {entry.partySize === 1 ? "person" : "people"}
                  {entry.phone ? ` · ${entry.phone}` : ""}
                  · waiting {elapsed(entry.joinedAt)}
                </span>
                {entry.estimatedWait && <WaitBadge est={entry.estimatedWait} />}
              </div>
              <div className="wl-row-actions">
                <button className="wl-seat-btn"   onClick={() => handleSeat(entry)}>Seat</button>
                <button className="wl-noshow-btn" onClick={() => handleNoShow(entry)}>No-show</button>
                <button className="wl-cancel-btn" onClick={() => handleCancel(entry)}>✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Add party form */}
        {adding ? (
          <form className="wl-add-form" onSubmit={handleAdd}>
            <p className="wl-add-title">Add to waitlist</p>
            <div className="wl-add-fields">
              <input
                ref={nameRef}
                type="text"
                placeholder="Customer name *"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <input
                type="tel"
                placeholder="Phone (for SMS)"
                value={form.phone}
                maxLength={10}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))}
              />
              <input
                type="number"
                placeholder="Party size *"
                min="1"
                max="50"
                value={form.partySize}
                onChange={e => setForm(f => ({ ...f, partySize: e.target.value }))}
              />
            </div>
            {error && <p className="wl-error">{error}</p>}
            <div className="wl-add-btns">
              <button type="submit"  className="wl-confirm-btn">Add to Queue</button>
              <button type="button" className="wl-dismiss-btn" onClick={() => { setAdding(false); setError(""); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <button className="wl-add-party-btn" onClick={() => setAdding(true)}>
            + Add Party to Waitlist
          </button>
        )}

      </div>
    </div>
  );
}
