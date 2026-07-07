import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { getDeviceLocalIp } from "../lib/deviceIp";

export function FindPosScreen({ localPosIp, onClose }) {
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

  const sectionLabel = discovered.length > 0 ? "SERVERS ON THIS NETWORK" : "SAVED SERVER";

  return (
    <div className="fps2-page">
      <div className="fps2-header">
        <button className="fps2-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="fps2-title">Find server IP</h2>
      </div>

      {/* Status card — centered wifi icon */}
      <div className="fps2-status-card">
        <div className={`fps2-status-icon-wrap${!selected ? " fps2-offline" : ""}`}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <div className="fps2-status-title">
          {selected ? "Connected to local POS" : "Not connected"}
        </div>
        {selected && (
          <div className="fps2-status-addr">Plato POS · {selected}</div>
        )}
      </div>

      <div className="fps2-scroll">
        {listEntries.length > 0 && (
          <>
            <div className="fps2-section-label">{sectionLabel}</div>
            <div className="fps2-list-card">
              {listEntries.map((entry) => {
                const sel = selected === entry.ip;
                return (
                  <button
                    key={entry.ip}
                    className={`fps2-server-row${sel ? " fps2-server-row-sel" : ""}`}
                    onClick={() => handleSelect(entry.ip)}
                  >
                    <div className="fps2-server-info">
                      <span className="fps2-server-name">{entry.name}</span>
                      <span className="fps2-server-addr">{entry.ip} · port {entry.port}</span>
                    </div>
                    <div className={`fps2-radio${sel ? " fps2-radio-sel" : ""}`}>
                      {sel && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Manual IP entry */}
        <div className="fps2-manual-card">
          <input
            className="fps2-manual-input"
            type="text"
            inputMode="decimal"
            placeholder="Enter IP address manually"
            value={manualIp}
            onChange={(e) => setManualIp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
          />
          <button className="fps2-manual-add-btn" onClick={handleAddManual}>Add</button>
        </div>
      </div>

      <div className="fps2-bottom">
        <button
          className="fps2-rescan-btn"
          onClick={handleRescan}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <div className="fps2-scan-spinner" />
              Scanning network…
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
              </svg>
              Rescan network
            </>
          )}
        </button>
      </div>
    </div>
  );
}
