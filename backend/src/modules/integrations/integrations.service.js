const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { getState, getCashShifts } = require("../operations/operations.memory-store");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function toKey(value) {
  return String(value || "").trim().toLowerCase();
}

function getPaymentBucket(method) {
  const key = toKey(method);

  if (key.includes("cash")) {
    return "cash";
  }

  if (key.includes("upi") || key.includes("card") || key.includes("bank") || key.includes("phonepe") || key.includes("paytm") || key.includes("qr")) {
    return "bank";
  }

  return "bank";
}

function buildSyncPreview(data, operationsState, cashShifts) {
  const accountMapping = data.integrations.accountMapping || {};
  const orders = Object.values(operationsState.orders || {});
  const payments = orders.flatMap((order) =>
    (order.payments || []).map((payment) => ({
      order,
      payment
    }))
  );

  const cashSales = payments
    .filter(({ payment }) => getPaymentBucket(payment.method || payment.label) === "cash")
    .reduce((sum, entry) => sum + Number(entry.payment.amount || 0), 0);

  const bankSales = payments
    .filter(({ payment }) => getPaymentBucket(payment.method || payment.label) === "bank")
    .reduce((sum, entry) => sum + Number(entry.payment.amount || 0), 0);

  const cashOutExpenses = (cashShifts.movements || [])
    .filter((movement) => String(movement.type || "").toLowerCase() === "cash out")
    .reduce((sum, movement) => sum + Number(String(movement.amount || "").replace(/[^0-9.-]/g, "")), 0);

  const shortageAmount = (cashShifts.shifts || [])
    .filter((shift) => Number(shift.varianceAmount || 0) < 0)
    .reduce((sum, shift) => sum + Math.abs(Number(shift.varianceAmount || 0)), 0);

  const queuedPurchases = (data.integrations.purchaseEntries || []).filter((entry) => entry.status !== "Synced");
  const purchaseAmount = queuedPurchases.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const packets = [
    {
      id: "sales-cash",
      type: "Sales Receipt",
      source: "Cash sales",
      account: accountMapping.cashSalesAccount,
      zohoModule: "Customer Payments / Bank or Cash",
      amount: cashSales,
      status: cashSales > 0 ? "Ready" : "No data"
    },
    {
      id: "sales-bank",
      type: "Sales Receipt",
      source: "Card + UPI sales",
      account: `${accountMapping.cardSalesAccount} / ${accountMapping.upiSalesAccount}`,
      zohoModule: "Customer Payments / Bank",
      amount: bankSales,
      status: bankSales > 0 ? "Ready" : "No data"
    },
    {
      id: "cash-out-expense",
      type: "Expense",
      source: "Cashier cash-out expenses",
      account: accountMapping.cashOutExpenseAccount,
      zohoModule: "Expenses",
      amount: cashOutExpenses,
      status: cashOutExpenses > 0 ? "Ready" : "No data"
    },
    {
      id: "day-close-shortage",
      type: "Journal Entry",
      source: "Day close shortage",
      account: accountMapping.dayCloseShortageAccount,
      zohoModule: "Journal Entries",
      amount: shortageAmount,
      status: shortageAmount > 0 ? "Ready" : "No data"
    },
    {
      id: "vendor-purchases",
      type: "Vendor Bill",
      source: "Kitchen purchases",
      account: `${accountMapping.vendorPayableAccount} / ${accountMapping.purchaseExpenseAccount}`,
      zohoModule: "Bills",
      amount: purchaseAmount,
      status: purchaseAmount > 0 ? "Ready" : "No data"
    }
  ];

  return {
    packets,
    totals: {
      cashSales,
      bankSales,
      cashOutExpenses,
      shortageAmount,
      purchaseAmount
    }
  };
}

function buildServiceCards(data, preview) {
  const zoho = data.integrations.zohoBooks || {};

  return [
    {
      id: "zoho-books",
      name: "Zoho Books",
      status: zoho.connectionStatus === "Connected" ? "Connected" : "Review",
      category: "Accounting sync",
      syncMode: [
        zoho.autoSyncSales ? "Sales auto" : "Sales manual",
        zoho.autoSyncPurchases ? "Purchases auto" : "Purchases manual",
        zoho.autoSyncDayClose ? "Day close auto" : "Day close manual"
      ].join(" • "),
      health: preview.packets.some((packet) => packet.status === "Ready") ? "Ready to sync" : "Awaiting data"
    }
  ];
}

function buildOutletMapping(data) {
  const mappings = data.integrations.outletMappings || [];
  return mappings.map((row) => ({
    id: row.id,
    outlet: row.outletName,
    zohoBooks: row.zohoBooksEnabled ? "Mapped" : "Disabled",
    salesContact: row.salesContactName,
    branchLabel: row.branchLabel,
    status: row.zohoBooksEnabled ? "Healthy" : "Review"
  }));
}

function buildAlerts(data, preview) {
  const alerts = [];
  const zoho = data.integrations.zohoBooks || {};

  if (!zoho.organizationId || !zoho.clientId) {
    alerts.push({
      id: "zoho-credentials",
      title: "Zoho Books credentials are incomplete",
      description: "Add organization, client, and redirect details before live API sync."
    });
  }

  if (preview.totals.shortageAmount > 0) {
    alerts.push({
      id: "day-close-shortage",
      title: `Day-close shortage ${formatCurrency(preview.totals.shortageAmount)} will go to ${data.integrations.accountMapping.dayCloseShortageAccount}`,
      description: "Mismatch shifts are prepared as loss entries for Zoho sync."
    });
  }

  if ((data.integrations.purchaseEntries || []).some((entry) => entry.status !== "Synced")) {
    alerts.push({
      id: "purchase-queue",
      title: "Kitchen purchase entries are waiting for Zoho vendor bill sync",
      description: "Review vendor mapping and run sync when the accounting side is ready."
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "zoho-ready",
      title: "Zoho sync configuration looks healthy",
      description: "Sales, expenses, and day-close sync mappings are configured."
    });
  }

  return alerts;
}

function getDashboard() {
  const data = getOwnerSetupData();
  const operationsState = getState();
  const cashShifts = getCashShifts();
  const syncPreview = buildSyncPreview(data, operationsState, cashShifts);

  return {
    zohoBooks: clone(data.integrations.zohoBooks || {}),
    accountMapping: clone(data.integrations.accountMapping || {}),
    outletMappings: clone(data.integrations.outletMappings || []),
    vendorMappings: clone(data.integrations.vendorMappings || []),
    purchaseEntries: clone(data.integrations.purchaseEntries || []),
    syncLog: clone(data.integrations.syncLog || []),
    services: buildServiceCards(data, syncPreview),
    mapping: buildOutletMapping(data),
    alerts: buildAlerts(data, syncPreview),
    syncPreview
  };
}

async function fetchIntegrations() {
  return getDashboard();
}

async function updateZohoBooks(payload) {
  let updated = null;

  updateOwnerSetupData((current) => {
    updated = {
      ...(current.integrations?.zohoBooks || {}),
      ...(payload.organizationId !== undefined ? { organizationId: payload.organizationId } : {}),
      ...(payload.clientId !== undefined ? { clientId: payload.clientId } : {}),
      ...(payload.clientSecret !== undefined ? { clientSecret: payload.clientSecret } : {}),
      ...(payload.redirectUri !== undefined ? { redirectUri: payload.redirectUri } : {}),
      ...(payload.dataCenter !== undefined ? { dataCenter: payload.dataCenter } : {}),
      ...(payload.refreshToken !== undefined ? { refreshToken: payload.refreshToken } : {}),
      ...(payload.autoSyncSales !== undefined ? { autoSyncSales: Boolean(payload.autoSyncSales) } : {}),
      ...(payload.autoSyncPurchases !== undefined ? { autoSyncPurchases: Boolean(payload.autoSyncPurchases) } : {}),
      ...(payload.autoSyncDayClose !== undefined ? { autoSyncDayClose: Boolean(payload.autoSyncDayClose) } : {}),
      connectionStatus:
        payload.organizationId || current.integrations?.zohoBooks?.organizationId
          ? "Connected"
          : current.integrations?.zohoBooks?.connectionStatus || "Needs setup"
    };

    return {
      ...current,
      integrations: {
        ...(current.integrations || {}),
        zohoBooks: updated
      }
    };
  });

  return updated;
}

async function updateAccountMapping(payload) {
  let updated = null;

  updateOwnerSetupData((current) => {
    updated = {
      ...(current.integrations?.accountMapping || {}),
      ...payload
    };

    return {
      ...current,
      integrations: {
        ...(current.integrations || {}),
        accountMapping: updated
      }
    };
  });

  return updated;
}

async function createVendorMapping(payload) {
  const vendor = {
    id: `vendor-${Date.now()}`,
    vendorName: payload.vendorName,
    zohoContactName: payload.zohoContactName || payload.vendorName,
    purchaseCategory: payload.purchaseCategory || "Kitchen Purchase",
    isActive: payload.isActive ?? true
  };

  updateOwnerSetupData((current) => ({
    ...current,
    integrations: {
      ...(current.integrations || {}),
      vendorMappings: [...(current.integrations?.vendorMappings || []), vendor]
    }
  }));

  return vendor;
}

async function updateVendorMapping(vendorId, payload) {
  let updated = null;

  updateOwnerSetupData((current) => ({
    ...current,
    integrations: {
      ...(current.integrations || {}),
      vendorMappings: (current.integrations?.vendorMappings || []).map((vendor) => {
        if (vendor.id !== vendorId) {
          return vendor;
        }

        updated = {
          ...vendor,
          vendorName: payload.vendorName ?? vendor.vendorName,
          zohoContactName: payload.zohoContactName ?? vendor.zohoContactName,
          purchaseCategory: payload.purchaseCategory ?? vendor.purchaseCategory,
          isActive: payload.isActive ?? vendor.isActive
        };

        return updated;
      })
    }
  }));

  return updated;
}

async function deleteVendorMapping(vendorId) {
  let deleted = null;

  updateOwnerSetupData((current) => {
    deleted = (current.integrations?.vendorMappings || []).find((vendor) => vendor.id === vendorId) || null;

    return {
      ...current,
      integrations: {
        ...(current.integrations || {}),
        vendorMappings: (current.integrations?.vendorMappings || []).filter((vendor) => vendor.id !== vendorId)
      }
    };
  });

  return deleted;
}

async function createPurchaseEntry(payload) {
  const entry = {
    id: `purchase-entry-${Date.now()}`,
    outletId: payload.outletId,
    vendorName: payload.vendorName,
    itemName: payload.itemName,
    amount: Number(payload.amount || 0),
    expenseAccount: payload.expenseAccount || "Kitchen Purchase",
    status: "Queued",
    createdAt: "Now"
  };

  updateOwnerSetupData((current) => ({
    ...current,
    integrations: {
      ...(current.integrations || {}),
      purchaseEntries: [entry, ...(current.integrations?.purchaseEntries || [])]
    }
  }));

  return entry;
}

async function runZohoSync() {
  const before = getDashboard();
  const timestamp = new Date().toISOString();
  const packets = before.syncPreview.packets.filter((packet) => packet.amount > 0);
  let syncLogEntries = [];

  updateOwnerSetupData((current) => {
    syncLogEntries = packets.map((packet) => ({
      id: `sync-${packet.id}-${Date.now()}`,
      time: timestamp,
      type: packet.type,
      source: packet.source,
      account: packet.account,
      amount: packet.amount,
      status:
        current.integrations?.zohoBooks?.organizationId && current.integrations?.zohoBooks?.clientId
          ? "Prepared"
          : "Needs credentials"
    }));

    return {
      ...current,
      integrations: {
        ...(current.integrations || {}),
        zohoBooks: {
          ...(current.integrations?.zohoBooks || {}),
          lastSyncAt: timestamp
        },
        purchaseEntries: (current.integrations?.purchaseEntries || []).map((entry) => ({
          ...entry,
          status: entry.status === "Queued" && packets.some((packet) => packet.id === "vendor-purchases") ? "Prepared" : entry.status
        })),
        syncLog: [...syncLogEntries, ...(current.integrations?.syncLog || [])].slice(0, 20)
      }
    };
  });

  return {
    lastSyncAt: timestamp,
    entries: syncLogEntries
  };
}

module.exports = {
  fetchIntegrations,
  updateZohoBooks,
  updateAccountMapping,
  createVendorMapping,
  updateVendorMapping,
  deleteVendorMapping,
  createPurchaseEntry,
  runZohoSync
};
