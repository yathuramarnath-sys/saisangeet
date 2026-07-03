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

  return (
    <div className="fps-page">
      <div className="fps-header">
        <button className="fps-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="fps-title">Find Server IP</h2>
      </div>

      {/* Connection status */}
      <div className="fps-status-card">
        <div className={`fps-status-dot${savedIp ? " fps-status-dot-on" : ""}`} />
        <div>
          <div className="fps-status-label">
            {savedIp ? "Connected to local POS" : "Not connected"}
          </div>
          {savedIp && <div className="fps-status-ip">{savedIp}:4001</div>}
        </div>
      </div>

      <div className="fps-scroll">
        {listEntries.length > 0 && (
          <div className="fps-section">
            <div className="fps-section-head">
              {discovered.length > 0 ? "DISCOVERED ON NETWORK" : "SAVED SERVER"}
            </div>
            {listEntries.map((entry) => {
              const sel = selected === entry.ip;
              return (
                <button
                  key={entry.ip}
                  className={`fps-server-row${sel ? " fps-server-row-sel" : ""}`}
                  onClick={() => handleSelect(entry.ip)}
                >
                  <div className="fps-server-info">
                    <span className="fps-server-name">{entry.name}</span>
                    <span className="fps-server-addr">{entry.ip}:{entry.port}</span>
                  </div>
                  <span className={`fps-radio${sel ? " fps-radio-sel" : ""}`} />
                </button>
              );
            })}
          </div>
        )}

        <div className="fps-section">
          <div className="fps-section-head">ENTER MANUALLY</div>
          <div className="fps-manual-row">
            <input
              className="fps-manual-input"
              type="text"
              inputMode="decimal"
              placeholder="192.168.1.xxx"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
            />
            <button className="fps-manual-add-btn" onClick={handleAddManual}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="fps-bottom">
        <button
          className={`fps-rescan-btn${scanning ? " fps-rescan-scanning" : ""}`}
          onClick={handleRescan}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <div className="fps-scan-spinner" />
              Scanning network…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2"/>
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49"/>
              </svg>
              Rescan network
            </>
          )}
        </button>
      </div>
    </div>
  );
}
