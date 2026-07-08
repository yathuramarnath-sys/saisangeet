import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { getDeviceLocalIp } from "../lib/deviceIp";

export function FindPosScreen({ localPosIp, outletName, onClose }) {
  const savedIp = localPosIp || localStorage.getItem("captain_local_server_ip") || null;
  const [discovered, setDiscovered] = useState([]);
  const [selected, setSelected]     = useState(savedIp);
  const [manualIp, setManualIp]     = useState("");
  const [scanning, setScanning]     = useState(false);

  async function handleRescan() {
    tapImpact();
    setScanning(true);
    setDiscovered([]);
    try {
      const ownIp     = await getDeviceLocalIp();
      const ownSubnet = ownIp ? ownIp.split(".").slice(0, 3).join(".") : null;
      const subnets   = [...new Set([ownSubnet, "192.168.1", "192.168.0", "10.0.0"].filter(Boolean))];
      const found     = [];
      for (const subnet of subnets) {
        for (let i = 1; i <= 50; i++) {
          const ip = `${subnet}.${i}`;
          try {
            const r = await fetch(`http://${ip}:4001/plato-pos`, { signal: AbortSignal.timeout(400) });
            if (r.ok) {
              found.push({ ip, port: 4001, name: "Plato POS" });
              setDiscovered([...found]);
              if (!selected) {
                setSelected(ip);
                localStorage.setItem("captain_local_server_ip", ip);
              }
            }
          } catch (_) {}
        }
      }
    } finally {
      setScanning(false);
    }
  }

  function handleSelect(ip) {
    tapImpact();
    setSelected(ip);
    localStorage.setItem("captain_local_server_ip", ip);
  }

  function handleAddManual() {
    const ip = manualIp.trim();
    if (!ip) return;
    tapImpact();
    handleSelect(ip);
    setManualIp("");
  }

  const listEntries = discovered.length > 0
    ? discovered
    : savedIp ? [{ ip: savedIp, port: 4001, name: "Plato POS" }] : [];

  const isConnected = !!selected;

  return (
    <div className="fp2-page">
      <div className="fp2-header">
        <button className="fp2-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="fp2-title">Find Server IP</h2>
      </div>

      <div className={`fp2-status-card${isConnected ? " fp2-status-card-on" : ""}`}>
        <div className={`fp2-status-icon${isConnected ? " fp2-status-icon-on" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <div className="fp2-status-text">
          <div className="fp2-status-label">
            {isConnected ? "Connected to local POS" : "Not connected"}
          </div>
          {isConnected && (
            <div className="fp2-status-sub">
              {[outletName, selected].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      <div className="fp2-scroll">
        {listEntries.length > 0 && (
          <div className="fp2-section">
            <div className="fp2-section-head">
              {discovered.length > 0 ? "DISCOVERED ON NETWORK" : "SERVERS"}
            </div>
            <div className="fp2-list-card">
              {listEntries.map((entry, idx) => {
                const sel = selected === entry.ip;
                return (
                  <button
                    key={entry.ip}
                    className={`fp2-server-row${sel ? " fp2-server-row-sel" : ""}${idx > 0 ? " fp2-server-row-bordered" : ""}`}
                    onClick={() => handleSelect(entry.ip)}
                  >
                    <div className="fp2-server-info">
                      <span className="fp2-server-name">{entry.name}</span>
                      <span className="fp2-server-addr">{entry.ip} · port {entry.port}</span>
                    </div>
                    <span className={`fp2-radio${sel ? " fp2-radio-sel" : ""}`} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="fp2-section">
          <div className="fp2-section-head">ENTER IP ADDRESS MANUALLY</div>
          <div className="fp2-manual-row">
            <input
              className="fp2-manual-input"
              type="text"
              inputMode="decimal"
              placeholder="192.168.1.xxx"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
            />
            <button className="fp2-manual-add-btn" onClick={handleAddManual}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="fp2-bottom">
        <button
          className={`fp2-rescan-btn${scanning ? " fp2-rescan-scanning" : ""}`}
          onClick={handleRescan}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <div className="fp2-scan-spinner" />
              Scanning network…
            </>
          ) : (
            <>↺ Rescan network</>
          )}
        </button>
      </div>
    </div>
  );
}
