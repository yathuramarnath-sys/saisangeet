import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

function plainRows(rows) {
  return rows.map(r => r.map(c => (c === null || c === undefined ? "" : String(c))));
}

async function saveAndShare(filename, base64Data, mimeType) {
  const result = await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({
    title: filename,
    url: result.uri,
    dialogTitle: `Share ${filename}`,
  });
}

function downloadInBrowser(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function exportCSV(filename, headers, rows) {
  const plain = plainRows(rows);
  const lines = [
    headers.join(","),
    ...plain.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const fullName = filename + ".csv";
  if (Capacitor.isNativePlatform()) {
    await saveAndShare(fullName, await blobToBase64(blob), "text/csv");
  } else {
    downloadInBrowser(fullName, blob);
  }
}

export async function exportExcel(filename, headers, rows) {
  const plain = plainRows(rows);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...plain]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const fullName = filename + ".xlsx";
  if (Capacitor.isNativePlatform()) {
    const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    await saveAndShare(fullName, base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } else {
    XLSX.writeFile(wb, fullName);
  }
}

export async function exportPDF(filename, title, headers, rows) {
  const plain = plainRows(rows);
  const doc = new jsPDF({ orientation: headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title || filename, 14, 16);
  autoTable(doc, {
    head: [headers],
    body: plain,
    startY: 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [26, 122, 58] },
  });
  const fullName = filename + ".pdf";
  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output("datauristring").split(",")[1];
    await saveAndShare(fullName, base64, "application/pdf");
  } else {
    doc.save(fullName);
  }
}
