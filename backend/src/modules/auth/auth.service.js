const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { env } = require("../../config/env");
const { ApiError } = require("../../utils/api-error");
const { findUserByIdentifier } = require("./auth.repository");
const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { sendWelcomeEmail } = require("../../utils/email");

async function login({ identifier, password }) {
  if (!identifier || !password) {
    throw new ApiError(400, "AUTH_MISSING_FIELDS", "Identifier and password are required");
  }

  const user = await findUserByIdentifier(identifier);

  if (!user || user.status !== "active") {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(String(password), user.passwordHash);
  if (!passwordMatch) {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const tokenPayload = {
    sub: user.id,
    outletId: user.outletId,
    fullName: user.fullName,
    roles: user.roles,
    permissions: user.permissions
  };

  const token = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: "8h" });

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

  // Build the response token using the same shape as login
  const allPerms = (getOwnerSetupData().permissions || []).map((p) => p.code);

  const tokenPayload = {
    sub: userId,
    outletId: null,
    fullName,
    roles: ["Owner"],
    permissions: allPerms
  };

  const token = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: "8h" });

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

// ── Signup Interest (landing page lead capture + auto credentials) ───────────
async function saveSignupInterest({ name, restaurant, phone, email, outlets, message }) {
  if (!name || !email) {
    throw new ApiError(400, "INTEREST_MISSING_FIELDS", "Name and email are required");
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanPhone = phone ? phone.replace(/\s/g, "") : null;

  // Generate a memorable temp password: e.g. "Dine@4827"
  const tempPassword = "Dine@" + crypto.randomInt(1000, 9999);
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const userId = `user-owner-${Date.now()}`;

  // Save lead AND create a real user account so they can actually log in
  updateOwnerSetupData((data) => {
    // 1. Save lead record
    data.signupLeads = data.signupLeads || [];
    data.signupLeads.push({
      name,
      restaurant,
      phone: cleanPhone,
      email: cleanEmail,
      outlets,
      message,
      submittedAt: new Date().toISOString()
    });

    // 2. Update business profile with restaurant name
    data.businessProfile = data.businessProfile || {};
    if (restaurant) {
      data.businessProfile.tradeName = restaurant;
      data.businessProfile.legalName = restaurant;
    }
    if (cleanEmail) data.businessProfile.email = cleanEmail;
    if (cleanPhone) data.businessProfile.phone = cleanPhone;

    // 3. Create/replace the owner user entry so login works
    const ownerIndex = (data.users || []).findIndex((u) =>
      (u.roles || []).includes("Owner")
    );
    const ownerEntry = {
      id: ownerIndex >= 0 ? (data.users[ownerIndex].id || userId) : userId,
      fullName: name,
      name,
      email: cleanEmail,
      phone: cleanPhone,
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

  // Send welcome email with credentials (non-blocking)
  sendWelcomeEmail({
    to: cleanEmail,
    name,
    restaurant: restaurant || "your restaurant",
    tempPassword
  }).catch((err) => console.error("[email] Failed to send welcome email:", err.message));

  return { ok: true };
}

module.exports = {
  login,
  signup,
  isSignupAvailable,
  saveSignupInterest
};
