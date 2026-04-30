/**
 * billing.service.js
 * All Razorpay subscription logic.
 *
 * Flow:
 *   1. createSubscription(tenantId, planId)
 *      → creates Razorpay subscription with 30-day trial
 *      → stores sub metadata in tenant_billing Postgres table
 *      → returns { subscriptionId, shortUrl } so frontend can open Razorpay checkout
 *
 *   2. handleWebhook(payload, signature)
 *      → verifies Razorpay HMAC signature
 *      → updates tenant_billing row on charge / halt / cancel
 *
 *   3. getBillingStatus(tenantId)
 *      → returns current plan, status, trial days left, next billing date
 */

const crypto  = require("crypto");
const Razorpay = require("razorpay");
const { query } = require("../../db/pool");
const { PLANS, TRIAL_DAYS } = require("./billing.plans");
const { env } = require("../../config/env");

// ── Razorpay client (lazy) ───────────────────────────────────────────────────
// Initialised on first use so missing env vars don't crash startup
let _rzp = null;
function getRzp() {
  if (!_rzp) {
    if (!env.razorpayKeyId || !env.razorpayKeySecret) {
      throw new Error("Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    }
    _rzp = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return _rzp;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Ensure tenant_billing table exists.
 * Called once at startup from migrate.js.
 */
async function ensureBillingTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS tenant_billing (
      tenant_id          TEXT PRIMARY KEY,
      plan_id            TEXT        NOT NULL DEFAULT 'trial',
      status             TEXT        NOT NULL DEFAULT 'trialing',
      razorpay_sub_id    TEXT,
      razorpay_cust_id   TEXT,
      trial_ends_at      TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancelled_at       TIMESTAMPTZ,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add subdomain + restaurant_name columns for existing tables (idempotent)
  await query(`ALTER TABLE tenant_billing ADD COLUMN IF NOT EXISTS subdomain        TEXT UNIQUE`);
  await query(`ALTER TABLE tenant_billing ADD COLUMN IF NOT EXISTS restaurant_name  TEXT`);
}

// ── Subdomain helpers ─────────────────────────────────────────────────────────

const RESERVED_SLUGS = new Set([
  "app", "www", "api", "mail", "admin", "static", "cdn",
  "billing", "support", "help", "demo", "test", "plato", "pos",
  "dinexpos", "dinex", "login", "signup", "dashboard",
]);

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
}

/**
 * Set or update the custom subdomain for a tenant.
 * Validates format, checks reserved names, and throws a clear error if taken.
 */
async function saveSubdomain(tenantId, rawSlug) {
  const { isDatabaseEnabled } = require("../../db/database-mode");
  if (!isDatabaseEnabled()) throw new Error("Custom subdomains require database. Enable Postgres on Railway.");

  const slug = slugify(rawSlug);
  if (!slug || slug.length < 3) {
    throw new Error("Subdomain must be at least 3 characters (letters, numbers, hyphens).");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`"${slug}" is a reserved name — please choose a different one.`);
  }
  try {
    const result = await query(
      `UPDATE tenant_billing SET subdomain = $1, updated_at = NOW() WHERE tenant_id = $2`,
      [slug, tenantId]
    );
    // If no row was updated, the billing record doesn't exist yet (seedTrial may have failed)
    if (result.rowCount === 0) {
      throw new Error("Billing record not found — please wait a moment and try again.");
    }
  } catch (err) {
    if (err.code === "23505") {
      throw new Error(`"${slug}.dinexpos.in" is already taken — try a different name.`);
    }
    throw err;
  }
  return slug;
}

/**
 * Update the restaurant display name stored in billing (used by resolve-subdomain).
 * Called from auth.service after signup and from business-profile after update.
 */
async function updateRestaurantName(tenantId, name) {
  const { isDatabaseEnabled } = require("../../db/database-mode");
  if (!isDatabaseEnabled() || !name) return;
  await query(
    `UPDATE tenant_billing SET restaurant_name = $1, updated_at = NOW() WHERE tenant_id = $2`,
    [String(name).slice(0, 120), tenantId]
  );
}

/**
 * Public lookup: resolve a subdomain slug → { tenantId, restaurantName }.
 * Returns null if not found or DB unavailable.
 */
async function resolveSubdomain(slug) {
  const { isDatabaseEnabled } = require("../../db/database-mode");
  if (!isDatabaseEnabled() || !slug) return null;
  const r = await query(
    `SELECT tenant_id, restaurant_name FROM tenant_billing WHERE subdomain = $1`,
    [slug.toLowerCase().trim()]
  );
  if (!r.rows[0]) return null;
  return {
    tenantId:       r.rows[0].tenant_id,
    restaurantName: r.rows[0].restaurant_name || slug,
  };
}

/**
 * Get subdomain for a given tenant (for display in settings).
 */
async function getSubdomain(tenantId) {
  const { isDatabaseEnabled } = require("../../db/database-mode");
  if (!isDatabaseEnabled()) return { subdomain: null, restaurantName: null };
  const r = await query(
    `SELECT subdomain, restaurant_name FROM tenant_billing WHERE tenant_id = $1`,
    [tenantId]
  );
  return r.rows[0] ? {
    subdomain:      r.rows[0].subdomain || null,
    restaurantName: r.rows[0].restaurant_name || null,
  } : { subdomain: null, restaurantName: null };
}

async function upsertBillingRow(tenantId, fields) {
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  // Build SET clause for UPDATE
  const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");

  await query(
    `INSERT INTO tenant_billing (tenant_id, ${cols.join(", ")}, updated_at)
     VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET ${setClause}, updated_at = NOW()`,
    [tenantId, ...vals]
  );
}

async function getBillingRow(tenantId) {
  const r = await query(
    `SELECT * FROM tenant_billing WHERE tenant_id = $1`,
    [tenantId]
  );
  return r.rows[0] || null;
}

// ── Trial seeding ─────────────────────────────────────────────────────────────

/**
 * Called when a new tenant signs up.
 * Seeds a 30-day free trial row so they can use the system immediately.
 */
async function seedTrial(tenantId) {
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await upsertBillingRow(tenantId, {
    plan_id:       "trial",
    status:        "trialing",
    trial_ends_at: trialEndsAt.toISOString(),
  });
  return { trialEndsAt };
}

// ── Create subscription ───────────────────────────────────────────────────────

/**
 * Create a Razorpay subscription for the given tenant + plan.
 * Returns the short_url so the frontend can open Razorpay checkout.
 */
async function createSubscription(tenantId, planId) {
  const plan = PLANS[planId];
  if (!plan) throw new Error(`Unknown plan: ${planId}`);
  if (!plan.razorpayPlanId) {
    throw new Error(
      `Razorpay plan ID not configured for "${planId}". ` +
      `Set RAZORPAY_PLAN_${planId.toUpperCase()} in environment variables.`
    );
  }

  // Create subscription in Razorpay
  const sub = await getRzp().subscriptions.create({
    plan_id:         plan.razorpayPlanId,
    total_count:     120,           // max 10 years of monthly billing
    quantity:        1,
    customer_notify: 1,             // Razorpay sends payment reminders to customer
    notes: {
      tenantId,
      planId,
    },
  });

  // Store in DB
  await upsertBillingRow(tenantId, {
    plan_id:           planId,
    status:            "created",
    razorpay_sub_id:   sub.id,
  });

  return {
    subscriptionId: sub.id,
    shortUrl:       sub.short_url,
    planName:       plan.name,
    price:          plan.price,
  };
}

// ── Webhook handler ───────────────────────────────────────────────────────────

/**
 * Verify Razorpay webhook signature and update billing status.
 * Called from the webhook route with raw body Buffer + X-Razorpay-Signature header.
 */
async function handleWebhook(rawBody, signature) {
  const secret = env.razorpayWebhookSecret;

  if (secret) {
    // Verify HMAC-SHA256 signature
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      throw new Error("Webhook signature mismatch");
    }
  }

  const event = JSON.parse(rawBody.toString());
  const eventType = event.event;
  const payload   = event.payload?.subscription?.entity || {};
  const subId     = payload.id;

  if (!subId) return { ignored: true };

  // Find the tenant by razorpay_sub_id
  const r = await query(
    `SELECT tenant_id FROM tenant_billing WHERE razorpay_sub_id = $1`,
    [subId]
  );
  const tenantId = r.rows[0]?.tenant_id;
  if (!tenantId) return { ignored: true, reason: "tenant not found for sub " + subId };

  // Map Razorpay events → our status
  switch (eventType) {
    case "subscription.activated":
      await upsertBillingRow(tenantId, {
        status:            "active",
        current_period_end: payload.current_end
          ? new Date(payload.current_end * 1000).toISOString()
          : null,
      });
      break;

    case "subscription.charged":
      await upsertBillingRow(tenantId, {
        status:            "active",
        current_period_end: payload.current_end
          ? new Date(payload.current_end * 1000).toISOString()
          : null,
      });
      break;

    case "subscription.halted":
      // Payment failed multiple times — warn but don't cut access immediately
      await upsertBillingRow(tenantId, { status: "past_due" });
      break;

    case "subscription.cancelled":
      await upsertBillingRow(tenantId, {
        status:       "cancelled",
        cancelled_at: new Date().toISOString(),
      });
      break;

    case "subscription.pending":
      await upsertBillingRow(tenantId, { status: "pending" });
      break;

    default:
      // Unhandled event — log and ignore
      console.info(`[billing] unhandled webhook event: ${eventType}`);
      return { ignored: true, event: eventType };
  }

  return { ok: true, event: eventType, tenantId };
}

// ── Get billing status ────────────────────────────────────────────────────────

async function getBillingStatus(tenantId) {
  let row = await getBillingRow(tenantId);

  // If no row — tenant hasn't been seeded yet; create trial row on the fly
  if (!row) {
    await seedTrial(tenantId);
    row = await getBillingRow(tenantId);
  }

  const now = Date.now();

  // Compute trial days remaining
  let trialDaysLeft = 0;
  if (row.trial_ends_at) {
    const diff = new Date(row.trial_ends_at).getTime() - now;
    trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // Determine if access is allowed
  const isTrialing  = row.status === "trialing" && trialDaysLeft > 0;
  const isActive    = row.status === "active";
  const isPastDue   = row.status === "past_due";
  const isCancelled = row.status === "cancelled";
  const isExpired   = row.status === "trialing" && trialDaysLeft === 0;

  const hasAccess = isTrialing || isActive || isPastDue; // grace period on past_due

  const plan = PLANS[row.plan_id] || null;

  return {
    tenantId,
    planId:         row.plan_id,
    planName:       plan?.name || (row.plan_id === "trial" ? "Free Trial" : row.plan_id),
    status:         row.status,
    hasAccess,
    isTrialing,
    isActive,
    isPastDue,
    isCancelled,
    isExpired,
    trialDaysLeft,
    trialEndsAt:     row.trial_ends_at || null,
    currentPeriodEnd: row.current_period_end || null,
    cancelledAt:     row.cancelled_at || null,
    razorpaySubId:   row.razorpay_sub_id || null,
  };
}

// ── Cancel subscription ───────────────────────────────────────────────────────

async function cancelSubscription(tenantId) {
  const row = await getBillingRow(tenantId);
  if (!row?.razorpay_sub_id) throw new Error("No active subscription found");

  // Cancel at period end (not immediately) so they get remaining days
  await getRzp().subscriptions.cancel(row.razorpay_sub_id, { cancel_at_cycle_end: 1 });

  await upsertBillingRow(tenantId, {
    status:       "cancelled",
    cancelled_at: new Date().toISOString(),
  });

  return { ok: true };
}

module.exports = {
  ensureBillingTable,
  seedTrial,
  createSubscription,
  handleWebhook,
  getBillingStatus,
  cancelSubscription,
  // Subdomain
  slugify,
  saveSubdomain,
  updateRestaurantName,
  resolveSubdomain,
  getSubdomain,
};
