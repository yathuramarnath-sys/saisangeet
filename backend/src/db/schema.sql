CREATE TABLE outlets (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gstin TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE tables (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  area_name TEXT NOT NULL,
  table_number TEXT NOT NULL,
  seats INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  name TEXT NOT NULL,
  station_name TEXT NOT NULL,
  base_price NUMERIC(10, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales_inventory_items (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  sku_code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_label TEXT NOT NULL DEFAULT 'portion',
  reorder_level NUMERIC(10, 2) NOT NULL DEFAULT 0,
  par_level NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (outlet_id, sku_code)
);

CREATE TABLE sales_inventory_ledger (
  id UUID PRIMARY KEY,
  sales_inventory_item_id UUID NOT NULL REFERENCES sales_inventory_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  quantity_delta NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(10, 2) NOT NULL,
  source_type TEXT,
  source_id UUID,
  notes TEXT,
  actor_name TEXT,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kitchen_inventory_items (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category_name TEXT,
  unit_label TEXT NOT NULL,
  reorder_level NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (outlet_id, item_code)
);

CREATE TABLE kitchen_inventory_ledger (
  id UUID PRIMARY KEY,
  kitchen_inventory_item_id UUID NOT NULL REFERENCES kitchen_inventory_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  quantity_delta NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(10, 2) NOT NULL,
  source_type TEXT,
  source_id UUID,
  notes TEXT,
  actor_name TEXT,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_count_sessions (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  inventory_domain TEXT NOT NULL,
  counted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_count_lines (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
  item_ref_id UUID NOT NULL,
  expected_quantity NUMERIC(10, 2) NOT NULL,
  counted_quantity NUMERIC(10, 2) NOT NULL,
  variance_quantity NUMERIC(10, 2) NOT NULL,
  variance_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  order_number BIGINT NOT NULL UNIQUE,
  kot_number TEXT NOT NULL UNIQUE,
  service_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  captain_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  waiter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  guests INTEGER NOT NULL DEFAULT 0,
  bill_requested BOOLEAN NOT NULL DEFAULT FALSE,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_override_requested BOOLEAN NOT NULL DEFAULT FALSE,
  discount_approved_by TEXT,
  void_requested BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason TEXT,
  void_approved_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  kitchen_note TEXT,
  sent_to_kot BOOLEAN NOT NULL DEFAULT FALSE,
  station_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'captured',
  reference_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_audit_log (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action_label TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_control_log (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  control_type TEXT NOT NULL,
  reason TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_print_log (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  print_type TEXT NOT NULL DEFAULT 'reprint',
  reason TEXT,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_closing (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by TEXT,
  approved_role TEXT,
  approved_at TIMESTAMPTZ,
  reopened_by TEXT,
  reopened_role TEXT,
  reopened_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Pending review',
  UNIQUE (outlet_id, business_date)
);

CREATE TABLE cash_shifts (
  id UUID PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  cashier_name TEXT NOT NULL,
  opening_cash NUMERIC(10, 2) NOT NULL DEFAULT 0,
  expected_close NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Open',
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cash_movements (
  id UUID PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES cash_shifts(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_settings (
  code TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_runtime_state (
  scope TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Action log — structured audit trail for every POS/Captain mutation ────────
CREATE TABLE IF NOT EXISTS action_logs (
  id         TEXT         PRIMARY KEY,
  tenant_id  TEXT         NOT NULL,
  outlet_id  TEXT,
  table_id   TEXT,
  action     TEXT         NOT NULL,
  actor_name TEXT,
  device     TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_tenant_ts   ON action_logs (tenant_id,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_outlet_ts   ON action_logs (outlet_id,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_table_ts    ON action_logs (table_id,   created_at DESC);
