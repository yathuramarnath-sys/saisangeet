const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

function getToken() {
  return localStorage.getItem("pos_token");
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (networkErr) {
    // Network failure (backend restarting, no internet, etc.)
    // Do NOT kick the user out — throw a catchable error instead
    throw new Error("Network error — please check your connection and try again.");
  }

  if (response.status === 401) {
    // Parse the error body to distinguish session expiry from other 401s
    let errCode = "AUTH_REQUIRED";
    try {
      const body = await response.json();
      errCode = body?.error?.code || body?.code || "AUTH_REQUIRED";
    } catch (_) { /* ignore parse error */ }

    // Only clear session + redirect for actual auth failures, not permission issues
    if (errCode === "AUTH_REQUIRED" || errCode === "AUTH_INVALID_TOKEN" || errCode === "AUTH_TOKEN_EXPIRED") {
      localStorage.removeItem("pos_token");
      // Small delay so any pending state saves can complete
      setTimeout(() => { window.location.href = "/login"; }, 100);
      throw new Error("Session expired. Please sign in again.");
    }

    // Other 401s (e.g. wrong password during change-password) — just throw
    throw new Error("Authentication required.");
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      message = body?.error?.message || body?.message || message;
    } catch (_) { /* ignore parse error */ }
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  get:    (path)        => request(path),
  post:   (path, body)  => request(path, { method: "POST",   body: JSON.stringify(body) }),
  patch:  (path, body)  => request(path, { method: "PATCH",  body: JSON.stringify(body) }),
  put:    (path, body)  => request(path, { method: "PUT",    body: JSON.stringify(body) }),
  delete: (path)        => request(path, { method: "DELETE" })
};
