CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE business_status AS ENUM ('active', 'inactive');
CREATE TYPE permission_scope AS ENUM ('global', 'outlet');
CREATE TYPE security_approval_type AS ENUM ('discount', 'void_bill', 'delete_bill', 'refund', 'inventory_adjustment');
CREATE TYPE discount_type AS ENUM ('percentage', 'flat');
CREATE TYPE discount_scope AS ENUM ('order', 'item');
CREATE TYPE receipt_template_type AS ENUM ('dine_in', 'takeaway', 'delivery', 'common');
CREATE TYPE device_type AS ENUM ('pos_terminal', 'kitchen_display', 'receipt_printer', 'kitchen_printer', 'owner_mobile');
CREATE TYPE device_status AS ENUM ('pending_link', 'active', 'inactive', 'blocked');
CREATE TYPE link_token_status AS ENUM ('generated', 'used', 'expired', 'revoked');

CREATE TABLE business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(150) NOT NULL,
    trade_name VARCHAR(150),
    gstin VARCHAR(15),
    pan VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(255),
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(120),
    state VARCHAR(120),
    postal_code VARCHAR(20),
    country VARCHAR(80) NOT NULL DEFAULT 'India',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    currency_code CHAR(3) NOT NULL DEFAULT 'INR',
    logo_url TEXT,
    invoice_header TEXT,
    invoice_footer TEXT,
    status business_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    module_name VARCHAR(80) NOT NULL,
    description TEXT NOT NULL,
    scope permission_scope NOT NULL DEFAULT 'outlet',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE security_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_profile_id UUID NOT NULL UNIQUE REFERENCES business_profiles(id) ON DELETE CASCADE,
    password_min_length INTEGER NOT NULL DEFAULT 8,
    require_uppercase BOOLEAN NOT NULL DEFAULT FALSE,
    require_number BOOLEAN NOT NULL DEFAULT TRUE,
    require_special_character BOOLEAN NOT NULL DEFAULT FALSE,
    pin_length INTEGER NOT NULL DEFAULT 4,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 30,
    allow_multiple_active_sessions BOOLEAN NOT NULL DEFAULT TRUE,
    lock_after_failed_attempts INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE security_approval_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    approval_type security_approval_type NOT NULL,
    requires_manager BOOLEAN NOT NULL DEFAULT TRUE,
    requires_owner BOOLEAN NOT NULL DEFAULT FALSE,
    max_cashier_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    max_manager_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_profile_id, approval_type)
);

CREATE TABLE outlet_settings (
    outlet_id UUID PRIMARY KEY REFERENCES outlets(id) ON DELETE CASCADE,
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    opening_time TIME,
    closing_time TIME,
    enable_dine_in BOOLEAN NOT NULL DEFAULT TRUE,
    enable_takeaway BOOLEAN NOT NULL DEFAULT TRUE,
    enable_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    allow_offline_billing BOOLEAN NOT NULL DEFAULT TRUE,
    default_receipt_template_id UUID,
    default_tax_profile_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE business_tax_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    cgst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    sgst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    igst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    cess_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_profile_id, name)
);

CREATE TABLE receipt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    template_type receipt_template_type NOT NULL DEFAULT 'common',
    header_text TEXT,
    footer_text TEXT,
    show_logo BOOLEAN NOT NULL DEFAULT TRUE,
    show_qr_payment BOOLEAN NOT NULL DEFAULT TRUE,
    show_tax_breakdown BOOLEAN NOT NULL DEFAULT TRUE,
    show_customer_details BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE discount_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    discount_type discount_type NOT NULL,
    discount_scope discount_scope NOT NULL DEFAULT 'order',
    value NUMERIC(12,2) NOT NULL,
    max_amount NUMERIC(12,2),
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE device_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    device_type device_type NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    device_identifier VARCHAR(150) NOT NULL UNIQUE,
    app_version VARCHAR(50),
    platform VARCHAR(50),
    local_ip VARCHAR(64),
    assigned_receipt_template_id UUID REFERENCES receipt_templates(id) ON DELETE SET NULL,
    status device_status NOT NULL DEFAULT 'pending_link',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE device_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    device_type device_type NOT NULL DEFAULT 'pos_terminal',
    token_code VARCHAR(20) NOT NULL UNIQUE,
    qr_payload TEXT,
    status link_token_status NOT NULL DEFAULT 'generated',
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_module_name ON permissions(module_name);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX idx_business_tax_profiles_business_profile_id ON business_tax_profiles(business_profile_id);
CREATE INDEX idx_receipt_templates_business_profile_id ON receipt_templates(business_profile_id);
CREATE INDEX idx_receipt_templates_outlet_id ON receipt_templates(outlet_id);
CREATE INDEX idx_discount_rules_business_profile_id ON discount_rules(business_profile_id);
CREATE INDEX idx_discount_rules_outlet_id ON discount_rules(outlet_id);
CREATE INDEX idx_device_registry_business_profile_id ON device_registry(business_profile_id);
CREATE INDEX idx_device_registry_outlet_id ON device_registry(outlet_id);
CREATE INDEX idx_device_registry_status ON device_registry(status);
CREATE INDEX idx_device_link_tokens_business_profile_id ON device_link_tokens(business_profile_id);
CREATE INDEX idx_device_link_tokens_status ON device_link_tokens(status);

INSERT INTO permissions (code, module_name, description, scope) VALUES
    ('business.view', 'business_profile', 'View business information and master profile settings', 'global'),
    ('business.manage', 'business_profile', 'Create or update business information and legal details', 'global'),
    ('outlets.view', 'outlets', 'View outlet list and outlet settings', 'global'),
    ('outlets.manage', 'outlets', 'Create, update, activate, or deactivate outlets', 'global'),
    ('categories.manage', 'menu', 'Create and manage menu categories', 'outlet'),
    ('items.manage', 'menu', 'Create and manage menu items', 'outlet'),
    ('discounts.manage', 'discounts', 'Create and manage discount rules', 'global'),
    ('roles.manage', 'roles', 'Create roles and assign permissions', 'global'),
    ('users.manage', 'users', 'Create users and assign outlet access', 'global'),
    ('reports.view', 'reports', 'View business and outlet reports', 'outlet'),
    ('security.manage', 'security', 'Manage login and security settings', 'global'),
    ('tax.manage', 'tax', 'Manage GST and tax profiles', 'global'),
    ('receipt_templates.manage', 'receipt_templates', 'Create and manage receipt templates', 'global'),
    ('devices.manage', 'devices', 'Register, link, and disable devices', 'global')
ON CONFLICT (code) DO NOTHING;
