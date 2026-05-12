// Integration definitions — UI catalog (not API data)
// Only API-managed integrations that use this catalog belong here.
// Dedicated config cards (Zoho Books, Borzo, PhonePe, UrbanPiper) are
// rendered directly in IntegrationsPage and do NOT go through this catalog.
export const INTEGRATIONS_CATALOG = [
  // ── Messaging ─────────────────────────────────────────────
  {
    id: "twilio-whatsapp",
    name: "WhatsApp Bills",
    category: "Messaging",
    emoji: "💬",
    tagline: "Send digital bills to customers on WhatsApp instantly after payment",
    setupTime: "5 min",
    apiManaged: true,  // uses backend API via WhatsAppCard, not localStorage
    fields: [
      {
        key:         "accountSid",
        label:       "Twilio Account SID",
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        type:        "text",
        hint:        "Starts with AC — from Twilio Console homepage"
      },
      {
        key:         "authToken",
        label:       "Auth Token",
        placeholder:  "••••••••••••••••••••••••••••••••",
        type:        "password",
        hint:        "From Twilio Console homepage — keep this secret"
      },
      {
        key:         "fromNumber",
        label:       "WhatsApp Sender Number",
        placeholder: "+14155238886",
        type:        "text",
        hint:        "Twilio sandbox: +14155238886  |  Or your approved WhatsApp Business number"
      }
    ],
    helpText: "Get free credentials at twilio.com → Create account. Use Sandbox for testing, or buy a WhatsApp-enabled number to go live."
  },
];

export const CATEGORY_ORDER = ["Messaging"];

export const CATEGORY_DESCRIPTIONS = {
  "Messaging": "Send bills and updates to customers on WhatsApp",
};
