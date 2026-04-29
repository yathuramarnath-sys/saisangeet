const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { env } = require("../../config/env");
const { ApiError } = require("../../utils/api-error");
const { findUserByIdentifier, getTenantForIdentifier } = require("./auth.repository");
const {
  getOwnerSetupData,
  updateOwnerSetupData,
  updateOwnerSetupDataNow,
  createTenantFile,
  findUserByResetToken,
} = require("../../data/owner-setup-store");
const { createBlankTenantData } = require("../../data/blank-tenant-data");
const { registerUserInIndex } = require("../../data/users-index");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../../utils/email");
const { runWithTenant } = require("../../data/tenant-context");

async function login({ identifier, password }) {
  if (!identifier || !password) {
    throw new ApiError(400, "AUTH_MISSING_FIELDS", "Identifier and password are required");
  }

  const user = await findUserByIdentifier(identifier);

  if (!user || user.status !== "active") {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (!user.passwordHash) {
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

  const existing = await findUserByIdentifier(email);
  if (existing) {
    throw new ApiError(409, "SIGNUP_EMAIL_TAKEN", "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const userId = `user-owner-${Date.now()}`;

  // Await the DB write so the account survives a server restart immediately
  await updateOwnerSetupDataNow((data) => {
    if (businessName) {
      data.businessProfile = data.businessProfile || {};
      data.businessProfile.tradeName = businessName;
      data.businessProfile.legalName = businessName;
      if (email) data.businessProfile.email = email;
      if (phone) data.businessProfile.phone = phone;
    }

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

  registerUserInIndex(
    email.toLowerCase().trim(),
    phone ? phone.replace(/\s/g, "") : null,
    "default"
  );

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

  const tempPassword = "Dine@" + crypto.randomInt(1000, 9999);
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const userId   = `user-owner-${Date.now()}`;
  const tenantId = `tenant-${Date.now()}`;

  const tenantData = createBlankTenantData({
    ownerName:      name,
    ownerEmail:     cleanEmail,
    ownerPhone:     cleanPhone,
    restaurantName: restaurant || "",
    passwordHash,
    userId
  });

  tenantData.signupLeads = [{
    name, restaurant, phone: cleanPhone, email: cleanEmail,
    outlets, message, submittedAt: new Date().toISOString()
  }];

  createTenantFile(tenantId, tenantData);
  registerUserInIndex(cleanEmail, cleanPhone, tenantId);

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
 * Runs inside the correct tenant context (set by authenticate middleware).
 */
async function changePassword({ userId, currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "CHANGE_PWD_MISSING", "Current and new password are required");
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, "CHANGE_PWD_WEAK", "New password must be at least 8 characters.");
  }

  const data = getOwnerSetupData();
  const userEntry = (data.users || []).find((u) => u.id === userId);

  if (!userEntry) {
    throw new ApiError(404, "CHANGE_PWD_NOT_FOUND", "User not found");
  }
  if (!userEntry.passwordHash) {
    throw new ApiError(400, "CHANGE_PWD_NO_PASSWORD", "No password set for this account");
  }

  const match = await bcrypt.compare(String(currentPassword), userEntry.passwordHash);
  if (!match) {
    throw new ApiError(401, "CHANGE_PWD_WRONG", "Current password is incorrect");
  }

  const newHash = await bcrypt.hash(String(newPassword), 10);

  // Await DB write — password change must survive a restart
  await updateOwnerSetupDataNow((d) => {
    const idx = (d.users || []).findIndex((u) => u.id === userId);
    if (idx >= 0) d.users[idx] = { ...d.users[idx], passwordHash: newHash };
    return d;
  });

  return { ok: true };
}

/**
 * One-time owner password reset via RESET_SECRET env var.
 * Awaits the DB write so the change survives a server restart.
 */
async function resetOwnerPassword({ secret, newPassword }) {
  const expected = process.env.RESET_SECRET;
  if (!expected || secret !== expected) {
    throw new ApiError(403, "RESET_FORBIDDEN", "Invalid reset secret");
  }
  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, "RESET_WEAK_PASSWORD", "New password must be at least 8 characters.");
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);

  await updateOwnerSetupDataNow((data) => {
    const ownerIndex = (data.users || []).findIndex(
      (u) => (u.roles || []).includes("Owner")
    );
    if (ownerIndex >= 0) {
      data.users[ownerIndex] = { ...data.users[ownerIndex], passwordHash };
    }
    return data;
  });

  const data = getOwnerSetupData();
  const owner = (data.users || []).find((u) => (u.roles || []).includes("Owner"));
  if (owner?.email) registerUserInIndex(owner.email, owner.phone || null, "default");

  return { ok: true, message: "Owner password updated. Remove RESET_SECRET from env now." };
}

/**
 * Step 1 of forgot-password: generate a token and email a reset link.
 * Runs the DB write inside the correct tenant's context.
 */
async function forgotPassword({ email }) {
  if (!email) {
    throw new ApiError(400, "FORGOT_PWD_MISSING", "Email is required");
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = await findUserByIdentifier(cleanEmail);

  // Unknown email — silently succeed (anti-enumeration)
  if (!user) return { ok: true };

  // Resolve the correct tenant for this user
  const tenantId = getTenantForIdentifier(cleanEmail);

  const rawToken  = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  // Save token inside the correct tenant's data — awaited so it survives restart
  await new Promise((resolve, reject) => {
    runWithTenant(tenantId, async () => {
      try {
        await updateOwnerSetupDataNow((data) => {
          const idx = (data.users || []).findIndex((u) => u.id === user.id);
          if (idx >= 0) {
            data.users[idx] = {
              ...data.users[idx],
              resetToken:       rawToken,
              resetTokenExpiry: expiresAt
            };
          }
          return data;
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  const resetUrl = `${process.env.APP_URL || "https://app.dinexpos.in"}/reset-password?token=${rawToken}`;

  sendPasswordResetEmail({ to: cleanEmail, name: user.fullName, resetUrl })
    .catch((err) => console.error("[email] Failed to send reset email:", err.message));

  return { ok: true };
}

/**
 * Step 2 of forgot-password: validate the token and set a new password.
 * Searches ALL tenant caches for the token — works regardless of which tenant the user is in.
 */
async function resetPasswordByToken({ token, newPassword }) {
  if (!token || !newPassword) {
    throw new ApiError(400, "RESET_PWD_MISSING", "Token and new password are required");
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, "RESET_PWD_WEAK", "New password must be at least 8 characters.");
  }

  // Find which tenant has this token — checks in-memory cache first,
  // then falls back to Postgres (needed after server restart wipes cache).
  const found = await findUserByResetToken(token);

  if (!found) {
    throw new ApiError(400, "RESET_PWD_INVALID", "This reset link is invalid or has expired. Please request a new one.");
  }

  const { tenantId, user: userEntry } = found;
  const newHash = await bcrypt.hash(String(newPassword), 10);

  // Update password inside the correct tenant's context — awaited so it survives restart
  await new Promise((resolve, reject) => {
    runWithTenant(tenantId, async () => {
      try {
        await updateOwnerSetupDataNow((d) => {
          const idx = (d.users || []).findIndex((u) => u.id === userEntry.id);
          if (idx >= 0) {
            d.users[idx] = {
              ...d.users[idx],
              passwordHash:     newHash,
              resetToken:       null,
              resetTokenExpiry: null
            };
          }
          return d;
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  return { ok: true };
}

module.exports = {
  login,
  signup,
  isSignupAvailable,
  saveSignupInterest,
  changePassword,
  resetOwnerPassword,
  forgotPassword,
  resetPasswordByToken
};
