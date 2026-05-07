import { useEffect, useState } from "react";
import { api } from "../../lib/api";

/* ── helpers ──────────────────────────────────────────────────────────────── */
function blankDraft() {
  return { name: "", outletId: "all", categories: [] };
}

function toggleArr(arr, val) {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

/* ── KitchenStationsPage ──────────────────────────────────────────────────── */
export function KitchenStationsPage() {
  const [stations,   setStations]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [outlets,    setOutlets]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  // form state
  const [editId,  setEditId]  = useState(null);   // null = create mode
  const [draft,   setDraft]   = useState(blankDraft());
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState("");

  /* ── load ── */
  useEffect(() => {
    (async () => {
      try {
        const [st, cats, outData] = await Promise.all([
          api.get("/kitchen-stations"),
          api.get("/menu/categories"),
          api.get("/outlets")
        ]);
        setStations(st);
        setCategories(cats);
        setOutlets(outData);
      } catch (e) {
        setError(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── categories already used by OTHER stations (locked) ── */
  function lockedCategories(exceptStationId) {
    return stations
      .filter((s) => s.id !== exceptStationId)
      .flatMap((s) => s.categories || []);
  }

  /* ── form actions ── */
  function startCreate() {
    setEditId(null);
    setDraft(blankDraft());
    setFormErr("");
  }

  function startEdit(st) {
    setEditId(st.id);
    // Strip stale/orphaned category IDs (those that no longer exist in the category list)
    const validCatIds = new Set(categories.map((c) => c.id));
    const cleanCats   = (st.categories || []).filter((cid) => validCatIds.has(cid));
    setDraft({ name: st.name, outletId: st.outletId || "all", categories: cleanCats });
    setFormErr("");
  }

  function cancelForm() {
    setEditId(null);
    setDraft(blankDraft());
    setFormErr("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormErr("");
    if (!draft.name.trim()) return setFormErr("Station name is required.");
    setSaving(true);
    try {
      if (editId) {
        const updated = await api.patch(`/kitchen-stations/${editId}`, draft);
        setStations((prev) => prev.map((s) => (s.id === editId ? updated : s)));
      } else {
        const created = await api.post("/kitchen-stations", draft);
        setStations((prev) => [...prev, created]);
      }
      cancelForm();
    } catch (e) {
      setFormErr(e.message || "Failed to save station.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this station? Categories assigned to it will become unassigned.")) return;
    try {
      await api.delete(`/kitchen-stations/${id}`);
      setStations((prev) => prev.filter((s) => s.id !== id));
      if (editId === id) cancelForm();
    } catch (e) {
      alert(e.message || "Failed to delete station.");
    }
  }

  /* ── render ── */
  if (loading) return <div className="ks-loading">Loading…</div>;
  if (error)   return <div className="ks-error">⚠️ {error}</div>;

  const locked = lockedCategories(editId);

  return (
    <div className="ks-page">
      <div className="ks-header">
        <div>
          <p className="eyebrow">Kitchen</p>
          <h2>Kitchen Stations</h2>
          <p className="ks-header-sub">
            Assign menu categories to kitchen stations. POS routes KOTs to the correct printer based on these assignments.
          </p>
        </div>
        <button className="primary-btn" onClick={startCreate}>
          + New Station
        </button>
      </div>

      <div className="ks-layout">

        {/* ── Left: station list ── */}
        <div className="ks-list-col">
          {stations.length === 0 ? (
            <div className="ks-empty">
              <span>🍳</span>
              <p>No kitchen stations yet.</p>
              <p>Create your first station to start routing KOTs.</p>
            </div>
          ) : (
            stations.map((st) => {
              const outletLabel = st.outletId === "all"
                ? "All Outlets"
                : outlets.find((o) => o.id === st.outletId)?.name || st.outletId;

              // Only show categories that still exist — drop orphaned/stale IDs silently
              const catNames = (st.categories || [])
                .map((cid) => categories.find((c) => c.id === cid)?.name)
                .filter(Boolean);

              return (
                <div
                  key={st.id}
                  className={`ks-card${editId === st.id ? " active" : ""}`}
                >
                  <div className="ks-card-body">
                    <div className="ks-card-name">{st.name}</div>
                    <div className="ks-card-outlet">{outletLabel}</div>
                    {catNames.length > 0 ? (
                      <div className="ks-cat-chips">
                        {catNames.map((cn) => (
                          <span key={cn} className="ks-cat-chip">{cn}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="ks-no-cats">No categories assigned yet</p>
                    )}
                  </div>
                  <div className="ks-card-actions">
                    <button className="ghost-btn sm" onClick={() => startEdit(st)}>Edit</button>
                    <button className="ghost-btn sm danger" onClick={() => handleDelete(st.id)}>Delete</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Right: create / edit form ── */}
        <div className="ks-form-col">
          <div className="ks-form-panel">
            <h3 className="ks-form-title">
              {editId ? "Edit Station" : "New Station"}
            </h3>

            {formErr && <div className="ks-form-err">⚠️ {formErr}</div>}

            <form onSubmit={handleSave}>
              {/* Name */}
              <label className="ks-field">
                Station name
                <input
                  className="ks-input"
                  placeholder="e.g. Hot Kitchen, Bar, Cold Station"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  autoFocus
                  required
                />
              </label>

              {/* Outlet */}
              <label className="ks-field">
                Outlet
                <select
                  className="ks-select"
                  value={draft.outletId}
                  onChange={(e) => setDraft((d) => ({ ...d, outletId: e.target.value }))}
                >
                  <option value="all">All Outlets</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>

              {/* Categories */}
              <div className="ks-field">
                <div className="ks-field-label">
                  Assign categories
                  <span className="ks-field-hint">
                    Greyed = already assigned to another station
                  </span>
                </div>
                <div className="ks-cat-grid">
                  {categories.length === 0 ? (
                    <p className="ks-no-cats">No categories found — create them in Menu first.</p>
                  ) : (
                    categories.map((cat) => {
                      const isLocked   = locked.includes(cat.id);
                      const isChecked  = draft.categories.includes(cat.id);
                      return (
                        <label
                          key={cat.id}
                          className={`ks-cat-check${isLocked ? " locked" : ""}${isChecked ? " checked" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isLocked}
                            onChange={() => {
                              if (isLocked) return;
                              setDraft((d) => ({
                                ...d,
                                categories: toggleArr(d.categories, cat.id)
                              }));
                            }}
                          />
                          {cat.name}
                          {isLocked && <span className="ks-locked-tag">assigned</span>}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="ks-form-actions">
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={saving || !draft.name.trim()}
                >
                  {saving ? "Saving…" : editId ? "Save Changes" : "Create Station"}
                </button>
                {(editId || draft.name) && (
                  <button type="button" className="ghost-btn" onClick={cancelForm}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
