/**
 * customers.routes.js
 * Customer master — saved from POS Customer form, shown in Owner Console.
 *
 * GET    /customers              — list all customers
 * POST   /customers              — create or upsert by phone
 * PATCH  /customers/:id          — update customer
 * DELETE /customers/:id          — delete customer
 */
const express      = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { query } = require("../../db/pool");

const customersRouter = express.Router();

function getCustomers() {
  return getOwnerSetupData()?.customers || [];
}

// GET /customers/order-history?phone=xxx
customersRouter.get("/order-history", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const { phone, limit: lim = "20" } = req.query;
  if (!phone?.trim()) return res.status(400).json({ error: "phone is required" });

  const limit = Math.min(parseInt(lim, 10) || 20, 50);
  let orders = [];
  try {
    const r = await query(
      `SELECT pk, outlet_id, bill_no, closed_at, order_data
         FROM closed_orders
        WHERE tenant_id = $1
          AND (
            order_data->'customer'->>'phone' = $2
            OR order_data->>'customerPhone' = $2
          )
        ORDER BY closed_at DESC
        LIMIT $3`,
      [tenantId, phone.trim(), limit]
    );
    orders = r.rows.map(row => {
      const od = row.order_data || {};
      const items = od.items || od.kotItems || [];
      const itemsTotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || i.qty || 1), 0);
      return {
        id:          String(row.pk),
        outletId:    row.outlet_id,
        billNo:      row.bill_no || od.billNo || od.orderNumber || od.id || String(row.pk),
        date:        row.closed_at,
        items:       items.map(i => ({ name: i.name || i.itemName || "Item", qty: i.quantity || i.qty || 1, price: i.price || 0 })),
        total:       od.grandTotal || od.total || od.billTotal || itemsTotal,
        paymentMode: od.payments?.[0]?.method || od.paymentMode || od.payment || "—",
      };
    });
  } catch (err) {
    console.error("[customers] order-history query failed:", err.message);
  }

  res.json({ orders });
}));

// GET /customers
customersRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { q = "" } = req.query;
  let list = getCustomers();
  if (q.trim()) {
    const lq = q.trim().toLowerCase();
    list = list.filter(c =>
      (c.name  || "").toLowerCase().includes(lq) ||
      (c.phone || "").includes(lq) ||
      (c.email || "").toLowerCase().includes(lq) ||
      (c.gstin || "").toLowerCase().includes(lq)
    );
  }
  res.json(list);
}));

// POST /customers — create, or upsert by phone if phone already exists
customersRouter.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, phone, email, gstin, address, company, notes } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "name required" });

  let saved = null;
  updateOwnerSetupData(data => {
    const customers = data.customers || [];
    // Upsert by phone — same number = same customer record
    const idx = phone?.trim()
      ? customers.findIndex(c => c.phone && c.phone.trim() === phone.trim())
      : -1;

    const entry = {
      id:        idx >= 0 ? customers[idx].id : `cust-${Date.now()}`,
      name:      name.trim(),
      phone:     phone?.trim()   || "",
      email:     email?.trim()   || "",
      gstin:     gstin?.trim().toUpperCase() || "",
      address:   address?.trim() || "",
      company:   company?.trim() || "",
      notes:     notes?.trim()   || "",
      createdAt: idx >= 0 ? customers[idx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      customers[idx] = entry;
    } else {
      customers.push(entry);
    }
    saved = entry;
    return { ...data, customers };
  });

  res.status(201).json(saved);
}));

// PATCH /customers/:id
customersRouter.patch("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  let updated = null;
  updateOwnerSetupData(data => {
    const customers = data.customers || [];
    const idx = customers.findIndex(c => c.id === id);
    if (idx < 0) return data;
    customers[idx] = { ...customers[idx], ...req.body, id, updatedAt: new Date().toISOString() };
    updated = customers[idx];
    return { ...data, customers };
  });
  if (!updated) return res.status(404).json({ error: "Customer not found" });
  res.json(updated);
}));

// DELETE /customers/:id
customersRouter.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  let found = false;
  updateOwnerSetupData(data => {
    const customers = data.customers || [];
    const next = customers.filter(c => c.id !== id);
    found = next.length < customers.length;
    return { ...data, customers: next };
  });
  if (!found) return res.status(404).json({ error: "Customer not found" });
  res.json({ ok: true });
}));

module.exports = { customersRouter };
