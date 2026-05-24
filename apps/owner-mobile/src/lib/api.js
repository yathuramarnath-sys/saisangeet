const BASE = import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1";

function getToken() {
  return localStorage.getItem("owner_token");
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("owner_token");
    window.location.reload();
    return;
  }

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const b = await res.json(); msg = b.message || b.error || msg; } catch (_) {}
    throw new Error(msg);
  }

  return res.json();
}

export const api = {
  get:    (path)         => request(path),
  post:   (path, body)   => request(path, { method: "POST",  body: JSON.stringify(body) }),
  patch:  (path, body)   => request(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path)         => request(path, { method: "DELETE" }),
};

export { BASE };
