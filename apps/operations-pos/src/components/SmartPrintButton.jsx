/**
 * SmartPrintButton — Zero-config printer picker for label printing.
 *
 * Behaviour:
 *   • If a printer has been used before → clicking the main button prints
 *     immediately to that printer (no dialog, no delay).
 *   • If no printer remembered, OR the user clicks the ▼ chevron →
 *     a small inline popover lists all Windows-installed printers.
 *   • Staff taps a printer → prints + remembers it for next time.
 *   • Works in browser (non-Electron) too — opens the OS print dialog.
 */

import { useState, useEffect, useRef } from "react";
import { getLastLabelPrinter, setLastLabelPrinter } from "../lib/printLabel";

export function SmartPrintButton({
  onPrint,          // (printerName: string | null) => Promise<void>
  label = "Print",  // button text prefix
  disabled = false,
  className = "",
}) {
  const [printers,     setPrinters]     = useState([]);
  const [showPicker,   setShowPicker]   = useState(false);
  const [loadingList,  setLoadingList]  = useState(false);
  const [printing,     setPrinting]     = useState(false);
  const [lastPrinter,  setLastPrinter]  = useState(() => getLastLabelPrinter());
  const wrapRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showPicker]);

  // Fetch printer list from Electron (or return empty on browser)
  async function fetchPrinters() {
    if (!window.electronAPI?.getPrinters) return [];
    try {
      const list = await window.electronAPI.getPrinters();
      // Filter out Windows virtual printers staff don't need
      return list.filter(p => !/Microsoft|OneNote|XPS|Fax/i.test(p.name));
    } catch { return []; }
  }

  async function openPicker() {
    setLoadingList(true);
    setShowPicker(true);
    const list = await fetchPrinters();
    setPrinters(list);
    setLoadingList(false);
  }

  // Main button: print directly if printer known, else open picker
  async function handleMainClick() {
    if (disabled || printing) return;
    if (lastPrinter) {
      await executePrint(lastPrinter);
    } else {
      await openPicker();
    }
  }

  // Printer row clicked in popover
  async function handlePickPrinter(printerName) {
    setLastLabelPrinter(printerName);
    setLastPrinter(printerName);
    setShowPicker(false);
    await executePrint(printerName);
  }

  async function executePrint(printerName) {
    setPrinting(true);
    try {
      await onPrint(printerName);
    } finally {
      setPrinting(false);
    }
  }

  // Short display name for the remembered printer (first 2 words)
  const shortName = lastPrinter
    ? lastPrinter.split(/\s+/).slice(0, 2).join(" ")
    : null;

  return (
    <div className={`smpb-wrap ${className}`} ref={wrapRef}>
      {/* ── Split button ─────────────────────────────────── */}
      <div className="smpb-btn-row">
        <button
          type="button"
          className="smpb-main"
          disabled={disabled || printing}
          onClick={handleMainClick}
        >
          {printing ? (
            <><span className="pos-spinner" /> Printing…</>
          ) : (
            <>
              🖨 {label}
              {shortName && (
                <span className="smpb-chip">{shortName}</span>
              )}
            </>
          )}
        </button>
        <button
          type="button"
          className="smpb-chevron"
          disabled={disabled || printing}
          onClick={openPicker}
          title="Choose a different printer"
          aria-label="Choose printer"
        >
          ▾
        </button>
      </div>

      {/* ── Printer picker popover ────────────────────────── */}
      {showPicker && (
        <div className="smpb-popover" role="listbox" aria-label="Printer list">
          <div className="smpb-popover-head">🖨 Choose Printer</div>

          {loadingList ? (
            <div className="smpb-popover-loading">
              <span className="pos-spinner" /> Loading printers…
            </div>
          ) : printers.length === 0 ? (
            <div className="smpb-popover-empty">
              {window.electronAPI
                ? "No printers found on this PC."
                : "Running in browser — OS print dialog will open."}
              <button
                type="button"
                className="smpb-popover-browser-btn"
                onClick={() => { setShowPicker(false); executePrint(null); }}
              >
                Print anyway →
              </button>
            </div>
          ) : (
            <div className="smpb-popover-list">
              {printers.map(p => (
                <button
                  key={p.name}
                  type="button"
                  role="option"
                  aria-selected={lastPrinter === p.name}
                  className={`smpb-printer-row${lastPrinter === p.name ? " active" : ""}`}
                  onClick={() => handlePickPrinter(p.name)}
                >
                  <span className="smpb-row-check">
                    {lastPrinter === p.name ? "✓" : ""}
                  </span>
                  <span className="smpb-row-name">{p.name}</span>
                  {p.isDefault && (
                    <span className="smpb-row-badge">Default</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="smpb-popover-cancel"
            onClick={() => setShowPicker(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
