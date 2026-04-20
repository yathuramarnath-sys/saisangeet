const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { env } = require("../../config/env");
const { ApiError } = require("../../utils/api-error");
const { findUserByIdentifier, getTenantForIdentifier } = require("./auth.repository");
const { getOwnerSetupData, updateOwnerSetupData, createTenantFile } = require("../../data/owner-setup-store");
const { createBlankTenantData } = require("../../data/blank-tenant-data");
const { registerUserInIndex } = require("../../data/users-index");
const { sendWelcomeEmail } = require("../../utils/email");

async function login({ identifier, password }) {
  if (!identifier || !password) {
    throw new ApiError(400, "AUTH_MISSING_FIELDS", "Identifier and password are required");
  }

  const user = await findUserByIdentifier(identifier);

  if (!user || user.status !== "active") {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (!user.passwordHash) {
    // Account exists but no password was ever set (e.g. seeded without hash).
    // Treat as invalid credentials — user should re-signup or reset password.
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(String(password), user.passwordHash);
  if (!passwordMatch) {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const tenantId = getTenantForIdentifier(identifier);

  const tokenPayload = {
    sub:         user.id,
    tenantId,
    outletId:    user.outletId,
    fullName:    user.fullName,
    roles:       user.roles,
    permissions: user.permissions
  };

  const token = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: "30d" });

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      outletId: user.outletId,
      roles: user.roles,
      permissions: user.permissions
    }
  };
}

// ── Is signup open? ──────────────────────────────────────────────────────────
// Signup is available only when no owner with a passwordHash exists yet.
function isSignupAvailable() {
  const data = getOwnerSetupData();
  const hasOwner = (data.users || []).some(
    (u) => (u.roles || []).includes("Owner") && u.passwordHash
  );
  return !hasOwner;
}

async function signup({ fullName, email, phone, password, businessName }) {
  if (!fullName || !email || !password || !businessName) {
    throw new ApiError(400, "SIGNUP_MISSING_FIELDS", "Full name, email, password and restaurant name are required");
  }

  if (!isSignupAvailable()) {
    throw new ApiError(403, "SIGNUP_CLOSED", "This platform already has an owner. Contact your administrator.");
  }

  // Check email not already taken
  const existing = await findUserByIdentifier(email);
  if (existing) {
    throw new ApiError(409, "SIGNUP_EMAIL_TAKEN", "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const userId = `user-owner-${Date.now()}`;

  // Write owner user + business name into the store
  updateOwnerSetupData((data) => {
    // Update business profile name
    if (businessName) {
      data.businessProfile = data.businessProfile || {};
      data.businessProfile.tradeName = businessName;
      data.businessProfile.legalName = businessName;
      if (email) data.businessProfile.email = email;
      if (phone) data.businessProfile.phone = phone;
    }

    // Replace/update the owner user entry
    const ownerIndex = (data.users || []).findIndex((u) => (u.roles || []).includes("Owner"));
    const ownerEntry = {
      id: ownerIndex >= 0 ? (data.users[ownerIndex].id || userId) : userId,
      fullName,
      name: fullName,
      email: email.toLowerCase().trim(),
      phone: phone ? phone.replace(/\s/g, "") : null,
      passwordHash,
      roles: ["Owner"],
      outletName: "All Outlets",
      isActive: true,
      pin: "0000"
    };

    if (ownerIndex >= 0) {
      data.users[ownerIndex] = ownerEntry;
    } else {
      data.users = [ownerEntry, ...(data.users || [])];
    }
    return data;
  });

  // Register email (+ phone) → "default" tenant in the global index
  // so future logins can resolve the tenant quickly
  registerUserInIndex(
    email.toLowerCase().trim(),
    phone ? phone.replace(/\s/g, "") : null,
    "default"
  );

  // Build the response token using the same shape as login
  const allPerms = (getOwnerSetupData().permissions || []).map((p) => p.code);

  const tokenPayload = {
    sub: userId,
    outletId: null,
    fullName,
    roles: ["Owner"],
    permissions: allPerms
  };

  const token = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: "30d" });

  return {
    token,
    user: {
      id: userId,
      fullName,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      outletId: null,
      roles: ["Owner"],
      permissions: allPerms
    }
  };
}

// ── Signup Interest (landing page lead capture + isolated tenant creation) ────
async function saveSignupInterest({ name, restaurant, phone, email, outlets, message }) {
  if (!name || !email) {
    throw new ApiError(400, "INTEREST_MISSING_FIELDS", "Name and email are required");
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanPhone = phone ? phone.replace(/\s/g, "") : null;

  // Generate a memorable temp password: e.g. "Dine@4827"
  const tempPassword = "Dine@" + crypto.randomInt(1000, 9999);
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const userId   = `user-owner-${Date.now()}`;
  const tenantId = `tenant-${Date.now()}`;

  // 1. Create a brand-new isolated tenant file with BLANK data
  const tenantData = createBlankTenantData({
    ownerName:      name,
    ownerEmail:     cleanEmail,
    ownerPhone:     cleanPhone,
    restaurantName: restaurant || "",
    passwordHash,
    userId
  });

  // 2. Save lead info inside the new tenant
  tenantData.signupLeads = [{
    name, restaurant, phone: cleanPhone, email: cleanEmail,
    outlets, message, submittedAt: new Date().toISOString()
  }];

  createTenantFile(tenantId, tenantData);

  // 3. Register email (+ phone) → tenantId in global index so login works
  registerUserInIndex(cleanEmail, cleanPhone, tenantId);

  // 4. Send welcome email (non-blocking)
  sendWelcomeEmail({
    to:         cleanEmail,
    name,
    restaurant: restaurant || "your restaurant",
    tempPassword
  }).catch((err) => console.error("[email] Failed to send welcome email:", err.message));

  return { ok: true };
}

/**
 * Change password for the currently authenticated user.
 */
async function changePassword({ userId, currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "CHANGE_PWD_MISSING", "Current and new password are required");
  }
  if (newPassword.length < 6) {
    throw new ApiError(400, "CHANGE_PWD_WEAK", "New password must be at least 6 characters");
  }

  // Find the user in the current tenant context
  const data = getOwnerSetupData();
  const userEntry = (data.users || []).find((u) => u.id === userId);

  if (!userEntry) {
    throw new ApiError(404, "CHANGE_PWD_NOT_FOUND", "User not found");
  }

  if (!userEntry.passwordHash) {
    throw new ApiError(400, "CHANGE_PWD_NO_PASSWORD", "No password set for this account — set a password via account setup");
  }

  const match = await bcrypt.compare(String(currentPassword), userEntry.passwordHash);
  if (!match) {
    throw new ApiError(401, "CHANGE_PWD_WRONG", "Current password is incorrect");
  }

  const newHash = await bcrypt.hash(String(newPassword), 10);
  updateOwnerSetupData((d) => {
    const idx = (d.users || []).findIndex((u) => u.id === userId);
    if (idx >= 0) d.users[idx] = { ...d.users[idx], passwordHash: newHash };
    return d;
  });

  return { ok: true };
}

/**
 * One-time owner password reset.
 * Protected by RESET_SECRET env variable — set it in Railway, call the endpoint once, done.
 * Works even when signup is "closed" (owner already exists).
 */
async function resetOwnerPassword({ secret, newPassword }) {
  const expected = process.env.RESET_SECRET;
  if (!expected || secret !== expected) {
    throw new ApiError(403, "RESET_FORBIDDEN", "Invalid reset secret");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new ApiError(400, "RESET_WEAK_PASSWORD", "New password must be at least 6 characters");
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);

  updateOwnerSetupData((data) => {
    const ownerIndex = (data.users || []).findIndex(
      (u) => (u.roles || []).includes("Owner")
    );
    if (ownerIndex >= 0) {
      data.users[ownerIndex] = { ...data.users[ownerIndex], passwordHash };
    }
    return data;
  });

  // Re-register in index so login works
  const data = getOwnerSetupData();
  const owner = (data.users || []).find((u) => (u.roles || []).includes("Owner"));
  if (owner?.email) registerUserInIndex(owner.email, owner.phone || null, "default");

  return { ok: true, message: "Owner password updated. Remove RESET_SECRET from env now." };
}

module.exports = {
  login,
  signup,
  isSignupAvailable,
  saveSignupInterest,
  changePassword,
  resetOwnerPassword
};
