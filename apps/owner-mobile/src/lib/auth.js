import { BASE } from "./api";

export function getToken()   { return localStorage.getItem("owner_token"); }
export function setToken(t)  { localStorage.setItem("owner_token", t); }
export function clearToken() { localStorage.removeItem("owner_token"); }
export function isLoggedIn() { return !!getToken(); }

export async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.message || "Login failed");
  }
  const data = await res.json();
  const token = data.token || data.accessToken;
  if (!token) throw new Error("No token returned");
  setToken(token);
  return data;
}

export function logout() {
  clearToken();
  window.location.reload();
}

// Decode JWT payload (no verification — just for display)
export function getTokenPayload() {
  const t = getToken();
  if (!t) return null;
  try {
    return JSON.parse(atob(t.split(".")[1]));
  } catch (_) {
    return null;
  }
}
