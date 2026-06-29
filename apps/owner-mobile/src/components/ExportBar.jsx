import { useState } from "react";
import { exportCSV, exportExcel, exportPDF } from "../lib/export";

export function ExportBar({ filename, title, headers, rows }) {
  const [busy, setBusy] = useState("");

  async function run(kind, fn) {
    if (!rows.length || busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="export-bar">
      <button
        className="export-btn"
        disabled={!rows.length || !!busy}
        onClick={() => run("csv", () => exportCSV(filename, headers, rows))}
      >
        {busy === "csv" ? "…" : "⬇ CSV"}
      </button>
      <button
        className="export-btn"
        disabled={!rows.length || !!busy}
        onClick={() => run("pdf", () => exportPDF(filename, title, headers, rows))}
      >
        {busy === "pdf" ? "…" : "⬇ PDF"}
      </button>
      <button
        className="export-btn"
        disabled={!rows.length || !!busy}
        onClick={() => run("excel", () => exportExcel(filename, headers, rows))}
      >
        {busy === "excel" ? "…" : "⬇ Excel"}
      </button>
    </div>
  );
}
