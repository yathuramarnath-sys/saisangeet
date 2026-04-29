import { useState } from "react";
import { tapImpact } from "../lib/haptics";

const QUICK_NOTES = [
  "Less spicy", "No onion", "No garlic", "Extra spicy",
  "Less salt", "No coriander", "Well done", "Half portion",
  "Extra sauce", "No ice",
];

export function NoteModal({ item, initialNote = "", onSave, onClose }) {
  const [noteValue, setNoteValue] = useState(initialNote);

  const selected = noteValue.split(",").map(s => s.trim()).filter(Boolean);

  function toggleChip(n) {
    tapImpact();
    const already = selected.includes(n);
    const next = already ? selected.filter(c => c !== n) : [...selected, n];
    setNoteValue(next.join(", "));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <span className="sheet-handle" />

        <div className="sheet-header">
          <h3 className="sheet-title">{item?.name}</h3>
          <p className="sheet-subtitle">Add cooking instructions</p>
        </div>

        <div className="sheet-body">
          <div className="quick-chips">
            {QUICK_NOTES.map(n => (
              <button
                key={n}
                className={`quick-chip${selected.includes(n) ? " quick-chip-active" : ""}`}
                onClick={() => toggleChip(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <textarea
            className="note-textarea"
            placeholder="Or type a custom instruction…"
            value={noteValue}
            onChange={e => setNoteValue(e.target.value)}
            rows={3}
          />
        </div>

        <div className="sheet-footer">
          <button
            className="sheet-save-btn"
            onClick={() => { tapImpact(); onSave(noteValue); }}
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
}
