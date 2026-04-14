const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
const DEMO_HEADERS = {
  "x-demo-user-name": import.meta.env.VITE_DEMO_USER_NAME || "Owner Demo",
  "x-demo-user-role": import.meta.env.VITE_DEMO_USER_ROLE || "Owner",
  "x-demo-user-permissions":
    import.meta.env.VITE_DEMO_USER_PERMISSIONS ||
    "business.manage,outlets.manage,menu.manage,roles.manage,users.manage,tax.manage,receipt_templates.manage,devices.manage,reports.view,operations.kot.send,operations.bill.request,operations.discount.approve,operations.void.approve"
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...DEMO_HEADERS,
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  patch: (path, body) =>
    request(path, {
      method: "PATCH",
      body: JSON.stringify(body)
    })
};
