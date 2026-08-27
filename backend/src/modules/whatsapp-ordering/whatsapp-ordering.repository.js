const crypto  = require("crypto");
const { query } = require("../../db/pool");

const SESSION_TTL_MIN = 30;

// ── Table creation ────────────────────────────────────────────────────────────

async function ensureWaOrderingTables(queryFn = query) {
  await queryFn(`
    CREATE TABLE IF NOT EXISTS wa_ordering_config (
      id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id            TEXT        NOT NULL UNIQUE,
      outlet_id            TEXT,
      phone_number_id      TEXT,
      waba_id              TEXT,
      access_token         TEXT,
      webhook_verify_token TEXT        NOT NULL DEFAULT '',
      display_phone        TEXT,
      is_active            BOOLEAN     NOT NULL DEFAULT false,
      restaurant_name      TEXT        NOT NULL DEFAULT '',
      min_order_amount     INTEGER     NOT NULL DEFAULT 0,
      prep_time_minutes    INTEGER     NOT NULL DEFAULT 25,
      advance_category_ids JSONB       NOT NULL DEFAULT '[]',
      scheduled_pickup     BOOLEAN     NOT NULL DEFAULT true,
      opening_time         TEXT        NOT NULL DEFAULT '10:00',
      closing_time         TEXT        NOT NULL DEFAULT '21:30',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryFn(`
    CREATE TABLE IF NOT EXISTS wa_sessions (
      id              TEXT        PRIMARY KEY,
      tenant_id       TEXT        NOT NULL,
      outlet_id       TEXT        NOT NULL,
      customer_phone  TEXT        NOT NULL,
      state           TEXT        NOT NULL DEFAULT 'idle',
      cart            JSONB       NOT NULL DEFAULT '[]',
      customer_name   TEXT,
      order_type      TEXT        NOT NULL DEFAULT 'pickup',
      is_asap         BOOLEAN     NOT NULL DEFAULT true,
      scheduled_at    TIMESTAMPTZ,
      current_item    JSONB,
      current_cat_id  TEXT,
      page            INTEGER     NOT NULL DEFAULT 0,
      expires_at      TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, customer_phone)
    )
  `);
  await queryFn(`CREATE INDEX IF NOT EXISTS idx_wa_sessions_tenant_phone ON wa_sessions (tenant_id, customer_phone)`);
  await queryFn(`CREATE INDEX IF NOT EXISTS idx_wa_sessions_expires ON wa_sessions (expires_at)`);

  await queryFn(`
    CREATE TABLE IF NOT EXISTS wa_customers (
      id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id     TEXT         NOT NULL,
      phone         TEXT         NOT NULL,
      name          TEXT,
      order_count   INTEGER      NOT NULL DEFAULT 0,
      total_spent   NUMERIC(12,2) NOT NULL DEFAULT 0,
      last_order_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, phone)
    )
  `);
}

// ── Config ────────────────────────────────────────────────────────────────────

async function getWaConfigByPhoneNumberId(phoneNumberId) {
  const r = await query(
    `SELECT * FROM wa_ordering_config WHERE phone_number_id = $1 AND is_active = true`,
    [phoneNumberId]
  );
  return r.rows[0] || null;
}

async function getWaConfigByTenant(tenantId) {
  const r = await query(`SELECT * FROM wa_ordering_config WHERE tenant_id = $1`, [tenantId]);
  return r.rows[0] || null;
}

async function saveWaConfig(tenantId, cfg) {
  const {
    outletId, phoneNumberId, wabaId, accessToken, webhookVerifyToken,
    displayPhone, isActive, restaurantName, minOrderAmount,
    prepTimeMinutes, advanceCategoryIds, scheduledPickup,
    openingTime, closingTime,
  } = cfg;

  await query(`
    INSERT INTO wa_ordering_config (
      tenant_id, outlet_id, phone_number_id, waba_id, access_token,
      webhook_verify_token, display_phone, is_active, restaurant_name,
      min_order_amount, prep_time_minutes, advance_category_ids,
      scheduled_pickup, opening_time, closing_time, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET
      outlet_id            = EXCLUDED.outlet_id,
      phone_number_id      = EXCLUDED.phone_number_id,
      waba_id              = EXCLUDED.waba_id,
      access_token         = COALESCE(NULLIF(EXCLUDED.access_token,''), wa_ordering_config.access_token),
      webhook_verify_token = COALESCE(NULLIF(EXCLUDED.webhook_verify_token,''), wa_ordering_config.webhook_verify_token),
      display_phone        = EXCLUDED.display_phone,
      is_active            = EXCLUDED.is_active,
      restaurant_name      = EXCLUDED.restaurant_name,
      min_order_amount     = EXCLUDED.min_order_amount,
      prep_time_minutes    = EXCLUDED.prep_time_minutes,
      advance_category_ids = EXCLUDED.advance_category_ids,
      scheduled_pickup     = EXCLUDED.scheduled_pickup,
      opening_time         = EXCLUDED.opening_time,
      closing_time         = EXCLUDED.closing_time,
      updated_at           = NOW()
  `, [
    tenantId,
    outletId || null,
    phoneNumberId || null,
    wabaId || null,
    accessToken || '',
    webhookVerifyToken || '',
    displayPhone || null,
    isActive !== false,
    restaurantName || '',
    minOrderAmount || 0,
    prepTimeMinutes || 25,
    JSON.stringify(advanceCategoryIds || []),
    scheduledPickup !== false,
    openingTime || '10:00',
    closingTime || '21:30',
  ]);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function getSession(tenantId, customerPhone) {
  const r = await query(
    `SELECT * FROM wa_sessions WHERE tenant_id = $1 AND customer_phone = $2 AND expires_at > NOW()`,
    [tenantId, customerPhone]
  );
  if (!r.rows[0]) return null;
  const s = r.rows[0];
  return {
    ...s,
    cart:         Array.isArray(s.cart)         ? s.cart         : [],
    current_item: s.current_item || null,
  };
}

async function upsertSession(session) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000).toISOString();
  const id = session.id || `wa_sess_${crypto.randomBytes(8).toString("hex")}`;

  await query(`
    INSERT INTO wa_sessions (
      id, tenant_id, outlet_id, customer_phone, state, cart,
      customer_name, order_type, is_asap, scheduled_at,
      current_item, current_cat_id, page, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (tenant_id, customer_phone) DO UPDATE SET
      id             = EXCLUDED.id,
      outlet_id      = EXCLUDED.outlet_id,
      state          = EXCLUDED.state,
      cart           = EXCLUDED.cart,
      customer_name  = EXCLUDED.customer_name,
      order_type     = EXCLUDED.order_type,
      is_asap        = EXCLUDED.is_asap,
      scheduled_at   = EXCLUDED.scheduled_at,
      current_item   = EXCLUDED.current_item,
      current_cat_id = EXCLUDED.current_cat_id,
      page           = EXCLUDED.page,
      expires_at     = EXCLUDED.expires_at,
      updated_at     = NOW()
  `, [
    id,
    session.tenant_id,
    session.outlet_id,
    session.customer_phone,
    session.state || 'idle',
    JSON.stringify(session.cart || []),
    session.customer_name || null,
    session.order_type || 'pickup',
    session.is_asap !== false,
    session.scheduled_at || null,
    session.current_item ? JSON.stringify(session.current_item) : null,
    session.current_cat_id || null,
    session.page || 0,
    expiresAt,
  ]);

  return { ...session, id, expires_at: expiresAt };
}

async function deleteSession(tenantId, customerPhone) {
  await query(`DELETE FROM wa_sessions WHERE tenant_id = $1 AND customer_phone = $2`, [tenantId, customerPhone]);
}

// ── Customers ─────────────────────────────────────────────────────────────────

async function getOrUpsertCustomer(tenantId, phone, name) {
  const r = await query(`
    INSERT INTO wa_customers (tenant_id, phone, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (tenant_id, phone) DO UPDATE SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), wa_customers.name)
    RETURNING *
  `, [tenantId, phone, name || null]);
  return r.rows[0];
}

async function incrementCustomerStats(tenantId, phone, amount) {
  await query(`
    UPDATE wa_customers
       SET order_count   = order_count + 1,
           total_spent   = total_spent + $3,
           last_order_at = NOW()
     WHERE tenant_id = $1 AND phone = $2
  `, [tenantId, phone, Number(amount) || 0]);
}

module.exports = {
  ensureWaOrderingTables,
  getWaConfigByPhoneNumberId,
  getWaConfigByTenant,
  saveWaConfig,
  getSession,
  upsertSession,
  deleteSession,
  getOrUpsertCustomer,
  incrementCustomerStats,
};
