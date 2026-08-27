/**
 * Thin wrapper around the Meta Cloud API (WhatsApp Business).
 * Handles text, interactive list, and interactive button message types.
 */

const GRAPH_VERSION = "v21.0";

async function callMeta(phoneNumberId, accessToken, body) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Meta API ${res.status}`);
  }
  return data;
}

/** Mark an incoming message as read (fire-and-forget). */
function markRead(phoneNumberId, accessToken, messageId) {
  return callMeta(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    status:    "read",
    message_id: messageId,
  }).catch(() => {});
}

/** Send a plain text message. */
function sendText(phoneNumberId, accessToken, to, text) {
  return callMeta(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: String(text), preview_url: false },
  });
}

/**
 * Send an interactive list message (menu / categories).
 *
 * sections: [{ title, rows: [{ id, title, description? }] }]
 * Max 10 rows per section, max 10 sections.
 * title ≤ 24 chars, description ≤ 72 chars, id ≤ 200 chars.
 */
function sendList(phoneNumberId, accessToken, to, { header, body, footer, button, sections }) {
  const interactive = {
    type: "list",
    body: { text: String(body).slice(0, 1024) },
    action: {
      button: String(button || "View Options").slice(0, 20),
      sections: sections.slice(0, 10).map(sec => ({
        title: String(sec.title || "").slice(0, 24),
        rows:  sec.rows.slice(0, 10).map(r => ({
          id:          String(r.id).slice(0, 200),
          title:       String(r.title).slice(0, 24),
          ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
        })),
      })),
    },
  };
  if (header) interactive.header = { type: "text", text: String(header).slice(0, 60) };
  if (footer) interactive.footer = { text: String(footer).slice(0, 60) };

  return callMeta(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

/**
 * Send an interactive button message (up to 3 quick-reply buttons).
 *
 * buttons: [{ id, title }]
 * title ≤ 20 chars.
 */
function sendButtons(phoneNumberId, accessToken, to, { header, body, footer, buttons }) {
  const interactive = {
    type: "button",
    body: { text: String(body).slice(0, 1024) },
    action: {
      buttons: buttons.slice(0, 3).map(b => ({
        type:  "reply",
        reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
      })),
    },
  };
  if (header) interactive.header = { type: "text", text: String(header).slice(0, 60) };
  if (footer) interactive.footer = { text: String(footer).slice(0, 60) };

  return callMeta(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

module.exports = { markRead, sendText, sendList, sendButtons };
