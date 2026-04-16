/**
 * Seed script: creates the schema + an initial Owner user.
 * Run once: node src/db/seed.js
 *
 * Default login: owner@restaurant.com / Owner@123
 */

const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/restaurant_pos"
});

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── Schema ────────────────────────────────────────────────────────────────
    const schemaFile = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaFile, "utf8");
    await client.query(schema);
    console.log("Schema applied.");

    // ── Default permissions ───────────────────────────────────────────────────
    const permissions = [
      { code: "business.manage", label: "Manage Business Profile" },
      { code: "outlets.manage", label: "Manage Outlets" },
      { code: "menu.manage", label: "Manage Menu" },
      { code: "roles.manage", label: "Manage Roles" },
      { code: "users.manage", label: "Manage Staff" },
      { code: "tax.manage", label: "Manage Taxes" },
      { code: "receipt_templates.manage", label: "Manage Receipt Templates" },
      { code: "devices.manage", label: "Manage Devices" },
      { code: "reports.view", label: "View Reports" },
      { code: "inventory.manage", label: "Manage Inventory" },
      { code: "discounts.manage", label: "Manage Discounts" },
      { code: "integrations.manage", label: "Manage Integrations" },
      { code: "operations.kot.send", label: "Send KOT" },
      { code: "operations.bill.request", label: "Request Bill" },
      { code: "operations.discount.approve", label: "Approve Discounts" },
      { code: "operations.void.approve", label: "Approve Voids" },
      { code: "operations.shift.manage", label: "Manage Shifts" }
    ];

    const permMap = {};
    for (const p of permissions) {
      const res = await client.query(
        `INSERT INTO permissions (id, code, label)
         VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label
         RETURNING id, code`,
        [p.code, p.label]
      );
      permMap[res.rows[0].code] = res.rows[0].id;
    }
    console.log(`${permissions.length} permissions seeded.`);

    // ── Owner role ────────────────────────────────────────────────────────────
    let ownerRoleId;
    const existingRole = await client.query(
      "SELECT id FROM roles WHERE name = 'Owner'"
    );

    if (existingRole.rows.length > 0) {
      ownerRoleId = existingRole.rows[0].id;
    } else {
      const roleRes = await client.query(
        `INSERT INTO roles (id, name) VALUES (gen_random_uuid(), 'Owner') RETURNING id`
      );
      ownerRoleId = roleRes.rows[0].id;
    }

    // Grant all permissions to Owner role
    for (const permId of Object.values(permMap)) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [ownerRoleId, permId]
      );
    }
    console.log("Owner role seeded with all permissions.");

    // ── Owner user ────────────────────────────────────────────────────────────
    const existing = await client.query(
      "SELECT id FROM users WHERE email = 'owner@restaurant.com'"
    );

    if (existing.rows.length === 0) {
      const passwordHash = await bcrypt.hash("Owner@123", 12);
      const userRes = await client.query(
        `INSERT INTO users (id, full_name, email, password_hash, status)
         VALUES (gen_random_uuid(), 'Restaurant Owner', 'owner@restaurant.com', $1, 'active')
         RETURNING id`,
        [passwordHash]
      );
      const userId = userRes.rows[0].id;

      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [userId, ownerRoleId]
      );

      console.log("Owner user created:");
      console.log("  Email:    owner@restaurant.com");
      console.log("  Password: Owner@123");
    } else {
      console.log("Owner user already exists, skipping.");
    }

    await client.query("COMMIT");
    console.log("Seed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
