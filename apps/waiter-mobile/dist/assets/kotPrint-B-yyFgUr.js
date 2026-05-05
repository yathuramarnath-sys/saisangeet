function l(){try{const t=JSON.parse(localStorage.getItem("captain_printers")||"[]");return t.length?t:JSON.parse(localStorage.getItem("pos_printers")||"[]")}catch{return[]}}function T(){try{const t=JSON.parse(localStorage.getItem("captain_display_settings")||"{}");return Object.keys(t).length?t:JSON.parse(localStorage.getItem("pos_display_settings")||"{}")}catch{return{}}}function $(t){const o=l();if(t){const n=o.find(e=>e.station&&e.station.toLowerCase()===t.toLowerCase()&&(e.type==="KOT Printer"||e.type==="Both"));if(n)return n}return f()}function f(){const t=l(),o=t.filter(n=>n.type==="KOT Printer"||n.type==="Both");return o.length?o.find(n=>n.isDefault)||o[0]:t.find(n=>n.isDefault)||null}function S(){const t=l(),o=t.find(e=>e.station&&/bill|kot/i.test(e.station)&&(e.type==="Bill Printer"||e.type==="Both"));if(o)return o;const n=t.filter(e=>e.type==="Bill Printer"||e.type==="Both");return n.length?n.find(e=>e.isDefault)||n[0]:t.find(e=>e.isDefault)||null}function N(t,o,n=null,e=null,u={}){if(!o||!o.length)return;const s=n||f(),p=s?.paper||"80mm",x=p==="58mm"?"200px":"280px",h=t.outletName||"Restaurant",w=t.isCounter?`${t.areaName||"Counter"} #${String(t.ticketNumber||"").padStart(3,"0")}`:`Table ${t.tableNumber}  ·  ${t.areaName||""}`,c=new Date,b=c.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:!0}),k=c.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),d=e?`KOT-${String(e).padStart(4,"0")}`:t.kotNumber||`KOT-${t.orderNumber}`,y=s?.name||"Kitchen",m=u.sentBy||t.cashierName||null,v=o.map(i=>`
    <div class="kot-item">
      <span class="kot-qty">${i.quantity}</span>
      <div class="kot-item-info">
        <span class="kot-item-name">${i.name}</span>
        ${i.note?`<span class="kot-item-note">${i.note}</span>`:""}
      </div>
    </div>
  `).join(""),g=`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${d}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800;900&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Manrope', 'Courier New', monospace;
      font-size: 13px;
      width: ${x};
      margin: 0 auto;
      padding: 12px 10px 16px;
      background: #fff;
      color: #000;
    }

    .kot-header {
      text-align: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }
    .kot-outlet {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .kot-title {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #444;
      margin-top: 3px;
      text-transform: uppercase;
    }

    .kot-meta {
      margin: 8px 0;
      border-bottom: 1px dashed #aaa;
      padding-bottom: 8px;
    }
    .kot-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin: 2px 0;
      font-weight: 700;
    }
    .kot-meta-row.large {
      font-size: 14px;
      font-weight: 900;
      margin: 5px 0 3px;
    }
    .kot-meta-row .label { color: #666; font-weight: 600; }

    .kot-items {
      margin: 10px 0;
      border-bottom: 2px dashed #000;
      padding-bottom: 10px;
    }
    .kot-items-header {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 800;
      color: #777;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #ddd;
    }
    .kot-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 5px 0;
      border-bottom: 1px dotted #e0e0e0;
    }
    .kot-item:last-child { border-bottom: none; }
    .kot-qty {
      font-size: 20px;
      font-weight: 900;
      min-width: 28px;
      text-align: center;
      line-height: 1.1;
      color: #000;
    }
    .kot-item-info {
      flex: 1;
      padding-top: 2px;
    }
    .kot-item-name {
      font-size: 13px;
      font-weight: 800;
      display: block;
      line-height: 1.3;
    }
    .kot-item-note {
      font-size: 10px;
      color: #777;
      font-style: italic;
      display: block;
      margin-top: 2px;
    }

    .kot-footer {
      margin-top: 8px;
      text-align: center;
    }
    .kot-footer-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #555;
      font-weight: 700;
      margin: 2px 0;
    }
    .kot-printer-tag {
      text-align: center;
      font-size: 10px;
      color: #999;
      margin-top: 6px;
      font-style: italic;
    }

    @media print {
      @page {
        size: ${p} auto;
        margin: 0;
      }
      body { padding: 6px 8px; }
    }
  </style>
</head>
<body>
  <div class="kot-header">
    <div class="kot-outlet">${h}</div>
    <div class="kot-title">★ Kitchen Order Ticket ★</div>
  </div>

  <div class="kot-meta">
    <div class="kot-meta-row large">
      <span>${w}</span>
      <span>${d}</span>
    </div>
    <div class="kot-meta-row">
      <span class="label">Date</span>
      <span>${k}</span>
    </div>
    <div class="kot-meta-row">
      <span class="label">Time</span>
      <span>${b}</span>
    </div>
    ${t.guests>0?`
    <div class="kot-meta-row">
      <span class="label">Guests</span>
      <span>${t.guests}</span>
    </div>`:""}
  </div>

  <div class="kot-items">
    <div class="kot-items-header">
      <span>QTY</span>
      <span>ITEM</span>
    </div>
    ${v}
  </div>

  <div class="kot-footer">
    <div class="kot-footer-row">
      <span>Total Items:</span>
      <span>${o.reduce((i,r)=>i+r.quantity,0)}</span>
    </div>
    ${m?`<div class="kot-footer-row"><span>Sent by:</span><span style="font-weight:900">${m}</span></div>`:""}
    <div class="kot-printer-tag">→ ${y}</div>
  </div>
</body>
</html>`;if(window.electronAPI?.printHTML){const i=s?.winName||s?.name||null;window.electronAPI.printHTML({html:g,printerName:i,paperWidthMm:p==="58mm"?58:80}).then(r=>{r?.ok||(console.warn("[printKOT] Electron print failed:",r?.error),window.dispatchEvent(new CustomEvent("dinex:print-error",{detail:{source:"KOT",printerName:i,error:r?.error}})))}).catch(r=>{console.error("[printKOT] Electron printHTML error:",r),window.dispatchEvent(new CustomEvent("dinex:print-error",{detail:{source:"KOT",printerName:i,error:r?.message||"unknown"}}))});return}const a=window.open("","_blank","width=340,height=500,scrollbars=no");if(!a){console.warn("KOT print: popup blocked. Please allow popups for this site.");return}a.document.write(g),a.document.close(),a.onload=()=>{setTimeout(()=>{a.focus(),a.print(),a.onafterprint=()=>a.close(),setTimeout(()=>{try{a.close()}catch{}},3e3)},350)}}function O(){return T().kotAutoSend!==!1}export{S as getBillPrinter,f as getKotPrinter,$ as getKotPrinterForStation,O as kotAutoSendEnabled,l as loadPrinters,N as printKOT};
