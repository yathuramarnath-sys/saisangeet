/**
 * subdomain.js
 * Utilities for detecting and resolving *.dinexpos.in subdomains.
 *
 * When a restaurant owner visits tajhotel.dinexpos.in instead of app.dinexpos.in,
 * this module:
 *   1. Detects that "tajhotel" is their custom slug
 *   2. Fetches the restaurant name from the backend (for login page branding)
 *   3. Provides helpers for building URLs and editing subdomains from settings
 */

import { api } from "./api";

const BASE_DOMAIN   = "dinexpos.in";
const MAIN_SUBDOMAIN = "app";
const RESERVED_SLUGS = new Set([
  "app", "www", "api", "mail", "admin", "static", "cdn",
  "billing", "support", "help", "demo", "test", "plato", "pos",
]);

/**
 * Reads window.location.hostname and returns the custom slug if present.
 * Returns null when on localhost, app.dinexpos.in, or any non-tenant subdomain.
 *
 * @returns {string|null} e.g. "tajhotel" or null
 */
export function detectSubdomain() {
  const hostname = window.location.hostname;

  // Ignore localhost / IP addresses (development)
  if (hostname === "localhost" || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) return null;

  const parts = hostname.split(".");
  // Must be exactly subdomain.dinexpos.in (3 parts)
  if (parts.length !== 3) return null;
  if (`${parts[1]}.${parts[2]}` !== BASE_DOMAIN) return null;

  const slug = parts[0].toLowerCase();
  if (RESERVED_SLUGS.has(slug)) return null;

  return slug;
}

/**
 * Fetch restaurant info for a given slug from the backend.
 * Returns { tenantId, restaurantName } or null on failure / not found.
 */
export async function resolveSubdomain(slug) {
  if (!slug) return null;
  try {
    return await api.get(`/auth/subdomain/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

/**
 * Returns the full custom URL for a slug.
 * e.g. "tajhotel" → "https://tajhotel.dinexpos.in"
 */
export function buildSubdomainUrl(slug) {
  if (!slug) return `https://${MAIN_SUBDOMAIN}.${BASE_DOMAIN}`;
  return `https://${slug}.${BASE_DOMAIN}`;
}

/**
 * Returns true if we're running on the main app subdomain (app.dinexpos.in)
 * or on localhost. Used to show subdomain setup instructions.
 */
export function isMainApp() {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname.match(/^\d+/)) return true;
  const parts = hostname.split(".");
  return parts[0] === MAIN_SUBDOMAIN || parts.length < 3;
}
