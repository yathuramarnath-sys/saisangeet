/**
 * WhatsApp Ordering — conversation state machine.
 *
 * States:
 *   idle → category → items → item_variant → cake_type → cake_msg →
 *   advance_date → advance_time → cart → name → pickup → schedule → confirm → done
 *
 * Phase 1: Pickup only, Pay at Counter. No delivery, no payment gateway.
 */

const crypto = require("crypto");
const { sendText, sendList, sendButtons, markRead } = require("./whatsapp-ordering.sender");
const {
  getSession, upsertSession, deleteSession,
  getOrUpsertCustomer, incrementCustomerStats,
} = require("./whatsapp-ordering.repository");
const { addOnlineOrder } = require("../online-orders/online-orders.store");
const { saveOnlineOrder } = require("../online-orders/online-orders.repository");
const { runWithTenant } = require("../../data/tenant-context");

// ── IST time helpers ──────────────────────────────────────────────────────────

const IST = "Asia/Kolkata";

function nowIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: IST }));
}

function toISTDate(date) {
  return new Date(date.toLocaleString("en-US", { timeZone: IST }));
}

/** "10:00" → { h: 10, m: 0 } */
function parseTime(t) {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function formatTime12(h, m) {
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

function isStoreClosed(cfg) {
  const now = nowIST();
  const { h: oh, m: om } = parseTime(cfg.opening_time);
  const { h: ch, m: cm } = parseTime(cfg.closing_time);
  const cur = now.getHours() * 60 + now.getMinutes();
  const open = oh * 60 + om;
  const close = ch * 60 + cm;
  return cur < open || cur >= close;
}

/**
 * Generate pickup time slots starting from now + prepMins,
 * in 30-minute increments up to closing time.
 * Returns up to 10 slots as [{ label: "11:00 AM", value: "11:00" }].
 */
function getPickupSlots(cfg, advanceMinutes = 0) {
  const now = nowIST();
  const prepMins = advanceMinutes || cfg.prep_time_minutes || 25;
  const earliest = new Date(now.getTime() + prepMins * 60 * 1000);
  const { h: ch, m: cm } = parseTime(cfg.closing_time);
  const closingMins = ch * 60 + cm;

  const slots = [];
  let cur = toISTDate(earliest);
  // Round up to next 30-min mark
  const mins = cur.getHours() * 60 + cur.getMinutes();
  const rounded = Math.ceil(mins / 30) * 30;
  cur.setHours(Math.floor(rounded / 60), rounded % 60, 0, 0);

  while (slots.length < 10) {
    const totalMins = cur.getHours() * 60 + cur.getMinutes();
    if (totalMins + 15 >= closingMins) break;
    slots.push({
      label: formatTime12(cur.getHours(), cur.getMinutes()),
      value: `${String(cur.getHours()).padStart(2, "0")}:${String(cur.getMinutes()).padStart(2, "0")}`,
    });
    cur = new Date(cur.getTime() + 30 * 60 * 1000);
  }
  return slots;
}

/** Generate dates for advance booking (today + next 7 days, respecting store hours). */
function getAdvanceDates() {
  const dates = [];
  const now = nowIST();
  for (let d = 0; d <= 7; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    const label = d === 0 ? "Today" : d === 1 ? "Tomorrow"
      : date.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", timeZone: IST });
    dates.push({
      label,
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    });
  }
  return dates;
}

// ── Menu helpers ──────────────────────────────────────────────────────────────

function getMenuData(tenantData) {
  const raw = tenantData?.menu || {};
  const categories = (raw.categories || []).filter(c => c && c.id && c.name);
  const items = (raw.items || []).filter(i => i && i.id && i.name && i.isAvailable !== false);
  return { categories, items };
}

function computePrice(item) {
  if (typeof item.price === "number" && item.price > 0) return item.price;
  if (typeof item.basePrice === "number" && item.basePrice > 0) return item.basePrice;
  return 0;
}

function formatPrice(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function cartTotal(cart) {
  return cart.reduce((sum, i) => sum + (i.unit_price * i.qty), 0);
}

function cartSummaryText(cart, cfg) {
  const lines = cart.map(i => {
    const variant = i.variant_label ? ` (${i.variant_label})` : "";
    const note = i.note ? ` — "${i.note}"` : "";
    const scheduled = i.scheduled_label ? `\n   📅 ${i.scheduled_label}` : "";
    return `• ${i.name}${variant} × ${i.qty} — ${formatPrice(i.unit_price * i.qty)}${note}${scheduled}`;
  });
  const total = cartTotal(cart);
  const minOk = total >= (cfg.min_order_amount || 0);
  let text = `🛒 *Your Cart*\n\n${lines.join("\n")}\n\n*Total: ${formatPrice(total)}*`;
  if (!minOk && cfg.min_order_amount > 0) {
    text += `\n\n⚠️ Minimum order is ${formatPrice(cfg.min_order_amount)}`;
  }
  return { text, total, minOk };
}

function isAdvanceItem(item, advanceCategoryIds) {
  return Array.isArray(advanceCategoryIds) && advanceCategoryIds.includes(item.categoryId);
}

// ── Message senders ───────────────────────────────────────────────────────────

function sendGreeting(pid, token, to, cfg, customerName) {
  const name = customerName ? `, ${customerName.split(" ")[0]}` : "";
  return sendButtons(pid, token, to, {
    header: cfg.restaurant_name || "Plato",
    body:   `Welcome${name}! 👋\n\nWe're happy to take your order.\nWhat would you like to do?`,
    footer: `Min order: ${formatPrice(cfg.min_order_amount)}`,
    buttons: [
      { id: "ACT:ORDER", title: "Order Now" },
      { id: "ACT:CART",  title: "View Cart" },
    ],
  });
}

function sendCategories(pid, token, to, categories, cfg) {
  const rows = categories.map(c => ({
    id:    `CAT:${c.id}`,
    title: c.name.slice(0, 24),
  }));
  return sendList(pid, token, to, {
    header:   cfg.restaurant_name || "Menu",
    body:     "Choose a category to browse:",
    footer:   `Min order: ${formatPrice(cfg.min_order_amount)}`,
    button:   "Browse Menu",
    sections: [{ title: "Categories", rows }],
  });
}

function sendItems(pid, token, to, items, categoryName, page, cfg) {
  const pageSize = 10;
  const start = page * pageSize;
  const slice = items.slice(start, start + pageSize);
  const hasNext = items.length > start + pageSize;

  const rows = slice.map(i => {
    const price = computePrice(i);
    const desc = i.description
      ? i.description.slice(0, 50)
      : price ? `${formatPrice(price)}` : "";
    return { id: `ITEM:${i.id}`, title: i.name.slice(0, 24), description: desc.slice(0, 72) };
  });

  if (hasNext) rows.push({ id: `PAGE:${page + 1}`, title: "More items →" });
  rows.push({ id: "ACT:BACK", title: "← Categories" });

  return sendList(pid, token, to, {
    header:   categoryName,
    body:     `Select an item to add to your cart:`,
    button:   "View Items",
    sections: [{ title: categoryName.slice(0, 24), rows }],
  });
}

function sendVariants(pid, token, to, item) {
  const variants = item.variants || [];
  if (!variants.length) return null;

  if (variants.length <= 3) {
    return sendButtons(pid, token, to, {
      header: item.name,
      body:   `Choose your size / variant for *${item.name}*:`,
      buttons: variants.map(v => ({
        id:    `VAR:${v.label || v.name || v.id}`,
        title: String(v.label || v.name || v.id).slice(0, 20),
      })),
    });
  }

  const rows = variants.map(v => ({
    id:          `VAR:${v.label || v.name || v.id}`,
    title:       String(v.label || v.name || v.id).slice(0, 24),
    description: v.price ? formatPrice(v.price) : "",
  }));
  return sendList(pid, token, to, {
    header:   item.name,
    body:     `Choose your size / variant:`,
    button:   "Select Size",
    sections: [{ title: "Options", rows }],
  });
}

function sendCakeTypeChoice(pid, token, to, item) {
  return sendButtons(pid, token, to, {
    header: item.name,
    body:   `Choose your preference for *${item.name}*:`,
    buttons: [
      { id: "CTYPE:EGGLESS", title: "Eggless" },
      { id: "CTYPE:REGULAR", title: "Regular (with egg)" },
    ],
  });
}

function sendCakeMsgPrompt(pid, token, to, item) {
  return sendText(pid, token, to,
    `✏️ *Message on the cake?*\n\nType the message you'd like written on the *${item.name}* (e.g. "Happy Birthday Arjun").\n\nOr type *skip* to leave it blank.`
  );
}

function sendAdvanceDatePicker(pid, token, to, item) {
  const dates = getAdvanceDates();
  return sendList(pid, token, to, {
    header: "Pick a Date",
    body:   `When do you want to pick up your *${item.name}*?`,
    button: "Choose Date",
    sections: [{
      title: "Available Dates",
      rows: dates.map(d => ({ id: `DATE:${d.value}`, title: d.label })),
    }],
  });
}

function sendAdvanceTimePicker(pid, token, to, cfg, dateLabel) {
  const slots = getPickupSlots(cfg, 120);
  if (!slots.length) {
    return sendText(pid, token, to, "Sorry, no more pickup slots are available for today. Please choose another date.");
  }
  return sendList(pid, token, to, {
    header: `Pickup Time — ${dateLabel}`,
    body:   "Choose your pickup time:",
    button: "Select Time",
    sections: [{
      title: "Available Slots",
      rows: slots.map(s => ({ id: `ATIME:${s.value}`, title: s.label })),
    }],
  });
}

function sendCartView(pid, token, to, cart, cfg) {
  const { text, total, minOk } = cartSummaryText(cart, cfg);
  const buttons = minOk
    ? [
        { id: "CART:CHECKOUT", title: "Checkout" },
        { id: "CART:MORE",     title: "Add More Items" },
        { id: "CART:CLEAR",    title: "Clear Cart" },
      ]
    : [
        { id: "CART:MORE",  title: "Add More Items" },
        { id: "CART:CLEAR", title: "Clear Cart" },
      ];
  return sendButtons(pid, token, to, { body: text, buttons });
}

function sendNamePrompt(pid, token, to) {
  return sendText(pid, token, to, "What's your name? (So we can call you when your order is ready)");
}

function sendPickupChoice(pid, token, to, cfg) {
  const asapLabel = `ASAP (~${cfg.prep_time_minutes || 25} min)`;
  const buttons = [{ id: "PICKUP:ASAP", title: asapLabel.slice(0, 20) }];
  if (cfg.scheduled_pickup) buttons.push({ id: "PICKUP:SCHEDULE", title: "Schedule Pickup" });
  return sendButtons(pid, token, to, {
    body:    "When would you like to pick up your order?",
    buttons,
  });
}

function sendScheduleTimePicker(pid, token, to, cfg) {
  const slots = getPickupSlots(cfg, cfg.prep_time_minutes || 25);
  if (!slots.length) {
    return sendText(pid, token, to,
      `No more pickup slots available today. Please come back before ${cfg.closing_time}.`
    );
  }
  return sendList(pid, token, to, {
    header: "Schedule Pickup",
    body:   "Choose a pickup time:",
    button: "Pick a Time",
    sections: [{
      title: "Today's Slots",
      rows: slots.map(s => ({ id: `SLOT:${s.value}`, title: s.label })),
    }],
  });
}

function sendOrderConfirm(pid, token, to, session, cfg) {
  const { text, total } = cartSummaryText(session.cart, cfg);
  const timeLabel = session.is_asap
    ? `ASAP (~${cfg.prep_time_minutes || 25} min)`
    : session.scheduled_label || session.scheduled_at || "Scheduled";

  const confirmText = `${text}\n\n👤 *Name:* ${session.customer_name || "Guest"}\n🕐 *Pickup:* ${timeLabel}\n🏪 *From:* ${cfg.restaurant_name}`;
  return sendButtons(pid, token, to, {
    header: "Confirm Order",
    body:   confirmText,
    footer: "Pay at counter when you pick up",
    buttons: [
      { id: "CONFIRM:YES", title: "Place Order ✅" },
      { id: "CONFIRM:NO",  title: "Cancel" },
    ],
  });
}

// ── Order creation ────────────────────────────────────────────────────────────

async function createWaOrder(io, tenantId, session, cfg) {
  const orderId = `WA-${Date.now().toString().slice(-6)}`;
  const id      = `wa_${crypto.randomBytes(6).toString("hex")}`;
  const total   = cartTotal(session.cart);
  const timeLabel = session.is_asap
    ? `ASAP (~${cfg.prep_time_minutes || 25} min)`
    : session.scheduled_label || session.scheduled_at || "Scheduled";

  const order = {
    id,
    orderId,
    platform: "WhatsApp",
    customer: {
      name:    session.customer_name || "WhatsApp Customer",
      phone:   session.customer_phone,
      address: "",
    },
    items: session.cart.map(i => {
      const note = [
        i.variant_label,
        i.cake_type,
        i.note ? `"${i.note}"` : null,
        i.scheduled_label ? `Pickup: ${i.scheduled_label}` : null,
      ].filter(Boolean).join(", ");
      return { name: i.name, price: i.unit_price, quantity: i.qty, note };
    }),
    total,
    etaMin:  cfg.prep_time_minutes || 25,
    notes:   `Pickup: ${timeLabel}`,
    source:  "whatsapp",
  };

  const outletId = session.outlet_id || cfg.outlet_id;

  const stored = await runWithTenant(tenantId, () =>
    addOnlineOrder(tenantId, outletId, order)
  );

  saveOnlineOrder(tenantId, outletId, stored).catch(() => {});

  if (io) {
    io.to(`outlet:${tenantId}:${outletId}`).emit("online:order:new", { order: stored, outletId });
    io.to(`tenant:${tenantId}`).emit("online:order:new", { order: stored, outletId });
  }

  await incrementCustomerStats(tenantId, session.customer_phone, total).catch(() => {});

  return stored;
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

async function handleIncomingMessage({ io, tenantId, cfg, pid, token, from, message, contactName, tenantData }) {
  // Mark as read immediately
  markRead(pid, token, message.id);

  // Extract message content
  const msgType = message.type;
  let textBody = null;
  let actionId  = null;

  if (msgType === "text") {
    textBody = (message.text?.body || "").trim();
  } else if (msgType === "interactive") {
    const ir = message.interactive;
    if (ir.type === "list_reply") {
      actionId  = ir.list_reply?.id;
    } else if (ir.type === "button_reply") {
      actionId  = ir.button_reply?.id;
    }
  }

  // Load session
  let session = await getSession(tenantId, from);
  const outletId = cfg.outlet_id || "";

  if (!session) {
    session = {
      tenant_id: tenantId, outlet_id: outletId, customer_phone: from,
      state: "idle", cart: [], customer_name: contactName || null,
      order_type: "pickup", is_asap: true, scheduled_at: null,
      current_item: null, current_cat_id: null, page: 0,
    };
  }

  // Store customer profile
  getOrUpsertCustomer(tenantId, from, contactName).catch(() => {});

  // Closed check (skip for cart/confirm states so customer can finish)
  const skipClosedCheck = ["cart", "name", "pickup", "schedule", "confirm"].includes(session.state);
  if (isStoreClosed(cfg) && !skipClosedCheck) {
    const { h, m } = parseTime(cfg.opening_time);
    return sendText(pid, token, from,
      `${cfg.restaurant_name} is currently closed.\n\nWe open at ${formatTime12(h, m)} 🕐\n\nSee you then!`
    );
  }

  // Global shortcuts
  if (actionId === "ACT:ORDER" || textBody?.toLowerCase() === "menu") {
    const { categories } = getMenuData(tenantData);
    const active = categories.filter(c => c.isActive !== false);
    session.state = "category"; session.cart = []; session.current_item = null;
    await upsertSession(session);
    return sendCategories(pid, token, from, active, cfg);
  }

  if (actionId === "ACT:CART" || textBody?.toLowerCase() === "cart") {
    if (!session.cart.length) {
      session.state = "category";
      await upsertSession(session);
      const { categories } = getMenuData(tenantData);
      await sendText(pid, token, from, "Your cart is empty. Let's add some items first! 😊");
      return sendCategories(pid, token, from, categories.filter(c => c.isActive !== false), cfg);
    }
    session.state = "cart";
    await upsertSession(session);
    return sendCartView(pid, token, from, session.cart, cfg);
  }

  // ── State machine ─────────────────────────────────────────────────────────

  switch (session.state) {

    case "idle":
    default: {
      session.state = "idle";
      await upsertSession(session);
      return sendGreeting(pid, token, from, cfg, session.customer_name);
    }

    case "category": {
      if (!actionId?.startsWith("CAT:")) {
        const { categories } = getMenuData(tenantData);
        return sendCategories(pid, token, from, categories.filter(c => c.isActive !== false), cfg);
      }
      const catId = actionId.slice(4);
      const { categories, items } = getMenuData(tenantData);
      const cat = categories.find(c => c.id === catId);
      const catItems = items.filter(i => i.categoryId === catId);
      if (!cat || !catItems.length) {
        return sendText(pid, token, from, "That category is currently empty. Please choose another.");
      }
      session.state = "items"; session.current_cat_id = catId; session.page = 0;
      await upsertSession(session);
      return sendItems(pid, token, from, catItems, cat.name, 0, cfg);
    }

    case "items": {
      if (actionId === "ACT:BACK") {
        const { categories } = getMenuData(tenantData);
        session.state = "category";
        await upsertSession(session);
        return sendCategories(pid, token, from, categories.filter(c => c.isActive !== false), cfg);
      }

      if (actionId?.startsWith("PAGE:")) {
        const page = parseInt(actionId.slice(5), 10) || 0;
        const { categories, items } = getMenuData(tenantData);
        const catItems = items.filter(i => i.categoryId === session.current_cat_id);
        const cat = categories.find(c => c.id === session.current_cat_id);
        session.page = page;
        await upsertSession(session);
        return sendItems(pid, token, from, catItems, cat?.name || "Menu", page, cfg);
      }

      if (!actionId?.startsWith("ITEM:")) {
        const { categories, items } = getMenuData(tenantData);
        const catItems = items.filter(i => i.categoryId === session.current_cat_id);
        const cat = categories.find(c => c.id === session.current_cat_id);
        return sendItems(pid, token, from, catItems, cat?.name || "Menu", session.page, cfg);
      }

      const itemId = actionId.slice(5);
      const { items } = getMenuData(tenantData);
      const item = items.find(i => i.id === itemId);
      if (!item) return sendText(pid, token, from, "That item is no longer available. Please choose another.");

      session.current_item = {
        id: item.id, name: item.name, categoryId: item.categoryId,
        basePrice: computePrice(item),
        variants: item.variants || [],
        isAdvance: isAdvanceItem(item, cfg.advance_category_ids),
      };

      if (item.variants?.length) {
        session.state = "item_variant";
        await upsertSession(session);
        return sendVariants(pid, token, from, item);
      }

      if (session.current_item.isAdvance) {
        session.state = "cake_type";
        await upsertSession(session);
        return sendCakeTypeChoice(pid, token, from, item);
      }

      // Plain item — add to cart directly
      session.cart = addToCart(session.cart, {
        item_id: item.id, name: item.name,
        variant_label: null, cake_type: null, note: null,
        unit_price: computePrice(item), qty: 1,
        is_advance: false, scheduled_label: null,
      });
      session.state = "cart";
      session.current_item = null;
      await upsertSession(session);
      await sendText(pid, token, from, `✅ *${item.name}* added to cart!`);
      return sendCartView(pid, token, from, session.cart, cfg);
    }

    case "item_variant": {
      if (!actionId?.startsWith("VAR:")) {
        if (session.current_item?.variants?.length) {
          return sendVariants(pid, token, from, session.current_item);
        }
        session.state = "items";
        await upsertSession(session);
        return sendText(pid, token, from, "Please select a size.");
      }
      const varLabel = actionId.slice(4);
      const variant  = (session.current_item.variants || []).find(
        v => (v.label || v.name || v.id) === varLabel
      );
      const price = variant?.price || session.current_item.basePrice;
      session.current_item = { ...session.current_item, variant_label: varLabel, unit_price: price };

      if (session.current_item.isAdvance) {
        session.state = "cake_type";
        await upsertSession(session);
        return sendCakeTypeChoice(pid, token, from, session.current_item);
      }

      session.cart = addToCart(session.cart, {
        item_id: session.current_item.id, name: session.current_item.name,
        variant_label: varLabel, cake_type: null, note: null,
        unit_price: price, qty: 1,
        is_advance: false, scheduled_label: null,
      });
      session.state = "cart"; session.current_item = null;
      await upsertSession(session);
      await sendText(pid, token, from, `✅ *${session.current_item?.name || "Item"}* added to cart!`);
      return sendCartView(pid, token, from, session.cart, cfg);
    }

    case "cake_type": {
      if (!actionId?.startsWith("CTYPE:")) {
        return sendCakeTypeChoice(pid, token, from, session.current_item);
      }
      const ctype = actionId.slice(6); // "EGGLESS" or "REGULAR"
      session.current_item = { ...session.current_item, cake_type: ctype === "EGGLESS" ? "Eggless" : "Regular" };
      session.state = "cake_msg";
      await upsertSession(session);
      return sendCakeMsgPrompt(pid, token, from, session.current_item);
    }

    case "cake_msg": {
      const cakeMsg = textBody === "skip" || !textBody ? null : textBody;
      session.current_item = { ...session.current_item, note: cakeMsg };
      session.state = "advance_date";
      await upsertSession(session);
      return sendAdvanceDatePicker(pid, token, from, session.current_item);
    }

    case "advance_date": {
      if (!actionId?.startsWith("DATE:")) {
        return sendAdvanceDatePicker(pid, token, from, session.current_item);
      }
      const dateVal = actionId.slice(5);
      const dates = getAdvanceDates();
      const chosenDate = dates.find(d => d.value === dateVal);
      session.current_item = { ...session.current_item, advance_date: dateVal, date_label: chosenDate?.label || dateVal };
      session.state = "advance_time";
      await upsertSession(session);
      return sendAdvanceTimePicker(pid, token, from, cfg, chosenDate?.label || dateVal);
    }

    case "advance_time": {
      if (!actionId?.startsWith("ATIME:")) {
        return sendAdvanceTimePicker(pid, token, from, cfg, session.current_item?.date_label || "");
      }
      const timeVal = actionId.slice(6);
      const { h, m } = parseTime(timeVal);
      const scheduledLabel = `${session.current_item?.date_label || ""} at ${formatTime12(h, m)}`;

      session.cart = addToCart(session.cart, {
        item_id:        session.current_item.id,
        name:           session.current_item.name,
        variant_label:  session.current_item.variant_label || null,
        cake_type:      session.current_item.cake_type || null,
        note:           session.current_item.note || null,
        unit_price:     session.current_item.unit_price || session.current_item.basePrice,
        qty:            1,
        is_advance:     true,
        scheduled_label: scheduledLabel,
        advance_date:   session.current_item.advance_date,
        advance_time:   timeVal,
      });

      session.state = "cart"; session.current_item = null;
      await upsertSession(session);
      await sendText(pid, token, from, `✅ *${session.cart[session.cart.length - 1]?.name}* scheduled for ${scheduledLabel}!`);
      return sendCartView(pid, token, from, session.cart, cfg);
    }

    case "cart": {
      if (actionId === "CART:CLEAR") {
        session.cart = []; session.state = "category";
        await upsertSession(session);
        const { categories } = getMenuData(tenantData);
        await sendText(pid, token, from, "Cart cleared. Let's start again 😊");
        return sendCategories(pid, token, from, categories.filter(c => c.isActive !== false), cfg);
      }

      if (actionId === "CART:MORE") {
        const { categories } = getMenuData(tenantData);
        session.state = "category";
        await upsertSession(session);
        return sendCategories(pid, token, from, categories.filter(c => c.isActive !== false), cfg);
      }

      if (actionId === "CART:CHECKOUT") {
        const { minOk } = cartSummaryText(session.cart, cfg);
        if (!minOk) {
          return sendCartView(pid, token, from, session.cart, cfg);
        }
        session.state = "name";
        await upsertSession(session);
        if (session.customer_name) {
          // Skip name if we already have it — go straight to pickup
          session.state = "pickup";
          await upsertSession(session);
          return sendPickupChoice(pid, token, from, cfg);
        }
        return sendNamePrompt(pid, token, from);
      }

      // Default: re-show cart
      return sendCartView(pid, token, from, session.cart, cfg);
    }

    case "name": {
      const name = textBody || contactName || "Guest";
      session.customer_name = name;
      session.state = "pickup";
      await upsertSession(session);
      return sendPickupChoice(pid, token, from, cfg);
    }

    case "pickup": {
      if (actionId === "PICKUP:ASAP") {
        session.is_asap = true; session.scheduled_at = null;
        session.state = "confirm";
        await upsertSession(session);
        return sendOrderConfirm(pid, token, from, session, cfg);
      }
      if (actionId === "PICKUP:SCHEDULE") {
        session.state = "schedule";
        await upsertSession(session);
        return sendScheduleTimePicker(pid, token, from, cfg);
      }
      return sendPickupChoice(pid, token, from, cfg);
    }

    case "schedule": {
      if (!actionId?.startsWith("SLOT:")) {
        return sendScheduleTimePicker(pid, token, from, cfg);
      }
      const timeVal = actionId.slice(5);
      const { h, m } = parseTime(timeVal);
      session.is_asap = false;
      session.scheduled_at = new Date().toISOString(); // reference point
      session.scheduled_label = `Today at ${formatTime12(h, m)}`;
      session.state = "confirm";
      await upsertSession(session);
      return sendOrderConfirm(pid, token, from, session, cfg);
    }

    case "confirm": {
      if (actionId === "CONFIRM:NO") {
        session.state = "cart";
        await upsertSession(session);
        return sendCartView(pid, token, from, session.cart, cfg);
      }

      if (actionId === "CONFIRM:YES") {
        const order = await createWaOrder(io, tenantId, session, cfg);
        await deleteSession(tenantId, from);

        const timeLabel = session.is_asap
          ? `~${cfg.prep_time_minutes || 25} minutes`
          : session.scheduled_label || "your scheduled time";

        return sendText(pid, token, from,
          `✅ *Order Placed!*\n\n*Order ID:* ${order.orderId}\n*From:* ${cfg.restaurant_name}\n*Pickup:* ${timeLabel}\n\n` +
          `Please pay at the counter when you pick up. 🙏\n\n` +
          `We'll have your order ready! Reply *menu* anytime to order again.`
        );
      }

      return sendOrderConfirm(pid, token, from, session, cfg);
    }
  }
}

// ── Cart helper ───────────────────────────────────────────────────────────────

function addToCart(cart, newItem) {
  // Increment qty if same item + variant + type already in cart
  const existing = cart.find(i =>
    i.item_id === newItem.item_id &&
    i.variant_label === newItem.variant_label &&
    i.cake_type === newItem.cake_type &&
    i.is_advance === newItem.is_advance
  );
  if (existing && !newItem.is_advance) {
    return cart.map(i => i === existing ? { ...i, qty: i.qty + 1 } : i);
  }
  return [...cart, { ...newItem, qty: newItem.qty || 1 }];
}

module.exports = { handleIncomingMessage };
