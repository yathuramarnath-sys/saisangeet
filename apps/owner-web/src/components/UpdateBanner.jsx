import { useEffect, useState } from "react";

const APP_VERSION = "0.1.0";
const APP_KEY     = "ownerWeb";
const API_BASE    = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || "https://api.dinexpos.in/api/v1";
const BANNER_COLOR = "#7c3aed";

function compareVersions(a, b) {
  const pa = (a||"0").split(".").map(Number);
  const pb = (b||"0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1;
    if ((pa[i]||0) < (pb[i]||0)) return -1;
  }
  return 0;
}

export function UpdateBanner() {
  const [info,      setInfo]      = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function check() {
      fetch(`${API_BASE}/app-versions`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => {
          const latest = data?.[APP_KEY];
          if (latest?.version && compareVersions(latest.version, APP_VERSION) > 0) {
            setInfo(latest);
            setDismissed(false);
          }
        })
        .catch(() => {});
    }
    check();
    const t = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!info || dismissed) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: BANNER_COLOR, color: "#fff",
      fontFamily: "Manrope, sans-serif", fontSize: 13,
      boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px" }}>
        <span style={{ fontSize:18 }}>🎉</span>
        <div style={{ flex:1, lineHeight:1.4 }}>
          <strong>Version {info.version} is available!</strong>
          {" "}Refresh to update.
          {info.notes && <span style={{ opacity:0.8, marginLeft:8 }}>— {info.notes}</span>}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              background:"#fff", color: BANNER_COLOR,
              border:"none", borderRadius:6, padding:"5px 14px",
              fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"
            }}
          >
            Refresh Now
          </button>
          {info.downloadUrl && (
            <a
              href={info.downloadUrl}
              style={{
                background:"rgba(255,255,255,0.2)", color:"#fff",
                borderRadius:6, padding:"5px 14px",
                fontWeight:700, fontSize:12, textDecoration:"none",
                fontFamily:"inherit"
              }}
            >
              ↓ Download
            </a>
          )}
          <button
            onClick={() => setDismissed(true)}
            style={{
              background:"rgba(255,255,255,0.2)", color:"#fff",
              border:"none", borderRadius:6, padding:"5px 10px",
              cursor:"pointer", fontFamily:"inherit", fontSize:12
            }}
          >✕</button>
        </div>
      </div>
    </div>
  );
}
