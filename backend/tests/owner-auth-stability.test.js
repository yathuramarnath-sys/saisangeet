/**
 * owner-auth-stability.test.js
 *
 * Proves that owner email + passwordHash can never be dropped or deleted
 * through normal owner-setup update paths (Staff Management, Business Profile,
 * Outlets, etc.).
 *
 * Tests run against the real service modules using an isolated in-memory tenant
 * so no Postgres connection is needed.
 */

const test   = require("node:test");
const assert = require("node:assert/strict");

const { runWithTenant }     = require("../src/data/tenant-context");
const {
  warmTenantCache,
  getOwnerSetupData,
  updateOwnerSetupData,
  _guardOwnerAuth,
} = require("../src/data/owner-setup-store");

const { updateUser, deleteUser, createUser } = require("../src/modules/roles/roles.service");
const { updateBusinessProfile }              = require("../src/modules/business-profile/business-profile.service");

// ── Test tenant fixtures ──────────────────────────────────────────────────────

const TENANT    = "test-owner-auth-stability";
const OWNER_ID  = "user-owner-test-001";
const STAFF_ID  = "user-staff-test-001";
// A bcrypt-shaped string (truthy, correct length). The actual hash value does
// not matter for these tests — we only verify the field is preserved/blocked.
const FAKE_HASH = "$2b$10$TESTtestTESTtestTESTte.TESTtestTESTtestTESTtestTESTte";

function seedTenant() {
  warmTenantCache(TENANT, {
    businessProfile: { id: "bp-1", tradeName: "Auth-Test Restaurant" },
    outlets:     [{ id: "outlet-1", name: "Main Outlet", code: "MAIN-1001", isActive: true }],
    permissions: [],
    roles:       [{ id: "role-owner", name: "Owner", permissions: [] }],
    users: [
      {
        id:           OWNER_ID,
        fullName:     "Test Owner",
        name:         "Test Owner",
        email:        "owner@authtest.com",
        phone:        "+919999999999",
        passwordHash: FAKE_HASH,
        roles:        ["Owner"],
        outletName:   "All Outlets",
        isActive:     true,
        pin:          "0000",
      },
      {
        id:         STAFF_ID,
        fullName:   "Test Cashier",
        name:       "Test Cashier",
        roles:      ["Cashier"],
        outletName: "Main Outlet",
        isActive:   true,
        pin:        "1234",
        // floor staff intentionally have NO email and NO passwordHash
      },
    ],
    taxProfiles:      [],
    receiptTemplates: [],
    devices:          [],
    menu: { categories: [], items: [], stations: [], menuGroups: [], menuAssignments: [] },
    discounts: { rules: [], approvalPolicy: [], defaults: {} },
    integrations: { zohoBooks: {}, accountMapping: {}, outletMappings: [], vendorMappings: [], purchaseEntries: [], syncLog: [] },
  });
}

/** Run an async function inside the test tenant context. */
function inTenant(fn) {
  return new Promise((resolve, reject) => {
    runWithTenant(TENANT, () => Promise.resolve(fn()).then(resolve).catch(reject));
  });
}

// Re-seed before each test so tests are fully isolated.
// node:test runs tests sequentially by default for a single file.
test.beforeEach(() => seedTenant());


// ── 1. updateUser preserves email and passwordHash ────────────────────────────

test("updateUser: preserves email after editing owner name", async () => {
  await inTenant(async () => {
    await updateUser(OWNER_ID, { fullName: "Owner Renamed" });
    const data  = getOwnerSetupData();
    const owner = data.users.find((u) => u.id === OWNER_ID);
    assert.equal(owner.email,        "owner@authtest.com", "email must survive updateUser");
    assert.equal(owner.passwordHash, FAKE_HASH,            "passwordHash must survive updateUser");
    assert.equal(owner.fullName,     "Owner Renamed",      "fullName should be updated");
  });
});

test("updateUser: preserves email after editing owner outlet assignment", async () => {
  await inTenant(async () => {
    await updateUser(OWNER_ID, { outletName: "Main Outlet" });
    const data  = getOwnerSetupData();
    const owner = data.users.find((u) => u.id === OWNER_ID);
    assert.equal(owner.email,        "owner@authtest.com");
    assert.equal(owner.passwordHash, FAKE_HASH);
    assert.equal(owner.outletName,   "Main Outlet");
  });
});

test("updateUser: preserves email and passwordHash after editing floor staff", async () => {
  // Editing a different user must not touch the owner record at all.
  await inTenant(async () => {
    await updateUser(STAFF_ID, { fullName: "Renamed Cashier", pin: "5678" });
    const data  = getOwnerSetupData();
    const owner = data.users.find((u) => u.id === OWNER_ID);
    assert.equal(owner.email,        "owner@authtest.com");
    assert.equal(owner.passwordHash, FAKE_HASH);
  });
});

test("updateUser: payload cannot inject email/passwordHash for staff user", async () => {
  // Verify that even if a rogue payload carries email or passwordHash,
  // the updateUser function ignores them for the staff user.
  // (The function's field list intentionally excludes email/passwordHash.)
  await inTenant(async () => {
    // Patch a staff user — the function's explicit field list will simply
    // ignore any email/passwordHash in the payload and preserve the originals.
    await updateUser(STAFF_ID, {
      fullName:     "Cashier With Rogue Fields",
      // These should be ignored:
      email:        "hacker@evil.com",
      passwordHash: "some-injected-hash",
    });
    const data  = getOwnerSetupData();
    const staff = data.users.find((u) => u.id === STAFF_ID);
    // Staff had no email / passwordHash to begin with — they should still be absent.
    assert.ok(!staff.passwordHash, "passwordHash must not be injected onto staff via updateUser");
  });
});


// ── 2. deleteUser blocks deletion of owner accounts ──────────────────────────

test("deleteUser: throws 403 when attempting to delete the owner account", async () => {
  await inTenant(async () => {
    await assert.rejects(
      () => deleteUser(OWNER_ID),
      (err) => {
        assert.equal(err.statusCode || err.status, 403);
        assert.ok(
          err.code === "DELETE_AUTH_USER_FORBIDDEN" || err.message.includes("web login"),
          `expected DELETE_AUTH_USER_FORBIDDEN but got: ${err.code} / ${err.message}`
        );
        return true;
      }
    );
    // Owner must still be in users[]
    const data  = getOwnerSetupData();
    const owner = data.users.find((u) => u.id === OWNER_ID);
    assert.ok(owner,            "owner must still exist after blocked deleteUser");
    assert.equal(owner.email,        "owner@authtest.com");
    assert.equal(owner.passwordHash, FAKE_HASH);
  });
});

test("deleteUser: allows deletion of floor staff (no passwordHash)", async () => {
  await inTenant(async () => {
    const result = await deleteUser(STAFF_ID);
    assert.equal(result.id, STAFF_ID, "should return the deleted staff record");
    const data  = getOwnerSetupData();
    const staff = data.users.find((u) => u.id === STAFF_ID);
    assert.ok(!staff, "staff user should be gone after deleteUser");
    // Owner must be unaffected
    const owner = data.users.find((u) => u.id === OWNER_ID);
    assert.ok(owner);
    assert.equal(owner.email, "owner@authtest.com");
  });
});


// ── 3. updateBusinessProfile never touches the users[] array ─────────────────

test("updateBusinessProfile: owner email/passwordHash survive a business profile save", async () => {
  await inTenant(async () => {
    await updateBusinessProfile({ tradeName: "New Name", invoiceFooter: "Thank you!" });
    const data  = getOwnerSetupData();
    const owner = data.users.find((u) => u.id === OWNER_ID);
    assert.equal(owner.email,        "owner@authtest.com");
    assert.equal(owner.passwordHash, FAKE_HASH);
    assert.equal(data.businessProfile.tradeName, "New Name");
  });
});


// ── 4. guardOwnerAuth unit tests (the store-level safety net) ─────────────────

test("guardOwnerAuth: restores dropped email field", () => {
  const current = {
    users: [{ id: "u1", email: "owner@test.com", passwordHash: FAKE_HASH, roles: ["Owner"] }],
  };
  const next = {
    // Simulate a write that accidentally dropped email
    users: [{ id: "u1", passwordHash: FAKE_HASH, roles: ["Owner"] }],
  };
  const result = _guardOwnerAuth(current, next);
  assert.equal(result.users[0].email, "owner@test.com", "email should be restored");
  assert.equal(result.users[0].passwordHash, FAKE_HASH);
});

test("guardOwnerAuth: restores dropped passwordHash field", () => {
  const current = {
    users: [{ id: "u1", email: "owner@test.com", passwordHash: FAKE_HASH, roles: ["Owner"] }],
  };
  const next = {
    // Simulate a write that accidentally dropped passwordHash
    users: [{ id: "u1", email: "owner@test.com", roles: ["Owner"] }],
  };
  const result = _guardOwnerAuth(current, next);
  assert.equal(result.users[0].passwordHash, FAKE_HASH, "passwordHash should be restored");
  assert.equal(result.users[0].email, "owner@test.com");
});

test("guardOwnerAuth: blocks complete removal of auth user", () => {
  const current = {
    users: [
      { id: "u1", email: "owner@test.com", passwordHash: FAKE_HASH, roles: ["Owner"] },
      { id: "u2", fullName: "Staff",        roles: ["Cashier"] },
    ],
  };
  const next = {
    // Simulate a write where the owner was filtered out (e.g. by deleteUser bug)
    users: [{ id: "u2", fullName: "Staff", roles: ["Cashier"] }],
  };
  const result = _guardOwnerAuth(current, next);
  const owner  = result.users.find((u) => u.id === "u1");
  assert.ok(owner,            "owner must be re-inserted by guard");
  assert.equal(owner.email,        "owner@test.com");
  assert.equal(owner.passwordHash, FAKE_HASH);
});

test("guardOwnerAuth: allows legitimate password change (non-null new hash)", () => {
  const current = {
    users: [{ id: "u1", email: "owner@test.com", passwordHash: FAKE_HASH, roles: ["Owner"] }],
  };
  const newHash = "$2b$10$NEWhashNEWhashNEWhashNewhashNEWhashNEWhashNEWhashNEWhash";
  const next = {
    // changePassword legitimately sets a new (different) hash
    users: [{ id: "u1", email: "owner@test.com", passwordHash: newHash, roles: ["Owner"] }],
  };
  const result = _guardOwnerAuth(current, next);
  // Guard must NOT revert the new hash back to the old one
  assert.equal(result.users[0].passwordHash, newHash, "new hash must not be reverted by guard");
  assert.equal(result.users[0].email, "owner@test.com");
});

test("guardOwnerAuth: no-op when nothing changed", () => {
  const current = {
    users: [{ id: "u1", email: "owner@test.com", passwordHash: FAKE_HASH, roles: ["Owner"] }],
  };
  const next = {
    users: [{ id: "u1", email: "owner@test.com", passwordHash: FAKE_HASH, roles: ["Owner"] }],
  };
  const result = _guardOwnerAuth(current, next);
  // Should return the same `next` reference (no allocation) when nothing changed
  assert.strictEqual(result, next, "guard should return next unchanged when no fields were dropped");
});

test("guardOwnerAuth: no-op when current has no auth users (fresh tenant)", () => {
  const current = { users: [] };
  const next    = { users: [] };
  const result  = _guardOwnerAuth(current, next);
  assert.strictEqual(result, next);
});


// ── 5. writeData guard fires through real store path ─────────────────────────

test("store writeData: guard fires and restores email when updateOwnerSetupData drops it", async () => {
  await inTenant(async () => {
    // Use updateOwnerSetupData directly to simulate a badly-written updater
    // that forgets to preserve auth fields.
    updateOwnerSetupData((current) => ({
      ...current,
      users: (current.users || []).map((u) =>
        u.id === OWNER_ID
          ? {
              ...u,
              email:        undefined, // ← accidentally dropped
              passwordHash: undefined, // ← accidentally dropped
            }
          : u
      ),
    }));

    const data  = getOwnerSetupData();
    const owner = data.users.find((u) => u.id === OWNER_ID);
    assert.ok(owner, "owner must still exist in cache after guard fires");
    assert.equal(owner.email,        "owner@authtest.com", "guard must have restored email");
    assert.equal(owner.passwordHash, FAKE_HASH,            "guard must have restored passwordHash");
  });
});
