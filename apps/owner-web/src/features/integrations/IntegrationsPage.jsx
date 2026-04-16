import { useEffect, useMemo, useState } from "react";

import {
  createPurchaseEntry,
  createVendorMapping,
  deleteVendorMapping,
  fetchIntegrationsData,
  runZohoSync,
  updateVendorMapping,
  updateZohoAccountMapping,
  updateZohoBooksSettings
} from "./integrations.service";

function statusClass(status) {
  return ["Review", "Needs credentials", "No data"].includes(status) ? "warning" : "online";
}

const emptyVendorForm = {
  vendorName: "",
  zohoContactName: "",
  purchaseCategory: "Kitchen Purchase",
  isActive: true
};

const emptyPurchaseForm = {
  outletId: "",
  vendorName: "",
  itemName: "",
  amount: "",
  expenseAccount: "Kitchen Purchase"
};

export function IntegrationsPage() {
  const [integrationData, setIntegrationData] = useState({
    services: [],
    mapping: [],
    alerts: [],
    zohoBooks: {},
    accountMapping: {},
    outletMappings: [],
    vendorMappings: [],
    purchaseEntries: [],
    syncLog: [],
    syncPreview: { packets: [], totals: {} }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [zohoDraft, setZohoDraft] = useState({
    organizationId: "",
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    dataCenter: "IN",
    refreshToken: "",
    autoSyncSales: true,
    autoSyncPurchases: true,
    autoSyncDayClose: true
  });
  const [mappingDraft, setMappingDraft] = useState({
    cashSalesAccount: "Cash In Hand",
    cardSalesAccount: "Bank Account",
    upiSalesAccount: "Bank Account",
    cashOutExpenseAccount: "Outlet Expenses",
    dayCloseShortageAccount: "Revenue Loss",
    vendorPayableAccount: "Accounts Payable",
    purchaseExpenseAccount: "Kitchen Purchase"
  });
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [editingVendorDraft, setEditingVendorDraft] = useState(emptyVendorForm);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);

  async function loadData() {
    setLoading(true);
    const result = await fetchIntegrationsData();
    setIntegrationData(result);
    setZohoDraft({
      organizationId: result.zohoBooks?.organizationId || "",
      clientId: result.zohoBooks?.clientId || "",
      clientSecret: result.zohoBooks?.clientSecret || "",
      redirectUri: result.zohoBooks?.redirectUri || "",
      dataCenter: result.zohoBooks?.dataCenter || "IN",
      refreshToken: result.zohoBooks?.refreshToken || "",
      autoSyncSales: result.zohoBooks?.autoSyncSales ?? true,
      autoSyncPurchases: result.zohoBooks?.autoSyncPurchases ?? true,
      autoSyncDayClose: result.zohoBooks?.autoSyncDayClose ?? true
    });
    setMappingDraft({
      cashSalesAccount: result.accountMapping?.cashSalesAccount || "Cash In Hand",
      cardSalesAccount: result.accountMapping?.cardSalesAccount || "Bank Account",
      upiSalesAccount: result.accountMapping?.upiSalesAccount || "Bank Account",
      cashOutExpenseAccount: result.accountMapping?.cashOutExpenseAccount || "Outlet Expenses",
      dayCloseShortageAccount: result.accountMapping?.dayCloseShortageAccount || "Revenue Loss",
      vendorPayableAccount: result.accountMapping?.vendorPayableAccount || "Accounts Payable",
      purchaseExpenseAccount: result.accountMapping?.purchaseExpenseAccount || "Kitchen Purchase"
    });
    setPurchaseForm((current) => ({
      ...current,
      outletId: current.outletId || result.outletMappings?.[0]?.outletId || ""
    }));
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchIntegrationsData();

      if (cancelled) {
        return;
      }

      setIntegrationData(result);
      setZohoDraft({
        organizationId: result.zohoBooks?.organizationId || "",
        clientId: result.zohoBooks?.clientId || "",
        clientSecret: result.zohoBooks?.clientSecret || "",
        redirectUri: result.zohoBooks?.redirectUri || "",
        dataCenter: result.zohoBooks?.dataCenter || "IN",
        refreshToken: result.zohoBooks?.refreshToken || "",
        autoSyncSales: result.zohoBooks?.autoSyncSales ?? true,
        autoSyncPurchases: result.zohoBooks?.autoSyncPurchases ?? true,
        autoSyncDayClose: result.zohoBooks?.autoSyncDayClose ?? true
      });
      setMappingDraft({
        cashSalesAccount: result.accountMapping?.cashSalesAccount || "Cash In Hand",
        cardSalesAccount: result.accountMapping?.cardSalesAccount || "Bank Account",
        upiSalesAccount: result.accountMapping?.upiSalesAccount || "Bank Account",
        cashOutExpenseAccount: result.accountMapping?.cashOutExpenseAccount || "Outlet Expenses",
        dayCloseShortageAccount: result.accountMapping?.dayCloseShortageAccount || "Revenue Loss",
        vendorPayableAccount: result.accountMapping?.vendorPayableAccount || "Accounts Payable",
        purchaseExpenseAccount: result.accountMapping?.purchaseExpenseAccount || "Kitchen Purchase"
      });
      setPurchaseForm((current) => ({
        ...current,
        outletId: current.outletId || result.outletMappings?.[0]?.outletId || ""
      }));
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const syncTotals = integrationData.syncPreview?.totals || {};
  const readyPacketCount = useMemo(
    () => (integrationData.syncPreview?.packets || []).filter((packet) => packet.status === "Ready").length,
    [integrationData.syncPreview]
  );

  async function saveZohoSettings(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await updateZohoBooksSettings(zohoDraft);
      setMessage("Zoho Books connection logic updated.");
      await loadData();
    } catch {
      setMessage("Could not save Zoho Books settings.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccountMapping(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await updateZohoAccountMapping(mappingDraft);
      setMessage("Zoho account mapping updated.");
      await loadData();
    } catch {
      setMessage("Could not save account mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateVendor(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await createVendorMapping(vendorForm);
      setVendorForm(emptyVendorForm);
      setMessage("Vendor mapping added for Zoho Books purchase sync.");
      await loadData();
    } catch {
      setMessage("Could not create vendor mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveVendor(vendorId) {
    setSaving(true);
    setMessage("");
    try {
      await updateVendorMapping(vendorId, editingVendorDraft);
      setEditingVendorId(null);
      setMessage("Vendor mapping updated.");
      await loadData();
    } catch {
      setMessage("Could not update vendor mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteVendor(vendor) {
    setSaving(true);
    setMessage("");
    try {
      await deleteVendorMapping(vendor.id);
      setMessage(`${vendor.vendorName} removed from Zoho vendor mapping.`);
      await loadData();
    } catch {
      setMessage("Could not delete vendor mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePurchaseEntry(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await createPurchaseEntry({
        ...purchaseForm,
        amount: Number(purchaseForm.amount || 0)
      });
      setPurchaseForm((current) => ({
        ...emptyPurchaseForm,
        outletId: current.outletId
      }));
      setMessage("Kitchen purchase entry queued for Zoho vendor bill sync.");
      await loadData();
    } catch {
      setMessage("Could not create purchase sync entry.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunSync() {
    setSaving(true);
    setMessage("");
    try {
      const result = await runZohoSync();
      setMessage(
        result.entries?.length
          ? `Zoho sync packets prepared at ${result.lastSyncAt}.`
          : "No Zoho packets were ready to sync."
      );
      await loadData();
    } catch {
      setMessage("Could not prepare Zoho sync.");
    } finally {
      setSaving(false);
    }
  }

  function startEditingVendor(vendor) {
    setEditingVendorId(vendor.id);
    setEditingVendorDraft({
      vendorName: vendor.vendorName || "",
      zohoContactName: vendor.zohoContactName || "",
      purchaseCategory: vendor.purchaseCategory || "Kitchen Purchase",
      isActive: vendor.isActive ?? true
    });
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Zoho Books Sync</p>
          <h2>Integrations</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={handleRunSync} disabled={saving}>
            Run Zoho Sync
          </button>
        </div>
      </header>

      <section className="hero-panel integrations-hero">
        <div>
          <p className="hero-label">Accounting workflow</p>
          <h3>Zoho Books is mapped to your restaurant billing and day-close logic</h3>
          <p className="hero-copy">
            Cash sales go to cash-in-hand, card and UPI sales go to bank, cashier cash-out goes to
            expense, day-close shortage goes to revenue loss, and kitchen purchases are prepared as
            vendor bills.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Ready packets</span>
            <strong>{readyPacketCount}</strong>
          </div>
          <div>
            <span>Last sync</span>
            <strong>{integrationData.zohoBooks?.lastSyncAt || "Not synced yet"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={integrationData.zohoBooks?.connectionStatus !== "Connected" ? "negative" : ""}>
              {integrationData.zohoBooks?.connectionStatus || "Needs setup"}
            </strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Cash sales</span>
          <strong>Rs {Number(syncTotals.cashSales || 0).toFixed(2)}</strong>
          <p>Prepared for {mappingDraft.cashSalesAccount}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Card + UPI</span>
          <strong>Rs {Number(syncTotals.bankSales || 0).toFixed(2)}</strong>
          <p>Prepared for bank-side receipt posting</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Cash-out expense</span>
          <strong>Rs {Number(syncTotals.cashOutExpenses || 0).toFixed(2)}</strong>
          <p>Mapped to {mappingDraft.cashOutExpenseAccount}</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Shortage to loss</span>
          <strong>Rs {Number(syncTotals.shortageAmount || 0).toFixed(2)}</strong>
          <p>Mapped to {mappingDraft.dayCloseShortageAccount}</p>
        </article>
      </section>

      {message ? <div className="mobile-banner">{message}</div> : null}

      <section className="dashboard-grid integrations-layout">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Zoho Books</p>
              <h3>Connection Settings</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={saveZohoSettings}>
            <label>
              Organization ID
              <input
                type="text"
                value={zohoDraft.organizationId}
                onChange={(event) => setZohoDraft((current) => ({ ...current, organizationId: event.target.value }))}
              />
            </label>
            <label>
              Client ID
              <input
                type="text"
                value={zohoDraft.clientId}
                onChange={(event) => setZohoDraft((current) => ({ ...current, clientId: event.target.value }))}
              />
            </label>
            <label>
              Client Secret
              <input
                type="text"
                value={zohoDraft.clientSecret}
                onChange={(event) => setZohoDraft((current) => ({ ...current, clientSecret: event.target.value }))}
              />
            </label>
            <label>
              Redirect URI
              <input
                type="text"
                value={zohoDraft.redirectUri}
                onChange={(event) => setZohoDraft((current) => ({ ...current, redirectUri: event.target.value }))}
              />
            </label>
            <label>
              Data Center
              <select
                value={zohoDraft.dataCenter}
                onChange={(event) => setZohoDraft((current) => ({ ...current, dataCenter: event.target.value }))}
              >
                <option value="IN">India</option>
                <option value="US">United States</option>
                <option value="EU">Europe</option>
              </select>
            </label>
            <label>
              Refresh Token
              <input
                type="text"
                value={zohoDraft.refreshToken}
                onChange={(event) => setZohoDraft((current) => ({ ...current, refreshToken: event.target.value }))}
              />
            </label>
            <label className="toggle-row">
              <span>Auto sync sales</span>
              <input
                type="checkbox"
                checked={zohoDraft.autoSyncSales}
                onChange={(event) => setZohoDraft((current) => ({ ...current, autoSyncSales: event.target.checked }))}
              />
            </label>
            <label className="toggle-row">
              <span>Auto sync purchases</span>
              <input
                type="checkbox"
                checked={zohoDraft.autoSyncPurchases}
                onChange={(event) =>
                  setZohoDraft((current) => ({ ...current, autoSyncPurchases: event.target.checked }))
                }
              />
            </label>
            <label className="toggle-row">
              <span>Auto sync day close</span>
              <input
                type="checkbox"
                checked={zohoDraft.autoSyncDayClose}
                onChange={(event) =>
                  setZohoDraft((current) => ({ ...current, autoSyncDayClose: event.target.checked }))
                }
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              Save Zoho Settings
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Ledger Mapping</p>
              <h3>Zoho Accounting Logic</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={saveAccountMapping}>
            <label>
              Cash sales account
              <input
                type="text"
                value={mappingDraft.cashSalesAccount}
                onChange={(event) =>
                  setMappingDraft((current) => ({ ...current, cashSalesAccount: event.target.value }))
                }
              />
            </label>
            <label>
              Card sales account
              <input
                type="text"
                value={mappingDraft.cardSalesAccount}
                onChange={(event) =>
                  setMappingDraft((current) => ({ ...current, cardSalesAccount: event.target.value }))
                }
              />
            </label>
            <label>
              UPI sales account
              <input
                type="text"
                value={mappingDraft.upiSalesAccount}
                onChange={(event) =>
                  setMappingDraft((current) => ({ ...current, upiSalesAccount: event.target.value }))
                }
              />
            </label>
            <label>
              Cash-out expense account
              <input
                type="text"
                value={mappingDraft.cashOutExpenseAccount}
                onChange={(event) =>
                  setMappingDraft((current) => ({ ...current, cashOutExpenseAccount: event.target.value }))
                }
              />
            </label>
            <label>
              Day-close shortage account
              <input
                type="text"
                value={mappingDraft.dayCloseShortageAccount}
                onChange={(event) =>
                  setMappingDraft((current) => ({ ...current, dayCloseShortageAccount: event.target.value }))
                }
              />
            </label>
            <label>
              Vendor payable account
              <input
                type="text"
                value={mappingDraft.vendorPayableAccount}
                onChange={(event) =>
                  setMappingDraft((current) => ({ ...current, vendorPayableAccount: event.target.value }))
                }
              />
            </label>
            <label>
              Kitchen purchase expense account
              <input
                type="text"
                value={mappingDraft.purchaseExpenseAccount}
                onChange={(event) =>
                  setMappingDraft((current) => ({ ...current, purchaseExpenseAccount: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              Save Account Mapping
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Outlet Mapping</p>
              <h3>Sales Contact by Outlet</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Outlet</span>
              <span>Zoho</span>
              <span>Sales Contact</span>
              <span>Branch Label</span>
              <span>Status</span>
            </div>
            {integrationData.mapping.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.outlet}</span>
                <span>{row.zohoBooks}</span>
                <span>{row.salesContact}</span>
                <span>{row.branchLabel}</span>
                <span className={`status ${statusClass(row.status)}`}>{row.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Vendor Mapping</p>
              <h3>Kitchen Purchase Vendors</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreateVendor}>
            <label>
              Vendor name
              <input
                type="text"
                value={vendorForm.vendorName}
                onChange={(event) => setVendorForm((current) => ({ ...current, vendorName: event.target.value }))}
                required
              />
            </label>
            <label>
              Zoho contact name
              <input
                type="text"
                value={vendorForm.zohoContactName}
                onChange={(event) =>
                  setVendorForm((current) => ({ ...current, zohoContactName: event.target.value }))
                }
              />
            </label>
            <label>
              Purchase category
              <input
                type="text"
                value={vendorForm.purchaseCategory}
                onChange={(event) =>
                  setVendorForm((current) => ({ ...current, purchaseCategory: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              Add Vendor
            </button>
          </form>

          <div className="alert-list">
            {integrationData.vendorMappings.map((vendor) => (
              <div key={vendor.id} className="alert-item">
                {editingVendorId === vendor.id ? (
                  <div className="simple-form">
                    <label>
                      Vendor name
                      <input
                        type="text"
                        value={editingVendorDraft.vendorName}
                        onChange={(event) =>
                          setEditingVendorDraft((current) => ({ ...current, vendorName: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Zoho contact
                      <input
                        type="text"
                        value={editingVendorDraft.zohoContactName}
                        onChange={(event) =>
                          setEditingVendorDraft((current) => ({ ...current, zohoContactName: event.target.value }))
                        }
                      />
                    </label>
                    <div className="location-actions">
                      <button type="button" className="ghost-chip" onClick={() => handleSaveVendor(vendor.id)}>
                        Save
                      </button>
                      <button type="button" className="ghost-chip" onClick={() => setEditingVendorId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{vendor.vendorName}</strong>
                    <span>
                      Zoho: {vendor.zohoContactName} • {vendor.purchaseCategory}
                    </span>
                    <div className="location-actions">
                      <button type="button" className="ghost-chip" onClick={() => startEditingVendor(vendor)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-chip" onClick={() => handleDeleteVendor(vendor)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Purchase Queue</p>
              <h3>Create Kitchen Purchase Sync Entry</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreatePurchaseEntry}>
            <label>
              Outlet
              <select
                value={purchaseForm.outletId}
                onChange={(event) => setPurchaseForm((current) => ({ ...current, outletId: event.target.value }))}
              >
                {integrationData.outletMappings.map((row) => (
                  <option key={row.outletId} value={row.outletId}>
                    {row.outletName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vendor
              <input
                type="text"
                value={purchaseForm.vendorName}
                onChange={(event) => setPurchaseForm((current) => ({ ...current, vendorName: event.target.value }))}
                required
              />
            </label>
            <label>
              Item or bill note
              <input
                type="text"
                value={purchaseForm.itemName}
                onChange={(event) => setPurchaseForm((current) => ({ ...current, itemName: event.target.value }))}
                required
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0"
                value={purchaseForm.amount}
                onChange={(event) => setPurchaseForm((current) => ({ ...current, amount: event.target.value }))}
                required
              />
            </label>
            <button type="submit" className="primary-btn full-width" disabled={saving}>
              Queue Purchase
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Zoho Preview</p>
              <h3>What Our Product Will Sync</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Type</span>
              <span>Source</span>
              <span>Zoho Module</span>
              <span>Account</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {(integrationData.syncPreview?.packets || []).map((packet) => (
              <div key={packet.id} className="staff-row">
                <span>{packet.type}</span>
                <span>{packet.source}</span>
                <span>{packet.zohoModule}</span>
                <span>{packet.account}</span>
                <span>Rs {Number(packet.amount || 0).toFixed(2)}</span>
                <span className={`status ${statusClass(packet.status)}`}>{packet.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Sync Log</p>
              <h3>Prepared Zoho Packets</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Time</span>
              <span>Type</span>
              <span>Source</span>
              <span>Account</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {integrationData.syncLog.length === 0 ? (
              <div className="panel-empty">No Zoho sync packets prepared yet.</div>
            ) : (
              integrationData.syncLog.map((entry) => (
                <div key={entry.id} className="staff-row">
                  <span>{entry.time}</span>
                  <span>{entry.type}</span>
                  <span>{entry.source}</span>
                  <span>{entry.account}</span>
                  <span>Rs {Number(entry.amount || 0).toFixed(2)}</span>
                  <span className={`status ${statusClass(entry.status)}`}>{entry.status}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Sync Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {integrationData.alerts.map((alert) => (
              <div key={alert.id} className="alert-item">
                <strong>{alert.title}</strong>
                <span>{alert.description}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
