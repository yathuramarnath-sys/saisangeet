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

const customersRouter = express.Router();

function getCustomers() {
  return getOwnerSetupData()?.customers || [];
}

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
