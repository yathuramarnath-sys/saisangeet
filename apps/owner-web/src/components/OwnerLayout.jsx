import { useEffect, useState } from "react";

import { Sidebar } from "./Sidebar";
import { fetchReportsData, subscribeOwnerReports } from "../features/reports/reports.service";

export function OwnerLayout({ children }) {
  const [popupAlert, setPopupAlert] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const data = await fetchReportsData();

      if (!cancelled) {
        setPopupAlert(data.popupAlert);
      }
    }

    load();

    const unsubscribe = subscribeOwnerReports((nextData) => {
      if (!cancelled) {
        setPopupAlert(nextData.popupAlert);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">{children}</main>
      <aside className="owner-popup-alert" aria-label="Owner risk alert">
        <div className="owner-popup-head">
          <span className="status warning">Owner alert</span>
          <button type="button" className="ghost-chip">
            View
          </button>
        </div>
        <strong>{popupAlert?.title || "Loading control alerts..."}</strong>
        <span>{popupAlert?.description || "Checking live outlet control issues..."}</span>
      </aside>
    </div>
  );
}
