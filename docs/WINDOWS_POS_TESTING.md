# Windows POS — Build & Verification Guide

App: `apps/operations-pos`  
Electron version: 32.3.3  
Output: `apps/operations-pos/electron-dist/`

---

## Build commands

```powershell
# From apps/operations-pos/ on the Windows machine

# Install dependencies (once)
npm install

# Quick smoke test — launches app directly, no installer
npm run build
npx electron .

# Package Windows installer (produces electron-dist/DineX POS Setup 1.0.0.exe)
npm run electron:build:win
```

`electron:build:win` runs `vite build` then `electron-builder --win`. The NSIS installer lands in `electron-dist\`.  
Use `npx electron .` first — it confirms the print IPC works before committing to a full package build.

---

## 1 — List installed printers

- Open the POS app → **Settings** (gear icon) → **Printers**
- Click **"List Windows Printers"**
- The dropdown should populate with every printer installed in Windows Devices and Printers
- Confirm `Epson TM-T82` / `Epson TM-T88` / `TVS Star Gold 80mm` appear by their exact Windows device name
- If the list is empty: open Windows **Control Panel → Devices and Printers** and confirm the printer shows there first

---

## 2 — Map Epson / TVS printer in Settings

- Click **Add Printer** (or edit an existing row)
- Fill in:
  - **Name** — display label (e.g. `Kitchen Printer`)
  - **Type** — `KOT Printer`, `Bill Printer`, or `Both`
  - **Paper** — `80mm`
  - **Windows Printer Name** — select from the dropdown (auto-fills from step 1) or type the exact name shown in Windows Devices and Printers — spelling must match exactly
  - **Station** — e.g. `Grill` or `Tandoor` for per-station KOT routing (leave blank for a single kitchen)
- Save and confirm the row appears in the printer list

---

## 3 — Test bill printing

1. Open any table, add items, tap **Print Bill**
2. Expected: receipt prints **silently** — no Windows print dialog appears
3. Verify the receipt shows: outlet name, table / area, date + time, itemised lines with amounts, GST row, total
4. Paper should cut or advance cleanly at the end

---

## 4 — Test KOT printing

1. Open a table, add items, tap **Send KOT**
2. Expected: KOT prints **silently** on the mapped KOT printer
3. Verify: KOT number, table and area, large-font item quantities, `→ [Printer Name]` tag at the bottom
4. For per-station routing — add items mapped to two different stations (e.g. `Grill` and `Tandoor`) and confirm each KOT goes to its own printer
5. Reprint KOT: tap **Reprint KOT** — same printer, same content

---

## 5 — Error toast when printer is unavailable

1. Power off the printer **or** rename the **Windows Printer Name** field to a non-existent device name, then trigger a print (KOT or Bill)
2. Expected: a toast appears on the POS screen within ~1 second:
   ```
   ⚠️ KOT print failed (Epson TM-T82) — printer_offline
   ```
   (Source is `KOT` or `Bill`; reason comes from Electron)
3. No silent failure — the cashier knows immediately to check the printer connection

---

## 6 — Fallback when no mapped printer exists

| Scenario | Expected behavior |
|---|---|
| `winName` is blank, Windows default printer set | Electron sends to the Windows default printer — receipt prints, no error |
| No printers configured in Settings at all | Electron uses Windows default; if no default exists Electron logs an error and the error toast fires |
| Running in **browser/web mode** (not Electron) | A popup window opens with the thermal HTML and the browser's standard print dialog appears — staff select a printer manually |

---

## Known limitations (pre-production)

- No Windows icon (`.ico`) configured — installer uses the generic Electron default icon
- No code-signing — Windows SmartScreen will show a warning on first run; click **More info → Run anyway** during testing
- `wmic` is used first to list printers; PowerShell `Get-Printer` is the automatic fallback for Windows 11 24H2+
