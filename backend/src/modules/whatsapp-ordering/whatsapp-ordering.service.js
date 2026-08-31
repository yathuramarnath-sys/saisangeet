/**
 * whatsapp-ordering.service.js
 * Conversational WhatsApp ordering bot powered by Twilio.
 *
 * Each tenant stores their own Twilio credentials in owner-setup-store under
 * integrations.waOrdering. The public webhook uses the "To" number to find
 * the right tenant, then runs the conversation in that tenant's context.
 *
 * Session state is in-memory (resets on server restart). Good enough for pilot.
 */

const twilio = require("twilio");
const {
  getOwnerSetupData,
  updateOwnerSetupData,
  getAllCachedTenants,
} = require("../../data/owner-setup-store");
const { runWithTenant } = require("../../data/tenant-context");

// ── In-memory sessions ────────────────────────────────────────────────────────
// Key: customer WhatsApp number (e.g. "whatsapp:+919585699099")
// Pruned every 30 min of inactivity

const _sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;

function _pruneOldSessions() {
  const now = Date.now();
  for (const [k, s] of _sessions) {
    if (now - s.lastActivity > SESSION_TTL) _sessions.delete(k);
  }
}
setInterval(_pruneOldSessions, 5 * 60 * 1000).unref();

function getSession(from, tenantId) {
  if (!_sessions.has(from)) {
    _sessions.set(from, { state: "START", tenantId, cart: [], lastActivity: Date.now() });
  }
  const s = _sessions.get(from);
  s.lastActivity = Date.now();
  return s;
}

function resetSession(from, tenantId) {
  _sessions.set(from, { state: "START", tenantId, cart: [], lastActivity: Date.now() });
}

// ── Config helpers ────────────────────────────────────────────────────────────

function getConfig() {
  return getOwnerSetupData().integrations?.waOrdering || {};
}

function getMaskedConfig() {
  const c = getConfig();
  if (!c.accountSid) return { connected: false };
  return {
    connected:     !!(c.accountSid && c.apiKey && c.apiSecret && c.fromNumber),
    accountSid:    c.accountSid || "",
    apiKey:        c.apiKey ? "SK••••" + c.apiKey.slice(-4) : "",
    apiSecret:     c.apiSecret ? "••••" + c.apiSecret.slice(-4) : "",
    fromNumber:    c.fromNumber || "",
    notifyNumber:  c.notifyNumber || "",
    enabled:       c.enabled !== false,
  };
}

function saveConfig(payload) {
  updateOwnerSetupData((current) => {
    const existing = current.integrations?.waOrdering || {};
    return {
      ...current,
      integrations: {
        ...(current.integrations || {}),
        waOrdering: {
          accountSid:   payload.accountSid   || existing.accountSid   || "",
          apiKey:       payload.apiKey       || existing.apiKey       || "",
          apiSecret:    payload.apiSecret    || existing.apiSecret    || "",
          fromNumber:   payload.fromNumber   || existing.fromNumber   || "",
          notifyNumber: payload.notifyNumber !== undefined ? payload.notifyNumber : (existing.notifyNumber || ""),
          enabled:      payload.enabled !== undefined ? Boolean(payload.enabled) : (existing.enabled !== false),
        },
      },
    };
  });
  return getMaskedConfig();
}

// ── Twilio client ─────────────────────────────────────────────────────────────

function getClient(cfg) {
  const c = cfg || getConfig();
  if (!c.accountSid || !c.apiKey || !c.apiSecret) {
    throw new Error("Twilio credentials not configured. Add them in Integrations → WhatsApp Ordering.");
  }
  return twilio(c.apiKey, c.apiSecret, { accountSid: c.accountSid });
}

// ── Phone normalisation ───────────────────────────────────────────────────────

function normalizePhone(num) {
  if (!num) return "";
  if (num.startsWith("whatsapp:")) return num;
  const digits = String(num).replace(/\D/g, "");
  if (digits.length === 10) return `whatsapp:+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `whatsapp:+${digits}`;
  return `whatsapp:+${digits}`;
}

// ── Tenant lookup from "To" number (for public webhook) ──────────────────────

function findTenantByFromNumber(toNumber) {
  const normalized = normalizePhone(toNumber);
  const cache = getAllCachedTenants();
  for (const [tenantId, data] of cache) {
    const cfg = data.integrations?.waOrdering;
    if (cfg?.enabled && cfg.fromNumber && normalizePhone(cfg.fromNumber) === normalized) {
      return tenantId;
    }
  }
  return null;
}

// ── Message sender ────────────────────────────────────────────────────────────

async function sendMessage(to, body, cfg) {
  const c = cfg || getConfig();
  const client = getClient(c);
  await client.messages.create({
    from: normalizePhone(c.fromNumber),
    to:   normalizePhone(to),
    body,
  });
}

// ── Conversation helpers ──────────────────────────────────────────────────────

function getMenu() {
  const data = getOwnerSetupData();
  const categories = (data.menu?.categories || []).filter((cat) => cat.name);
  const items = (data.menu?.items || []).filter(
    (it) => it.available !== false && it.price
  );
  return { categories, items };
}

function cartTotal(cart) {
  return cart.reduce((sum, entry) => sum + entry.price * entry.qty, 0);
}

function formatCart(cart) {
  if (!cart.length) return "Your cart is empty.";
  const lines = cart.map((e) => `  • ${e.name} x${e.qty} — ₹${(e.price * e.qty).toFixed(0)}`);
  lines.push(`  *Total: ₹${cartTotal(cart).toFixed(0)}*`);
  return lines.join("\n");
}

function categoryList(categories) {
  return categories.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
}

function itemList(items) {
  return items.map((it, i) => {
    const price = it.variants?.length
      ? `₹${Math.min(...it.variants.map((v) => v.price))}`
      : `₹${Number(it.price || 0).toFixed(0)}`;
    return `${i + 1}. ${it.name} — ${price}`;
  }).join("\n");
}

// ── Order counter (in-memory, good enough for pilot) ─────────────────────────
let _orderSeq = 1;
function nextOrderRef() {
  return `WA${String(_orderSeq++).padStart(3, "0")}`;
}

// ── Main handler — called by webhook ─────────────────────────────────────────

async function handleInbound({ from, to, body }) {
  const tenantId = findTenantByFromNumber(to);
  if (!tenantId) return; // no tenant configured for this number — ignore

  // Run all conversation logic in the tenant's context
  await runWithTenant(tenantId, () => _handleInTenantContext({ from, to, body, tenantId }));
}

async function _handleInTenantContext({ from, to, body, tenantId }) {
  const cfg = getConfig();
  if (!cfg.enabled) return;

  const text = (body || "").trim().toLowerCase();
  const session = getSession(from, tenantId);

  // "cancel" or "stop" resets from any state
  if (text === "cancel" || text === "stop" || text === "0") {
    resetSession(from, tenantId);
    await sendMessage(from, "❌ Order cancelled. Send any message to start again.", cfg);
    return;
  }

  const data = getOwnerSetupData();
  const bizName = data.businessProfile?.tradeName || data.businessProfile?.legalName || "our restaurant";

  switch (session.state) {
    case "START": {
      const { categories } = getMenu();
      if (!categories.length) {
        await sendMessage(from, `👋 Welcome to *${bizName}*!\n\nSorry, our menu isn't available yet. Please call us directly.`, cfg);
        return;
      }
      session.categories = categories;
      session.state = "CATEGORIES";
      await sendMessage(
        from,
        `👋 Welcome to *${bizName}*!\n\nHere are our menu categories:\n\n${categoryList(categories)}\n\nReply with a number to browse, or *0* to cancel.`,
        cfg
      );
      return;
    }

    case "CATEGORIES": {
      const idx = parseInt(text, 10) - 1;
      const cats = session.categories || [];
      if (isNaN(idx) || idx < 0 || idx >= cats.length) {
        await sendMessage(from, `Please reply with a number from 1 to ${cats.length}.\n\n${categoryList(cats)}`, cfg);
        return;
      }
      const cat = cats[idx];
      const { items } = getMenu();
      const catItems = items.filter((it) => it.categoryId === cat.id);
      if (!catItems.length) {
        await sendMessage(from, `Sorry, *${cat.name}* has no items available right now. Choose another category:\n\n${categoryList(cats)}`, cfg);
        return;
      }
      session.currentCategory = cat;
      session.currentItems = catItems;
      session.state = "ITEMS";
      await sendMessage(
        from,
        `*${cat.name}*\n\n${itemList(catItems)}\n\nReply with a number to add to cart, or *0* to go back.`,
        cfg
      );
      return;
    }

    case "ITEMS": {
      if (text === "back" || text === "menu") {
        session.state = "CATEGORIES";
        const cats = session.categories || [];
        await sendMessage(from, `Choose a category:\n\n${categoryList(cats)}\n\nOr *0* to cancel.`, cfg);
        return;
      }
      const idx = parseInt(text, 10) - 1;
      const catItems = session.currentItems || [];
      if (isNaN(idx) || idx < 0 || idx >= catItems.length) {
        await sendMessage(from, `Please reply with a number from 1 to ${catItems.length}, or *back* to see categories.`, cfg);
        return;
      }
      const item = catItems[idx];
      const price = item.variants?.length
        ? Math.min(...item.variants.map((v) => v.price))
        : Number(item.price || 0);

      // Add to cart (merge duplicates)
      const existing = session.cart.find((e) => e.id === item.id);
      if (existing) {
        existing.qty += 1;
      } else {
        session.cart.push({ id: item.id, name: item.name, price, qty: 1 });
      }
      session.state = "CART";
      await sendMessage(
        from,
        `✅ Added *${item.name}* (₹${price.toFixed(0)})\n\n*Your cart:*\n${formatCart(session.cart)}\n\nReply:\n1 - Add more items\n2 - Place order\n0 - Cancel`,
        cfg
      );
      return;
    }

    case "CART": {
      if (text === "1" || text === "add" || text === "more") {
        session.state = "CATEGORIES";
        const cats = session.categories || [];
        await sendMessage(from, `Choose a category:\n\n${categoryList(cats)}\n\nOr *0* to cancel.`, cfg);
        return;
      }
      if (text === "2" || text === "order" || text === "done") {
        if (!session.cart.length) {
          await sendMessage(from, "Your cart is empty. Send any message to start ordering.", cfg);
          resetSession(from, tenantId);
          return;
        }
        session.state = "NAME";
        await sendMessage(from, "Great! Please reply with your *name* for the order:", cfg);
        return;
      }
      await sendMessage(
        from,
        `*Your cart:*\n${formatCart(session.cart)}\n\nReply:\n1 - Add more items\n2 - Place order\n0 - Cancel`,
        cfg
      );
      return;
    }

    case "NAME": {
      if (!text || text.length < 2) {
        await sendMessage(from, "Please reply with your name (at least 2 characters):", cfg);
        return;
      }
      const name = body.trim(); // preserve original casing
      const ref = nextOrderRef();
      const total = cartTotal(session.cart);
      const cartLines = session.cart.map((e) => `• ${e.name} x${e.qty} — ₹${(e.price * e.qty).toFixed(0)}`).join("\n");

      // Send confirmation to customer
      await sendMessage(
        from,
        `🎉 *Order Confirmed!*\n\nOrder ref: *${ref}*\nName: ${name}\n\n${cartLines}\n\n*Total: ₹${total.toFixed(0)}*\n\nWe'll have it ready in 15–20 mins. Thank you! 🙏`,
        cfg
      );

      // Notify the restaurant
      if (cfg.notifyNumber) {
        const customerNum = from.replace("whatsapp:", "");
        await sendMessage(
          cfg.notifyNumber,
          `🛍️ *New WhatsApp Order — ${ref}*\n\nCustomer: ${name}\nPhone: ${customerNum}\n\n${cartLines}\n\n*Total: ₹${total.toFixed(0)}*`,
          cfg
        ).catch(() => {}); // non-fatal
      }

      resetSession(from, tenantId);
      return;
    }

    default:
      resetSession(from, tenantId);
      session.state = "START";
      // Fall through to greet again on next message
      await sendMessage(from, `Send any message to start ordering at *${bizName}*.`, cfg);
  }
}

module.exports = {
  getMaskedConfig,
  saveConfig,
  handleInbound,
};
